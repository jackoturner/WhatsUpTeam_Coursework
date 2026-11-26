"""FE-02 (#7) — Build login screen and authenticated route handling. Mock build.

Until the chat interface exists (FE-03 #10), a successful sign-in lands on the start page.
AC5 ("authentication is verified against the real backend") lives in
test_acceptance_live.py and waits for BE-03 (#6).
"""

import re

import pytest
from playwright.sync_api import expect

from conftest import DEMO_PASSWORD, MOCK_SESSION_KEY, sign_in, sign_out

pytestmark = pytest.mark.acceptance


def test_fe02_ac1_login_form_validates_input_and_shows_api_errors(page, mock_url):
    page.goto(f"{mock_url}/login")
    expect(page.get_by_label("Username")).to_have_attribute("required", "")
    expect(page.get_by_label("Password", exact=True)).to_have_attribute("required", "")

    # Same generic message for a wrong password and an unknown user, so usernames cannot be probed.
    for username in ("alice", "nobody-here"):
        page.get_by_label("Username").fill(username)
        page.get_by_label("Password", exact=True).fill("wrong-password")
        page.get_by_role("button", name="Sign in").click()
        expect(page.get_by_label("Password", exact=True)).to_have_value("")  # attempt answered
        expect(page.get_by_role("alert")).to_have_text("Invalid username or password.")
    expect(page).to_have_url(re.compile(r"/login$"))


def test_fe02_ac1_repeated_failures_lock_the_account_with_a_clear_message(page, mock_url):
    page.goto(f"{mock_url}/login")
    password = page.get_by_label("Password", exact=True)
    for _ in range(5):
        page.get_by_label("Username").fill("bob")
        password.fill("wrong-password")
        page.get_by_role("button", name="Sign in").click()
        expect(password).to_have_value("")  # attempt answered

    # Even the right password is refused while the account is locked.
    password.fill(DEMO_PASSWORD)
    page.get_by_role("button", name="Sign in").click()

    expect(page.get_by_role("alert")).to_have_text("Too many attempts. Please wait a moment and try again.")
    expect(page).to_have_url(re.compile(r"/login$"))


def test_fe02_ac2_successful_login_enters_the_application(page, mock_url):
    sign_in(page, mock_url, "alice")

    expect(page.get_by_test_id("current-user")).to_have_text("Alice Martin")
    expect(page.get_by_role("heading", name="A simple hello.")).to_be_visible()


def test_fe02_ac3_logout_returns_to_login(page, mock_url):
    sign_in(page, mock_url, "bob")

    sign_out(page)

    expect(page.get_by_role("heading", name="Sign in")).to_be_visible()
    expect(page.get_by_test_id("current-user")).to_have_count(0)
    # The session is gone on the "server" side too: coming back stays signed out.
    page.goto(f"{mock_url}/")
    expect(page.get_by_role("link", name="Sign in")).to_be_visible()
    expect(page.get_by_test_id("current-user")).to_have_count(0)


def test_fe02_signed_in_user_is_sent_away_from_the_login_screen(page, mock_url):
    sign_in(page, mock_url, "alice")

    page.goto(f"{mock_url}/login")

    expect(page).to_have_url(f"{mock_url}/")
    expect(page.get_by_test_id("current-user")).to_have_text("Alice Martin")


def test_fe02_ac4_session_expiry_is_handled_without_broken_screens(page, mock_url):
    sign_in(page, mock_url, "alice")

    # The server forgets the session (expiry / server-side logout), then the page reloads.
    page.evaluate(f"sessionStorage.removeItem('{MOCK_SESSION_KEY}')")
    page.reload()

    expect(page.get_by_role("heading", name="A simple hello.")).to_be_visible()
    expect(page.get_by_test_id("current-user")).to_have_count(0)
    page.get_by_role("link", name="Sign in").click()
    expect(page.get_by_role("button", name="Sign in")).to_be_enabled()


def test_fe02_ac4_expired_session_notice_on_the_login_screen(page, mock_url):
    # Where a protected API call answers 401, the front sends the user here.
    page.goto(f"{mock_url}/login?expired=1")

    expect(page.get_by_text("Your session has ended. Please sign in again.")).to_be_visible()
    expect(page.get_by_role("button", name="Sign in")).to_be_enabled()
