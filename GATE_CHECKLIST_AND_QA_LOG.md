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
- **Tests (latest development-sign-in gate):** 7 unchanged DB SQL files produce 8 PASS lines; 4 server test files / 75 tests pass; 4 mobile test files / 51 tests pass. Commands exit successfully; no tests skipped, weakened or deleted.
- **Migration:** Only additive `0002_auth.sql` was added and applied. Ledger contains `0001_schema.sql` and `0002_auth.sql`. `db/schema.sql`, migration 0001, provided tests, money helpers and `db/provided` are unchanged.
- **Server proof:** JWT/JWKS verification, issuer/audience/expiry/signature/SHA-256 hex nonce, five-minute ES256 client secret, encrypted refresh credentials, session hashing/sliding expiry, middleware, signout and tenancy harness are included in `docs/PHASE_1_GATE_PROOF.md`.
- **Isolation:** Two owners receive only their own `/me` workspace; test-only ID route returns 404 across workspaces for GET/POST/PUT/PATCH/DELETE. Unauthenticated protected routes return 401.
- **Development:** Attempts the Apple code exchange; only a failed development exchange logs `apple_exchange=skipped_dev` and continues after successful identity verification. Production fails closed.
- **Developer sign-in:** `/v1/auth/dev` exists only in development with a nonempty `DEV_SIGNIN_CODE`; otherwise it returns 404. Owner A and Owner B use distinct `dev:` users/workspaces and the shared normal-session path, with no Apple exchange or refresh credential. Fixed-size hash comparison uses `timingSafeEqual`; codes are never logged or persisted by the mobile app. The owner will add the Secret, then restart the API.
- **Production exclusion:** Server tests prove the route is absent in production, including when the Secret is set; startup warns by Secret name only. Mobile tests prove the button is hidden outside development and when Apple is available. An iOS production export contains no developer-sheet controls or request-helper implementation; the unused generated API contract still contains the endpoint URL.
- **Mobile:** SecureStore-only persistence, no Apple scopes, expired-session notice and same-owner route resume, account signout, workspace ID diagnostics. Storage/cache cleanup is serialized before a fresh sign-in.
- **Browser check:** Settled sign-in screen renders at 402×874; anonymous `/account` redirects to `/sign-in`. Web does not offer fake Apple authentication. Native Apple flows were not tested by the browser.
- **Startup (latest development-sign-in gate):** API reports `Migrations ready` (`applied: 0`) and `Server listening` (`port: 8080`); health returns 200 and the unconfigured development sign-in route returns 404. Expo session login succeeds, Metro starts in Expo Go mode, and a fresh QR is generated. Existing optional React Native DevTools `libdbus-1.so.3` warning remains non-blocking.
- **Types:** Shared libraries, API server, mobile and scripts type-check successfully. The unchanged canvas sandbox still fails its workspace-wide check due to incompatible duplicate React types in `calendar.tsx` and `spinner.tsx`; no sandbox changes were made.
- **Open security gate:** Auth limiter currently counts 10 requests/minute per socket peer and rejects spoofed forwarded headers. Behind a shared ingress this can group phones together. Do not enable proxy trust without confirmed ingress peers/header semantics.
- **Owner decision (2026-10-01):** Keep proxy trust disabled and leave the per-client-IP limiter gate open. This is an accepted open item, not proof that per-phone-IP limiting is implemented.
- **Open device item:** Real Sign in with Apple on a device: carried to first TestFlight build (end of Phase 2); Expo Go 1017880 lacks the ExpoAppleAuthentication native module.
- **Open phone gate:** Kill/relaunch persistence, distinct developer-owner workspaces, same workspace after repeat sign-in, and actual same-screen restoration still require an iPhone check using development sign-in.
- **Later optional biometric lock:** Support both Touch ID and Face ID (detect with supportedAuthenticationTypesAsync, word the button to match, passcode fallback, test on a home-button iPhone).
- **Assumptions:** `/me.locale` is fixed to `en-US` for the English-only Phase 1 app; locale settings are not added. Account omits later-phase payer-name/export/delete actions. No Phase 2 work started.

| # | Phase | Severity | Finding | Action | Status |
|---|---|---|---|---|---|
| | | | | | |

### When the Agent gets stuck
- It's looping, or says it's done when the tests show otherwise: stop it, reload the page, and paste:
  > "Stop. Paste the current `npm run test` output and `git status`. Do not change code until I reply."
- It wants to change `db/schema.sql`, a money function, or a provided test: the answer is no. Ask what problem it's trying to solve, and bring that to me.
- It offers extra features: decline. "Stay in scope for this phase."
