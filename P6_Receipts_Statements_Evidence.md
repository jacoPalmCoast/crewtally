# Phase 6 — Receipts, statements, evidence photos, sharing

## Goal

After recording a payment, the owner shares an honest receipt that shows the worker only their own amount. At any time the owner can share a worker statement of days, earnings, payments and balance. Photos and PDFs of payment evidence can be attached, and they stay private unless the owner chooses to include them.

## Read first
- Spec section 9 (receipts, views, honest status lines, statements, evidence, sharing journey, failures).
- `docs/screens/Receipt.png`, `ReceiptSigned.png` and `Statement.png`.
- `db/schema.sql`: tables `receipts`, `statements` and `evidence`. Receipts and statements are insert-only snapshots (invariant 2).

## Build

### Server — snapshots
- `POST /v1/receipts` takes `{payment_id}`.
  - Load the payment at its **current version**. If a receipt row for (`payment_id`, `version`) exists, return it. Otherwise insert one with an immutable `snapshot` JSON:
    - `receipt_no` (formatted `R-000123`), `generated_at` (UTC ISO), `payment_date`, `payer_display_name` (from workspace settings; set in Phase 2 under More → Account), `recipient_label`, `method`, `reference`.
    - `project_names`.
    - `allocations`: worker id and name, project, `amount_minor`, unreversed amount.
    - `status`: RECORDED / PARTLY_REVERSED / REVERSED / CORRECTED, plus clearance.
    - `status_line`: the exact honest text from spec section 9.
    - `balances_as_of`: per allocated assignment, the balance at `generated_at`, with the `as_of` timestamp.
  - Snapshots never change after insert.
- `GET /v1/receipts/:id?view=WORKER&worker_id=…|FULL` returns the snapshot **filtered server-side** for the view.
  - **WORKER view:** only that worker's allocation lines, their amount, and their balance. The total and other workers are removed. If the payment covers only that worker, include the total.
  - **FULL view:** everything. The client must send `confirm_full=true`. The UI only offers FULL for the named recipient.
  - Never send the full snapshot to the client for a worker view. The filtering happens on the server.
- `POST /v1/statements` takes `{worker_id, project_id?, from, to}`. It inserts an immutable snapshot containing:
  - `statement_no` (`S-000041`; add `statement_seq` to `workspaces` in migration `0005`) and `generated_at`.
  - The worker's name, projects, `from` and `to`.
  - `opening_minor`.
  - `days`: every **work day** in the range per assignment, each with date, input description, rate and earned. Days with no entry are `{status:"NOT_RECORDED"}`, never zero.
  - Non-work days that have an entry are included too.
  - `reimbursements`, `adjustments` (category, reason), `payments` (receipt number, date, method, amount for this worker), `reversals`.
  - `closing_minor`, and totals for earnings, reimbursements, adjustments and payments.
  - Assert on the server that opening + all lines = closing = ledger balance at `generated_at` for the filter. If not, return 500 `RECONCILIATION_MISMATCH` and log it. Never ship a statement that doesn't tie.
- `GET /v1/statements/:id` returns the snapshot.
- Isolation on all of these.

### Server — evidence (private)
- Replit Object Storage bucket for evidence. Keys: `ws/<workspace_id>/evidence/<uuid>`.
- `POST /v1/evidence` (multipart) takes `{parent_type: PAYMENT|REIMBURSEMENT, parent_id}` plus the file.
  - Check that the parent belongs to the workspace.
  - Limits: at most 5 files per parent, 10 MB each.
  - Detect the type from the **file bytes** (magic numbers: JPEG, PNG, PDF); reject anything else with 422.
  - Compute SHA-256, store the file, and insert an `evidence` row with `scan_state = NOT_REQUIRED` (scanning comes in Release 1.1, before any public link).
- `GET /v1/evidence/:id/content` streams the file after checking the workspace. No public URLs, and never put storage URLs in API responses.
- A failed upload never affects the payment. The client retries on its own.

### Mobile
- **Evidence capture** on the payment form, payment detail and reimbursement form:
  - Take photo (`expo-image-picker` camera), Choose photo (system picker, selected items only; don't request photo library permission), Choose file (`expo-document-picker`, PDF only).
  - Before upload, **re-encode photos** with `expo-image-manipulator` to JPEG at quality 0.8, max 2000 px on the long side. That strips location and other metadata.
  - Show thumbnails and an upload state (Uploading, Uploaded, Failed with Retry).
  - Camera permission is requested only on first "Take photo", with a plain-words usage string (Phase 8 sets it in app config).
- **Receipt preview** (per `docs/screens/Receipt.png`), reached from payment detail → **Receipt**:
  - A view selector: one "Worker X only" option per allocated worker, plus "Full split (recipient)" only when the recipient label isn't one of the workers or the payment has several workers. Choosing Full asks for confirmation: "Shows every worker's amount".
  - Preview of the receipt as it will print.
  - **Include evidence** toggles, off by default.
  - **Share** renders the PDF on the device with `expo-print` from an HTML template, using only the view-filtered snapshot. Then open the share sheet with `expo-sharing`.
  - **Save PDF** opens the share sheet's save option.
  - Record "Generated" and "Share opened" locally for display only. Never show "Sent".
- **PDF template (receipt):**
  - Plain, printable, black on white with a teal header rule.
  - Receipt number, generated time (in the project timezone, with the zone named), paid by, paid to, date, method, reference, project, the view's lines, balance "as of" time, and the status line in bold.
  - Footer: "Record of a payment made outside this app. Not bank verification."
  - Evidence thumbnails only if included.
- **Worker statement** (per `docs/screens/Statement.png`) from worker detail → **Statement**:
  - Pick project (or all projects) and period. Default is the start of the current month to project today.
  - Generate shows the preview: opening, days (with "Not recorded" rows shown as a dash, not $0), reimbursements, adjustments, payments, closing, totals, and "As of".
  - Share and Save PDF work the same way as receipts.
- **Failure:** if the receipt or statement call fails, show "Payment recorded; receipt not ready. Retry." The payment is unaffected.
- Payment detail lists receipt versions. Older versions show "Superseded" or "Reversed" and can still be viewed.

### Tests
- **Server:**
  - Receipt WORKER view: the response contains no other worker's name or amount and no total when split. Assert by searching the JSON for the other worker's id, name and amount (T22).
  - FULL view without `confirm_full` returns 422 (T23).
  - Status lines for check, cash and transfer match the spec text exactly (T24).
  - Receipt created twice at the same payment version returns the same row. After a reversal, a new version is created and the old one is SUPERSEDED or REVERSED.
  - Statement: opening + lines = closing = ledger balance (T25). NOT_RECORDED rows appear for unrecorded work days (T26). A deliberately corrupted fixture triggers `RECONCILIATION_MISMATCH`: insert a ledger row directly in the test schema to simulate it.
  - Evidence: a PNG renamed `.pdf` is detected as PNG; a text file with a `.jpg` name returns 422; an 11 MB file returns 422; a sixth file returns 422; another workspace's evidence id returns 404; no storage URL appears in any response.
  - Isolation on every route.
- **Mobile:**
  - The receipt HTML for a worker view doesn't contain the other worker's name.
  - The statement renders "Not recorded" rows.
  - The re-encode step is called before upload (mock `image-manipulator`).

## Additions in baseline 1.2 (build these in this phase)

### Documents in English or Spanish (`docs/screens/ReceiptSigned.png`)
- Extend `shared/i18n/documents.en.json` and `documents.es.json` with every word used on receipts and statements: headings, labels, status lines, "not recorded", and footer text. No text in the HTML templates is hard-coded.
- Receipt and statement templates take a `lang` parameter:
  - It defaults to the worker's `document_language`. The FULL receipt view uses the owner's choice.
  - The preview has an **English · Español** switch for one-off changes.
- Status lines must keep their meaning. Suggested Spanish, to be checked by a fluent speaker before release:
  - "Pago en efectivo registrado por el dueño."
  - "Transferencia bancaria registrada por el dueño. No verificada por el banco."
  - "Cheque emitido; cobro no confirmado."
  - "Recibido y firmado por {name}, {date}."
- Money is formatted the same in both ($1,245.00). Dates are formatted per language.

### Signed line on receipts
- When a `payment_signatures` row exists for the worker in view, the receipt snapshot includes `signature: {typed_name, signed_at, language}`. The PDF shows "Received and signed by …" (translated) with the signature image. In the worker view, show only that worker's signature.

### Tests
- The same receipt in en and es has identical amounts. There are no untranslated keys. The es status lines match the table above (T45).
- The signed line appears only after a signature. A new receipt version is created after signing, and the old one is SUPERSEDED.

## Texted receipt link (Release 1) (`docs/screens/TextLink.png`, `WorkerLinkPage.png`)

### API
- `POST /v1/links` takes `{operation_id, receipt_id, worker_id, language}`. It:
  - checks the receipt belongs to the workspace and the worker is on that payment;
  - creates a 256-bit random token (base64url) and stores only its SHA-256 in `share_links`, with view WORKER and expiry 30 days;
  - returns `{token_url, message_text}` once. `message_text` is built from the translation files, in the worker's language.
- `DELETE /v1/links/:id` revokes a link. `GET /v1/payments/:id` now includes each link's texted, opened and acknowledgment state.

### Public receipt page
Served by the API at `/api/r/:token` (see "Public pages" in `replit.md`). `token_url` uses `PUBLIC_BASE_URL` + `/r/` + token; `PUBLIC_BASE_URL` is the dev URL + `/api` until Phase 8, then `https://crewtallyapp.com` (which forwards `/r/*` to the API).

- `GET /r/:token`: hash the token and call `open_share_link`. Render a small server-side HTML page from the receipt snapshot, **filtered to that worker**, in the link's language with an English · Español switch.
  - No JavaScript framework, no third-party scripts, no analytics.
  - Headers: `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, a strict `Content-Security-Policy`.
  - It shows two buttons, each a plain HTML form POST so it works without JavaScript: **Yes, I received this payment** and **I have a question** (with a textarea).
- `POST /r/:token/ack` calls `acknowledge_share_link`, then shows a thank-you page.
- Unknown, expired and revoked links all show the same "not available" page with status 404.
- Rate-limit both routes per IP (e.g. 30 requests per minute), and never log tokens or full URLs.

### Mobile
- A **Text receipt** button on the payout done screen, on payment detail, and on the receipt preview.
- It opens the Text receipt screen: to, receipt, language, a preview of the message, and three "what Dee will see" notes. **Open in Messages** calls `SMS.sendSMSAsync([mobile], message)` from `expo-sms`.
  - If SMS isn't available, or the worker has no mobile number, fall back to the share sheet with the same text.
  - Record "Texted" locally when the composer opens. The server records "Opened".
- Payment detail shows per worker: "Texted 5:50 pm · Opened 6:02 pm · Confirmed 6:05 pm", or "Question from Dee" with the note and a **Mark resolved** action. Poll on screen focus; no push.
- Offline: **Text receipt** is disabled with "Needs a connection". Signatures still work.

### Tests
- **Link creation:** the token is returned once; the database holds only the hash (query it); another workspace's receipt or a worker not on the payment gets 404 (T27).
- **Public page:**
  - Shows only that worker's line: search the HTML for the other worker's name and amount.
  - Unknown, expired and revoked links return the same 404 page (T28).
  - No `<script src=` from other domains, and the `noindex` header is present.
- **Acknowledgment:**
  - "Received" is recorded once, and a second tap returns the already-confirmed page.
  - A question without a note is refused.
  - The ledger is unchanged throughout.
- **Rate limit:** the 31st request in a minute gets 429.

## Additions in baseline 1.3 (build these in this phase)

### Receipt page footer, counted
- At the bottom of the public receipt page, in small muted text: "Kept with CrewTally — free for homeowners" (es: "Registrado con CrewTally — gratis para propietarios"; add both to the translation files and flag for the fluent-speaker check).
- It links to `/go/app` on the same domain. **Never** put the receipt token or any id in that link.
- `GET /r/:token` calls `bump_growth_counter('RECEIPT_PAGE_VIEW')` only when the page renders (not on the 404 page).
- `GET /go/app` calls `bump_growth_counter('RECEIPT_FOOTER_TAP')` and redirects (302) to the URL in the `APP_STORE_URL` setting; until the app is live that is `https://crewtallyapp.com`. No cookies, no query strings kept, same rate limit as `/r`.
- Diagnostics (owner-only) doesn't show these counts; they're for you in the database.

### Tests
- The footer link contains no token (search the HTML); a rendered page adds one view; the 404 page adds none; `/go/app` adds one tap and returns 302 (T56). Check both with `curl` against the dev URL at `/api/r/…` and `/api/go/app`.

## Additions in baseline 1.4

### Tests
- Give a worker a private note, skills and a rating, then generate a receipt, a statement, a texted link (`message_text`), the public receipt page, the hand-over sentence and the hire-again message. Search every one: none of the note, skills, rating, stars or would-hire value appears (T65).
- Receipt and statement templates accept only the snapshot type, never a worker or crew object (enforce with the TypeScript type).

## Proof to paste at the gate
- The server-side view filter function.
- The statement tie-out assertion.
- The magic-number check.
- The receipt HTML template.

## Try it on your phone
- Text Dee her receipt. Messages opens with her number and the message filled in. Send it to your own number instead to test. Open the link on another phone: it shows only Dee's $170.00. Tap **Yes, I received this payment**, and payment detail shows "Confirmed".
- Open the $300 split payment → Receipt → "Worker A only". The PDF shows only A's $200, and the status line says the transfer was recorded by the owner.
- Share it to yourself in Messages. It arrives as a PDF.
- Take a photo of a handwritten receipt on a reimbursement. It uploads, and the thumbnail shows.
- Worker A statement for this month: the days you skipped show "Not recorded", and the closing balance matches worker detail.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 6 ready for review".
