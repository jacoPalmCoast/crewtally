# Phase 2 — Projects, workers and pay agreements (daily or hourly)

## Goal

The owner sets up a project, adds workers, and gives each worker a daily or hourly rate on that project. This is the whole first-run setup, from spec section 3.

## Read first
- Spec section 3 (first use, project setup, worker setup, pay agreements) and section 7 (rate changes).
- `db/schema.sql`: the tables `projects`, `workers`, `assignments` and `rate_agreements`, and the functions `preview_rate_change` and `apply_rate_change`.
- `db/tests/04_reimb_adj_rest_rates.sql`, to see how rate changes behave.

## Build

### API (all under `requireSession`; `workspaceId` from `req.ctx` only)

**Projects**
- `GET /v1/projects?status=ACTIVE|ARCHIVED` returns a list with a count of assigned workers.
- `POST /v1/projects` takes `{name, timezone, work_days, address?, start_date?}`.
  - `timezone` must be a valid IANA name; check it against `Intl.supportedValuesOf('timeZone')`.
  - `work_days` is an array of ISO weekdays 1–7, non-empty, no duplicates. The default is `[1,2,3,4,5,6]`.
- `PATCH /v1/projects/:id` takes `{expected_version, ...fields}` and increments `version`. A stale version returns 409.
- `POST /v1/projects/:id/archive` and `/reopen` each take `expected_version`.

**Workers**
- `GET /v1/workers` returns each worker with their assignments (project name, pay basis and current rate, balance from `assignment_balances`).
- `POST /v1/workers` takes `{display_name, phone?, email?}`.
  - Validate the email format. Phone is free text of at most 30 characters.
  - The response includes `warnings:[{type:"POSSIBLE_DUPLICATE", worker_id}]` when the name (case-insensitive), phone or email matches an existing worker. Never merge automatically.
- `PATCH /v1/workers/:id` takes a version and fields. `POST /v1/workers/:id/deactivate`.
- There is no delete route for workers.

**Assignments and agreements**
- `POST /v1/assignments` takes `{project_id, worker_id, start_date, agreement:{pay_basis, rate_minor, standard_day_minutes?, effective_from}}`.
  - Insert the assignment and its first `rate_agreements` row in one transaction.
  - `effective_from` must equal `start_date` for the first agreement.
  - The project must be ACTIVE.
  - `rate_minor` is an integer. The caps come from the table constraints: $5,000/day, $1,000/hour.
  - `standard_day_minutes` is allowed only for DAY, between 60 and 1440.
- `GET /v1/assignments/:id` returns the assignment with all agreements, newest first, and the one in force today (in the project timezone).
- `POST /v1/assignments/:id/agreements/preview` takes `{effective_from, pay_basis, rate_minor, standard_day_minutes?}` and returns the result of `preview_rate_change`.
- `POST /v1/assignments/:id/agreements` takes `{operation_id, effective_from, pay_basis, rate_minor, standard_day_minutes?, reason?, confirm}` and calls `apply_rate_change`.
  - SQLSTATE `55000` returns 409 `CONFIRMATION_REQUIRED` with the preview in the body.
  - A blocked basis change returns 422 with the database's message.
- `PATCH /v1/assignments/:id` takes `{expected_version, end_date}` to end an assignment. You can't set an end date before the last recorded work date. That check is trivial now and becomes real in Phase 3.

"Today" for any date defaults is computed in the **project timezone**, never the server's timezone. Write one helper, `projectToday(project)`, and use it everywhere.

### Mobile

**First run** (after sign-in, when the workspace has no projects): a three-step setup flow.
1. **Project.** Name, plus timezone prefilled from the device and shown as "Times use America/New_York" with a Change link. Work days show as seven toggles, Monday–Saturday on by default.
2. **Workers.** Add one or more by name, with phone and email optional and entered manually. Show the duplicate warning inline if the API returns one.
3. **Pay** for each worker:
   - A segmented control: **Daily rate** / **Hourly rate**. Then the rate, using the decimal pad and `shared/money.ts` parsing.
   - For daily only: an optional "Standard day length", like "8 h", which enables hours entry.
   - "Starts on" defaults to project today.
   - Show a live example under the field: "Full day = $240.00 · ½ day = $120.00", or "8 h = $240.00", computed with `shared/pay.ts`.

**Projects** (More → Projects): active and archived lists, plus New project. Project detail shows name, timezone, work days, and assigned workers with pay, plus Edit and Archive/Reopen. Archive confirms first: "Archiving stops reminders and new entries. History stays."

**Workers tab:**
- A list of workers with a pay summary, for example "Kitchen · $240/day".
- Worker detail per `docs/screens/WorkerDetail.png`: balances per project with a `StatusLabel`, the pay agreement with its effective date, and a **Change pay** action.
- Leave the activity list empty until Phase 5.

**Change pay flow:**
1. Pick an effective date, basis and rate.
2. Call preview.
3. If days are affected, show every affected date with old amount, new amount and difference, and the total. The buttons are **Apply to all N days** (asks for a reason) and **Cancel**. There's no option to apply to some days.
4. If the change is blocked, show the database's message and suggest a date after the last recorded day.

**Project switcher** at the top of Today: the project name with a ▾ menu listing active projects and "Manage projects". Remember the last project with `expo-secure-store` or `AsyncStorage` (no sensitive data).

### Tests (server)
- **Validation:** bad timezone, empty work days, rate 0, rate over cap, `standard_day_minutes` on an HOUR agreement, first `effective_from` not equal to `start_date`, assignment to an archived project. Each returns 422.
- **Version conflict:** a stale PATCH returns 409.
- **Duplicate warning:** same name in different case produces a warning, and the worker is still created.
- **Isolation**, using the harness: for every route with an id (project, worker, assignment), another owner's id returns 404. Assigning another workspace's worker to your project returns 404 (composite foreign key or explicit check).
- **Rate change through the API:** affected days without confirm return 409 with a preview. Confirm without a reason returns 422. Confirm with a reason returns 200. Future-dated change returns 200 with no confirm needed. Use `record_work` directly in test setup to create recorded days.
- **projectToday:** a project in `Pacific/Auckland` versus one in `America/Los_Angeles` gives different dates for the same instant.
- **Smoke test** extended to the new routes.

### Tests (mobile)
- The pay example text for daily with a day length, daily without, and hourly.
- The rate field rejects "12.345" and "-5", and accepts "$1,245.50".

## Additions in baseline 1.2 (build these in this phase)

### Worker documents language
- Use the `document_language` column on `workers` (`en` default or `es`; already in `db/schema.sql`). Add it to `POST /v1/workers` and `PATCH /v1/workers/:id`.
- On the worker edit screen (`docs/screens/WorkerEdit.png`), add a "Receipts and statements in" control: **English · Español**, with helper text "Changes the worker's receipts, statements and sign-off screen. Your app stays in English."

### First run: set up or look around (`docs/screens/Welcome.png`, `TodaySample.png`)
- After the first sign-in with an empty workspace, show two choices: **Set up my project** (the three-step setup) and **Look around first**.
- Look around loads a **sample project** from `mobile/sample/sample-project.json`, bundled with the app.
  - Contents: Kitchen remodel, workers Marco Reyes ($240/day, 8 h day), Dee Thompson ($180/day), Luis Ortega ($30/hr) and Sam Kowalski ($28/hr), and two weeks of history.
  - Build this file so its balances match `docs/screens`: Marco $160.00, Dee $170.00, Luis $675.00, Sam $240.00 owed.
  - All amounts are calculated with `shared/pay.ts`.
- Sample mode is a single app state, `mode: 'sample' | 'real'`. While it's on:
  1. Every screen shows the banner "Sample project — nothing here is real" with **Start my own project**.
  2. The API client **refuses any write**, throwing a `SampleModeError`. Screens that would record or share show "This is sample data" instead.
  3. Reads come from the sample file, not the API.
- **Remove sample** in More, and creating the first real project, both clear it.

### Tests
- **Sample mode:** mock the network and walk through recording a day, recording a payment and sharing a receipt in sample mode. Assert **zero** write requests (T46).
- **Worker language:** the language field validates (`en`/`es` only) and saves.
- **Sample data:** the sample file's balances equal the values above when run through `shared/pay.ts`.

## Proof to paste at the gate
- The `POST /v1/assignments` handler.
- `projectToday`.
- The isolation test file.
- The preview/apply route code showing the 55000 → 409 mapping.

## Try it on your phone
- Tap **Look around first**. Every screen shows the sample banner, and trying to record a payment ends with "This is sample data". Tap **Start my own project** and the sample disappears.
- Set Marco's documents language to Español.
- Sign in with a second Apple ID (a family member's, or a test Apple ID) to see the three-step setup on a fresh workspace. Don't add a "reset workspace" script; invariant 11 rules it out.
- Add Worker A at $240/day with an 8 h day, Worker B at $180/day, and Worker C at $30/hr.
- Change Worker B to $200/day starting next Monday. It applies with no confirmation.
- Archive and reopen the project.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 2 ready for review".
