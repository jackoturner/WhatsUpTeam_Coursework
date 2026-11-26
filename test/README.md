# WhatsUpTeam — smoke and acceptance tests

Two suites, both run **inside Docker**, so nothing needs installing on the host apart from
Docker Desktop (no Python, no Node, no browser driver):

- **smoke/**: is the stack up and wired? (nginx, SPA, `/api` proxy, FastAPI, MySQL, headers, browser boot)
- **acceptance/**: does each front issue of the group backlog behave as agreed?
  - one file per GitHub issue, one test per acceptance checkbox: `test_fe02_ac4_…` = FE-02, 4th checkbox
  - `test_fe02_login.py`: FE-02 #7 (login and authenticated route handling) on the mock build
  - `test_acceptance_live.py`: on the real stack (today's back-office)

Stack used by the tests:

- `frontend` on http://127.0.0.1:3000 (live: nginx, then FastAPI, then MySQL)
- `frontend-mock` on http://127.0.0.1:3001 (same front built with `VITE_API_MODE=mock`:
  sign-in runs in the browser, so it works before BE-03 #6 lands)
- `tests`: pytest + Playwright Chromium, on the internal Docker network

These are **functional** tests. Security assessment stays a human-executed activity.

## Run the tests

From Git Bash or WSL, at the repository root:

```bash
bash test/run-tests.sh
```

Or only one suite: `bash test/run-tests.sh smoke` or `bash test/run-tests.sh acceptance`.

From PowerShell, at the repository root (copy `.env.example` to `.env` first if needed):

```powershell
docker compose -f compose.yaml -f test/compose.test.yaml --profile test up --build --detach --wait frontend frontend-mock
docker compose -f compose.yaml -f test/compose.test.yaml --profile test run --rm --build tests
```

The first run takes several minutes, because it downloads the Playwright image (about 2 GB).
The JUnit report is written to `test/reports/junit.xml`.

If ports 3000 or 3001 are already taken, set `FRONTEND_PORT` and `MOCK_FRONTEND_PORT` before
running (for example `FRONTEND_PORT=3100 MOCK_FRONTEND_PORT=3101 bash test/run-tests.sh`).
The tests themselves use the internal Docker network, so they do not depend on these ports.

## Try the login in the mock build

After a run, the mock front stays up on **http://127.0.0.1:3001/login**.

- Users: `alice`, `bob`, `grace`, `itadmin` (Acme Legal) and `mallory` (Globex Finance)
- Password for all: `demo-password-2026`
- These accounts are fictional and exist **only** in the mock build.
- Five wrong passwords lock an account for 30 seconds, as the real back-office should.
- To reset the demo accounts, open the browser developer tools (F12), then **Application**,
  then **Local storage**, then delete `whatsup-mock-auth-v1`.

## Stop everything

```bash
npm run stop
```

Without Node on the PC, use: `docker compose -f compose.yaml -f test/compose.test.yaml --profile test down`.
Database data is kept in the `mysql_data` volume.

## Which test checks what

| Test file | Checks | Backlog |
|---|---|---|
| `smoke/test_smoke_stack.py` | healthz, index, SPA deep link, JS bundle, `/api/health`, DB greeting, baseline headers, browser boot | BE-01 #2 · FE-01 #3 |
| `smoke/test_smoke_mock.py` | mock front served, "Mock mode" badge, demo-account notice | FE-02 #7 |
| `acceptance/test_fe02_login.py` | AC1 to AC4: validation, generic error, lockout message, sign-in, sign-out, signed-in users skip the login screen, session expiry | FE-02 #7 |
| `acceptance/test_acceptance_live.py` | DB greeting on the start page; AC5 on the live stack (adapts when BE-03 lands) | FE-02 #7 · BE-01 #2 |

Run outside Docker (advanced): `pip install -r test/requirements.txt`, then
`playwright install chromium`, then `cd test && pytest`. The defaults target 127.0.0.1:3000
and 127.0.0.1:3001.
