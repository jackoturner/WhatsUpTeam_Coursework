# WhatsUpTeam — smoke and acceptance tests

Browser smoke and acceptance tests run **inside Docker**. Backend API tests use pytest and
an isolated SQLite database; they do not need MySQL or demo users.

- **smoke/**: stack wiring (nginx, SPA, `/api` proxy, FastAPI, MySQL, headers, browser boot)
- **acceptance/**: the login UI and live authentication API contract
- **src/backend/tests/**: password verification, login/logout, session expiry, CSRF, rate limits,
  and unauthenticated access

The browser suite uses the live front end at http://127.0.0.1:3000 and the live backend
through its `/api` proxy. There is no mock build or bundled demo account.

These are **functional** tests. Security assessment stays a human-executed activity.

## Run the tests

From Git Bash or WSL, at the repository root:

```bash
bash test/run-tests.sh
```

Or only one suite: `bash test/run-tests.sh smoke` or `bash test/run-tests.sh acceptance`.

From PowerShell, at the repository root (copy `.env.example` to `.env` first if needed):

```powershell
docker compose -f compose.yaml -f test/compose.test.yaml --profile test up --build --detach --wait frontend
docker compose -f compose.yaml -f test/compose.test.yaml --profile test run --rm --build tests
```

The first run takes several minutes, because it downloads the Playwright image (about 2 GB).
The JUnit report is written to `test/reports/junit.xml`.

If port 3000 is already taken, set `FRONTEND_PORT` before running. The tests themselves
use the internal Docker network, so they do not depend on the published port.

Run backend API tests from `src/backend`:

```powershell
python -m pytest
```

The browser suite deliberately does not include test credentials. Backend tests create
isolated test users in SQLite; no demo users or test-user SQL are added to MySQL.

## Stop everything

```bash
npm run stop
```

Without Node on the PC, use: `docker compose -f compose.yaml -f test/compose.test.yaml --profile test down`.
Database data is kept in the `mysql_data` volume.

## Which test checks what

| Test file | Checks | Backlog |
|---|---|---|
| `smoke/test_smoke_stack.py` | healthz, index, SPA deep link, JS bundle, `/api/health`, unauthenticated auth response, baseline headers, browser boot | BE-01 · FE |
| `acceptance/test_fe02_login.py` | live login form, generic invalid-credential feedback, expired-session notice | FE-02 |
| `acceptance/test_acceptance_live.py` | live auth endpoint availability and unauthenticated rejection | BE auth |

Run outside Docker (advanced): `pip install -r test/requirements.txt`, then
`playwright install chromium`, then `cd test && pytest`. The default target is 127.0.0.1:3000.
