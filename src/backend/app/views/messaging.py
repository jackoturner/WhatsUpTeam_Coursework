from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

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


class MessageView(BaseModel):
    id: int
    conversation_id: int
    author_name: str
    body: str
    created_at: str
    is_mine: bool


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


class ReportList(BaseModel):
    reports: list[ReportView]


class AuditEventView(BaseModel):
    id: int
    event_type: str
    actor_username: str | None
    timestamp: str
    source_ip: str
    details: str


class AuditEventList(BaseModel):
    events: list[AuditEventView]
