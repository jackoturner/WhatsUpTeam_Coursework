from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.base import Base
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.organisation import Organisation
from app.models.user import User
from app.services.auth import (
    CSRF_COOKIE,
    CSRF_HEADER,
    hash_password,
    login_rate_limiter,
)
from app.services.file_storage import MAX_ATTACHMENT_BYTES

PASSWORD = "correct horse battery staple"
PASSWORD_HASH = hash_password(PASSWORD)
SECRET_BODY = "Please send the list to john@example.com"


@dataclass(frozen=True)
class World:
    conversation_id: int
    message_id: int


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _user(username: str, role: str, organisation_id: int) -> User:
    return User(
        username=username,
        display_name=username.title(),
        password_hash=PASSWORD_HASH,
        role=role,
        organisation_id=organisation_id,
        avatar_url=None,
        is_active=True,
    )


@pytest.fixture
def world(database) -> World:
    """Two organisations. Org 1 has a group chat; org 2 has its own separate chat."""
    org1 = Organisation(name="Org One")
    org2 = Organisation(name="Org Two")
    database.add_all([org1, org2])
    database.flush()

    employee = _user("employee1", "employee", org1.id)
    colleague = _user("colleague", "employee", org1.id)
    outsider = _user("outsider", "employee", org1.id)
    manager = _user("manager1", "group_manager", org1.id)
    inactive = _user("inactive", "employee", org1.id)
    inactive.is_active = False
    admin = _user("admin1", "org_admin", org1.id)
    other_employee = _user("other_employee", "employee", org2.id)
    other_admin = _user("other_admin", "org_admin", org2.id)
    database.add_all([employee, colleague, outsider, manager, inactive, admin, other_employee, other_admin])
    database.flush()

    conversation = Conversation(organisation_id=org1.id, kind="group", name="Team", created_at=0)
    other_conversation = Conversation(organisation_id=org2.id, kind="group", name="Other", created_at=0)
    database.add_all([conversation, other_conversation])
    database.flush()

    database.add_all(
        [
            ConversationMember(conversation_id=conversation.id, user_id=employee.id),
            ConversationMember(conversation_id=conversation.id, user_id=colleague.id),
            ConversationMember(conversation_id=conversation.id, user_id=admin.id),
            ConversationMember(conversation_id=other_conversation.id, user_id=other_employee.id),
            ConversationMember(conversation_id=other_conversation.id, user_id=other_admin.id),
        ]
    )
    message = Message(conversation_id=conversation.id, sender_id=employee.id, body=SECRET_BODY, created_at=0)
    database.add(message)
    database.commit()
    return World(conversation_id=conversation.id, message_id=message.id)


@pytest.fixture
def sign_in(database):
    """Returns a function that signs a new client in as the given user."""

    def override_db():
        yield database

    app.dependency_overrides[get_db] = override_db

    def _sign_in(username: str) -> TestClient:
        login_rate_limiter.reset()
        client = TestClient(app, base_url="https://testserver")
        client.get("/api/auth/csrf")
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": PASSWORD},
            headers=csrf(client),
        )
        assert response.status_code == 200, response.text
        return client

    yield _sign_in
    app.dependency_overrides.clear()


def csrf(client: TestClient) -> dict[str, str]:
    token = client.cookies.get(CSRF_COOKIE)
    assert token is not None
    return {CSRF_HEADER: token}


def test_members_list_only_conversations_in_their_organisation(sign_in, world):
    employee = sign_in("employee1")

    response = employee.get("/api/conversations")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["conversations"]] == [world.conversation_id]


def test_contacts_only_include_active_users_in_the_callers_organisation(sign_in, world):
    employee = sign_in("employee1")

    response = employee.get("/api/contacts")

    assert response.status_code == 200
    contacts = response.json()["contacts"]
    usernames = {contact["username"] for contact in contacts}
    assert "colleague" in usernames
    assert "employee1" not in usernames
    assert "inactive" not in usernames
    assert "other_employee" not in usernames


def test_active_user_can_start_or_reuse_same_organisation_direct_chat(sign_in, world, database):
    employee = sign_in("employee1")
    colleague_id = database.scalar(select(User.id).where(User.username == "colleague"))
    payload = {"contact_id": colleague_id}

    first = employee.post("/api/conversations/direct", json=payload, headers=csrf(employee))
    repeated = employee.post("/api/conversations/direct", json=payload, headers=csrf(employee))

    assert first.status_code == 200
    assert first.json()["kind"] == "direct"
    assert repeated.json()["id"] == first.json()["id"]
    assert employee.get("/api/conversations").json()["conversations"][-1]["id"] == first.json()["id"]


def test_direct_chat_rejects_self_inactive_and_cross_organisation_contacts(sign_in, world, database):
    employee = sign_in("employee1")
    inactive_id = database.scalar(select(User.id).where(User.username == "inactive"))
    other_org_id = database.scalar(select(User.id).where(User.username == "other_employee"))
    employee_id = database.scalar(select(User.id).where(User.username == "employee1"))

    for contact_id in (inactive_id, other_org_id, employee_id):
        response = employee.post(
            "/api/conversations/direct",
            json={"contact_id": contact_id},
            headers=csrf(employee),
        )
        assert response.status_code == 404


def test_starting_direct_chat_requires_csrf(sign_in, world, database):
    employee = sign_in("employee1")
    colleague_id = database.scalar(select(User.id).where(User.username == "colleague"))

    response = employee.post("/api/conversations/direct", json={"contact_id": colleague_id})

    assert response.status_code == 403


def test_only_group_managers_and_admins_can_create_or_manage_groups(sign_in, world, database):
    employee = sign_in("employee1")
    manager = sign_in("manager1")
    colleague_id = database.scalar(select(User.id).where(User.username == "colleague"))
    other_org_id = database.scalar(select(User.id).where(User.username == "other_employee"))

    denied = employee.post(
        "/api/groups",
        json={"name": "Private group", "member_ids": [colleague_id]},
        headers=csrf(employee),
    )
    assert denied.status_code == 403

    created = manager.post(
        "/api/groups",
        json={"name": "Project group", "member_ids": [colleague_id]},
        headers=csrf(manager),
    )
    assert created.status_code == 201
    group = created.json()
    assert group["name"] == "Project group"
    assert {member["username"] for member in group["members"]} == {"manager1", "colleague"}

    forbidden_rename = employee.patch(
        f"/api/groups/{group['id']}",
        json={"name": "Changed"},
        headers=csrf(employee),
    )
    assert forbidden_rename.status_code == 403

    cross_org_member = manager.post(
        f"/api/groups/{group['id']}/members",
        json={"member_ids": [other_org_id]},
        headers=csrf(manager),
    )
    assert cross_org_member.status_code == 404

    renamed = manager.patch(
        f"/api/groups/{group['id']}",
        json={"name": "Renamed group"},
        headers=csrf(manager),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed group"


def test_group_member_management_keeps_group_nonempty_and_audits_changes(sign_in, world, database):
    manager = sign_in("manager1")
    colleague = database.scalar(select(User).where(User.username == "colleague"))
    outsider = database.scalar(select(User).where(User.username == "outsider"))

    created = manager.post(
        "/api/groups",
        json={"name": "Review group", "member_ids": [colleague.id]},
        headers=csrf(manager),
    )
    group_id = created.json()["id"]

    added = manager.post(
        f"/api/groups/{group_id}/members",
        json={"member_ids": [outsider.id]},
        headers=csrf(manager),
    )
    assert added.status_code == 200
    assert {member["username"] for member in added.json()["members"]} == {
        "manager1",
        "colleague",
        "outsider",
    }

    removed = manager.delete(
        f"/api/groups/{group_id}/members/{colleague.id}",
        headers=csrf(manager),
    )
    assert removed.status_code == 200
    outsider_id = database.scalar(select(User.id).where(User.username == "outsider"))
    removed_outsider = manager.delete(
        f"/api/groups/{group_id}/members/{outsider_id}",
        headers=csrf(manager),
    )
    assert removed_outsider.status_code == 200
    manager_id = database.scalar(select(User.id).where(User.username == "manager1"))
    last_member = manager.delete(
        f"/api/groups/{group_id}/members/{manager_id}",
        headers=csrf(manager),
    )
    assert last_member.status_code == 409
    group_events = database.scalars(
        select(AuditEvent).where(AuditEvent.event_type.like("group_%"))
    ).all()
    assert {event.event_type for event in group_events} == {
        "group_created",
        "group_members_added",
        "group_member_removed",
    }


def test_admin_user_management_is_tenant_scoped_and_prevents_lockout(sign_in, world, database):
    admin = sign_in("admin1")
    employee = sign_in("employee1")
    other_admin = sign_in("other_admin")

    created = admin.post(
        "/api/admin/users",
        json={
            "username": "new.person",
            "display_name": "New Person",
            "password": "a strong initial password",
            "role": "employee",
        },
        headers=csrf(admin),
    )
    assert created.status_code == 201
    assert created.json()["username"] == "new.person"
    assert created.json()["is_active"] is True
    created_user = database.scalar(select(User).where(User.username == "new.person"))
    assert created_user is not None
    assert created_user.organisation_id == database.scalar(
        select(User.organisation_id).where(User.username == "admin1")
    )
    assert created_user.password_hash != "a strong initial password"
    assert employee.get("/api/admin/users").status_code == 403
    other_usernames = {user["username"] for user in other_admin.get("/api/admin/users").json()["users"]}
    assert "new.person" not in other_usernames

    employee_id = database.scalar(select(User.id).where(User.username == "employee1"))
    escalation = employee.patch(
        f"/api/admin/users/{employee_id}",
        json={"role": "org_admin"},
        headers=csrf(employee),
    )
    assert escalation.status_code == 403
    assert database.get(User, employee_id).role == "employee"

    admin_id = database.scalar(select(User.id).where(User.username == "admin1"))
    last_admin = admin.patch(
        f"/api/admin/users/{admin_id}",
        json={"is_active": False},
        headers=csrf(admin),
    )
    assert last_admin.status_code == 409


def test_admin_can_update_report_review_status_only_in_their_organisation(sign_in, world, database):
    colleague = sign_in("colleague")
    submitted = colleague.post(
        f"/api/messages/{world.message_id}/reports",
        json={"reason": "Potential phishing"},
        headers=csrf(colleague),
    )
    assert submitted.status_code == 204
    admin = sign_in("admin1")
    other_admin = sign_in("other_admin")
    report = admin.get("/api/admin/reports").json()["reports"][0]

    updated = admin.patch(
        f"/api/admin/reports/{report['id']}",
        json={"review_status": "in_review"},
        headers=csrf(admin),
    )
    cross_org = other_admin.patch(
        f"/api/admin/reports/{report['id']}",
        json={"review_status": "resolved"},
        headers=csrf(other_admin),
    )

    assert updated.status_code == 200
    assert updated.json()["review_status"] == "in_review"
    assert updated.json()["reviewed_by_username"] == "admin1"
    assert cross_org.status_code == 404
    review_event = database.scalar(
        select(AuditEvent).where(AuditEvent.event_type == "message_report_reviewed")
    )
    assert review_event is not None
    assert "Potential phishing" not in review_event.details


def test_report_and_audit_lists_are_tenant_scoped_and_paginated(sign_in, world):
    admin = sign_in("admin1")
    first_page = admin.get("/api/admin/audit-events?limit=1&offset=0")
    next_page = admin.get("/api/admin/audit-events?limit=1&offset=1")

    assert first_page.status_code == 200
    assert first_page.json()["limit"] == 1
    assert first_page.json()["offset"] == 0
    assert first_page.json()["total"] >= 0
    assert len(first_page.json()["events"]) <= 1
    assert len(next_page.json()["events"]) <= 1


def test_conversation_attachment_is_validated_private_and_member_scoped(sign_in, world, monkeypatch, tmp_path):
    monkeypatch.setenv("ATTACHMENT_STORAGE_PATH", str(tmp_path))
    employee = sign_in("employee1")
    colleague = sign_in("colleague")
    outsider = sign_in("outsider")
    other_org = sign_in("other_employee")
    image = b"\x89PNG\r\n\x1a\n" + b"test-image-content"

    uploaded = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments?confidential=true",
        content=image,
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "confidential.png",
        },
    )

    assert uploaded.status_code == 201
    message = uploaded.json()
    metadata = message["attachments"][0]
    assert message["body"] == "Shared an attachment: confidential.png"
    assert message["is_mine"] is True
    assert metadata["is_confidential"] is True
    assert metadata["content_type"] == "image/png"
    assert metadata["can_download"] is False
    assert metadata["download_url"] is None
    assert "storage_key" not in metadata

    listed = employee.get(f"/api/conversations/{world.conversation_id}/attachments")
    previewed = employee.get(metadata["preview_url"])
    denied_download = employee.get(
        f"/api/conversations/{world.conversation_id}/attachments/{metadata['id']}"
    )
    assert listed.status_code == 200
    assert listed.json()["files"][0]["id"] == metadata["id"]
    assert listed.json()["files"][0]["download_url"] is None
    assert previewed.status_code == 200
    assert previewed.content == image
    assert previewed.headers["x-content-type-options"] == "nosniff"
    assert previewed.headers["content-disposition"].startswith("inline;")
    assert denied_download.status_code == 403
    listed_messages = employee.get(
        f"/api/conversations/{world.conversation_id}/messages"
    ).json()["messages"]
    assert listed_messages[-1]["attachments"][0]["id"] == metadata["id"]
    assert colleague.get(metadata["preview_url"]).status_code == 200
    assert colleague.get(
        f"/api/conversations/{world.conversation_id}/attachments/{metadata['id']}"
    ).status_code == 403

    for client in (outsider, other_org):
        assert client.get(f"/api/conversations/{world.conversation_id}/attachments").status_code == 404
        assert client.get(metadata["preview_url"]).status_code == 404
        assert client.get(
            f"/api/conversations/{world.conversation_id}/attachments/{metadata['id']}"
        ).status_code == 404

    non_confidential = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments",
        content=image,
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "public.png",
        },
    )
    assert non_confidential.status_code == 201
    public_attachment = non_confidential.json()["attachments"][0]
    assert public_attachment["is_confidential"] is False
    assert public_attachment["can_download"] is True
    assert public_attachment["download_url"] is not None
    downloaded = colleague.get(public_attachment["download_url"])
    assert downloaded.status_code == 200
    assert downloaded.content == image
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert "attachment" in downloaded.headers["content-disposition"].lower()

    invalid = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments",
        content=b"<html>not a pdf</html>",
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "report.pdf",
        },
    )
    assert invalid.status_code == 415

    invalid_filename = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments",
        content=image,
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "%FF.png",
        },
    )
    assert invalid_filename.status_code == 422

    oversized = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments",
        content=b"x" * (MAX_ATTACHMENT_BYTES + 1),
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "oversized.txt",
        },
    )
    assert oversized.status_code == 413


def test_internal_resharing_preserves_confidentiality_and_requires_membership(
    sign_in,
    world,
    database,
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("ATTACHMENT_STORAGE_PATH", str(tmp_path))
    employee = sign_in("employee1")
    colleague = sign_in("colleague")
    outsider = sign_in("outsider")
    other_org = sign_in("other_employee")
    employee_id = database.scalar(select(User.id).where(User.username == "employee1"))
    colleague_id = database.scalar(select(User.id).where(User.username == "colleague"))
    organisation_id = database.scalar(
        select(User.organisation_id).where(User.username == "employee1")
    )
    target = Conversation(
        organisation_id=organisation_id,
        kind="group",
        name="Internal destination",
        created_at=1,
    )
    database.add(target)
    database.flush()
    target_id = target.id
    database.add_all(
        [
            ConversationMember(conversation_id=target_id, user_id=employee_id),
            ConversationMember(conversation_id=target_id, user_id=colleague_id),
        ]
    )
    database.commit()

    uploaded = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments?confidential=true",
        content=b"internal confidential note",
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "internal.txt",
        },
    )
    attachment_id = uploaded.json()["attachments"][0]["id"]
    shared = employee.post(
        f"/api/conversations/{world.conversation_id}/attachments/{attachment_id}/share",
        json={"target_conversation_id": target_id},
        headers=csrf(employee),
    )

    assert shared.status_code == 201
    shared_message = shared.json()
    shared_attachment = shared_message["attachments"][0]
    assert shared_message["conversation_id"] == target_id
    assert shared_attachment["is_confidential"] is True
    assert shared_attachment["can_download"] is False
    target_messages = colleague.get(
        f"/api/conversations/{target_id}/messages"
    ).json()["messages"]
    assert target_messages[-1]["attachments"][0]["id"] == shared_attachment["id"]
    assert colleague.get(shared_attachment["preview_url"]).status_code == 200
    assert colleague.get(
        f"/api/conversations/{target_id}/attachments/{shared_attachment['id']}"
    ).status_code == 403
    assert other_org.get(
        f"/api/conversations/{target_id}/messages"
    ).status_code == 404
    assert outsider.post(
        f"/api/conversations/{world.conversation_id}/attachments/{attachment_id}/share",
        json={"target_conversation_id": target_id},
        headers=csrf(outsider),
    ).status_code == 404
    assert employee.post(
        f"/api/conversations/{world.conversation_id}/attachments/{attachment_id}/share",
        json={"target_conversation_id": world.conversation_id},
        headers=csrf(employee),
    ).status_code == 422
    assert other_org.get(shared_attachment["preview_url"]).status_code == 404
    share_event = database.scalar(
        select(AuditEvent).where(AuditEvent.event_type == "attachment_reshared")
    )
    assert share_event is not None
    assert "internal.txt" not in share_event.details


def test_avatar_upload_and_reads_are_same_organisation_only(sign_in, world, database, monkeypatch, tmp_path):
    monkeypatch.setenv("ATTACHMENT_STORAGE_PATH", str(tmp_path))
    employee = sign_in("employee1")
    colleague = sign_in("colleague")
    other_org = sign_in("other_employee")
    image = b"\x89PNG\r\n\x1a\n" + b"profile-photo"

    uploaded = employee.post(
        "/api/auth/avatar",
        content=image,
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "profile.png",
        },
    )
    assert uploaded.status_code == 200
    avatar_url = uploaded.json()["avatar_url"]
    user_id = database.scalar(select(User.id).where(User.username == "employee1"))

    same_org_avatar = colleague.get(avatar_url)
    cross_org_avatar = other_org.get(avatar_url)
    assert same_org_avatar.status_code == 200
    assert same_org_avatar.content == image
    assert same_org_avatar.headers["x-content-type-options"] == "nosniff"
    assert cross_org_avatar.status_code == 404

    replaced = employee.post(
        "/api/auth/avatar",
        content=image + b"replacement",
        headers={
            **csrf(employee),
            "Content-Type": "application/octet-stream",
            "X-File-Name": "profile.png",
        },
    )
    assert replaced.status_code == 200
    assert len(list(tmp_path.iterdir())) == 1

    removed = employee.delete("/api/auth/avatar", headers=csrf(employee))
    assert removed.status_code == 204
    assert database.get(User, user_id).avatar_url is None


def test_non_members_get_not_found_for_conversation_messages(sign_in, world):
    same_org_outsider = sign_in("outsider")
    other_org_user = sign_in("other_employee")

    for client in (same_org_outsider, other_org_user):
        url = f"/api/conversations/{world.conversation_id}/messages"
        assert client.get(url).status_code == 404
        assert client.post(url, json={"body": "hello"}, headers=csrf(client)).status_code == 404


def test_member_sends_and_reads_messages(sign_in, world):
    employee = sign_in("employee1")
    url = f"/api/conversations/{world.conversation_id}/messages"

    sent = employee.post(url, json={"body": "  Hello team  "}, headers=csrf(employee))

    assert sent.status_code == 201
    assert sent.json()["body"] == "Hello team"
    assert sent.json()["is_mine"] is True
    listed = employee.get(url).json()["messages"]
    assert listed[-1]["body"] == "Hello team"
    assert listed[-1]["is_mine"] is True


def test_sending_requires_csrf_token_and_a_non_blank_body(sign_in, world):
    employee = sign_in("employee1")
    url = f"/api/conversations/{world.conversation_id}/messages"

    assert employee.post(url, json={"body": "hello"}).status_code == 403
    assert employee.post(url, json={"body": "   "}, headers=csrf(employee)).status_code == 422
    assert employee.post(url, json={"body": "x" * 501}, headers=csrf(employee)).status_code == 422


def test_member_reads_reportable_message_with_detected_domain(sign_in, world):
    colleague = sign_in("colleague")

    response = colleague.get(f"/api/messages/{world.message_id}")

    assert response.status_code == 200
    assert response.json()["body"] == SECRET_BODY
    assert response.json()["detected_domain"] == "example.com"


def test_non_members_cannot_read_or_report_a_message(sign_in, world):
    for client in (sign_in("outsider"), sign_in("other_employee")):
        assert client.get(f"/api/messages/{world.message_id}").status_code == 404
        response = client.post(
            f"/api/messages/{world.message_id}/reports",
            json={"reason": "Policy violation"},
            headers=csrf(client),
        )
        assert response.status_code == 404


def test_report_is_stored_and_audited_without_the_message_text(sign_in, world, database):
    colleague = sign_in("colleague")
    url = f"/api/messages/{world.message_id}/reports"

    first = colleague.post(url, json={"reason": "Possible phishing"}, headers=csrf(colleague))
    duplicate = colleague.post(url, json={"reason": "Possible phishing"}, headers=csrf(colleague))

    assert first.status_code == 204
    assert duplicate.status_code == 409
    event = database.scalar(select(AuditEvent).where(AuditEvent.event_type == "message_reported"))
    assert event is not None
    assert event.details == f"Message {world.message_id} reported."
    assert "example.com" not in event.details


def test_only_org_admins_can_list_reports_and_audit_events(sign_in, world):
    employee = sign_in("employee1")

    assert employee.get("/api/admin/reports").status_code == 403
    assert employee.get("/api/admin/audit-events").status_code == 403


def test_unauthenticated_requests_are_rejected(sign_in, world):
    # sign_in only installs the test database override; this client never logs in.
    client = TestClient(app, base_url="https://testserver")

    assert client.get("/api/conversations").status_code == 401
    assert client.get("/api/admin/reports").status_code == 401


def test_admin_sees_reports_and_audit_events_for_their_organisation_only(sign_in, world):
    colleague = sign_in("colleague")
    colleague.post(
        f"/api/messages/{world.message_id}/reports",
        json={"reason": "Sensitive data request"},
        headers=csrf(colleague),
    )
    admin = sign_in("admin1")
    other_admin = sign_in("other_admin")

    reports = admin.get("/api/admin/reports").json()["reports"]
    events = admin.get("/api/admin/audit-events").json()["events"]

    assert len(reports) == 1
    assert reports[0]["reporter_username"] == "colleague"
    assert reports[0]["message_body"] == SECRET_BODY
    assert events[0]["event_type"] == "message_reported"
    assert events[0]["actor_username"] == "colleague"
    assert other_admin.get("/api/admin/reports").json()["reports"] == []
    assert other_admin.get("/api/admin/audit-events").json()["events"] == []
