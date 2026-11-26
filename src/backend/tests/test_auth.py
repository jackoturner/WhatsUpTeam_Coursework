import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models.auth_session import AuthSession
from app.models.base import Base
from app.models.organisation import Organisation
from app.models.user import User
from app.services.auth import (
    CSRF_COOKIE,
    CSRF_HEADER,
    LOGIN_FAILURE,
    SESSION_COOKIE,
    hash_password,
    login_rate_limiter,
    verify_password,
)


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        organisation = Organisation(id=1, name="Test Organisation")
        session.add(organisation)
        session.flush()
        session.add(
            User(
                id=1,
                username="testuser",
                display_name="Test User",
                password_hash=hash_password("correct horse battery staple"),
                role="employee",
                organisation_id=organisation.id,
                avatar_url=None,
            )
        )
        session.commit()
        yield session
    engine.dispose()


@pytest.fixture
def client(database):
    def override_db():
        yield database

    login_rate_limiter.reset()
    app.dependency_overrides[get_db] = override_db
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


def csrf_headers(client: TestClient) -> dict[str, str]:
    response = client.get("/api/auth/csrf")
    assert response.status_code == 204
    token = client.cookies.get(CSRF_COOKIE)
    assert token is not None
    return {CSRF_HEADER: token}


def test_password_hash_is_adaptive_and_verifies_without_storing_plaintext():
    stored_hash = hash_password("a strong password")

    assert stored_hash.startswith("pbkdf2_sha256$600000$")
    assert stored_hash != "a strong password"
    assert verify_password("a strong password", stored_hash)
    assert not verify_password("wrong password", stored_hash)
    assert hash_password("a strong password") != stored_hash


def test_login_sets_secure_session_and_authenticated_user_is_retrievable(client, database):
    response = client.post(
        "/api/auth/login",
        json={"username": "TESTUSER", "password": "correct horse battery staple"},
        headers=csrf_headers(client),
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "username": "testuser",
        "display_name": "Test User",
        "role": "employee",
        "organisation": {"id": 1, "name": "Test Organisation"},
        "avatar_url": None,
    }
    session_cookie = response.headers["set-cookie"]
    assert "session_token=" in session_cookie
    assert "httponly" in session_cookie.lower()
    assert "secure" in session_cookie.lower()
    assert re.search(r"max-age=\d+", session_cookie, re.IGNORECASE)
    assert database.scalar(select(AuthSession)).token_hash != client.cookies[SESSION_COOKIE]

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "testuser"
    assert database.scalar(select(User)).password_hash.startswith("pbkdf2_sha256$")


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("testuser", "wrong password"),
        ("unknownuser", "wrong password"),
    ],
)
def test_invalid_credentials_have_the_same_safe_response(client, username, password):
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers=csrf_headers(client),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": LOGIN_FAILURE}


def test_unauthenticated_user_is_rejected(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_login_requires_csrf_token(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct horse battery staple"},
    )

    assert response.status_code == 403


def test_logout_revokes_database_session_and_clears_cookies(client, database):
    client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct horse battery staple"},
        headers=csrf_headers(client),
    )
    csrf_token = client.cookies.get(CSRF_COOKIE)

    response = client.post("/api/auth/logout", headers={CSRF_HEADER: csrf_token})

    assert response.status_code == 204
    assert database.scalar(select(AuthSession)) is None
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected_and_removed(client, database):
    client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct horse battery staple"},
        headers=csrf_headers(client),
    )
    session = database.scalar(select(AuthSession))
    assert session is not None
    session.expires_at = 0
    database.commit()

    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert database.scalar(select(AuthSession)) is None


def test_login_attempts_are_rate_limited(client):
    headers = csrf_headers(client)
    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"username": "unknownuser", "password": "wrong password"},
            headers=headers,
        )
        assert response.status_code == 401

    limited_response = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct horse battery staple"},
        headers=headers,
    )

    assert limited_response.status_code == 429
    assert limited_response.headers["retry-after"] == "60"
