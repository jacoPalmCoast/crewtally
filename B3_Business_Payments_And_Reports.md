# Phase B3 — Business payments, receipts and reports (Release 1.1)

> **Before pasting:**
> 1. Phase B2 passed its gate. `BUSINESS_ENABLED` is still `false`; `BUSINESS_DEV_ACCESS=true` with `APP_ENV=development`.
> 2. Push the current code to GitHub.

## Goal

Business pays workers the same honest way Home does. Every 1.4 payment safeguard applies, through the same database functions:

- payments with **explicit allocation lines, worker × job**, chosen by the person recording. Never "the worker's current job";
- every method (Cash, Check, Bank transfer, Zelle, Other with a description), check number, check cleared and **check returned**, split across workers and jobs, full and partial reversals, corrections, duplicate warning, evidence;
- Business receipts as immutable snapshots, in English or Spanish, numbered with the workspace's one receipt sequence (`R-000123`);
- worker balances across jobs, job labour-cost reports where **moving crew between jobs never moves past costs**, and Business reports;
- exports scoped by role: money exports for roles with `export`; a **work-only export** for an admin without money access, a crew lead (their jobs) and a worker (their own rows).

There's **no migration** in this phase. Payments, reversals, corrections, clearance and receipts use the 0001 functions and the P4–P6 routes unchanged. Nothing in invariant 2, `fn_earned`, `role_can` or `require_member` changes.

**Receipt numbering decision (BR- vs R-).** The Business prototype numbers receipts `BR-101`. Baseline 2.0 uses the workspace's `receipt_seq` everywhere: Business receipts are `R-000123`, the same format as Home, on iPhone, the web, PDFs, links and exports. Don't build a `BR-` prefix or a second sequence.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: §14 Business workspace (payments, receipts, reports), §11 Money rules (keep / adopt / must not build), §5 Roles and permissions, §12 Web app (payments, receipts, exports), §16 API surface.
- `docs/CrewTally_Native_App_Design_v1.4.md`: payment form, allocations, checks, reversals, corrections, duplicate warning, receipts, statuses and wording (the money reference wherever 2.0 doesn't change it).
- `db/schema.sql`: `record_payment`, `record_payment_with_note`, `reverse_payment`, `set_check_cleared`, `correct_payment`, `assignment_totals`, `worker_year_paid`.
- Your P4 payment routes and screens, P5 ledger, history and CSV writer, P6 receipt snapshots, share links, evidence and PDF templates; the B1 shaper and scope; B2 `worker_money`.
- `docs/SCREEN-COVERAGE-2.0.csv`: rows with `build_phase = B3` (9 mobile), plus `BJobCosts` (B1) and the P4–P6 web rows whose roles include Owner or Admin (financial): `payments`, `record-payment`, `payment-review`, `payment-saved`, `receipt`, `share-receipt`, `reports`, `statement`.
- Screens: `docs/screens-2.0/mobile/` `BBalances`, `BWorkerBalance`, `BPayment`, `BPaymentReview`, `BPaymentSaved`, `BReceipt`, `BShareReceipt`, `BReports`, `BDuplicatePayment`, `BJobCosts`; web `payments`, `record-payment`, `payment-review`, `payment-saved`, `receipt`, `share-receipt`, `reports`.

## Must-not-build items in this phase (spec §11)
| # | Prototype behaviour | How this phase stops it | Test |
|---|---|---|---|
| 6 | Business and web totals not rounded per entry | Every total is a sum of ledger rows; earnings came from `fn_earned` per entry | `reports_tie_to_ledger` |
| 8 | Totals add signed balances, so one worker's advance hides another's amount owed | "Owed" sums positive worker balances; "Paid in advance" is a separate total | `business_totals_never_net_advances` |
| 9 | Adjustments shown as expenses; returned money hidden inside payments | Reimbursements, adjustments, payments and reversals are separate lines on balances, job costs, reports and exports | `business_balance_lines_are_separate` |
| 10 | A split recorded as separate payments with method "Via <recipient>" | One payment, one receipt number, several allocation lines (`record_payment`) | `split_is_one_payment` |
| 11 | Crew payments forced to Cash at the full balance | "Full balance" only fills editable lines; method is always chosen. Business 1.1 has no bulk "pay what's owed" screen | `full_balance_is_editable` (mobile, web) |
| 12 | No returned-check action | **Check returned** = `reverse_payment(CHECK_RETURNED)`, reversing every line | `returned_check_reverses_all_lines` |
| 13 | No way to correct or reverse a payment | Full and partial reversal per line; correction = reverse + new payment in one transaction; old receipt Superseded | `business_reversal_and_correction` |
| 14 | Payments recorded offline | Record, reverse, correct, clear and return need a connection; a local draft is fine and never touches a balance | mobile `payments_never_queue` |
| 16 | A Business payment tied to the worker's current job | The request must carry allocation lines with `assignment_id` (worker × job). No default, no "current job" | `allocation_lines_required`, `reassign_never_moves_past_costs` |
| 17 | Web receipts rendered live and numbered with the internal payment id | Every surface renders the stored snapshot and shows `R-000123` | `receipt_is_snapshot_everywhere` |
| 18 | CSV that doesn't neutralise formulas, or turns negative money into text | One server CSV writer: text cells neutralised, money written as plain numbers (a credit is `-50.00`) | `csv_safe_and_numeric` |

## Build

### 1. Server

Payments in a Business workspace use the **same routes as Home** (P4–P6). **This phase replaces the interim `kinds: ['HOME']` rule (spec section 5.4) for the P4–P6 payment, evidence, receipt, link, statement and question routes and the P5 money and export routes:** widen their `kinds` to `['HOME','BUSINESS']` in the same change that adds the B1 scope and shaper to them. This phase adds the Business rules on top, plus read routes for balances, job costs, reports and exports. Payments need `money.record` (owner, admin with money access); reading money needs `money.view`. Admins without money access, leads and workers get 403 on every money route; workers read their own money only through B2's `/v1/my/…` routes.

**Payments (P4 routes, Business rules):**

| Route | Action | Business rules |
|---|---|---|
| `POST /v1/payments` | `money.record` | Body as P4: `{payment_date, method, method_note?, amount_minor, recipient_label, reference?, note?, allocations: [{assignment_id, amount_minor}], duplicate_confirmed?, operation_id}`. **`allocations` is required, 1–50 lines, every line names an `assignment_id`** (zod; a missing or empty list → 400 `ALLOCATIONS_REQUIRED`). The sum must equal the amount exactly (the function checks too). An assignment may be **ended** (paying for past work on a job the worker has left is normal). Lines may span several workers and several jobs: it's still one payment and one receipt number. `CHECK` stores the check number in `reference`, with the same rule as P4. `OTHER` needs `method_note`. Calls `record_payment_with_note`. |
| `POST /v1/payments/duplicate-check` | `money.record` | P4 rule: same date, amount, method and reference. Business returns the matching payments' receipt number, date, amount, method, reference and worker names, so the screen can show them. |
| `GET /v1/payments`, `GET /v1/payments/:id` | `money.view` | Adds `job_name` to each allocation line. |
| `POST /v1/payments/:id/clearance` | `money.record` | P4 body `{status: CLEARED|RETURNED, expected_version, reason?, operation_id}`. CLEARED → `set_check_cleared` (no balance change). RETURNED → `reverse_payment` with `CHECK_RETURNED`, reversing every line (worker × job); reason required. |
| `POST /v1/payments/:id/reversals` | `money.record` | P4 body `{kind: FULL|PARTIAL, lines?, reason, expected_version, operation_id}` → `reverse_payment`. `PARTIAL` lines name allocation ids (worker × job). The reversal date comes from the P4 helper, never from the client. Reason required. |
| `POST /v1/payments/:id/correct` | `money.record` | `correct_payment`: reverse the old payment and record the new one in one transaction; the old receipt becomes Superseded. The new payment's allocations are explicit lines, like any payment. |
| `POST /v1/evidence`, `GET /v1/evidence/:id/content` | `money.record` / `money.view` | P4 rules, as checked in P6 (owner-side only, never on links or worker views). |
| `POST /v1/receipts`, `GET /v1/receipts/:id?view=WORKER&worker_id=…|FULL` | `money.record` / `money.view` | P6 snapshot, Business additions below. |
| `POST /v1/links`, `DELETE /v1/links/:id` | `money.record` | P6 texted or shared receipt link, WORKER view only for a named worker, in the chosen language. |
| `POST /v1/statements`, `GET /v1/statements/:id` | `money.record` / `money.view` | P6 statements work in Business; lines show the job per entry. |

Home payments behave exactly as before. A Home test run proves it.

**Business receipt snapshot** (extend the P6 snapshot builder; the snapshot type grows, old snapshots stay readable):
- `payer_display_name` from `business_settings` ("Paid by Rivera Builders"), and `workspace_kind: "BUSINESS"`.
- Each allocation line carries `worker_id`, `worker_name`, `job_name` (never `client_name`, address or budget: client details stay private to the business), `amount_minor`.
- Method, check number for checks, clearance status, reversal and supersede status and the honest status lines from 1.4 ("Not bank verified." and the method lines). Never "paid", "sent" or "verified" as a claim CrewTally makes.
- The WORKER view shows only that worker's lines and total, in their `document_language` (English or Spanish, D13). The FULL view goes only to roles with `money.view`.
- Number: `R-` + `receipt_no` zero-padded to 6. The same string on screen, PDF, link page and export.

**Balances, job costs, reports:**

| Route | Action | What it returns |
|---|---|---|
| `GET /v1/balances?group=worker` | `money.view` | Per worker: balance across their jobs, with **Owed** (sum of positive worker balances) and **Paid in advance** (sum of negative worker balances) as two workspace totals. Pending work is never included (it isn't in the ledger). |
| `GET /v1/workers/:id/balance` (P5 route, widened) | `money.view` | One worker: one line per assignment (job name, active or ended, approved earnings, reimbursements, adjustments added, adjustments taken off, payments, reversals, balance), and the worker total. These lines are what the payment form allocates against. |
| `GET /v1/jobs/:id/costs?from=&to=` | `money.view` | B1 route, now with: one line per assignment on this job (including ended ones), approved earnings, reimbursements, adjustments, payments allocated to this job, reversals of those allocations, owed and paid in advance (separately), budget and "approved labour vs budget". Optional date range by ledger `effective_date`. |
| `GET /v1/reports/business?from=&to=` **B** | `money.view` | Workspace totals (approved earnings, reimbursements, adjustments, payments, reversals, owed, paid in advance), one row per job and per worker, and **waiting for approval: count and hours** (never money). |
| `GET /v1/reports/year-totals?year=` | `money.view` | P5 route; Business jobs count as business work (`project_use = BUSINESS`, set by the B1 trigger). |

All money totals come from `ledger_events` joined to `assignments` (job = `assignments.project_id`). An assignment never moves to another worker or job (0004 trigger), so a payment allocated to the Kitchen assignment stays a Kitchen cost forever, whatever happens to the crew later.

**Exports** (one server CSV writer for every surface; text cells that start with `=`, `+`, `-`, `@`, tab or carriage return get a leading `'`; money cells are written as plain numbers from cents with integer math, e.g. `-50.00`, `1245.50`, `0.07`, and are never prefixed):

| Route | Action | Scope | Columns |
|---|---|---|---|
| `POST /v1/exports` `{kind: LEDGER|WORK|PAYMENTS|JOB_COSTS|WORKER_BALANCES, filters}` | `export` (owner, admin with money) | whole workspace | P5 kinds with a `job` column added; `JOB_COSTS` = the job cost lines; `WORKER_BALANCES` = per worker and per job lines. |
| `POST /v1/exports/work` `{project_id?, worker_id?, from, to}` **B** | `workspace.read` | admin without money: all jobs; lead: jobs they lead; worker: own rows; owner and admin with money may use it too | date, job, worker, hours (`h:mm`) or `No work`, state (Approved, Waiting for approval, Returned), submitted by, approved by, note. **No money columns for anyone**, no rates, no client details. |

`role_can('export')` is money-only, so the work-only export is a separate route declared `workspace.read` with the B1 scope. The `money_key_scanner` checks its CSV header for every role.

### 2. Mobile (owner and admin with money access)

Money screens appear only when `can['money.view']`. Admins without money access, leads and workers never see them.
- `BBalances`: one row per worker with the balance across jobs ("Owed $X" or "Paid in advance $Y", text plus icon), the two workspace totals separately. Pending hours as a note: "3 entries waiting for approval aren't included."
- `BWorkerBalance`: the worker's lines per job (active and ended), each with earnings, payments and balance; the worker total; **Record payment**; payment history; receipts.
- `BPayment` (Record payment): the amount field starts **blank**. Method: Cash, Check (asks for the check number), Bank transfer, Zelle, Other (description required). Date (defaults to today in the job's time zone, editable). **Paid to**: one worker, or **Split** to add more workers. For each worker, the form lists their jobs with balances; the person types an amount on each line they're paying. **Full balance** fills each line with that line's positive balance; the lines stay editable, and nothing is ever filled on a job the person didn't see. The total of the lines must equal the amount ("Lines add up to $X. The payment is $Y."). Overpaying shows "This will be a credit (paid in advance) of $Z." Optional reference and note; **Attach evidence**. Offline: "Recording a payment needs a connection." with **Save draft** (local only, no balance change).
- `BDuplicatePayment`: after the duplicate check, shows the matching payment(s) (receipt number, date, amount, method, reference, workers). **This is a different payment** (sends again with `duplicate_confirmed: true`, as P4 does) or **Keep the existing record**.
- `BPaymentReview`: each line (worker, job, amount), method, date, balance before and after per worker, and the unticked check "<Method-specific 1.4 wording, e.g. 'I have already handed over this cash.'>". **Record payment** stays disabled until it's ticked. The button never looks like a transfer button.
- `BPaymentSaved`: receipt number, each worker's new balance, **View receipt**, **Share with <worker>**.
- Payment detail (P4 screen in Business colours): lines with jobs, status, **Mark check cleared**, **Check returned**, **Reverse** (full or per line, reason required), **Correct** (opens the payment form prefilled; reason required), evidence. All need a connection.
- `BReceipt`: the FULL snapshot: number `R-000123`, "Paid by <business>", each worker × job line, method, check number and status, the honest status line, evidence thumbnails (owner-side only).
- `BShareReceipt`: pick the worker on the payment, language (defaults to the worker's documents language; English · Español), **Text a link** (P6 `/v1/links` and Messages) or **Share PDF** (WORKER view only). "They'll see only their own part of this payment."
- `BReports`: date range, workspace totals (separate lines for earnings, reimbursements, adjustments, payments, reversals, owed, paid in advance), per job and per worker tables, waiting-for-approval hours, **Export CSV** (kinds above), **Year totals**.
- `BJobCosts` (from B1): now with payments and reversals per line, date range, budget comparison, **Export**.
- Admins without money access, leads and workers: **More → Export my work** (or **Export work** for the admin) calls `/v1/exports/work`. No money.

### 3. Web (owner and admin with money access)

The P4–P6 pages in a Business workspace, with the same rules as iPhone:
- `payments`: worker balances with Owed and Paid in advance separate; payment list with receipt numbers, methods, statuses.
- `record-payment` → `payment-review` → `payment-saved`: every method including Check (number) and Zelle; Other needs a description; **split across workers and jobs** with one line per worker × job; **Full balance** fills editable lines; lines must add up; duplicate warning shows the matching payments; outside-payment checkbox; evidence upload; blocked offline ("Needs a connection"; no drafts on the web, as in P4). Money inputs are text parsed with integer math.
- Payment detail: mark cleared, check returned, reverse (full or per line), correct. Reason required.
- `receipt`, `share-receipt`: render the stored snapshot (never live data), `R-000123`, English or Spanish, WORKER view for sharing.
- `reports`: Business report, job costs, worker balances, year totals, exports. CSV comes from the server.
- Admin without money access, lead, worker: an **Export work** button on History calls `/v1/exports/work`.

### 4. Tests

**Role matrix additions** (B1 fixtures: O, A$, A, L1 on J1, W1 bound to R1, R2 on J2):

| Route | O | A$ | A | L1 | W1 | Home organizer | Removed / outsider |
|---|---|---|---|---|---|---|---|
| `POST /v1/payments` (and reversals, correct, clearance, links, evidence upload) | 201 | 201 | 403 | 403 | 403 | Home 201 | 404 |
| `GET /v1/payments`, `/:id`, `GET /v1/receipts/:id` | 200 | 200 | 403 | 403 | 403 (uses `/v1/my/receipts`) | Home 200 | 404 |
| `GET /v1/balances?group=worker` | 200 | 200 | 403 | 403 | 403 | Home 200 | 404 |
| `GET /v1/workers/:id/balance` | 200 | 200 | 403 | 403 | 403 | Home 200 | 404 |
| `GET /v1/jobs/:id/costs` | 200 | 200 | 403 | 403 | 403 | 404 | 404 |
| `GET /v1/reports/business` | 200 | 200 | 403 | 403 | 403 | 404 | 404 |
| `POST /v1/exports` | 200 | 200 | 403 | 403 | 403 | Home 200 | 404 |
| `POST /v1/exports/work` | 200 all | 200 all | 200 all, no money | 200 J1 rows only | 200 own rows only | 404 | 404 |
| `POST /v1/exports/work` with `project_id=J2` | 200 | 200 | 200 | 404 | 404 | — | 404 |

Every id route gets a cross-workspace 404 test; every allocation line pointing at another workspace's assignment → the standard 404 (not 400, so ids don't leak).

**Money tests (server):**
- `allocation_lines_required`: a payment without `allocations` → 400; there's no code path that picks a job for the caller (grep test for any default-assignment helper in the payment route).
- `split_is_one_payment`: $500 split as Dee/Kitchen $300 + Dee/Deck $100 + Luis/Deck $100 → one `payments` row, one receipt number, three `allocations`, three `PAYMENT` ledger rows.
- `reassign_never_moves_past_costs`: Dee on Kitchen (assignment a1) approved 8 h at $30 = $240 and paid $240 allocated to a1. End a1; assign Dee to Deck (a2); approve 8 h on Deck. Kitchen costs: earnings 24000, payments 24000, owed 0. Deck: earnings 24000, owed 24000. Then pay $100 allocated to a1 (old job): Kitchen shows the $100 as paid in advance on Kitchen; Deck still shows 24000 owed. Rename Dee and archive Kitchen: none of Kitchen's numbers change.
- `returned_check_reverses_all_lines`: a split check, then Check returned → every line reversed, receipt status Reversed, balances back.
- `business_reversal_and_correction`: partial reversal of one line; then correct the payment (different jobs) → old receipt Superseded, new receipt number, ledger ties.
- `business_totals_never_net_advances`: one worker owed $300, another paid $100 in advance → Owed 30000, Paid in advance 10000.
- `business_balance_lines_are_separate`: a reimbursement and an adjustment (seeded through their functions) show as their own lines in balances, job costs, reports and exports.
- `reports_tie_to_ledger`: for random seeded data, every report total equals the matching `sum(signed_delta)`; per-job totals add up to the workspace totals.
- `receipt_is_snapshot_everywhere`: record a payment, rename the worker and the job, fetch the receipt on the API, the link page and the PDF data: old names and `R-000123` everywhere; WORKER view has only that worker's lines; Spanish view uses the Spanish template; `client_name` never appears.
- `csv_safe_and_numeric`: a worker named `=HYPERLINK("x")` exports as `'=HYPERLINK("x")`; a credit exports as `-50.00` (no quote); `0.07` and `1245.50` exact.
- Duplicate: same date, amount, method and reference → the check returns the match; with `duplicate_confirmed` and a new operation id → a second payment; the same operation id replayed → the original result, no second payment.
- `money_key_scanner` over `/v1/exports/work` for A, L1 and W1: no money columns.
- Home regression: the full P4–P6 test suites pass unchanged.

**Mobile:** `payments_never_queue` (offline: Record, Reverse, Correct, Cleared, Returned are disabled; drafts are local and don't change balances); the amount starts blank; Full balance fills only lines on screen and they stay editable; Record stays disabled until the outside-payment box is ticked; money screens never render for `can['money.view'] = false`.

**Web:** same as mobile, except there are no drafts (nothing stored in the browser); money inputs parse with integer math; the receipt page renders from the snapshot (test by changing the worker's name after recording).

## Proof to paste at the gate
- The payment route's zod schema showing `allocations` required with `assignment_id` on every line.
- The Business additions to the receipt snapshot builder and the snapshot TypeScript type.
- The job cost query and the `reassign_never_moves_past_costs` test with its output.
- The CSV writer (text neutralising and money formatting) and its tests.
- The `/v1/exports/work` route with its scope and column list.
- The role matrix additions and their pass count.
- Test file names and counts for all suites.

## Try it on your phone (Expo Go, dev sign-in)
Use Rivera Builders from B1–B2 (Dee has approved hours on Kitchen).
1. As **owner-a**: Team → Dee → Balance. One line for Kitchen with what's owed.
2. Record payment → amount blank → $300, Check, number 1043 → Split: add Luis. Dee/Kitchen $200, Luis/Deck $100. Review shows each line and before/after balances. Tick the box, Record. One receipt `R-0000xx`.
3. Open the receipt: "Paid by Rivera Builders", both lines with job names, "Not bank verified." Share with Dee in Español: the preview shows only Dee's $200 line, in Spanish.
4. Record the same payment again: the duplicate warning shows the first one. Keep the existing record.
5. Payment detail → Check returned → reason "Bounced". Both lines are reversed; balances go back; the receipt says Reversed.
6. Record $240 cash to Dee on Kitchen. Then Assign crew: end Dee on Kitchen, add Dee to Deck. Kitchen's Labour costs don't change. Deck shows nothing for Dee until new work is approved there.
7. Reports → this month → Export CSV → open it in Numbers: amounts are numbers, a credit shows as a negative number.
8. As **member-d** (admin without money): there's no Balances or Reports; More → Export work gives a CSV with hours and no money.
9. As **member-e** (lead): Export my work has only Kitchen and Deck rows.
10. Airplane mode as owner-a: Record payment is disabled; Save draft works and the balance doesn't change.

## Try it on the web
1. As **owner-a**: Payments → Record payment → split across two workers and two jobs, Zelle. Same receipt number format as the phone.
2. Rename Dee. Open the old receipt: it still shows the old name.
3. Reverse one line of a split payment with a reason. Balances update; the receipt shows Superseded or Reversed as 1.4 says.
4. As **member-d**: Payments isn't in the sidebar; History → Export work works with no money columns.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase B3 ready for review".
