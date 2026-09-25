# CrewTally — Replit build pack (iPhone first)

This pack drives Replit Agent through the Release 1 build of the CrewTally, **iPhone only**, then publishes to TestFlight and the App Store with Replit's publish flow. Android follows later from the same code.

Source of truth: `docs/CrewTally_Native_App_Design_v1.2.md` (the spec). Where this pack and the spec differ, this pack wins for the iPhone build; the differences are listed at the bottom.

## What's in the pack

| File | What it's for |
|---|---|
| `01_PROJECT_BRIEF_AND_INVARIANTS.md` | First message to Replit Agent, and the content of `replit.md`. Restated in every phase. |
| `P0_Foundation.md` … `P8_Release_TestFlight_AppStore.md` | One prompt per phase. Paste one at a time. |
| `PM_Migration_From_Web_App.md` | Optional. Moves your records from the current web app once you have an export. |
| `db/schema.sql` | The ledger schema and **every money-writing function**, already written and tested: work entry, mark rest, payments, reversals, checks, corrections, reimbursements, adjustments, rate changes with preview, and account deletion. Loaded verbatim; the Agent calls these and never writes its own. It supersedes Appendix A in the spec. |
| `db/tests/01–05*.sql`, `db/run_db_tests.sh` | Database tests (pay vectors, ledger sequence, idempotency, isolation, checks, partial refunds, corrections, rate changes, mark rest, deletion) and the runner that uses a throwaway schema. All pass on PostgreSQL 16. |
| `shared/pay.ts`, `shared/money.ts`, `shared/pay_test_vectors.json` | Pay preview and amount parsing in TypeScript, integer math only, tested against the same vectors as the database. |
| `docs/` | The spec (baseline 1.2) and all 45 screen designs as images (`docs/screens/`). |
| `VALIDATION_SESSIONS.md` | A 20-minute script for showing the screens to 3–4 real owners before Phase 3. |
| `GATE_CHECKLIST_AND_QA_LOG.md` | The gate you run at the end of every phase, and the log you keep. |
| `APP_STORE_CHECKLIST_iOS.md` | Everything Apple needs before you press submit. |

## Before you start (do these today)

1. **Apple Developer Program membership** ($99/year). Replit's publish flow needs it for TestFlight and the App Store. Individual enrollment is fastest (usually a day or two). Organization enrollment shows a company as the seller but needs a D-U-N-S number first, which can take weeks. Individual now, convert later if you want a company name.
2. **App name and bundle ID (decided).** Name "CrewTally", website crewtallyapp.com, bundle ID `com.crewtallyapp.crewtally`. Register the bundle ID in your Apple Developer account exactly as written; it can't change after the first App Store upload. Also check "CrewTally" is free when you create the app record in App Store Connect.
3. **Sign in with Apple key.** In your Apple Developer account, create a Sign in with Apple key (.p8) and note the Key ID and Team ID. The server needs these to revoke tokens when an account is deleted (Apple requires this). You add them in Phase 1 as Replit Secrets.
4. **Privacy policy and support page.** Two simple web pages on any domain. Needed in Phase 8.
5. **Expo Go** on your iPhone, for testing every phase on a real device.

Inputs you owe the build (fill these in `01_PROJECT_BRIEF_AND_INVARIANTS.md` before pasting): app name, bundle ID, payer display name default, privacy policy URL, support URL.

## How to run each phase

1. Paste the phase prompt into Replit Agent. Don't paste the next one until this phase passes the gate.
2. When the Agent says it's done, run the gate in `GATE_CHECKLIST_AND_QA_LOG.md`:
   - it pastes the test output (all suites green) after a restart;
   - you test the phase on your iPhone in Expo Go using the phase's "Try it on your phone" list;
   - you push to GitHub (Replit Git pane) and ask me for the independent review. I read the diff, the scoping, the money paths and the test bodies, and return PASS or a findings list.
3. Only on PASS, paste the next phase.

If the Agent stalls or loops: stop it, reload, and paste the last instruction again with "Continue from where you stopped. Do not redo finished work."

## Plan and timing (one person driving Replit Agent)

| Phase | Scope | Rough time |
|---|---|---|
| P0 | Foundation: app shell, API, database, schema load, tests running | 1–2 days |
| P1 | Sign in with Apple, sessions, workspace, isolation | 1–2 days |
| P2 | Projects, workers (with documents language), daily or hourly pay agreements, sample project | 3 days |
| P3 | Today screen: tap to save, Undo, Mark rest, hours, no-signal queue, list view | 3–4 days |
| P4 | Payments: split, advance warning, checks, reversals, pay what's owed, hand-over signature | 4–5 days |
| P5 | Reimbursements, adjustments, ledger, history, CSV, project summary, year-end totals | 3–4 days |
| P6 | Receipts and statements (PDF, share, per-worker view, English/Spanish, signed line), texted receipt links with worker confirm, evidence photos | 5–6 days |
| P7 | Reminders, account deletion, export, accessibility, diagnostics, nightly jobs | 2–3 days |
| PM (optional) | Move your records from the current web app | Hours (balances only) to 1–2 days (full history) |
| P8 | App Store build, TestFlight pilot, submission | 3–5 days plus Apple review |

About 7 weeks to App Store submission. These are estimates, not commitments; re-estimate after P1.

## Differences from the v1.1 spec for this build

| Spec v1.1 | iPhone-first Replit build |
|---|---|
| Both stores | App Store only. Android later: push to GitHub, build and submit with Expo EAS from a laptop (Replit doesn't publish to Google Play). |
| Supabase-style backend | Replit: Node/TypeScript API plus Replit PostgreSQL and Replit Object Storage. |
| Email code, Apple and Google sign-in | Sign in with Apple only. Simplest path on iPhone; no third-party login means no equivalent-login rule to meet. Email sign-in comes with Android. |
| Row-level security for reads | API middleware scopes every query to the caller's workspace. Money writes still go only through the database functions in `db/schema.sql`. |
| Point-in-time recovery | Confirm what Replit's production database offers. Until confirmed, a nightly scheduled backup (`pg_dump` to Object Storage) is mandatory (P7). |
| XLSX export, secure links, acknowledgment | Unchanged: Release 1.1. |
