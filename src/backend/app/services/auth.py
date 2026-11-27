import base64
import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.audit import record_event

SESSION_COOKIE = "session_token"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
SESSION_DURATION_SECONDS = 8 * 60 * 60
PASSWORD_HASH_ITERATIONS = 600_000
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
LOGIN_FAILURE = "Invalid username or password."
LOGIN_WINDOW_SECONDS = 60
LOGIN_ATTEMPT_LIMIT = 5
MAX_TRACKED_CLIENTS = 10_000
COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() in {
    "1",
    "true",
    "yes",
}


def _derive_password(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    salt_text = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    digest = _derive_password(password, salt, PASSWORD_HASH_ITERATIONS).hex()
    return f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}${salt_text}${digest}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_text, expected_digest = encoded_hash.split("$")
        iterations = int(iteration_text)
        if (
            algorithm != PASSWORD_HASH_ALGORITHM
            or iterations < 100_000
            or iterations > PASSWORD_HASH_ITERATIONS
        ):
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        actual_digest = _derive_password(password, salt, iterations).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual_digest.encode("ascii"), expected_digest.encode("utf-8"))


_DUMMY_HASH = hash_password("unusable dummy password")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )


def verify_csrf(request: Request) -> None:
    cookie_token = request.cookies.get(CSRF_COOKIE, "")
    header_token = request.headers.get(CSRF_HEADER, "")
    if not cookie_token or not header_token or not hmac.compare_digest(
        cookie_token.encode("utf-8"), header_token.encode("utf-8")
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def set_csrf_cookie(response: Response, token: str | None = None) -> str:
    csrf_token = token or secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return csrf_token


def authenticate(db: Session, username: str, password: str) -> User:
    normalized_username = username.strip().casefold()
    user = db.scalar(select(User).where(User.username == normalized_username))
    encoded_hash = user.password_hash if user is not None else _DUMMY_HASH
    password_valid = verify_password(password, encoded_hash)
    if user is None or not user.is_active or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=LOGIN_FAILURE)
    return user


def update_display_name(db: Session, user: User, display_name: str) -> User:
    user.display_name = display_name.strip()
    db.commit()
    db.refresh(user)
    return user


def change_password(
    db: Session,
    user: User,
    current_password: str,
    new_password: str,
    source_ip: str,
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect.")
    if hmac.compare_digest(current_password.encode("utf-8"), new_password.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="New password must be different from the current password.",
        )

    user.password_hash = hash_password(new_password)
    record_event(
        db,
        event_type="password_changed",
        organisation_id=user.organisation_id,
        actor_user_id=user.id,
        source_ip=source_ip,
        details="User changed their password.",
    )
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()


def create_session(db: Session, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    db.add(
        AuthSession(
            token_hash=_token_hash(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + SESSION_DURATION_SECONDS,
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DURATION_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    set_csrf_cookie(response)


def current_user(db: Session, request: Request) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _unauthenticated()

    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    if session is None:
        raise _unauthenticated()
    if session.expires_at <= int(time.time()):
        db.delete(session)
        db.commit()
        raise _unauthenticated()

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise _unauthenticated()
    return user


def revoke_session(db: Session, request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == _token_hash(token))
        )
        if session is not None:
            db.delete(session)
            db.commit()


class LoginRateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._next_cleanup = 0.0

    def allow(self, client_id: str) -> bool:
        now = time.monotonic()
        cutoff = now - LOGIN_WINDOW_SECONDS
        with self._lock:
            if now >= self._next_cleanup:
                for key, attempts in tuple(self._attempts.items()):
                    while attempts and attempts[0] <= cutoff:
                        attempts.popleft()
                    if not attempts:
                        del self._attempts[key]
                self._next_cleanup = now + LOGIN_WINDOW_SECONDS

            attempts = self._attempts.get(client_id)
            if attempts is None:
                if len(self._attempts) >= MAX_TRACKED_CLIENTS:
                    return False
                attempts = self._attempts[client_id] = deque()
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= LOGIN_ATTEMPT_LIMIT:
                return False
            attempts.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()
            self._next_cleanup = 0.0


login_rate_limiter = LoginRateLimiter()
