# Threat Model: What's Up Teams

Status: draft for coursework review. Based on the code on branch `login_branch` (commit `823a39b`).
Method: PASTA for the process (business and technical scope, decomposition, threat analysis,
vulnerability analysis, attack modelling, risk and impact), STRIDE to enumerate threats per
component, and DREAD to rank the threats that matter most.

DREAD scores are subjective (1 = low, 10 = high) and should be agreed by the team. Average = (D + R + E + A + Dis) / 5.
Each threat is checked against the code as it stands. A threat marked "verify" has not been
reproduced; per repository rule 12, security tests must only run in an authorised, isolated environment.

---

## Stage 1 — Business objectives

- Employees chat with colleagues inside one organisation (direct and group conversations).
- Employees report messages that look wrong (for example, data leaving the company).
- An organisation administrator reviews reports and security-relevant audit events.
- Protect confidentiality of internal messages, identity of users, and the integrity of audit records.

Assets, in priority order:

| # | Asset | Why it matters |
|---|-------|----------------|
| A1 | Message bodies and conversation membership | Internal business information, possibly personal data |
| A2 | User credentials and session tokens | Account takeover gives access to A1 |
| A3 | Audit events and message reports | Evidence for investigations; must not be altered or hidden |
| A4 | Organisation boundary (tenant isolation) | Users in one organisation must never see another's data |
| A5 | Database (MySQL) and its admin console (phpMyAdmin) | Holds all of the above |

## Stage 2 — Technical scope

| Component | Technology | Location in repo |
|-----------|-----------|------------------|
| Browser SPA | React + TypeScript (Vite) | `src/frontend/src/` |
| Reverse proxy and static host | nginx (unprivileged) | `src/frontend/nginx.conf` |
| API | FastAPI + SQLAlchemy | `src/backend/app/` |
| Database | MySQL 8 | `infrastructure/database/init/*.sql` |
| DB admin | phpMyAdmin 5.2 (bound to 127.0.0.1) | `compose.yaml` |
| Deployment | Docker Compose, networks `app`, `admin`, `data` (`data` is internal) | `compose.yaml` |

Trust boundaries:

- **TB1** Browser ↔ nginx (untrusted network → app). Currently HTTP only in Compose.
- **TB2** nginx ↔ FastAPI (`app` network). FastAPI trusts `X-Real-IP` set by nginx.
- **TB3** FastAPI ↔ MySQL (`data` network, internal).
- **TB4** Operator's browser ↔ phpMyAdmin (`admin` network, 127.0.0.1 only).

## Stage 3 — Application decomposition

Data flows that matter:

1. Login: browser → `POST /api/auth/login` (CSRF, rate limited) → session cookie (`HttpOnly`, hashed token in `auth_sessions`).
2. Chat: browser → `GET/POST /api/conversations/{id}/messages` (session + membership check).
3. Report: browser → `GET /api/messages/{id}` then `POST /api/messages/{id}/reports` (session, membership, CSRF) → `message_reports` + `audit_events`.
4. Admin: browser → `GET /api/admin/reports`, `GET /api/admin/audit-events` (session + `org_admin` + same organisation).

Current screens: Chats (working), Reporting (working), Audit (working, but see T10), Login (working).
Placeholders with no behaviour yet: Contacts, Groups, Settings ("Page content will appear here."). The threats below for those screens are future work.

## Stage 4 — Threat analysis (STRIDE per component)

Legend: ✔ control present, ◐ partial, ✘ missing.

### Browser SPA

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| S | Spoofed UI (phishing login page) | None beyond HTTPS (not enforced) | ✘ |
| T | Script injection into message bodies | React escapes text; no `dangerouslySetInnerHTML` or `innerHTML` found in `src/` | ✔ |
| I | Session token readable by JavaScript | Cookie is `HttpOnly` | ✔ |
| I | Route guard only in UI | Comment in `App.tsx` says API re-checks every request; checked in controllers | ✔ |

### nginx (TB1, TB2)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| S / T / I | Eavesdropping or tampering on the network | HTTP only (`listen 8080`); no TLS in Compose | ✘ (T8) |
| I | Browser tracking or leakage of referrer | `Referrer-Policy: strict-origin-when-cross-origin` | ✔ |
| I | Clickjacking | `frame-ancestors 'none'` on `/` only | ◐ |
| T | MIME sniffing | `X-Content-Type-Options: nosniff` | ✔ |
| I | API documentation exposed | `/api/docs` and `/api/openapi.json` enabled in all builds (`main.py`) | ✘ (T5) |
| R | Client IP forged | nginx overwrites `X-Real-IP` with `$remote_addr` | ◐ (see T4) |
| D | Unbounded request rate to the API | No `limit_req` in nginx | ✘ |

### FastAPI — authentication (S, T, R, I, D, E)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| S | Password guessing / credential stuffing | 5 attempts per IP per minute, in memory (`LoginRateLimiter`) | ◐ (T4) |
| S | Account enumeration by timing | Dummy hash used when the user is unknown; same error message | ✔ |
| S | Known default passwords | `bob` / `bobadmin` with password `password` seeded by `001_auth.sql` | ✘ (T3) |
| S | Session hijacking | 256-bit random token, SHA-256 hash stored, 8 h expiry, `HttpOnly`, `SameSite=Lax` | ✔ |
| S | Session hijacking over HTTP | `SESSION_COOKIE_SECURE` defaults to `false` in `compose.yaml` | ✘ (T7) |
| T | CSRF on state-changing requests | Double-submit token on login, logout, send, report | ✔ |
| R | Denying a login or logout | Successful and failed logins are not written to `audit_events` | ✘ (T2) |
| I | Password hashes leaked | PBKDF2-SHA256, 600 000 iterations, per-user salt | ✔ |
| D | Lockout of all users by one attacker | Limiter keyed on the IP seen by the backend; if all traffic shares one IP, one attacker blocks everyone | ◐ verify (T4) |
| D | Limiter memory exhaustion | `MAX_TRACKED_CLIENTS` = 10 000, then rejects new clients | ◐ |
| E | Privilege escalation via role field | Role comes from the database, not the request | ✔ |
| E | Session survives account deactivation | `current_user` deletes the session when `is_active` is false | ✔ |

### FastAPI — messaging (S, T, R, I, D, E)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| S | Sending as another user | Author taken from the session, not the body | ✔ |
| T | Editing or deleting messages | No edit or delete endpoints | ✔ |
| I | Reading another conversation (IDOR) | `_member_conversation` checks membership and organisation; non-members get 404 | ✔ |
| I | Learning which message IDs exist | Non-members receive the same 404 as missing items | ✔ |
| I | Sensitive data sent to outsiders | Nothing blocks or flags it at send time; detection only appears in the reporting screen (`detected_domain`) | ✘ (T1) |
| D | Message flooding or report spam | No rate limit on send or report; report is unique per user per message | ◐ (T6) |
| R | Denying that a report was filed | `message_reported` written to `audit_events` in the same transaction | ✔ |
| R | Audit records altered | Application has no update or delete path for `audit_events`; MySQL user still has full rights | ◐ |

### FastAPI — admin and reporting (I, E)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| E | Non-admin reads reports | `require_org_admin` on the service layer | ✔ |
| I | Admin reads another organisation's reports | Queries filtered by `organisation_id` | ✔ |
| I | Admin sees full reported message text | Intended by design, but this is personal data; no retention or access-log policy | ◐ |
| I | Audit log search leaks data | Search tab exists in the UI; the endpoint has no search parameter, so the search filter is client-side only | ◐ (verify) |
| A | Audit page fails on a database created before `002_messaging_and_reports.sql` | Any `SQLAlchemyError` returns 503, which the screenshot shows (T10) | ✘ |

### MySQL and phpMyAdmin (T, I, R, D)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| I | Messages stored in plain text at rest | None | ✘ (T9) |
| I | phpMyAdmin used with the application account | Compose uses one `MYSQL_USER` for both app and phpMyAdmin | ◐ |
| T | Application account can change or delete audit rows | Same account for all operations | ◐ |
| D | Database locked by a long query | No query timeout or limits | ◐ |
| I | Default local passwords in `.env.example` | Documented as local only | ◐ |

### Deployment and supply chain (I, E)

| STRIDE | Threat | Control in code | Status |
|--------|--------|-----------------|--------|
| E | Container runs as root | Backend and frontend runtime use non-root users | ✔ |
| I | `SESSION_COOKIE_SECURE` off by default | `compose.yaml` default is `false` (T7) | ✘ |
| E | Development mode (`--reload`) shipped | `compose.override.yaml` only applies with `npm run dev` | ◐ |
| — | Dependency vulnerabilities | Not checked in this review | not assessed |

---

## Stage 5 — Vulnerability analysis

Findings from reading the code, not from running it:

1. **Seeded data for a data-exfiltration case.** `002_messaging_and_reports.sql` contains a message from John Davies asking for an employee list with salaries sent to a personal Gmail address. This is useful as a demo of the reporting flow, but it also means the seed data contains personal data. Mark it clearly as sample data.
2. **Login attempts are not audited.** Only `message_reported` is written to `audit_events`.
3. **Settings, Contacts and Groups have no backend.** Their threat analysis should be added when they are built.
4. **503 on the Audit page.** The global handler maps every SQL error to 503. The screenshot shows the Audit page returning this. The likely cause is that the MySQL volume was created before `002_messaging_and_reports.sql` existed, so the `message_reports` and `audit_events` tables are missing. README says init scripts run only for a new volume. Verify by checking the backend log for "Database operation failed" and the table list in phpMyAdmin (`http://localhost:8081`).

## Stage 6 — Attack modelling (attack trees, short form)

Goal G1: read messages from another organisation.
- Guess conversation IDs → blocked by membership check and organisation filter (✔).
- Steal a session → needs a valid cookie: XSS (blocked by React escaping), network sniffing over HTTP (possible when `Secure` is off, T7), or a stolen laptop (out of scope).

Goal G2: take over `bobadmin` and read audit logs.
- Brute force → rate-limited per IP, but limiter is in-process and keyed on IP (T4).
- Known default password `password` (T3) when the seed is deployed.

Goal G3: send sensitive data out of the company unnoticed.
- Post the data in chat → accepted; detection is after the fact, only if someone reports it (T1).
- Copy data through many messages → no rate limit (T6).

Goal G4: hide an insider's activity.
- Log in and out without a trace → no login audit (T2).
- Change `audit_events` directly → possible with the DB account (T9).

## Stage 7 — Risk and impact (DREAD)

| ID | Threat | D | R | E | A | Dis | Avg | Priority |
|----|--------|---|---|---|---|-----|-----|----------|
| T3 | Known default passwords (`bob`, `bobadmin` / `password`) reachable if the seed is deployed | 8 | 10 | 9 | 8 | 8 | **8.6** | Critical |
| T4 | Login rate limit keyed on a shared IP, so one attacker locks everyone out, or brute force is spread across IPs | 6 | 9 | 8 | 8 | 6 | **7.4** | High |
| T1 | Sensitive data sent by chat is not blocked or flagged in real time | 7 | 8 | 7 | 6 | 6 | **6.8** | High |
| T6 | No rate limit on sending messages or reports | 4 | 9 | 7 | 5 | 7 | **6.4** | High |
| T10 | Audit page 503 on databases created before `002` | 4 | 7 | 4 | 5 | 9 | **5.8** | Medium (fix before demo) |
| T2 | Login and logout not audited (repudiation) | 5 | 9 | 5 | 5 | 4 | **5.6** | Medium |
| T5 | API docs (`/api/docs`) exposed in runtime build | 3 | 10 | 3 | 4 | 8 | **5.6** | Low–Medium |
| T7 | Session cookie `Secure` off by default, cookie sent over HTTP | 7 | 5 | 4 | 7 | 5 | **5.6** | Medium |
| T8 | No TLS in Compose, HTTP only | 6 | 5 | 4 | 6 | 5 | **5.2** | Medium (note as deployment assumption) |
| T9 | Messages in plain text at rest; app account can alter audit rows | 6 | 4 | 3 | 6 | 4 | **4.6** | Medium |
| T11 | Admin sees full text of reported messages with no retention rule | 5 | 6 | 4 | 5 | 4 | **4.8** | Low |

## Stage 8 — Mitigation plan

Ordered by DREAD and by effort. Each item should be a separate ticket with tests (repository rule 9).

| Priority | Action | Addresses | Notes |
|----------|--------|-----------|-------|
| 1 | Make the README warning explicit, and add a startup check that refuses to run in a production-like setting while the seeded `bob` / `bobadmin` hashes exist (new setting, e.g. `APP_ENV=production`) | T3 | Do not change the existing seed without a migration plan |
| 2 | Key the rate limiter on the real client IP (check nginx `X-Real-IP` in practice) and add a per-username limit | T4 | Test the lockout with two clients |
| 3 | Add a DLP warning when a message contains an external email domain, and an admin alert on report | T1 | Use `detected_domain` logic already in `messaging.py` |
| 4 | Add per-user rate limits for send and report endpoints | T6 | Negative test: 429 after limit |
| 5 | Fix the Audit 503: document the volume reset, or add a migration script that adds the missing tables | T10 | Verify first with the backend log |
| 6 | Record `login_succeeded`, `login_failed` and `logout` in `audit_events` | T2 | Do not store passwords or full tokens |
| 7 | Set `SESSION_COOKIE_SECURE=true` by default in `compose.yaml` and enable TLS at nginx for any shared deployment | T7, T8 | Local HTTP dev stays possible with an override |
| 8 | Disable `/api/docs` and `/api/openapi.json` outside development | T5 | `docs_url=None` when not in development |
| 9 | Use a separate, least-privilege DB account for the app; no `DELETE` or `UPDATE` on `audit_events`; restrict phpMyAdmin to an admin account | T9 | Changes `compose.yaml` and init script |
| 10 | Add a retention and access note for reported messages | T11 | Document in the README |

## Assumptions and limits

- Based on code reading only; no test was run against the running stack.
- The threat model covers only the features that have a backend today.
- The rate limiter, audit events and cookie flags work as the code states; behaviour behind a real proxy or load balancer was not tested.
- Dependency and container image vulnerabilities were not assessed.

## Next steps for the team

1. Agree the DREAD scores in a short meeting and record any changes here.
2. Reproduce T10 and T4 in the local stack (authorised, isolated environment only).
3. Turn the top five mitigations into tickets.
4. Repeat the STRIDE table when Settings, Contacts and Groups get a backend.
