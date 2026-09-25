# Phase 3 — Today screen: tap to save, Undo, Mark rest, hours, no-signal queue

## Goal

The core daily job. The owner opens Today, taps each worker's work option, and it's saved. Each tap can be undone for 5 seconds. Unrecorded workers can be marked No work in one tap. Hourly workers get an hours sheet. Entries made without signal are kept on the phone and sent later, never lost and never counted twice.

## Read first
- Spec section 4 (Today, per-tap save and Undo), section 6 (daily entry rules, states, day completion) and section 11 (Release 1 connectivity).
- `docs/screens/Today.png`, the other `Today*.png` screens and `NeedsReview.png`.
- `db/schema.sql`: `record_work` (including VOID and `expected_version`), `mark_rest_no_work`, the `day_reviews` table, and the `assignment_balances` view.

## Build

### API
- `GET /v1/projects/:id/day/:date` returns everything Today needs for that date, in one query set (no N+1):
  - `project`: id, name, timezone, `is_work_day`, status.
  - `cards`: every assignment active on the date that has an agreement in force. Each card has worker id and name, assignment id, pay basis, `rate_minor`, `standard_day_minutes`, and `entry`. The entry is null when Unrecorded; otherwise it has `version`, `mode`, `portion`, `minutes`, `earned_minor` and `note`. An active revision of VOID means Unrecorded, so return null.
  - `summary`: `owed_minor` (sum of **positive** balances on this project), `advance_minor` (sum of negative balances, shown separately), `unrecorded_count` (only on work days), `payments_reviewed` (boolean).
  - Validate `date` as `YYYY-MM-DD`.
- `PUT /v1/work/:assignmentId/:date` takes `{operation_id, mode, portion?, minutes?, expected_version, note?, reason?}` and calls `record_work`.
  - `portion` travels as a string, like `"0.5"`, matching `^(0(\.\d{1,4})?|1(\.0{1,4})?)$`. Pass it to SQL as text and cast to numeric; never parse it to a JS float.
  - When `expected_version > 0` and there's no reason, use "Changed on Today".
  - The response has canonical `entry` and `earned_minor`, `delta_minor` and the new `version`.
- `POST /v1/work/:assignmentId/:date/void` takes `{operation_id, expected_version, reason}` and calls `record_work` with mode VOID. A reason is required.
- `POST /v1/projects/:id/day/:date/mark-rest` takes `{operation_id}` and calls `mark_rest_no_work`. It returns `{marked}`.
- `POST /v1/projects/:id/day/:date/review` upserts `day_reviews`. It's not money, so app code may write it, scoped by workspace.
- Every handler checks that the assignment or project belongs to `req.ctx.workspaceId` before calling a function. The functions also check. Keep both.

### Mobile — Today screen (per `docs/screens/Today.png`)
- **Header:** the project switcher from Phase 2, connection state, and a "1 pending" pill when the local queue isn't empty. Tapping the pill opens the queue view.
- **Date row:** ‹ date › with the date picker on tap. Label "work day" or "not a work day". Dates come from project timezone helpers; never use `new Date()` arithmetic on local device time for work dates.
- **Summary:** owed on this project using `Money`, an advance line if there is one, and "Unrecorded: n" as a `StatusLabel` on work days.
- **Cards**, one per assignment:
  - Daily: **Full · ½ · Other · No work**. Other opens a sheet with ¼, ¾, a fraction picker (1/3, 2/3, 1/8 and so on, converted to a 4-decimal string by rounding half up at the 4th place, and shown as "⅓ day (0.3333)"), and "Enter hours" if a day length is set.
  - Hourly: **Hours · No work**. Hours opens a sheet with quick picks (4, 6, 8, 10 h), hour and minute steppers (minutes in steps of 5, with a free field for exact minutes), and a Start / End / Break calculator. Ask for confirmation above 12 h. Allow 1–1440 minutes.
  - The selected option is filled with a check mark and text; don't rely on color alone. The card shows the earned amount, or "Unrecorded". A note icon opens a note field of up to 500 characters, saved with the entry.
  - Long-press a recorded card (or use its ⋯ menu) for **Clear entry**, which voids with a reason and asks for confirmation.
- **Mark rest as no work (n):** shown only when `is_work_day` and `unrecorded_count > 0`. It confirms "Mark 3 workers as No work?", then calls mark-rest. Online only; when offline, show the reason.
- **Review payments for today:** for now it marks the day reviewed ("No payments today") and shows a check. Phase 4 adds the payment link.
- **Empty states:** no project yet (link to setup); no workers on this project (link to add).

### Mobile — tap to save, Undo, and the queue (`mobile/lib/workQueue.ts`)
- Local SQLite (`expo-sqlite`) with two tables.

  **ops**

  | Column | Meaning |
  |---|---|
  | `op_id` | primary key |
  | `kind` | work, void |
  | `assignment_id`, `work_date` | the entry this op is for |
  | `payload_json` | the request body |
  | `base_version` | expected server version |
  | `state` | HELD, PENDING, SENDING, DONE, REJECTED |
  | `error_json` | the server's error, when rejected |
  | `created_at`, `updated_at` | timestamps |

  **cache_day**

  | Column | Meaning |
  |---|---|
  | `project_id`, `work_date` | key |
  | `json` | last server response |
  | `fetched_at` | when it was fetched |

- **On tap:**
  1. In **one SQLite transaction**, insert an op with state HELD and a new `op_id` (UUID v4). Include `expected_version` from the cached entry, or 0.
  2. Only after the commit, update the card to show the choice, "Pending", and the preview amount from `shared/pay.ts`.
  3. Show the snackbar "Worker B saved · ½ day   UNDO" for 5 seconds.
- **Undo within 5 seconds** deletes the HELD op. Nothing was sent, so nothing hits the ledger. The card goes back to its previous state.
- **After 5 seconds**, or when the screen loses focus or the app goes to background, HELD becomes PENDING.
- **Sender:**
  - FIFO by `created_at`, one at a time.
  - Starts on PENDING insert, on app foreground, on network regained (`expo-network`), and on "Send now".
  - Exponential backoff with jitter (1 s, 2 s, 4 s … max 60 s) on network errors or 5xx.
  - On 2xx: set DONE, store the server result in the cached day, and remove the pending overlay.
  - On 409 (stale version) or 422: set REJECTED with the error body. The entry moves to **Needs review**.
  - On 401: pause and ask the user to sign in, keeping the ops.
  - Never drop an op silently.
- **Tapping again** on the same card while an op is HELD replaces that HELD op's payload (still one op). If an op is already PENDING or SENDING, the new tap becomes a new HELD op whose base version is filled in after the earlier op completes. Keep ops for the same card in order.
- **Totals:** the posted summary comes from the server only. Show pending on-device changes as a separate line, "+$120.00 pending", summing preview deltas of HELD and PENDING ops. **Exclude DONE ops**, so nothing is counted twice.
- **Needs review** (More → Needs review, with a badge count):
  - For each REJECTED op, show "Your entry" next to "Saved version", with amounts.
  - Actions:
    - **Keep saved version** discards the local op.
    - **Replace with mine** creates a new op against the current server version, with reason "Replaced after conflict".
- **Offline:** the work entry queue works. Mark rest, Clear entry and all other writes show "Needs a connection" and are disabled. On open, Today renders from `cache_day` immediately, then refreshes.
- The queue survives app kill: ops are persisted before the UI shows Saved.

### Tests
- **Server:**
  - Day endpoint: Unrecorded is null (T07). Non-work day has `is_work_day=false` and `unrecorded_count=0` (T09). An ended assignment is excluded. A VOID entry is shown as null.
  - PUT: daily full and half, hourly 7 h 30 m earns 22500 (T02). A day portion on an hourly agreement returns 422 (T06). Date outside the assignment returns 422. Archived project returns 422. Stale version returns 409. The same `operation_id` twice returns the identical body and only one ledger row (T20-style). Reused `operation_id` with a different body returns 409.
  - Mark rest: only Unrecorded workers change, and the count is correct (T08).
  - Correction: full to half posts −$90 at $180/day and keeps revision 1 (T11).
  - Isolation: another owner's assignment or project returns 404 on every route.
  - No N+1: the day endpoint runs a bounded number of queries regardless of worker count. Assert the query count with 3 and with 30 workers.
- **Mobile** (jest, with an in-memory or mocked SQLite):
  - Undo inside 5 seconds leaves no op to send (T10).
  - An op persisted then "app restart" (new queue instance on the same DB) is still PENDING and sends once (T29).
  - A 409 moves to REJECTED and Needs review; nothing is lost (T30).
  - The pending total excludes DONE ops.
  - Ops for the same card send in order.
  - Fraction to 4-decimal string: 1/3 → "0.3333", 2/3 → "0.6667", 1/8 → "0.1250".

## Additions in baseline 1.2 (build these in this phase)

### List view and Unrecorded filter (`docs/screens/TodayList.png`, `TodayOffline.png`)
- Above the workers, add a **Cards · List** switch and an **Unrecorded only** toggle.
- List rows are 56 pt: name and pay on the left, what's recorded (or the Unrecorded label) and the amount on the right.
- Tapping a row opens a sheet with the same controls as the card: Full / ½ / Other / No work, or Hours / No work.
- Remember the view per project in local storage. Switch to List automatically the first time a project has more than six assigned workers.

### Bottom of Today
- Replace "Review payments for today" with two actions:
  - **Pay what's owed ($x)**: shown when the project's owed total is above zero. It opens Phase 4's payout screen; until then, a placeholder screen.
  - **No payments today**: marks the day reviewed.
- Tapping the owed total opens the project summary. That comes in Phase 5; until then, disabled.

### Tests
- Nine workers render in List view without scrolling at the default text size (T48).
- The Unrecorded filter hides recorded workers, and the choice survives an app restart.

## Proof to paste at the gate
- The day endpoint SQL.
- `workQueue.ts` in full.
- The PUT handler.
- Test output, including the N+1 query-count test.

## Try it on your phone
- Tap Full for Worker A, then ½ for Worker B, then undo B within 5 seconds. B is back to Unrecorded, and the server shows only A (check by pulling to refresh).
- Worker C → Hours → 7 h 30 m shows $225.00.
- Turn on Airplane Mode and tap No work for Worker D. It shows "Pending". Kill the app and reopen: still pending. Turn off Airplane Mode: it sends and "Pending" clears.
- Mark rest as no work marks only unanswered workers.
- Change tomorrow's date and back. The data is right on both days.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 3 ready for review".
