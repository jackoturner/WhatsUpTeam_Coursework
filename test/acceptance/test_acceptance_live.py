"""Acceptance checks that the live front end reaches the database-backed auth API."""

import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.acceptance


def test_live_auth_endpoints_are_available_and_require_authentication(page, http, live_url):
    auth_probe = http.get(f"{live_url}/api/auth/me")
    page.goto(f"{live_url}/login")

    assert auth_probe.status_code == 401, "signed-out /api/auth/me must answer 401"
    csrf_response = http.get(f"{live_url}/api/auth/csrf")
    assert csrf_response.status_code == 204
    expect(page.get_by_role("heading", name="Sign in")).to_be_visible()
