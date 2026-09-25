# Phase 4 — Payments: split, advance warning, checks, reversals, corrections

## Goal

The owner records a payment already made outside the app, splits it across workers, and sees balances drop. Checks are tracked through issued, cleared and returned. Mistakes are fixed by reversal or correction, never by editing.

## Read first
- Spec section 8 (payment form, recording and checks, reversals and corrections, duplicates, the fictional sequence).
- `docs/screens/RecordPayment.png`, `ConfirmPayment.png`, `PaymentDetail.png` and `RefundSheet.png`.
- `db/schema.sql`: `record_payment`, `reverse_payment` (full, partial, CHECK_RETURNED, CORRECTION; requires `p_effective_date`), `set_check_cleared`, `correct_payment`.
- `db/tests/02_ledger_core.sql` and `03_payments_and_checks.sql`.

## Build

### API
- `GET /v1/balances?project_id=&worker_id=` returns one row per assignment (worker, project, `balance_minor`, status OWED / SETTLED / ADVANCE), plus totals: `owed_minor` (sum of positives) and `advance_minor` (sum of negatives). Never a single netted figure.
- `POST /v1/payments/duplicate-check` takes `{payment_date, amount_minor, method, reference?}` and returns matching payments in the workspace. A match has the same date, amount and method, and the same reference when one is given.
- `POST /v1/payments` takes `{operation_id, payment_date, method, method_note?, amount_minor, recipient_label, reference?, note?, allocations:[{assignment_id, amount_minor}]}` and calls `record_payment`.
  - Validate with zod: integers, at least one line, no duplicate assignment in the lines, OTHER requires `method_note`.
  - Call `record_payment_with_note` (provided in `db/schema.sql`), which records the payment and its optional note in one transaction.
- `GET /v1/payments?from=&to=&worker_id=&project_id=&method=` returns a paged list (limit 50, cursor) with receipt number, date, method, amount, recipient, status (Recorded, Partly reversed, Reversed, Corrected) and clearance.
- `GET /v1/payments/:id` returns detail: allocations (worker, project, amount, unreversed amount), reversals with lines and reasons, clearance, version, `replaces_payment_id`, the id of any later payment that replaces this one, and receipt versions (Phase 6).
- `POST /v1/payments/:id/reversals` takes `{operation_id, kind: FULL|PARTIAL, lines?, reason, expected_version}`. It calls `reverse_payment` with `p_effective_date` set to **today in the workspace's primary project timezone**; add a helper for that.
- `POST /v1/payments/:id/clearance` takes `{operation_id, status: CLEARED|RETURNED, expected_version, reason?}`.
  - CLEARED calls `set_check_cleared`.
  - RETURNED calls `reverse_payment` with kind CHECK_RETURNED; the reason is required.
- `POST /v1/payments/:id/correct` takes `{operation_id, expected_version, reason, payment_date, method, method_note?, amount_minor, recipient_label, reference?, allocations}` and calls `correct_payment`.
- Isolation on every route.

### Mobile — Payments tab and form (per `docs/screens/RecordPayment.png` and `Payments.png`)
- **Payments tab:** the list, newest first, with filters (worker, project, date range, method). There's a floating **Record payment** button. Its style is neutral, and the helper text under the form title says "Records a payment you already made. No money moves."
- **Record payment form:**
  - Fields: amount, date (defaults to project today), method (Cash, Check, Bank transfer, Zelle, Other plus a description), paid to (recipient label; defaults to the worker's name when a single worker is allocated, or free text such as "Crew lead"), check number or reference, note, and evidence (Phase 6 adds the pickers; show the row disabled with "Available soon").
  - **Allocate to workers:** the owner picks assignments; each line shows "Worker · Project · owed $x".
  - **Fill from balances** fills each chosen line with its owed amount. If an amount is already entered, it fills lines in order up to that amount. The owner reviews the result.
  - **Remaining to allocate:** live, must reach $0.00 before Record is enabled. Show a check mark and the words "Fully allocated".
  - **Advance warning** per line: "Worker B will be $20.00 in advance after this payment."
  - **On Record:**
    1. Run the duplicate check. If there are matches, show "Looks like payment R-000118 on the same date for the same amount. Record anyway?"
    2. Show the confirmation sheet with one checkbox matching the method ("Transfer made" / "Cash handed over" / "Check issued"), then **Record payment**.
  - The `operation_id` is created when the form opens and reused on every retry, so a double tap records one payment (T20).
  - Offline, the Record button is disabled with "Needs a connection". The draft stays in the form, and leaving asks Keep draft or Discard. Keep the draft in local storage per form; no server-side drafts.
- **Payment detail:**
  - Receipt number, date, method, recipient, reference, and a status line with honest wording:
    - "Check issued; clearance not confirmed"
    - "Cash payment recorded by owner"
    - "Bank transfer recorded by owner. Not bank verified."
  - Allocations and reversals.
  - Actions in the ⋯ menu, each explaining the consequence before confirming:
    - **Mark check cleared** (checks only)
    - **Check returned** (reason)
    - **Reverse payment** (full, reason)
    - **Partial refund** (per-line amounts capped at the unreversed amount, reason)
    - **Correct payment** (reopens the form prefilled; explains "The original stays on record as corrected")
- **Today:** beside **No payments today** (from Phase 3), add a **Payments this day** link that opens the payment list filtered to that date. Recording a payment for that date marks the day reviewed. **Pay what's owed** now opens the real payout screen.
- **Worker detail:** balances now come from `/v1/balances`. **Record payment** is prefilled with that worker.

### Tests
- **Server:**
  - The fictional sequence from spec section 8 through the API gives A 360 → 160 → −40 → 160 and B 180 → 80 → 180. Assert every step through `/v1/balances`.
  - Split mismatch returns 422 with no rows written; count payments before and after (T15).
  - Duplicate assignment in lines returns 422. Cross-workspace assignment in lines returns 404 or 422 (T35).
  - Double submit with the same `operation_id` gives one payment and one set of ledger rows (T20).
  - Check lifecycle through the API: issue credits once, clear adds nothing, return reverses all lines (T18). Clearing a non-check returns 422.
  - Partial refund over the unreversed amount returns 422 (T19).
  - Correction: old payment shows "Corrected", new payment links to it, balances match the new split.
  - Totals: one worker in advance doesn't reduce another worker's amount owed in `owed_minor` (T17).
  - Isolation: another owner's payment id returns 404 on detail, reversals, clearance and correct.
- **Mobile:**
  - Remaining-to-allocate math and the button's enabled state.
  - Fill from balances with and without an entered amount.
  - Advance warning text.
  - Operation id kept across a simulated retry.

## Additions in baseline 1.2 (build these in this phase)

### Pay what's owed (`docs/screens/PayOwed.png`, `PayOwedDone.png`)
**API**
- `GET /v1/payouts/preview?project_id=` (or all projects) lists every assignment with a positive balance: worker, project, owed, and the worker's last payment method.
- `POST /v1/payouts` takes `{operation_id, payment_date, lines:[{assignment_id, amount_minor, method, method_note?, recipient_label, reference?, note?}]}` and calls `record_payout`. The response lists one payment and receipt number per line.

**Mobile**
- Each worker row has:
  - a checkbox, ticked by default;
  - the amount, prefilled with what's owed and editable;
  - the method, defaulting to the worker's last method, else Cash;
  - a check-number field when the method is Check;
  - the advance warning if the amount is more than owed.
- The bottom bar shows "Record 4 payments · $1,245.00". It's disabled while any check has no number.
- The confirmation sheet reads "I've paid these 4 workers". The operation id is created when the screen opens and reused on retry.
- **Done screen:** one row per payment with its receipt number, plus **Get signature** (cash rows first) and **Share receipt** (Phase 6; until then, disabled). Also **Done**.
- Offline, the screen is disabled with "Needs a connection".

### Hand-over signature (`docs/screens/Handover.png`)
- Reached from **Get signature** on the done screen, or from payment detail for any worker on the payment.
- A full-screen view in the **worker's documents language**, with large type. It shows:
  - the amount;
  - one sentence built from the translation file (`shared/i18n/documents.en.json` and `documents.es.json`; create them now, Phase 6 extends them);
  - a name field;
  - a signature pad;
  - **Confirm**, **Clear**, and a small **Skip** for the owner.
- Use only Expo SDK modules:
  - **Signature pad:** strokes captured with `react-native-gesture-handler`, drawn with `react-native-svg`, exported to PNG with `react-native-view-shot` (`captureRef`). Crop to 1200×400, white background, black ink.
  - **Save:** upload the PNG with `POST /v1/evidence` (parent PAYMENT), then `POST /v1/payments/:id/signatures` with `{operation_id, worker_id, typed_name, evidence_id, language, statement_text}`. That calls `record_handover_signature`.
  - **Without signal:** keep the PNG and request in the local queue as one `signature` op (upload first, then the call). Show "Signed · will send when online". Never duplicate: reuse the op id.
- The owner's phone shows "Hand the phone to Marco" first, and after Confirm, "Signed by Marco Reyes". It then returns to the done screen.
- Sentence formats (the exact strings go in the translation files):
  - en: "I received {amount} in {method} from {payer} for {project} on {date}."
  - es: "Recibí {amount} en {method} de {payer} por {project} el {date}."

  Method names are translated too (cash → efectivo, check → cheque, bank transfer → transferencia bancaria, Zelle → Zelle). Dates are formatted per language (`es`: "jue 24 sep 2026").

### Tests
- **Payout:** four lines give four payments, four receipt numbers and balances at zero (T39).
- **Payout is atomic:** a bad line (OTHER without a note) records nothing, and a retry with the same id gives no double payout (T40).
- **Signature:**
  - Stored with typed name, sentence and language; ledger balances unchanged (T41).
  - A worker not on the payment, or a reversed payment, is rejected (T42).
  - A second signature for the same worker and payment returns 409.
- **Signature queue:** created offline, sent once after reconnect, and not sent while the payment is still pending (T43).
- **Translations:** every key in `documents.en.json` exists in `documents.es.json`, with no empty values.

### Test ID tags
- The offline Record-payment behaviour above (disabled with the reason, draft kept) is T31.

- The advance warning is T16.

## Proof to paste at the gate
- The `POST /v1/payments` handler and zod schema.
- The balances SQL.
- The sequence test.

## Try it on your phone
- Pay what's owed on Kitchen: four workers, Luis by check #1043. The done screen shows four receipt numbers, and every balance is $0.00.
- Get Marco's signature: the screen is in Spanish; sign with a finger. Payment detail shows "Signed by Marco Reyes".
- With Airplane Mode on, get Sam's signature. It shows "will send when online" and sends after you reconnect.
- Worker A owes $360 and Worker B owes $80 (set this up on Today). Record $300 by bank transfer to "Crew lead", split $200/$100. Remaining shows $0.00, and B shows the $20 advance warning.
- Double-tap Record. There's only one payment in the list.
- Record a $200 check to A. Payment detail says "clearance not confirmed". Mark it cleared, then mark it returned: A's balance goes back up.
- Correct the first payment to $150/$150. The old one shows as Corrected.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 4 ready for review".
