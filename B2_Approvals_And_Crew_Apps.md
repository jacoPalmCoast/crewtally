# Phase B2 — Approvals, crew lead app and worker app (Release 1.1)

> **Before pasting:**
> 1. Phase B1 passed its gate. `BUSINESS_ENABLED` is still `false`; `BUSINESS_DEV_ACCESS=true` with `APP_ENV=development` keeps Business visible in Expo Go and the dev web app only.
> 2. Push the current code to GitHub.

## Goal

In a Business workspace, work goes through **submit → approve or return**. Earnings reach the ledger **only when work is approved**, exactly once. This phase builds:

- migration `0009_business_work_states.sql` and its tests: a **sidecar** table for submitted work with its states, an immutable approval log, worker correction requests, in-app receipt confirmations and questions, and in-app notifications;
- new database functions for submit, approve, return, correction requests and payment questions. **Approval is the only Business path that writes earnings, and it does so by calling the unchanged `record_work`.**
- owner and admin work approved on save, with an audit record (D10);
- the **crew lead app** (Today for the assigned crew, jobs, crew, submissions) and the **worker app** (own hours, own work, my money, own receipts);
- **Work to approve** on iPhone and the web: submitted work, worker correction requests, and payment questions (money roles only);
- the web **multi-person timesheet** with an explicit **No work** per row, approvals, my money, my receipt, report a problem, team access, notifications.

Home's write path doesn't change: Home keeps `PUT /v1/work/...`, `record_work` on save, Undo and Mark rest exactly as P3 built them. No function in invariant 2, `fn_earned`, `role_can` or `require_member` changes.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: §14 Business workspace (approvals, corrections, owner inbox), §11 Money rules (must-not-build list), §5 Roles and permissions, §12 Web app (timesheet), §15 Data model and migrations, §16 API surface, §19 Things to confirm.
- `db/schema.sql`: `record_work` (how it picks the agreement for the date, idempotency, `EARNING` vs `EARNING_CORRECTION`, the reason rule), `work_entries`, `work_revisions`, `acknowledgments`, `audit_events`.
- `db/migrations/0008_business_foundation.sql`: `member_scope`, `lead_project_ids`.
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase = B2` (24 mobile, 10 web).
- Screens: `docs/screens-2.0/mobile/` `BOwnerRecord`, `BWorkReview`, `BWorkSaved`, `BApprovals`, `BApproval`, `BReturnWork`, `BApprovalDone`, `BHistory`, `BLeadToday`, `BLeadRecord`, `BLeadSubmissions`, `BLeadEntry`, `BLeadCrew`, `BCrewMember`, `BWorkerToday`, `BWorkerHours`, `BWorkerReview`, `BWorkerHistory`, `BWorkerEntry`, `BWorkerCorrection`, `BWorkerMoney`, `BWorkerReceipt`, `BReceiptProblem`, `BCorrectionReview`; web `approvals`, `approval`, `return-work`, `timesheet`, `timesheet-review`, `my-money`, `my-receipt`, `report-issue`, `team-access`, `notifications`; `web/roles/lead.png`, `worker.png`.
- Your P3 work queue (`mobile/lib/workQueue.ts`), the P6 receipt snapshot and worker view, and the B1 scoping layer and shaper.

## Must-not-build items in this phase (spec §11)
| # | Prototype behaviour | How this phase stops it | Test |
|---|---|---|---|
| 1 | $0 rate for a worker added by an admin without money access | Approval refuses work with no agreement for the date (409 `RATE_NEEDED`); work can wait, pay is never guessed | `approve_without_rate_is_refused` |
| 3 | Rate copied from the worker's current field when the entry is saved | Approval calls `record_work`, which takes the agreement **in force on the work date** at approval time | `rate_is_the_agreement_on_the_work_date` |
| 5 | Start/end/break wrapping past midnight (8:00–8:10 with a 30-minute break = 23 h 40 m) | Business screens take hours and minutes only (no start/end). Minutes must be 1–1,440; anything else is 400 | `hours_input_rejects_bad_values` |
| 6 | No per-entry rounding in Business and web totals | Earnings come only from `fn_earned` through `record_work`; screens show server amounts | `business_earnings_match_fn_earned_vectors` |
| 7 | Work saved on the phone counts in the balance before it syncs | Pending and queued work never reaches the ledger; screens show it apart as "Waiting for approval" (hours, no money) | `pending_never_in_balance` |
| 15 | An offline correction hides the original's earnings until resubmitted (the prototype does it to Home entries on the web; Business must not repeat it) | A correction is a new submission; the approved revision and its earnings stay until the correction is **approved** | `correction_keeps_original_until_approved` |
| — | Approving twice adds earnings twice | Row lock + state check + idempotency; second approval → 409 `ALREADY_REVIEWED` | `double_approval_under_concurrency` |
| — | Returning without a reason; resubmit overwrites the entry in place | Reason 1–500 characters required on the server; resubmission is a new submission that supersedes the returned one | `return_needs_reason`, `resubmit_supersedes` |
| — | Owner correction of approved work saved offline, with a 168 h cap | Approve, return and correction review need a connection; never queued. Minutes cap 1,440 per day entry | mobile `approval_actions_never_queue` |
| — | One entry per worker per day across all jobs | One entry per worker **per job** per day, plus a warning over 16 hours or more than one day across jobs (1.4 rule) | `cross_job_warning` |
| — | Web timesheet: blank means "did not work" | Blank stays Unrecorded; **No work** is an explicit choice per row | web `timesheet_blank_is_unrecorded` |
| — | A worker's job page shows everyone's hours and labour cost | Worker routes are scoped to their own worker record and never carry other people or money other than their own | role matrix + `money_key_scanner` |

## Build

### 1. Migration `0009_business_work_states.sql`

Write it at this phase with `db/tests/15_business_work_states.sql`. Additive only. Same deletion rule as B1: every new table references `workspaces(id) on delete cascade`, and every foreign key to an older table is `on delete cascade`. End with `select harden_definer_functions();`.

**Why a sidecar.** `record_work` writes a revision and the ledger delta on every save. That's right for Home. For Business, the proposed work waits in `work_submissions` and touches neither `work_entries` nor the ledger. Approval then calls `record_work` with the submitted values. So in a Business workspace, `work_entries` and `work_revisions` hold **approved work only**, and every ledger `EARNING` / `EARNING_CORRECTION` row exists because someone approved it.

**a) `correction_requests`** (a worker asks for a change to approved work; text only):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `entry_id` | uuid not null | `foreign key (workspace_id, entry_id) references work_entries (workspace_id, id) on delete cascade` |
| `worker_id` | uuid not null | `foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade` |
| `requested_by` | uuid not null | references `users(id)` |
| `note` | text not null | 1–500 characters after trim |
| `status` | text not null default `'OPEN'` | `OPEN`, `CORRECTED`, `KEPT` |
| `resolution_note` | text | required when `KEPT` (1–500); shown to the worker |
| `resolved_by` | uuid | references `users(id)` |
| `resolved_at` | timestamptz | `check ((status = 'OPEN') = (resolved_at is null))` |
| `operation_id` | uuid not null | `unique (workspace_id, operation_id)` |
| `created_at` | timestamptz not null default `now()` | |

`create unique index correction_requests_one_open on correction_requests (entry_id) where status = 'OPEN';`

**b) `work_submissions`** (the sidecar):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `assignment_id` | uuid not null | `foreign key (workspace_id, assignment_id) references assignments (workspace_id, id) on delete cascade` |
| `work_date` | date not null | |
| `kind` | text not null | `NEW` (no approved entry for that worker × job × day when submitted) or `CORRECTION` |
| `base_entry_version` | integer not null default 0 | `work_entries.version` when submitted; 0 for `NEW` |
| `input_mode` | text not null | `HOUR_MINUTES`, `DAY_MINUTES`, `DAY_PORTION`, `NO_WORK`, `VOID` (the engine keeps daily modes; Business screens send only `HOUR_MINUTES`, `NO_WORK` and `VOID`, D12) |
| `portion` | numeric(5,4) | same shape check as `work_revisions` |
| `minutes` | integer | 1–1,440; same shape check as `work_revisions` |
| `note` | text | ≤ 500 |
| `reason` | text | ≤ 500; required when `kind = 'CORRECTION'` |
| `source` | text not null | `MANAGER`, `LEAD`, `WORKER` (from the actor's role, never from the client) |
| `state` | text not null default `'PENDING'` | `PENDING`, `APPROVED`, `RETURNED`, `SUPERSEDED` |
| `submitted_by` | uuid not null | references `users(id)` |
| `submitted_at` | timestamptz not null default `now()` | |
| `replaces_submission_id` | uuid | references `work_submissions(id) on delete cascade`; the pending or returned submission this one replaced |
| `correction_request_id` | uuid | references `correction_requests(id) on delete cascade` |
| `decided_by` | uuid | references `users(id)` |
| `decided_at` | timestamptz | |
| `return_reason` | text | 1–500 |
| `approved_entry_id` | uuid | `foreign key (workspace_id, approved_entry_id) references work_entries (workspace_id, id) on delete cascade` |
| `approved_revision` | integer | the `work_revisions.revision` that approval created |
| `cross_job_confirmed` | boolean not null default false | |
| `operation_id` | uuid not null | `unique (workspace_id, operation_id)` |

Checks:
- `(state = 'PENDING') = (decided_at is null)`
- `(state = 'APPROVED') = (approved_revision is not null and approved_entry_id is not null)`
- `(state = 'RETURNED') = (return_reason is not null)`
- `kind <> 'CORRECTION' or (reason is not null and base_entry_version > 0)`
- `input_mode <> 'VOID' or kind = 'CORRECTION'`
- the same mode/portion/minutes shape check as `work_revisions`.

Indexes: `create unique index work_submissions_one_pending on work_submissions (assignment_id, work_date) where state = 'PENDING';` and `(workspace_id, state, submitted_at)`.

Trigger `work_submissions_rules` (before insert or update): the workspace is `BUSINESS` (a Home workspace can never get a submission); on update only `state`, `decided_by`, `decided_at`, `return_reason`, `approved_entry_id`, `approved_revision` may change, and only along `PENDING → APPROVED | RETURNED | SUPERSEDED` or `RETURNED → SUPERSEDED`. Anything else raises `23514`.

**c) `approval_events`** (immutable decision log):

| Column | Type | Rule |
|---|---|---|
| `id` | bigint generated always as identity pk | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `submission_id` | uuid | references `work_submissions(id) on delete cascade` |
| `correction_request_id` | uuid | references `correction_requests(id) on delete cascade` |
| `decision` | text not null | `SUBMITTED`, `APPROVED`, `AUTO_APPROVED`, `RETURNED`, `SUPERSEDED`, `CORRECTION_REQUESTED`, `CORRECTION_MADE`, `CORRECTION_KEPT` |
| `actor_id` | uuid not null | references `users(id)` |
| `reason` | text | required for `RETURNED` and `CORRECTION_KEPT` |
| `created_at` | timestamptz not null default `now()` | |

`check (num_nonnulls(submission_id, correction_request_id) >= 1)`. Trigger `approval_events_immutable`: any `UPDATE` raises; a `DELETE` raises unless `current_setting('workpay.deleting_workspace', true) = old.workspace_id::text` (the flag `delete_workspace_data` sets; cascaded deletes happen inside that transaction). App code never writes this table.

**d) `member_acknowledgments`** (a signed-in worker confirms or questions their own payment in the app; the public link page keeps using `acknowledge_share_link` and `acknowledgments`):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `payment_id` | uuid not null | `foreign key (workspace_id, payment_id) references payments (workspace_id, id) on delete cascade` |
| `worker_id` | uuid not null | `foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade` |
| `user_id` | uuid not null | references `users(id)` |
| `kind` | text not null | `RECEIVED` or `QUERY` |
| `note` | text | ≤ 500; required for `QUERY` |
| `resolved_by` | uuid | references `users(id)` |
| `resolved_at` | timestamptz | |
| `operation_id` | uuid not null | `unique (workspace_id, operation_id)` |
| `created_at` | timestamptz not null default `now()` | |

`create unique index member_ack_one_received on member_acknowledgments (payment_id, worker_id) where kind = 'RECEIVED';`

**Two channels, one rule:** a payment counts as **Confirmed** for a worker if a `RECEIVED` row exists in either `member_acknowledgments` or `acknowledgments` (through a `share_links` row for that payment's receipt with `view_worker_id` = the worker). The in-app function returns `already_confirmed` if either exists. `acknowledge_share_link` can't see in-app rows (it's unchanged), so a later link confirmation may add a second row; read models show one "Confirmed" with the earliest time. Questions from both channels land in the same inbox.

**e) `notifications`** (in-app list only, D14; no email, no push):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `recipient_user_id` | uuid not null | references `users(id)` |
| `type` | text not null | `WORK_SUBMITTED`, `WORK_RETURNED`, `WORK_APPROVED`, `CORRECTION_REQUESTED`, `CORRECTION_RESOLVED`, `PAYMENT_QUESTION`, `RECEIPT_READY` |
| `entity_type` | text not null | `SUBMISSION`, `CORRECTION_REQUEST`, `PAYMENT_QUESTION`, `RECEIPT` |
| `entity_id` | uuid not null | |
| `created_at` | timestamptz not null default `now()` | |
| `read_at` | timestamptz | |

Index `(recipient_user_id, workspace_id, created_at desc)`. A notification stores **no text, names or amounts**. The API builds the line at read time, through the B1 shaper, so someone who loses money access never sees an amount from an old notice. A notice is listed only while the recipient is still an active member and the entity is still in their scope.

**f) Functions** (all `SECURITY DEFINER`, hardened, idempotent through `idem_get` / `idem_put` with a hash that includes the actor; each calls `require_member` and re-checks the B1 scope itself, as a second line of defence behind the API). Errors use `CT409` with an API code in `detail` (B1 convention), `CT403`, `CT404`, `22023`.

| Function | What it does |
|---|---|
| `submit_work(p_workspace, p_actor, p_operation, p_assignment, p_date, p_mode, p_portion, p_minutes, p_note, p_reason, p_confirm_cross_job, p_correction_request)` | 1. `require_member(…, 'work.record')`; workspace is `BUSINESS`. 2. Assignment in this workspace, job ACTIVE, date within the assignment, date not after `project_today(job)` (else `22023`). 3. Scope: LEAD → job in `lead_project_ids`; WORKER → the assignment's worker is their bound record (any date inside the assignment and not after the job's today, as step 2 says: spec section 14.2 asks for today or an earlier day, never a today-only screen), and a WORKER may only submit `NEW` work (a correction → `CT403`; they use a correction request). 4. If an agreement exists for the date, the mode must match its basis (`HOUR` ↔ `HOUR_MINUTES`; `DAY` ↔ `DAY_PORTION`/`DAY_MINUTES`; `NO_WORK` and `VOID` fit both), else `CT409 MODE_DOES_NOT_MATCH_RATE`. No agreement is allowed: the work waits for a rate. 5. Lock the `work_entries` row for (assignment, date) if it exists: `kind = CORRECTION` with `base_entry_version = version`, else `NEW` (`VOID` on `NEW` → `22023`). 6. Existing PENDING submission for the same assignment and date: if it was submitted by the same person, or the actor is OWNER/ADMIN, mark it `SUPERSEDED` (with an event) and link it in `replaces_submission_id`; otherwise `CT409 ALREADY_SUBMITTED`. The latest RETURNED one, if any, becomes `SUPERSEDED` the same way. 7. Cross-job check (below). 8. Insert the submission, an `approval_events` `SUBMITTED` row and `WORK_SUBMITTED` notifications for every active OWNER and ADMIN except the actor. 9. If the actor is OWNER or ADMIN (D10), call the approval step at once with decision `AUTO_APPROVED`; if that step can't approve because there's no rate, leave it `PENDING` and return `state = 'PENDING', waiting_for_rate = true`. 10. If `p_correction_request` is set, the actor must be OWNER/ADMIN and the request must be OPEN for the same entry; it's closed as `CORRECTED` when the submission is approved. Returns `{submission_id, state, kind, waiting_for_rate, cross_job: {...}}`. |
| `approve_work_submission(p_workspace, p_actor, p_operation, p_submission)` | 1. `require_member(…, 'work.approve')`. 2. `select … for update` on the submission; not in this workspace → `CT404`; state not `PENDING` → `CT409 ALREADY_REVIEWED`. 3. Lock the `work_entries` row for (assignment, date). Its current version (0 if none) must equal `base_entry_version`, else `CT409 ENTRY_CHANGED` (someone approved other work for that day, or a rate change recalculated it; return it or ask for a new submission). 4. No agreement in force on the work date → `CT409 RATE_NEEDED`. Job archived → `CT409 JOB_ARCHIVED`. 5. Call **`record_work(p_workspace, <submission id as operation id>, assignment, date, mode, portion, minutes, base_entry_version, reason, note)`**. That's the only write to `work_entries`, `work_revisions` and `ledger_events`, and `record_work` picks the agreement in force on the work date. 6. Set the submission `APPROVED` with `approved_entry_id`, `approved_revision`, `decided_by`, `decided_at`. 7. Insert `approval_events` (`APPROVED`, or `AUTO_APPROVED` when called from `submit_work`), an `audit_events` row (`work.approved` / `work.auto_approved`, entity = submission), and a `WORK_APPROVED` notification for the submitter if it isn't the actor. 8. Close a linked correction request as `CORRECTED` (event `CORRECTION_MADE`, notification `CORRECTION_RESOLVED` to the requester). Returns `{submission_id, entry_id, revision, earned_minor, delta_minor}`. |
| `return_work_submission(p_workspace, p_actor, p_operation, p_submission, p_reason)` | `require_member(…, 'work.approve')`; lock; must be `PENDING` (else `CT409 ALREADY_REVIEWED`); reason trimmed 1–500 (else `22023`). Sets `RETURNED`, event `RETURNED` with the reason, notification `WORK_RETURNED` to the submitter. No ledger effect. |
| `request_work_correction(p_workspace, p_actor, p_operation, p_entry, p_note)` | `require_member(…, 'work.record')`; the actor is a WORKER bound to the entry's worker; the entry's active revision is approved work (not `VOID`); note 1–500. One OPEN request per entry → `CT409 ALREADY_REQUESTED`. Inserts the request, event `CORRECTION_REQUESTED`, notifications to OWNER and ADMINs. The approved work and its earnings stay exactly as they are. |
| `keep_work_as_is(p_workspace, p_actor, p_operation, p_request, p_note)` | `require_member(…, 'work.approve')`; request OPEN; note 1–500 (shown to the worker). Status `KEPT`, event `CORRECTION_KEPT`, notification to the requester. |
| `acknowledge_payment_in_app(p_workspace, p_actor, p_operation, p_payment, p_kind, p_note)` | `require_member(…, 'workspace.read')`; the actor is a WORKER (or a LEAD with a bound worker record) whose worker has an allocation on this payment, else `CT404`. `RECEIVED`: returns `already_confirmed` if either channel already has one. `QUERY`: note 1–500 required; notifications `PAYMENT_QUESTION` to the OWNER and every ADMIN with money access. Never changes money. |
| `resolve_payment_question(p_workspace, p_actor, p_source, p_id)` | `require_member(…, 'money.record')`; `p_source` is `APP` (`member_acknowledgments`) or `LINK` (`acknowledgments`, the public page). Sets `resolved_at` (and `resolved_by` for `APP`). Idempotent. |
| `mark_notifications_read(p_workspace, p_user, p_ids uuid[])` | `require_member(…, 'workspace.read')`; only the caller's own notifications. |
| `preview_submission(p_workspace, p_submission) returns jsonb` (stable) | The agreement in force on the work date (`rate_minor`, `pay_basis`) and `fn_earned` for the submitted values, or `rate_needed: true`. The API returns it only to roles with `money.view`. |

**Cross-job check (in `submit_work`).** For the same worker and date, add up every other assignment's approved active revision and every other PENDING submission: minutes for `HOUR_MINUTES`/`DAY_MINUTES`, portions for `DAY_PORTION`. If minutes (including this one) are more than 960 (16 hours), or portions add up to more than 1 day, and `p_confirm_cross_job` is false → `CT409 CROSS_JOB_CONFIRM` with `detail` JSON `{"total_minutes": n, "total_portion": "…"}`. With confirm, save and set `cross_job_confirmed = true`. The API never names the other job or its hours to a lead or worker ("<Name> already has work on another job that day. Together it's more than 16 hours."). Separately, a single entry over 12 hours asks for confirmation in the apps (1.4 rule), and the server allows it.

**Concurrency.** Two approvals of the same submission at once: the second waits on the row lock, then sees `APPROVED` and raises `ALREADY_REVIEWED`. The ledger has one `EARNING`. A retry with the same `operation_id` returns the first result.

**Read helpers** (stable views or functions, no writes):
- `business_day_status(p_workspace, p_project, p_date)`: for each active assignment on the job that day: approved revision (mode, minutes, earned), latest submission (state, minutes, submitted_by, return reason), `rate_status`, and `Unrecorded` when there's neither. Blank is never "No work".
- `worker_money(p_workspace, p_worker)`: per assignment and in total, from the ledger only: approved earnings, reimbursements, adjustments, payments, reversals, balance; plus pending submissions as **count and minutes** (no money); plus receipts (number, date, amount for this worker's lines, status, confirmed or not).

**`replit.md` update** (this phase file is the approval): in invariant 2, add "Business work (0009): `submit_work`, `approve_work_submission`, `return_work_submission`, `request_work_correction`, `keep_work_as_is`, `acknowledge_payment_in_app`, `resolve_payment_question`, `mark_notifications_read`." and add `work_submissions`, `approval_events`, `correction_requests`, `member_acknowledgments` and `notifications` to the tables app code never writes directly. Also add: "In a Business workspace, earnings reach the ledger only through `approve_work_submission`."

**g) Database tests** (`db/tests/15_business_work_states.sql`, new file):
- A Home workspace can't get a `work_submissions` row (`23514`). Home `record_work` still posts on save (rerun one Home case).
- Lead submits 8 h for a crew member → state PENDING, zero `ledger_events` rows. Approve → one `EARNING` of exactly `fn_earned('HOUR', rate, 'HOUR_MINUTES', null, 480, null)`. Approve again → `CT409 ALREADY_REVIEWED`, still one row.
- **Concurrency:** two sessions approve the same submission with different operation ids (use `dblink` if the test runner has it, else do it in the server test below and say so). Exactly one succeeds; one `EARNING` row.
- Return without a reason → `22023`; with a reason → RETURNED, no ledger. Resubmit → the old one is SUPERSEDED, the new one PENDING.
- Correction of approved work (8 h → 6 h): the original revision and its `EARNING` stay while PENDING; approving adds one `EARNING_CORRECTION` of `-(2 h × rate)`; the old submission still reads APPROVED, the entry's active revision is 2.
- `VOID` correction approved → `EARNING_CORRECTION` equal to minus the earned amount; balance back to zero.
- No agreement → submit works, approve → `CT409 RATE_NEEDED`; add an agreement → approve works.
- **Rate on the work date:** agreement $30/h from 1 Sep and $35/h from 20 Sep. Submit for 15 Sep, approve "on 25 Sep" → the revision's `rate_minor_snapshot` is 3000.
- `ENTRY_CHANGED`: two pending corrections can't exist (unique pending); a correction whose base version moved (after `apply_rate_change` on the assignment) → `CT409 ENTRY_CHANGED`.
- Mode mismatch: `HOUR_MINUTES` against a `DAY` agreement → `CT409 MODE_DOES_NOT_MATCH_RATE`.
- Cross-job: 10 h on J1 approved, 7 h on J2 → `CT409 CROSS_JOB_CONFIRM`; with confirm → saved.
- Owner submit → APPROVED at once with an `AUTO_APPROVED` event and an `audit_events` row.
- `approval_events`: update → error; delete → error; `delete_user_account(owner)` → succeeds and leaves zero rows in every 0008 and 0009 table for that workspace.
- Worker correction request: second OPEN on the same entry → `CT409`; `keep_work_as_is` without a note → `22023`.
- In-app `RECEIVED` twice → `already_confirmed`; after a link confirmation for the same payment and worker → `already_confirmed`.

### 2. Server

All routes below are Business-only (404 in a Home workspace or with the flag off). Every write takes an `operation_id`. Payments and approvals never come from a queue.

**Home routes in a Business workspace.** Widen `kinds` on the P3 work routes to Business now (spec section 5.4): `PUT /v1/work/:assignmentId/:date`, `POST /v1/work/:assignmentId/:date/void` and `POST /v1/projects/:id/day/:date/mark-rest` return **409** `{"error":"BUSINESS_USES_SUBMISSIONS"}` in a Business workspace. Home is unchanged. The read routes (`GET /v1/work…`, revisions) work in Business with the B1 scope and shaper.

| Route | Action | Scope / shape | What it does |
|---|---|---|---|
| `POST /v1/submissions` | `work.record` | lead: led jobs; worker: own, NEW only | `{assignment_id, work_date, mode: HOURS|NO_WORK|VOID, minutes?, note?, reason?, confirm_cross_job?, correction_request_id?, operation_id}` → `submit_work`. `HOURS` maps to `HOUR_MINUTES`. Returns the state; money roles also get `preview`. |
| `POST /v1/submissions/batch` | `work.record` | same, per row | `{project_id, work_date, rows: [{assignment_id, mode, minutes?, note?, confirm_cross_job?, operation_id}]}`, 1–50 rows, each row its own transaction with its own `operation_id`. Response: one result per row: `SUBMITTED`, `APPROVED`, `WAITING_FOR_RATE`, or an error code (`ALREADY_SUBMITTED`, `CROSS_JOB_CONFIRM`, …). Rows that aren't sent stay Unrecorded. Unlike `record_payout`, work rows are independent. |
| `GET /v1/submissions?state=&project_id=&worker_id=&from=&to=&cursor=` | `workspace.read` | owner/admin all; lead led jobs; worker own | Worker, job, date, hours, state, submitted by (name), return reason, `waiting_for_rate`. No money unless `money.view`. |
| `GET /v1/submissions/:id` | `workspace.read` | as above | One submission with its events. `preview` (rate and earnings on the work date) only for `money.view`. |
| `POST /v1/submissions/:id/approve` | `work.approve` | — | → `approve_work_submission`. 409 codes: `ALREADY_REVIEWED`, `RATE_NEEDED`, `ENTRY_CHANGED`, `JOB_ARCHIVED`. Money in the response only for `money.view`. |
| `POST /v1/submissions/:id/return` | `work.approve` | — | `{reason, operation_id}` → `return_work_submission`. Empty reason → 400. |
| `GET /v1/approvals` | `work.approve` | — | Work to approve: pending submissions (oldest first, with `waiting_for_rate`), open correction requests, and for `money.view` roles open payment questions from both channels. Counts for each. |
| `GET /v1/projects/:id/day/:date/business` | `workspace.read` | job in scope; worker: own row | `business_day_status` for the crew screens and the timesheet, shaped. |
| `POST /v1/correction-requests` | `work.record` | worker: own entries | `{entry_id, note, operation_id}` → `request_work_correction`. |
| `GET /v1/correction-requests?status=` | `workspace.read` | owner/admin all; worker own | |
| `POST /v1/correction-requests/:id/keep` | `work.approve` | — | `{note, operation_id}` → `keep_work_as_is`. Correcting goes through `POST /v1/submissions` with `correction_request_id` (owner or admin, auto-approved, reason required). |
| `GET /v1/my/work?from=&to=` | `workspace.read` | the caller's bound worker record; no bound record → 403 | Own entries and submissions with states and return reasons. |
| `GET /v1/my/money` | `workspace.read` | bound worker record only | `worker_money` for the caller's own worker: approved earnings, payments recorded, reversals, balance ("Left to pay" or "Paid in advance"), waiting-for-approval count and hours, receipts. Never any other worker. Never rates. |
| `GET /v1/my/receipts/:id` | `workspace.read` | the receipt has a line for the caller's worker | The P6 snapshot in **WORKER view for the caller's own worker only**, in their documents language. Never the FULL view. |
| `POST /v1/my/receipts/:id/acknowledge` | `workspace.read` | same | `{kind: RECEIVED|QUERY, note?, operation_id}` → `acknowledge_payment_in_app`. |
| `GET /v1/payment-questions?status=open|resolved` | `money.view` | — | Questions from the app and from the public link page: worker name, receipt number, date, note, channel. |
| `POST /v1/payment-questions/:source/:id/resolve` | `money.record` | — | → `resolve_payment_question`. |
| `GET /v1/notifications` | `workspace.read` | own, still in scope | Built at read time through the shaper. |
| `POST /v1/notifications/read` | `workspace.read` | own | `{ids}` → `mark_notifications_read`. |

**Role matrix additions** (same fixtures as B1: O, A$, A, L1 leading J1, W1 bound to R1 on J1, R2 on J2):

| Route | O | A$ | A | L1 on J1 | L1 on J2 | W1 own | W1 other | Home organizer | Removed / outsider |
|---|---|---|---|---|---|---|---|---|---|
| `POST /v1/submissions` | 201 APPROVED | 201 APPROVED | 201 APPROVED | 201 PENDING | 404 | 201 PENDING (own, NEW) | 404 | 404 | 404 |
| `POST /v1/submissions` (CORRECTION) | 201 APPROVED | 201 APPROVED | 201 APPROVED | 201 PENDING | 404 | 403 | 404 | 404 | 404 |
| `POST /v1/submissions/batch` | 200 | 200 | 200 | 200 (J1) | 404 | 403 | 403 | 404 | 404 |
| `GET /v1/submissions` | all | all | all, no money | J1 only, no money | — | own only | — | 404 | 404 |
| `GET /v1/submissions/:id` | 200 + preview | 200 + preview | 200, no preview | 200 J1, no preview | 404 | 200 own, no preview | 404 | 404 | 404 |
| `POST …/approve`, `…/return` | 200 | 200 | 200 (no money in body) | 403 | 403 | 403 | 403 | 404 | 404 |
| `GET /v1/approvals` | 200 incl. questions | 200 incl. questions | 200, no questions | 403 | — | 403 | — | 404 | 404 |
| `GET /v1/projects/:id/day/:date/business` | 200 | 200 | 200, no money | 200 J1 | 404 | 200, own row only | 404 | 404 | 404 |
| `POST /v1/correction-requests` | 403 | 403 | 403 | 403 (leads submit a correction instead) | — | 201 own | 404 | 404 | 404 |
| `POST /v1/correction-requests/:id/keep` | 200 | 200 | 200 | 403 | — | 403 | — | 404 | 404 |
| `GET /v1/my/work`, `GET /v1/my/money` | 403 | 403 | 403 | 403 (200 if L1 has a bound record) | — | 200 own | — | 404 | 404 |
| `GET /v1/my/receipts/:id`, `…/acknowledge` | 403 | 403 | 403 | as above | — | 200 own | 404 | 404 | 404 |
| `GET /v1/payment-questions` | 200 | 200 | 403 | 403 | — | 403 | — | 404 | 404 |
| `POST /v1/payment-questions/:source/:id/resolve` | 200 | 200 | 403 | 403 | — | 403 | — | 404 | 404 |
| `GET /v1/notifications` | own | own | own, no money | own | — | own | — | 404 | 404 |
| `PUT /v1/work/:a/:d` in Business | 409 | 409 | 409 | 409 | — | 409 | — | Home 200 | 404 |

The B1 `money_key_scanner` runs over every new route automatically. Exceptions are only for W1 on `/v1/my/money` and `/v1/my/receipts/:id`, and the scanner then asserts that every money value belongs to W1's own worker (compare with `worker_money` for R1, and check no other worker id or name appears in the body).

### 3. Mobile

**Shared rules:**
- Hours are entered as hours and minutes (two number fields, or `h:mm`), parsed with integer math into whole minutes, 1–1,440. Over 12 hours asks "That's more than 12 hours. Save it?". No start/end/break in Business.
- **No work** is a button per worker, never 0 hours. A worker you don't touch stays Unrecorded.
- Lead and worker submissions use the P3 work queue, kept **per workspace**. Each queued item keeps its `operation_id`. On sync, a 404 (removed, out of scope), 402 (B4) or 409 (`ALREADY_SUBMITTED`, `CROSS_JOB_CONFIRM`, `ENTRY_CHANGED`) moves it to **Needs review** with the server's message. Nothing is dropped silently. B4 adds the Business sync screens.
- **Approve, Return, Keep as is and Correct approved work need a connection.** Offline, those buttons are disabled with "Approving needs a connection." They're never queued.
- "Waiting for approval" shows hours, never money, and is never added to a balance.

**Owner and admin** (`BOwnerToday`, `BAdminToday` gain a **Work to approve** card with the count):
- `BOwnerRecord` → `BWorkReview` → `BWorkSaved`: pick a job and a date (today or earlier), one row per active crew member with the day's status (Unrecorded, Waiting for approval, Approved, Returned). "Set hours for selected" fills the hours the owner typed into the rows they ticked; they see every value before saving. Each row: hours, **No work**, note. Rows already approved or waiting are shown with their status and skipped (correct them from history). Review lists each row; Save sends `POST /v1/submissions/batch`. Result per row. Owner and admin entries come back **Approved** (D10); a worker without a rate comes back "Waiting for rate".
- `BApprovals` (Work to approve): three sections, **Submitted work** (oldest first; "Waiting for rate" rows show **Set rate** for money roles and "The owner needs to set a rate" for admins without money), **Correction requests**, and (money roles) **Payment questions**. Per-item review only.
- `BApproval`: job, date, worker, hours, note, submitted by, and for money roles the rate on the work date and the earnings. **Approve** and **Return**. "Approving adds these earnings to <name>'s balance. It doesn't record a payment."
- `BReturnWork`: reason required (1–500), shown to the submitter. "No earnings are added."
- `BApprovalDone`: approved or returned; **Next** opens the next pending item.
- `BCorrectionReview` (from a correction request): the approved entry, the worker's note, then **Correct it** (new hours or No work or Remove day, plus a required reason; saves through `POST /v1/submissions` with `correction_request_id`; approved at once, so it shows the earnings change for money roles) or **Keep as is** (note required, shown to the worker).
- `BHistory`: filters for job, worker, date range and state. Each entry shows revisions ("Corrected on <date> by <name>: <reason>") and submission states. Corrections from here are owner/admin submissions (reason required).
- Payment questions: a row opens the receipt (money roles) with the worker's note and **Mark resolved**.

**Crew lead** (tabs: Today, Jobs, Crew, More):
- `BLeadToday`: connection and queue status, the jobs they lead with crew count, **Record crew work**, **Submitted work** (counts by state). No money anywhere.
- `BLeadRecord` → `BWorkReview` → `BWorkSaved`: same as the owner flow, limited to the crew on the lead's jobs; everything is saved as **Waiting for approval**. Works offline (queued).
- `BLeadSubmissions`, `BLeadEntry`: entries on their jobs with Approved / Waiting / Returned. A returned entry shows the reason and **Fix and resubmit** (new hours, optional "What changed"). An approved entry offers **Submit a correction** (reason required, goes to approval).
- `BLeadCrew`, `BCrewMember`: the crew on their jobs: name, trade, job, entries with states. No rates, payments, other jobs, contact details, notes or ratings.

**Worker** (tabs: Today, Work, Receipts, More):
- `BWorkerToday`: today's jobs (from their assignments), **Enter my hours**, **My submitted work**. "Your business pays you directly. CrewTally keeps the record."
- `BWorkerHours` → `BWorkerReview`: hours and minutes and an optional note for **today** (default) or an earlier day inside the assignment, on one of their jobs, or **No work**. No future dates. Review: "Submitting doesn't record a payment. The business reviews your hours first." Queued offline.
- `BWorkerHistory`, `BWorkerEntry`: own entries with states. Returned: reason and **Fix and resubmit**. Approved: **Ask for a correction**.
- `BWorkerCorrection`: what's wrong (1–500). "Your approved hours stay as they are until the business reviews this." After a decision, the entry shows "Corrected" with the new hours, or "Kept as is" with the business's note.
- `BWorkerMoney` (from **Receipts** tab header): approved earnings, payments recorded, Left to pay or Paid in advance, "Waiting for approval: <n> entries, <h:mm>", and receipts. No rates.
- `BWorkerReceipt`: the WORKER view of their own receipt in their language, with **I received this payment** and **I have a question**. Confirmed shows "Confirmed on <date>".
- `BReceiptProblem`: note required. "This goes to the business owner and anyone who records payments. It doesn't confirm the payment."

### 4. Web

Sidebar additions: owner and admin: **Work to approve** (with count), **Timesheet**, **History**, **Notifications**; lead: **Today**, **Timesheet**, **Crew**, **Submissions**, **Notifications**; worker: **Today**, **My work**, **My money**, **Notifications**, **Team access**.
- `timesheet` → `timesheet-review`: pick a job and a date. One row per active crew member (lead: their jobs only) with the day's status. Each row: hours (text input: `h:mm`, or decimal hours that convert to a **whole** number of minutes, parsed with integer math; `7.33` is refused with "Use whole minutes, like 7:20 or 7.25."), a **No work** toggle and a note. Rows already approved or waiting are locked and show their status. **Blank means not recorded**, and the page says so: "Leave a row blank if you don't know yet. It stays Unrecorded." Review shows worker, date, job, hours or No work, and the total hours. Submit sends `POST /v1/submissions/batch`; the result table shows each row's outcome (Approved for owner/admin, Waiting for approval for a lead, Waiting for rate, or the error with a fix). Cross-job warnings come back per row with a **Confirm** checkbox and resend only those rows. No money on this page for anyone.
- `approvals`, `approval`, `return-work`: same rules as iPhone. Approve is disabled while the browser is offline. Hours shown as `h:mm` (NO_WORK as "No work"), never a hard-coded "h" for a daily row.
- Correction requests and payment questions sit on the approvals page in their own sections, same as iPhone.
- `my-money`, `my-receipt`, `report-issue`: worker only, own records only, same API. `report-issue` from a receipt sends a payment question (the public receipt page from P6 keeps its own, sign-in-free buttons).
- `team-access`: the member's workspace, role, every job they're on (a list, not one value), and "The business owner manages the plan. You pay nothing."
- `notifications`: the in-app list (work submitted, returned, approved, correction requests and answers, payment questions for money roles, new receipts for workers), with **Mark as read**. No email or push for these (D14). No "pause" control in 1.1.
- Business day and history pages from P3 (`record-work`, `history`, `entry`) in a Business workspace use the submission routes and show states; Home is unchanged.

### 5. Tests

**Server:**
- The role matrix rows above, and the `money_key_scanner` over every new route.
- `double_approval_under_concurrency`: two connections call approve for the same submission with different `operation_id`s, released together (a barrier). Exactly one 200 and one 409 `ALREADY_REVIEWED`; one `EARNING` row. Then a retry of the winning call with its `operation_id` → the same 200 body.
- `rate_is_the_agreement_on_the_work_date` (as in the DB test, through the API, with the server clock set to 25 Sep).
- `approve_without_rate_is_refused`: A adds a worker (no rate); L1 submits; O approves → 409 `RATE_NEEDED`; O sets the rate; approve → 200 and earnings at that rate. At no point is there a $0 earning or a $0 agreement.
- `pending_never_in_balance`: after a lead submission, `GET /v1/balances`, job costs and `GET /v1/my/money` balances are unchanged; `my/money` shows the hours under waiting.
- `correction_keeps_original_until_approved`, `resubmit_supersedes`, `return_needs_reason` (empty and whitespace → 400).
- `business_earnings_match_fn_earned_vectors`: run the hourly vectors from `shared/pay_test_vectors.json` through submit + approve; each `earned_minor` matches.
- Owner and admin entries: approved on save, with `AUTO_APPROVED` in `approval_events` and an audit row naming the actor.
- `BUSINESS_USES_SUBMISSIONS` for the three Home work routes in Business; Home tests for them unchanged.
- Batch: 5 rows with one bad row → 4 saved, 1 error, each row independent; the same batch replayed with the same operation ids → identical results, no new rows.
- `cross_job_warning`: the lead's 409 body names no other job and no hours.
- Worker scope: W1 submitting for R2, for a future date, or a correction → 404 / 422 / 403 as listed; W1 submitting for yesterday inside the assignment → 201 PENDING; W1 can't read L1's or R2's submissions.
- In-app acknowledgment: RECEIVED twice → `already_confirmed`; QUERY creates notifications for O and A$ but not A; resolving needs `money.record`.
- Notifications: an admin who loses money access no longer sees amounts in old notices; a removed member's notifications return 404 with the rest of the workspace.
- Account deletion of the owner with every new table populated → all rows gone (the DB test, plus the API flow).

**Mobile:** `approval_actions_never_queue` (offline: Approve, Return, Keep, Correct are disabled and the queue length doesn't change); lead and worker submissions queue offline and send once (same `operation_id`); a 409 on sync goes to Needs review; hours input `"7:20"` → 440, `"25:00"` → error, `"0:00"` → error (use No work); worker screens never render a rate.

**Web:** `timesheet_blank_is_unrecorded` (blank rows are not sent; No work rows are sent as `NO_WORK`); decimal hours `"7.5"` → 450, `"7.25"` → 435, `"7.33"` → error; Approve disabled offline; worker sidebar has no Jobs or Team.

## Proof to paste at the gate
- `0009_business_work_states.sql` in full and `db/tests/15_business_work_states.sql` with its pass count.
- `approve_work_submission` and `submit_work`, showing the row lock, the state check, the version check and the single `record_work` call.
- The concurrency test and its output.
- The `ledger_events` rows (seq, type, delta, source) after: submit, approve, correction submitted, correction approved.
- The batch route and its per-row result type.
- The web timesheet row parser (hours text → minutes).
- The role matrix additions and the scanner pass count.
- Test file names and counts for all suites.

## Try it on your phone (Expo Go, dev sign-in)
Use the B1 workspace "Rivera Builders": owner-a (owner), member-c (admin with money), member-d (admin without), member-e (lead on Kitchen; re-invite if you removed them in B1), member-f (worker bound to Dee).
1. As **member-e**: Today → Record crew work → Kitchen, today. Dee 8:00, Luis **No work**, leave the third person blank. Review → Submit. All show "Waiting for approval"; the blank one stays Unrecorded.
2. Turn on airplane mode. Record yesterday for Dee, 7:30. It shows "Saved on this phone". Turn airplane mode off: it sends once.
3. As **member-f** (Dee): Today → Enter my hours → 8:00 for today. "Kitchen already has hours waiting for Dee" comes back, because the lead submitted first.
4. As **owner-a**: Today shows Work to approve: 3. Open Dee's 8:00 → shows the rate and earnings → Approve. Approve again from a second device or tap twice fast: the second says it was already reviewed. Balances show one day's earnings.
5. Return Dee's 7:30 with the reason "Was 7:00". As member-e: the entry shows the reason → Fix and resubmit 7:00. As owner-a: approve.
6. As **member-d** (admin without money): approve a submission. No amounts appear anywhere.
7. Add a new worker as member-d (waiting for rate), have member-e submit hours for them, try to approve as owner-a: "Set a rate first." Set it, approve.
8. As **member-f**: Work → today's approved entry → Ask for a correction: "I left at 3." As owner-a: Work to approve → Correction requests → Correct it to 7:00 with a reason. As member-f: the entry shows Corrected. My money changes by the difference only.
9. As owner-a with airplane mode on: Approve is greyed out with "Approving needs a connection."

## Try it on the web
1. As **member-e** (lead): Timesheet → Kitchen → today. Fill two rows, mark one **No work**, leave one blank. Review → Submit. The blank row isn't in the review.
2. Type `7.33` in a row: the page asks for hours and minutes.
3. As **owner-a**: Work to approve shows the same items as the phone. Approve one, return one with a reason.
4. As **member-f** (worker): My money shows approved earnings and "Waiting for approval" hours with no money. There's no Jobs page.
5. Record a payment to Dee through the P4 page as owner-a (B3 builds the Business form; the API already works). As member-f: Receipts → open it → **I have a question** with a note. As owner-a: Work to approve → Payment questions shows it; Mark resolved.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase B2 ready for review".
