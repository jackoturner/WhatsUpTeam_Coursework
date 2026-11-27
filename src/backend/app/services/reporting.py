"""Organisation-admin views of reports and audit events."""

import time

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.models.audit_event import AuditEvent
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.user import User
from app.services.access import require_org_admin
from app.services.audit import record_event
from app.views.messaging import (
    AuditEventList,
    AuditEventView,
    ReportList,
    ReportView,
    iso_utc,
)

Reporter = aliased(User)
Reviewer = aliased(User)


def _report_query(admin: User):
    return (
        select(MessageReport, Message, Conversation, Reporter, Reviewer.username)
        .join(Message, Message.id == MessageReport.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(Reporter, Reporter.id == MessageReport.reporter_id)
        .outerjoin(Reviewer, Reviewer.id == MessageReport.reviewed_by_user_id)
        .where(Conversation.organisation_id == admin.organisation_id)
    )


def _report_view(row) -> ReportView:
    report, message, conversation, reporter, reviewer_username = row
    return ReportView(
        id=report.id,
        message_id=message.id,
        conversation_name=conversation.name or "Direct message",
        reporter_username=reporter.username,
        reason=report.reason,
        message_body=message.body,
        created_at=iso_utc(report.created_at),
        review_status=report.review_status,
        reviewed_by_username=reviewer_username,
        reviewed_at=iso_utc(report.reviewed_at) if report.reviewed_at is not None else None,
    )


def list_reports(
    db: Session,
    admin: User,
    limit: int,
    offset: int = 0,
    review_status: str | None = None,
) -> ReportList:
    require_org_admin(admin)
    query = _report_query(admin)
    count_query = (
        select(func.count(MessageReport.id))
        .join(Message, Message.id == MessageReport.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.organisation_id == admin.organisation_id)
    )
    if review_status is not None:
        query = query.where(MessageReport.review_status == review_status)
        count_query = count_query.where(MessageReport.review_status == review_status)
    rows = db.execute(
        query.order_by(MessageReport.id.desc()).offset(offset).limit(limit)
    ).all()
    total = db.scalar(count_query) or 0
    return ReportList(
        reports=[_report_view(row) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


def list_audit_events(
    db: Session,
    admin: User,
    limit: int,
    offset: int = 0,
    event_type: str | None = None,
) -> AuditEventList:
    require_org_admin(admin)
    query = select(AuditEvent, User.username).outerjoin(
        User, User.id == AuditEvent.actor_user_id
    ).where(AuditEvent.organisation_id == admin.organisation_id)
    count_query = select(func.count(AuditEvent.id)).where(
        AuditEvent.organisation_id == admin.organisation_id
    )
    if event_type is not None:
        query = query.where(AuditEvent.event_type == event_type)
        count_query = count_query.where(AuditEvent.event_type == event_type)
    rows = db.execute(
        query.order_by(AuditEvent.id.desc()).offset(offset).limit(limit)
    ).all()
    total = db.scalar(count_query) or 0
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
        ],
        total=total,
        offset=offset,
        limit=limit,
    )


def update_report_status(
    db: Session,
    admin: User,
    report_id: int,
    review_status: str,
    source_ip: str,
) -> ReportView:
    require_org_admin(admin)
    row = db.execute(_report_query(admin).where(MessageReport.id == report_id)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    report = row[0]
    report.review_status = review_status
    report.reviewed_by_user_id = admin.id
    report.reviewed_at = int(time.time())
    record_event(
        db,
        event_type="message_report_reviewed",
        organisation_id=admin.organisation_id,
        actor_user_id=admin.id,
        source_ip=source_ip,
        details=f"Report {report.id} status changed to {review_status}.",
    )
    db.commit()
    db.refresh(report)
    updated = db.execute(_report_query(admin).where(MessageReport.id == report.id)).one()
    return _report_view(updated)
