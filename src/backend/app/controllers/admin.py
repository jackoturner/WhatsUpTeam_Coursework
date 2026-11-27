from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import administration, reporting
from app.services.access import client_ip
from app.services.auth import current_user, verify_csrf
from app.views.admin import (
    CreateUserRequest,
    ManagedUserList,
    ManagedUserView,
    OrganisationUpdateRequest,
    UpdateUserRequest,
)
from app.views.auth import OrganisationView
from app.views.messaging import AuditEventList, ReportList, ReportStatusRequest, ReportView

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/users", response_model=ManagedUserList)
def list_users(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ManagedUserList:
    admin = current_user(db, request)
    return ManagedUserList(users=administration.list_users(db, admin))


@router.post(
    "/users",
    response_model=ManagedUserView,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def create_user(
    payload: CreateUserRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ManagedUserView:
    admin = current_user(db, request)
    return administration.create_user(db, admin, payload, client_ip(request))


@router.patch(
    "/users/{user_id}",
    response_model=ManagedUserView,
    dependencies=[Depends(verify_csrf)],
)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ManagedUserView:
    admin = current_user(db, request)
    return administration.update_user(db, admin, user_id, payload, client_ip(request))


@router.patch(
    "/organisation",
    response_model=OrganisationView,
    dependencies=[Depends(verify_csrf)],
)
def update_organisation(
    payload: OrganisationUpdateRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> OrganisationView:
    admin = current_user(db, request)
    return administration.update_organisation_name(db, admin, payload.name, client_ip(request))


@router.get("/reports", response_model=ReportList)
def list_reports(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    review_status: Annotated[str | None, Query(pattern="^(open|in_review|resolved)$")] = None,
) -> ReportList:
    admin = current_user(db, request)
    return reporting.list_reports(db, admin, limit, offset, review_status)


@router.patch(
    "/reports/{report_id}",
    response_model=ReportView,
    dependencies=[Depends(verify_csrf)],
)
def update_report(
    report_id: int,
    payload: ReportStatusRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ReportView:
    admin = current_user(db, request)
    return reporting.update_report_status(
        db, admin, report_id, payload.review_status, client_ip(request)
    )


@router.get("/audit-events", response_model=AuditEventList)
def list_audit_events(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    event_type: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> AuditEventList:
    admin = current_user(db, request)
    return reporting.list_audit_events(db, admin, limit, offset, event_type)
