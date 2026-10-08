# CrewTally — Phase S1 Replit Agent Brief: Expose the Domain API

**Paste the “Kickoff” block below into the Replit Agent, then have it follow this document section by section.**
**Repo:** `@jaco12210marbro/CrewTally` (api-server + lib/* + crewtally-mobile). **Date:** 2026-10-07.
**Scope (locked, defaults):** Projects, Workers, Assignments, Rates, Work entries, Payments + allocations, Reimbursements, Adjustments, and read-only Balances/History. Out of scope here: receipts/statements/evidence/signatures (P6), reminders (P7), payout batch, web auth, `0004/0005` migrations.

---

## Kickoff (paste to the Replit Agent)

> Implement Phase S1 exactly as specified in `CrewTally_PhaseS1_API_Replit_Brief_2026-10-07.md`. Add HTTP routes for the money/work/payments domain that already exists in SQL. Do not write any new money math or any new DB migration — the tables, functions, views, and member actions all already exist in `db/migrations/0001_schema.sql` and `0003_identity_and_memberships.sql`. Follow the existing route conventions in `src/routes/members.ts` and `src/routes/workspaces.ts` precisely. Add OpenAPI operations in `lib/api-spec/openapi.yaml`, regenerate the clients, then build the handlers. Update `src/routes/registration` coverage and `test/identity.test.ts`, and add `test/domain.test.ts`. Stop at the gate in §7 and report results; do not touch deploy, secrets, or DNS.

---

## 0. Non-negotiable conventions (verified against the current code)

1. **No new money math, no new migration.** Every write calls an existing SQL function or does a plain insert into an existing table. The member-permission vocabulary already exists (`role_can` in `0003`): `workspace.read`, `work.record`, `work.approve`, `money.view`, `money.record`, `rates.set`, `people.add`, `people.remove`, `projects.manage`, `members.manage`, `settings.edit`.
2. **Route helpers (`src/routes/registration.ts`).** Use `memberRoute(router, db, method, path, action, handler)`. The handler is `(tx, member, workspaceId, req) => Promise<unknown>` and its return value is JSON-sent. Tenancy comes from the `X-Workspace-Id` header (validated by `withMember` → `require_member`); never take workspace from the body or path.
3. **Call SQL functions through the transaction `tx`, not through `src/db/money.ts`.** The `money.ts` wrapper runs on a separate pool connection, which would sit outside the member transaction. Mirror `members.ts`: `const r = await tx.query("select record_work($1::uuid, …) as result", [...]); return r.rows[0].result;`. Use `src/db/money.ts`’s `signatures` map as the authoritative **argument order and cast types**.
4. **Idempotency — two different rules, do not mix them up:**
   - **Money/work/rate/payment functions are SELF-idempotent.** `record_work`, `mark_rest_no_work`, `record_payment`, `record_payment_with_note`, `reverse_payment`, `set_check_cleared`, `correct_payment`, `record_reimbursement`, `record_adjustment`, `apply_rate_change` all read/write `idempotency_keys` internally keyed on `operation_id`. **Do NOT wrap these in `withWorkspaceIdempotency`** — just require `operation_id` in the body and pass it as the function’s second argument. A reused `operation_id` with a changed payload raises SQLSTATE `40001`; map it to the existing reuse/conflict error.
   - **Direct-insert writes (projects, workers, assignments) are NOT idempotent on their own.** Wrap those in `withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id, {route:"…", …}, async () => { … })`, exactly like `DELETE /members/:userId`.
5. **`operation_id` on every write.** Reuse `export const operation = z.object({ operation_id: z.string().uuid() })` from `src/routes/workspaces.ts` and `.extend({...}).strict().parse(req.body)`.
6. **Money is integer cents (`bigint` in DB, `number` in TS).** Never float. `fn_earned` in SQL is authoritative; `shared/pay.ts` stays preview-only. Do not re-derive earnings in TypeScript.
7. **Keep both base mounts.** Routers mount under the router assembled in `src/routes/index.ts`, which `src/app.ts` mounts at **both** `/api/v1` and `/v1`. Add new routers there; don’t add a second `app.use`.
8. **Contract first.** Add each operation to `lib/api-spec/openapi.yaml`, run the Orval generation (`lib/api-spec/orval.config.ts`) to refresh `@workspace/api-zod` and `@workspace/api-client-react`, commit the generated output, then import the generated request schema in the handler and `.strict().parse(req.body)` (as `src/routes/auth.ts` does with `SignInWithAppleBody`). Inline zod matching `members.ts` is an acceptable fallback only if a specific schema can’t be generated cleanly.
9. **Route coverage test must stay green.** Every new route is recorded by the `memberRoute`/`sessionRoute` helpers; add each to the expected set and role matrix in `test/identity.test.ts` (it asserts every `/v1` route is covered exactly once).

---

## 1. Data structures (from `0001_schema.sql` — use these field names and enums verbatim)

**projects**: `id, workspace_id, name(1..80), address?, timezone(IANA), work_days smallint[] default {1..6} (ISO 1=Mon), status ∈ ACTIVE|ARCHIVED, version, created_at`.
**workers**: `id, workspace_id, display_name(1..60), phone?, email?, status ∈ ACTIVE|INACTIVE, document_language ∈ en|es, version`.
**assignments**: `id, workspace_id, project_id, worker_id, start_date, end_date?, version`. Unique `(project_id, worker_id)`. `end_date ≥ start_date`.
**rate_agreements**: `id, workspace_id, assignment_id, effective_from, pay_basis ∈ DAY|HOUR, rate_minor bigint (>0; DAY ≤ 500000 i.e. $5,000, HOUR ≤ 100000 i.e. $1,000), standard_day_minutes (60..1440, only when DAY)`. Unique `(assignment_id, effective_from)`.
**work_entries**: `id, workspace_id, assignment_id, work_date, active_revision, version`. Unique `(assignment_id, work_date)`. Revisions live in **work_revisions** (`entry_id, revision, input_mode, portion, minutes, …, earned_minor, note, reason`). Input modes: `DAY_PORTION, DAY_MINUTES, HOUR_MINUTES, NO_WORK, VOID`.
**payments**: `id, workspace_id, receipt_no, payment_date, method ∈ CASH|CHECK|BANK_TRANSFER|ZELLE|OTHER, method_note? (required when OTHER), amount_minor (>0, ≤ 10000000 i.e. $100,000), recipient_label, reference?, note?, clearance ∈ ISSUED|CLEARED|RETURNED (non-null iff CHECK), replaces_payment_id?, version`.
**allocations**: `id, workspace_id, payment_id, assignment_id, amount_minor(>0)`. Unique `(payment_id, assignment_id)`.
**reimbursements**: `assignment_id, reimb_date, amount_minor (>0, ≤ 5000000 i.e. $50,000), description`.
**adjustments**: `assignment_id, adj_date, direction ∈ INCREASE_OWED|DECREASE_OWED, category ∈ OPENING_BALANCE|BONUS|OVERTIME|DEDUCTION|OTHER, amount_minor (>0, ≤ 10000000), reason`.
**Views (reads):** `assignment_balances(workspace_id, assignment_id, project_id, worker_id, balance_minor)`; `assignment_totals(... earned_minor, reimbursed_minor, added_minor, taken_off_minor, …)`; `worker_year_paid(workspace_id, worker_id, year, net_paid_minor)`. `ledger_events(workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id, seq)` is the append-only ledger.

---

## 2. SQL function argument order (from `src/db/money.ts` — pass in this order, with these casts)

```
record_work          ($1 workspace uuid, $2 operation uuid, $3 assignment uuid, $4 date date,
                       $5 mode text, $6 portion numeric, $7 minutes integer, $8 expected_version integer,
                       $9 reason text, $10 note text)  → jsonb
   expected_version: pass 0 to CREATE a day; pass the current work_entries.version to REVISE it.
   mode: one of DAY_PORTION, DAY_MINUTES, HOUR_MINUTES, NO_WORK, VOID. portion/minutes null unless the mode needs them.
mark_rest_no_work    ($1 workspace, $2 operation, $3 project uuid, $4 date date) → jsonb
record_payment       ($1 workspace, $2 operation, $3 date, $4 method text, $5 method_note text,
                       $6 amount bigint, $7 recipient text, $8 reference text, $9 allocations jsonb) → jsonb
   allocations = [{"assignment_id": uuid, "amount_minor": int}]; the function enforces sum(allocations)=amount.
record_payment_with_note (…same as record_payment…, $10 note text) → jsonb   // use when a note is supplied
reverse_payment      ($1 workspace,$2 operation,$3 payment uuid,$4 kind text,$5 reason text,
                       $6 expected_version integer,$7 effective_date date,$8 lines jsonb|null) → jsonb
   kind ∈ FULL|PARTIAL|CHECK_RETURNED|CORRECTION.
set_check_cleared    ($1 workspace,$2 operation,$3 payment uuid,$4 expected_version integer) → jsonb
correct_payment      ($1 workspace,$2 operation,$3 payment,$4 expected_version,$5 effective_date,$6 reason,
                       $7 date,$8 method,$9 method_note,$10 amount bigint,$11 recipient,$12 reference,$13 allocations jsonb) → jsonb
record_reimbursement ($1 workspace,$2 operation,$3 assignment,$4 date,$5 amount bigint,$6 description text) → jsonb
record_adjustment    ($1 workspace,$2 operation,$3 assignment,$4 date,$5 direction text,$6 category text,
                       $7 amount bigint,$8 reason text) → jsonb
apply_rate_change    ($1 workspace,$2 operation,$3 assignment,$4 from date,$5 basis text,$6 rate bigint,
                       $7 std integer,$8 reason text,$9 confirm boolean) → jsonb
   Returns {agreement_id, corrected_days, total_delta_minor}. If the change rewrites existing days,
   confirm MUST be true and reason non-empty (function raises 55000 "confirmation required" otherwise).
preview_rate_change  ($1 workspace,$2 assignment,$3 from date,$4 basis text,$5 rate bigint,$6 std integer) → jsonb
   Read-only. Returns {affected:[…], total_delta_minor, blocked_reason}.
```

Each write function returns a small jsonb (e.g. `{payment_id, receipt_no, version}`); **return `rows[0].result` directly as the response body.**

---

## 3. Routes to build (file-by-file)

Create these files in `artifacts/api-server/src/routes/` and mount them in `src/routes/index.ts` (§4). Member `action` is in brackets.

### `projects.ts` — direct inserts/updates, wrap writes in `withWorkspaceIdempotency`
- `GET /projects` **[workspace.read]** → `select id,name,address,timezone,work_days,status,version from projects where workspace_id=$1 and status != 'ARCHIVED' order by created_at`. (Add `?include=archived` later.)
- `POST /projects` **[projects.manage]** → body `{operation_id, name, timezone, work_days?, address?}`; insert `projects(workspace_id,name,timezone,work_days?,address?)`; return the row. Wrap in idempotency.
- `GET /projects/:id` **[workspace.read]** → one project (scoped by workspace).
- `PATCH /projects/:id` **[projects.manage]** → body `{operation_id, name?, address?, work_days?, status?}`; update provided fields, `version = version + 1`; return row. Wrap in idempotency. (Archiving = `status:'ARCHIVED'`.)

### `workers.ts` — direct inserts/updates
- `GET /workers` **[workspace.read]** → active workers for the workspace.
- `POST /workers` **[people.add]** → `{operation_id, display_name, phone?, email?, document_language?}`; insert; return row. Idempotency-wrapped.
- `GET /workers/:id` **[workspace.read]**.
- `PATCH /workers/:id` **[people.add]** → `{operation_id, display_name?, phone?, email?, document_language?, status?}`; update, bump version. Idempotency-wrapped.
- `GET /workers/:id/year-paid` **[money.view]** → `select year, net_paid_minor from worker_year_paid where workspace_id=$1 and worker_id=$2 order by year`.

### `assignments.ts` — direct inserts/deletes
- `POST /projects/:id/assignments` **[people.add]** → `{operation_id, worker_id, start_date, end_date?}`; insert `assignments(workspace_id,project_id,worker_id,start_date,end_date?)`; respect unique `(project_id,worker_id)`. Idempotency-wrapped.
- `GET /projects/:id/assignments` **[workspace.read]** → assignments for a project joined to worker display_name.
- `DELETE /assignments/:id` **[people.remove]** → `{operation_id}`; delete the assignment (or soft-end with `end_date` — prefer delete only if no ledger rows exist; otherwise set `end_date`). Idempotency-wrapped.

### `rates.ts` — SQL functions (self-idempotent for apply; preview is read-only)
- `GET /assignments/:id/rates` **[workspace.read]** → `select id,effective_from,pay_basis,rate_minor,standard_day_minutes from rate_agreements where assignment_id=$1 order by effective_from`.
- `POST /assignments/:id/rates/preview` **[rates.set]** → `{effective_from, pay_basis, rate_minor, standard_day_minutes?}` → `select preview_rate_change($1::uuid,$2::uuid,$3::date,$4::text,$5::bigint,$6::integer) as result`. No idempotency.
- `POST /assignments/:id/rates` **[rates.set]** → `{operation_id, effective_from, pay_basis, rate_minor, standard_day_minutes?, reason?, confirm?}` → call `apply_rate_change`. **No `withWorkspaceIdempotency`** (function self-dedupes). Surface the `55000` “confirmation required” as a 409/confirmation response the client can re-submit with `confirm:true`.

### `work.ts` — SQL functions (self-idempotent)
- `POST /work-entries` **[work.record]** → `{operation_id, assignment_id, date, mode, portion?, minutes?, expected_version, reason?, note?}` → `record_work`. New day → `expected_version:0`; revise → current `version`.
- `POST /work-entries/no-work` **[work.record]** → `{operation_id, project_id, date}` → `mark_rest_no_work`.
- `GET /work-entries` **[workspace.read]** → query `?assignment_id=&from=&to=`; `select e.work_date, e.version, r.input_mode, r.portion, r.minutes, r.earned_minor from work_entries e join work_revisions r on r.entry_id=e.id and r.revision=e.active_revision where e.workspace_id=$1 and e.assignment_id=$2 and e.work_date between $3 and $4 order by e.work_date`.

### `payments.ts` — SQL functions (self-idempotent)
- `POST /payments` **[money.record]** → `{operation_id, date, method, method_note?, amount_minor, recipient, reference?, allocations:[{assignment_id,amount_minor}], note?}`. If `note` present call `record_payment_with_note`, else `record_payment`. The function enforces `sum(allocations)=amount_minor` and that each `assignment_id` belongs to the workspace.
- `POST /payments/:id/reverse` **[money.record]** → `{operation_id, kind, reason, expected_version, effective_date, lines?}` → `reverse_payment`.
- `PATCH /payments/:id/clearance` **[money.record]** → `{operation_id, expected_version}` → `set_check_cleared` (CHECK → CLEARED).
- `POST /payments/:id/correct` **[money.record]** → full correction payload → `correct_payment`.
- `GET /payments` **[money.view]** → `?from=&to=&worker_id=`; list payments (+ allocations) for the workspace.

### `ledger.ts` — reads only
- `GET /balances` **[money.view]** → `select assignment_id, project_id, worker_id, balance_minor from assignment_balances where workspace_id=$1` (+ optional `?project_id=&worker_id=`). Per-worker running balance = this.
- `GET /history` **[money.view]** → `?project_id=&worker_id=&from=&to=`; `select effective_date, event_type, signed_delta, source_type, source_id, seq from ledger_events where workspace_id=$1 [filters] order by seq`. This is the spreadsheet/history view both clients render.

### `reimbursements.ts` / `adjustments.ts` — SQL functions (self-idempotent)
- `POST /reimbursements` **[money.record]** → `{operation_id, assignment_id, date, amount_minor, description}` → `record_reimbursement`.
- `POST /adjustments` **[money.record]** → `{operation_id, assignment_id, date, direction, category, amount_minor, reason}` → `record_adjustment`.

---

## 4. Mount the routers (`src/routes/index.ts`)

Add the new routers to the router assembled by `createRouter`, after the existing identity routers, each behind session+member (the helpers already apply `requireSession`; `memberRoute` applies `withMember`). Example:

```ts
router.use(createProjectsRouter(db));
router.use(createWorkersRouter(db));
router.use(createAssignmentsRouter(db));
router.use(createRatesRouter(db));
router.use(createWorkRouter(db));
router.use(createPaymentsRouter(db));
router.use(createLedgerRouter(db));
router.use(createReimbursementsRouter(db));
router.use(createAdjustmentsRouter(db));
```

Do not change `src/app.ts` — it already serves the router at `/api/v1` and `/v1`.

---

## 5. Contract + client regeneration

1. Add every operation above to `lib/api-spec/openapi.yaml`: path, method, `X-Workspace-Id` header param, request body schema, `operation_id` on writes, standard `ErrorResponse`, and 200/409/422 responses. Model money fields as integer `minor` amounts.
2. Run the Orval generation (`lib/api-spec/orval.config.ts`) → refresh `@workspace/api-zod` and `@workspace/api-client-react`. Commit generated output.
3. In each handler, import the generated request schema from `@workspace/api-zod` and `.strict().parse(req.body)` (as `src/routes/auth.ts` does). Inline zod matching `members.ts` is the fallback.

---

## 6. Error mapping

Reuse `src/lib/errors.ts`. Map SQL error codes the functions raise: `40001` (operation reused with different payload / stale version) → the existing reuse/conflict (409); `22023` (business rule, e.g. “allocations total ≠ payment”, “no pay agreement for date”, “project archived”, “date outside assignment”) → 422 with the function’s message; `55000` (“confirmation required” from `apply_rate_change`) → a 409 the client re-submits with `confirm:true`; `P0002` (not found) → 404. Do not leak raw SQL text beyond the function’s own message.

---

## 7. Tests + gate (must pass before stopping)

- **`test/identity.test.ts`** — add every new route to the expected route set and the per-role matrix (e.g. a `WORKER` can’t `POST /payments`; a `LEAD` can `work.record` but not `money.record` — match `role_can` in `0003`).
- **`test/domain.test.ts`** (new) — fresh-fixture end-to-end: create workspace → project → worker → assignment → `POST /assignments/:id/rates` (DAY, $200) → `POST /work-entries` full day → assert `GET /balances` shows the earning → `POST /payments` allocating to the worker → assert balance nets to zero and `GET /history` shows EARNING then PAYMENT. Assert: reusing an `operation_id` returns the first result (no double-post); a mismatched allocations total is 422; `reverse_payment` restores the balance; and run `shared/pay_test_vectors.json` through `POST /work-entries` so client-preview math and server math agree.
- **Gate:** `pnpm test` green (db + server + mobile). Every route appears exactly once in the registry. The full “log a day → pay → check balance → reverse” sequence reconciles against `ledger_events` to the cent.

Stop here and report. Do **not** deploy, set secrets, apply prod migrations, or touch DNS.

---

## 8. What this unblocks

After S1, both the iPhone app and a future web client can read and write the whole domain over one contract. Next phases (separate briefs): **S2** migrate `crewtally-mobile/lib/mobileApi.ts` onto the generated client; **S3** build the mobile Today/Workers/Payments screens; **S4** web email+cookie auth; **S5** the web app on `app.crewtallyapp.com`.
