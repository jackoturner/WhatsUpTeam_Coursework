from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import messaging
from app.services.access import client_ip
from app.services.auth import current_user, verify_csrf
from app.views.messaging import (
    ConversationList,
    MessageList,
    MessageView,
    ReportableView,
    ReportRequest,
    SendMessageRequest,
)

router = APIRouter(tags=["messaging"])


@router.get("/conversations", response_model=ConversationList)
def list_conversations(request: Request, db: Annotated[Session, Depends(get_db)]) -> ConversationList:
    user = current_user(db, request)
    return ConversationList(conversations=messaging.list_conversations(db, user))


@router.get("/conversations/{conversation_id}/messages", response_model=MessageList)
def list_messages(
    conversation_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessageList:
    user = current_user(db, request)
    return MessageList(messages=messaging.list_messages(db, user, conversation_id, limit))


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageView,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def send_message(
    conversation_id: int,
    payload: SendMessageRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> MessageView:
    user = current_user(db, request)
    return messaging.send_message(db, user, conversation_id, payload.body)


@router.get("/messages/{message_id}", response_model=ReportableView)
def get_message(
    message_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ReportableView:
    user = current_user(db, request)
    return messaging.get_reportable(db, user, message_id)


@router.post(
    "/messages/{message_id}/reports",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
def report_message(
    message_id: int,
    payload: ReportRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = current_user(db, request)
    messaging.submit_report(db, user, message_id, payload.reason, client_ip(request))
