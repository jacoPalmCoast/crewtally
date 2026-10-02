# Phase 5 — Expenses owed, adjustments, ledger, history, reports and exports (iPhone and web)

> **Before pasting:** Phase 4 passed its gate. Nothing new to add to Secrets.

## Goal

Everything that explains a balance, on iPhone and on the web, through the same API. A member with money rights can:
- pay a worker back for materials (an **expense owed**, stored as a reimbursement),
- add opening balances, bonuses, overtime or deductions (an **adjustment**),
- see each worker's balance broken into every line, and every entry behind it,
- read the ledger with an opening balance, a running balance and a closing balance,
- filter work history, payments and the ledger by project, worker and date,
- see a project summary and year-end totals with the IRS notes,
- export CSV files that the **server** builds, on both surfaces.

Reimbursements and adjustments are their own types everywhere: in the ledger, the breakdown, history, reports and exports. They are never folded into each other or into payments.

Statements (the dated worker document, mobile `Statement` and web `statement`) need migration 0006, so they're built in Phase 6, together with receipts. In this phase the **Statement** buttons show "Available in the next update" (disabled).

No migration in this phase. Nothing here changes a money function, `fn_earned` or the ledger.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: section 10 "Home screens: changes from 1.4", section 11 "Money rules: keep, adopt, must not build", section 12 "Web app", section 5 "Roles and permissions", section 16 "API surface".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 6 (work history, ledger, project summary, year-end totals), section 7 (balance), section 8 (reimbursements and adjustments). These rules stand.
- `docs/SCREEN-COVERAGE-2.0.csv`, rows with `build_phase` = P5. Read the `rules_and_conflicts` column for each one.
- Screens: `docs/screens-2.0/mobile/` `Reimburse`, `ExpenseReview`, `AdjustBalance`, `AdjustmentReview`, `BalanceBreakdown`, `Ledger`, `YearTotals`; web `docs/screens-2.0/web/desktop/reports.png` (and its mobile and home variants).
- `db/schema.sql`: `record_reimbursement`, `record_adjustment`, `ledger_events`, `assignment_totals`, `worker_year_paid`.
- `db/migrations/0004_plans_and_project_use.sql`: `tax_thresholds`, `year_totals_with_thresholds`.
- `db/tests/04_reimb_adj_rest_rates.sql`, especially the reconciliation query at the end. Phase 7's nightly job reuses it.
- Your own code from Phases 3 and 4: the work history list, the payments list, worker detail and project detail, on both surfaces.

## What the design changed, and what we keep

The 2.0 screens are the layout target. Where they dropped a 1.4 rule, the rule comes back:

| Screen | Design shows | Build |
|---|---|---|
| Reimburse ("Add expense owed") | Amount and description only; date and receipt photo removed | Keep the **date** (defaults to project today) and the optional **photo or PDF**. Keep the review step (`ExpenseReview`, before/change/after). |
| AdjustBalance | Direction, amount, reason; type chips and date removed | Keep the **category** chips (Opening balance, Bonus, Overtime, Deduction, Other) and the **date**. Reason required. Keep the review step (`AdjustmentReview`) and show the category on it. |
| BalanceBreakdown | Work + Expenses − Payments | Show **all six lines** (below). Adjustments and returned money are never hidden inside other lines. |
| Ledger | Per-worker tabs, no running balance, no dates, removed from More | Put **Ledger** back in More. Filters for project, worker and date range. Opening, running and closing balance. The per-worker tabs become the worker's **activity** list (see below). |
| YearTotals | Per project, no tax notes | Keep 1.4: per worker **across all projects**, year stepper, earned and reimbursed columns, the 1099-NEC and household notes. |
| web `reports` | Totals, labour by job, summary CSV | Add date range, project summary, ledger and year-end totals. CSV comes from the server. |

## Must not build (and how each is tested)

From spec section 11, "Prototype behaviours that must not be built", these touch this phase:

| Must not build | Test that proves it |
|---|---|
| Adjustments saved as expenses (reimbursements) | Record an adjustment; it creates an `ADJUSTMENT` ledger event, appears as type `adjustment` in activity and the ledger, and moves `added_minor` or `taken_off_minor` in the breakdown. `reimbursed_minor` doesn't move. |
| Returned money hidden inside payments | Reverse part of a payment; `paid_minor` in the breakdown is unchanged and `reversed_minor` goes up by the reversed amount. Activity shows a separate `reversal` row. |
| One worker's advance netted against another worker's amount owed | Worker A owed $300.00, worker B paid $50.00 in advance on the same project. Project summary, the reports overview and the CSV summary show owed **$300.00** and paid in advance **$50.00**. Never $250.00 (extends T17). |
| Work saved on the phone counted in the balance before the server accepts it | Mobile test: with one pending work op of $120.00, the breakdown total equals the server balance and the pending amount shows on its own line, "+$120.00 waiting to send". |
| Totals added up in a client (rounding drift, float math) | Every total on these screens comes from the API. A lint test fails on `parseFloat`, `toFixed` or `Number(` applied to money fields in `mobile/src` and `web/src`. |
| CSV built in the browser or on the phone | The only export path in both clients is `POST /v1/exports` (component test with the API mocked: the button calls it; no CSV string is assembled in client code). |
| CSV formula injection, and negative money exported as text | CSV encoder tests below: text cells are neutralised, money cells never are. |
| Reimbursement without a date, adjustment without a category or reason | API returns 422 for each missing field. |
| Ledger, history and payments without filters or running balance | Ledger tests T34 and the page-boundary test below; filter tests on `/v1/work` and `/v1/payments`. |
| Year totals per project, without tax notes | T54, T55 and the 80% household test below. |
| A correction without a reason | Correcting from work history without a reason returns 422 (the database already requires it). |

## Build

### 1. Server

All routes are member routes (`memberRoute`, `withMember`, `kinds: ['HOME']` as in Phase 2), so `require_member` runs in the same transaction and every money row gets `recorded_by`. Money is integer cents in and out. Requests are validated with zod.

| Route | Action | What it does |
|---|---|---|
| `POST /v1/reimbursements` | `money.record` | `{operation_id, assignment_id, date, amount_minor, description}`. Calls `record_reimbursement`. Amount 1–5,000,000 cents ($50,000.00). Description 1–200 characters after trimming. Date required. Photos and PDFs are attached after saving (see "Evidence on an expense"). |
| `POST /v1/adjustments` | `money.record` | `{operation_id, assignment_id, date, direction: INCREASE_OWED\|DECREASE_OWED, category: OPENING_BALANCE\|BONUS\|OVERTIME\|DEDUCTION\|OTHER, amount_minor, reason}`. Calls `record_adjustment`. Amount 1–10,000,000 cents ($100,000.00). Reason 1–200 characters. |
| `GET /v1/workers/:id/balance` | `money.view` | The breakdown, per assignment and in total for the worker: `earned_minor`, `reimbursed_minor`, `added_minor`, `paid_minor`, `reversed_minor`, `taken_off_minor`, `balance_minor`, from `assignment_totals`. The server checks earned + reimbursed + added − paid + reversed − taken off = balance for every assignment. If any line doesn't tie, it returns `reconciled: false` for that assignment and logs `RECONCILIATION_MISMATCH` with ids only. It never hides or "fixes" the number. |
| `GET /v1/workers/:id/activity?project_id=&type=&cursor=` | `money.view` | One merged, paged list per worker, newest first, built from `ledger_events` joined to its sources so it always ties to the balance. Row types: `work` (date, input such as "½ day" or "7 h 30 m", rate, earned, corrected flag), `reimbursement` (description, has evidence), `adjustment` (category, reason), `payment` (receipt number `R-000123`, method, this worker's allocated amount), `reversal` (kind, reason). Each row has `signed_minor`. `type` filters to one row type (the design's tabs: All, Work, Expenses, Adjustments, Payments; reversals show under Payments). |
| `GET /v1/ledger?project_id=&worker_id=&from=&to=&cursor=` | `money.view` | `opening_minor` (sum of events before `from` for the filter), `rows` (date, type, source label, increase, decrease, running balance), `closing_minor`, `is_filtered`. Sorted by `effective_date`, then `seq`. Keyset cursor on (`effective_date`, `seq`). The running balance is right across pages: carry it in the cursor, or use a window function over the filtered set. |
| `GET /v1/work?project_id=&worker_id=&from=&to=&state=RECORDED\|UNRECORDED\|CORRECTED&cursor=` | `workspace.read` | Phase 3 built it with these filters; amounts only with `money.view`. Don't rebuild it: check it, and add the `WORK` export below. UNRECORDED lists **work days** in the range with no entry (or a VOID entry) for each assignment active that day: `generate_series` over the dates, joined to the project's `work_days`. Never a $0 row. |
| `GET /v1/work/:assignmentId/:date/revisions` | `workspace.read` | Phase 3 route. Every revision: mode, input, rate snapshot and earned (with `money.view`), reason, time and `recorded_by_name` (see "Who recorded it" below). |
| `GET /v1/payments?project_id=&worker_id=&from=&to=&method=&status=&cursor=` | `money.view` | The Phase 4 payments list with these filters added. Each row: receipt number, date, method, amount, status (Recorded, Partly reversed, Reversed, Corrected, Check not cleared). Filtering by worker shows that worker's allocated amount and the payment total. |
| `GET /v1/projects/:id/summary` | `money.view` | To-date totals for the project from `assignment_totals`; `weekly` (labour earned per Monday–Sunday week in the project time zone, from `EARNING` and `EARNING_CORRECTION` events by `effective_date`); `workers` (earned, paid, balance per worker). Totals include `owed_minor` = sum of **positive** balances and `advance_minor` = sum of **negative** balances as a positive number. The server checks earned + reimbursed + added − taken off − paid + reversed = owed − advance; on a mismatch, 500 `RECONCILIATION_MISMATCH`. |
| `GET /v1/reports/overview?from=&to=` | `money.view` | For the web reports page: per project and per worker, earned, reimbursed, added, taken off, paid, reversed in the range, plus current `owed_minor` and `advance_minor` (never netted). |
| `GET /v1/reports/year-totals?year=` | `money.view` | Per worker across all projects: `net_paid_minor` (from `worker_year_paid`), earned and reimbursed for the year, and from `year_totals_with_thresholds(workspace, year)`: `thresholds_known`, `form_1099_nec_threshold_minor`, `household_threshold_minor`, and per worker `business_paid_minor`, `personal_paid_minor`, `at_or_over_1099`, `near_household`. |
| `POST /v1/exports` | `export` | `{kind, filters}` → a CSV file, streamed. Kinds: `LEDGER`, `WORK`, `PAYMENTS`, `PROJECT_SUMMARY`, `BALANCES`, `YEAR_TOTALS`. Same filters as the matching list route. Rate limit 10 per minute per user. See "CSV rules". |

**Evidence on an expense.** Phase 4 built `POST /v1/evidence` and the `Evidence` screen. Add `REIMBURSEMENT` as a parent type (the parent must be a reimbursement in this workspace). The reimbursement form uses it after the reimbursement is saved: save the reimbursement first, then upload each file with parent `REIMBURSEMENT` and the new id. A failed upload never undoes the reimbursement.

**Who recorded it.** Lists and detail rows for members include `recorded_by_name`: "You" for the caller; otherwise the user's display name; if they have none, their invitation label (only to roles with `members.manage`) or their role ("Partner"); "Former member" for a deleted user (spec section 7.4). This is for members only. It never goes into a CSV a worker might get, a receipt, a statement or a public page.

**Ids in filters.** A `project_id` or `worker_id` from another workspace returns the same 404 as any other foreign id. Don't silently drop the filter.

### 2. CSV rules (server, one encoder for every export)

Put the encoder in `server/src/exports/csv.ts` and use it for every CSV the server writes (this phase, Phase 7's data export, and the Business reports later).

- UTF-8 with a byte-order mark, CRLF line endings, a header row, RFC 4180 quoting.
- Every export declares its columns with a type: `TEXT`, `MONEY`, `DATE`, `INT`.
- **MONEY:** written from integer cents by one formatter: `7` → `0.07`, `124550` → `1245.50`, `-5000` → `-50.00`, `0` → `0.00`. No currency symbol, no thousands separator, never quoted, **never prefixed**. Negative money stays a number so spreadsheet sums work.
- **TEXT:** if the value starts with `=`, `+`, `-`, `@`, a tab or a carriage return, put a single quote `'` in front of it. Then always wrap the cell in double quotes, doubling any quote inside. This applies to text columns only: names, descriptions, reasons, references, project names, notes, method descriptions.
- **DATE:** `YYYY-MM-DD`. **INT:** plain digits (minutes of work are an `INT` column called `minutes`; the readable input such as "7 h 30 m" is a separate `TEXT` column). No decimal hours.
- File names: `crewtally_<kind>_<from>_<to>.csv` (lower case kind); year totals `crewtally_year_totals_<year>.csv`.
- Columns match the screens. `BALANCES` has one row per worker per project: worker, project, earned, reimbursed, added, taken_off, paid, reversed, balance. `YEAR_TOTALS` adds `rental_or_business_paid` and `personal_home_paid`.
- None of these exports contains private crew data (skills, favorites, notes, ratings). The full data export in Phase 7 is the only file with those.

### 3. iPhone

- **Worker detail** (layout from Phase 2):
  - The balance card opens **Balance breakdown** (`BalanceBreakdown`), a full screen with these lines from `GET /v1/workers/:id/balance`:
    - Work earned
    - + Expenses owed (reimbursements)
    - + Added to what's owed
    - − Payments
    - + Returned or reversed payments
    - − Taken off what's owed
    - = Balance ("Still owed", "Settled" or "Paid in advance")
  - If the worker is on more than one project, show one block per project, then the worker's total. When a project block is negative, say so on that block ("Paid in advance on Kitchen remodel: $50.00").
  - Work saved on this phone and not yet sent shows below the total as "+$120.00 waiting to send", never inside it.
  - If any assignment comes back `reconciled: false`, show "Needs review" with the support ID. Never hide it.
  - **See all entries** opens the activity list with tabs All, Work, Expenses, Adjustments, Payments, and infinite scroll.
  - Actions: **Record payment**, **Statement** (disabled until Phase 6: "Available in the next update"), **Add expense owed**, and in the ⋯ menu **Adjust balance** and **Opening balance** (a shortcut to an adjustment with category Opening balance, also offered on first setup).
- **Add expense owed** (`Reimburse` → `ExpenseReview`): amount (text input parsed with `shared/money.ts`), date, description (required), optional photo or PDF (see the evidence note). Review shows the balance before, the change, and after, from the server's current balance plus the typed amount. Save needs a connection.
- **Adjust balance** (`AdjustBalance` → `AdjustmentReview`): direction worded "Add to what's owed" / "Take off what's owed", category chips, amount, date, reason (required). Review shows category, reason, before/change/after.
- **Ledger** (More → Ledger): filters for project, worker and date range. Opening balance at the top, rows with the running balance, closing at the bottom. When filtered: "Filtered view. Totals cover this filter only." **Export CSV** calls `POST /v1/exports` and opens the file in the share sheet (`expo-sharing`).
- **Work history** (built in Phase 3): add the project, worker and date filters, and the Recorded / Unrecorded / Corrected states if they aren't there yet. A row opens the detail sheet with its revision history (with "Recorded by" for each revision), **Correct** (same entry controls as Today, then a required reason) and **Clear entry** (void, with a required reason). An Unrecorded row opens the entry controls for that day.
- **Payments list** (built in Phase 4): add the project, worker, date, method and status filters, and **Export CSV**.
- **Project summary** (`ProjectSummary`, opened from the Today owed total and from Projects): the to-date totals with the equation written out, "Owed to workers" and "Paid in advance" as two separate figures, weeks as a bar list with the amount written beside each bar (the bar is decoration; the amount is the information), the per-worker table, **Pay what's owed** and **Export CSV**.
- **Year-end totals** (More → Year-end totals): year stepper, one row per worker (net paid, earned, reimbursed), the total, and the notes below. **Export CSV**.

**Year-end notes.** Exactly as spec section 6 "Year-end totals" in 1.4. All `{…}` values come from the API; nothing is typed into the app.
- `at_or_over_1099`: "{name}: paid {threshold} or more on rental or business work in {year}. You may need to send a 1099-NEC. Check with the IRS or your tax preparer."
- `near_household`: "{name}: {80% of household figure} or more for work at your home. If you direct how and when they work, household employee rules may apply (IRS Pub. 926)."
- When `thresholds_known` is false, no tax note at all.
- Under the notes: "Based on each project's current use." Footer: "A record of what you paid. It isn't tax advice."
- The app never labels anyone an employee or a contractor.

### 4. Web

Same API, same rules, same wording. Paths follow Phase 1c's layout (`…/x` = `/app/w/:workspaceId/x`): `…/reports` (tabs Summary, Ledger, Year-end totals), and the worker page `…/crew/:workerId`. Money and hours inputs are text fields parsed with `shared/money.ts` and the shared hours parser; never `type="number"` with `parseFloat`.

| Web page (CSV id) | What it has |
|---|---|
| `reports` (`…/reports`) | Tabs: **Summary** (date range; totals; by project; by worker with "Owed" and "Paid in advance" columns; **Export CSV** → `BALANCES`), **Ledger** (filters, opening, running, closing, "Filtered view" label, **Export CSV**), **Year-end totals** (year picker, rows, notes and footer exactly as on iPhone, **Export CSV**). Worker names link to the worker page. Statement links arrive in Phase 6. |
| `project` (from Phase 2) | Add the project summary block: equation, owed and paid in advance, weekly list with amounts written out, per-worker table, **Export CSV**. |
| `worker` (from Phase 2) | Add the balance breakdown (all six lines, per project and total), the activity list with the same tabs, and **Add expense owed** and **Adjust balance** as dialogs, each with a review step showing before/change/after. Statement is disabled until Phase 6. |
| `history` (from Phase 3) | Add project, worker, date and Recorded / Unrecorded / Corrected filters, the revision detail with "Recorded by", Correct and Clear entry with required reasons, and **Export CSV**. Blank is never "No work". |
| `payments` (from Phase 4) | Add the filters and **Export CSV**. |

**Downloads on the web.** The browser calls `POST /v1/exports` with the session cookie and the CSRF header, receives the stream, and saves it with the file name from `Content-Disposition`. No CSV is built in the browser.

**Keyboard and screen readers.** Tables have real `<th>` headers and captions. Filters are labelled form controls. Running balances read in full ("running balance, 1,245 dollars and 50 cents" through the visible text, not an icon). Visible focus on every control.

### 5. Role matrix additions

Add every route above to the role matrix in `server/test/helpers/tenancy.ts`. Expected results come from `role_can`:

| Action | Organizer | Partner | Business roles (all five) | Removed / outsider |
|---|---|---|---|---|
| `workspace.read` (`GET /v1/work`, revisions) | 2xx | 2xx | 404 (kind) | 404 |
| `money.view` | 2xx | 2xx | 404 (kind) | 404 |
| `money.record` | 2xx | 2xx | 404 (kind) | 404 |
| `export` | 2xx | 2xx | 404 (kind) | 404 |

These routes are Home-only until B3 widens them (spec section 5.4). B3's role matrix then expects `role_can` results for Business roles (403 for admins without money, leads and workers) plus their scope.

### 6. Tests

**Server**
- A reimbursement raises the balance, appears in activity as its own type, and never in earnings totals (T21).
- Adjustments in both directions; reason, description, date and category required (422 each). Amount caps: $50,000.00 reimbursement and $100,000.00 adjustment accepted, one cent more refused.
- A partner records a reimbursement: stored with `recorded_by` = the partner; the revision and activity rows show the partner's name to the organizer.
- Ledger: opening + sum of rows = closing for a filter (T34). Running balance is right across a page boundary: 120 events, pages of 50.
- Work history UNRECORDED lists only work days, only for active assignments, and handles VOID-then-re-recorded dates correctly.
- Balance breakdown lines sum to the balance for a worker with every event type, on two projects.
- The must-not-build tests in the table above.
- Project summary totals equal the sum of balances split into owed and advance; weekly buckets respect the time zone: a Sunday 11 pm entry in New York belongs to that week (T44).
- Year totals: a payment reversed in the same year nets to zero; a payment in December 2026 reversed in January 2027 shows in both years with opposite signs (T47).
- A worker paid $2,500.00 on a Business-use project in 2026 shows the 1099 note; the same amount on a Personal home project doesn't (T54). 2025 payments use the $600 figure; a year with no threshold row shows no note (T55). The personal-home note appears at $2,400.00 for 2026 (80% of $3,000.00) and not at $2,399.99.
- CSV encoder:
  - `7` → `0.07`, `124550` → `1245.50`, `-5000` → `-50.00`, unquoted, no prefix.
  - A worker named `=HYPERLINK("x")` comes out as `"'=HYPERLINK(""x"")"`; a description `-Dee's tools` as `"'-Dee's tools"`; `@ref` and `+1 ref` are prefixed too; `Dee` is just `"Dee"`.
  - Header row present; BOM present; CRLF line endings.
  - A `BALANCES` export with an advance sums correctly when parsed as numbers (parse the file in the test and add the column).
- Cross-workspace: every new route with an id, and every filter id, returns the same 404 body for another workspace's id.
- Role matrix rows for every new route.

**Mobile:** `ExpenseReview` and `AdjustmentReview` show before, change and after; the breakdown renders all six lines and shows "Needs review" when an assignment isn't reconciled; pending work shows apart from the total; the Statement button is disabled; the export button calls `POST /v1/exports` and shares the file.

**Web:** the breakdown renders all six lines from a mocked API; the export button calls `POST /v1/exports` with the CSRF header; money inputs reject `1.234` and `abc` and accept `1,245.50`; the reports page shows "Owed" and "Paid in advance" as separate figures; filters are reachable and usable by keyboard.

## Proof to paste at the gate
- The ledger SQL, with the running balance and the pagination.
- The UNRECORDED `generate_series` query.
- The CSV encoder (`csv.ts`) and its tests.
- The project summary query that splits owed and paid in advance.
- The role matrix rows added in this phase, and the pass count.
- Test file names and counts for all four suites.

## Try it

**On your phone (Expo Go, dev sign-in as owner-a):**
1. Add an expense owed of $40.00 for Worker A, "Drywall screws", dated yesterday. The balance goes up $40.00 and the breakdown shows it under Expenses owed.
2. Add an opening balance of $500.00 for Worker B. The review shows the category "Opening balance".
3. Ledger for Worker A over the last 30 days: opening + rows = closing.
4. Work history → Unrecorded shows the days you skipped. Open one and record it.
5. Pay Worker C $50.00 more than owed. Project summary shows the others' amount owed unchanged and $50.00 under Paid in advance.
6. Export the ledger CSV and open it in Numbers. The amounts add up as numbers.

**On the web (same account):**
1. Reports → Summary shows the same owed and paid-in-advance figures as the phone.
2. Worker B's page shows the $500.00 opening balance in the breakdown.
3. Sign in as member-c (the partner) and add an expense owed. Back as owner-a, the history detail says "Recorded by" member-c's name.
4. Download the Year-end totals CSV and open it.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 5 ready for review".
