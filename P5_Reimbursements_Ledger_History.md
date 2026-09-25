# Phase 5 — Reimbursements, adjustments, ledger, history, CSV export

## Goal

Everything that explains a balance. The owner can:
- pay a worker back for materials,
- add opening balances, bonuses, overtime or deductions,
- see a worker's full activity,
- read the ledger with running balances,
- correct past days from history,
- export CSV.

## Read first
- Spec section 6 (work history, ledger) and section 8 (reimbursements, adjustments).
- `db/schema.sql`: `record_reimbursement`, `record_adjustment` and `ledger_events`.
- `db/tests/04_reimb_adj_rest_rates.sql`, especially the reconciliation query at the end. You'll reuse it in Phase 7.

## Build

### API
- `POST /v1/reimbursements` takes `{operation_id, assignment_id, date, amount_minor, description}` and calls `record_reimbursement`.
- `POST /v1/adjustments` takes `{operation_id, assignment_id, date, direction: INCREASE_OWED|DECREASE_OWED, category: OPENING_BALANCE|BONUS|OVERTIME|DEDUCTION|OTHER, amount_minor, reason}` and calls `record_adjustment`.
- `GET /v1/workers/:id/activity?project_id=&cursor=` returns one merged, paged list per worker, newest first.
  - Row types: work (date, input description such as "½ day" or "7 h 30 m", rate, earned, corrected flag), reimbursement, adjustment (category, reason), payment (receipt number, method, allocated amount), and reversal.
  - Each row has a `signed_minor` effect on the balance.
  - Build it from `ledger_events` joined to its sources, so it always ties to the balance.
- `GET /v1/ledger?project_id=&worker_id=&from=&to=&cursor=` returns:
  - `opening_minor`: the sum of events before `from` for the filter.
  - `rows`: date, type, source label, increase, decrease, running balance. Sorted by `effective_date`, then `seq`.
  - `closing_minor`.
  - `is_filtered`, so the UI labels filtered totals.
  - Page with a keyset cursor on (`effective_date`, `seq`). The running balance must be correct across pages: carry the running figure forward in the cursor, or compute it with a window function over the filtered set.
- `GET /v1/work?project_id=&worker_id=&from=&to=&state=RECORDED|UNRECORDED|CORRECTED&cursor=` returns work history. UNRECORDED lists **work days** in the range with no entry (or a VOID entry) for each assignment active that day. Use `generate_series` over dates, and join to the project's `work_days`.
- `GET /v1/work/:assignmentId/:date/revisions` returns every revision with mode, input, rate snapshot, earned, reason and time.
- `POST /v1/exports` takes `{kind: LEDGER|WORK|PAYMENTS, filters}` and returns a CSV file.
  - Stream it; don't build it in memory for large sets.
  - Columns match the screens.
  - Amounts are written as decimal strings from integer cents, like `240.00`, never floats.
  - The first row is headers. The file name is `workpay_<kind>_<from>_<to>.csv`.
- Isolation on every route.

### Mobile
- **Worker detail** (per `docs/screens/WorkerDetail.png`):
  - Recent activity uses `/activity`, with infinite scroll.
  - Actions:
    - **Record payment**
    - **Statement** (Phase 6; show disabled with "Available in the next update" until then)
    - **Reimburse**: amount, date, description (required), and photo (Phase 6)
    - ⋯ → **Adjust balance**: direction phrased as "Add to what's owed" / "Take off what's owed", category, amount, date, reason (required)
    - ⋯ → **Opening balance**: shortcut to an adjustment with category OPENING_BALANCE, shown on first setup and in the ⋯ menu
- **Ledger** (More → Ledger):
  - Filters for project, worker and date range.
  - Opening balance at the top, rows with running balance, closing at the bottom.
  - When filtered, a label: "Filtered view. Totals cover this filter only."
  - An **Export CSV** button that shares the file through the share sheet (`expo-sharing`).
- **Work history** (More → Work history):
  - Filters, including Unrecorded.
  - Tap a row to see a detail sheet with revision history, plus **Correct** (opens the same entry controls as Today, then asks for a reason) and **Clear entry** (void, with reason).
- **Balance explanation:** on worker detail, tapping the balance opens a breakdown:
  - earnings
  - + reimbursements
  - + added to owed
  - − payments
  - + reversed payments
  - − taken off owed
  - = balance

  Every line comes from the server, and the total must equal the balance. If it doesn't, show "Needs review" and log a reconciliation error; never hide it.

### Tests
- **Server:**
  - A reimbursement increases the balance and appears in activity as its own type, and never in earnings totals (T21).
  - Adjustments both ways. Reason and description are required (422).
  - Ledger: opening + sum of rows = closing for a filter (T34). Running balance is correct across a page boundary: create 120 events and page by 50.
  - Work history UNRECORDED lists only work days, only for active assignments, and excludes VOID-then-rerecorded dates correctly.
  - CSV: amounts are formatted from cents with no float artifacts. Check 0.07 and 1,245.50 as `0.07` and `1245.50`. The headers are present. A cross-workspace filter id returns 404.
  - Balance breakdown lines sum to the balance for a worker with every event type.
  - Isolation on every new route.
- **Mobile:** the balance breakdown renders, and shows "Needs review" when the lines don't sum.

## Additions in baseline 1.2 (build these in this phase)

### Project summary (`docs/screens/ProjectSummary.png`)
- `GET /v1/projects/:id/summary` returns:
  - to-date totals from the `assignment_totals` view, summed for the project;
  - `weekly`: labor earned per Monday–Sunday week in the project timezone, from work revisions or ledger EARNING and EARNING_CORRECTION events by `effective_date`;
  - `workers`: earned, paid and owed per worker.
- The server asserts that earned + reimbursed + added − taken off − paid + reversed = owed. On a mismatch it returns 500 `RECONCILIATION_MISMATCH` (same rule as statements).
- The screen shows the totals block with the equation written out, and weeks as a bar list with the amounts written beside each bar. The bar length is decoration only; the amount is the information. It also shows the per-worker table, plus **Pay what's owed** and **Export CSV**.
- Open it from the Today owed total and from Projects.

### Year-end totals (`docs/screens/YearTotals.png`)
- `GET /v1/reports/year-totals?year=2026` returns, per worker across all projects: net paid (from the `worker_year_paid` view), earned and reimbursed.
- The screen has a year picker, one row per worker and the total. Footer text: "A record of what you paid. It isn't tax advice." **Export CSV** gives `crewtally_year_totals_2026.csv`.

### Tests
- Summary totals equal the sum of balances. Weekly buckets respect the timezone: a Sunday 11 pm entry in New York belongs to that week (T44).
- Year totals: a payment reversed in the same year nets to zero; a payment in December 2026 reversed in January 2027 shows in both years with opposite signs (T47).
- Isolation: another owner's project id on summary returns 404.

## Proof to paste at the gate
- The ledger SQL, including the running balance and pagination.
- The UNRECORDED `generate_series` query.
- The CSV amount formatter.

## Try it on your phone
- Reimburse Worker A $40.00 for "Drywall screws". The balance goes up $40, and the breakdown shows it under reimbursements.
- Add an opening balance of $500 for Worker B.
- Ledger for Worker A over the last 30 days: opening + rows = closing.
- Work history → Unrecorded shows the days you skipped. Open one and record it.
- Export the ledger CSV and open it in Numbers.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 5 ready for review".
