from ipaddress import ip_address

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationMember
from app.models.user import User


def require_conversation_member(db: Session, user: User, conversation_id: int) -> Conversation:
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


def require_org_admin(user: User) -> None:
    if user.role != "org_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required.")


def require_group_manager(user: User) -> None:
    if user.role not in {"group_manager", "org_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group manager access required.")


def client_ip(request: Request) -> str:
    # The private nginx proxy overwrites X-Real-IP with the originating client address.
    forwarded_ip = request.headers.get("x-real-ip", "")
    try:
        return str(ip_address(forwarded_ip))
    except ValueError:
        return request.client.host if request.client is not None else "unknown"
