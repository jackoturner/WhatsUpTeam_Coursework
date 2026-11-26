"""Acceptance tests on the LIVE stack — what the front does with today's back-office.

These tests stay valid when the BE issues land: they adapt to whether an endpoint exists.
The "against the real backend" checkbox of FE-02 is ticked only when BE-03 is merged and
these tests (plus a manual run) pass on the live stack.
"""

import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.acceptance


def test_live_start_page_shows_the_database_greeting(page, live_url):
    # BE-01 (#2) / FE-01 (#3): browser -> nginx -> FastAPI -> MySQL, still open without sign-in.
    page.goto(f"{live_url}/")

    page.get_by_role("button", name="Fetch hello").click()
    expect(page.get_by_text("hello", exact=True)).to_be_visible()


def test_live_fe02_ac5_sign_in_reports_whether_backend_auth_exists(page, http, live_url):
    # FE-02 AC5 "Authentication is verified against the real backend" — waits for BE-03 (#6).
    auth_probe = http.get(f"{live_url}/api/auth/me")
    page.goto(f"{live_url}/login")
    notice = page.get_by_text("does not provide sign-in yet")

    if auth_probe.status_code == 404:
        expect(notice).to_be_visible()  # BE-03 not merged: the user is told, not left guessing.
    else:
        assert auth_probe.status_code == 401, "signed-out /api/auth/me must answer 401"
        expect(notice).to_have_count(0)
