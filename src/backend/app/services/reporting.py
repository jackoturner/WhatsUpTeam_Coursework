"""Organisation-admin views of reports and audit events. Results never leave the admin's organisation."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.user import User
from app.services.access import require_org_admin
from app.views.messaging import (
    AuditEventList,
    AuditEventView,
    ReportList,
    ReportView,
    iso_utc,
)


def list_reports(db: Session, admin: User, limit: int) -> ReportList:
    require_org_admin(admin)
    rows = db.execute(
        select(MessageReport, Message, Conversation, User)
        .join(Message, Message.id == MessageReport.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(User, User.id == MessageReport.reporter_id)
        .where(Conversation.organisation_id == admin.organisation_id)
        .order_by(MessageReport.id.desc())
        .limit(limit)
    ).all()
    return ReportList(
        reports=[
            ReportView(
                id=report.id,
                message_id=message.id,
                conversation_name=conversation.name or "Direct message",
                reporter_username=reporter.username,
                reason=report.reason,
                message_body=message.body,
                created_at=iso_utc(report.created_at),
            )
            for report, message, conversation, reporter in rows
        ]
    )


def list_audit_events(db: Session, admin: User, limit: int) -> AuditEventList:
    require_org_admin(admin)
    rows = db.execute(
        select(AuditEvent, User.username)
        .outerjoin(User, User.id == AuditEvent.actor_user_id)
        .where(AuditEvent.organisation_id == admin.organisation_id)
        .order_by(AuditEvent.id.desc())
        .limit(limit)
    ).all()
    return AuditEventList(
        events=[
            AuditEventView(
                id=event.id,
                event_type=event.event_type,
                actor_username=username,
                timestamp=iso_utc(event.occurred_at),
                source_ip=event.source_ip,
                details=event.details,
            )
            for event, username in rows
        ]
    )
