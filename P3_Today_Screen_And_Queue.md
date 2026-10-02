# Phase 3 — Today: one-tap recording, Undo, previous workday, offline queue (iPhone and web)

> **Before pasting:** Phase 2 and the TestFlight checkpoint have passed. Nothing else to set up.

## Goal

The core daily job. Someone in the workspace opens Today, taps each worker's work option, and it's saved. Each tap can be undone for 5 seconds. Unrecorded workers can be marked No work in one step. Yesterday's work can be copied to today after a preview. Hours have a proper sheet with start, end and break. Entries made without signal stay on the phone and are sent later to the **right workspace**, never lost and never counted twice. The partner records exactly like the organizer.

On the web: a **day sheet** for the whole crew, a single **record work** page, **work history** with filters, and entry detail with corrections.

The revised Today layout is the target, with the 1.4 behaviour it dropped put back (spec decision D6): one-tap Full / ½ / No work with Undo, bulk Mark rest, the project switcher, hours for daily workers, and the over-12-hour confirmation. The revised Needs recording / Recorded split replaces 1.4's Cards · List switch and Unrecorded-only filter (spec section 10.3, `TodayList`).

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: sections 10 "Home screens: changes from 1.4", 11 "Money rules: keep, adopt, must not build" and 12 "Web app".
- `docs/CrewTally_Native_App_Design_v1.4.md`: "Today, top to bottom", "Per-tap save and Undo", section 6 (daily entry rules, work history, states, multiple projects on one date) and section 11 (connectivity).
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase` = `P3`. Read each `rules_and_conflicts`.
- iPhone pictures in `docs/screens-2.0/mobile/`: `Today`, `TodayDark`, `TodayList`, `TodayOffline`, `TodayHours`, `TodayOther`, `TodayMarkRest`, `TodayComplete`, `TodayLargeText`, `TodaySample`, `PreviousWorkday`, `WorkHistory`, `EditWorkEntry`. Also `NeedsReview` and `ConflictReview` (Phase 7 restyles them; this phase builds them working).
- Web pictures: `docs/screens-2.0/web/home/record-work.png`, `home/history.png`, `home/work-review.png`, and `web/desktop/` + `web/mobile/` for `record-work`, `work-review`, `work-saved`, `history`, `entry`, `sync`.
- `db/schema.sql`: `record_work` (VOID and `expected_version`), `mark_rest_no_work`, `day_reviews`, `assignment_balances`; and `trg_work_revisions_plan_limit` in 0004.

## Build

### 1. Server: rules for every route in this phase
- Every route is a `memberRoute` with its action and `kinds: ['HOME']` (Phase 2's rule).
- Every handler checks that the project or assignment belongs to the workspace before calling a function. The functions check too. Keep both.
- The day, history and preview routes return amounts from the server only. Previews are calculated with `shared/pay.ts`; saved amounts always come from `record_work` (`fn_earned`).
- Error mapping added in this phase:
  - `record_work` "no pay agreement for date" → 422 `NO_RATE_FOR_DATE` ("<Worker> is waiting for a rate. Work can't be recorded until it's set.").
  - mode doesn't fit the pay basis → 422 `WRONG_MODE`.
  - date outside the assignment → 422 `DATE_OUTSIDE_ASSIGNMENT`; archived project → 422 `PROJECT_ARCHIVED`.
  - SQLSTATE `40001`: message "stale version" → 409 `STALE_VERSION`; "operation reused…" → 409 `OPERATION_REUSED`.
  - `CT402` → 402 `PLAN_LIMIT` (Phase 2).

### 2. Server: routes

| Route | Action | What it does |
|---|---|---|
| `GET /v1/projects/:id/day/:date` | `workspace.read` | Everything Today needs for one date, in a bounded number of queries (no N+1). `date` must be `YYYY-MM-DD`. Returns `project` (id, name, timezone, `is_work_day`, status); `cards`: every assignment active on the date, each with worker id and name, assignment id, `rate_status` (`SET`, or `WAITING` when no agreement is in force on that date), pay basis, `rate_minor`, `standard_day_minutes`, and `entry` (null when Unrecorded, including when the active revision is VOID; otherwise `version`, `mode`, `portion`, `minutes`, `earned_minor`, `note`, `corrected`); `summary`: `owed_minor` (sum of **positive** balances on this project), `advance_minor` (sum of negative balances, as a positive number), `unrecorded_count` (work days only, cards with a rate only), `waiting_count`, `payments_reviewed`, `previous_workday` (date or null; see below). |
| `PUT /v1/work/:assignmentId/:date` | `work.record` | `{operation_id, mode, portion?, minutes?, times?, confirm_long_day?, expected_version, note?, reason?}` → `record_work`. Rules below. Returns `{entry, earned_minor, delta_minor, version, warnings}`. |
| `POST /v1/work/:assignmentId/:date/void` | `work.record` | `{operation_id, expected_version, reason}` → `record_work` with mode VOID. Reason required (422 without). |
| `POST /v1/projects/:id/day/:date/mark-rest` | `work.record` | `{operation_id}` → `mark_rest_no_work`. Returns `{marked}`. Not a work day → 422 `NOT_A_WORK_DAY`. |
| `POST /v1/projects/:id/day/:date/review` | `money.record` | "No payments today": upserts `day_reviews` for that project and date (not money; app code may write it, scoped by workspace). |
| `GET /v1/projects/:id/day/:date/previous` | `workspace.read` | The preview for **Use previous workday** (below). |
| `POST /v1/projects/:id/day/:date/copy-previous` | `work.record` | `{operation_id, source_date, lines:[{assignment_id, operation_id}]}`. Copies in **one transaction** (below). |
| `GET /v1/work?project_id=&worker_id=&from=&to=&state=ALL\|RECORDED\|UNRECORDED\|CORRECTED&cursor=` | `workspace.read` | Work history, newest first, keyset-paged. Rows: date, project, worker, pay basis, input ("½ day", "7 h 30 m", "6 h of 8 h day", "No work"), rate, earned, note, `corrected` (revision > 1), version. UNRECORDED lists every **work day** in the range with no entry (or a VOID entry) for each assignment active that day, from `generate_series` joined to the project's `work_days`; it includes waiting assignments, labelled. UNRECORDED ranges are at most 93 days (422 otherwise). |
| `GET /v1/work/:assignmentId/:date/revisions` | `workspace.read` | Every revision: mode, input, rate snapshot, earned, reason, time, and who recorded it: "You" for the caller, else their display name, else (for the organizer) their invitation label, else the role ("Partner"); "Former member" for a deleted user (spec section 7.4). Rate and earned only with `money.view`. |

Phase 5 keeps `GET /v1/work` and adds exports; it doesn't rebuild it.

**Rules for `PUT /v1/work`:**
- `mode` is `DAY_PORTION`, `DAY_MINUTES`, `HOUR_MINUTES` or `NO_WORK`.
- `portion` travels as a string matching `^(0(\.\d{1,4})?|1(\.0{1,4})?)$` and greater than 0. Pass it to SQL as text and cast to numeric. Never turn it into a JavaScript number.
- `minutes` is an integer, 1–1440.
- `times` (optional, for hours entered as start and end): `{start: "HH:MM", end: "HH:MM", break_minutes, ends_next_day}`. The server recomputes with `shared/hours.ts`:
  - `end` not after `start` and `ends_next_day` false → 422 `TIMES_INVALID` ("End time is before start time. If the shift ended the next day, turn on Ends the next day.");
  - shift length = end − start (+ 1440 only when `ends_next_day` is true); over 1440 → 422;
  - `break_minutes` ≥ shift length → 422 `BREAK_TOO_LONG` ("The break is as long as the shift.");
  - shift − break must equal `minutes` → otherwise 422 `TIMES_MISMATCH`.
  The times themselves aren't stored; only minutes are.
- Over 12 hours (`minutes` > 720) needs `confirm_long_day: true` → otherwise 422 `CONFIRM_LONG_DAY`. This applies to hourly and daily-with-hours entries.
- When `expected_version` > 0 and there's no reason, use "Changed on Today". The web entry page and the iPhone correction screen always send a typed reason.
- **Same worker, several projects, one date.** After saving, if that worker's active entries on that date across all projects add up to more than one day (portions, plus day-hours as a fraction of their day length) or more than 16 hours of hours entries, add `warnings: [{type: "SAME_DAY_OTHER_PROJECTS", projects: [...]}]`. It's a warning, never a block. The apps show "Worker A also has work on Bathroom on this date. Check it's right." with a link.

**Use previous workday:**
- The previous workday is the latest date before `:date` on which this project has at least one active entry that isn't VOID.
- `GET …/previous` returns `{source_date, lines, skipped}`; the app shows each line with a checkbox, ticked by default, and sends only the ticked ones. A line is an assignment that's **Unrecorded** on the target date, active on it, with an agreement in force on it, and with an active non-VOID entry on the source date. Each line carries the source entry exactly as recorded (mode, portion or minutes, so "½ day", "7 h 30 m" or "No work") and `preview_earned_minor` at the agreement in force **on the target date**, from `shared/pay.ts`. Notes aren't copied.
- `skipped` lists, with a plain reason, the ones that can't be copied: waiting for a rate; the source was hours of a daily day but the target agreement has no day length; the pay basis changed between the two dates ("record this one by hand"). Workers already recorded on the target date aren't listed at all.
- `POST …/copy-previous` re-reads every source entry from the database (it never trusts amounts or modes from the client), checks each target is still Unrecorded, and calls `record_work` for each line with that line's `operation_id` and `expected_version` 0 (or the VOID entry's version). If any target was recorded in the meantime → 409 `ALREADY_RECORDED` with the list, and nothing is written. The batch `operation_id` goes through the idempotency helper, so a retry returns the same result.
- Online only.

### 3. iPhone: Today

Follow `Today` for layout and style. From top to bottom:
- **Header:** the project switcher (active projects and **Manage projects**; the last project is remembered per workspace), connection state, and an "n waiting to send" pill when the current workspace has queued entries. The pill opens the queue view.
- **Date row:** ‹ date ›, the calendar on tap, and "Work day" or "Not a work day". Dates come from the project's time zone helpers; never use `new Date()` arithmetic on device time for work dates.
- **Summary:** "Owed on this project" from the server only (`Money` component), "Paid in advance $x" on its own line when there is one, "+$120.00 waiting to send" on its own line when the queue has entries for this project and date, and "Unrecorded: n" as a `StatusLabel` on work days. When showing cached data: "As of 3:42 pm".
- **Use previous workday** (when `previous_workday` is set and someone is Unrecorded) → `PreviousWorkday`: "Copy Wednesday's work to today?" Each line has a checkbox (ticked by default) and shows the worker, what they had ("½ day", "7 h 30 m", "No work") and today's amount; skipped workers under "Not copied" with their reason; **Record n workers** (n = ticked lines) / **Cancel**. Online only.
- **Needs recording** (the cards still Unrecorded):
  - Daily: **Full · ½ · Other · No work**. Other opens `TodayOther`.
  - Hourly: **Hours · No work**. Hours opens `TodayHours`.
  - Waiting for rate: "Waiting for <organizer> to set the rate" with the Waiting for rate label and no record buttons; the organizer sees **Set rate** instead.
  - The tapped option shows filled with a check mark **and** text; never colour alone. The card shows the amount, or "Unrecorded".
- **Recorded** (collapsible): recorded cards with their choice, amount, a note icon, "Waiting to send" when queued, and "Corrected" when revision > 1. Tapping an option again changes it (a correction with the reason "Changed on Today"). The ⋯ menu has **Change**, **Add note** (up to 500 characters), **Clear entry** (VOID; asks for a reason and confirms; online only) and **Work history**.
- **Compact rows.** There's no Cards · List switch and no Unrecorded-only toggle: the Needs recording / Recorded split does that job. When a project has more than six workers, cards become compact 56 pt rows (name and pay on the left, the work buttons or what's recorded and the amount on the right), with the same one-tap buttons.
- **Mark rest as no work (n)**, only on a work day with someone Unrecorded → `TodayMarkRest`: "Mark 3 workers as No work? Only workers with nothing recorded change." → mark-rest. Online only.
- **Pay what's owed ($x)** when the project's owed total is above zero (Phase 4 builds the screen; until then a placeholder screen), and **No payments today** (marks the day reviewed; shows a check).
- **Day complete** (`TodayComplete`): when everyone with a rate is recorded on a work day, a banner "Everyone's recorded for Thu 24 Sep." with the same bottom actions.
- **Empty states:** no project (link to setup); no workers (link to add); waiting-only ("Set a rate to start recording").
- **Offline** (`TodayOffline`): a banner "No connection. Work you record stays on this phone and is sent when you're back online. Payments need a connection." Today renders from the cache straight away, then refreshes. Mark rest, Clear entry, Use previous workday and Set rate show disabled with "Needs a connection".
- **Dark mode and large text** (`TodayDark`, `TodayLargeText`): full dark tokens; at the largest Dynamic Type sizes the cards go to one column and worker names scale with everything else (the picture's small names are a bug; don't copy it).
- **Sample** (`TodaySample`): the sample banner with **Start my own project**; no sync line or "Synced at"; taps show "This is sample data". No writes and no API calls.

**`TodayOther`** (daily worker): **Full**, **½**, **¼**, **¾**, a fraction picker (1/3, 2/3, 1/8, 3/8, 5/8, 7/8, converted to a 4-decimal string by rounding half up at the 4th place and shown as "⅓ day (0.3333)"), a typed decimal (text, up to 4 decimals, more than 0 and at most 1), and **Enter hours** when a day length is set (`DAY_MINUTES`, with the same 12-hour confirmation). The design dropped ¾, fractions and hours: keep them.

**`TodayHours`** (full screen):
- **Duration:** quick picks 4, 6, 8, 10 h; hour and minute steppers (minutes in steps of 5, with a free field for exact minutes).
- **Start & end:** start, end, unpaid break in minutes, and **Ends the next day** (off by default). Uses `shared/hours.ts`, the same function the server uses. Errors: "End time is before start time. If the shift ended the next day, turn on Ends the next day." and "The break is as long as the shift."
- Over 12 hours: "That's 13 h 30 m. Save it?" **Save** / **Change**; the request then carries `confirm_long_day`.
- Live amount from `shared/pay.ts` on the Save button. Optional note.

**Undo:** every tap shows "Worker B saved · ½ day   **Undo**" for 5 seconds.

### 4. iPhone: work history and corrections
- **Work history** (`WorkHistory`; from More, from a worker, and from a card's ⋯): filters for worker, project and period (This week, Last week, This month, Custom), and chips **All · Recorded · Unrecorded · Corrected** (the design dropped them; keep them). Rows: date, worker, project, input, earned, note icon, "Corrected". Tap → entry.
- **Correct work entry** (`EditWorkEntry`): the current entry, **Change** (the same controls as Today), **Change to No work**, **Clear entry**, and the revision list (time, input, earned, reason, who). Every change asks **"Why are you changing this?"** (required; the design has no reason field, but the database requires one). Change and Change to No work go through the queue; Clear entry is online only.
- **Needs review** (More → Needs review, with a badge; built working now, restyled in Phase 7): for each rejected entry, "Your entry" next to "Saved version", with amounts, and **Keep saved version** (discards the local entry) or **Replace with mine** (a new entry against the current version, reason "Replaced after conflict"). Plan-limit and pay-rate rejections show the server's message with **Remove from this phone**.

### 5. iPhone: the queue (`mobile/lib/workQueue.ts`)

Local SQLite (`expo-sqlite`), two tables:

**ops**

| Column | Meaning |
|---|---|
| `op_id` | primary key (UUID v4; also the request's `operation_id`) |
| `user_id` | who made it |
| `workspace_id` | the workspace it belongs to; **always** sent as `X-Workspace-Id` for this op |
| `project_id`, `assignment_id`, `work_date` | the entry it's for |
| `payload_json` | the request body |
| `base_version` | expected server version |
| `preview_delta_minor` | the change it would make, from `shared/pay.ts`, for the "waiting to send" line |
| `state` | HELD, PENDING, SENDING, DONE, REJECTED, BLOCKED |
| `error_json` | the server's error, when rejected or blocked |
| `created_at`, `updated_at` | timestamps |

**cache_day**: key `(user_id, workspace_id, project_id, work_date)`; `json` (last server response); `fetched_at`.

**On tap:**
1. In **one SQLite transaction**, insert an op with state HELD, a new `op_id`, the **current workspace id**, and `expected_version` from the cached entry (or 0).
2. Only after the commit, show the choice on the card with "Waiting to send" and the preview amount.
3. Show the Undo snackbar for 5 seconds.

**Undo** within 5 seconds deletes the HELD op. Nothing was sent. After 5 seconds, or when the screen loses focus or the app goes to the background, HELD becomes PENDING.

**Sender:**
- One at a time, FIFO by `created_at`, only for the **signed-in user's** ops, across all of that user's workspaces. Each request uses the op's own `workspace_id`. **Never** the current workspace, never another one.
- Starts on a PENDING insert, on app foreground, when the network comes back (`expo-network`), and on **Send now**.
- Backoff with jitter (1 s, 2 s, 4 s … 60 s max) on network errors and 5xx.
- 2xx → DONE; store the server result in `cache_day`; remove the pending overlay.
- 409 or 422 → REJECTED; the entry moves to Needs review. 402 → REJECTED with the plan message.
- 403 → REJECTED with "You no longer have the right to do this here."
- **404** → set every HELD and PENDING op for **that workspace** to BLOCKED. If it's the current workspace, show Access removed, then the switcher. Never retry a BLOCKED op, and never move it to another workspace.
- 401 → pause and ask to sign in, keeping every op. After sign-in, only that same user's ops resume. If a different user signs in on this phone, the first user's ops stay untouched and unsent.
- Never drop an op silently.

**Same card twice:** a new tap while an op is HELD replaces that op's payload (still one op). If an op is already PENDING or SENDING, the new tap becomes a new HELD op whose base version is filled in after the earlier one completes. Ops for the same card stay in order.

**Pending never counts in balances.** Posted totals come only from the server. The "waiting to send" line sums `preview_delta_minor` of HELD, PENDING and SENDING ops for this workspace, project and date. DONE, REJECTED and BLOCKED ops are excluded, so nothing is counted twice.

**Couldn't send (access removed):** Needs review has a section "Not sent: you no longer have access to <workspace>" listing each BLOCKED entry (date, project, worker, what was entered). **Share as a list** opens the share sheet with plain text, one line per entry. **Remove from this phone** asks to confirm. Nothing else happens to them.

**Switching workspace** doesn't touch the queue: other workspaces' ops keep sending in the background with their own workspace id. The pill and the pending line show the current workspace only; Diagnostics shows totals for all.

**Sign out** with unsent entries warns: "2 entries haven't been sent. They stay on this phone and send when you sign in again."

**Offline:** recording, changing and adding notes work through the queue. Mark rest, Clear entry, Use previous workday and all money writes are disabled with "Needs a connection". The queue survives an app kill: ops are written before the UI shows them.

**Sample mode:** the queue refuses every insert (`SampleModeError`). Nothing is stored.

### 6. Web

Add **Today** (the day sheet for the current project) and **History** to the navigation. The partner sees both. Paths follow Phase 1c's layout (`…/x` = `/app/w/:workspaceId/x`).

| Web route | Screen | What it does |
|---|---|---|
| `…/projects/:id/day/:date` | `home/record-work` (Home "record everyone") | One row per worker on the project for that date, from the day route. Daily: **Full · ½ · Other · No work** (Other: ¼, ¾, fraction, typed portion, hours when a day length is set). Hourly: an hours field (decimal hours or h:mm) and **No work**. Waiting: "Waiting for rate". A blank row stays **Unrecorded** and sends nothing. The page says: "Leave a row blank if you haven't recorded it yet. Blank isn't No work." Also: project switcher, date picker, **Mark rest as no work (n)**, **Use previous workday**, owed and paid-in-advance totals apart. **Review** → `work-review`. |
| (review step) | `home/work-review`, `work-review` | Lists only the rows that will change: worker, what's being recorded, amount (preview), and for a change, the old amount. Over 12 hours: a confirmation checkbox on that row. **Save n entries** sends one `PUT` per row, each with its own `operation_id`. |
| (result) | `work-saved` | Per row: "Saved" or the server's reason. Rejected rows keep their input on the day sheet. Home work is never shown as Approved, Pending or Submitted. |
| `…/work/new` (review `…/work/new/review`, result `…/work/saved`) | `record-work` | One entry: worker, project, date, the same choices as a row, note → review → saved. |
| `…/work` | `home/history`, `history` | Filters: project, worker, date range, and **All · Recorded · Unrecorded · Corrected** (not the design's Pending/Approved/Returned/Draft). Columns: date, worker, project, input ("½ day", "7 h 30 m", "No work"), rate, earned, note, "Corrected". **Export CSV** shows disabled with "Available in the next update" (Phase 5). |
| `…/work/:assignmentId/:date` | `entry` | The current entry and the revision timeline (input, earned, reason, time, who). **Change**, **Change to No work** and **Clear entry**, each asking for a reason. No approval wording. |
| `…/sync` | `sync` | Connection status only: "The web app needs a connection to save. Nothing is stored in this browser." |

**Decimal hours on the web** (`shared/hours.ts`, used by the server too):
- Accept `7`, `7.5`, `7.25`, `7:30`, `7h30`. Parse as **text with integer math**: whole hours times 60, plus the fraction digits times 60 divided by 10 to the number of digits. The result must be a whole number of minutes, or it's refused: "Use whole minutes, like 7:20 or 7.25." So `7.5` → 450, `7.25` → 435, `7.1` → 426, `7.05` → 423, and `7.33` or `7.333` are refused.
- 1 to 1440 minutes. Over 12 hours asks to confirm. Never `parseFloat`.

**The web has no offline queue and no drafts** (spec section 12.2). Without a connection, **Save**, **Correct**, Mark rest, Clear entry and Use previous workday are disabled with "Needs a connection". A save that fails keeps the form filled with "Not saved. Try again." and the same `operation_id`. Nothing is stored in the browser, and the saved entry and its amount stay exactly as they are until the server accepts a change.

## Tests

**Server**
- Day endpoint: Unrecorded is null (T07); a non-work day has `is_work_day=false` and `unrecorded_count=0` (T09); an ended assignment is excluded; a VOID entry is null; a waiting assignment is `WAITING` and not counted as Unrecorded; `owed_minor` ignores negatives and `advance_minor` shows them (T17-style).
- PUT: daily full and half; hourly 7 h 30 m at $30/hr earns 22500 (T02); a day portion on an hourly agreement → 422 (T06); date outside the assignment → 422 `DATE_OUTSIDE_ASSIGNMENT`; archived project → 422; stale version → 409 `STALE_VERSION`; the same `operation_id` twice → identical body and one ledger row; the same id with a different body → 409 `OPERATION_REUSED`; a waiting assignment → 422 `NO_RATE_FOR_DATE`; the 4th paid worker on Free → 402.
- Times: 08:00–16:30 with 30 min break → 480; 22:00–06:00 with `ends_next_day` → 480; 22:00–06:00 without → 422 `TIMES_INVALID`; **08:00–08:10 with a 30 min break → 422 `BREAK_TOO_LONG`** (never 23 h 40 m); break equal to the shift → 422; minutes not matching the times → 422.
- 721 minutes without `confirm_long_day` → 422; with it → 200; 1441 → 422.
- Correction: full to half at $180/day posts −$90 and keeps revision 1 (T11); a correction with no reason gets "Changed on Today".
- Mark rest: only Unrecorded workers with a rate change, the count is right (T08); a non-work day → 422.
- Use previous workday: copies a ½ day, a 7 h 30 m and a No work exactly; amounts use the agreement in force on the **target** date (set a rate change between the two dates and check); skips waiting, ended, basis-changed and day-hours-without-day-length lines with reasons; never lists or touches anyone already recorded; one target recorded between preview and copy → 409 and nothing written; a retry with the same `operation_id` → the same result and no new rows.
- Same-day warning: a full day on two projects returns `SAME_DAY_OTHER_PROJECTS`, and both entries are saved.
- History: filters by project, worker, dates and state; UNRECORDED lists work days only; over 93 days → 422.
- No N+1: the day endpoint runs the same number of queries with 3 and with 30 workers.
- `work_revisions.recorded_by` = the signed-in user, for organizer and partner.
- Isolation: another workspace's project or assignment → 404 on every route.
- **Role matrix — add these rows** (both session kinds):

| Route | Action | Organizer | Partner | Business roles | Removed, outsider |
|---|---|---|---|---|---|
| `GET /v1/projects/:id/day/:date`, `…/previous` | workspace.read | 2xx | 2xx | 404 (kind) | 404 |
| `PUT /v1/work/:assignmentId/:date`, `…/void` | work.record | 2xx | 2xx | 404 | 404 |
| `POST /v1/projects/:id/day/:date/mark-rest`, `…/copy-previous` | work.record | 2xx | 2xx | 404 | 404 |
| `POST /v1/projects/:id/day/:date/review` | money.record | 2xx | 2xx | 404 | 404 |
| `GET /v1/work`, `GET /v1/work/:assignmentId/:date/revisions` | workspace.read | 2xx | 2xx | 404 | 404 |

**Mobile** (jest, in-memory or mocked SQLite)
- Undo inside 5 seconds leaves nothing to send (T10).
- An op written then "app restart" (a new queue on the same database) is still PENDING and sends once (T29).
- A 409 moves to REJECTED and Needs review; nothing is lost (T30).
- The waiting-to-send total excludes DONE, REJECTED and BLOCKED ops, and the posted total never includes pending ops.
- Ops for the same card send in order.
- **Workspace:** an op made in workspace A, then a switch to workspace B: the op is still sent with A's id. A 404 for A blocks A's ops, never sends them to B, and lists them under "Not sent"; Share as a list produces one line per entry.
- A different user signing in doesn't send the first user's ops.
- Fractions: 1/3 → "0.3333", 2/3 → "0.6667", 1/8 → "0.1250".
- `shared/hours.ts`: the same table as the server times tests.
- Nine workers render as compact rows without scrolling at the default text size (T48); recorded workers move to the Recorded section.
- Sample mode: recording a day throws `SampleModeError` and makes no request (T46 extended).
- Offline: Mark rest, Clear entry and Use previous workday are disabled with "Needs a connection".

**Web**
- Decimal hours: `7.5` → 450, `7.25` → 435, `7:30` → 450, `7h30` → 450, `7.1` → 426, `7.33` refused, `7.333` refused, `0` refused, `24.01` refused, `abc` refused. No `parseFloat` anywhere in `web/src` or `shared/`.
- A blank row sends nothing; **No work** sends `NO_WORK`; the review lists only changed rows.
- Each saved row has its own `operation_id`, kept across a retry.
- Offline, Save and Correct are disabled with "Needs a connection"; a failed save keeps the form filled and the saved entry and totals unchanged; nothing is written to `localStorage` or IndexedDB.
- History shows no Pending, Approved, Submitted or Returned words for Home.

## Must-not-build items for this phase
From spec section 11, "Prototype behaviours that must not be built", and the CSV:
- **Work saved on the phone counts in the balance before it syncs.** → Posted totals from the server only; pending on its own line. Tested in the mobile totals test.
- **Two taps per worker and No work with no Undo**, and **no bulk Mark rest.** → One tap, Undo, Mark rest. Tested by T08 and T10.
- **"Use previous workday" that writes 8 h or a full day for everyone.** → Copies each worker's real entry and reprices at the target date. Tested in the copy tests.
- **Start, end and break that wrap past midnight** (08:00–08:10 with a 30-minute break becoming 23 h 40 m). → Break ≥ shift refused; overnight only with Ends the next day. Tested on server and in `shared/hours.ts`.
- **Decimal hours that can't be stored as whole minutes.** → Refused, never rounded. Tested on web and server.
- **Web timesheet copy that says blank means "did not work".** → Blank stays Unrecorded. Tested in the web blank-row test.
- **A web offline correction that hides the original's earnings until it's resubmitted.** → The web never saves offline; the saved entry stays until the server accepts a change. Tested in the web offline test.
- **Corrections with no reason.** → Reason required on the correction screens.
- **Dropping ¾, fractions, hours for daily workers and the over-12-hour confirmation.** → All kept. (The Needs recording / Recorded split and compact rows replace the 1.4 list view and Unrecorded filter.)
- **Pay taken from a "current rate" instead of the agreement for the work date.** → `record_work` and the previous-day preview use the date's agreement.
- **Queued entries sent to whichever workspace is open.** → Each op carries its workspace. Tested in the workspace queue tests.

## Proof to paste at the gate
- The day endpoint SQL.
- The `PUT /v1/work` handler, including the times and 12-hour checks.
- The copy-previous handler.
- `shared/hours.ts`.
- `workQueue.ts` in full.
- The web day sheet's save function.
- The role matrix rows added in this phase, and the pass count.
- Test output, including the N+1 query-count test, and file names and counts for all four suites.

## Try it on your phone (Expo Go, developer sign-in as owner-a)
1. Tap **Full** for Worker A, then **½** for Worker B, then **Undo** within 5 seconds. B is back to Unrecorded; pull to refresh and the server has only A.
2. Worker C → Hours → Start & end, 08:00 to 08:10 with a 30-minute break: you get "The break is as long as the shift." Change to Duration 7 h 30 m: $225.00.
3. Turn on Airplane Mode and tap **No work** for another worker. It shows "Waiting to send" and the pill says 1. Kill the app and reopen: still waiting. Turn off Airplane Mode: it sends and the pill clears. The owed total never included it while it was waiting.
4. Tomorrow: tap **Use previous workday**. The preview shows Full for A, 7 h 30 m for C and today's amounts. Record. Anyone you'd already recorded wasn't touched.
5. **Mark rest as no work** marks only workers with nothing recorded.
6. Work history → Unrecorded shows the work days nobody recorded. Open an entry, change it: it asks why.
7. Sign in as **member-c** (partner). Record a day for Worker A: it works. Turn on Airplane Mode and record two more entries. Then, on the web, sign in as owner-a and remove member-c. Turn Airplane Mode off on member-c's phone: "Access removed", and Needs review lists the two entries under "Not sent", with **Share as a list**. Nothing appears in owner-a's workspace or any other.

## Try it on the web
1. Open Today on the web for Kitchen. Leave one row blank, set one to Full, one to No work, and type `7.33` for an hourly worker: "Use whole minutes". Change it to `7:20`. Review lists three rows. Save. The blank worker is still Unrecorded on the phone.
2. Type `13` hours for someone: the review asks you to confirm.
3. History: filter by worker and This week; Unrecorded shows the blank day. Open an entry and change it: a reason is required.
4. Turn off Wi-Fi: Save and Correct are greyed out with "Needs a connection", and the entry and totals still show the saved values. Turn Wi-Fi on and save.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 3 ready for review".
