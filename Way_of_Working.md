# What's Up Teams | Way of Working — v2 (simplified)

- **Date:** 2026-11-04
- **Status:** Proposed for group adoption (this PR) — already running in the author's personal workshop since 04 Nov 2026
- **Replaces:** v1 proposal of 24 Oct 2026; the ADR folder is folded into §8

## 1. What we are marked on

| # | Artefact                                                                                                                         | Marks | Type       |
|---|----------------------------------------------------------------------------------------------------------------------------------|-------|------------|
| 1 | Scoping Document (app info, architecture, deployment evidence, recon)                                                            | 15    | Group      |
| 2 | Threat Model (STRIDE/PASTA, attack surface, risk matrix, testing plan, risk register)                                            | 35    | Group      |
| 3 | Basic Security Assessment Report (auth/session, API access, XSS, headers, TLS, OWASP Top 10, CVSS scores, evidence, remediation) | 35    | Group      |
| 4 | Reflection (personal contribution + appraisal of the group)                                                                      | 15    | Individual |

70 of the 100 marks sit on the **security analysis**, not on the app itself. The app needs to be up and running locally, and be worth attacking.

## 2. The method, simplified

Story-based pipeline adapted from killer-saas [1]. Six steps, two mechanical gates, no exceptions.

**Per story:** `Research → Design → Plan → Execute → Review → Ship`, with the two gates kept verbatim:

- No execution without a validated plan: the plan must be marked `validated: yes` before anyone writes code or runs a test.
- No ship without review: a second pair of eyes marks `Ship allowed: yes`; only a critical finding blocks the merge.

| Rule             | Detail                                                                       |
|------------------|------------------------------------------------------------------------------|
| Unit of work     | One story = one branch = one PR; squash-merge with at least one reviewer     |
| A stories        | Run in pairs — executor + reviewer; the review gate doubles as cross-checking |
| Short track      | Complexity-1 stories fuse Research + Plan; both gates stay                   |
| Evidence         | Same-day, timestamped capture, filed in the story's `evidence/` folder, never reconstructed later |

## 3. The story list

Status lifecycle: `to-plan → in-progress → in-review → shipped`. **Assessment stories start once B4 has the app deployed.**

### Build phase (B) — one story per member

| ID | Story                                                                                                 | Complexity | Feeds      | Owner | Depends | Status   |
|----|-------------------------------------------------------------------------------------------------------|------------|------------|-------|---------|----------|
| B1 | Skeleton & authentication — auth scaffold, User model, register/login/logout, session cookie          | 3          | —          | TBD   | —       | to-plan  |
| B2 | Channels & messaging — list/create channels, post/read messages, chat UI                              | 3          | —          | TBD   | B1      | to-plan  |
| B3 | Profiles & avatar upload                                                                              | 2          | —          | TBD   | B1      | to-plan  |
| B4 | Deployment — Docker, nginx, self-signed TLS, seed script, run instructions                            | 3          | Artefact 1 | TBD   | —       | to-plan  |
| B5 | Design system & docs infrastructure — tokens/components, report skeletons, IEEE reference list        | 2          | —          | TBD   | —       | to-plan  |
| B6 | PRD freeze, QA acceptance checklist, initial recon notes                                              | 2          | —          | TBD   | —       | to-plan  |

### Assessment phase (A) — 70% of the marks, run in pairs

| ID | Story                                                    | Complexity        | Feeds           | Owner                    | Depends | Status   |
|----|----------------------------------------------------------|-------------------|-----------------|--------------------------|---------|----------|
| A1 | STRIDE threat model over the architecture                | 4                 | Artefact 2      | Ambroise (cyber referent)| B4      | to-plan  |
| A2 | Authentication & session testing                         | 2                 | Artefact 3      | pair TBD                 | B4      | to-plan  |
| A3 | Unauthenticated API access testing                       | 2                 | Artefact 3      | pair TBD                 | B4      | to-plan  |
| A4 | Input validation / XSS probe                             | 2                 | Artefact 3      | pair TBD                 | B4      | to-plan  |
| A5 | HTTP security headers + SSL/TLS                          | 1 (short track)   | Artefact 3      | pair TBD                 | B4      | to-plan  |
| A6 | OWASP Top 10 sweep + risk register consolidation         | 3                 | Artefacts 2 & 3 | Ambroise + pair          | A2–A5   | to-plan  |

Evidence is filed in the story's `evidence/` folder the same day, never reconstructed later. A5 runs the short track of §2.

## 4. Repository layout (simplified 2026-11-04)

```
/                       # application code + installation (WhatsUpTeam scaffold)
  src/frontend/         # React + TypeScript UI (screens, features, services)
  src/backend/          # FastAPI API — MVC: controllers, models, views
  infrastructure/       # MySQL image + init scripts
  compose.yaml          # Docker Compose stack (frontend :3000 · backend /api · MySQL internal)
  package.json scripts/ # dependencies, run and helper scripts
  .env.example          # environment template — no secrets committed
  .agents/              # AI rules & skills for the team
  CLAUDE.md AGENTS.md   # agent instructions
Way_of_Working.md       # this file — method, story list, decision log
Weekly_W01.md …         # weekly status reports, flat at the root
README.md               # repo guide
```

One rule: **application code at the root, one flat document per topic** — no folder maze.
The supporting artefacts (merged blueprint, OWASP baseline, threat model) join the root as
single files when their stories ship; retired drafts stay in each member's workshop.

## 5. Tools & conventions

- **GitHub group repo** (`WhatsUpTeam_Coursework`, this repo) — the single source of truth for shared work; personal workshops stay separate sandboxes and never duplicate it.
- **Docker workstation** for the local instance — the brief wants deployment evidence.
- **IEEE referencing** for every citation in the artefacts.

## 6. Use of AI

Each member keeps an AI use log in their own workshop (e.g. `AI_USE.md`). Policy in one line: **AI assists planning and code; humans execute tests and capture evidence.** Commits made with AI assistance carry `Co-Authored-By`.

## 7. Timeline to 05 Jan 2027 (≈10 weeks)

| When                 | Milestone                                                                        | State    |
|----------------------|----------------------------------------------------------------------------------|----------|
| Week 1 (by 31 Oct)   | Method drafted (v1 proposal)                                                     | done     |
| Week 2 — current     | Stack adopted + OWASP baseline + restructure (this v2)                           | current  |
| Weeks 2–3            | B1–B4: app built and deployed locally (Scoping Document largely done)            | planned  |
| Weeks 4–5            | A1 STRIDE threat model complete                                                  | planned  |
| Weeks 5–8            | A2–A6 assessment stories                                                         | planned  |
| Week 9               | Consolidation: reports assembled, CVSS review, referencing                       | planned  |
| Week 10 (by 05 Jan)  | Buffer, proofread, PDFs, submit on Moodle                                        | planned  |

## 8. Decision log

Replaces the old ADR folder. Dated bullets:

- **2026-10-24** — Method proposed: killer-saas adaptation (story pipeline + two gates).
- **2026-11-04** — Team dev model adopted (React/FastAPI/MySQL) — challenged via the OWASP requirements (37 SRs + 16-scenario ethical hacking plan, proposed with this PR from the author's workshop).
- **2026-11-04** — OWASP ASVS/WSTG baseline adopted (OWASP Testing Guide v4 + baseline note, ready to import on ratification).
- **2026-11-04** — Simplified folder structure (§4 above).

## 9. Method source

[1] M. Codeur, *killer-saas DOC.md*, GitHub, 2026. [Online]. Available: https://github.com/MikeCodeur/killer-saas/blob/main/DOC.md
