# Gate checklist and QA log

Run this at the end of every phase. A phase isn't done until every box is ticked. "The Agent said it's done" is not a tick.

## 1. Tests on a fresh start
- [ ] The Agent pasted `npm run test` output: DB, server and mobile suites, with counts and zero failures.
- [ ] The Agent restarted the API and Expo, and pasted clean startup lines.
- [ ] No test was skipped, deleted, loosened or marked `.only`. Ask: "List any test you changed or removed in this phase and why."
- [ ] Every provided test in `db/tests/` still passes unchanged (01–07, plus 08–10 from Phase 2).

## 2. Proof, not prose
- [ ] Every item in the phase's "Proof to paste" section is pasted as real code or output.
- [ ] Anything the Agent calls "already done" has its code pasted.

## 3. Independent review (me)
- [ ] Pushed to GitHub from Replit's Git pane.
- [ ] Sent me the repo link and the phase number.
- [ ] I return **PASS**, or a findings list with severity (Blocker / Major / Minor).
- [ ] Every Blocker and Major is fixed and re-reviewed. Minor items are fixed, or recorded below as won't-fix with a reason.

What I check every time:
- every new route uses the session's workspace, and never a workspace id from the request;
- another owner's ids return 404;
- money writes only through the database functions;
- no floats for money;
- migrations additive, with the checksum guard intact;
- test bodies assert real values and the failure cases, not just a 200;
- no secrets, names or amounts in logs;
- honest wording in the UI and PDFs.

## 4. On your phone
- [ ] Every item in the phase's "Try it on your phone" list works.
- [ ] At the largest text size, the new screens are usable.
- [ ] Dark mode on the new screens looks right.

## 5. Decision
- [ ] Done → paste the next phase.
- [ ] Not done → paste the findings back to the Agent with: "Fix these findings. Keep all invariants in replit.md. Re-run the gate. Do not start the next phase."

---

## QA log

| Date | Phase | Suites (db/server/mobile) | Review verdict | Phone check | Findings (B/M/m) | Done? |
|---|---|---|---|---|---|---|
| 2026-09-24 | P0 | 8 DB files / 32 server / 8 mobile | PASS | PASS — Expo Go opens; four tabs; dark mode follows system; Diagnostics API status ok; nothing cut off at largest accessibility text size | Fixes A–E applied; see notes below | PASS |
| | P1 | | | | | |
| | P2 | | | | | |
| | P3 | | | | | |
| | P4 | | | | | |
| | P5 | | | | | |
| | P6 | | | | | |
| | P7 | | | | | |
| | P8 | | | | | |

### Phase 0 — 2026-09-24

- **Result:** PASS (review and owner's iPhone check).
- **Tests:** 8 DB files, 32 server tests, 8 mobile tests.
- **Fixes:** A–E applied.
- **Deviations:** Project uses the `artifacts/` folder layout and the `/api/v1` API prefix. The Phase 6 public page must be served at `/r/:token` outside `/api`.
- **Open items:** React Native DevTools reports a `libdbus-1.so.3` warning; add real-error tests for `55000` in Phase 2 and `40001` in Phase 3.

2026-09-25 note: (a) Public routes: the v1.4 brief supersedes the Phase 0 note. Public pages live under /api (for example /api/r/:token) and crewtallyapp.com forwards to them; this is built in Phase 6. (b) Test count correction: Phase 0 has 7 DB test files producing 8 PASS lines, not 8 files. (c) Build pack v1.4 loaded 2026-09-25; db/provided not applied.

### Findings

### Phase 1 — 2026-10-01 (gate open)

- **Result:** Automated suites pass; gate remains open for trusted-ingress client-IP configuration and real-iPhone acceptance.
- **Tests:** 7 unchanged DB SQL files produce 8 PASS lines; 4 server test files / 70 tests pass; 3 mobile test files / 31 tests pass. Commands exit successfully; no tests skipped, weakened or deleted.
- **Migration:** Only additive `0002_auth.sql` was added and applied. Ledger contains `0001_schema.sql` and `0002_auth.sql`. `db/schema.sql`, migration 0001, provided tests, money helpers and `db/provided` are unchanged.
- **Server proof:** JWT/JWKS verification, issuer/audience/expiry/signature/SHA-256 hex nonce, five-minute ES256 client secret, encrypted refresh credentials, session hashing/sliding expiry, middleware, signout and tenancy harness are included in `docs/PHASE_1_GATE_PROOF.md`.
- **Isolation:** Two owners receive only their own `/me` workspace; test-only ID route returns 404 across workspaces for GET/POST/PUT/PATCH/DELETE. Unauthenticated protected routes return 401.
- **Development:** Attempts the Apple code exchange; only a failed development exchange logs `apple_exchange=skipped_dev` and continues after successful identity verification. Production fails closed.
- **Mobile:** SecureStore-only persistence, no Apple scopes, expired-session notice and same-owner route resume, account signout, workspace ID diagnostics. Storage/cache cleanup is serialized before a fresh sign-in.
- **Browser check:** Settled sign-in screen renders at 402×874; anonymous `/account` redirects to `/sign-in`. Web does not offer fake Apple authentication. Native Apple flows were not tested by the browser.
- **Startup:** API reports `Migrations ready` (`applied: 1`) and `Server listening` (`port: 8080`). Expo reports `Starting Metro Bundler`, `Web: http://localhost:18359`, and `Using Expo Go`. Existing optional React Native DevTools `libdbus-1.so.3` warning remains non-blocking.
- **Types:** Shared libraries, API server, mobile and scripts type-check successfully. The unchanged canvas sandbox still fails its workspace-wide check due to incompatible duplicate React types in `calendar.tsx` and `spinner.tsx`; no sandbox changes were made.
- **Open security gate:** Auth limiter currently counts 10 requests/minute per socket peer and rejects spoofed forwarded headers. Behind a shared ingress this can group phones together. Do not enable proxy trust without confirmed ingress peers/header semantics.
- **Open phone gate:** Native Apple nonce behavior, Apple button, kill/relaunch persistence, same workspace after signout/signin, and actual same-screen restoration require an iPhone check.
- **Assumptions:** `/me.locale` is fixed to `en-US` for the English-only Phase 1 app; locale settings are not added. Account omits later-phase payer-name/export/delete actions. No Phase 2 work started.

| # | Phase | Severity | Finding | Action | Status |
|---|---|---|---|---|---|
| | | | | | |

### When the Agent gets stuck
- It's looping, or says it's done when the tests show otherwise: stop it, reload the page, and paste:
  > "Stop. Paste the current `npm run test` output and `git status`. Do not change code until I reply."
- It wants to change `db/schema.sql`, a money function, or a provided test: the answer is no. Ask what problem it's trying to solve, and bring that to me.
- It offers extra features: decline. "Stay in scope for this phase."
