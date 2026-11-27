"""Conversations and messages. Every function checks membership in the caller's organisation."""

import re
import time

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import aliased
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.stored_file import StoredFile
from app.models.user import User
from app.services.access import require_conversation_member, require_group_manager
from app.services.audit import record_event
from app.services.file_storage import attachment_view
from app.views.files import StoredFileView
from app.views.messaging import (
    ContactView,
    ConversationView,
    GroupMemberView,
    GroupView,
    MessageView,
    ReportableView,
    iso_utc,
)

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)")
DIRECT_NAME_FALLBACK = "Direct message"


def _conversation_name(db: Session, conversation: Conversation, viewer: User) -> str:
    if conversation.kind == "group":
        return conversation.name or "Group"
    other = db.scalar(
        select(User)
        .join(ConversationMember, ConversationMember.user_id == User.id)
        .where(ConversationMember.conversation_id == conversation.id, User.id != viewer.id)
    )
    return other.display_name if other is not None else DIRECT_NAME_FALLBACK


def list_conversations(db: Session, user: User) -> list[ConversationView]:
    conversations = db.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(
            ConversationMember.user_id == user.id,
            Conversation.organisation_id == user.organisation_id,
        )
        .order_by(Conversation.id)
    ).all()
    return [
        ConversationView(
            id=conversation.id,
            kind=conversation.kind,
            name=_conversation_name(db, conversation, user),
        )
        for conversation in conversations
    ]


def list_contacts(db: Session, user: User) -> list[ContactView]:
    contacts = db.scalars(
        select(User)
        .where(
            User.organisation_id == user.organisation_id,
            User.is_active.is_(True),
            User.id != user.id,
        )
        .order_by(User.display_name, User.id)
    ).all()
    return [
        ContactView(
            id=contact.id,
            username=contact.username,
            display_name=contact.display_name,
            role=contact.role,
            avatar_url=contact.avatar_url,
        )
        for contact in contacts
    ]


def start_direct_conversation(db: Session, user: User, contact_id: int) -> ConversationView:
    contact = db.scalar(
        select(User).where(
            User.id == contact_id,
            User.organisation_id == user.organisation_id,
            User.is_active.is_(True),
        )
    )
    if contact is None or contact.id == user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found.")

    first_member = aliased(ConversationMember)
    second_member = aliased(ConversationMember)
    existing = db.scalar(
        select(Conversation)
        .join(first_member, first_member.conversation_id == Conversation.id)
        .join(second_member, second_member.conversation_id == Conversation.id)
        .where(
            Conversation.organisation_id == user.organisation_id,
            Conversation.kind == "direct",
            first_member.user_id == user.id,
            second_member.user_id == contact.id,
        )
    )
    if existing is not None:
        return ConversationView(
            id=existing.id,
            kind="direct",
            name=_conversation_name(db, existing, user),
        )

    conversation = Conversation(
        organisation_id=user.organisation_id,
        kind="direct",
        name=None,
        created_at=int(time.time()),
    )
    db.add(conversation)
    db.flush()
    db.add_all(
        [
            ConversationMember(conversation_id=conversation.id, user_id=user.id),
            ConversationMember(conversation_id=conversation.id, user_id=contact.id),
        ]
    )
    db.commit()
    db.refresh(conversation)
    return ConversationView(
        id=conversation.id,
        kind="direct",
        name=contact.display_name,
    )


def _group_view(db: Session, group: Conversation, user: User) -> GroupView:
    members = db.scalars(
        select(User)
        .join(ConversationMember, ConversationMember.user_id == User.id)
        .where(ConversationMember.conversation_id == group.id)
        .order_by(User.display_name, User.id)
    ).all()
    return GroupView(
        id=group.id,
        name=group.name or "Group",
        members=[
            GroupMemberView(
                user_id=member.id,
                username=member.username,
                display_name=member.display_name,
                role=member.role,
            )
            for member in members
        ],
        can_manage=user.role in {"group_manager", "org_admin"},
    )


def list_groups(db: Session, user: User) -> list[GroupView]:
    groups = db.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(
            Conversation.kind == "group",
            Conversation.organisation_id == user.organisation_id,
            ConversationMember.user_id == user.id,
        )
        .order_by(Conversation.name, Conversation.id)
    ).all()
    return [_group_view(db, group, user) for group in groups]


def create_group(
    db: Session,
    user: User,
    name: str,
    member_ids: list[int],
    source_ip: str,
) -> GroupView:
    require_group_manager(user)
    requested_ids = set(member_ids)
    requested_ids.add(user.id)
    members = db.scalars(
        select(User).where(
            User.id.in_(requested_ids),
            User.organisation_id == user.organisation_id,
            User.is_active.is_(True),
        )
    ).all()
    if len(members) != len(requested_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more group members were not found.")

    group = Conversation(
        organisation_id=user.organisation_id,
        kind="group",
        name=name,
        created_at=int(time.time()),
    )
    db.add(group)
    db.flush()
    db.add_all(
        ConversationMember(conversation_id=group.id, user_id=member.id)
        for member in members
    )
    record_event(
        db,
        event_type="group_created",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details=f"Group {group.id} created with {len(members)} members.",
    )
    db.commit()
    db.refresh(group)
    return _group_view(db, group, user)


def rename_group(db: Session, user: User, group_id: int, name: str, source_ip: str) -> GroupView:
    require_group_manager(user)
    group = db.scalar(
        select(Conversation).where(
            Conversation.id == group_id,
            Conversation.kind == "group",
            Conversation.organisation_id == user.organisation_id,
        )
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    group.name = name
    record_event(
        db,
        event_type="group_renamed",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details=f"Group {group.id} renamed.",
    )
    db.commit()
    db.refresh(group)
    return _group_view(db, group, user)


def add_group_members(
    db: Session,
    user: User,
    group_id: int,
    member_ids: list[int],
    source_ip: str,
) -> GroupView:
    require_group_manager(user)
    group = db.scalar(
        select(Conversation).where(
            Conversation.id == group_id,
            Conversation.kind == "group",
            Conversation.organisation_id == user.organisation_id,
        )
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    members = db.scalars(
        select(User).where(
            User.id.in_(member_ids),
            User.organisation_id == user.organisation_id,
            User.is_active.is_(True),
        )
    ).all()
    if len(members) != len(member_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more group members were not found.")

    current_ids = set(
        db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == group.id
            )
        ).all()
    )
    new_members = [member for member in members if member.id not in current_ids]
    db.add_all(
        ConversationMember(conversation_id=group.id, user_id=member.id)
        for member in new_members
    )
    if new_members:
        record_event(
            db,
            event_type="group_members_added",
            organisation_id=user.organisation_id,
            actor_user_id=user.id,
            source_ip=source_ip,
            details=f"{len(new_members)} member(s) added to group {group.id}.",
        )
    db.commit()
    return _group_view(db, group, user)


def remove_group_member(
    db: Session,
    user: User,
    group_id: int,
    member_id: int,
    source_ip: str,
) -> GroupView:
    require_group_manager(user)
    group = db.scalar(
        select(Conversation).where(
            Conversation.id == group_id,
            Conversation.kind == "group",
            Conversation.organisation_id == user.organisation_id,
        )
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    membership = db.get(ConversationMember, (group.id, member_id))
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group member not found.")
    member_count = db.query(ConversationMember).filter_by(conversation_id=group.id).count()
    if member_count <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A group must have at least one member.")
    db.delete(membership)
    record_event(
        db,
        event_type="group_member_removed",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details=f"Member removed from group {group.id}.",
    )
    db.commit()
    return _group_view(db, group, user)


def list_messages(db: Session, user: User, conversation_id: int, limit: int) -> list[MessageView]:
    conversation = require_conversation_member(db, user, conversation_id)
    rows = db.execute(
        select(Message, User.display_name)
        .join(User, User.id == Message.sender_id)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.id.desc())
        .limit(limit)
    ).all()
    # Newest rows were fetched first; return them oldest first for display.
    messages = [message for message, _ in reversed(rows)]
    attachment_map: dict[int, list[StoredFileView]] = {}
    if messages:
        attached_files = db.scalars(
            select(StoredFile)
            .where(StoredFile.message_id.in_([message.id for message in messages]))
            .order_by(StoredFile.id)
        ).all()
        for stored_file in attached_files:
            if stored_file.message_id is not None:
                attachment_map.setdefault(stored_file.message_id, []).append(attachment_view(stored_file))
    return [
        MessageView(
            id=message.id,
            conversation_id=message.conversation_id,
            author_name=author_name,
            body=message.body,
            created_at=iso_utc(message.created_at),
            is_mine=message.sender_id == user.id,
            attachments=attachment_map.get(message.id, []),
        )
        for message, author_name in reversed(rows)
    ]


def send_message(db: Session, user: User, conversation_id: int, body: str) -> MessageView:
    conversation = require_conversation_member(db, user, conversation_id)
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        body=body,
        created_at=int(time.time()),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageView(
        id=message.id,
        conversation_id=message.conversation_id,
        author_name=user.display_name,
        body=message.body,
        created_at=iso_utc(message.created_at),
        is_mine=True,
    )


def _message_in_reach(db: Session, user: User, message_id: int) -> tuple[Message, User]:
    """Returns the message and its author when the user may see it; otherwise 404."""
    row = db.execute(
        select(Message, User)
        .join(User, User.id == Message.sender_id)
        .where(Message.id == message_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    message, author = row
    require_conversation_member(db, user, message.conversation_id)
    return message, author


def _detected_domain(body: str) -> str | None:
    match = EMAIL_PATTERN.search(body)
    return match.group(1).lower() if match is not None else None


def get_reportable(db: Session, user: User, message_id: int) -> ReportableView:
    message, author = _message_in_reach(db, user, message_id)
    conversation = db.get(Conversation, message.conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    return ReportableView(
        id=message.id,
        conversation_name=_conversation_name(db, conversation, user),
        author_name=author.display_name,
        body=message.body,
        created_at=iso_utc(message.created_at),
        detected_domain=_detected_domain(message.body),
    )


def submit_report(
    db: Session,
    user: User,
    message_id: int,
    reason: str,
    source_ip: str,
) -> None:
    message, _ = _message_in_reach(db, user, message_id)
    db.add(
        MessageReport(
            message_id=message.id,
            reporter_id=user.id,
            reason=reason,
            created_at=int(time.time()),
        )
    )
    # The audit row records the event, never the reported text.
    record_event(
        db,
        event_type="message_reported",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details=f"Message {message.id} reported.",
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reported this message.",
        ) from None
