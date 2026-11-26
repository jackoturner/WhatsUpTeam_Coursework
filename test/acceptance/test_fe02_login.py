"""FE-02 login UI acceptance checks against the live authentication API."""

import re

import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.acceptance


def test_login_form_is_connected_to_the_live_auth_api(page, live_url):
    page.goto(f"{live_url}/login")

    expect(page.get_by_label("Username")).to_have_attribute("required", "")
    expect(page.get_by_label("Password", exact=True)).to_have_attribute("required", "")
    expect(page.get_by_text("Mock mode")).to_have_count(0)
    expect(page.get_by_text("Demo accounts:")).to_have_count(0)

    page.get_by_label("Username").fill("unknown-test-user")
    page.get_by_label("Password", exact=True).fill("incorrect-test-password")
    page.get_by_role("button", name="Sign in").click()

    expect(page.get_by_role("alert")).to_have_text("Invalid username or password.")
    expect(page.get_by_label("Password", exact=True)).to_have_value("")
    expect(page).to_have_url(re.compile(r"/login$"))


def test_expired_session_notice_is_shown_on_login(page, live_url):
    page.goto(f"{live_url}/login?expired=1")

    expect(page.get_by_text("Your session has ended. Please sign in again.")).to_be_visible()
    expect(page.get_by_role("button", name="Sign in")).to_be_enabled()
