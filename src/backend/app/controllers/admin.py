from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import reporting
from app.services.auth import current_user
from app.views.messaging import AuditEventList, ReportList

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/reports", response_model=ReportList)
def list_reports(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ReportList:
    admin = current_user(db, request)
    return reporting.list_reports(db, admin, limit)


@router.get("/audit-events", response_model=AuditEventList)
def list_audit_events(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AuditEventList:
    admin = current_user(db, request)
    return reporting.list_audit_events(db, admin, limit)
