from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import messaging
from app.services.access import client_ip
from app.services.auth import current_user, verify_csrf
from app.views.messaging import (
    ContactList,
    ConversationList,
    ConversationView,
    CreateGroupRequest,
    GroupList,
    GroupMembersRequest,
    GroupNameRequest,
    GroupView,
    MessageList,
    MessageView,
    ReportableView,
    ReportRequest,
    StartDirectRequest,
    SendMessageRequest,
)

router = APIRouter(tags=["messaging"])


@router.get("/contacts", response_model=ContactList)
def list_contacts(request: Request, db: Annotated[Session, Depends(get_db)]) -> ContactList:
    user = current_user(db, request)
    return ContactList(contacts=messaging.list_contacts(db, user))


@router.get("/conversations", response_model=ConversationList)
def list_conversations(request: Request, db: Annotated[Session, Depends(get_db)]) -> ConversationList:
    user = current_user(db, request)
    return ConversationList(conversations=messaging.list_conversations(db, user))


@router.post(
    "/conversations/direct",
    response_model=ConversationView,
    dependencies=[Depends(verify_csrf)],
)
def start_direct_conversation(
    payload: StartDirectRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationView:
    user = current_user(db, request)
    return messaging.start_direct_conversation(db, user, payload.contact_id)


@router.get("/groups", response_model=GroupList)
def list_groups(request: Request, db: Annotated[Session, Depends(get_db)]) -> GroupList:
    user = current_user(db, request)
    return GroupList(groups=messaging.list_groups(db, user))


@router.post(
    "/groups",
    response_model=GroupView,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def create_group(
    payload: CreateGroupRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> GroupView:
    user = current_user(db, request)
    return messaging.create_group(db, user, payload.name, payload.member_ids, client_ip(request))


@router.patch(
    "/groups/{group_id}",
    response_model=GroupView,
    dependencies=[Depends(verify_csrf)],
)
def rename_group(
    group_id: int,
    payload: GroupNameRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> GroupView:
    user = current_user(db, request)
    return messaging.rename_group(db, user, group_id, payload.name, client_ip(request))


@router.post(
    "/groups/{group_id}/members",
    response_model=GroupView,
    dependencies=[Depends(verify_csrf)],
)
def add_group_members(
    group_id: int,
    payload: GroupMembersRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> GroupView:
    user = current_user(db, request)
    return messaging.add_group_members(db, user, group_id, payload.member_ids, client_ip(request))


@router.delete(
    "/groups/{group_id}/members/{member_id}",
    response_model=GroupView,
    dependencies=[Depends(verify_csrf)],
)
def remove_group_member(
    group_id: int,
    member_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> GroupView:
    user = current_user(db, request)
    return messaging.remove_group_member(db, user, group_id, member_id, client_ip(request))


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
