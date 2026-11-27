from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.organisation import Organisation
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.access import require_org_admin
from app.services.audit import record_event
from app.services.auth import hash_password
from app.views.admin import CreateUserRequest, ManagedUserView, UpdateUserRequest
from app.views.auth import OrganisationView


def list_users(db: Session, admin: User) -> list[ManagedUserView]:
    require_org_admin(admin)
    users = db.scalars(
        select(User)
        .where(User.organisation_id == admin.organisation_id)
        .order_by(User.username)
    ).all()
    return [ManagedUserView.model_validate(user) for user in users]


def create_user(
    db: Session,
    admin: User,
    payload: CreateUserRequest,
    source_ip: str,
) -> ManagedUserView:
    require_org_admin(admin)
    user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        organisation_id=admin.organisation_id,
        avatar_url=None,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already in use.") from None
    record_event(
        db,
        event_type="user_created",
        organisation_id=admin.organisation_id,
        actor_user_id=admin.id,
        source_ip=source_ip,
        details=f"User {user.id} created with role {user.role}.",
    )
    db.commit()
    db.refresh(user)
    return ManagedUserView.model_validate(user)


def update_user(
    db: Session,
    admin: User,
    user_id: int,
    payload: UpdateUserRequest,
    source_ip: str,
) -> ManagedUserView:
    require_org_admin(admin)
    organisation = db.scalar(
        select(Organisation)
        .where(Organisation.id == admin.organisation_id)
        .with_for_update()
    )
    if organisation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found.")
    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.organisation_id == admin.organisation_id,
        )
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    next_role = payload.role if payload.role is not None else user.role
    next_active = payload.is_active if payload.is_active is not None else user.is_active
    is_losing_last_admin = (
        user.role == "org_admin"
        and user.is_active
        and (next_role != "org_admin" or not next_active)
    )
    if is_losing_last_admin:
        other_admin_count = db.scalar(
            select(func.count(User.id)).where(
                User.organisation_id == admin.organisation_id,
                User.role == "org_admin",
                User.is_active.is_(True),
                User.id != user.id,
            )
        )
        if other_admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The organisation must retain an active administrator.",
            )

    user.role = next_role
    user.is_active = next_active
    if not next_active:
        db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    record_event(
        db,
        event_type="user_updated",
        organisation_id=admin.organisation_id,
        actor_user_id=admin.id,
        source_ip=source_ip,
        details=f"User {user.id} role or account status updated.",
    )
    db.commit()
    db.refresh(user)
    return ManagedUserView.model_validate(user)


def update_organisation_name(
    db: Session,
    admin: User,
    name: str,
    source_ip: str,
) -> OrganisationView:
    require_org_admin(admin)
    organisation = db.get(Organisation, admin.organisation_id)
    if organisation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found.")
    organisation.name = name.strip()
    record_event(
        db,
        event_type="organisation_updated",
        organisation_id=admin.organisation_id,
        actor_user_id=admin.id,
        source_ip=source_ip,
        details="Organisation name updated.",
    )
    db.commit()
    db.refresh(organisation)
    return OrganisationView.model_validate(organisation)
