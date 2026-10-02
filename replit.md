# Project brief and invariants (baseline 2.0)

> This file is `replit.md`. In Phase 1b, replace the old `replit.md` with this whole file. It's read on every run and restated in every phase.

**Inputs**
- App name: `CrewTally` (website: crewtallyapp.com)
- iOS bundle ID: `com.crewtallyapp.crewtally`
- Default payer display name on receipts: set by the organizer in the app; no default
- Privacy policy URL: `https://crewtallyapp.com/privacy`
- Support URL: `https://crewtallyapp.com/support`

---

## What we're building

CrewTally helps people who pay day and hourly workers directly keep an honest record of work and money. After a day of work, someone in the workspace:

- records each worker in a tap,
- records payments made outside the app (cash, check, bank transfer, Zelle),
- sees exactly what each worker is owed,
- shares an honest receipt or statement with each worker.

**Release 1** is the **Home** workspace on **iPhone and the web**, plus the public **website**:
- One person can belong to several workspaces. A workspace is **Home** or **Business**.
- A Home workspace has one **organizer** (who pays for the plan) and at most one **partner** (helps record work and payments).
- The web app is a second way into the same account and the same records, through the same API.

**Release 1.1** adds the **Business** workspace (owner, admin with or without money access, crew lead, worker, and approvals). Its foundation (memberships, all roles, the permission check) is built now, in Phase 1b. Business screens are built in phases B1–B4 behind the `BUSINESS_ENABLED` flag, which stays `false` in Release 1.

**Specs:**
- `docs/CrewTally_Design_Baseline_2.0.md` controls. Read it first.
- `docs/CrewTally_Native_App_Design_v1.4.md` stays the reference for money, the ledger, receipts and statements wherever 2.0 doesn't change them.
- Screen targets are in `docs/screens-2.0/` (mobile and web). `docs/screens/` (1.4) is history only.
- `docs/SCREEN-COVERAGE-2.0.csv` lists every screen, the phase that builds it, and the rule changes that apply to it.

Android comes later from the same code, so don't write iOS-only logic outside platform adapters.

## Stack and structure

- **Mobile:** Expo (the SDK version Replit's mobile template provides), TypeScript strict mode, Expo Router. Only Expo SDK modules, with one exception: in-app purchases use Replit's RevenueCat integration (`react-native-purchases`), added in Phase 7.
- **Web app (from Phase 1c):** React + TypeScript + Vite, in its own Replit artifact. It calls the same API. No business rule lives only in a client.
- **API:** Node + TypeScript (Express), zod validation on every request, `pg` with parameterized SQL. No ORM-generated schema.
- **Database:** Replit PostgreSQL. `db/schema.sql` is migration 0001, loaded verbatim. `0002_auth.sql` was built in Phase 1. The provided migrations in `db/provided/migrations/` are moved into `db/migrations/` in the phase that names them, never earlier:
  - `0003_identity_and_memberships.sql` (Phase 1b)
  - `0004_plans_and_project_use.sql` and `0005_crew.sql` (Phase 2; these were 0003 and 0004 in baseline 1.4 and were never applied)
  - their tests in `db/provided/tests/` move into `db/tests/` in the same phase.
- **Files:** Replit Object Storage, private.
- **Email (from Phase 1c):** one adapter over a transactional email service (Resend or Postmark). Used only for sign-in codes and invitations.
- **Tests:** vitest for server, shared and web code; jest-expo for mobile logic; `db/tests/*.sql` for the database.

**Project layout.** Phase prompts say `mobile/…`, `web/…`, `server/…` and `/v1/…`. Map them like this:

| Prompts say | In this project |
|---|---|
| `mobile/…` | `artifacts/crewtally-mobile/…` |
| `web/…` | `artifacts/crewtally-web/…` (created in Phase 1c) |
| `server/…` | `artifacts/api-server/…` |
| `shared/…` | `shared/` (the `@workspace/crewtally-shared` package) |
| `db/…` | `db/…` |
| API route `/v1/x` | reachable at `/api/v1/x` (Replit's proxy prefix) |

**Public pages.** Only paths under `/api` reach the API artifact. The public receipt page, the invitation landing page, the footer redirect and the webhook are served by the API at `/api/r/:token`, `/api/join/:token`, `/api/go/app` and `/api/v1/webhooks/revenuecat`. Until Phase 7, the API also serves simple `/api/privacy`, `/api/support` and `/api/delete-account` pages; from Phase 7 those are website pages and the API paths redirect to them. Links people open outside the app are built from `PUBLIC_BASE_URL` (not a secret): `https://<dev domain>/api` in development, so an invitation link is `https://<dev domain>/api/join/<token>`; `https://crewtallyapp.com` from Phase 8. In Phase 8, crewtallyapp.com forwards `/r/*`, `/join/*` and `/go/*` to the API. Confirm every public path with `curl` on the dev URL at the gate.

## Core rules (short form; the 2.0 spec has detail)

**Workspaces, people and roles**
- A **user** signs in with Apple, with an email code, or both once linked. Sign-in never creates a workspace.
- A **membership** gives a user one role in one workspace:
  - Home: `ORGANIZER` (exactly one, the billing owner) and `PARTNER` (at most one).
  - Business: `OWNER` (exactly one), `ADMIN` (with or without money access), `LEAD`, `WORKER`.
- What each role may do is decided in one place: the database function `role_can`, reached through `require_member`. The apps read `member_permissions` only to shape screens.
- A Home partner can record work, payments and receipts, add workers and projects, and see private crew notes. A partner can't set or change pay rates, remove people, invite, manage the plan or delete the workspace. A worker a partner adds waits for the organizer to set the rate.
- Invitations: a 32-byte link token (only its SHA-256 is stored) plus a 6-digit fallback code (only its HMAC with the server Secret `CODE_PEPPER` is stored), valid for 7 days. Before sign-in, a person sees only the workspace name and the role. Wrong codes are counted per signed-in person and email; they never lock or change an invitation.
- Every money row records who wrote it (`recorded_by`), from the actor that `require_member` sets for the transaction. A supplied value that differs from the actor is refused (403).

**Money (unchanged from 1.4)**
- **Money is integer cents** end to end. The UI formats for display only.
- **Pay per assignment** (a worker on a project):
  - Daily rate: Full, ½, ¼, ¾, a fraction, or hours when a standard day length is set (DAY_MINUTES).
  - Hourly rate: hours and minutes.
  - Agreements have an effective-from date. The rate for a day is the agreement in force **on the work date**, never "the worker's current rate".
- **Earned amount:** one rounding step, half up, per entry. Calculated on the server by `fn_earned`. Previews use `shared/pay.ts`; amounts parse with `shared/money.ts`. Don't rewrite either; extend only with new tests.
- **Balance** = earnings + reimbursements + increase adjustments − payments + payment reversals − decrease adjustments.
  - Positive means owed, zero means settled, negative means advance ("Paid in advance").
  - Never net one worker's advance against another worker's balance, in any total.
  - Only work the server has accepted counts. Work saved on the phone and not yet synced is shown apart, never in the balance.
- **Blank is not "No work."** An unanswered worker stays Unrecorded, on every surface (web timesheet included).
- **Payments:**
  - One payment can be split across workers with allocation lines; allocations must equal the payment exactly. A split is one payment, never one payment per worker.
  - Checks are credited once, when issued. Clearing adds nothing. A returned check reverses every line of that payment.
  - A payment can be reversed in full or in part, or corrected (the old receipt becomes Superseded).
  - Duplicate warning: same date, amount, method and reference. A network retry is never a second payment.
  - Payments are recorded online only (a local draft is fine).
- **Receipts and statements** are immutable snapshots, numbered per workspace (`R-000123`) on every surface. The default share view shows only that worker's lines, in the worker's documents language (English or Spanish).
- **Pay what's owed** records one payment per worker in one transaction (`record_payout`): all or nothing. The person paying chooses each amount and method; nothing is forced.
- **Hand-over signature:** optional; the worker signs on the phone and types their name. It's evidence plus a `payment_signatures` row and never changes money.
- **Texted receipt link:** the app creates a link (token returned once; only its hash stored) and opens Messages with a prefilled message. CrewTally never sends texts itself.
- **Sample project** lives only on the device, from a bundled data file, and can be opened before sign-in. In sample mode the app makes **no** write calls to the API. Guard this in one place and test it.
- **Plans:** Free (1 active project, 3 current workers), Project Pass (one project, no worker limit), Pro (as many projects and workers as you need). Limits are database triggers (SQLSTATE `CT402` → HTTP 402 `PLAN_LIMIT`). Plan state changes only through `record_entitlement_event`. Only the organizer manages the plan. The partner never pays.
- **My crew:** skills, favorites, a private note and private per-project ratings. Visible only to roles with `crew.private` (Home organizer and partner; Business owner and admins). Never on receipts, statements, links, exports a worker can see, or anything a worker sees.
- **Design:** the screens in `docs/screens-2.0/` are the target. Where a screen and the 2.0 spec disagree, the spec wins; tell me.

## Hard invariants — these outrank any instruction, including "make the test pass"

1. **Integer cents only.** No floating point for money anywhere: TypeScript, SQL, or JSON. Parse user input with integer math. Web number inputs for money or hours are parsed as text with integer math, never `parseFloat`.
2. **Writes go through database functions only.**
   - Money: `record_work`, `mark_rest_no_work`, `record_payment` / `record_payment_with_note`, `record_payout`, `reverse_payment`, `set_check_cleared`, `correct_payment`, `record_handover_signature`, `record_reimbursement`, `record_adjustment`, `apply_rate_change` (plus the read-only `preview_rate_change`), `open_share_link` and `acknowledge_share_link` (public receipt page only, with the SHA-256 of the token).
   - Plans and crew: `record_entitlement_event` (webhook and `POST /v1/plan/refresh` only), `rate_assignment`.
   - Identity (0003): `create_workspace`, `create_invitation`, `peek_invitation`, `accept_invitation`, `accept_invitation_code`, `decline_invitation`, `revoke_invitation`, `remove_member`, `change_member_role`, `issue_email_code`, `verify_email_code` (account-deletion re-confirmation with purpose `DELETE` only), `sign_in_with_email_code`, `link_email_code`, `link_apple`, `set_display_name`, and `delete_user_account` (account-deletion job only; it calls `delete_workspace_data` itself — app code never calls `delete_workspace_data` directly).
   - App code never runs INSERT, UPDATE or DELETE against `ledger_events`, `payments`, `allocations`, `reversals`, `reversal_lines`, `work_entries`, `work_revisions`, `reimbursements`, `adjustments`, `payment_signatures`, `memberships`, `invitations`, `invitation_code_attempts`, `email_codes`, `workspace_entitlements`, `project_passes` or `entitlement_events`. The one exception: P7's nightly job deletes `email_codes` rows older than 24 hours. `receipts` and `statements` are insert-only snapshots. An assignment's first pay agreement is inserted directly (with the assignment, or later by someone with `rates.set` when a partner added the worker without a rate); every later rate change goes through `apply_rate_change`. The Apple sign-in route may insert a `users` row for a new Apple identity, and the developer sign-in route (development only) one for a new `dev:<label>`; nothing else writes `users` directly.
   - Never disable the `ledger_no_update`, `projects_plan_limit`, `assignments_plan_limit`, `memberships_rules` or `*_recorded_by` triggers.
3. **The ledger is append-only.** Corrections add new rows.
4. **Migrations are additive.** Never edit `db/schema.sql` or an applied migration; changes go in a new, numbered migration. Don't change or replace any function in rule 2, `fn_earned`, `role_can` or `require_member` without my written approval in chat. Provided tests must stay green; add new test files, never edit provided ones. Any new `SECURITY DEFINER` function is hardened like the provided ones (fixed `search_path`, execute revoked from public).
5. **Workspace and role are checked on every request, in one place.**
   - The client names the workspace in the `X-Workspace-Id` header. The server never trusts it: every route that touches a workspace calls `require_member(workspace, session user, action)` **in the same database transaction** as the work it guards.
   - Not a member, removed, or an id from another workspace → **404**, with the same body whether or not the workspace or record exists. A member without the right → **403 FORBIDDEN**.
   - Never trust a role, money access, worker link, plan or owner flag sent by a client.
   - Every `/v1` route is registered as `publicRoute`, `sessionRoute` or `memberRoute`, and every `memberRoute` declares its action. A test fails if any `/v1` route is unregistered, or any member route has no action.
   - Never widen scoping or permissions to make something work.
6. **Nothing is inferred.** No default "No work", no automatic payments, no default rates. A worker without a rate agreement can't have paid work recorded; the app asks for the rate instead of using $0 or any preset.
7. **Every write is idempotent.** Each write carries an `operation_id` (UUID) generated on the device or browser and kept through retries. The same ID returns the original result. The same ID with a different payload returns 409. Member routes use `idempotency_keys`; session routes with no workspace use `user_idempotency_keys` through `withUserIdempotency` (built in Phase 1b). New routes include the signed-in user in the request hash.
8. **Honest wording.** Never claim a payment was verified, sent or delivered, and never say "payroll". The one required use is the negative status line "Not bank verified." "Record payment" records a payment already made and must never look like a transfer button. Keep "CrewTally never moves money" on the first screen. Never say "Unlimited"; say "As many projects and workers as you need".
9. **Secrets and logs.** Secrets live only in Replit Secrets. The owner creates each secret value in the Shell (for example `openssl rand -base64 32`) and pastes it into Secrets; never generate a secret value in chat. Never put them in code, logs, error messages or URLs. Logs never contain names, amounts, contact details, email addresses, notes, tokens, codes or references. Log operation IDs, request IDs and statuses only.
10. **Tests.**
    - Never skip, delete, loosen or `.only` a test to get green. Fix the code.
    - Tests run in an isolated Postgres schema created and dropped by the test runner, never against the production database.
    - Every route with an id has a cross-workspace 404 test, and the role matrix test covers every route for every role.
11. **No data deletion** except through account deletion (`delete_user_account`). No reset, purge or truncate scripts that can reach production. (Housekeeping that isn't records is named where it happens: old backup files, and `email_codes` rows older than 24 hours, both in P7's nightly job.)
12. **Expo SDK modules only**, except RevenueCat through Replit's integration (Phase 7). Don't use EAS CLI on Replit. Local notifications only; no push in Release 1. No crash-reporting SDK. React Native has no `aria-*` props: use `accessibilityRole`, `accessibilityLabel` and `accessibilityState`.
13. **Stay in scope.**
    - Don't build suggested extras.
    - No analytics SDKs, ads or AI features. RevenueCat for purchases only.
    - Never put "AI" in any label. Don't use the words "seamless", "magic", "effortless", "unlock" or "empower".
    - Don't build anything in a phase marked for a later phase. Business screens stay behind `BUSINESS_ENABLED=false` until phase B4 and Release 1.1.
14. **Design.**
    - Use the 2.0 design tokens (Home accent `#086b60`, Business accent `#145d67`, deep `#103e37`, background `#f6f8f5`, line `#dce5df`, copper `#a36036`) and their dark-mode values from the design files. Full dark mode.
    - Every status shows a text label and an icon, never color alone.
    - Touch targets are at least 44 pt (44 px on the web).
    - Dynamic Type and VoiceOver on iPhone; keyboard use, visible focus and screen-reader labels on the web. WCAG 2.1 AA.
    - No gradients, glass effects or decorative animation.
15. **Stop at the gate.** Every phase ends at the gate below. Don't start the next phase until I paste it.
16. **Home records are never locked.** Plan limits stop only new projects, reopened projects and new current workers. In a Home workspace, reading, recording work, recording payments for existing workers, receipts, statements, exports and account deletion work on every plan, including after Pro lapses or a Pass is refunded. (A Business workspace becomes read-and-export only after a confirmed expiry, phase B4; even then workers can still confirm receipts and raise payment questions.) Workers and partners never pay. The app never decides its own plan; the server does.
17. **One set of rules on every surface.** iPhone and web call the same API, get the same errors and apply the same rules. A rule enforced only in a client doesn't count.
18. **No demo code ships.** Design-pack demo routes (`demo`, `design`, "Design preview", "Reset sample", "Continue in demo", role switchers, mobile-preview launchers) are never built into the apps or the website. The design pack's prototype JavaScript is a picture of the screens, not code to copy: its money arithmetic uses floats and several of its rules are wrong (see the 2.0 spec, "Prototype behaviours that must not be built").

## The gate (end of every phase)

When the phase is built:

1. Run every suite: `npm run test:db`, `npm run test:server`, `npm run test:mobile`, and from Phase 1c `npm run test:web`. Paste the summary lines showing counts and zero failures.
2. Restart the API, the Expo dev server and (from 1c) the web app. Paste the startup lines that show each running cleanly.
3. Paste the code the phase asks for under "Proof" (not a description of it).
4. List every file you created or changed.
5. List anything not finished, any assumption you made, and anything you think is wrong in the spec.
6. **Stop.** Say "Phase N ready for review" and wait.
