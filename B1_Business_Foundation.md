# Phase B1 — Business foundation: setup, jobs, team, roles, scoping (Release 1.1)

> **Before pasting:**
> 1. Release 1 (Phase 8) is live. Everything in B1–B3 stays hidden in the published app: `BUSINESS_ENABLED` stays `false` in Replit Secrets until Phase B4.
> 2. Add the Replit Secret `BUSINESS_DEV_ACCESS` = `true`. The server honours it **only** when `APP_ENV=development`, so it can't switch Business on in the published app (which runs with `APP_ENV=production`).
> 3. Keep `DEV_SIGNIN_CODE` and `APP_ENV=development` in the workspace.
> 4. Push the current code to GitHub before you start, so this phase has a clean diff.

## Goal

Phase 1b put every Business role in the database. This phase builds the first Business screens on iPhone and the web, and the server rules that keep each role inside its lane:

- migration `0008_business_foundation.sql` and its tests: client jobs, job leads, worker trade, business settings, invitation jobs, scoping helpers, and plan-limit triggers that leave Business workspaces alone;
- Business setup (name → first job → first worker), with a device-only sample business;
- jobs, job lead (set and change), assign crew, team, invitations for admin, lead and worker, member access and removal;
- a **scoping layer** in the API on top of `role_can`: a crew lead sees and records only for the jobs they lead; a worker sees only their own records;
- **role-shaped responses**: the server removes every rate, balance, budget and money field for roles without `money.view`, on every route and in every export;
- an admin without money access can add a worker, who then **waits for a rate**. No $0 rate, ever.

Approvals, the crew lead and worker apps (B2), Business payments and reports (B3) and billing (B4) come later. Nothing in this phase changes a money function, `fn_earned`, `role_can`, `require_member` or the ledger.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: §14 Business workspace (Release 1.1), §5 Roles and permissions, §7 Invitations, §11 Money rules (must-not-build list), §12 Web app, §15 Data model and migrations, §16 API surface, §18 Screen coverage, §19 Things to confirm.
- `db/migrations/0003_identity_and_memberships.sql`: `role_can`, `require_member`, `member_permissions`, `create_invitation`, `can_invite`, `can_manage`, `change_member_role`, `remove_member`, `join_from_invitation`.
- `db/migrations/0004_plans_and_project_use.sql`: the three plan-limit trigger functions (you redefine them here; read them line by line first).
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase = B1` (22 mobile, 2 web), and the P2 web rows whose roles include Owner or Admin (`projects`, `project`, `new-project`, `edit-project`, `crew`, `worker`, `add-person`, `new-worker`, `edit-worker`, `assign-crew`, `dashboard`) and the P1c rows `invite-person`, `invite-review`, `invitations`, `member`.
- Screens: `docs/screens-2.0/mobile/` `BWelcome`, `BSetup`, `BFirstJob`, `BFirstCrew`, `BOwnerToday`, `BAdminToday`, `BJobs`, `BNewJob`, `BJob`, `BJobCosts`, `BAssignCrew`, `BTeam`, `BAddPerson`, `BAddWorker`, `BWorkerRecord`, `BInvite`, `BInviteReview`, `BInviteReady`, `BMember`, `BRoles`, `BRemoveMember`, `BAccessDenied`; `docs/screens-2.0/web/desktop/` `business-setup`, `roles` and the shared pages above; `docs/screens-2.0/web/roles/admin.png`, `lead.png`.
- Your own code for `withMember`, `memberRoute`, the route table, the role harness (`server/test/helpers/tenancy.ts`), the P2 project/worker/assignment routes, the P5 CSV writer and the P1c web invitation pages.

## Must-not-build items in this phase (spec §11)
| # | Prototype behaviour | How this phase stops it | Test |
|---|---|---|---|
| 1 | An admin without money access creates a worker with a $0 rate, so approvals pay $0 | Rate fields from a role without `rates.set` → 403; the worker is saved with **no** agreement and shows "Waiting for rate"; `record_work` already refuses work with no agreement | `admin_no_money_adds_worker_waiting_for_rate` (server) and the `rate_agreements` row count stays 0 |
| 3 | Rate taken from a "current rate" field on the worker | There is no rate field on `workers`. Rates live only in `rate_agreements` per assignment, with an effective-from date | Schema test: `workers` has no rate column; worker DTO has no `rate` key |
| 8 | Totals that add signed balances, so one worker's advance lowers what's shown as owed to others | Job and Today totals sum positive balances as "Owed" and negative ones separately as "Paid in advance" | `job_costs_never_net_advances` |
| 16 | A Business payment tied to the worker's "current job" | Assigning crew never ends or moves other assignments; payments stay on explicit allocation lines (B3) | `assign_crew_keeps_other_jobs` |
| 18 (invariant) | Demo code: role switchers, "Design preview", "Reset sample" | The sample business is a bundled, read-only file shown in the owner view only; no role switcher anywhere | Mobile test: sample mode makes zero API writes; grep test for `demo`/`Design preview` strings in app bundles |
| — | Prototype permission holes: lead sees rates and balances; worker opens a job page with everyone's hours and labour cost | Scoping layer + server-side response shaping (below) | Role matrix + `money_key_scanner` |

## Build

### 1. Migration `0008_business_foundation.sql`

Write it at this phase, in `db/migrations/`, with a test file `db/tests/14_business_foundation.sql`. Additive only. Every new `SECURITY DEFINER` function is hardened: end the file with `select harden_definer_functions();`.

**Deletion rule for every new table.** `delete_workspace_data` (unchanged, called only by `delete_user_account`) deletes the old tables and then the workspace. So every new table must reference `workspaces(id) on delete cascade`, and every foreign key to an older table that `delete_workspace_data` deletes first (`projects`, `workers`, `assignments`, `work_entries`, `payments`, `memberships`) must be `on delete cascade`. A test deletes a Business owner's account and checks every table has zero rows for that workspace.

**a) Jobs are projects.** A Business job is a `projects` row. Keep `name`, `timezone`, `work_days`, `status`, `version`. The pack's "location" is the existing `projects.address`; don't add a second column.

```sql
alter table projects add column client_name  text check (client_name is null or length(btrim(client_name)) between 1 and 80);
alter table projects add column budget_minor bigint check (budget_minor is null or budget_minor between 1 and 1000000000); -- display only, $10,000,000 cap
```

Trigger `projects_business_fields` (before insert or update):
- Business workspace: `client_name` is required; `project_use` is forced to `'BUSINESS'` (so year-end totals treat it as business work); `pass_id` must stay null (Project Pass is Home only).
- Home workspace: `client_name` and `budget_minor` must be null (raise `23514`).
- `budget_minor` never touches the ledger and is never summed into money. It's money for display purposes, so only roles with `money.view` see or set it.

**b) Job leads** (a job ↔ a crew lead membership; a lead can lead several jobs; a job has at most one lead):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `project_id` | uuid not null | `foreign key (workspace_id, project_id) references projects (workspace_id, id) on delete cascade`; `unique (project_id)` |
| `membership_id` | uuid not null | references `memberships(id) on delete cascade`; index |
| `assigned_by` | uuid not null | references `users(id)` |
| `assigned_at` | timestamptz not null default `now()` | |

Trigger `job_leads_rules` (before insert or update): the workspace is `BUSINESS`; the membership belongs to the same workspace, has role `LEAD` and status `ACTIVE`. A lead whose membership is later removed or changed to another role simply stops counting: every scoping query joins `memberships` on `role = 'LEAD' and status = 'ACTIVE'`.

**c) Worker trade:** `alter table workers add column trade text check (trade is null or length(btrim(trade)) between 1 and 40);` Workers still have no rate column (must-not-build 3).

**d) Business settings** (one row per Business workspace):

| Column | Type | Rule |
|---|---|---|
| `workspace_id` | uuid pk | references `workspaces(id) on delete cascade` |
| `payer_display_name` | text not null | 1–80 characters after trim; shown as "Paid by" on receipts (B3) |
| `setup_completed_at` | timestamptz | null until the owner finishes setup |
| `version` | integer not null default 1 | optimistic lock for edits |
| `created_at`, `updated_at` | timestamptz not null default `now()` | |

Trigger: the workspace kind is `BUSINESS`. App code may insert and update this table through `withMember` (it holds no money); add it to nothing in invariant 2.

**e) Invitation jobs** (the jobs a crew lead invitation will lead once accepted):

| Column | Type | Rule |
|---|---|---|
| `invitation_id` | uuid not null | references `invitations(id) on delete cascade` |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `project_id` | uuid not null | `foreign key (workspace_id, project_id) references projects (workspace_id, id) on delete cascade` |
| | | `primary key (invitation_id, project_id)` |

**f) Functions** (all `SECURITY DEFINER`, hardened; each calls `require_member` itself as a second line of defence):

| Function | What it does | Errors |
|---|---|---|
| `member_scope(p_workspace, p_user) returns jsonb` (stable) | `{"all": true}` for ORGANIZER, PARTNER, OWNER, ADMIN. LEAD: `{"all": false, "project_ids": [jobs they lead], "worker_id": their own worker record or null}`. WORKER: `{"all": false, "project_ids": [], "worker_id": …}`. | `CT404` if not an active member |
| `lead_project_ids(p_workspace, p_user) returns setof uuid` (stable) | Jobs led by this user's ACTIVE LEAD membership. | — |
| `set_job_lead(p_workspace, p_actor, p_project, p_lead_user)` | `require_member(…, 'projects.manage')`. Project must be in this Business workspace. `p_lead_user` null → removes the lead. Otherwise the target must be an ACTIVE LEAD member; replaces any existing lead row. Writes an `audit_events` row (`action = 'job.lead_set'`). | `CT404` job or member not found; `CT409` with detail `NOT_A_LEAD` |
| `add_invitation_jobs(p_workspace, p_actor, p_invitation, p_projects uuid[])` | `require_member(…, 'members.manage')`. The invitation is PENDING, in this workspace, role `LEAD`. Every project is an ACTIVE job in this workspace. Inserts `invitation_jobs`. | `CT404`; `CT409` detail `NOT_A_LEAD_INVITATION` |
| `apply_invitation_jobs(p_user, p_workspace) returns integer` | Called by the API **in the same transaction** right after `accept_invitation` or `accept_invitation_code` succeeds. Finds the invitation this user accepted in this transaction (`decided_by = p_user and decided_at = now() and status = 'ACCEPTED'`, role LEAD) and inserts a `job_leads` row for each of its jobs that has no lead yet. Returns the count. Jobs that already have a lead are skipped and listed in the result. | — |

Error convention for this and later Business migrations: `raise exception … using errcode = 'CT409', detail = '<API_CODE>'`. The API maps `CT409` with a detail to **409** `{"error": "<API_CODE>"}` (without a detail it stays `CONFLICT`).

**g) Plan limits ignore Business workspaces.** Free limits (1 active project, 3 current workers, the paid-work window) are Home rules. A Business workspace is paid for by its subscription (B4). Redefine the three trigger functions from 0004 with `create or replace function`, keeping every line of their Home logic, and add one guard at the very top of each:

```sql
if (select kind from workspaces where id = new.workspace_id) = 'BUSINESS' then return new; end if;
-- trg_work_revisions_plan_limit has no workspace_id on NEW: look it up from work_entries → assignments first.
```

Keep the trigger names and definitions (`projects_plan_limit`, `assignments_plan_limit`, `work_revisions_plan_limit`); never drop or disable them (invariant 2). This guard sits in B1, not B4, because B1–B3 create several jobs and crews in Business workspaces and would otherwise hit the Free limits. **Owner check:** this is a change to trigger functions from a provided migration; it's covered by this phase file. Say so at the gate.

**`replit.md` update** (this phase file is the approval): in invariant 2, add a line "Business (0008): `set_job_lead`, `add_invitation_jobs`, `apply_invitation_jobs`." and add `job_leads` and `invitation_jobs` to the list of tables app code never writes directly.

**h) Database tests** (`db/tests/14_business_foundation.sql`, new file; never edit provided tests):
- Business job without `client_name` → `23514`; Home project with `client_name` → `23514`; Business job gets `project_use = 'BUSINESS'`.
- `job_leads`: a WORKER membership as lead → `23514`; a second lead on the same job → unique violation; a lead whose membership is REMOVED drops out of `lead_project_ids`.
- `member_scope` for each of the seven permission sets.
- `set_job_lead` by a lead → `CT403`; by an admin → works and writes an audit row; to a non-lead → `CT409 NOT_A_LEAD`.
- `apply_invitation_jobs`: invite a lead with two jobs, accept by token, both `job_leads` rows exist; accept by code, same result.
- Plan limits: a Business workspace with no plan creates 5 jobs and assigns 10 workers with no `CT402`. A Home workspace on Free still gets `CT402` on its second active project and fourth current worker (the 0004 tests 08–10 must still pass unchanged).
- Deletion: `delete_user_account(owner)` for a Business workspace with jobs, leads, settings and invitation jobs → zero rows for that workspace in every table.

### 2. Server

**The Business flag.** One helper, `businessEnabled()`, returns true when `BUSINESS_ENABLED === 'true'`, or when `APP_ENV === 'development' && BUSINESS_DEV_ACCESS === 'true'`. `GET /v1/config` returns `{business_enabled: businessEnabled()}`. When it's false, every Business-only route (marked **B** below) returns the standard 404, and `POST /v1/workspaces` refuses `BUSINESS` with 404 as in P1b. A Business-only route called with a Home workspace also returns the standard 404.

**Dev sign-in.** Add two labels, `member-e` and `member-f`, so one phone can sign in as owner, admin with money, admin without, lead and worker. Same guards as P1b.

**The scoping layer** (`server/src/auth/scope.ts`). `withMember` also loads `member_scope(workspace, user)` in the same transaction and passes it as `member.scope`. Every query that reads or writes work, workers, assignments, jobs or money takes the scope:

```ts
// Returns SQL + params that limit a query to what this member may see.
scopeJobs(member.scope, 'p.id')            // LEAD → p.id = any($n); WORKER → jobs where they have an assignment
scopeAssignments(member.scope, 'a')        // LEAD → a.project_id = any($n); WORKER → a.worker_id = $n
scopeWorkers(member.scope, 'w.id')         // LEAD → workers with an assignment on a led job; WORKER → own record only
```

Rules:
- `role_can` decides whether the action is allowed at all. The scope decides which rows. Never widen either to make something work (invariant 5).
- A record outside the member's scope is treated as not existing: **404** with the standard body, for reads and writes alike.
- Lists are filtered, never padded with "hidden" rows.
- Home roles (organizer, partner) always get `all: true`. Home behaviour doesn't change.

**Role-shaped responses** (`server/src/shape/`). One serializer per resource. Each has an allowlist of fields per role group:

| Field group | Who gets it |
|---|---|
| Money: `rate_minor`, `pay_basis`, `standard_day_minutes`, agreements, `earned_minor`, `balance_minor`, totals, `budget_minor`, payments, allocations, labour cost | roles with `money.view` |
| Crew private: skills, favorite, private note, ratings (0005) | roles with `crew.private` |
| Contact: worker phone and email | roles with `people.add` (owner, admin; Home organizer, partner) |
| Everything else in the DTO (names, trade, job name, dates, hours, status) | everyone in scope |

- Shaping happens on the server, in the response path, for every route. The apps never receive a field and then hide it.
- Exports go through the same shaper. The existing export routes (`POST /v1/exports` from P5, year totals) stay Home-only in this phase (404 in a Business workspace); B3 widens them, and they then answer **403** for roles without `export`. The work-only export for admins without money access, leads and workers arrives in B3.
- A worker record without an agreement for today on an assignment returns `rate_status: "WAITING_FOR_RATE"` to everyone in scope (it carries no amount, so leads and admins without money may see it).

**Routes** (B = Business-only). Existing P2 routes keep their paths and actions. **This phase replaces the interim `kinds: ['HOME']` rule (spec section 5.4) for the P2 routes in this table:** widen their `kinds` to `['HOME','BUSINESS']` in the same change that adds the scope, the shaper and the Business fields to them. Every other Home route (P3 work, P4–P6 money and receipts, P5 exports, P7 plan) stays `kinds: ['HOME']` until B2 or B3 scopes it. The role matrix checks both.

| Route | Kind | Action | Scope / shape | What it does |
|---|---|---|---|---|
| `POST /v1/workspaces` (`kind: BUSINESS`) | session | — | — | P1b route. With `businessEnabled()`: calls `create_workspace`, then inserts `business_settings` with `payer_display_name` = the name, in the same transaction. Idempotent by `operation_id`. |
| `GET /v1/business/settings` **B** | member | `workspace.read` | — | Settings, `setup_completed_at`, and a `setup` checklist: `{has_job, has_worker}`. |
| `PATCH /v1/business/settings` **B** | member | `settings.edit` | — | Payer display name; `expected_version` (stale → 409 `STALE_VERSION`). |
| `POST /v1/business/setup/complete` **B** | member | `settings.edit` | — | Sets `setup_completed_at` once. Needs at least one active job and one worker with an assignment; else 409 `SETUP_INCOMPLETE`. Repeat → same result. |
| `GET /v1/projects` | member | `workspace.read` | jobs in scope; money removed | Business adds `client_name`, `address`, `lead: {user_id, display_name} | null`, and for money roles `budget_minor`. Crew count. |
| `POST /v1/projects`, `PATCH /v1/projects/:id` | member | `projects.manage` | — | Business: `client_name` required; `address` optional; `budget_minor` optional and only from roles with `money.view` (otherwise 403 `FORBIDDEN`). Time zone defaults to the workspace default, then the device (D9). |
| `GET /v1/projects/:id` | member | `workspace.read` | job must be in scope | Job overview: lead, status, crew (active assignments). Money roles also get each crew row's balance **on this job's assignment only**, never the worker's total across jobs. |
| `PUT /v1/projects/:id/lead` **B** | member | `projects.manage` | — | `{lead_user_id | null, operation_id}` → `set_job_lead`. This is the missing "set or change a job's lead" screen. |
| `GET /v1/projects/:id/lead-options` **B** | member | `projects.manage` | — | Active LEAD members: user id, display name, jobs they already lead. |
| `GET /v1/jobs/:id/costs` **B** | member | `money.view` | — | From the ledger, for assignments on this job: approved earnings (EARNING + EARNING_CORRECTION), reimbursements, adjustments, payments, payment reversals, **owed** (sum of positive assignment balances) and **paid in advance** (sum of negative ones, shown separately), and `budget_minor`. Pending work is never included. B3 adds the payment detail; the numbers are right from day one because they come only from the ledger. |
| `GET /v1/workers`, `GET /v1/workers/:id` | member | `workspace.read` | workers in scope; shaped | Business adds `trade`, `app_access: NONE | INVITED | ACTIVE` (from invitations and memberships bound to the worker), `rate_status` per assignment. |
| `POST /v1/workers` | member | `people.add` | — | `{display_name, trade?, phone?, email?, document_language, project_id?, agreement?: {pay_basis: 'HOUR', rate_minor, effective_from}, operation_id}`. If `agreement` is sent by a role without `rates.set` → **403 FORBIDDEN** and nothing is saved. With `project_id` and no agreement, the assignment is created **without** an agreement and the worker is "Waiting for rate". In Business, `pay_basis` must be `HOUR` (D12) else 422 `BUSINESS_HOURLY_ONLY`. |
| `POST /v1/assignments`, `PATCH /v1/assignments/:id` | member | `people.add` | — | Assign crew to a job. In Business this never ends, moves or changes the worker's other assignments. Ending an assignment sets `end_date` (with confirm in the app); history stays on the job. |
| `POST /v1/assignments/:id/first-rate` | member | `rates.set` | — | P2 route: the first agreement for a waiting worker is inserted directly (invariant 2) and clears "Waiting for rate". Business: `HOUR` only. |
| `POST /v1/assignments/:id/agreements` (+ `/preview`) | member | `rates.set` | — | P2 route, for later changes through `apply_rate_change`. Business: `HOUR` only. Backdated changes keep the all-or-nothing preview and reason (must-not-build 4). |
| `GET /v1/team` **B** | member | `members.manage` | — | Active members (name, role, money access, jobs led, bound worker record, joined date), worker records with `app_access`, pending invitations (email, role, jobs, expiry). Emails only here. |
| `POST /v1/invitations` | member | `members.manage` | — | P1b route, extended for Business: `{role: ADMIN|LEAD|WORKER, email, financial_access?, worker_id?, project_ids?, operation_id}`. `financial_access` only with `ADMIN` and only from the OWNER (admins can't invite admins: `can_invite` already refuses → 403). `WORKER` needs `worker_id` (400 `WORKER_RECORD_REQUIRED`); `LEAD` may bind a `worker_id` and may list `project_ids`; `ADMIN` takes no jobs. Binding a worker record (a `WORKER`, or a `LEAD` with `worker_id`) needs `money.view`: the owner or an admin with money access; an admin without money access → 403 (`create_invitation` raises `CT403`) and can invite leads without a worker record only. Revoking: only invitations you sent, or ones you could have created yourself (403 otherwise). Calls `create_invitation`, then `add_invitation_jobs`, in one transaction. Token and code handling exactly as P1b (SHA-256 token, HMAC code with `CODE_PEPPER`, link from `PUBLIC_BASE_URL`). |
| `POST /v1/invite/accept`, `POST /v1/invite/accept-code` | session | — | — | P1b routes. After a successful accept into a Business workspace, call `apply_invitation_jobs(user, workspace)` in the same transaction. Return the skipped jobs so the app can say "Kitchen already has a lead". |
| `PATCH /v1/members/:userId` | member | `members.manage` | — | P1b route, now used: change role (`ADMIN`/`LEAD`/`WORKER`) and admin money access via `change_member_role`. Only the owner changes admins or money access (the function enforces it; test the 403s). The new role is required (400 `INVALID`); changing someone to `WORKER` needs a worker record already on their membership (400 `WORKER_RECORD_REQUIRED`). A demotion revokes the pending invitations that person could no longer send. Changing a lead to another role ends their lead links in effect (scoping ignores them). |
| `DELETE /v1/members/:userId` | member | `workspace.read` | — | P1b route. Business copy: "Their app access ends now. Their work history stays, and any work waiting for review stays in Work to approve." |

Every route with an id gets a cross-workspace 404 test and an out-of-scope 404 test (lead on another job, worker on another worker's record).

Logging: as before, ids, statuses and operation ids only. Never client names, budgets, rates, emails.

### 3. Mobile (behind `business_enabled`)

**Navigation by role in a Business workspace** (Business accent `#145d67`):
- Owner and admin: Today, Jobs, Team, More.
- Crew lead (B1 part): Jobs (only the jobs they lead, money removed), More. B2 adds Today and Crew.
- Worker (B1 part): More only, with a plain line "Your hours and receipts will show here." B2 adds the worker app.
- Tabs come from `can` and `kind`. Hiding is tidiness; the server decides.

**ChooseWorkspace:** **Business** appears only when `GET /v1/config` says `business_enabled`.

**Sample business** (`BWelcome` → "Explore a sample business"): a bundled `sample-business.json` (one owner, two jobs, four workers, one lead, hourly agreements, **one entry per worker per day**, no weekly totals). Opens before or after sign-in, shown in the owner view only, read-only. The sample guard from P2 covers it: zero API write calls. No role switcher, no "Reset sample".

**Setup** (`BWelcome` → `BSetup` → `BFirstJob` → `BFirstCrew`):
- `BSetup`: business name (1–80). Creates the workspace (`kind: BUSINESS`, the device time zone as the default). Copy: "You're the owner. You manage the plan and the team."
- `BFirstJob`: job name and client name, both required; address optional. Line: "Work dates use <time zone> time." Client details are private to the business (never on receipts or worker screens).
- `BFirstCrew`: worker name, trade (optional), hourly rate, "Starting" date (defaults to today in the job's time zone; the owner can change it), documents language (English / Español). "Invite them to the app later" note. Creates the worker, the assignment and the first agreement in one request.
- Then `POST /v1/business/setup/complete` and open `BOwnerToday`. (B4 inserts the Business plan screen here.)
- Each step saves when you tap Continue, so leaving halfway resumes at the next missing step (from `GET /v1/business/settings` → `setup`).

**Today** (`BOwnerToday`, `BAdminToday`): active jobs with client and lead; "Workers waiting for a rate" card (shown to roles with `rates.set`: each row opens the worker's job to set the rate); for money roles, "Owed" and "Paid in advance" as two separate totals (never netted). The "Work to approve" card arrives in B2. Admin without money access: same screen with no amounts and no balances link.

**Jobs** (`BJobs`, `BNewJob`, `BJob`, `BJobCosts`, `BAssignCrew`):
- `BJobs`: owner and admin see every job (Active / Archived filter); a lead sees only the jobs they lead.
- `BNewJob`: name, client, address (optional), budget (money roles only). "No one is notified."
- `BJob`: lead with **Change lead** (owner and admin), status, crew list, Record work (B2), Assign crew. Money roles see each crew row's balance on this job only, and a **Labour costs** link.
- **Change lead** (no PNG; build it in the `BJob` style as a list sheet): "Lead for <job>", the active crew leads with the jobs they already lead, plus "No lead". Saving calls `PUT /v1/projects/:id/lead`. If there are no leads yet: "Invite a crew lead" → `BInvite` with role Crew lead and this job ticked.
- `BJobCosts`: approved earnings, payments on this job, owed and paid in advance (separately), budget. Footer: "Pending work isn't included. Moving someone to another job never moves past costs."
- `BAssignCrew`: tick workers to add to this job. Unticking asks "End <name> on <job> from <date>? Their past work stays on this job." It never touches the worker's other jobs.

**Team** (`BTeam`, `BAddPerson`, `BAddWorker`, `BWorkerRecord`, `BInvite`, `BInviteReview`, `BInviteReady`, `BMember`, `BRoles`, `BRemoveMember`, `BAccessDenied`):
- `BTeam`: two sections, **People with app access** (role, money access for admins, jobs led) and **Worker records** (app access: none / invited / active). Pending invitations with expiry and **Revoke**.
- `BAddPerson`: "Add a worker record" or "Invite someone to use the app".
- `BAddWorker`: name, trade, phone, email, documents language, job. **Rate fields only for roles with `rates.set`.** An admin without money access sees: "The owner sets <name>'s rate. Work can't be approved until then." No rate field, no $0.
- `BWorkerRecord`: jobs, app access, per-job rate and rate history (money roles), "Waiting for rate" badge (everyone), **Invite to the app** (opens `BInvite` bound to this worker record).
- `BInvite`: name (for your reference), email, role. Owner sees Admin, Crew lead, Worker; an admin with money access sees Crew lead, Worker; an admin without money access sees Crew lead only, with no "Also a worker" record (a login bound to a worker record would show that worker's money, so the database refuses it). "Can see and record money" checkbox only for the owner inviting an Admin. Crew lead: jobs to lead (optional, several allowed) and optional "Also a worker" record. Worker: the worker record (required; pick or create). Admin: no job field.
- `BInviteReview`: email, role, jobs, money access, "Costs nothing for them. Expires in 7 days. They get access only after they accept."
- `BInviteReady`: the link and code once, **Share** and **Copy**, then the pending card with **Revoke** (same as P1b's Home flow; message text in Business words: "Join <business> on CrewTally as <role>. Open <link> on your iPhone, or enter code <code> with this email address: <email>. It works for 7 days.").
- `BMember`: role, jobs led, money access, joined date; **Change role** and **Money access** (owner only for admins and money access), **Change jobs** for a lead (opens job pickers that call `PUT /v1/projects/:id/lead`), **Remove access** (`BRemoveMember`).
- `BRoles`: the static table of what each role can do. Its rows must match `role_can` plus the scoping rules; a unit test compares the table data with `member_permissions` for each role.
- `BAccessDenied`: shown on any 403: "You don't have permission for this. Ask the owner or an admin." and **Back to my work**.

**Wording checks:** no "payroll", no "Unlimited", no "AI". Status pills always text plus icon. 44 pt targets, Dynamic Type, VoiceOver labels on every control.

### 4. Web (behind `business_enabled`)

Build the Business variants of the pages P1c and P2 built for Home, at the same paths (`…/x` = `/app/w/:workspaceId/x`, Phase 1c). Same API, same errors, same rules. New pages: `business-setup` at `/app/start/business` and `roles` at `…/team/roles`.
- **Sidebar by role:** owner and admin: Today, Jobs, Team, Roles, Settings; lead: Jobs. (B2 and B3 add the rest.)
- `business-setup`: the person is already signed in (P1c), so the web flow is business name → first job (`setup-project` in Business form: job, client, address) → first worker (`new-worker` in setup form) → `setup-ready` (no demo link).
- `projects`, `project`, `new-project`, `edit-project`: client, address, budget (money roles only), lead with **Change lead** (a dialog with the same list as iPhone), crew with this-job balances for money roles.
- `crew` (Team), `worker`, `add-person`, `new-worker`, `edit-worker`: same rules as iPhone. **`new-worker` for an admin without money access has no rate field and saves the worker as Waiting for rate.** Rate inputs are text parsed with integer math (invariant 1), hourly only, with an effective-from date.
- `assign-crew`: adds without removing other jobs; ending asks for a date.
- `invite-person`, `invite-review`, `invitations`, `member`: Business roles, jobs for leads, worker record for workers, owner-only money access, revoke, change role.
- `roles`: the role table (owner, admin with and without money access, crew lead, worker), from the same data as `BRoles`.
- `dashboard` (Business Today for owner and admin): jobs, waiting-for-rate, owed and paid in advance separately.
- Every money input on the web is text parsed with integer math, never `parseFloat`. Keyboard use, visible focus, labels, WCAG 2.1 AA.

### 5. Tests

**Server — role matrix.** Extend the P1b role harness with Business fixtures: one Business workspace, jobs J1 and J2, lead L1 leading J1 only, worker W1 (bound to worker record R1 on J1), worker record R2 (on J2, no login), admin A$ (money), admin A (no money), owner O. Add to the matrix rows for every route above, for each of: O, A$, A, L1 on J1, L1 on J2, W1 own record, W1 on R2, a Home organizer (Business-only routes with their own Home workspace id), removed member, outsider.

| Route | O | A$ | A | L1 own job | L1 other job | W1 own | W1 other | Home organizer | Removed / outsider |
|---|---|---|---|---|---|---|---|---|---|
| `GET /v1/business/settings` | 200 | 200 | 200 | 200 | — | 200 | — | 404 | 404 |
| `PATCH /v1/business/settings` | 200 | 403 | 403 | 403 | — | 403 | — | 404 | 404 |
| `POST /v1/business/setup/complete` | 200 | 403 | 403 | 403 | — | 403 | — | 404 | 404 |
| `GET /v1/projects` | all jobs | all | all | J1 only | — | J1 only (assigned) | — | Home list | 404 |
| `GET /v1/projects/:id` | 200 | 200 | 200, no money | 200, no money | 404 | 200, own row only, no money | 404 | 404 (other workspace id) | 404 |
| `POST /v1/projects` | 201 | 201 | 201 (403 if `budget_minor` sent) | 403 | 403 | 403 | 403 | n/a | 404 |
| `PUT /v1/projects/:id/lead` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 404 | 404 |
| `GET /v1/projects/:id/lead-options` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 404 | 404 |
| `GET /v1/jobs/:id/costs` | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 404 | 404 |
| `GET /v1/workers` | all, shaped | all | all, no money | crew on J1, names and trade only | — | own record only | — | Home list | 404 |
| `GET /v1/workers/:id` | 200 | 200 | 200, no money | 200 (crew on J1), no money, no contact, no crew private | 404 | 200 own, no money | 404 | 404 | 404 |
| `POST /v1/workers` | 201 | 201 | 201 without rate; 403 with rate | 403 | 403 | 403 | 403 | n/a | 404 |
| `POST /v1/assignments` | 201 | 201 | 201 | 403 | 403 | 403 | 403 | n/a | 404 |
| `POST /v1/assignments/:id/first-rate`, `POST /v1/assignments/:id/agreements` | 201 | 201 | 403 | 403 | 403 | 403 | 403 | n/a | 404 |
| `GET /v1/team` | 200 | 200 | 200 | 403 | — | 403 | — | 404 | 404 |
| `POST /v1/invitations` (ADMIN) | 201 | 403 | 403 | 403 | — | 403 | — | n/a | 404 |
| `POST /v1/invitations` (LEAD without a worker record; WORKER or worker-bound LEAD needs money access too — see the invitation tests) | 201 | 201 | 201 | 403 | — | 403 | — | n/a | 404 |
| `PATCH /v1/members/:userId` (admin target) | 200 | 403 | 403 | 403 | — | 403 | — | n/a | 404 |
| `PATCH /v1/members/:userId` (lead target) | 200 | 200 | 200 | 403 | — | 403 | — | n/a | 404 |
| `DELETE /v1/members/:userId` (other) | 200 | 200 for lead/worker, 403 for admin | same | 403 | — | 403 | — | n/a | 404 |

("—" means the case doesn't apply to that route; the harness skips it.)

**Server — the rest:**
- `money_key_scanner`: for every registered GET route and every export route, call it as A, L1 and W1 (with data present) and walk the JSON or CSV header. Fail if any key or column matches `/(_minor|rate|balance|amount|budget|earned|paid|labor|labour)/i`, except `rate_status`. Add every new route automatically by reading the route table, so later phases can't forget.
- Crew-private and contact fields never reach L1 or W1 (scan for `skills`, `favorite`, `note`, `rating`, `phone`, `email` keys in worker DTOs).
- `admin_no_money_adds_worker_waiting_for_rate`: A posts a worker with a job and no agreement → 201, `rate_status = WAITING_FOR_RATE`, zero `rate_agreements` rows; A posts with an agreement → 403 and nothing saved (count workers before and after); O sets the rate → status clears.
- `BUSINESS_HOURLY_ONLY`: a DAY agreement in a Business workspace → 422.
- `assign_crew_keeps_other_jobs`: W on J1, assign to J2 → both assignments active; end J1 → J1 history unchanged.
- `job_costs_never_net_advances`: seed (through the DB functions in a test-only path) one worker owed $300 and one paid $100 in advance on the same job → costs show owed 30000 and paid in advance 10000, not 20000.
- Invitations: owner invites an admin with money access → accepted member has `financial_access = true`; admin can't invite an admin (403) or set money access; WORKER invite without `worker_id` → 400; admin without money access invites a WORKER bound to a worker record → 403, a LEAD without a worker → 201; an admin removed after inviting → their pending invitation answers 410 on accept; lead invite with J1 and J2 → after acceptance both leads exist; acceptance when J2 already has a lead → J2 reported as skipped. Token and code never stored or logged (reuse the P1b assertions).
- Removal: after `DELETE /v1/members/L1`, every route returns 404 for L1 at once; J1's lead shows as none.
- Flag: with `BUSINESS_ENABLED=false` and `APP_ENV=production` (set in the test), `BUSINESS_DEV_ACCESS=true` is ignored: `GET /v1/config` → `false`, Business routes → 404, `POST /v1/workspaces {kind: BUSINESS}` → 404.
- Home unchanged: the full Home role matrix and every Home route test from P1b–P7 still pass.
- Existing exports (`POST /v1/exports`, year totals) are still Home-only here → 404 for every Business role (B3 widens them; then 403 for A, L1, W1).

**Mobile:** tabs by role and kind; sample business makes zero API writes; `BAddWorker` renders no rate input when `can['rates.set']` is false; a 403 opens `BAccessDenied`; Change lead sends `PUT /v1/projects/:id/lead` with an `operation_id` kept through retries.

**Web:** `new-worker` has no rate input for A; money inputs parse with integer math (test `"12.5"` → 1250, `"0.07"` → 7, `"1,245.50"` → 124550, `"1.005"` → error); the sidebar for L1 shows Jobs only; a 403 shows the access-denied page.

## Proof to paste at the gate
- `0008_business_foundation.sql` in full, and `db/tests/14_business_foundation.sql` with its pass count.
- The three redefined trigger functions, showing the Business guard at the top and the unchanged Home logic below it (a `diff` against 0004's bodies is best).
- `scope.ts` and one route that uses it (`GET /v1/workers/:id`).
- The worker serializer with its allowlists, and the `money_key_scanner` test.
- `POST /v1/workers` showing the 403 for rate fields without `rates.set` and the no-agreement path.
- The Business rows of the role matrix and the pass count.
- `businessEnabled()` and its production test.
- Test file names and counts for all suites.

## Try it on your phone (Expo Go, dev sign-in)
1. Sign in as **owner-a**. Choose workspace → **Business** → name "Rivera Builders". Add the first job "Kitchen" for client "Ana Lopez", then a first worker "Dee" at $30/hour. You land on Business Today.
2. Jobs → add "Deck" for client "Sam Park". Two active jobs, no plan screen and no limit message.
3. Team → Invite → **Admin**, tick "Can see and record money", any email. Copy the code. Invite a second **Admin** without money access, a **Crew lead** for Kitchen, and a **Worker** bound to Dee.
4. Sign in as **member-c** and join as the admin with money; **member-d** as the admin without money; **member-e** as the crew lead; **member-f** as the worker.
5. As **member-d** (no money): Today shows jobs with no amounts. Team → Add worker "Luis" on Deck: there's no rate field, and Luis shows "Waiting for rate".
6. As **owner-a**: Today shows "Workers waiting for a rate: Luis". Set $28/hour. The badge clears.
7. As **member-e** (lead): Jobs shows only Kitchen. Open it: crew names, no rates, no balances, no Labour costs.
8. As **owner-a**: Deck → Change lead → member-e. Sign in as member-e again: Jobs shows Kitchen and Deck.
9. As **member-f** (worker): only More is there, with "Your hours and receipts will show here."
10. As **owner-a**: Team → member-e → Remove access. Sign in as member-e: "Access removed", then the switcher.
11. Signed out: Choose workspace → Business → Explore a sample business. Look around; Diagnostics after sign-in shows no new records.

## Try it on the web
1. Sign in as owner-a (P1c email code or Apple). Switch to Rivera Builders. Jobs, Team and Roles match the phone.
2. Edit Kitchen's budget to $12,000. Sign in as member-d (admin without money) in a private window: the job shows no budget; the Add worker form has no rate field.
3. As owner-a: Team → change member-c's money access off. As member-c, reload: amounts are gone.
4. Open the Roles page: it matches what you just saw.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase B1 ready for review".
