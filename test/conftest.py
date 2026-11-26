"""Shared fixtures for the WhatsUpTeam smoke and acceptance suites.

LIVE_BASE_URL: the real stack (front nginx -> FastAPI -> MySQL).
Defaults target the ports published on the host, so the suites also run outside Docker.

Acceptance tests are named after the group backlog: test_fe02_ac4_... = issue FE-02,
4th acceptance-criteria checkbox.
"""

import os

import httpx
import pytest
from playwright.sync_api import Browser, sync_playwright

LIVE_BASE_URL = os.environ.get("LIVE_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@pytest.fixture(scope="session")
def live_url() -> str:
    return LIVE_BASE_URL


@pytest.fixture(scope="session")
def http():
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        yield client


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as playwright:
        chromium = playwright.chromium.launch()
        yield chromium
        chromium.close()


@pytest.fixture
def page(browser: Browser):
    # A fresh context per test keeps browser cookies isolated.
    context = browser.new_context()
    new_page = context.new_page()
    new_page.set_default_timeout(10_000)
    yield new_page
    context.close()
