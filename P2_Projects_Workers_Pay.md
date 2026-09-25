# Phase 2 — Projects, workers and pay agreements (daily or hourly)

## Goal

The owner sets up a project, adds workers, and gives each worker a daily or hourly rate on that project. This is the whole first-run setup, from spec section 3.

## Read first
- `docs/screens/SetupProject.png`, `SetupWorkers.png`, `SetupPay.png`, `ChangePay.png`, `Welcome.png`, `TodaySample.png`, `Plan.png`, `LimitSheet.png`.
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

**Crew tab** (rename the Phase 0 "Workers" tab to **Crew**; the 1.4 section below turns it into My crew):
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
- **Sample mode:** mock the network and assert that every write method on the API client throws `SampleModeError` and **zero** write requests go out (T46). Phases 3, 4 and 6 extend T46 to recording a day, recording a payment and sharing a receipt.
- **Worker language:** the language field validates (`en`/`es` only) and saves.
- **Sample data:** the sample file's balances equal the values above when run through `shared/pay.ts`.

## Additions in baseline 1.3 (build these in this phase)

### Migration 0003 (provided)
- Move `db/provided/migrations/0003_plans_and_project_use.sql` to `db/migrations/` and `db/provided/tests/08_plans_limits_totals.sql` and `10_plan_hardening.sql` to `db/tests/`, byte for byte. Don't edit them; both must pass.
- 0003 also hardens every SECURITY DEFINER function (pins `search_path`, removes PUBLIC execute) and adds `harden_definer_functions()`. Any later migration that adds a SECURITY DEFINER function ends with `select harden_definer_functions();`.
- `record_entitlement_event` takes an optional last argument `p_source` (`APPLE_IAP`, `WEB` or `COMP`); update the Phase 0 wrapper signature in `server/src/db/money.ts`.
- It adds `projects.project_use`, `projects.pass_id`, the plan tables, the plan-limit triggers, `record_entitlement_event`, `plan_status`, `year_totals_with_thresholds`, `tax_thresholds` and `growth_counters`. Read the whole file first.

### Errors
- Map SQLSTATE `CT402` to HTTP **402** with body `{error:{code:"PLAN_LIMIT", message, correlationId, limit, max}}`. Take `limit` and `max` from the Postgres error `detail` (a JSON string); if it doesn't parse, send the error without them. Add the row to the error table and its test.

### API
- `POST /v1/projects` and `PATCH /v1/projects/:id` accept `project_use`: `PERSONAL_HOME` (default), `RENTAL` or `BUSINESS`. `GET` routes return it, plus `covered_by_pass: boolean`.
- `POST /v1/projects` and `POST /v1/projects/:id/reopen` accept an optional `pass_id`. It must be an unused, unrefunded pass in this workspace: another workspace's pass returns 404, an already-used pass returns 409.
- `GET /v1/plan` returns `plan_status(workspace)` plus `project_pass_enabled` (from the server setting `PROJECT_PASS_ENABLED`, default true): `pro`, `pro_expires_at`, `free_limits`, `free_active_projects`, `free_workers`, `unused_passes`, `project_pass_enabled`.
- `PATCH /v1/me` takes `{payer_display_name}` (1–60 characters). More → Account gets a **Name on receipts** field ("Shown as 'Paid by' on receipts and in messages to workers"). Until it's set, receipts and messages use "the owner".
- There is **no** route that sets a plan. Tests that need Pro call a test-only helper, `grantProForTest(workspaceId)`, which calls `record_entitlement_event` with an event id starting `test-`. It lives in the test folder and is never imported by `src/`.

### Mobile
- **Project setup, step 1** and **project edit:** add "Who is this work for?" with three choices: **My home**, **A rental I own**, **My business or a client's job**. Helper text: "Used only for the tax notes on year-end totals. You can change it later."
- **Limit sheet:** when any call returns 402 `PLAN_LIMIT`, show a bottom sheet:
  - Heading "Free covers 1 active project and 3 workers".
  - Body "Everything you've recorded stays yours on any plan."
  - Buttons **See plans** and **Not now**. Keep whatever the owner typed; nothing is lost.
- **Plan screen** (More → Plan): current plan, usage ("1 of 1 active project · 3 of 3 workers"), unused passes, and what Pro and the Project Pass include. In this phase it has **no buy buttons**; Phase 7 adds them. Wording from spec section 19, "Plans and pricing". Never say "unlock".
- **Sample mode** never shows the limit sheet or the Plan screen's usage; sample data is not a real workspace.

### Tests
- A second active project returns 402 with `limit:"active_projects"`; archive the first and the second succeeds; reopening the first returns 402 (T49).
- A fourth current worker on a free project returns 402 with `limit:"workers"`; an assignment that has already ended is allowed (T50).
- With Pro (test helper): five projects and ten workers succeed. After a `PRO_EXPIRED` event, recording work for an existing worker still returns 200, and adding a new project returns 402 (T51, invariant 16).
- `pass_id` from another workspace returns 404; a used pass returns 409 (T52).
- `project_use` validates (three values only) and saves; `GET /v1/plan` matches `plan_status` (T53).
- Two parallel requests that would each add the 4th current worker: exactly one succeeds and the other returns 402 (use two database connections) (T66).
- End-date tricks don't get past Free: a 4th worker saved as already ended is kept as history, but recording paid work for them on a new day returns 402; correcting a day that already had paid work always succeeds; an assignment can't be moved to another worker or project (422) (T67).
- Isolation on `/v1/plan`: each owner sees only their own usage.

## Additions in baseline 1.4 — My crew (build these in this phase)

Screens: `docs/screens/Workers.png` (My crew), `WorkerDetail.png`, `WorkerEdit.png`, `AddWorker.png`, `HireAgain.png`, `RateWorker.png`, `SetupWorkers.png`, `Projects.png`.

### Migration 0004 (provided)
- Move `db/provided/migrations/0004_crew.sql` to `db/migrations/` and `db/provided/tests/09_crew_ratings.sql` to `db/tests/`, byte for byte. Both must pass.
- It adds `workers.favorite`, `workers.skills` (at most 12, trimmed, no duplicates ignoring case, 1–30 characters each), `workers.private_note` (≤ 500), the `worker_ratings` table, `rate_assignment`, the `crew_summary(workspace)` function and `worker_last_rate`.

### API
- `POST /v1/workers` and `PATCH /v1/workers/:id` accept `favorite`, `skills`, `private_note`. A skills check failure is a 422 with the rule in plain words.
- `GET /v1/crew?filter=all|favorites|working|past&skill=&q=` returns rows from `crew_summary(workspace)`, favorites first, then name. `q` matches name or skill (case-insensitive). Counts for each filter come back in the same response.
- `GET /v1/workers/:id` adds the summary fields and `projects`: one row per assignment with project name, dates, days worked, earned, and the rating if any.
- `PUT /v1/assignments/:id/rating` takes `{stars, would_hire, note?}` and calls `rate_assignment`. `DELETE` isn't offered; re-rating replaces.
- `GET /v1/workers/:id/last-rate` returns `worker_last_rate` for prefill.
- `GET /v1/projects/:id/unrated` lists assignments on that project without a rating, for the rating sheet.
- Isolation on every route. Ratings and notes are **never** included in any payload used to build receipts, statements or links (Phase 6 tests this again).

### Mobile
- **Tab bar:** the second tab is labelled **Crew** and opens **My crew**. Search field (name or skill), filter chips **All · Favorites · Working · Past** with counts, a **Skill** picker, rows with name, favorite star, skills, rating and projects, and on the right either the amount owed or "Last worked [date] · [project]".
- **Add worker:** **Choose from Contacts** uses the system contact picker from `expo-contacts` (`presentContactPickerAsync`), so the app never asks for access to the whole address book. If the template's SDK doesn't offer the picker, stop and tell me before asking for full Contacts permission. Then name, mobile, skills (the list in the spec plus "+ Other").
- **Setup step 2** gets **From Contacts** and **From My crew**.
- **Worker detail:** favorite toggle (a real button with `accessibilityState={{ selected }}`), skills, **Call** (`tel:` link), **Text** (`expo-sms` with an empty message), **Add** (hire again sheet), the rating card with "Only you see ratings and notes", receipts confirmed ("11 of 11"; hidden until Phase 6 creates links), balances, pay buttons (disabled with "Available in the next update" until Phase 4), and **Projects worked**.
- **Hire again sheet:** active projects (projects the worker is already on are disabled with "Already on this project"), **New project**, pay prefilled from `last-rate` (editable, daily or hourly), start date, **Text first** (opens Messages with the job message in the worker's documents language from the translation files: en "Hi {name}, it's {payer}. I have work at {project} starting {date}. Are you available?" / es "Hola {name}, soy {payer}. Tengo trabajo en {project} desde el {date}. ¿Estás disponible?"), and **Add to project** (the Phase 2 assignment route; plan limits apply as usual).
- **Rating sheet:** when a project is archived, show it for each unrated worker on that project ("1 of 2"), with **Skip**. Also reachable from Projects → **Rate crew** and from the worker's rating card. Stars are five real buttons; "Would you hire them again?" is Yes / Maybe / No; the note has the hint "Keep notes about the work: quality, timing, reliability." and the line "Only you see this. It's never on receipts, statements or links." A checkbox adds them to Favorites.
- **Edit worker:** skills and private note join the existing fields.
- Sample mode: My crew shows the sample workers read-only; rating, favorite and hire-again show "This is sample data".

### Tests
- Skills rules return 422 for duplicates, more than 12, and untrimmed values (T60).
- `GET /v1/crew` filters and counts: favorites, working now (current assignment on an active project), past (no current assignment); `q` matches a skill (T61).
- Rating: stars 1–5 only; would_hire three values only; re-rating replaces; another workspace's assignment returns 404 (T62).
- A saved worker with no current assignment doesn't count toward the Free worker limit: with 3 current workers, saving a 4th to My crew succeeds; assigning them returns 402 (T63).
- Hire again: the prefill equals the most recent agreement; the text message comes out in the worker's language (T64).

### Test ID tags
- The rate-change tests above cover T12 (backdated preview) and T13 (basis change refused); keeping rates and balances separate per project is T14.

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
