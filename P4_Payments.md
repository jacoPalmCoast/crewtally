# Phase 4 — Payments: record, split, pay what's owed, checks, fixing a payment (iPhone and web)

> **Before pasting:** Phase 3 has passed. Nothing else to set up.

## Goal

Someone in the workspace records a payment they've **already made** outside the app, and sees balances drop. The revised flow is the target: one worker by default, a blank amount with a **Full balance** button, a before-and-after preview, an unticked "I already made this payment" box, and drafts kept on the device. Underneath, every 1.4 safeguard stays:

- a split is **one payment** with allocation lines, never one payment per worker;
- pay what's owed records one payment per worker, with the amounts and methods the person chose, in one transaction;
- checks are tracked as issued, cleared or returned, and a returned check reverses every line of that payment;
- mistakes are fixed by reversal (full or part) or correction, never by editing;
- duplicates are warned about on date, amount, method and reference; a retry is never a second payment;
- payments need a connection;
- proof (photos and PDFs) can be added as an optional step.

The partner can do all of this. The web gets the same features, through the same routes.

Not in this phase: receipts, sharing and the hand-over signature (Phase 6; the buttons show disabled with "Available in the next update"), reimbursements and adjustments (Phase 5).

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: sections 10 "Home screens: changes from 1.4", 11 "Money rules: keep, adopt, must not build" and 12 "Web app".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 8 (payment form, pay what's owed, recording and checks, reversals and corrections, duplicates, the fictional sequence) and the evidence rules in section 9.
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase` = `P4`. Read each `rules_and_conflicts`. (`ChangePay` and `RateReview` were built in Phase 2. `ExpenseReview` is the review step for an expense owed; it's built with reimbursements in Phase 5.)
- iPhone pictures in `docs/screens-2.0/mobile/`: `Payments`, `ChoosePaymentWorker`, `RecordPayment`, `ConfirmPayment`, `DuplicatePayment`, `PaymentRecorded`, `SplitPayment`, `SplitReview`, `SplitRecorded`, `PayOwed`, `BulkReview`, `PayOwedDone`, `PaymentDetail`, `CashPaymentDetail`, `CheckCleared`, `RefundSheet`, `RefundReview`, `DraftRecovery`, `Evidence`.
- Web pictures: `docs/screens-2.0/web/home/record-payment.png`, `home/payment-review.png`, and `web/desktop/` + `web/mobile/` for `payments`, `record-payment`, `payment-review`, `payment-saved`.
- `db/schema.sql`: `record_payment`, `record_payment_with_note`, `record_payout`, `reverse_payment` (FULL, PARTIAL, CHECK_RETURNED, CORRECTION; needs `p_effective_date`), `set_check_cleared`, `correct_payment`, the `evidence` table, `assignment_balances`, `assignment_totals`.
- `db/tests/02_ledger_core.sql`, `03_payments_and_checks.sql` and `06_payout_signatures_totals.sql`.

## Build

### 1. Server: rules for every route in this phase
- Every route is a `memberRoute` with its action and `kinds: ['HOME']` (the interim rule; B3 widens these routes for Business).
- **Online only.** No payment write is ever queued. The apps disable the buttons offline; the server needs nothing extra.
- **Money is integer cents.** zod schemas use integers for every amount. `amount_minor` is 1 to 10,000,000 ($100,000).
- **Receipt numbers** are shown as `R-` plus `receipt_no` padded to 6 digits (`R-000123`) on every surface. Never show a payment id.
- **The reversal date** (`p_effective_date`) is today in the time zone of the project of the payment's first allocation line. One helper, used by reversals, returned checks and corrections.
- **Duplicate rule (one rule, server-enforced).** A possible duplicate is an existing payment in the workspace with the same `payment_date`, `amount_minor` and `method`, and the same `reference` when the new one has one. Before recording:
  1. If this `operation_id` was already used in this workspace, skip the duplicate check and call the function: it returns the original result (a retry is never a duplicate) or 409 for a different body.
  2. Otherwise, if there's a possible duplicate and the request doesn't carry `duplicate_confirmed: true` → 409 `POSSIBLE_DUPLICATE` with the matching receipt numbers, dates, amounts and methods. Nothing is written.
- **Payment date** can't be after today in the allocated project's time zone → 422 ("Record payments you've already made.").
- **Methods:** `CASH`, `CHECK`, `BANK_TRANSFER`, `ZELLE`, `OTHER`. `OTHER` needs `method_note` (1–60). `CHECK` needs the check number in `reference`. Same list on every surface.
- **Allocations:** 1–50 lines; each assignment once; every amount above 0; the lines add up to the payment exactly. Check all of this before calling the function (422, nothing written). An assignment from another workspace → 404.
- Error mapping added in this phase: allocation sum or line errors → 422 `ALLOCATION_INVALID`; "reversal exceeds unreversed amount" → 422 `OVER_UNREVERSED`; "nothing left to reverse" → 422 `NOTHING_TO_REVERSE`; "only an issued check…" → 422 `NOT_AN_OPEN_CHECK`; a CHECK constraint (23514) → 422; stale version (40001 "stale version") → 409 `STALE_VERSION`.
- `recorded_by` comes from the actor `require_member` sets. Show "Recorded by <name>" (or "you") on payment detail.
- Recording a payment marks `day_reviews` reviewed for each allocated project on the payment date, in the same transaction.

### 2. Server: routes

| Route | Action | What it does |
|---|---|---|
| `GET /v1/balances?project_id=&worker_id=` | `money.view` | One row per assignment: worker, project, `balance_minor`, status `OWED` / `SETTLED` / `ADVANCE`, plus `totals: {owed_minor, advance_minor}` (positives and negatives apart). Never one netted figure. |
| `POST /v1/payments/duplicate-check` | `money.record` | `{payment_date, amount_minor, method, reference?}` → the possible duplicates (the rule above). The apps call it before the review step; the server checks again on record. |
| `POST /v1/payments` | `money.record` | `{operation_id, payment_date, method, method_note?, amount_minor, recipient_label, reference?, note?, allocations:[{assignment_id, amount_minor}], duplicate_confirmed?}` → `record_payment_with_note`. `recipient_label` 1–80 (who received the money; may be a crew lead paid for several). `note` ≤ 500. Returns `{payment_id, receipt_no, version, balances_after:[{assignment_id, balance_minor}]}`. |
| `GET /v1/payments?from=&to=&worker_id=&project_id=&method=&status=&cursor=` | `money.view` | Paged (50, keyset), newest first: receipt number, date, method, amount, recipient, status (Recorded, Partly reversed, Reversed, Corrected), clearance, workers on it. |
| `GET /v1/payments/:id` | `money.view` | Allocations (worker, project, amount, unreversed amount), reversals with lines, kinds and reasons, clearance, version, `replaces_payment_id`, the id and receipt number of any payment that replaced this one, who recorded it, and evidence metadata (id, type, size, created; never a storage URL). |
| `POST /v1/payments/:id/reversals` | `money.record` | `{operation_id, kind: FULL\|PARTIAL, lines?:[{allocation_id, amount_minor}], reason, expected_version}` → `reverse_payment`. Lines only for PARTIAL, each capped at that line's unreversed amount. Reason required. |
| `POST /v1/payments/:id/clearance` | `money.record` | `{operation_id, status: CLEARED\|RETURNED, expected_version, reason?}`. CLEARED → `set_check_cleared` (no ledger change). RETURNED → `reverse_payment` with `CHECK_RETURNED` (reason required), which reverses every line. |
| `POST /v1/payments/:id/correct` | `money.record` | `{operation_id, expected_version, reason, payment_date, method, method_note?, amount_minor, recipient_label, reference?, allocations, duplicate_confirmed?}` → `correct_payment` (reverse the old, record the new, link them, one transaction). The old payment shows Corrected. The duplicate check ignores the payment being corrected. |
| `GET /v1/payouts/preview?project_id=` | `money.view` | Every assignment with a **positive** balance (one project, or all): worker, project, owed, the worker's last payment method. |
| `POST /v1/payouts` | `money.record` | `{operation_id, payment_date, lines:[{assignment_id, amount_minor, method, method_note?, recipient_label, reference?, note?}], duplicate_confirmed?}` → `record_payout`. One payment and receipt number per line, all or nothing. The duplicate rule runs per line; any match without confirmation → 409 listing the lines. |
| `POST /v1/evidence` | `money.record` | Multipart: `{parent_type: PAYMENT, parent_id}` plus one file. The parent must be in the workspace (404). At most 5 files per parent and 10 MB each (422). Detect the type from the **file bytes** (JPEG, PNG or PDF only; anything else 422). SHA-256, store in private Object Storage at `ws/<workspace_id>/evidence/<uuid>`, insert the `evidence` row with `scan_state = NOT_REQUIRED`. Phase 5 adds `REIMBURSEMENT` parents. |
| `GET /v1/evidence?parent_type=&parent_id=` | `money.view` | Metadata only. |
| `GET /v1/evidence/:id/content` | `money.view` | Streams the file after the workspace check. No public URLs; never a storage URL in any response. |

Phase 6 builds receipts, share links and the hand-over signature on top of these and doesn't rebuild the evidence routes. Evidence never appears on a public link in Release 1.

### 3. iPhone

**Payments tab** (`Payments`):
- The list, newest first, with **receipt numbers**, status labels (with icons) and clearance ("Check not cleared"); filters for worker, project, date range and method (the design dropped them; keep them).
- Actions: **Record payment** (neutral style; never looks like a transfer button), **Pay what's owed**, **Split a payment**.
- Helper under the title: "Records a payment you already made. No money moves."
- A draft banner when a draft exists (`DraftRecovery`).
- **No other payments today** marks today reviewed for the current project.

**Record a payment** (one worker):
1. `ChoosePaymentWorker`: workers with their balance on each project (Owed / Settled / Paid in advance, with icons). Links: "Paid several people at once? **Split a payment**", **Pay what's owed**.
2. `RecordPayment`:
   - The worker, and the **project** this payment is for. If they're on one project, show it fixed; if more than one, the person picks. Never pick a project silently.
   - **Amount** starts blank. **Full balance** fills what's owed on that project (shown only when it's above zero).
   - **Date**, default the project's today; not after today.
   - **Method:** Cash, Check, Bank transfer, Zelle, Other (with a description). **No method is preselected** (spec section 10.4): the person picks one, so the receipt shows the real method. If the worker was paid before, show a small hint "Last time: Zelle" that fills the method when tapped. Check asks for the check number (required). Bank transfer and Zelle offer an optional reference.
   - Under **More options**: Paid to (recipient; default the worker's name) and Note.
   - **Save draft** and **Continue**.
3. `ConfirmPayment` (review):
   - Before, this payment, and after, for the line. If after is below zero: "<Worker> will be paid $20.00 in advance."
   - Date, method and check number or reference.
   - One **unticked** checkbox with wording that matches the method: "I already handed over this cash", "I already gave this check (#1043)", "I already made this bank transfer", "I already made this Zelle payment", or "I already made this payment (<description>)".
   - **Record payment**, disabled until the box is ticked and while offline ("Needs a connection").
   - The line "CrewTally doesn't move money. This is your record of a payment you made."
4. Possible duplicate (409) → `DuplicatePayment`: "This looks like R-000118: same date, amount and method." (plus "and reference" when it matched). **Record a separate payment** (sends again with `duplicate_confirmed`) / **Keep the existing one** (opens R-000118).
5. `PaymentRecorded`: amount, receipt number, the worker's new balance (from `balances_after`), **View payment**, **Add proof (optional)** (opens `Evidence`), and **Share receipt** / **Get signature** shown disabled with "Available in the next update" (Phase 6).

**Split a payment** (`SplitPayment`, `SplitReview`, `SplitRecorded`): one payment shared across workers.
- Form: **Paid to** (who received the money, for example "Crew lead"), total, date, method (+ check number, reference, description), note.
- Lines: pick workers (worker × project), each with a share. **Fill from balances** fills each line with what's owed; if a total is entered, it fills lines in order up to that total. The person reviews the result.
- **Left to allocate** updates as they type and must reach $0.00 before Continue is enabled; then it shows a check mark and "Fully allocated".
- Each line shows the paid-in-advance warning when it goes below zero.
- Review: every line with before and after, plus the total, date and method (the design hides method and date; show them), the duplicate check, and the unticked method checkbox.
- Done: "One payment, R-000124: $300.00 to Crew lead", with the lines underneath ("Worker A $200.00 · Worker B $100.00") and "Each worker's receipt will show only their own amount." Never "separate payments" and never a method like "Via crew lead".

**Pay what's owed** (`PayOwed`, `BulkReview`, `PayOwedDone`), from Payments, Today (**Pay what's owed ($x)**) and the project overview:
- Every worker owed money on the chosen project (or all projects). Rows start **ticked** (spec section 10.4), with **Clear all** at the top; untick anyone you aren't paying now.
- Each ticked row: the amount, prefilled with what's owed and **editable**; the method, chosen per row with nothing preselected (a "Last time: <method>" hint fills it when tapped; never a silent Cash); a check number when the method is Check; a description for Other; the paid-in-advance warning if the amount is more than owed.
- One date for all (default today).
- Bottom bar: "Record 4 payments · $1,245.00". Disabled while any ticked row has no amount, no method, a check without a number, or Other without a description.
- Review (`BulkReview`): each row with worker, project, amount, method and check number, the total, and one unticked box "I've already paid these 4 workers". The design shows neither method nor total; show both.
- One `POST /v1/payouts`, all or nothing. The `operation_id` is made when the screen opens and reused on retry.
- Done (`PayOwedDone`): one row per payment with its receipt number and method, **Add proof**, and **Get signature** / **Share receipt** disabled until Phase 6. **Done**.

**Payment detail** (`PaymentDetail`, `CashPaymentDetail`):
- Receipt number, date, method, recipient, reference, "Recorded by <name>", and an honest status line:
  - Cash: "Cash payment recorded by <name>."
  - Check: "Check issued; clearance not confirmed." / "Check cleared on <date>." / "Check returned on <date>."
  - Bank transfer: "Bank transfer recorded by <name>. Not bank verified."
  - Zelle: "Zelle payment recorded by <name>. Not bank verified."
  - Other: "<description> recorded by <name>."
  - Never "verified", "sent", "delivered" or "confirmed by the bank". The cash picture's "bank clearance is a separate status" line is wrong; don't copy it.
- Allocations (worker, project, amount, still counted), reversals with reasons, and "Corrected by R-000131" or "Corrects R-000118" links.
- Proof: private thumbnails, **Add proof**.
- **Fix this payment** (`RefundSheet`) explains each choice before confirming:
  - **Correct the payment** (wrong amount, date, method or split): reopens the form prefilled. "The original stays on record as corrected, and a new payment replaces it."
  - **Money returned** (part of it came back): per-line amounts, each capped at that line's amount still counted; reason required. Review (`RefundReview`) shows before and after for each line.
  - **Reverse the whole payment**: reason required. "Every line goes back on the balances."
- For checks, also **Mark check cleared** (`CheckCleared`: "Cleared. Nothing changes on the balance: <worker> was credited when the check was issued.") and **Check returned** (reason; "This reverses every line of this payment. <Worker>'s balance goes back up by $200.00.").
- Every action needs a connection.

**Drafts** (`DraftRecovery`):
- Record payment, Split and Pay what's owed keep a draft on this phone only (local storage, keyed by user, workspace, project and form), with the form's `operation_id`.
- A draft never changes a balance or a total anywhere.
- Leaving a form with input asks **Keep draft** or **Discard**. Opening Payments, Today or the form with a draft offers **Resume** or **Discard**.
- If the workspace says 404 (access removed), or the draft's project has been archived, the draft can't be resumed (spec section 10.4): show the reason ("You no longer have access to <workspace>" / "<Project> was archived. Start a new payment from the project.") and offer **Discard**. Paying what's owed on an archived project still works from a new form.

**Proof** (`Evidence`), an optional step after recording and from payment detail:
- **Take photo** (`expo-image-picker` camera; permission asked only on first use), **Choose photo** (system picker with selected items only; no photo library permission), **Choose file** (`expo-document-picker`, PDF only).
- Re-encode photos with `expo-image-manipulator` to JPEG at quality 0.8, at most 2000 px on the long side, which strips location and other metadata.
- Thumbnails with Uploading / Uploaded / Failed and **Retry**. A failed upload never affects the payment.
- The line: "Proof stays private to this workspace. Check it for account numbers before you choose to include it on a receipt."

**Elsewhere:**
- **Today:** **Pay what's owed ($x)** opens the real screen. **Payments this day** opens the list filtered to that date.
- **Worker detail:** balances from `/v1/balances`; **Record payment** opens the form for that worker.
- **Negative balances** read "Paid in advance" everywhere, with an icon.

### 4. Web

Add **Payments** to the navigation (shaped by `money.view`). Same routes, same rules, same words. Amount fields parse text with `shared/money.ts`. Paths follow Phase 1c's layout (`…/x` = `/app/w/:workspaceId/x`).

| Web route | Screen | What it does |
|---|---|---|
| `…/payments` | `payments` | **Owed** and **Paid in advance** as separate figures (never one net figure), payments this month; a balance table per worker and project with **Record payment**; payment history with receipt numbers, status labels, clearance and filters (worker, project, dates, method). **Pay what's owed** and **Split a payment**. |
| `…/payments/new` | `home/record-payment`, `record-payment` | The iPhone form: worker, project picked explicitly, blank amount with **Full balance**, date, all five methods (none preselected), check number, reference, paid to, note. No drafts on the web. "Records a payment you already made. No money moves." The design's single job, three methods and no check number are not built. |
| `…/payments/split` | (iPhone `SplitPayment`) | The split form with lines, Fill from balances and Left to allocate. |
| `…/payments/pay-owed` | (iPhone `PayOwed`) | Pay what's owed, with editable amounts and a method per row. |
| `…/payments/new/review` (and the review step of split and pay what's owed) | `home/payment-review`, `payment-review` | Before and after per line; "<Worker> will be paid $20.00 in advance" (not "worker credit"); the server's duplicate result (same rule as iPhone, not the design's worker-date-amount rule); the unticked method checkbox; **Record payment**, disabled offline. |
| `…/payments/:id/saved` | `payment-saved` | Receipt number, new balance, **Add proof**, **View payment**. |
| `…/payments/:id` | (iPhone `PaymentDetail`) | Everything on iPhone payment detail: status line, allocations, reversals, proof, **Fix this payment** (correct, money returned, reverse), **Mark check cleared**, **Check returned**. |

- Proof on the web: a file input (`image/jpeg`, `image/png`, `application/pdf`). Re-encode photos through a canvas to JPEG at quality 0.8 and at most 2000 px, which drops metadata; PDFs upload as they are. The server checks the bytes either way.
- **No drafts on the web** (nothing is stored in the browser, Phase 1c). Offline: every record and fix button is disabled with "Needs a connection"; the form stays filled while the page is open, with the same `operation_id` for the retry.

## Tests

**Server**
- The fictional sequence from the 1.4 spec, section 8, through the API: A 360 → 160 → −40 → 160 and B 180 → 80 → 180. Check every step through `/v1/balances`.
- The revised acceptance example: a worker owed $1,200.00, a $900.00 payment → balance $300.00, status OWED.
- A split that doesn't add up → 422 with no rows written (count payments before and after) (T15). A duplicate assignment in the lines → 422. Another workspace's assignment in the lines → 404 (T35).
- Double submit with the same `operation_id` → one payment, one set of ledger rows (T20). The **retry of a recorded payment returns the original**, not `POSSIBLE_DUPLICATE`.
- Duplicate rule: same date, amount and method → 409 with the receipt number; with `duplicate_confirmed` → 201; a different reference when both have one → no warning; a different method → no warning. Same results through `/v1/payouts` and `/correct`.
- A split is **one** payment: one `payments` row, one receipt number, one allocation per worker.
- Pay what's owed: four lines → four payments, four receipt numbers, balances at zero (T39); an amount below what's owed and a Zelle line are recorded exactly as sent; a bad line (OTHER without a description) records nothing, and a retry with the same id gives no double payout (T40).
- Checks: issue credits once, clear adds nothing, return reverses every line (T18); clearing a non-check → 422; returning a returned check → 422; a check without a number → 422.
- A partial refund over a line's unreversed amount → 422 (T19). Money returned on one line of a split leaves the other lines alone.
- Correction: the old payment shows Corrected, the new one links to it, balances match the new split.
- Totals: one worker paid in advance doesn't reduce another worker's amount owed in `owed_minor` (T17).
- Future payment date → 422. Amount over $100,000 → 422.
- Recording a payment marks `day_reviews` for that date and project.
- The partner records a payment, a split, a payout, a reversal and a correction → 2xx, each with `recorded_by` = the partner.
- Evidence: a PNG renamed `.pdf` is stored as PNG; a text file named `.jpg` → 422; an 11 MB file → 422; a 6th file → 422; another workspace's evidence id or parent → 404; no storage URL in any response.
- Isolation: another workspace's payment id → 404 on detail, reversals, clearance, correct and evidence.
- **Role matrix — add these rows** (both session kinds):

| Route | Action | Organizer | Partner | Business roles | Removed, outsider |
|---|---|---|---|---|---|
| `GET /v1/balances`, `GET /v1/payments`, `GET /v1/payments/:id`, `GET /v1/payouts/preview` | money.view | 2xx | 2xx | 404 (kind) | 404 |
| `POST /v1/payments/duplicate-check` | money.record | 2xx | 2xx | 404 | 404 |
| `POST /v1/payments`, `…/reversals`, `…/clearance`, `…/correct` | money.record | 2xx | 2xx | 404 | 404 |
| `POST /v1/payouts` | money.record | 2xx | 2xx | 404 | 404 |
| `POST /v1/evidence` | money.record | 2xx | 2xx | 404 | 404 |
| `GET /v1/evidence`, `GET /v1/evidence/:id/content` | money.view | 2xx | 2xx | 404 | 404 |

**Mobile**
- The amount starts blank; **Full balance** fills what's owed and is hidden when nothing is owed.
- The confirmation box starts unticked and Record stays disabled until it's ticked; its wording matches each method.
- Left to allocate and the Continue button's state; Fill from balances with and without a total.
- The paid-in-advance warning text (T16).
- The `operation_id` survives a simulated retry and a draft resume.
- Offline: Record is disabled with "Needs a connection" and the draft is kept (T31). A draft never changes any total on screen.
- Pay what's owed: rows start ticked; Clear all unticks every row; no method is preselected; the bar is disabled for a ticked row without a method or a check without a number.
- Record payment: no method is preselected; the "Last time" hint fills it only when tapped.
- A draft for an archived project, or after access was removed, can only be discarded.
- Sample mode: recording a payment throws `SampleModeError` and sends nothing (T46 extended).
- Status lines: the bank transfer and Zelle lines include "Not bank verified."; no screen contains "verified" in any other sentence, or "sent" or "delivered" about a payment.

**Web**
- The method list has all five methods; Check requires a number; Other requires a description.
- Split, Pay what's owed, payment detail, correct, money returned, reverse, mark cleared and check returned all exist and call the routes above.
- Owed and Paid in advance show as separate figures; no "worker credit" wording.
- Receipt numbers render as `R-000123`.
- No `parseFloat` in `web/src`.
- No payment data is written to `localStorage` or IndexedDB; offline, the record buttons are disabled.

## Must-not-build items for this phase
From spec section 11, "Prototype behaviours that must not be built", and the CSV:
- **A split recorded as separate payments, each with a method like "Via crew lead".** → One payment, one receipt number, allocation lines. Tested by the one-payment test.
- **Crew payments forced to Cash at the full balance and saved one by one.** → Editable amounts, a method per row, check numbers, one transaction. Tested by T39 and T40.
- **No action for a returned check** (only "money returned"). → Check returned reverses every line. Tested by T18.
- **No way to correct or reverse a payment, and "money returned" capped at the worker's total paid.** → Correct, reverse, and money returned capped per line of that payment. Tested by T19 and the correction test.
- **Payments recorded offline.** → Online only, with local drafts. Tested by T31.
- **A payment tied quietly to the worker's current job.** → The project is chosen on the form; allocations are explicit.
- **Web payments with three methods, one worker, one job, and no fixes.** → Web parity. Tested by the web tests.
- **Different duplicate rules on each surface.** → One server rule: date, amount, method, reference.
- **Evidence nobody can reach.** → Add proof after recording and on payment detail.
- **Project and payment totals that net one worker's advance against others.** → Owed and paid in advance apart (T17).
- **Dropping "Not bank verified", or wording that says a payment was sent or verified.** → Status line tests.
- **Internal payment ids as receipt numbers.** → `R-000123` everywhere.

## Proof to paste at the gate
- The `POST /v1/payments` handler and its zod schema, showing the idempotency-first duplicate check.
- The balances SQL.
- The `POST /v1/payouts` handler.
- The reversal and clearance handlers, and the reversal-date helper.
- The evidence upload handler (type detection and limits).
- The sequence test.
- The role matrix rows added in this phase, and the pass count.
- Test file names and counts for all four suites.

## Try it on your phone (Expo Go, developer sign-in as owner-a)
1. Set up on Today: Worker A owes $360 (a full day and a half day at $240) and Worker B owes something small. Use whatever amounts you have; the steps still work.
2. Record payment → Worker A. The amount is blank; tap **Full balance**: $360.00. Change it to $200, Cash. On the review, Record is greyed out until you tick "I already handed over this cash". Record. You see R-number and "Balance $160.00". **Add proof** with a photo.
3. Record $200 again for Worker A, same date, Cash: "This looks like R-…". Tap Keep the existing one.
4. **Split a payment**: $300 by bank transfer to "Crew lead": A $200, B $100. Left to allocate reaches $0.00; if B's share is more than B is owed, B shows "will be paid $… in advance". Record. Done says one payment, one R-number. Payment detail says "Not bank verified."
5. Double-tap Record on another payment: the list shows only one.
6. Record a $160 check (#1043) to A. Detail: "Check issued; clearance not confirmed". Mark it cleared: A's balance doesn't change. Then **Check returned**: A's balance goes back up by $160.
7. Fix the split: **Correct the payment** to $150 / $150. The old one shows Corrected; the new one says "Corrects R-…".
8. **Pay what's owed** on Kitchen: everyone starts ticked with no method. Set Worker C to Check #1044, Worker A to Zelle with $10 less than owed, and Cash for the rest. The bar shows the count and total. Review, tick, Record: one R-number per worker, and the balances match.
9. Turn on Airplane Mode and open Record payment: Record is disabled, "Needs a connection". Leave: Keep draft. Turn Airplane Mode off; Payments offers Resume.
10. Sign in as **member-c** (partner) and record a payment: it works, and its detail says "Recorded by" the partner.

## Try it on the web
1. Payments shows Owed and Paid in advance as separate figures, and the same R-numbers as the phone.
2. Record a payment by **Zelle** for a worker on two projects: the form makes you pick the project.
3. Split a payment across two workers, then open it and use **Money returned** on one line only.
4. Pay what's owed with a check without a number: the button stays disabled until you add it.
5. Open the check from step 6 on the phone: it shows Returned, with the same reversal reason.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 4 ready for review".
