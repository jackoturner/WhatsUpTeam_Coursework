from ipaddress import ip_address
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import (
    CSRF_COOKIE,
    COOKIE_SECURE,
    SESSION_COOKIE,
    authenticate,
    change_password,
    create_session,
    current_user,
    login_rate_limiter,
    revoke_session,
    set_csrf_cookie,
    update_display_name,
    verify_csrf,
)
from app.services.access import client_ip
from app.views.auth import LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, UserView, user_view

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.get("/csrf", status_code=status.HTTP_204_NO_CONTENT)
def get_csrf_token(response: Response) -> None:
    set_csrf_cookie(response)


@router.post("/login", response_model=UserView, dependencies=[Depends(verify_csrf)])
def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> UserView:
    # The private nginx proxy overwrites X-Real-IP with the originating client address.
    forwarded_ip = request.headers.get("x-real-ip", "")
    try:
        client_id = str(ip_address(forwarded_ip))
    except ValueError:
        client_id = request.client.host if request.client is not None else "unknown"
    if not login_rate_limiter.allow(client_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait before trying again.",
            headers={"Retry-After": "60"},
        )

    user = authenticate(db, credentials.username, credentials.password)
    create_session(db, user, response)
    return user_view(user)


@router.get("/me", response_model=UserView)
def get_me(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserView:
    return user_view(current_user(db, request))


@router.patch("/profile", response_model=UserView, dependencies=[Depends(verify_csrf)])
def update_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserView:
    user = current_user(db, request)
    return user_view(update_display_name(db, user, payload.display_name))


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
def update_password(
    payload: PasswordChangeRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = current_user(db, request)
    change_password(
        db,
        user,
        payload.current_password,
        payload.new_password,
        client_ip(request),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    revoke_session(db, request)
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(CSRF_COOKIE, path="/", secure=COOKIE_SECURE, samesite="lax")
