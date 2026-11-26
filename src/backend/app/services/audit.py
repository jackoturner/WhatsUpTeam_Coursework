import time

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def record_event(
    db: Session,
    *,
    event_type: str,
    organisation_id: int,
    actor_user_id: int | None,
    source_ip: str,
    details: str,
) -> None:
    """Adds an audit row to the caller's transaction; the caller commits it with the action."""
    db.add(
        AuditEvent(
            organisation_id=organisation_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            source_ip=source_ip,
            details=details[:255],
            occurred_at=int(time.time()),
        )
    )
