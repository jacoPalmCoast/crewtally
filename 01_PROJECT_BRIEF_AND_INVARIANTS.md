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

The full specification is `docs/CrewTally_Native_App_Design_v1.2.md`. Read sections 2–10 and 13–14 before writing code, and re-read the relevant sections at the start of each phase. The screen designs are in `docs/screens/` (45 screens; these are the target).

This build is **iPhone only** for now. Android comes later from the same code, so don't write iOS-only logic outside platform adapters.

## Stack and structure

- **Mobile:** Expo (the SDK version Replit's mobile template provides), TypeScript strict mode, Expo Router. Only Expo SDK modules — no other native modules.
- **API:** Node + TypeScript (Express), zod validation on every request, `pg` with parameterized SQL. No ORM-generated schema.
- **Database:** Replit PostgreSQL. `db/schema.sql` is migration 0001, loaded verbatim.
- **Files:** Replit Object Storage, private.
- **Tests:** vitest for server and shared code; jest-expo for mobile logic; `db/tests/*.sql` for the database.

If Replit's mobile template already creates a structure, keep it and map these modules onto it. Otherwise use:

```
/mobile      Expo app (app/ routes, components/, features/, lib/, theme/)
/server      API (src/routes, src/db, src/auth, src/lib), tests in server/test
/shared      money + pay calculation + types + zod schemas used by both sides
/db          schema.sql, migrations/, tests/
/docs        spec and screen designs
```

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

   App code never runs INSERT, UPDATE or DELETE against `ledger_events`, `payments`, `allocations`, `reversals`, `reversal_lines`, `work_entries`, `work_revisions`, `reimbursements`, `adjustments` or `payment_signatures`. `receipts` and `statements` are insert-only snapshots; their `status` changes only through the functions above. A first pay agreement is inserted with its assignment; every later rate change goes through `apply_rate_change`.
3. **The ledger is append-only.** Corrections add new rows. Never disable or drop the `ledger_no_update` trigger.
4. **Migrations are additive.** Never edit `db/schema.sql` or an applied migration; changes go in a new, numbered, additive migration file. Don't change or replace any of the money functions in rule 2, or `fn_earned`, without my written approval in chat. `db/tests/*.sql` are provided and must stay green; add new test files, never edit the provided ones.
5. **Workspace comes from the session only.** Never read `workspace_id` from the request body, params or headers. Every read and write is filtered by it. An id from another workspace returns 404. Never widen scoping to make something work.
6. **Nothing is inferred.** No default "No work", and no automatic payments.
7. **Every write is idempotent.** Each write carries an `operation_id` (UUID) generated on the device and kept through retries. The same ID returns the original result. The same ID with a different payload returns 409.
8. **Honest wording.** Never say "verified", "sent", "delivered", "payroll" or "bank verified". "Record payment" records a payment already made. It must never look like a transfer button.
9. **Secrets.** Secrets live only in Replit Secrets. Never put them in code, logs, error messages or URLs. Logs never contain names, amounts, contact details, notes, tokens or references. Log operation IDs and statuses only.
10. **Tests.**
    - Never skip, delete, loosen or `.only` a test to get green. Fix the code.
    - Tests run in an isolated Postgres schema created and dropped by the test runner, never against the production database.
11. **No data deletion.** Delete data only through the owner's explicit account-deletion flow (`delete_workspace_data`). No reset, purge or truncate scripts that can reach production.
12. **Expo SDK modules only.** Don't use EAS CLI on Replit. Don't add push notifications (local notifications only).
13. **Stay in scope.**
    - Don't build suggested extras.
    - No analytics SDKs, ads or AI features.
    - Never put "AI" in any label.
    - Don't use the words "seamless", "magic", "effortless", "unlock" or "empower".
14. **Design.**
    - Neutral surfaces, one teal accent (`#0F766E`), and full dark mode.
    - Every status shows a text label and an icon, never color alone.
    - Touch targets are at least 44 pt.
    - Supports Dynamic Type and VoiceOver.
    - No gradients, glass effects or decorative animation.
15. **Stop at the gate.** Every phase ends at the gate below. Don't start the next phase until I paste it.

## The gate (end of every phase)

When the phase is built:

1. Run every suite: `npm run test:db`, `npm run test:server`, `npm run test:mobile`. Paste the summary lines showing counts and zero failures.
2. Restart the API and the Expo dev server. Paste the startup lines that show both running cleanly.
3. Paste the code the phase asks for under "Proof" (not a description of it).
4. List every file you created or changed.
5. List anything not finished, any assumption you made, and anything you think is wrong in the spec.
6. **Stop.** Say "Phase N ready for review" and wait.
