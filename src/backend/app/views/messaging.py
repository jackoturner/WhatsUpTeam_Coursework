from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.views.files import StoredFileView

MESSAGE_MAX_LENGTH = 500
REPORT_REASON_MAX_LENGTH = 500


def iso_utc(epoch_seconds: int) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=UTC).isoformat()


def require_non_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("Must not be blank.")
    return stripped


class ConversationView(BaseModel):
    id: int
    kind: Literal["direct", "group"]
    name: str


class ConversationList(BaseModel):
    conversations: list[ConversationView]


class ContactView(BaseModel):
    id: int
    username: str
    display_name: str
    role: Literal["employee", "group_manager", "org_admin"]
    avatar_url: str | None


class ContactList(BaseModel):
    contacts: list[ContactView]


class StartDirectRequest(BaseModel):
    contact_id: int = Field(ge=1)


class CreateGroupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    member_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return require_non_blank(value)

    @field_validator("member_ids")
    @classmethod
    def check_member_ids(cls, value: list[int]) -> list[int]:
        if any(member_id < 1 for member_id in value) or len(value) != len(set(value)):
            raise ValueError("Member ids must be unique positive integers.")
        return value


class GroupNameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return require_non_blank(value)


class GroupMembersRequest(BaseModel):
    member_ids: list[int] = Field(min_length=1, max_length=100)

    @field_validator("member_ids")
    @classmethod
    def check_member_ids(cls, value: list[int]) -> list[int]:
        if any(member_id < 1 for member_id in value) or len(value) != len(set(value)):
            raise ValueError("Member ids must be unique positive integers.")
        return value


class GroupMemberView(BaseModel):
    user_id: int
    username: str
    display_name: str
    role: Literal["employee", "group_manager", "org_admin"]


class GroupView(BaseModel):
    id: int
    name: str
    members: list[GroupMemberView]
    can_manage: bool


class GroupList(BaseModel):
    groups: list[GroupView]


class MessageView(BaseModel):
    id: int
    conversation_id: int
    author_name: str
    body: str
    created_at: str
    is_mine: bool
    attachments: list[StoredFileView] = Field(default_factory=list)


class MessageList(BaseModel):
    messages: list[MessageView]


class SendMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)

    @field_validator("body")
    @classmethod
    def check_body(cls, value: str) -> str:
        return require_non_blank(value)


class ReportableView(BaseModel):
    id: int
    conversation_name: str
    author_name: str
    body: str
    created_at: str
    detected_domain: str | None


class ReportRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=REPORT_REASON_MAX_LENGTH)

    @field_validator("reason")
    @classmethod
    def check_reason(cls, value: str) -> str:
        return require_non_blank(value)


class ReportView(BaseModel):
    id: int
    message_id: int
    conversation_name: str
    reporter_username: str
    reason: str
    message_body: str
    created_at: str
    review_status: Literal["open", "in_review", "resolved"]
    reviewed_by_username: str | None
    reviewed_at: str | None


class ReportList(BaseModel):
    reports: list[ReportView]
    total: int
    offset: int
    limit: int


class ReportStatusRequest(BaseModel):
    review_status: Literal["open", "in_review", "resolved"]


class AuditEventView(BaseModel):
    id: int
    event_type: str
    actor_username: str | None
    timestamp: str
    source_ip: str
    details: str


class AuditEventList(BaseModel):
    events: list[AuditEventView]
    total: int
    offset: int
    limit: int
