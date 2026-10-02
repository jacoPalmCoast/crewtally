# Phase 2 — Projects, workers, pay agreements and My crew (iPhone and web)

> **Before pasting:** Phase 1c has passed its gate. Nothing else to set up.

## Goal

Someone in a Home workspace sets up a project, adds workers, and gives each worker a daily or hourly rate on that project. My crew keeps everyone they've worked with. Plans and their limits switch on. All of it works on **iPhone and the web**, for the organizer and the partner, with the partner's limits enforced by the server.

This phase:
- applies the provided migrations `0004_plans_and_project_use.sql` and `0005_crew.sql`;
- builds projects, workers, assignments and pay agreements, with rate changes (preview, then all-or-nothing);
- builds the revised setup flow (project, workers, pay) and the bundled **sample project**, with the **Try the Home sample** button Phase 1b left out;
- builds **My crew** with every 1.4 feature, in the revised style;
- turns on plan limits (402) with the limit sheet and an information-only Plan screen;
- builds the matching web pages;
- extends the role matrix to every new route;
- ends with the **TestFlight checkpoint** (first real build, real Sign in with Apple).

Work recording is Phase 3. Payments are Phase 4. Nothing here records money.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: sections 5 "Roles and permissions", 8 "Home partner", 10 "Home screens: changes from 1.4", 11 "Money rules: keep, adopt, must not build", 12 "Web app", 15 "Data model and migrations" and 16 "API surface".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 3 (first use, projects, workers, pay agreements), section 7 (rate changes) and the My crew section. It stays the reference for these rules.
- `db/provided/migrations/0004_plans_and_project_use.sql` and `0005_crew.sql`, top to bottom.
- `db/schema.sql`: `projects`, `workers`, `assignments`, `rate_agreements`, `preview_rate_change`, `apply_rate_change`, `assignment_balances`, `assignment_totals`.
- `db/tests/04_reimb_adj_rest_rates.sql` (how rate changes behave).
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase` = `P2`, including `ChangePay` and `RateReview` (see "Change pay" below). Read each row's `rules_and_conflicts`.
- iPhone pictures in `docs/screens-2.0/mobile/`: `SetupProject`, `SetupWorkers`, `SetupPay`, `EmptyToday`, `Workers`, `WorkerDetail`, `WorkerAdvance`, `AddWorker`, `WorkerEdit`, `DeactivateWorker`, `HireAgain`, `RateWorker`, `Projects`, `ProjectSummary`, `ProjectSettings`, `ArchiveProject`, `ChangePay`, `RateReview`.
- Web pictures in `docs/screens-2.0/web/home/` (Home variants: `dashboard`, `projects`, `project`, `crew`, `worker`, `new-worker`) and `docs/screens-2.0/web/desktop/` and `web/mobile/` (`setup-project`, `new-project`, `edit-project`, `add-person`, `edit-worker`, `assign-crew`).

The pictures dropped several 1.4 features. Where the CSV says a feature was removed and this file says keep it, keep it and style it like the revised screens.

## Build

### 1. Database
- Move `db/provided/migrations/0004_plans_and_project_use.sql` and `0005_crew.sql` to `db/migrations/`, byte for byte. Move `db/provided/tests/08_plans_limits_totals.sql`, `09_crew_ratings.sql` and `10_plan_hardening.sql` to `db/tests/`, byte for byte. Don't edit them. All must pass with every earlier test file.
- 0004 adds `projects.project_use`, `projects.pass_id`, the plan tables, the plan-limit triggers, `project_today`, `record_entitlement_event` (with its optional last argument `p_source`: `APPLE_IAP`, `WEB` or `COMP`), `plan_status`, `year_totals_with_thresholds`, `tax_thresholds`, `growth_counters` and `harden_definer_functions()`. Update the wrapper signature for `record_entitlement_event` in `server/src/db/money.ts`.
- 0005 adds `workers.favorite`, `workers.skills`, `workers.private_note`, `worker_ratings`, `rate_assignment`, `crew_summary(workspace)` and `worker_last_rate`.
- The plan triggers need READ COMMITTED (`require_read_committed`). `withMember` transactions must stay at the default isolation level. A test proves a plan-limited insert works through `withMember`.
- Paste `select filename from <your migrations table> order by 1;` at the gate (0001 to 0005).

### 2. Server: rules for every route in this phase
- **Register every route with `memberRoute`, its action, and `kinds: ['HOME']`.** `withMember` answers 404 (the same body as for a non-member) when the workspace's `kind` isn't in the route's `kinds`. This is the interim rule in spec section 5.4: Business phases widen `kinds` route by route, together with lead and worker scoping (B1 replaces it for these routes). Until then no Business member can reach Home feature routes, whatever `role_can` says. The role matrix expects `kind allowed AND role_can(...)`. Phase 1b's routes (`/v1/workspace`, members, invitations) aren't kind-limited.
- **Shape responses on the server.** One helper, `shapeFor(member)`: rates, agreements, balances and totals only when `money.view`; `favorite`, `skills`, `private_note` and ratings only when `crew.private`. Every role in a Home workspace has both today. Unit-test the helper with all seven permission sets so Business can't leak later.
- **The idempotency helpers from Phase 1b.** Every POST, PUT and PATCH that creates or changes something takes an `operation_id` and uses `withWorkspaceIdempotency` (member routes) from `server/src/idempotency.ts`; session routes use `withUserIdempotency`. Don't build another. Same id and same body → the original response; same id, different body → 409 `OPERATION_REUSED`. The request hash includes the signed-in user.
- **Dates.** "Today" is always the project's today: `projectToday(project)` (use the database's `project_today` where you're already in SQL). Never the server's time zone, never device arithmetic.
- **Errors.** `CT402` → HTTP **402** `{error:{code:"PLAN_LIMIT", message, correlationId, limit, max}}`, with `limit` and `max` from the Postgres error `detail` (JSON; if it doesn't parse, send the error without them). SQLSTATE `55000` → 409 `CONFIRMATION_REQUIRED` with the preview. A blocked rate change (22023 from `apply_rate_change`) → 422 with the database's message. Stale version → 409 `STALE_VERSION`. Add each to the error table and its test.
- **Who wrote it.** `rate_agreements` get `recorded_by` from the actor `require_member` sets. Don't pass it yourself (a different value is refused with 403). Add every money route from this phase to the Phase 1b `recorded_by` test (stored value = the signed-in user, never null).

### 3. Server: routes

| Route | Action | What it does |
|---|---|---|
| `GET /v1/projects?status=ACTIVE\|ARCHIVED` | `workspace.read` | List with worker count, `owed_minor` (sum of **positive** balances), `advance_minor` (sum of negative balances, as a positive number), `waiting_for_rate` count, `project_use`, `covered_by_pass`. |
| `POST /v1/projects` | `projects.manage` | `{operation_id, name, timezone, work_days, address?, project_use, pass_id?}`. Name 1–80. `timezone` must be in `Intl.supportedValuesOf('timeZone')`; the apps default it from the workspace's `default_timezone`, then the device or browser. `work_days`: ISO weekdays 1–7, non-empty, no duplicates; default `[1,2,3,4,5,6]`. `project_use`: `PERSONAL_HOME` (default), `RENTAL`, `BUSINESS`. `pass_id` needs `plan.manage` as well (else 403); another workspace's pass → 404; a used pass → 409. |
| `GET /v1/projects/:id` | `workspace.read` | Project with its assignments (worker, dates, pay in force today or "waiting for a rate", balance). |
| `PATCH /v1/projects/:id` | `projects.manage` | `{operation_id, expected_version, name?, timezone?, work_days?, address?, project_use?}`. Stale → 409. |
| `POST /v1/projects/:id/archive` and `/reopen` | `projects.manage` | `{operation_id, expected_version}`; reopen also takes `pass_id?` (needs `plan.manage`). Reopen can return 402. |
| `GET /v1/projects/:id/summary` | `money.view` | From `assignment_totals`: per worker and in total, each on its own line: earned, expenses (reimbursements), added (increase adjustments), taken off (decrease adjustments), paid, returned (reversals), balance. Totals: `owed_minor` (positives only) and `advance_minor` (negatives only). Never one netted figure. Plus `as_of` (server time). |
| `GET /v1/projects/:id/unrated` | `crew.private` | Assignments on the project without a rating. |
| `POST /v1/setup` | `projects.manage` (+ `people.add`; + `rates.set` if any pay is included) | The iPhone first-run in **one transaction**: `{operation_id, project:{…as POST /v1/projects}, workers:[{existing_worker_id? \| new:{display_name, phone?, email?, document_language?, skills?}, start_date, agreement?}]}`. Creates the project, any new workers and every assignment (with its first agreement when given). All or nothing: a 402 on the 4th worker writes nothing. Returns the ids. |
| `GET /v1/workers` | `workspace.read` | Workers with their assignments (project, pay basis and rate in force today, or waiting), balances. |
| `POST /v1/workers` | `people.add` | `{operation_id, display_name, phone?, email?, document_language?, favorite?, skills?, private_note?}`. Name 1–60. Email format checked. Phone free text ≤ 30. `document_language` `en` (default) or `es`. `favorite`, `skills`, `private_note` need `crew.private` too. Skills rules (≤ 12, 1–30 characters, trimmed, no duplicates ignoring case) → 422 in plain words. Response includes `warnings:[{type:"POSSIBLE_DUPLICATE", worker_id}]` when the name (case-insensitive), phone (digits only) or email matches an existing worker. Never merge. |
| `GET /v1/workers/:id` | `workspace.read` | Details, crew summary fields, and `projects`: one row per assignment with project, dates, days worked, earned, balance, pay history (newest first, with the one in force today), rating if any. |
| `PATCH /v1/workers/:id` | `people.add` | `{operation_id, expected_version, …fields}` as POST. Private fields need `crew.private`. |
| `POST /v1/workers/:id/deactivate` | `people.remove` | Makes the worker inactive (they show under Past in My crew). Refused with 422 `HAS_CURRENT_ASSIGNMENT` while they have a current assignment. |
| `POST /v1/workers/:id/reactivate` | `people.add` | Back to active. Hire again does this automatically before adding to a project. |
| `GET /v1/workers/:id/last-rate` | `money.view` | `worker_last_rate`, for the Hire again prefill. |
| `GET /v1/crew?filter=all\|favorites\|working\|past&skill=&q=` | `workspace.read` | Rows from `crew_summary(workspace)` plus each worker's `owed_minor` (positives) and `advance_minor` (negatives) across projects, kept apart. Favorites first, then name. `q` matches name or skill, case-insensitive. Counts for every filter in the same response. |
| `POST /v1/assignments` | `people.add` (+ `rates.set` if `agreement` is sent) | `{operation_id, project_id, worker_id, start_date, agreement?:{pay_basis, rate_minor, standard_day_minutes?}}`. Insert the assignment and, when given, its first `rate_agreements` row in one transaction, with `effective_from` = `start_date`. The project must be active (422). `rate_minor` is an integer within the table caps ($5,000/day, $1,000/hour; 0 → 422). `standard_day_minutes` only for DAY, 60–1440. Without `agreement`, the assignment **waits for a rate**. A partner sending `agreement` → 403, and nothing is written. Another workspace's project or worker → 404. Plan limits → 402. |
| `GET /v1/assignments/:id` | `workspace.read` | The assignment with every agreement (newest first), the one in force today, and `rate_status: SET \| WAITING`. |
| `PATCH /v1/assignments/:id` | `people.remove` | `{operation_id, expected_version, end_date}` ends the assignment ("Remove from project"). `end_date` ≥ `start_date` and ≥ the last recorded work date (not VOID) → else 422 `END_BEFORE_LAST_WORK`. Never moves an assignment to another worker or project (the database refuses too). |
| `POST /v1/assignments/:id/first-rate` | `rates.set` | Sets the rate for an assignment that's waiting: `{operation_id, pay_basis, rate_minor, standard_day_minutes?}`. In the `withMember` transaction: lock the assignment row (`select … for update`), check it has no `rate_agreements` row (else 409 `RATE_ALREADY_SET`), then **insert the first `rate_agreements` row directly** with `effective_from` = the assignment's `start_date`, the same way `POST /v1/assignments` does (invariant 2: a first agreement is inserted directly; only later changes go through `apply_rate_change`). Same validation and caps as `POST /v1/assignments`. No work can exist yet for a waiting assignment, so nothing is recalculated. |
| `POST /v1/assignments/:id/agreements/preview` | `rates.set` | `{effective_from, pay_basis, rate_minor, standard_day_minutes?}` → `preview_rate_change`. |
| `POST /v1/assignments/:id/agreements` | `rates.set` | `{operation_id, effective_from, pay_basis, rate_minor, standard_day_minutes?, reason?, confirm}` → `apply_rate_change`. `55000` → 409 `CONFIRMATION_REQUIRED` with the preview. Confirm without a reason when days are affected → 422. |
| `PUT /v1/assignments/:id/rating` | `crew.private` | `{operation_id, stars, would_hire, note?}` → `rate_assignment`. Re-rating replaces. No delete. |
| `GET /v1/plan` | `workspace.read` | `plan_status(workspace)` plus `project_pass_enabled` (server setting `PROJECT_PASS_ENABLED`, default true) and `can_manage_plan` (from `plan.manage`). |
| `PATCH /v1/workspace` | `settings.edit` | Adds `payer_display_name` (1–60) to the rename from Phase 1b: the name shown as "Paid by" on receipts and in messages to workers. Until it's set, receipts and messages use "the owner". This Phase 1b route isn't kind-limited. |

There's no route that deletes a worker, a project or an assignment, and no route that sets a plan. Tests that need Pro call a test-only `grantProForTest(workspaceId)`, which calls `record_entitlement_event` with an event id starting `test-`. It lives in the test folder and `src/` never imports it.

### 4. The partner and pay rates
- The partner can create and edit projects, archive and reopen them, add workers and add them to projects, and see ratings and private notes. The partner can't set or change pay, end an assignment, make a worker inactive, or use a Project Pass. The server enforces all of this through the actions above.
- A worker the partner adds to a project **waits for a rate**. Everywhere that shows them:
  - Label "Waiting for rate" with an icon, never a $0 or any made-up figure.
  - For the organizer: a **Set rate** action (the first-rate route, using the SetupPay form; the first agreement is inserted directly).
  - For the partner: "Waiting for <organizer's name, or 'the organizer'> to set the rate."
  - Crew and Projects show "2 workers waiting for a rate" to people with `rates.set`.
- Work can't be recorded for a waiting worker (the database refuses: "no pay agreement for date"). Phase 3 shows them on Today without record buttons.
- **No default rate, ever.** Rate fields start empty. No preset, no last-used rate (except the explicit Hire again prefill from `last-rate`, which the person sees and can change), no "review the agreed rate" toast. Save stays disabled until a rate is typed, or until the organizer chooses **Set rate later** (the worker then waits, the same as above).

### 5. iPhone

**First run** (from `Welcome` → **Create my project**, or when the workspace has no projects):
1. **Project** (`SetupProject`): name; **Work days** as seven toggles (Monday–Saturday on); "Times use America/New_York" with **Change** (default from the workspace's `default_timezone`, then the device); **Who is this work for?** with **My home**, **A rental I own**, **My business or a client's job** and the helper "Used only for the tax notes on year-end totals. You can change it later." The design hides time zone and work days; show them (spec section 10).
2. **Workers** (`SetupWorkers`): add several, one after another. **Choose from Contacts** (the system picker from `expo-contacts`, `presentContactPickerAsync`, so the app never asks for the whole address book; if the template's SDK doesn't offer the picker, stop and tell me before asking for full Contacts access), **From My crew** (when there is one), or type a name, mobile and (under More details) email. The duplicate warning shows inline: "There's already a Marco Reyes in My crew." **Use that one** / **Add anyway**.
3. **Pay** (`SetupPay`), one card per worker:
   - **Daily rate** / **Hourly rate** (a two-option segmented control), then the rate, using the decimal pad and `shared/money.ts`. The field starts empty.
   - For daily: **Standard day length (optional)**, shown on the card, not hidden in a disclosure, with the helper "Lets you record hours for a daily worker, like 6 h of an 8 h day."
   - **Starts on**, default the project's today.
   - A live example under the rate: "Full day = $240.00 · ½ day = $120.00", or "8 h = $240.00", from `shared/pay.ts`.
   - **Set rate later** (organizer) leaves that worker waiting for a rate. For a partner, the card shows "The organizer sets the rate" instead of the form.
   - **Create project** sends one `POST /v1/setup`. On 402, show the limit sheet and keep everything typed.

**Today, first day** (`EmptyToday`): until Phase 3, the Today tab shows the project's workers with "Unrecorded" (or "Waiting for rate"), pay, and $0.00 owed, with no record buttons. Phase 3 replaces it.

**Sample project.** Phase 1b left an empty place on `SignIn` for **Try the Home sample**. Add the button now, and make **Explore the sample** on `Welcome` open the same sample.
- `mobile/sample/sample-project.json`, bundled: Kitchen remodel; Marco Reyes ($240/day, 8 h day), Dee Thompson ($180/day), Luis Ortega ($30/hr), Sam Kowalski ($28/hr); two weeks of history. Balances owed: Marco $160.00, Dee $170.00, Luis $675.00, Sam $240.00, all calculated with `shared/pay.ts`.
- One app state, `mode: 'sample' | 'real'`. In sample mode: every screen shows "Sample project — nothing here is real" with **Start my own project**; the API client refuses every write (`SampleModeError`) and makes **no** API calls at all; reads come from the file; screens that would record or share say "This is sample data". Never show a sync status or "Synced at" in sample mode.
- Reached from SignIn (before sign-in) and Welcome. **Remove sample** in More, and creating the first real project, both clear it.

**Projects** (`Projects`, More → Projects): **Active** and **Archived** sections (the design shows one row; keep both), **New project**. Each row: name, workers, owed and, if any, "Paid in advance $x" on its own line, and "Rate crew" for an archived project with unrated workers.

**Project overview** (`ProjectSummary`): one line each for Work, Expenses, Added, Taken off, Payments, Returned; **Owed to workers** (positives) and **Paid in advance** (negatives) as separate figures; a per-worker list with status labels (Owed / Settled / Paid in advance, each with an icon); "As of 3:42 pm". **Pay what's owed** and **Export** show disabled with "Available in the next update" (Phases 4 and 5).

**Project settings** (`ProjectSettings`): name, Who is this work for (with the note "Changes which tax notes appear on year-end totals"), work days, time zone (note: "Dates already recorded don't move"), **Archive project**.

**Archive** (`ArchiveProject`): "Archiving stops reminders and new entries. History stays." Show what's still owed (owed and paid-in-advance apart). If the project has a Project Pass: "The Project Pass stays with this project." Then the rating sheet for each unrated worker ("1 of 2", **Skip**).

**My crew** (`Workers`, the **Crew** tab):
- Search (name or skill), filter chips **All · Favorites · Working · Past** with counts, a **Skill** picker.
- Rows: name, favorite star, skills, rating, projects; on the right the amount owed, or "Last worked <date> · <project>". A worker with an advance shows "Paid in advance $x" as its own line; never subtract it from what they're owed on another project.
- A banner for `rates.set` roles when any worker needs a pay rate.
- The design reduced this to a project list; keep the 1.4 features in the revised style.

**Worker detail** (`WorkerDetail`, `WorkerAdvance`):
- Header: name, favorite toggle (a real button with `accessibilityState={{ selected }}`), skills, **Call** (`tel:`), **Text** (`expo-sms`, empty message), **Add to project** (Hire again).
- One balance card **per project**, each with its status label. A paid-in-advance card says "Paid in advance $40.00. This counts toward future work."
- Pay agreement per project with its start date, **Change pay** (organizer) or "Waiting for rate" + **Set rate**.
- Rating card: stars, would hire again, note, and "Only people who manage this workspace see ratings and notes. They're never on receipts, statements or links."
- **Projects worked**.
- **Record payment**, **Statement** and **Work history** show disabled with "Available in the next update" (Phases 4, 5 and 3). Receipts confirmed stays hidden until Phase 6.

**Add worker** (`AddWorker`): **Choose from Contacts**, name, mobile, email, **Receipts and statements in: English · Español** (helper "Changes the worker's receipts, statements and sign-off screen. Your app stays in English."), skills as chips from the spec's list plus **+ Other** (not one free-text field). Adding a worker gives them **no** rate.

**Edit worker** (`WorkerEdit`): the same fields plus private note and skills (editable). **Make inactive** (people.remove; refused while they're on a current project, with "Remove them from their projects first").

**Remove from project** (`DeactivateWorker`): pick the end date (default the project's today, not before their last recorded day). Show their balance on that project: "You can still pay what's owed after this. They stay in My crew." The word on the button is **Remove from project**, never "Delete". Helper on Free: "Their place on the Free plan frees up after the end date."

**Hire again** (`HireAgain`): active projects (ones they're already on are disabled with "Already on this project"), **New project**, **Daily rate / Hourly rate** and rate prefilled from `last-rate` (editable; organizer only; partner sees "The organizer sets the rate"), start date, **Text first** (opens Messages with the job message in the worker's documents language: en "Hi {name}, it's {payer}. I have work at {project} starting {date}. Are you available?" / es "Hola {name}, soy {payer}. Tengo trabajo en {project} desde el {date}. ¿Estás disponible?"), **Add to project**. The design dropped pay basis, start date, New project and the Messages hand-off: keep them.

**Rating** (`RateWorker`): five star buttons (keep the stars; spec decision D7), "Would you hire them again?" **Yes / Maybe / No**, note with the hint "Keep notes about the work: quality, timing, reliability.", **Add to Favorites**. Reached after archiving, from Projects → Rate crew, and from the worker's rating card.

**Change pay** (`ChangePay`, `RateReview`; built here because pay agreements live in this phase and the web's Edit worker needs the same flow). This is only for an assignment that already has an agreement; a waiting one uses **Set rate** (first-rate route):
1. Effective date, **Daily / Hourly**, rate, day length (daily).
2. Preview. If recorded days are affected, show **every** affected date with old amount, new amount and difference, and the total. Buttons: **Apply to all N days** (asks for a reason) and **Cancel**. There's no way to pick some days, and no "future entries only" for a past date: a past date always previews.
3. Blocked (daily ↔ hourly before the last recorded day): show the database's message and suggest the day after the last recorded day.
4. Organizer only. Partners don't see Change pay.

**Plans** (from 0004):
- **Limit sheet** on any 402: heading "Free covers 1 active project and 3 workers". Organizer: body "Everything you've recorded stays yours on any plan." with **See plans** and **Not now**. Partner: "<Organizer> manages the plan." with **OK**. Keep whatever was typed.
- **Plan** (More → Plan), information only in this phase: current plan; usage ("1 of 1 active project · 3 of 3 workers"); unused passes; what each plan includes: "Free: 1 active project and 3 current workers", "Project Pass: one project with no worker limit. It stays with that project, through archive and reopen.", "Pro: as many projects and workers as you need." And for all plans: "Your records are never locked." and "Your partner never pays." No prices and no buy buttons (Phase 7). Never "Unlimited", never "unlock".
- **Name on receipts**: More → Workspace (organizer): "Shown as 'Paid by' on receipts and in messages to workers."
- Sample mode never shows the limit sheet or real usage.

### 6. Web

The web pages call the same routes and show the same errors. Add **Projects** and **Crew** to the navigation (shaped by `can`). The decimal rate field parses text with `shared/money.ts` (never `parseFloat`).

| Web route | Screen | What it does |
|---|---|---|
| `…/today` | `home/dashboard` | One card per active project: name, workers, **Owed** and, apart, **Paid in advance**, "2 workers waiting for a rate" (for `rates.set`). **Record work** shows disabled with "Available in the next update" (Phase 3). No projects → `empty-dashboard`, whose **Create my project** now goes to `…/setup/project`. |
| `…/setup/project` | `setup-project` | First project: name, time zone (default the workspace's `default_timezone`), work days, Who is this work for, address (optional). The design has no time zone and no project use: add both. No client field (Business). |
| `…/projects` | `home/projects` | Grid with search and **Active · Archived** (the design has no archived filter: add it). **New project** with `projects.manage`. A plan line: "Free · 1 of 1 active project · 2 of 3 workers". |
| `…/projects/new`, `…/projects/:id/edit` | `new-project`, `edit-project` | Same fields as setup. Edit adds **Archive** / **Reopen** (with confirmations). No budget or client fields. |
| `…/projects/:id` | `home/project` | Crew on the project: pay in force today (or "Waiting for rate"), balance with status label; owed and paid-in-advance totals apart; **Edit**, **Assign crew**, **Archive/Reopen**, **Rate crew** (archived). Work history comes in Phase 3. |
| `…/projects/:id/crew` | `assign-crew` | Ticking a worker adds them to this project (start date; pay with `rates.set`, else they wait). Unticking ends **that** assignment on a chosen date (`people.remove`; confirm shows their balance). Never touches their other projects. |
| `…/crew` | `home/crew` | My crew: search, **All · Favorites · Working · Past** with counts, skill filter, favorites, ratings, owed and paid-in-advance apart, "Waiting for rate". **Add person**. |
| `…/crew/add` | `add-person` | **Add a worker record** (no account needed) or **Invite a partner** (organizer; goes to `…/team/invite` from Phase 1c). |
| `…/crew/new` | `home/new-worker` | Name, mobile, email, receipts language, skills (chips + Other), then optionally a project with start date and pay (pay only with `rates.set`, empty rate field, Daily/Hourly, day length). Duplicate warning as on iPhone. |
| `…/crew/:workerId` | `home/worker` | Details, favorite, skills, private note, rating; per project: pay history (newest first, the one in force today marked), balance card with status; **Edit**, **Add to project**, **Remove from project**, **Set rate** / **Change pay** (organizer). |
| `…/crew/:workerId/edit` | `edit-worker` | Details only. Pay changes go through **Change pay** (effective date → preview → all-or-nothing), never by overwriting a rate. "Changing the job" isn't built: add them to another project instead. **Make inactive**. |
| `…/crew/:workerId/pay/:assignmentId` | (iPhone `ChangePay`, `RateReview`) | The same Change pay flow and wording as iPhone. For a waiting assignment the page is **Set rate** (first-rate route, no preview needed). |

On any 402 the web shows the limit message. Organizer: "Free covers 1 active project and 3 workers. Everything you've recorded stays yours on any plan. Plans are managed in the CrewTally iPhone app (More → Plan)." Partner: "<Organizer> manages the plan." No prices, no buy buttons, no checkout links.

## Tests

**Database:** the moved `08`, `09` and `10` files pass with every earlier file.

**Server (keep every 1.4 test, now through `withMember` and the role harness):**
- Validation, each 422: bad time zone, empty or repeated work days, rate 0, rate over the cap, `standard_day_minutes` on an hourly agreement, assignment to an archived project, end date before the last recorded day.
- Stale `expected_version` → 409 `STALE_VERSION`. Same `operation_id` twice → one row; same id with a different body → 409 `OPERATION_REUSED`.
- Duplicate warning: the same name in different case gives a warning and the worker is still created.
- Rate changes: affected days without confirm → 409 with the preview; confirm without a reason → 422; confirm with a reason → 200 and every affected day changed (T12); a future-dated change → 200 with no confirmation; a daily ↔ hourly change before the last recorded day → 422 (T13); rates and balances stay separate per project (T14). Use `record_work` in test setup for recorded days.
- `projectToday`: `Pacific/Auckland` and `America/Los_Angeles` give different dates for the same instant.
- Plans: a second active project → 402 `active_projects`; archive the first and it works; reopening the first → 402 (T49). A 4th current worker → 402 `workers`; an already-ended assignment is allowed (T50). With Pro: five projects and ten workers work; after `PRO_EXPIRED`, recording work for an existing worker still works and a new project → 402 (T51). `pass_id` from another workspace → 404; used pass → 409 (T52). `project_use` validates and saves; `GET /v1/plan` matches `plan_status` (T53). Two parallel requests for the 4th worker: exactly one succeeds (two connections) (T66). End-date tricks don't get past Free (T67).
- `POST /v1/setup`: all or nothing (a 402 on the 4th worker leaves no project, worker or assignment); a retry with the same `operation_id` returns the same ids.
- My crew: skills rules → 422 (T60); crew filters and counts, `q` matches a skill (T61); ratings 1–5 only, three `would_hire` values, re-rating replaces, another workspace's assignment → 404 (T62); a saved worker with no current assignment doesn't count toward Free (T63); Hire again prefill equals the newest agreement, and the text comes out in the worker's language (T64).
- Worker language: `en`/`es` only, saved.
- **Partner and rates:**
  - Partner `POST /v1/assignments` with `agreement` → 403 and no rows written; without → 201 with `rate_status: WAITING`.
  - First-rate: partner → 403; organizer → 200 with `effective_from` = start date, exactly one `rate_agreements` row inserted directly (no `apply_rate_change` call; check with a spy), `recorded_by` = the organizer; a second time → 409 `RATE_ALREADY_SET`.
  - Partner → 403 on the preview, apply, end-assignment, deactivate and `pass_id` paths. Partner → 2xx on projects, workers, assignments without pay, archive, reopen and rating.
  - `record_work` on a waiting assignment fails with "no pay agreement for date" (test-only path through `withMember`, as Phase 1b did for payments); `mark_rest_no_work` skips it.
  - `rate_agreements.recorded_by` = the signed-in user.
- **No default rate:** `POST /v1/assignments` with `agreement` but no `rate_minor` → 422. Search `src/` of the server, mobile and web for a hard-coded rate used as a default (24000, 240 and the like outside `sample-project.json` and tests) and fail on any hit.
- **Kind rule:** every route in this phase → 404 for every Business role.
- **Shaping:** `shapeFor` removes rates and balances without `money.view`, and private crew fields without `crew.private`, for all seven permission sets.
- **Isolation:** every route with an id returns 404 for another workspace's project, worker, assignment or pass. Assigning another workspace's worker → 404.
- **Private fields never travel:** ratings and notes aren't in any payload a receipt, statement or link could be built from (Phase 6 tests again).

**Role matrix — add these rows** (organizer, partner, Business owner, admin with money, admin without, lead, worker, removed, outsider):

| Route | Action | Organizer | Partner | Business roles | Removed, outsider |
|---|---|---|---|---|---|
| `GET /v1/projects`, `GET /v1/projects/:id` | workspace.read | 2xx | 2xx | 404 (kind) | 404 |
| `POST /v1/projects`, `PATCH /v1/projects/:id`, `…/archive`, `…/reopen` | projects.manage | 2xx | 2xx | 404 | 404 |
| `GET /v1/projects/:id/summary` | money.view | 2xx | 2xx | 404 | 404 |
| `GET /v1/projects/:id/unrated` | crew.private | 2xx | 2xx | 404 | 404 |
| `POST /v1/setup` (with pay) | projects.manage + people.add + rates.set | 2xx | 403 | 404 | 404 |
| `POST /v1/setup` (no pay) | projects.manage + people.add | 2xx | 2xx | 404 | 404 |
| `GET /v1/workers`, `GET /v1/workers/:id`, `GET /v1/crew` | workspace.read | 2xx | 2xx | 404 | 404 |
| `POST /v1/workers`, `PATCH /v1/workers/:id`, `…/reactivate` | people.add | 2xx | 2xx | 404 | 404 |
| `POST /v1/workers/:id/deactivate` | people.remove | 2xx | 403 | 404 | 404 |
| `GET /v1/workers/:id/last-rate` | money.view | 2xx | 2xx | 404 | 404 |
| `POST /v1/assignments` (no agreement) | people.add | 2xx | 2xx | 404 | 404 |
| `POST /v1/assignments` (with agreement) | people.add + rates.set | 2xx | 403 | 404 | 404 |
| `GET /v1/assignments/:id` | workspace.read | 2xx | 2xx | 404 | 404 |
| `PATCH /v1/assignments/:id` | people.remove | 2xx | 403 | 404 | 404 |
| `POST /v1/assignments/:id/first-rate`, `…/agreements/preview`, `…/agreements` | rates.set | 2xx | 403 | 404 | 404 |
| `PUT /v1/assignments/:id/rating` | crew.private | 2xx | 2xx | 404 | 404 |
| `GET /v1/plan` | workspace.read | 2xx | 2xx | 404 | 404 |
| `PATCH /v1/workspace` | settings.edit | 2xx | 403 | Business owner 2xx (rename only); other Business roles 403 (not kind-limited) | 404 |

The matrix runs with both session kinds (Bearer and cookie), as in Phase 1c.

**Mobile:**
- Sample mode: every write method on the API client throws `SampleModeError` and **zero** requests go out (T46); the sample file's balances equal the values above through `shared/pay.ts`; no sync status renders in sample mode.
- The pay example text for daily with a day length, daily without, and hourly.
- The rate field rejects "12.345" and "-5", and accepts "$1,245.50".
- SetupPay, Add worker and Hire again (without prefill) render an **empty** rate field, and Create stays disabled until a rate is typed or Set rate later is chosen.
- A partner sees no Change pay, Set rate, Remove from project or Make inactive; sees "The organizer sets the rate".
- The limit sheet shows the organizer and partner wording.

**Web:**
- Projects and Crew appear in the navigation; a partner doesn't see Set rate, Change pay or Remove from project.
- Rate parsing goes through `shared/money.ts` ("12.345" and "-5" refused; "$1,245.50" accepted); no `parseFloat` in `web/src` (a test greps for it).
- Assign crew: unticking calls the end-assignment route for that assignment only.
- The 402 message shows the organizer and partner wording, and no price or buy link.
- New worker renders an empty rate field.

## Must-not-build items for this phase
From spec section 11, "Prototype behaviours that must not be built", and the CSV:
- **A new Home worker silently gets $240/day** with a "review the agreed rate" toast. → No default rate; empty fields; waiting-for-rate state. Tested by the empty-field UI tests, the 422 test and the hard-coded-rate search.
- **A worker created with a $0 rate** (the web prototype's admin path). → A worker without pay waits; `rate_minor` 0 → 422.
- **The rate taken from a "current rate" field** instead of the agreement in force on the work date. → Agreements per assignment with effective dates; the web never overwrites a rate. Tested by T12–T14.
- **Backdated rate changes where you pick which days to recalculate**, or "future entries only" with a past date. → Preview every affected day, all or nothing. Tested by the rate-change tests.
- **Project totals that add signed balances**, so one worker's advance lowers what others are owed. → `owed_minor` and `advance_minor` apart on every list and summary. Tested in the summary and crew tests.
- **Adjustments shown as expenses, returned money hidden in payments.** → Separate lines in the project overview.
- **Assigning a worker to a job removes them from their other jobs.** → Tested in the web assign-crew test.
- **No Free limits on web new project, new worker and assign crew.** → The database triggers apply to every surface; the web shows the 402 message.
- **"Unlimited" wording.** → "As many projects and workers as you need".
- **A partner setting rates**, and **a web Home with no partner role.** → Role matrix.

## Proof to paste at the gate
- `POST /v1/assignments` and `POST /v1/setup` handlers.
- `projectToday`.
- `withMember` with the `kinds` check, and `shapeFor`.
- The preview/apply routes showing the 55000 → 409 mapping, and the first-rate route.
- The 402 mapping and its test.
- The role matrix rows added in this phase, and the pass count.
- The migrations query from Build step 1.
- Test file names and counts for all four suites.

## Try it on your phone (Expo Go, developer sign-in)
1. Signed out, tap **Try the Home sample**. Every screen shows the sample banner; nothing says "Synced"; trying to add a worker ends with "This is sample data". Tap **Start my own project**: the sample disappears.
2. Sign in as **owner-a**. Create my project: Kitchen, work days Monday–Saturday, "My home". Add Worker A and Worker B. On Pay the rate fields are empty. Worker A $240/day with an 8 h day ("Full day = $240.00 · 8 h = $240.00"), Worker B $180/day. Create.
3. Make sure **member-c** is owner-a's partner (Phase 1b; invite again if you removed them). Sign in as member-c: add Worker C to Kitchen. There's no pay form, just "The organizer sets the rate". Worker C shows "Waiting for rate". member-c has no Set rate, Change pay, Remove from project or Make inactive.
4. Still as member-c, add a 4th worker, Helper D, to Kitchen: the limit sheet says owner-a manages the plan, and what you typed is still there.
5. Sign in as owner-a: Crew shows "1 worker waiting for a rate". Set rate for Worker C: $30/hr. Try a 4th worker yourself: the limit sheet now offers See plans. Tap Not now.
6. Change Worker B to $200/day starting next Monday: it applies with no confirmation.
7. Set Worker A's documents language to Español. Favorite Worker B and give her the skill Tile.
8. Archive Kitchen: the rating sheet asks for each worker. Rate one, skip one. Reopen it.

## Try it on the web
1. Sign in as owner-a (the linked email from Phase 1c). The dashboard shows the project with owed $0.00, and the same workers as the phone.
2. Crew → Worker B: pay history shows $180/day and $200/day from next Monday.
3. Projects → New project while Kitchen is active: the limit message, with "Plans are managed in the CrewTally iPhone app", and no price.
4. Assign crew on a project: untick a worker → confirm → they're removed from **this** project only.
5. Sign in on the web as the partner: no Set rate, no Change pay, no Remove from project. Try adding a worker to Kitchen: the limit message says owner-a manages the plan, with no See plans.

## TestFlight checkpoint (after Phase 2 is approved)

> Paste this part only after I've approved Phase 2. It's the first real iPhone build. It closes the Phase 1 carried item: real Sign in with Apple.

**Owner, before pasting:**
1. In Replit, open the deployment settings for the API and add the production Secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `APPLE_AUDIENCES` = `com.crewtallyapp.crewtally` only, `TOKEN_ENCRYPTION_KEY` (a **new** one for production), `CODE_PEPPER` (a **new** one for production), `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `APP_ENV=production`, `BUSINESS_ENABLED=false`, and `PUBLIC_BASE_URL` = the deployment URL plus `/api`. **Don't** add `DEV_SIGNIN_CODE`.
   - Make each new secret value yourself in the Shell: run `openssl rand -base64 32` once for `TOKEN_ENCRYPTION_KEY` and once for `CODE_PEPPER`, paste each result into the production Secrets, then clear the Shell. Never ask the Agent to generate them in chat. Keep the production `TOKEN_ENCRYPTION_KEY` for Phase 8 (changing it later makes stored Apple tokens unreadable).
2. Know that this is the first use of the production database. What you create stays: there's no reset script (invariant 11). Use your real details, keep it small, and you can remove it later with account deletion (Phase 7).

**Agent:**
1. Publish the API as a Replit deployment. The migration runner applies 0001–0005 to the production database on start. Paste the migrations list from production.
2. Point release builds of the app at the deployment URL (one config value; development builds keep the dev URL).
3. Build and publish the iPhone app to TestFlight through Replit's mobile publishing flow (the same flow Phase 8 uses). Don't use EAS CLI.
4. Confirm the production build has no developer sign-in: the button doesn't render and `POST /v1/auth/dev` returns 404.

**Owner, on your iPhone:**
1. Install from TestFlight. Sign in with Apple using your real Apple ID. You land on Choose workspace: create a Home workspace and a small project.
2. Sign out and sign in again: the same workspace.
3. More → Account → Add email sign-in with your email. Sign out, then Continue with email: the same workspace.
4. Sign out. Continue with email using a **different** address you own (a new account), then More → Account → **Add Sign in with Apple** with a second Apple ID if you have one: the account now shows Apple On, and Sign in with Apple with that ID opens it. With the Apple ID from step 1 instead, you get "That Apple ID already signs in to a different CrewTally account."

**Proof for the checkpoint:**
- The TestFlight build number.
- Production log lines for the Apple sign-in showing success, with **no** `apple_exchange=skipped_dev` (and no token, `sub` or email in the log).
- The nonce comparison as confirmed on a real device, and the test that now locks it in (Phase 1's note).
- A query on production showing your `apple_credentials` rows (`client_kind`, ciphertext, never the token).
- Anything that behaved differently from Expo Go.

Stop and say "TestFlight checkpoint ready for review". When I approve it, the Phase 1 carried item "real Sign in with Apple" is closed.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 2 ready for review". Don't start the TestFlight checkpoint until I paste it.
