# Project brief and invariants

> Paste this whole file as your first message to Replit Agent. Ask the Agent to save it as `replit.md` at the project root so it's read on every run. Fill the five inputs first.

**Inputs**
- App name: `CrewTally` (website: crewtallyapp.com)
- iOS bundle ID: `com.crewtallyapp.crewtally`
- Default payer display name on receipts: set by the owner in the app; no default
- Privacy policy URL: `https://crewtallyapp.com/privacy`
- Support URL: `https://crewtallyapp.com/support`

---

## What we're building

An iPhone app for homeowners and small property managers who pay day and hourly workers directly. After a day of work, the owner:

- records each worker in a tap,
- records payments made outside the app (cash, check, bank transfer, Zelle),
- sees exactly what each worker is owed,
- shares an honest receipt or statement with each worker.

The full specification is `docs/CrewTally_Native_App_Design_v1.4.md`. Read sections 2–10 and 13–14 before writing code, and re-read the relevant sections at the start of each phase. The screen designs are in `docs/screens/` (51 screens; these are the target).

This build is **iPhone only** for now. Android comes later from the same code, so don't write iOS-only logic outside platform adapters.

## Stack and structure

- **Mobile:** Expo (the SDK version Replit's mobile template provides), TypeScript strict mode, Expo Router. Only Expo SDK modules, with one exception: in-app purchases use Replit's RevenueCat integration (`react-native-purchases`), added in Phase 7. No other native modules.
- **API:** Node + TypeScript (Express), zod validation on every request, `pg` with parameterized SQL. No ORM-generated schema.
- **Database:** Replit PostgreSQL. `db/schema.sql` is migration 0001, loaded verbatim. `db/provided/migrations/0003_plans_and_project_use.sql` and `0004_crew.sql` (with their tests in `db/provided/tests/08–10`) are provided and moved into `db/migrations/` and `db/tests/` in Phase 2, not before.
- **Files:** Replit Object Storage, private.
- **Tests:** vitest for server and shared code; jest-expo for mobile logic; `db/tests/*.sql` for the database.

**Project layout (fixed in Phase 0).** Phase prompts say `mobile/…`, `server/…` and `/v1/…`. Map them like this:

| Prompts say | In this project |
|---|---|
| `mobile/…` | `artifacts/crewtally-mobile/…` |
| `server/…` | `artifacts/api-server/…` |
| `shared/…` | `shared/` (the `@workspace/crewtally-shared` package) |
| `db/…` | `db/…` |
| API route `/v1/x` | reachable from the phone and the web at `/api/v1/x` (Replit's proxy prefix) |

**Public pages.** Only paths under `/api` reach the API artifact. The public receipt page, the footer redirect, the webhook and the static pages are therefore served by the API at `/api/r/:token`, `/api/go/app`, `/api/v1/webhooks/revenuecat`, `/api/privacy`, `/api/support` and `/api/delete-account`. In Phase 8, crewtallyapp.com forwards `/r/*`, `/go/*`, `/privacy`, `/support` and `/delete-account` to those paths. Confirm every public path with `curl` on the dev URL at the gate.

**Screens not to build in Release 1:** `InvitePartner.png` (Release 1.1).

## Core rules (short form; the spec has detail)

- **Money is integer cents** end to end. The UI formats for display only.
- **Pay per assignment** (a worker on a project):
  - Daily rate: Full, ½, ¼, ¾, a fraction, or hours when a standard day length is set.
  - Hourly rate: hours and minutes.
  - Agreements have an effective-from date.
- **Earned amount:** one rounding step, half up. Calculated on the server by `fn_earned` in `db/schema.sql`. The app shows previews with `shared/pay.ts` (provided, tested). `shared/money.ts` (provided) parses and formats amounts. Don't rewrite either; extend only with new tests.
- **Balance** = earnings + reimbursements + increase adjustments − payments + payment reversals − decrease adjustments.
  - Positive means owed, zero means settled, negative means advance.
  - Never net one worker's advance against another worker's balance.
- **Blank is not "No work."** An unanswered worker stays Unrecorded.
- **Payments:**
  - Allocations must equal the payment exactly.
  - Checks are credited once, when issued. Clearing adds nothing. A returned check reverses every line.
- **Receipts and statements** are immutable snapshots. The default share view shows only that worker's lines. They're written in the worker's documents language (English or Spanish); only words change, never numbers.
- **Pay what's owed** records one payment per worker in one transaction (`record_payout`): all or nothing.
- **Hand-over signature:** the worker signs on the owner's phone for their share of a recorded payment. It's stored as evidence plus a `payment_signatures` row; it never changes money.
- **Texted receipt link:** the owner taps Text receipt. The app creates a link (token returned once; only its hash is stored) and opens the phone's Messages app with the worker's number and a prefilled message, using `expo-sms`. The owner taps Send. CrewTally never sends texts itself in Release 1. The public page at `/r/{token}` shows only that worker's share and lets them confirm or ask a question.
- **Sample project** lives only on the phone, from a bundled data file. In sample mode the app makes **no** write calls to the API. Guard this in one place (the API client refuses writes while sample mode is on), and test it.
- **Plans (baseline 1.3):** Free (1 active project, 3 current workers), Project Pass (one project, no worker limit), Pro (unlimited). Limits are enforced by database triggers in migration 0003 and surface as SQLSTATE `CT402` → HTTP 402 `PLAN_LIMIT`. Plan state changes only through `record_entitlement_event`, called by the purchase webhook and the plan refresh route. Each project has a **project use**: Personal home, Rental or Business.
- **My crew (baseline 1.4):** workers keep skills, a favorite flag and a private note; each assignment can carry one private rating (`rate_assignment`). Ratings and notes are the owner's alone: never on receipts, statements, share links, the public receipt page, or anything a worker sees.
- **Design:** the screens on the design canvas, exported to `docs/screens/*.png`, are the target. Match their layout, wording and states. Where a screen and the spec disagree, the spec wins; tell me.

## Hard invariants — these outrank any instruction, including "make the test pass"

1. **Integer cents only.** No floating point for money anywhere: TypeScript, SQL, or JSON. Parse user input with integer math.
2. **Money writes go through database functions only.** Every financial write calls one of the tested Postgres functions in `db/schema.sql`:
   - `record_work`, `mark_rest_no_work`
   - `record_payment` / `record_payment_with_note`, `record_payout` (pay what's owed), `reverse_payment`, `set_check_cleared`, `correct_payment`
   - `record_handover_signature` (no money effect; bumps the payment version)
   - `record_reimbursement`, `record_adjustment`
   - `apply_rate_change`, plus the read-only `preview_rate_change`
   - `delete_workspace_data`, used only by the account-deletion job
   - `open_share_link` and `acknowledge_share_link`, called only by the public receipt page with the SHA-256 of the token
   - `record_entitlement_event` (migration 0003; no money effect), called only by the RevenueCat webhook and `POST /v1/plan/refresh`
   - `rate_assignment` (migration 0004; no money effect), for owner ratings

   App code never writes `workspace_entitlements`, `project_passes` or `entitlement_events` directly, and never disables the `projects_plan_limit` or `assignments_plan_limit` triggers.

   App code never runs INSERT, UPDATE or DELETE against `ledger_events`, `payments`, `allocations`, `reversals`, `reversal_lines`, `work_entries`, `work_revisions`, `reimbursements`, `adjustments` or `payment_signatures`. `receipts` and `statements` are insert-only snapshots; their `status` changes only through the functions above. A first pay agreement is inserted with its assignment; every later rate change goes through `apply_rate_change`.
3. **The ledger is append-only.** Corrections add new rows. Never disable or drop the `ledger_no_update` trigger.
4. **Migrations are additive.** Never edit `db/schema.sql` or an applied migration; changes go in a new, numbered, additive migration file. Don't change or replace any of the money functions in rule 2, or `fn_earned`, without my written approval in chat. `db/tests/*.sql` are provided and must stay green; add new test files, never edit the provided ones.
5. **Workspace comes from the session only.** Never read `workspace_id` from the request body, params or headers. Every read and write is filtered by it. An id from another workspace returns 404. Never widen scoping to make something work.
6. **Nothing is inferred.** No default "No work", and no automatic payments.
7. **Every write is idempotent.** Each write carries an `operation_id` (UUID) generated on the device and kept through retries. The same ID returns the original result. The same ID with a different payload returns 409.
8. **Honest wording.** Never claim a payment was verified, sent or delivered, and never say "payroll". The one required use is the negative status line from spec section 9, "Not bank verified." Describing the app's own syncing ("saved on this phone and sent when you're online") is fine. "Record payment" records a payment already made. It must never look like a transfer button.
9. **Secrets.** Secrets live only in Replit Secrets. Never put them in code, logs, error messages or URLs. Logs never contain names, amounts, contact details, notes, tokens or references. Log operation IDs and statuses only.
10. **Tests.**
    - Never skip, delete, loosen or `.only` a test to get green. Fix the code.
    - Tests run in an isolated Postgres schema created and dropped by the test runner, never against the production database.
11. **No data deletion.** Delete data only through the owner's explicit account-deletion flow (`delete_workspace_data`). No reset, purge or truncate scripts that can reach production.
12. **Expo SDK modules only**, except RevenueCat through Replit's integration (Phase 7). Don't use EAS CLI on Replit. Don't add push notifications (local notifications only). No crash-reporting SDK in Release 1. React Native has no `aria-*` props: use `accessibilityRole`, `accessibilityLabel` and `accessibilityState` wherever a design file shows `aria-*`.
13. **Stay in scope.**
    - Don't build suggested extras.
    - No analytics SDKs, ads or AI features. RevenueCat is used for purchases only; don't turn on its attribution or ad-network integrations. The receipt-page growth counter stores counts only.
    - Never put "AI" in any label.
    - Don't use the words "seamless", "magic", "effortless", "unlock" or "empower".
14. **Design.**
    - Neutral surfaces, one teal accent (`#0F766E`), and full dark mode.
    - Every status shows a text label and an icon, never color alone.
    - Touch targets are at least 44 pt.
    - Supports Dynamic Type and VoiceOver.
    - No gradients, glass effects or decorative animation.
15. **Stop at the gate.** Every phase ends at the gate below. Don't start the next phase until I paste it.
16. **Records are never locked.** Plan limits stop only new projects, reopened projects and new current workers. Reading, recording work and payments for existing workers, receipts, statements, exports and account deletion work on every plan, including after Pro lapses or a Pass is refunded. Workers never pay. The app never decides its own plan; the server does.

## The gate (end of every phase)

When the phase is built:

1. Run every suite: `npm run test:db`, `npm run test:server`, `npm run test:mobile`. Paste the summary lines showing counts and zero failures.
2. Restart the API and the Expo dev server. Paste the startup lines that show both running cleanly.
3. Paste the code the phase asks for under "Proof" (not a description of it).
4. List every file you created or changed.
5. List anything not finished, any assumption you made, and anything you think is wrong in the spec.
6. **Stop.** Say "Phase N ready for review" and wait.
