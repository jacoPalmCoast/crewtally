# Phase 6 — Receipts, statements, evidence, hand-over and sharing (iPhone and web)

> **Before pasting:** Phase 5 passed its gate. Nothing new to add to Secrets. `PUBLIC_BASE_URL` stays the dev URL + `/api` until Phase 8.

## Goal

After a payment is recorded, any member with money rights can share an honest receipt that shows each worker only their own amount. At any time they can make a worker statement of days, earnings, expenses, adjustments, payments and balance. Workers open a texted link without an account and tap **I received this payment** or **I have a question**. Photos and PDFs of payment evidence stay private unless a member chooses to include them in a PDF.

Everything works the same on iPhone and on the web. Receipts and statements are **stored snapshots**: every surface renders the snapshot, never live data, so renaming a worker never rewrites an old receipt. Receipts are numbered `R-000123` per workspace on every surface; statements `S-000041`.

This phase adds migration `0006_receipts_and_statements.sql` (it was 0005 in baseline 1.4). You write it; its exact content is below.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: section 11 "Money rules: keep, adopt, must not build", section 12 "Web app", section 5 "Roles and permissions", section 15 "Data model and migrations", section 16 "API surface".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 9 (receipts, views, honest status lines, Spanish, statements, texted link, acknowledgment, evidence, receipt page, sharing journey, secure links, failures) and section 8 "Hand-over signature". These rules stand unless 2.0 changes them.
- `docs/SCREEN-COVERAGE-2.0.csv`, rows with `build_phase` = P6 (mobile `Receipt`, `ReceiptSigned`, `Handover`, `TextLink`, `ShareResult`, `WorkerLinkPage`, `ReceiptReceived`, `ReceiptQuestion`, `QuestionSent`, `ExpiredLink`, `Statement`; web `receipt`, `share-receipt`, `public-receipt`, `statement`).
- Screens: mobile `Receipt`, `ReceiptSigned`, `Handover`, `TextLink`, `ShareResult`, `WorkerLinkPage`, `ReceiptReceived`, `ReceiptQuestion`, `QuestionSent`, `ExpiredLink`, `Statement`, and `Evidence` (built in Phase 4; reused here); web `receipt`, `share-receipt`, `statement`, `public-receipt` (the visual target for the API-served `/r/:token` page), and `my-receipt` (a B2 screen; layout reference only).
- `db/schema.sql`: `receipts`, `statements`, `share_links`, `acknowledgments`, `evidence`, `payment_signatures`, `record_handover_signature`, `open_share_link`, `acknowledge_share_link`. Receipts and statements are insert-only snapshots (invariant 2).
- `db/migrations/0004_plans_and_project_use.sql`: `bump_growth_counter`.

## What the design changed, and what we keep

| Topic | Design shows | Build |
|---|---|---|
| Receipt number | `CT-101` (Home), `BR-101` (Business), `PAY-<timestamp>` on web | `R-000123` from the payment's per-workspace `receipt_no`, everywhere. A later version of the same payment shows "R-000123 · version 2". |
| Web receipt | Rendered from live payment and worker data | Rendered from the stored snapshot only. |
| "Not bank verified" | Dropped | Kept. It's the required honest status line (invariant 8). |
| Balance "as of" | Dropped from the worker's receipt | Kept: the worker's balance at generation time, labelled "as of <time>", on the receipt and the receipt page. |
| Full split view | Gone | Kept for the **named recipient only** (a split paid through one person). Every other share is worker-only. |
| Hand-over | Signature optional, no typed name, English only | The whole step stays optional (**Skip**). When the worker confirms, they type their name and sign, in their documents language (English or Spanish). |
| Expired link page | Says "This link has expired" | One identical page for expired, revoked, unknown and malformed links (T28). |
| Public receipt questions | "Something looks wrong" or "Report a problem" goes to a signed-in page | **I received this payment** and **I have a question** on the public page, no sign-in (spec section 10.6). |
| Evidence | Screen exists, nothing links to it | Reachable from the payment form, payment detail and the expense form. |
| Statement | All-time balance card | Keep 1.4: project and period pickers, day-by-day document with "Not recorded" days, opening and closing, `S-` number. |

## Must not build (and how each is tested)

| Must not build (spec section 11) | Test that proves it |
|---|---|
| Receipts rendered from live data | Rename the worker and the project after generating a receipt; the receipt (API, web page, public page, PDF HTML) still shows the old names. |
| Receipt numbers that aren't the per-workspace sequence (`PAY-…`, `CT-…`, `BR-…`) | Two workspaces each get `R-000001` for their first payment; no response contains a payment id where the receipt number belongs. |
| A split payment shown as several receipts | A $300.00 split between A and B has one receipt number; the worker view for A shows only A's line. |
| Another worker's amount, or the total of a split, in a worker view | T22 (search the JSON and HTML for the other worker's id, name and amount). |
| The full split to anyone but the named recipient | T23: FULL without `confirm_full` → 422; a share link can't be created with view FULL for a worker. |
| Dropping "Not bank verified", or claiming verified, sent or delivered | T24 exact status lines; a test greps the receipt templates and translation files for "verified" (only in "Not bank verified" / "No verificada por el banco"), "sent", "delivered". |
| An "expired" page that differs from "revoked" or "unknown" | T28: same status, same body bytes, same headers for all four cases. |
| Acknowledgment that needs an account | `POST /api/r/:token/ack` works with no cookie and no bearer token. |
| Evidence on the public page or in a link | The public HTML has no evidence image or URL; no response anywhere contains a storage URL. |
| CrewTally sending a text or an email to a worker | No SMS or email provider call exists for receipts; the server only returns `token_url` and `message_text`. |
| Private crew data on documents | T65 (below). |

## Build

### 1. Migration `0006_receipts_and_statements.sql`

Write it in `db/migrations/`. Additive only. At the end, call `select harden_definer_functions();`.

1. `alter table workspaces add column statement_seq integer not null default 0;`
2. `alter table statements add column statement_no integer;` and `create unique index statements_no on statements (workspace_id, statement_no) where statement_no is not null;`
3. `record_statement(p_workspace uuid, p_operation uuid, p_worker uuid, p_project uuid, p_from date, p_to date, p_snapshot jsonb) returns jsonb`, `security definer`: idempotent with `idem_get` / `idem_put` like the money functions, hashing the request (worker, project, from, to), never the snapshot, since a retry builds a new `generated_at` (same id + same request → the first result; same id + different request → SQLSTATE `40001`, returned as 409 like every other reused operation id); increments `workspaces.statement_seq` (`update … returning`); inserts the statement row with that number; returns `{statement_id, statement_no}`. Raises `P0002` if the worker (or project) isn't in the workspace.
4. Snapshot protection triggers:
   - `receipts_snapshot_fixed` (before update on `receipts`): raise unless the only change is `status` (the provided money functions set SUPERSEDED or REVERSED).
   - `statements_fixed` (before update on `statements`): always raise.
   - `receipts_no_delete` and `statements_no_delete` (before delete): raise unless `current_setting('workpay.deleting_workspace', true)` equals the row's `workspace_id`, the same rule as the ledger trigger. That keeps `delete_workspace_data` working.
5. `resolve_acknowledgment(p_workspace uuid, p_ack uuid) returns jsonb`, `security definer`: sets `resolved_at = now()` on a QUERY in that workspace; `P0002` if not found; returns `already_resolved` the second time.
6. Tests in a new file `db/tests/12_receipts_statements.sql`: numbering per workspace; a snapshot update is refused; a status-only update is allowed; deleting a receipt outside account deletion is refused; `05_account_deletion.sql` still passes unchanged; `resolve_acknowledgment` on another workspace's row raises.

Don't change any provided function. Never disable these triggers.

### 2. Server — receipts

All member routes use `withMember` with `kinds: ['HOME']` (the interim rule; B3 widens them for Business). The `recorded_by` trigger fills the actor on receipts, statements, share links and evidence.

| Route | Action | What it does |
|---|---|---|
| `POST /v1/receipts` | `money.record` | `{payment_id}`. Loads the payment at its current version. If a receipt for (`payment_id`, `version`) exists, returns it. Otherwise inserts the snapshot (below). |
| `GET /v1/receipts/:id?view=WORKER&worker_id=…` or `?view=FULL&confirm_full=true` | `money.view` | The snapshot, **filtered on the server** for the view. |
| `GET /v1/payments/:id/receipts` | `money.view` | All versions with status CURRENT, SUPERSEDED or REVERSED. |

**Snapshot contents** (immutable JSON, written once):
- `receipt_no` (`"R-000123"`), `version`, `generated_at` (UTC ISO), `timezone` (the project's), `payment_date`, `payer_display_name` (the workspace's receipt name set in Phase 2; until set, "the owner"), `recipient_label`, `method`, `method_note`, `reference`, `check_number` where the method is Check.
- `project_names`.
- `allocations`: worker id and name, project, `amount_minor`, unreversed amount.
- `status`: RECORDED / PARTLY_REVERSED / REVERSED / CORRECTED, plus check clearance.
- `status_line`: `{en, es}`, both texts written at generation from the translation files, so an old receipt never changes wording.
- `balances_as_of`: per allocated assignment, `{assignment_id, balance_minor, as_of}` at `generated_at`.
- `signatures`: per worker who signed, `{worker_id, typed_name, signed_at, language, evidence_id}`.

**Status lines** (exact text, from 1.4 section 9; the Spanish is checked by a fluent speaker before release):

| Case | English | Spanish |
|---|---|---|
| Check, not cleared | Check issued; clearance not confirmed. | Cheque emitido; cobro no confirmado. |
| Cash | Cash payment recorded by owner. | Pago en efectivo registrado por el dueño. |
| Bank transfer, Zelle, Other | {Method} recorded by owner. Not bank verified. | {Método} registrada por el dueño. No verificada por el banco. |
| Signed | Received and signed by {name}, {date}. | Recibido y firmado por {name}, {date}. |
| Reversed / superseded | Says so, with the reason. | Same meaning. |

Uploaded evidence never changes the status line.

**Views.**
- **WORKER:** that worker's allocation lines, their amount, their `balances_as_of`, and their own signature only. The total and other workers are removed. If the payment covers only that worker, the total is included.
- **FULL:** everything; the client must send `confirm_full=true` (otherwise 422). The apps offer it only as "Full split (recipient)" when the recipient label isn't one of the workers, or the payment covers several workers.
- The filtering happens on the server. The full snapshot never reaches a client for a worker view.

**Who recorded it.** `GET /v1/payments/:id` (Phase 4) and the receipt preview response include `recorded_by_name` for members, named as in Phase 5 ("You", display name, invitation label or role, "Former member"). It is **not** part of the snapshot, and never appears in a worker view, a PDF, the public page, a texted message or a statement (spec section 8.5).

### 3. Server — statements

| Route | Action | What it does |
|---|---|---|
| `POST /v1/statements` | `money.record` | `{operation_id, worker_id, project_id?, from, to, language?}`. Builds the snapshot and calls `record_statement`. Idempotent by `operation_id`. |
| `GET /v1/statements/:id` | `money.view` | The snapshot. |
| `GET /v1/workers/:id/statements` | `money.view` | Earlier statements for that worker: number, period, project, generated time. |

**Statement snapshot:** `statement_no` (`"S-000041"`), `generated_at`, worker name, projects, `from`, `to`, `opening_minor`; `days`: every **work day** in the range per assignment with date, input, rate and earned, and `{status:"NOT_RECORDED"}` for days with no entry (never zero); non-work days that have an entry are included; `reimbursements`, `adjustments` (category, reason), `payments` (receipt number, date, method, this worker's amount), `reversals`; `closing_minor` and totals for each type.

**Tie-out.** The server asserts opening + all lines = closing = ledger balance at `generated_at` for the filter. If not: 500 `RECONCILIATION_MISMATCH`, logged with ids only. Never store a statement that doesn't tie.

Statements are shared as PDFs (iPhone) or printed and saved (web). Texted **statement** links aren't in Release 1.

### 4. Server — evidence (private)

Phase 4 built evidence upload and Phase 5 added `REIMBURSEMENT` parents. Don't rebuild them: check them against every rule here and add only what's missing.

| Route | Action | What it does |
|---|---|---|
| `POST /v1/evidence` (multipart) | `money.record` | `{parent_type: PAYMENT\|REIMBURSEMENT, parent_id}` + the file. Parent must be in the workspace. At most 5 files per parent, 10 MB each. Type detected from the **file bytes** (JPEG, PNG, PDF magic numbers); anything else 422. SHA-256 stored. Key `ws/<workspace_id>/evidence/<uuid>` in private Object Storage. `scan_state = NOT_REQUIRED`. |
| `GET /v1/evidence?parent_type=&parent_id=` | `money.view` | Ids, types, sizes, created time. |
| `GET /v1/evidence/:id/content` | `money.view` | Streams the file. No public URLs; storage URLs never appear in any response. |

A failed upload never affects the payment or expense. The client retries on its own and shows the state.

### 5. Server — texted links and the public receipt page

| Route | Kind | Action | What it does |
|---|---|---|---|
| `POST /v1/links` | member | `money.record` | `{operation_id, receipt_id, worker_id, language}`. The worker must be on that payment. 256-bit random token (base64url); only its SHA-256 is stored in `share_links`, view WORKER, expiry 30 days. Returns `{link_id, token_url, message_text, expires_at}` **once**; a retry with the same `operation_id` returns `token_url: null` and `already_created: true` (the app then offers **Revoke and make a new link**). `message_text` comes from the translation files in the worker's language. |
| `DELETE /v1/links/:id` | member | `money.record` | Revokes the link. |
| `GET /v1/questions?status=open\|resolved` | member | `money.view` | Worker questions (`QUERY` acknowledgments) for this workspace: worker name, receipt number, date, note, resolved time. Newest first. |
| `POST /v1/acknowledgments/:id/resolve` | member | `money.record` | Calls `resolve_acknowledgment`. |
| `GET /api/r/:token` | public page | — | The receipt page. |
| `GET /api/r/:token/question` | public page | — | The "I have a question" form (`ReceiptQuestion`). Same not-available page for bad tokens. |
| `POST /api/r/:token/ack` | public | — | `kind=RECEIVED` or `kind=QUERY` with `note` (1–500 characters) and optional `typed_name` (up to 80). Calls `acknowledge_share_link`. |
| `GET /api/go/app` | public | — | Footer redirect (below). |

`GET /v1/payments/:id` includes, per worker: each link's expiry, revoked state, first opened time, and acknowledgments (Confirmed time, or the question note and its resolved state).

**Public receipt page** (`/api/r/:token`; `token_url` = `PUBLIC_BASE_URL` + `/r/` + token):
- Hash the token and call `open_share_link`. Render server-side HTML from the snapshot, **filtered to that worker**, in the link's language, with an English · Español switch made of plain links (`?lang=es`).
- It shows: receipt number, who paid, the worker's amount, date, method, project, the honest status line, "Not bank verified" where it applies, the worker's balance "as of <time>", the signed line if they signed, "This link works until <date>", and a **Privacy** link to `/privacy`.
- If the receipt is now SUPERSEDED or REVERSED, a plain banner says so: "This receipt was replaced on <date>. Ask <payer> for the new one." / "This payment was reversed."
- Two actions that work without JavaScript: **I received this payment** (a form POST with `kind=RECEIVED`) and **I have a question** (a plain link to `/api/r/<token>/question`, whose form POSTs `kind=QUERY`). Form `action` is always the absolute path `/api/r/<token>/ack`, so it works whether the page was reached at `/r/…` or `/api/r/…`.
- **I received this payment** → `ReceiptReceived`: thank-you, the receipt card and status line again. A second tap shows the same page and records nothing new.
- **I have a question** → `ReceiptQuestion`: a required note with a 500-character counter, an optional typed name, and the line "This doesn't confirm you received the payment." Then `QuestionSent`: echoes the note and says "Your message was saved for <payer>. It doesn't confirm the payment. If it's urgent, contact <payer> directly." Never say the payer has read it.
- At the bottom, small muted text: "Kept with CrewTally — free for homeowners" (es: "Registrado con CrewTally — gratis para propietarios"), linking to `/go/app` on the same domain. **Never** a token or id in that link.
- **Not available** (`ExpiredLink` layout, but no "expired" wording): one page for unknown, expired, revoked and malformed tokens, status 404: "This receipt link isn't available. Ask the person who sent it for a new one." Same body bytes and headers in every case. No payer name (an unknown token has none).
- Headers on every public response: `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, a strict `Content-Security-Policy` (`default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`). No JavaScript framework, no third-party scripts, fonts or analytics, no cookies.
- POSTs check that `Origin`, if present, is the page's own origin; otherwise 403.
- Rate limit `GET` and `POST` on `/api/r` and `/api/go` together at 30 per minute per client IP (Phase 1c made the client IP correct behind Replit's proxy; Phase 8 checks it in production). Never log tokens or full URLs.
- `GET /api/r/:token` calls `bump_growth_counter('RECEIPT_PAGE_VIEW')` only when the receipt renders (not on the not-available page). `GET /api/go/app` calls `bump_growth_counter('RECEIPT_FOOTER_TAP')` and redirects 302 to the `APP_STORE_URL` setting (until the app is live, `https://crewtallyapp.com`). No cookies, no query string kept.

### 6. One document template for every surface

Put the receipt and statement HTML in `shared/documents/` as pure functions: `renderReceiptBody(snapshotView, lang)` and `renderStatementBody(snapshot, lang)`. They accept only the snapshot types (enforced with TypeScript), never a worker, crew or payment object. Every word comes from `shared/i18n/documents.en.json` and `documents.es.json`.

They're used by:
- the iPhone app (`expo-print` → PDF → share sheet),
- the public receipt page (wrapped with the buttons and footer),
- the web app (shown in the page and printed with the browser's Print / Save as PDF),
- Phase 7's data export (one HTML file per receipt and statement).

**Receipt PDF:** plain, printable, black on white with a teal header rule; receipt number, generated time in the project time zone with the zone named, paid by, paid to, date, method, reference, project, the view's lines, balance "as of", the status line in bold, the signed line if any. Footer: "Record of a payment made outside this app. Not bank verification." Evidence thumbnails only if the member switched **Include evidence** on (off by default).

### 7. iPhone

- **Receipt** (payment detail → **Receipt**, and from the payout done screen):
  - "Who is this for?": one "<Worker> only" option per allocated worker, plus "Full split (recipient)" when allowed. Choosing Full asks: "Shows every worker's amount."
  - Language: English · Español (defaults to the worker's documents language; the full view uses the member's choice).
  - The preview, rendered from the server's view-filtered snapshot.
  - **Include evidence** toggles, off by default.
  - **Share** (PDF through the share sheet), **Save PDF**, **Text receipt**.
  - Show "Recorded by <name>" under the preview, outside the document.
  - Record "Generated" and "Share opened" locally for display. Never "Sent". After the share sheet closes, `ShareResult` says "Delivery: not confirmed. Sharing doesn't prove the worker got it."
- **Text receipt** (`TextLink`): to (worker and mobile number), receipt, language, the message preview, and what the worker will see ("Only your amount", "Works for 30 days", "You can revoke it"). **Open in Messages** calls `SMS.sendSMSAsync([mobile], message)` from `expo-sms`; with no SMS or no mobile number, the share sheet opens with the same text. Record "Texted" locally when the composer opens. Offline: disabled with "Needs a connection".
- **Questions** (Payments tab): a **Questions** list from `GET /v1/questions`, open ones first, each opening its payment; it stays until someone with `money.record` marks it resolved (spec section 10.6). Turn on the Phase 4 **Get signature** and **Share receipt** buttons.
- **Payment detail:** per worker, "Texted 5:50 pm · Opened 6:02 pm · Confirmed 6:05 pm", or "Question from Dee" with the note and **Mark resolved**. Each link has **Revoke**. Receipt versions are listed; older ones show "Superseded" or "Reversed" and still open. Poll on screen focus; no push.
- **Hand-over** (`Handover`). Build it now (Phase 4 left **Get signature** disabled) from 1.4 section 8 and this list:
  - Offered after any payment that includes the worker, first for cash. **Skip** records nothing.
  - Full screen in the worker's documents language: the amount, one sentence from the translation files ("I received {amount} in {method} from {payer} for {project} on {date}." / "Recibí {amount} en {method} de {payer} por {project} el {date}."), a name field, a signature pad, **Confirm**, **Clear**.
  - **Confirm** needs both the typed name (2–80 characters) and a signature; `payment_signatures` requires both.
  - Signature pad with Expo SDK modules only (`react-native-gesture-handler`, `react-native-svg`, `react-native-view-shot`), PNG 1200×400, white background, black ink. Upload with `POST /v1/evidence` (parent PAYMENT), then `POST /v1/payments/:id/signatures` (`money.record`) → `record_handover_signature`.
  - Without signal: keep the PNG and request as one queued `signature` op (upload first, then the call), reusing the op id. "Signed · will send when online."
  - It never changes the ledger. A reversed or corrected payment can't be signed.
- **Evidence** (payment form, payment detail, expense form): Take photo (`expo-image-picker` camera; permission asked only on first use), Choose photo (system picker, no library permission), Choose file (`expo-document-picker`, PDF only). Re-encode photos with `expo-image-manipulator` to JPEG quality 0.8, max 2000 px long side, before upload (strips location). Thumbnails with Uploading / Uploaded / Failed + Retry. Turn on the Phase 5 expense photo button.
- **Statement** (worker detail → **Statement**, turned on now): project (or all projects), period (default: start of this month to project today), language. **Generate** shows the document: opening, days ("Not recorded" shown as a dash, not $0), expenses, adjustments, payments, closing, totals, "As of". **Share** and **Save PDF** as for receipts. Earlier statements are listed.
- **Failure:** if a receipt or statement call fails: "Payment recorded; receipt not ready. Retry." The payment is unaffected.
- **Sample mode:** generating, sharing and texting are writes; the sample guard refuses them (extends T46). The sample receipt preview renders from bundled data only.

### 8. Web

Paths follow Phase 1c's layout (`…/x` = `/app/w/:workspaceId/x`).

| Web page (CSV id) | What it has |
|---|---|
| `receipt` (`…/payments/:id/receipt`) | The snapshot rendered with the shared template; "Who is this for?" and language as on iPhone; **Print or save as PDF** (browser print, print stylesheet hides the app chrome); versions; "Recorded by <name>" outside the document; link status and acknowledgments with **Mark resolved**. |
| `share-receipt` (`…/payments/:id/share`) | Create a link for one worker (`POST /v1/links`): shows the link and the message once, with **Copy link** and **Copy message**, and on phones **Share** (Web Share API when available). CrewTally doesn't send it. A list of this receipt's links with expiry, opened, confirmed, and **Revoke**. |
| `statement` (`…/reports/statements/:workerId`) | Pick worker, project, period and language; **Generate**; the document; **Print or save as PDF**; earlier statements. Turn on the Phase 5 statement links on `reports` and `worker`. |
| Questions (a section on `…/payments`) | Open and resolved worker questions with **Mark resolved**. |
| Evidence | On the payment and expense dialogs and the payment page: upload (file input, JPEG/PNG/PDF, the same limits, checked again by the server), thumbnails, upload state. The browser re-encodes photos to JPEG through a canvas before upload to strip metadata; PDFs go as they are. |

The web never shows another worker's line in a worker view, never offers Full except for the recipient, and gets the same 422 for FULL without confirmation.

### 9. Spanish

- Every word on receipts, statements, the hand-over sentence, the link message, and the public pages lives in `shared/i18n/documents.en.json` and `documents.es.json`. No hard-coded text in templates.
- Money is formatted the same in both ($1,245.00). Dates per language ("jue 24 sep 2026").
- Add the footer line, the public-page buttons and their pages, and the not-available page to both files. Mark every new Spanish string for the fluent-speaker check in `docs/QA_LOG.md`.

### 10. Role matrix additions

| Route | Action |
|---|---|
| `POST /v1/receipts`, `POST /v1/statements`, `POST /v1/links`, `DELETE /v1/links/:id`, `POST /v1/acknowledgments/:id/resolve`, `POST /v1/evidence`, `POST /v1/payments/:id/signatures` | `money.record` |
| `GET /v1/receipts/:id`, `GET /v1/payments/:id/receipts`, `GET /v1/statements/:id`, `GET /v1/workers/:id/statements`, `GET /v1/questions`, `GET /v1/evidence`, `GET /v1/evidence/:id/content` | `money.view` |

Organizer and partner → 2xx; every Business role → 404 (kind; B3 widens these routes); removed and outsider → 404. Register the public routes as `publicRoute` and add them to the route-table exception list.

### 11. Tests

**Database:** `12_receipts_statements.sql` as above; all earlier files still pass.

**Server**
- Receipt WORKER view: no other worker's id, name or amount, and no total when split (T22). FULL without `confirm_full` → 422 (T23). Status lines for check, cash, transfer and Zelle match the table exactly in both languages (T24).
- Same payment version twice → same receipt row. After a reversal or correction a new version exists and the old one is SUPERSEDED or REVERSED.
- Snapshot fixed: rename the worker and project; the receipt and statement come back unchanged.
- Numbering: first receipt in two workspaces is `R-000001` in each; statements `S-000001` in each.
- Statement: opening + lines = closing = ledger balance (T25); NOT_RECORDED rows for unrecorded work days (T26); a corrupted fixture (a direct ledger insert in the test schema) gives `RECONCILIATION_MISMATCH`.
- Evidence: a PNG named `.pdf` is detected as PNG; a text file named `.jpg` → 422; 11 MB → 422; a sixth file → 422; another workspace's evidence id → 404; no storage URL in any response.
- Links: token returned once; the database holds only the hash (query it); another workspace's receipt, or a worker not on the payment → 404 (T27); a retry returns `already_created` and no token.
- Public page: only that worker's line (search the HTML for the other worker's name and amount); unknown, expired, revoked and malformed tokens return byte-identical 404 pages (T28); no `<script src=` and no third-party URL; `noindex`, `no-referrer`, `no-store` and the CSP header are present; balance "as of" and "Not bank verified" appear for a transfer.
- Questions: a question from the public page appears in `GET /v1/questions` until resolved, then under `status=resolved`.
- Acknowledgment: works with no session; "received" recorded once, the second tap returns the already-confirmed page; a question without a note is refused; ledger unchanged throughout; resolve works once.
- Rate limit: the 31st request in a minute → 429.
- Footer and counter: the footer link has no token; a rendered page adds one view, the 404 page none; `/go/app` adds one tap and returns 302 (T56).
- Who recorded it: the recorder's name and user id appear in `GET /v1/payments/:id` for the organizer, and **nowhere** in the worker view JSON, the public HTML, `message_text`, or the statement.
- Private crew data: give a worker a private note, skills and a rating, then generate a receipt, a statement, a texted link (`message_text`), the public page, the hand-over sentence and the hire-again message. None of the note, skills, rating, stars or would-hire value appears (T65).
- Spanish: the same receipt in en and es has identical amounts; no untranslated or empty keys; the es status lines match the table (T45).
- Signature: stored with typed name, sentence and language; balances unchanged (T41); a worker not on the payment or a reversed payment is rejected (T42); a second signature → 409; the signed line appears only after signing, and the old receipt becomes SUPERSEDED.
- Role matrix rows and cross-workspace 404s for every new route.

**Mobile:** the worker-view HTML has no other worker's name; the statement renders "Not recorded"; photos are re-encoded before upload (mock `image-manipulator`); the signature queue sends once after reconnect and not while the payment is pending (T43); sample mode refuses receipt and link writes (T46).

**Web:** the receipt page renders from a mocked snapshot and shows `R-000123`; renaming in a mocked live record doesn't change it; Full needs the confirmation; the share page shows the link once; Print styles hide navigation; keyboard reaches every action.

## Proof to paste at the gate
- Migration 0006 and `12_receipts_statements.sql`.
- The server-side view filter function.
- The statement tie-out assertion.
- The magic-number check.
- `renderReceiptBody` and the public page wrapper.
- `curl -i` output for `/api/r/<good token>`, `/api/r/<revoked token>` and `/api/r/nonsense`, showing identical 404s for the last two.
- Role matrix rows added and the pass count; test file names and counts for all four suites.

## Try it

**On your phone (Expo Go, dev sign-in as owner-a):**
1. Text Dee her receipt. Messages opens with her number and the message. Send it to your own number instead. Open the link on another phone: only Dee's $170.00, "Not bank verified", her balance "as of". Tap **I received this payment**; payment detail shows "Confirmed".
2. Open the $300.00 split → Receipt → "Worker A only". The PDF shows only A's $200.00 and the number `R-…`.
3. Hand the phone over for a cash payment, switch to Español, type a name and sign. The receipt gains the signed line.
4. Take a photo of a handwritten receipt on an expense. It uploads, and the thumbnail shows.
5. Worker A statement for this month: skipped days show "Not recorded" and the closing balance matches worker detail.
6. Revoke Dee's link and reload it on the other phone: "This receipt link isn't available."

**On the web (same account):**
1. Open the same split receipt: same number, same lines. Print to PDF.
2. Share → create a link for Worker B, copy it, open it in a private window, tap **I have a question** and write a note. The receipt page in the app shows the question; mark it resolved.
3. Generate Worker A's statement on the web; it matches the phone's to the cent.
4. As member-c (partner): you can share receipts and generate statements.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 6 ready for review".
