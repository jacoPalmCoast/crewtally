# CrewTally — Replit build pack (baseline 2.0)

This pack drives Replit Agent through the rest of the CrewTally build, phase by phase. Phases P0 and P1 are already built. Baseline 2.0 picks up from there:

- **Release 1:** the **Home** workspace on **iPhone and the web**, plus the public **website** at crewtallyapp.com. Phases P1b, P1c, P2–P8, with a TestFlight checkpoint after P2.
- **Release 1.1:** the **Business** workspace (owner, admins, crew leads, workers, approvals, Business billing). Phases B1–B4, built behind `BUSINESS_ENABLED=false` and switched on only at the end of B4. The foundation for every Business role is built now, in P1b.

Android follows later from the same code.

**Source of truth.** `01_PROJECT_BRIEF_AND_INVARIANTS.md` (it becomes `replit.md` in P1b) outranks everything. Then `docs/CrewTally_Design_Baseline_2.0.md` (the 2.0 spec). Then `docs/CrewTally_Native_App_Design_v1.4.md` for money, the ledger, receipts and statements wherever 2.0 doesn't change them. Then the phase file you're running. Screen images never override a rule. Section 1 of the 2.0 spec has the full order.

## What's in the pack

| File | What it's for |
|---|---|
| `00_START_HERE.md` | This file: what to do before each phase, how to run a phase, timing. |
| `01_PROJECT_BRIEF_AND_INVARIANTS.md` | The 2.0 brief and hard invariants. Replaces `replit.md` in Phase 1b. Read on every run. |
| `P0_Foundation.md`, `P1_Sign_In_And_Isolation.md` | Already built. Kept for reference. |
| `P1b_Identity_Workspaces_Roles.md` | Phase 1b: one person in several workspaces, roles, the `require_member` check on every route, the Home partner, invitations, the role matrix test. iPhone and API. |
| `P1c_Web_App_And_Email_Sign_In.md` | Phase 1c: the web app skeleton, email-code sign-in (web and iPhone), Sign in with Apple on the web, account linking both ways, web sessions with CSRF, web invite and join, the web workspace switcher. |
| `P2_Projects_Workers_Pay.md` | Phase 2: projects, workers, pay agreements and rate changes, My crew, plans and limits, the sample project. iPhone and web. Ends with the **TestFlight checkpoint**. |
| `P3_Today_Screen_And_Queue.md` | Phase 3: Today with one-tap recording and Undo, Use previous workday, hours, the offline queue; web day sheet and history. |
| `P4_Payments.md` | Phase 4: payments, splits, pay what's owed, checks, fixing a payment, duplicates, drafts on the phone, proof photos. |
| `P5_Reimbursements_Ledger_History.md` | Phase 5: expenses owed, adjustments, balance breakdown, ledger, filters, reports, year-end totals, server-built CSV exports. |
| `P6_Receipts_Statements_Evidence.md` | Phase 6: receipts and statements (migration 0006), texted links, the public receipt page, worker questions, hand-over signature. |
| `P7_Reminders_Deletion_Ops.md` | Phase 7: reminders, account deletion (migration 0007), full export, sync and recovery, accessibility, nightly jobs, Home plans with RevenueCat, web settings, the website. |
| `P8_Release_TestFlight_AppStore.md` | Phase 8: production, domain, universal links, review account, TestFlight pilot, App Store submission (Release 1). |
| `B1_Business_Foundation.md` | B1: Business setup, jobs, crew leads, team and roles, lead and worker scoping (migration 0008). |
| `B2_Approvals_And_Crew_Apps.md` | B2: submit, approve and return; crew lead and worker apps; web timesheet; notifications (migration 0009). |
| `B3_Business_Payments_And_Reports.md` | B3: Business payments by worker × job, receipts, reports, work-only export (no migration). |
| `B4_Business_Billing_And_Release.md` | B4: Business subscription, unpaid and expired states, restore, Release 1.1 (migration 0010). |
| `PM_Migration_From_Web_App.md` | Optional. Moves your records from the current web app (after Phase 5, before the pilot). |
| `VALIDATION_SESSIONS.md` | A 20-minute script for showing the screens to 3–4 real owners. |
| `GATE_CHECKLIST_AND_QA_LOG.md` | The gate you run at the end of every phase, and the log you keep. |
| `APP_STORE_CHECKLIST_iOS.md` | Everything Apple needs before you press submit. |
| `db/schema.sql` | Migration 0001: the ledger schema and every money-writing function, written and tested. Loaded verbatim. Never edited. Already in your project; the copy here is for reference. Don't upload it. |
| `db/migrations/0002_auth.sql` | Phase 1's auth migration (built). It lives only in your Replit project; this pack doesn't ship it. |
| `db/provided/migrations/0003_identity_and_memberships.sql` | Identity, workspaces, memberships, roles (`role_can`, `require_member`), invitations, email codes, account linking (`sign_in_with_email_code`, `link_email_code`, `link_apple`), display names, `recorded_by`, idempotency for session routes, `delete_user_account`. Tested. Applied in Phase 1b. |
| `db/provided/migrations/0004_plans_and_project_use.sql`, `0005_crew.sql` | Plans, limits, project use, tax figures (0004) and My crew (0005). The 1.4 files 0003 and 0004, renumbered, content unchanged. Applied in Phase 2. |
| `db/tests/01–07*.sql`, `db/provided/tests/08–11*.sql`, `db/run_db_tests.sh` | Database tests and the runner (throwaway schema). `db/tests/` and the runner are already in your project; the copies here are for reference. Don't upload them. `11` moves in with 0003 (P1b); `08`–`10` with 0004 and 0005 (P2). The Agent writes `12` (P6), `13` (P7), `14`–`16` (B1, B2, B4). |
| `shared/pay.ts`, `shared/money.ts`, `shared/pay_test_vectors.json` | Pay preview and amount parsing, integer math only, tested against the same vectors as the database. Used by iPhone and web. |
| `docs/CrewTally_Design_Baseline_2.0.md` | The 2.0 spec: decisions, roles, sign-in, invitations, partner, deletion, every screen change, money rules (keep, adopt, must not build), web app, website, Business, data model, API index, design tokens, things to confirm. |
| `docs/CrewTally_Native_App_Design_v1.4.md` | The 1.4 spec. Still the money and ledger reference. |
| `docs/CrewTally_pricing_and_features_validation.md` | The evidence behind the plans and prices. |
| `docs/SCREEN-COVERAGE-2.0.csv` | Every revised screen (177 iPhone, 85 web), the phase that builds it, what changed from 1.4, and what the design gets wrong. Each phase fills in `status` and `test_evidence`. |
| `docs/screens-2.0/` | Screen targets: `mobile/<ID>.png`, `web/desktop`, `web/mobile`, `web/home`, `web/roles`. |
| `docs/screens/` | The 1.4 screens. History only. |
| `docs/App-Icon-1024.png` | The approved 2.0 app icon. |

## What changed from 1.4

- **Workspaces and roles.** Sign-in no longer creates a workspace. One person can be in several workspaces, Home or Business. A Home workspace has an **organizer** (who pays) and at most one **partner** on every plan, Free included. The partner records work and payments but can't set rates, remove people, invite or touch the plan, and never pays.
- **One permission check.** Every request names its workspace in the `X-Workspace-Id` header, and the database function `require_member` checks it in the same transaction as the work. A role matrix test covers every route for every role.
- **Who did it.** Every money row records `recorded_by`.
- **The web is in Release 1.** A web app at `crewtallyapp.com/app` with the same account, the same records and the same rules as the iPhone. No purchases on the web.
- **Email sign-in is in Release 1.** Email codes on iPhone and web next to Sign in with Apple, with account linking both ways. Email is used only for sign-in codes and invitations.
- **Invitations** by link and 6-digit code, valid 7 days, emailed if you choose.
- **The website** (home, For Home, how it works, pricing, help, support, privacy, terms, account deletion) replaces the simple API pages in Phase 7.
- **Revised screens** for everything, with every 1.4 money safeguard kept (spec section 11 lists what to keep, what to adopt and what must never be built).
- **New icon and palette** (spec section 17), full dark mode, WCAG 2.1 AA on both surfaces.
- **Business** (Release 1.1) is designed and scheduled as B1–B4, behind a flag.
- **Migration numbers:** identity `0003` (P1b), plans `0004` and crew `0005` (P2; they were 0003 and 0004 in 1.4), receipts and statements `0006` (P6), deletion jobs and alerts `0007` (P7), Business `0008` (B1), `0009` (B2), `0010` (B4).

## Before Phase 1b (you)

1. **Upload the 2.0 pack** into the Replit project. Push to GitHub first so you can see the difference. Replace exactly these: `docs/`, `db/provided/`, the phase files (`P*`, `B*`), `00_START_HERE.md`, `01_PROJECT_BRIEF_AND_INVARIANTS.md`, `GATE_CHECKLIST_AND_QA_LOG.md`, `APP_STORE_CHECKLIST_iOS.md`, `VALIDATION_SESSIONS.md` and `PM_Migration_From_Web_App.md`. **Never** upload over `db/migrations/`, `db/schema.sql`, `db/tests/` or `db/run_db_tests.sh` in the project: they're already there and must not change. Keep everything else the Agent built (`artifacts/`, `shared/`). (P1b's "Before pasting" has the same list.)
2. **`DEV_SIGNIN_CODE`** in Replit Secrets, if it isn't there yet: in the Shell run `openssl rand -hex 8`, paste the result into Secrets, then clear the Shell. Keep `APP_ENV=development`.
3. **`CODE_PEPPER`** in Replit Secrets: in the Shell run `openssl rand -base64 32`, paste the result into Secrets, then clear the Shell. Never ask the Agent to make a secret value.
4. **`BUSINESS_ENABLED`** = `false` in Replit Secrets.
5. **`PUBLIC_BASE_URL`** (not a secret) = your dev URL plus `/api`, for example `https://<dev domain>/api`. Invitation links are built from it. It becomes `https://crewtallyapp.com` in Phase 8.
6. Have Expo Go on your iPhone. Developer sign-in (labels `owner-a`, `owner-b`, `member-c`, `member-d`) is how you test roles on one phone.

## Before Phase 1c (you)

**A. Email service (needed for the phase):**
1. Open an account with **Resend** or **Postmark**.
2. Add the sending domain `crewtallyapp.com`. The provider shows DNS records (SPF and DKIM TXT records, sometimes a return-path CNAME). Add them at your domain registrar exactly as shown and wait until the provider says the domain is verified.
3. Create a send-only API key.
4. Replit Secrets: `EMAIL_PROVIDER` (`resend` or `postmark`), `EMAIL_API_KEY`, `EMAIL_FROM` (for example `CrewTally <codes@crewtallyapp.com>`).
5. Check the provider's limits for new accounts. Some only send to your own address until they review you.

**B. Sign in with Apple on the web (can wait; the web Apple button stays hidden until it's done):**
1. Ask the Agent for the dev domain (`echo $REPLIT_DEV_DOMAIN`).
2. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → **Services IDs**. Description `CrewTally web`, identifier `com.crewtallyapp.crewtally.web`. Register.
3. Open it, tick **Sign in with Apple** → Configure: primary App ID `com.crewtallyapp.crewtally`; domains `crewtallyapp.com` and the dev domain; return URLs `https://crewtallyapp.com/app/auth/apple` and `https://<dev domain>/app/auth/apple`. Save.
4. If Apple asks for domain verification, download its file. Apple checks it at the root of the domain, `https://<dev domain>/.well-known/apple-developer-domain-association.txt` (not under `/app`). Ask the Agent where to upload it so it's served at exactly that root path; the Agent confirms with `curl`. Then click Verify for the dev domain. `crewtallyapp.com` is verified in Phase 8 (the website serves it there).
5. Replit Secrets: `APPLE_WEB_SERVICES_ID` = `com.crewtallyapp.crewtally.web`, `APPLE_WEB_RETURN_URL` = `https://<dev domain>/app/auth/apple`.

**C. Web session length (C4):** web sessions last 30 days and slide with use, like the phone. Accepted by default; say so before P1c if you want shorter.

The P1c file has the same steps in more detail.

## Before the TestFlight checkpoint (after Phase 2 passes)

1. Apple Developer Program membership active, bundle ID `com.crewtallyapp.crewtally` registered with Sign in with Apple turned on.
2. Production Secrets in the API deployment: the Apple keys, `APPLE_AUDIENCES` = the bundle ID only, a **new** `TOKEN_ENCRYPTION_KEY` and a **new** `CODE_PEPPER` (make each in the Shell with `openssl rand -base64 32`, paste into Secrets, clear the Shell), the email Secrets, `APP_ENV=production`, `BUSINESS_ENABLED=false`, `PUBLIC_BASE_URL` = the deployment URL plus `/api`. **No** `DEV_SIGNIN_CODE`.
3. Know that this is the first use of the production database. What you create stays (there's no reset); keep it small and real.

## Before Phase 7 (you)

1. Fill in the **owner inputs** table in P7 section 11: legal operator name, mailing address, support email, privacy contact email, expected reply time, governing law, effective date, email provider name. `APP_STORE_URL` stays blank until the app is live. The Agent never invents these.
2. `BACKUP_ENCRYPTION_KEY` in Replit Secrets: in the Shell run `openssl rand -base64 32`, paste it into Secrets, clear the Shell. (Production gets its own new one in Phase 8.)
3. Open a free **RevenueCat** account when the Agent asks; connect App Store Connect when it tells you how. Purchases run in test mode in Expo Go.
4. Enroll in the **App Store Small Business Program** as soon as your membership is active (15%; it starts about two weeks after approval).

## Before Phase 8 (you)

1. The domain `crewtallyapp.com` at your registrar, ready to point at Replit.
2. App Store Connect: the **Paid Apps** agreement signed, banking and tax details added.
3. The products: subscription group "CrewTally Pro" with `pro_monthly` ($7.99) and `pro_annual` ($49.99), and `project_pass` (consumable, $24.99). A sandbox tester.
4. A review email address you control (for example `review@crewtallyapp.com`) and a 6-digit review code (`REVIEW_EMAIL`, `REVIEW_CODE`; make the code in the Shell as P8 shows). They're removed after approval.
5. New production values for `TOKEN_ENCRYPTION_KEY` (or the one from the TestFlight checkpoint), `BACKUP_ENCRYPTION_KEY` and `CODE_PEPPER` (or the checkpoint's), each made in the Shell with `openssl rand -base64 32`.
6. The final privacy policy and terms text you approved in Phase 7.
7. At least five owners lined up for a two-week TestFlight pilot (some with a partner, some also using the web).

## Before B1 and B4 (you)

- **B1:** Release 1 is live. Add `BUSINESS_DEV_ACCESS=true` (it works only with `APP_ENV=development`). Keep `BUSINESS_ENABLED=false`.
- **B4:** confirm the Business price ($29/$290) with 3–5 contractors, Apple's subscription-group rules, the 14-day trial offer, and RevenueCat's restore setting (the owner checks at the top of B4). Re-add `REVIEW_EMAIL` and a new `REVIEW_CODE` in production Secrets for the 1.1 review; remove them after approval.

## How to run each phase

1. Do the "Before pasting" steps at the top of the phase file.
2. Paste the whole phase file into Replit Agent. One phase at a time.
3. When the Agent says it's done, run the gate in `GATE_CHECKLIST_AND_QA_LOG.md`:
   - it pastes the test output for every suite (`test:db`, `test:server`, `test:mobile`, and from P1c `test:web`; from P8 `test:release`) after a restart, with zero failures;
   - it pastes the "Proof to paste" items as real code;
   - you try the phase on your iPhone (Expo Go until the TestFlight checkpoint) **and on the web** (from P1c) using the phase's "Try it" lists, including as the partner (`member-c`);
   - you check the phase's rows in `docs/SCREEN-COVERAGE-2.0.csv` are marked built with test evidence;
   - you push to GitHub (Replit Git pane) and ask me for the independent review. I read the diff, the permission checks, the money paths and the test bodies, and return PASS or findings.
4. Only on PASS, paste the next phase. Record the result in the QA log.

If the Agent stalls or loops: stop it, reload, and paste "Continue from where you stopped. Do not redo finished work." If it wants to change a provided migration, a provided function or a provided test, or to widen a permission to make something work, the answer is no (see "When the Agent gets stuck" in the gate checklist).

## Plan and timing (one person driving Replit Agent)

These are estimates, not commitments. Each phase from P1c on builds both the iPhone and the web screens for its scope, which is why they're longer than in 1.4. **Re-estimate after P1b**, once you've seen how fast the Agent handles the new permission layer.

| Phase | Scope | Rough time |
|---|---|---|
| P0, P1 | Foundation; Sign in with Apple, sessions, isolation | Built |
| P1b | Workspaces, roles, `require_member` everywhere, the Home partner, invitations, role matrix | 3–4 days |
| P1c | Web app skeleton, email-code sign-in (web and iPhone), Apple on the web, account linking, CSRF, web invite and join | 4–6 days |
| P2 | Projects, workers, pay and rate changes, My crew, plans and limits, sample project (iPhone and web) | 4–6 days |
| TestFlight checkpoint | First real build through Replit publishing; real Sign in with Apple; Add Sign in with Apple on iPhone | 1–2 days plus Apple's processing |
| P3 | Today, Undo, previous workday, hours, offline queue; web day sheet and history | 5–7 days |
| P4 | Payments, splits, pay what's owed, checks, fixing payments, proof (iPhone and web) | 6–8 days |
| P5 | Expenses owed, adjustments, breakdown, ledger, reports, year-end totals, exports | 4–5 days |
| P6 | Receipts, statements, texted links, public page, questions, hand-over signature | 6–8 days |
| P7 | Reminders, deletion, export, sync, accessibility, nightly jobs, Home plans, web settings, website | 6–8 days |
| PM (optional) | Move your records from the current web app | Hours to 2 days |
| P8 | Production, domain, universal links, review account, pilot, submission | 4–6 days, plus a 2-week pilot and Apple review |
| B1 | Business setup, jobs, leads, team and roles, scoping | 5–7 days |
| B2 | Approvals, crew lead and worker apps, web timesheet, notifications | 7–10 days |
| B3 | Business payments, receipts, reports, work-only export | 4–6 days |
| B4 | Business billing, expiry, restore, Release 1.1 | 5–7 days, plus Apple review |

Roughly 11–14 weeks of build to the Release 1 submission (plus the pilot), and 5–7 more weeks for Release 1.1.

## Differences from the original spec for this build

| Original spec (v1.1, carried into 1.4) | This build (baseline 2.0) |
|---|---|
| Both stores | App Store only in Release 1. Android later: push to GitHub, build and submit with Expo EAS from a laptop (Replit doesn't publish to Google Play). |
| iPhone app only (1.4 build) | **Web app in Release 1** (Phase 1c onward) and a public website (Phase 7), on the same API and rules. No purchases on the web. |
| Email code, Apple and Google sign-in | **Sign in with Apple and email code, both in Release 1**, on iPhone and web, with account linking both ways. No Google sign-in. |
| One owner per workspace | Several workspaces per person; Home organizer plus one partner in Release 1; Business roles in Release 1.1. |
| Supabase-style backend | Replit: Node/TypeScript API, Replit PostgreSQL and Replit Object Storage. |
| Row-level security for reads | One API check per request (`require_member` in the same transaction), a role matrix test, and response shaping by role. Money writes still go only through the database functions. |
| Point-in-time recovery | Confirm what Replit's production database offers. Until confirmed, a nightly encrypted `pg_dump` to Object Storage is mandatory (P7). |
| XLSX export | Not in Release 1. Server-built CSV and a full ZIP export instead. |
| Texted receipt links and worker acknowledgment | In Release 1 (Phase 6). |
| Push notifications | Not in Release 1. Local reminders on iPhone; an in-app list for Business in 1.1. |
