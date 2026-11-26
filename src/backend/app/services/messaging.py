"""Conversations and messages. Every function checks membership in the caller's organisation."""

import re
import time

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.user import User
from app.services.audit import record_event
from app.views.messaging import (
    ConversationView,
    MessageView,
    ReportableView,
    iso_utc,
)

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)")
DIRECT_NAME_FALLBACK = "Direct message"


def _member_conversation(db: Session, user: User, conversation_id: int) -> Conversation:
    """Returns the conversation only when the user is a member in the same organisation.

    Non-members get the same 404 as a missing conversation, so IDs cannot be probed.
    """
    conversation = db.scalar(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(
            Conversation.id == conversation_id,
            Conversation.organisation_id == user.organisation_id,
            ConversationMember.user_id == user.id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return conversation


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


def list_messages(db: Session, user: User, conversation_id: int, limit: int) -> list[MessageView]:
    conversation = _member_conversation(db, user, conversation_id)
    rows = db.execute(
        select(Message, User.display_name)
        .join(User, User.id == Message.sender_id)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.id.desc())
        .limit(limit)
    ).all()
    # Newest rows were fetched first; return them oldest first for display.
    return [
        MessageView(
            id=message.id,
            conversation_id=message.conversation_id,
            author_name=author_name,
            body=message.body,
            created_at=iso_utc(message.created_at),
            is_mine=message.sender_id == user.id,
        )
        for message, author_name in reversed(rows)
    ]


def send_message(db: Session, user: User, conversation_id: int, body: str) -> MessageView:
    conversation = _member_conversation(db, user, conversation_id)
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
    _member_conversation(db, user, message.conversation_id)
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
