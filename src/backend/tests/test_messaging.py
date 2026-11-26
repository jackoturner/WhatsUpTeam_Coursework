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
    admin = _user("admin1", "org_admin", org1.id)
    other_employee = _user("other_employee", "employee", org2.id)
    other_admin = _user("other_admin", "org_admin", org2.id)
    database.add_all([employee, colleague, outsider, admin, other_employee, other_admin])
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
        assert response.status_code == 200
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
