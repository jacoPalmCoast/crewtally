-- CrewTally: reference schema (PostgreSQL 15+)
-- All money is integer minor units (USD cents). Dates are local DATE values
-- in the project timezone. Timestamps are UTC (timestamptz).
-- Clients never write these tables directly: every financial write goes
-- through a SECURITY DEFINER function that checks ownership, versions and
-- idempotency in one transaction. Row-level security covers reads only.

-- gen_random_uuid() is built into PostgreSQL 13+; no extension needed.

-- ---------- tenancy ----------
create table workspaces (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique,              -- one owner, one workspace (Release 1)
  name              text not null,
  currency_code     char(3) not null default 'USD',
  currency_exponent smallint not null default 2 check (currency_exponent between 0 and 3),
  currency_locked   boolean not null default false,    -- set true on first financial posting
  receipt_seq       integer not null default 0,
  created_at        timestamptz not null default now()
);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  name         text not null check (length(name) between 1 and 80),
  address      text,
  timezone     text not null,                          -- IANA name, e.g. America/New_York
  work_days    smallint[] not null default '{1,2,3,4,5,6}', -- ISO weekday 1=Mon..7=Sun
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id)
);

create table workers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  display_name text not null check (length(display_name) between 1 and 60),
  phone        text,
  email        text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  document_language text not null default 'en' check (document_language in ('en','es')), -- receipts, statements, hand-over text
  version      integer not null default 1,
  unique (workspace_id, id)
);

create table assignments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  worker_id    uuid not null,
  start_date   date not null,
  end_date     date,
  version      integer not null default 1,
  unique (workspace_id, id),
  unique (project_id, worker_id),
  check (end_date is null or end_date >= start_date),
  foreign key (workspace_id, project_id) references projects (workspace_id, id),
  foreign key (workspace_id, worker_id)  references workers  (workspace_id, id)
);

-- Pay agreement: daily OR hourly, effective dated per assignment.
create table rate_agreements (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null,
  assignment_id        uuid not null,
  effective_from       date not null,
  pay_basis            text not null check (pay_basis in ('DAY','HOUR')),
  rate_minor           bigint not null check (rate_minor > 0),
  standard_day_minutes integer check (standard_day_minutes between 60 and 1440),
  created_at           timestamptz not null default now(),
  unique (assignment_id, effective_from),
  unique (workspace_id, id),
  check (pay_basis = 'DAY' or standard_day_minutes is null),
  check ((pay_basis = 'DAY'  and rate_minor <= 500000)    -- $5,000/day cap
      or (pay_basis = 'HOUR' and rate_minor <= 100000)),  -- $1,000/hour cap
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

-- ---------- work ----------
create table work_entries (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  assignment_id   uuid not null,
  work_date       date not null,
  active_revision integer not null,
  version         integer not null default 1,
  unique (assignment_id, work_date),
  unique (workspace_id, id),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table work_revisions (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null,
  entry_id               uuid not null,
  revision               integer not null,
  input_mode             text not null check (input_mode in
                           ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES','NO_WORK','VOID')),
  portion                numeric(5,4) check (portion > 0 and portion <= 1),
  minutes                integer check (minutes between 1 and 1440),
  rate_agreement_id      uuid,
  pay_basis_snapshot     text,
  rate_minor_snapshot    bigint,
  std_minutes_snapshot   integer,
  earned_minor           bigint not null check (earned_minor >= 0),
  note                   text,
  reason                 text,          -- required for revision > 1
  created_at             timestamptz not null default now(),
  unique (entry_id, revision),
  check (revision = 1 or reason is not null),
  check (
    (input_mode = 'DAY_PORTION'  and portion is not null and minutes is null) or
    (input_mode = 'DAY_MINUTES'  and minutes is not null and portion is null) or
    (input_mode = 'HOUR_MINUTES' and minutes is not null and portion is null) or
    (input_mode in ('NO_WORK','VOID') and portion is null and minutes is null and earned_minor = 0)
  ),
  foreign key (workspace_id, entry_id) references work_entries (workspace_id, id)
);

create table day_reviews (
  workspace_id         uuid not null,
  project_id           uuid not null,
  work_date            date not null,
  payments_reviewed_at timestamptz not null default now(),
  primary key (project_id, work_date),
  foreign key (workspace_id, project_id) references projects (workspace_id, id)
);

-- ---------- money ----------
create table payments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id),
  receipt_no      integer not null,
  payment_date    date not null,
  method          text not null check (method in ('CASH','CHECK','BANK_TRANSFER','ZELLE','OTHER')),
  method_note     text,
  amount_minor    bigint not null check (amount_minor > 0 and amount_minor <= 10000000), -- $100,000 cap
  recipient_label text not null,
  reference       text,
  note            text,
  clearance       text check (clearance in ('ISSUED','CLEARED','RETURNED')),
  replaces_payment_id uuid,                    -- set when this payment corrects an earlier one
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, receipt_no),
  check ((method = 'CHECK') = (clearance is not null)),
  check (method <> 'OTHER' or method_note is not null)
);

create table allocations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  payment_id    uuid not null,
  assignment_id uuid not null,
  amount_minor  bigint not null check (amount_minor > 0),
  unique (payment_id, assignment_id),
  unique (workspace_id, id),
  foreign key (workspace_id, payment_id)    references payments    (workspace_id, id),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table reversals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  payment_id   uuid not null,
  kind         text not null check (kind in ('FULL','PARTIAL','CHECK_RETURNED','CORRECTION')),
  reason       text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id)
);

create table reversal_lines (
  reversal_id   uuid not null references reversals(id),
  allocation_id uuid not null references allocations(id),
  amount_minor  bigint not null check (amount_minor > 0),
  primary key (reversal_id, allocation_id)
);

create table reimbursements (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  assignment_id uuid not null,
  reimb_date    date not null,
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 5000000),
  description   text not null,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table adjustments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  assignment_id uuid not null,
  adj_date      date not null,
  direction     text not null check (direction in ('INCREASE_OWED','DECREASE_OWED')),
  category      text not null check (category in ('OPENING_BALANCE','BONUS','OVERTIME','DEDUCTION','OTHER')),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 10000000),
  reason        text not null,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

-- Append-only financial ledger. Balance = sum(signed_delta) per assignment.
-- Positive = owed to worker, zero = settled, negative = advance.
create table ledger_events (
  seq            bigint generated always as identity primary key,
  workspace_id   uuid not null,
  assignment_id  uuid not null,
  effective_date date not null,
  event_type     text not null check (event_type in
                   ('EARNING','EARNING_CORRECTION','REIMBURSEMENT','ADJUSTMENT',
                    'PAYMENT','PAYMENT_REVERSAL')),
  signed_delta   bigint not null check (signed_delta <> 0),
  source_type    text not null,
  source_id      uuid not null,
  created_at     timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);
create index ledger_by_assignment on ledger_events (assignment_id, effective_date, seq);

-- The only exception: delete_workspace_data() (account deletion) sets a transaction-local
-- flag naming the workspace being deleted; only that workspace's rows may then be deleted.
create function ledger_is_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('workpay.deleting_workspace', true) = old.workspace_id::text then
    return old;
  end if;
  raise exception 'ledger_events is append-only';
end $$;
create trigger ledger_no_update before update or delete on ledger_events
  for each row execute function ledger_is_append_only();

-- ---------- records, sharing, evidence ----------
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  payment_id      uuid not null,
  payment_version integer not null,
  snapshot        jsonb not null,             -- immutable facts at generation
  status          text not null default 'CURRENT' check (status in ('CURRENT','SUPERSEDED','REVERSED')),
  created_at      timestamptz not null default now(),
  unique (payment_id, payment_version),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id)
);

create table statements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  worker_id    uuid not null,
  project_id   uuid,                           -- null = all projects
  period_from  date not null,
  period_to    date not null check (period_to >= period_from),
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  foreign key (workspace_id, worker_id) references workers (workspace_id, id)
);

create table share_links (                     -- Release 1 (texted receipt and statement links)
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id),
  target_type      text not null check (target_type in ('RECEIPT','STATEMENT')),
  target_id        uuid not null,
  view             text not null check (view in ('WORKER','FULL')),
  view_worker_id   uuid,                       -- required for WORKER view
  language         text not null default 'en' check (language in ('en','es')),
  token_hash       bytea not null unique,      -- sha256 of a 256-bit random token; the token itself is never stored
  sent_via         text not null default 'SMS' check (sent_via in ('SMS','SHARE_SHEET','COPY')),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  open_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  check (view = 'FULL' or view_worker_id is not null)
);

create table acknowledgments (                 -- Release 1 (worker taps "I received this" or "I have a question")
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id),
  share_link_id uuid not null references share_links(id),
  kind          text not null check (kind in ('RECEIVED','QUERY')),
  typed_name    text check (length(typed_name) <= 80),
  note          text check (length(note) <= 500),
  resolved_at   timestamptz,                   -- owner marks a QUERY resolved
  created_at    timestamptz not null default now()
);
create unique index one_received_per_link on acknowledgments (share_link_id) where kind = 'RECEIVED';

create table evidence (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  parent_type  text not null check (parent_type in ('PAYMENT','REIMBURSEMENT')),
  parent_id    uuid not null,
  object_key   text not null,
  sha256       bytea not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','application/pdf')),
  byte_size    integer not null check (byte_size between 1 and 10485760),
  scan_state   text not null default 'NOT_REQUIRED' check (scan_state in ('NOT_REQUIRED','PENDING','CLEAN','REJECTED')),
  created_at   timestamptz not null default now()
);

create table reminder_preferences (
  project_id             uuid primary key references projects(id),
  workspace_id           uuid not null references workspaces(id),
  local_time             time not null default '18:00',
  enabled                boolean not null default true,
  device_installation_id text,
  version                integer not null default 1
);

create table audit_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  actor_id     uuid not null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now()
);

create table idempotency_keys (
  workspace_id uuid not null,
  operation_id uuid not null,
  request_hash text not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, operation_id)
);

-- ---------- derived ----------
create view assignment_balances as
select a.workspace_id, a.id as assignment_id, a.project_id, a.worker_id,
       coalesce(sum(l.signed_delta), 0) as balance_minor
from assignments a left join ledger_events l on l.assignment_id = a.id
group by a.workspace_id, a.id, a.project_id, a.worker_id;

-- ---------- calculation ----------
-- One rounding step, half up (inputs are non-negative, so round() is half up).
create function fn_earned(p_basis text, p_rate bigint, p_mode text,
                          p_portion numeric, p_minutes integer, p_std integer)
returns bigint language plpgsql immutable as $$
begin
  if p_mode in ('NO_WORK','VOID') then return 0; end if;
  if p_mode = 'DAY_PORTION'  and p_basis = 'DAY'  then return round(p_rate * p_portion); end if;
  if p_mode = 'DAY_MINUTES'  and p_basis = 'DAY'  and p_std is not null
     then return round(p_rate::numeric * p_minutes / p_std); end if;
  if p_mode = 'HOUR_MINUTES' and p_basis = 'HOUR' then return round(p_rate::numeric * p_minutes / 60); end if;
  raise exception 'input mode % not valid for pay basis %', p_mode, p_basis using errcode = '22023';
end $$;

-- ---------- write path: work ----------
-- Records or corrects one assignment/date. expected_version = 0 means "new entry".
create function record_work(p_workspace uuid, p_operation uuid, p_assignment uuid,
                            p_date date, p_mode text, p_portion numeric, p_minutes integer,
                            p_expected_version integer, p_reason text, p_note text)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_assignment, p_date, p_mode, p_portion, p_minutes, p_expected_version));
  v_prior idempotency_keys; v_ra rate_agreements; v_entry work_entries;
  v_prev_earned bigint := 0; v_earned bigint; v_rev integer; v_result jsonb;
  v_asg assignments; v_proj projects;
begin
  select * into v_prior from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'operation reused with different payload' using errcode = '40001'; end if;
    return v_prior.response;
  end if;

  select * into v_asg from assignments where id = p_assignment and workspace_id = p_workspace;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into v_proj from projects where id = v_asg.project_id;
  if v_proj.status <> 'ACTIVE' then raise exception 'project archived' using errcode = '22023'; end if;
  if p_date < v_asg.start_date or (v_asg.end_date is not null and p_date > v_asg.end_date) then
    raise exception 'date outside assignment' using errcode = '22023'; end if;

  select * into v_ra from rate_agreements
   where assignment_id = p_assignment and effective_from <= p_date
   order by effective_from desc limit 1;
  if not found then raise exception 'no pay agreement for date' using errcode = '22023'; end if;

  v_earned := fn_earned(v_ra.pay_basis, v_ra.rate_minor, p_mode, p_portion, p_minutes, v_ra.standard_day_minutes);

  select * into v_entry from work_entries where assignment_id = p_assignment and work_date = p_date for update;
  if found then
    if v_entry.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
    select earned_minor into v_prev_earned from work_revisions
      where entry_id = v_entry.id and revision = v_entry.active_revision;
    v_rev := v_entry.active_revision + 1;
    update work_entries set active_revision = v_rev, version = version + 1 where id = v_entry.id
      returning * into v_entry;
  else
    if p_expected_version <> 0 then raise exception 'stale version' using errcode = '40001'; end if;
    v_rev := 1;
    insert into work_entries (workspace_id, assignment_id, work_date, active_revision)
      values (p_workspace, p_assignment, p_date, 1) returning * into v_entry;
  end if;

  insert into work_revisions (workspace_id, entry_id, revision, input_mode, portion, minutes,
     rate_agreement_id, pay_basis_snapshot, rate_minor_snapshot, std_minutes_snapshot,
     earned_minor, note, reason)
  values (p_workspace, v_entry.id, v_rev, p_mode, p_portion, p_minutes,
     v_ra.id, v_ra.pay_basis, v_ra.rate_minor, v_ra.standard_day_minutes, v_earned, p_note, p_reason);

  if v_earned - v_prev_earned <> 0 then
    insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
    values (p_workspace, p_assignment, p_date,
            case when v_rev = 1 then 'EARNING' else 'EARNING_CORRECTION' end,
            v_earned - v_prev_earned, 'WORK_ENTRY', v_entry.id);
    update workspaces set currency_locked = true where id = p_workspace;
  end if;

  v_result := jsonb_build_object('entry_id', v_entry.id, 'version', v_entry.version,
                                 'revision', v_rev, 'earned_minor', v_earned,
                                 'delta_minor', v_earned - v_prev_earned);
  insert into idempotency_keys values (p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: payment ----------
-- p_allocations: [{"assignment_id": "...", "amount_minor": 20000}, ...]
create function record_payment(p_workspace uuid, p_operation uuid, p_date date, p_method text,
                               p_method_note text, p_amount bigint, p_recipient text,
                               p_reference text, p_allocations jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_date, p_method, p_amount, p_recipient, p_reference, p_allocations::text));
  v_prior idempotency_keys; v_sum bigint; v_bad integer; v_no integer;
  v_payment payments; v_line jsonb; v_alloc allocations; v_result jsonb;
begin
  select * into v_prior from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'operation reused with different payload' using errcode = '40001'; end if;
    return v_prior.response;
  end if;

  select coalesce(sum((l->>'amount_minor')::bigint), 0) into v_sum from jsonb_array_elements(p_allocations) l;
  if v_sum <> p_amount then
    raise exception 'allocations total % does not equal payment %', v_sum, p_amount using errcode = '22023'; end if;

  select count(*) into v_bad from jsonb_array_elements(p_allocations) l
   where (l->>'amount_minor')::bigint <= 0
      or not exists (select 1 from assignments a
                     where a.id = (l->>'assignment_id')::uuid and a.workspace_id = p_workspace);
  if v_bad > 0 then raise exception 'invalid allocation line' using errcode = '22023'; end if;

  update workspaces set receipt_seq = receipt_seq + 1, currency_locked = true
   where id = p_workspace returning receipt_seq into v_no;

  insert into payments (workspace_id, receipt_no, payment_date, method, method_note, amount_minor,
                        recipient_label, reference, clearance)
  values (p_workspace, v_no, p_date, p_method, p_method_note, p_amount, p_recipient, p_reference,
          case when p_method = 'CHECK' then 'ISSUED' end)
  returning * into v_payment;

  for v_line in select * from jsonb_array_elements(p_allocations) loop
    insert into allocations (workspace_id, payment_id, assignment_id, amount_minor)
    values (p_workspace, v_payment.id, (v_line->>'assignment_id')::uuid, (v_line->>'amount_minor')::bigint)
    returning * into v_alloc;
    insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
    values (p_workspace, v_alloc.assignment_id, p_date, 'PAYMENT', -v_alloc.amount_minor, 'ALLOCATION', v_alloc.id);
  end loop;

  v_result := jsonb_build_object('payment_id', v_payment.id, 'receipt_no', v_no, 'version', v_payment.version);
  insert into idempotency_keys values (p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- idempotency helpers ----------
create function idem_get(p_workspace uuid, p_operation uuid, p_hash text) returns jsonb
language plpgsql as $$
declare v idempotency_keys;
begin
  select * into v from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if not found then return null; end if;
  if v.request_hash <> p_hash then
    raise exception 'operation reused with different payload' using errcode = '40001';
  end if;
  return v.response;
end $$;

create function idem_put(p_workspace uuid, p_operation uuid, p_hash text, p_response jsonb) returns void
language sql as $$ insert into idempotency_keys values (p_workspace, p_operation, p_hash, p_response) $$;

-- ---------- write path: reversal (full, partial, check returned, correction) ----------
-- p_lines null = reverse everything still unreversed; otherwise
-- [{"allocation_id": "...", "amount_minor": 5000}, ...] (kind must be PARTIAL).
create function reverse_payment(p_workspace uuid, p_operation uuid, p_payment uuid, p_kind text,
                                p_reason text, p_expected_version integer, p_effective_date date,
                                p_lines jsonb default null)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_payment, p_kind, p_expected_version, p_effective_date, coalesce(p_lines::text,'')));
  v_prior jsonb; v_payment payments; v_rev reversals; v_a record; v_amt bigint; v_total bigint := 0;
  v_left bigint; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if p_kind not in ('FULL','PARTIAL','CHECK_RETURNED','CORRECTION') then
    raise exception 'unknown reversal kind' using errcode = '22023'; end if;
  if (p_lines is not null) <> (p_kind = 'PARTIAL') then
    raise exception 'lines are required for PARTIAL and only for PARTIAL' using errcode = '22023'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;

  select * into v_payment from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if v_payment.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
  if p_kind = 'CHECK_RETURNED' and (v_payment.method <> 'CHECK' or v_payment.clearance = 'RETURNED') then
    raise exception 'only an issued or cleared check can be returned' using errcode = '22023'; end if;

  insert into reversals (workspace_id, payment_id, kind, reason)
  values (p_workspace, p_payment, p_kind, p_reason) returning * into v_rev;

  for v_a in
    select a.*, a.amount_minor - coalesce((select sum(rl.amount_minor) from reversal_lines rl
                                           where rl.allocation_id = a.id), 0) as remaining
    from allocations a where a.payment_id = p_payment order by a.id
  loop
    if p_lines is null then
      v_amt := v_a.remaining;
    else
      select coalesce(sum((l->>'amount_minor')::bigint), 0) into v_amt
        from jsonb_array_elements(p_lines) l where (l->>'allocation_id')::uuid = v_a.id;
      if v_amt < 0 or v_amt > v_a.remaining then
        raise exception 'reversal exceeds unreversed amount on allocation' using errcode = '22023'; end if;
    end if;
    if v_amt > 0 then
      insert into reversal_lines values (v_rev.id, v_a.id, v_amt);
      insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
      values (p_workspace, v_a.assignment_id, p_effective_date, 'PAYMENT_REVERSAL', v_amt, 'REVERSAL', v_rev.id);
      v_total := v_total + v_amt;
    end if;
  end loop;

  if p_lines is not null and exists (
      select 1 from jsonb_array_elements(p_lines) l
      where not exists (select 1 from allocations a where a.id = (l->>'allocation_id')::uuid and a.payment_id = p_payment)) then
    raise exception 'line does not belong to this payment' using errcode = '22023'; end if;
  if v_total = 0 then raise exception 'nothing left to reverse' using errcode = '22023'; end if;

  select coalesce(sum(a.amount_minor), 0) - coalesce((select sum(rl.amount_minor) from reversal_lines rl
           join allocations a2 on a2.id = rl.allocation_id where a2.payment_id = p_payment), 0)
    into v_left from allocations a where a.payment_id = p_payment;

  update payments set version = version + 1,
         clearance = case when p_kind = 'CHECK_RETURNED' then 'RETURNED' else clearance end
   where id = p_payment returning * into v_payment;
  update receipts set status = case when p_kind = 'CORRECTION' then 'SUPERSEDED'
                                    when v_left = 0 then 'REVERSED' else 'SUPERSEDED' end
   where payment_id = p_payment and status = 'CURRENT';

  v_result := jsonb_build_object('reversal_id', v_rev.id, 'payment_version', v_payment.version,
                                 'reversed_minor', v_total, 'unreversed_minor', v_left);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: check cleared (no ledger effect) ----------
create function set_check_cleared(p_workspace uuid, p_operation uuid, p_payment uuid, p_expected_version integer)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'clear', p_payment, p_expected_version)); v_prior jsonb; v_p payments; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  select * into v_p from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if v_p.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
  if v_p.method <> 'CHECK' or v_p.clearance <> 'ISSUED' then
    raise exception 'only an issued check can be marked cleared' using errcode = '22023'; end if;
  update payments set clearance = 'CLEARED', version = version + 1 where id = p_payment returning * into v_p;
  update receipts set status = 'SUPERSEDED' where payment_id = p_payment and status = 'CURRENT';
  v_result := jsonb_build_object('payment_version', v_p.version, 'clearance', v_p.clearance);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: correct a payment (reverse old + record new, one transaction) ----------
create function correct_payment(p_workspace uuid, p_operation uuid, p_payment uuid, p_expected_version integer,
                                p_effective_date date, p_reason text,
                                p_date date, p_method text, p_method_note text, p_amount bigint,
                                p_recipient text, p_reference text, p_allocations jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', 'correct', p_payment, p_expected_version, p_date, p_method, p_amount,
                               p_recipient, p_reference, p_allocations::text));
  v_prior jsonb; v_rev jsonb; v_new jsonb; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_rev := reverse_payment(p_workspace, gen_random_uuid(), p_payment, 'CORRECTION', p_reason,
                           p_expected_version, p_effective_date);
  v_new := record_payment(p_workspace, gen_random_uuid(), p_date, p_method, p_method_note, p_amount,
                          p_recipient, p_reference, p_allocations);
  update payments set replaces_payment_id = p_payment where id = (v_new->>'payment_id')::uuid;
  v_result := jsonb_build_object('replaced_payment_id', p_payment, 'reversal', v_rev, 'payment', v_new);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: reimbursement ----------
create function record_reimbursement(p_workspace uuid, p_operation uuid, p_assignment uuid, p_date date,
                                     p_amount bigint, p_description text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'reimb', p_assignment, p_date, p_amount, p_description));
        v_prior jsonb; v_id uuid; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if coalesce(length(trim(p_description)), 0) = 0 then raise exception 'description required' using errcode = '22023'; end if;
  insert into reimbursements (workspace_id, assignment_id, reimb_date, amount_minor, description)
  values (p_workspace, p_assignment, p_date, p_amount, p_description) returning id into v_id;
  insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
  values (p_workspace, p_assignment, p_date, 'REIMBURSEMENT', p_amount, 'REIMBURSEMENT', v_id);
  update workspaces set currency_locked = true where id = p_workspace;
  v_result := jsonb_build_object('reimbursement_id', v_id);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: adjustment ----------
create function record_adjustment(p_workspace uuid, p_operation uuid, p_assignment uuid, p_date date,
                                  p_direction text, p_category text, p_amount bigint, p_reason text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'adj', p_assignment, p_date, p_direction, p_category, p_amount, p_reason));
        v_prior jsonb; v_id uuid; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;
  insert into adjustments (workspace_id, assignment_id, adj_date, direction, category, amount_minor, reason)
  values (p_workspace, p_assignment, p_date, p_direction, p_category, p_amount, p_reason) returning id into v_id;
  insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
  values (p_workspace, p_assignment, p_date, 'ADJUSTMENT',
          case when p_direction = 'INCREASE_OWED' then p_amount else -p_amount end, 'ADJUSTMENT', v_id);
  update workspaces set currency_locked = true where id = p_workspace;
  v_result := jsonb_build_object('adjustment_id', v_id);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: mark rest as no work ----------
-- Records NO_WORK only for assignments that are active on the date, have a pay agreement
-- in force, and are still Unrecorded (no entry, or active revision is VOID).
create function mark_rest_no_work(p_workspace uuid, p_operation uuid, p_project uuid, p_date date)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'rest', p_project, p_date)); v_prior jsonb;
        v_a record; v_count integer := 0; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from projects where id = p_project and workspace_id = p_workspace and status = 'ACTIVE') then
    raise exception 'project not found or archived' using errcode = 'P0002'; end if;
  for v_a in
    select a.id, e.version, r.input_mode
      from assignments a
      left join work_entries e on e.assignment_id = a.id and e.work_date = p_date
      left join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where a.project_id = p_project and a.workspace_id = p_workspace
       and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date)
       and exists (select 1 from rate_agreements ra where ra.assignment_id = a.id and ra.effective_from <= p_date)
       and (e.id is null or r.input_mode = 'VOID')
  loop
    perform record_work(p_workspace, gen_random_uuid(), v_a.id, p_date, 'NO_WORK', null, null,
                        coalesce(v_a.version, 0),
                        case when v_a.version is null then null else 'Marked no work' end, null);
    v_count := v_count + 1;
  end loop;
  v_result := jsonb_build_object('marked', v_count);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- rate changes: preview (read-only) and apply (all-or-nothing) ----------
create function preview_rate_change(p_workspace uuid, p_assignment uuid, p_from date, p_basis text,
                                    p_rate bigint, p_std integer)
returns jsonb language plpgsql stable as $$
declare v_next date; v_cur rate_agreements; v_rows jsonb := '[]'::jsonb; v_total bigint := 0;
        v_r record; v_new bigint; v_blocked text; v_last date;
begin
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select min(effective_from) into v_next from rate_agreements where assignment_id = p_assignment and effective_from > p_from;
  select * into v_cur from rate_agreements where assignment_id = p_assignment and effective_from <= p_from
   order by effective_from desc limit 1;
  select max(e.work_date) into v_last from work_entries e
    join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
   where e.assignment_id = p_assignment and r.input_mode <> 'VOID';
  if v_cur.id is not null and v_cur.pay_basis <> p_basis and v_last is not null and v_last >= p_from then
    v_blocked := 'A change between daily and hourly must start after the last recorded work day ('
                 || v_last || '). Void and re-enter those days instead.';
  end if;
  for v_r in
    select e.work_date, e.version, r.input_mode, r.portion, r.minutes, r.earned_minor
      from work_entries e join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where e.assignment_id = p_assignment and e.work_date >= p_from
       and (v_next is null or e.work_date < v_next)
       and r.input_mode in ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES')
     order by e.work_date
  loop
    if v_blocked is null then
      begin
        v_new := fn_earned(p_basis, p_rate, v_r.input_mode, v_r.portion, v_r.minutes, p_std);
      exception when others then
        v_blocked := 'Day ' || v_r.work_date || ' was entered as hours; the new agreement needs a standard day length.';
      end;
    end if;
    if v_blocked is null then
      v_rows := v_rows || jsonb_build_object('work_date', v_r.work_date, 'old_earned_minor', v_r.earned_minor,
                                             'new_earned_minor', v_new, 'delta_minor', v_new - v_r.earned_minor);
      v_total := v_total + (v_new - v_r.earned_minor);
    end if;
  end loop;
  return jsonb_build_object('affected', case when v_blocked is null then v_rows else '[]'::jsonb end,
                            'total_delta_minor', case when v_blocked is null then v_total else 0 end,
                            'blocked_reason', v_blocked);
end $$;

-- Raises SQLSTATE 55000 ("confirmation required") when recorded days are affected and
-- p_confirm is false. The API returns 409 with the preview so the owner can confirm or cancel.
create function apply_rate_change(p_workspace uuid, p_operation uuid, p_assignment uuid, p_from date,
                                  p_basis text, p_rate bigint, p_std integer, p_reason text, p_confirm boolean)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'rate', p_assignment, p_from, p_basis, p_rate, p_std, p_confirm));
        v_prior jsonb; v_preview jsonb; v_id uuid; v_r record; v_count integer := 0; v_result jsonb; v_next date;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_preview := preview_rate_change(p_workspace, p_assignment, p_from, p_basis, p_rate, p_std);
  if v_preview->>'blocked_reason' is not null then
    raise exception '%', v_preview->>'blocked_reason' using errcode = '22023'; end if;
  if jsonb_array_length(v_preview->'affected') > 0 then
    if not p_confirm then raise exception 'confirmation required' using errcode = '55000'; end if;
    if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from rate_agreements where assignment_id = p_assignment and effective_from = p_from) then
    raise exception 'an agreement already starts on this date' using errcode = '22023'; end if;
  select min(effective_from) into v_next from rate_agreements where assignment_id = p_assignment and effective_from > p_from;

  insert into rate_agreements (workspace_id, assignment_id, effective_from, pay_basis, rate_minor, standard_day_minutes)
  values (p_workspace, p_assignment, p_from, p_basis, p_rate, p_std) returning id into v_id;

  for v_r in
    select e.work_date, e.version, r.input_mode, r.portion, r.minutes, r.note
      from work_entries e join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where e.assignment_id = p_assignment and e.work_date >= p_from
       and (v_next is null or e.work_date < v_next)
       and r.input_mode in ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES')
  loop
    perform record_work(p_workspace, gen_random_uuid(), p_assignment, v_r.work_date, v_r.input_mode,
                        v_r.portion, v_r.minutes, v_r.version, 'Rate change: ' || p_reason, v_r.note);
    v_count := v_count + 1;
  end loop;

  v_result := jsonb_build_object('agreement_id', v_id, 'corrected_days', v_count,
                                 'total_delta_minor', (v_preview->>'total_delta_minor')::bigint);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: payment with an optional owner note ----------
-- Same as record_payment; the note is stored in the same transaction. Notes never affect money.
create function record_payment_with_note(p_workspace uuid, p_operation uuid, p_date date, p_method text,
                                         p_method_note text, p_amount bigint, p_recipient text,
                                         p_reference text, p_allocations jsonb, p_note text)
returns jsonb language plpgsql security definer as $$
declare v_result jsonb;
begin
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  v_result := record_payment(p_workspace, p_operation, p_date, p_method, p_method_note, p_amount,
                             p_recipient, p_reference, p_allocations);
  update payments set note = p_note where id = (v_result->>'payment_id')::uuid and workspace_id = p_workspace
     and note is distinct from p_note;
  return v_result;
end $$;

-- ---------- account deletion (the only path that deletes financial rows) ----------
-- Called by the deletion job for a workspace whose owner confirmed account deletion.
-- Auth tables (users, sessions, apple_credentials) are removed by the app after this returns.
create function delete_workspace_data(p_workspace uuid) returns jsonb
language plpgsql security definer as $$
declare v_counts jsonb := '{}'::jsonb; n integer;
begin
  if not exists (select 1 from workspaces where id = p_workspace) then
    raise exception 'workspace not found' using errcode = 'P0002'; end if;
  perform set_config('workpay.deleting_workspace', p_workspace::text, true);  -- this transaction only
  delete from acknowledgments where workspace_id = p_workspace;           get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('acknowledgments', n);
  delete from share_links where workspace_id = p_workspace;               get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('share_links', n);
  delete from payment_signatures where workspace_id = p_workspace;  -- table defined later in this file
  delete from evidence where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('evidence', n);
  delete from receipts where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('receipts', n);
  delete from statements where workspace_id = p_workspace;                get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('statements', n);
  delete from reversal_lines rl using reversals r where rl.reversal_id = r.id and r.workspace_id = p_workspace;
  delete from reversals where workspace_id = p_workspace;
  delete from allocations where workspace_id = p_workspace;
  delete from ledger_events where workspace_id = p_workspace;             get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('ledger_events', n);
  delete from payments where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments', n);
  delete from work_revisions where workspace_id = p_workspace;
  delete from work_entries where workspace_id = p_workspace;
  delete from day_reviews where workspace_id = p_workspace;
  delete from reimbursements where workspace_id = p_workspace;
  delete from adjustments where workspace_id = p_workspace;
  delete from rate_agreements where workspace_id = p_workspace;
  delete from assignments where workspace_id = p_workspace;
  delete from reminder_preferences where workspace_id = p_workspace;
  delete from workers where workspace_id = p_workspace;
  delete from projects where workspace_id = p_workspace;
  delete from audit_events where workspace_id = p_workspace;
  delete from idempotency_keys where workspace_id = p_workspace;
  delete from workspaces where id = p_workspace;
  perform set_config('workpay.deleting_workspace', '', true);
  return v_counts;
end $$;


-- =====================================================================
-- Baseline 1.2 additions
-- =====================================================================

-- ---------- hand-over signatures (worker confirms receipt on the owner's phone) ----------
create table payment_signatures (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null,
  payment_id             uuid not null,
  worker_id              uuid not null,
  typed_name             text not null check (length(trim(typed_name)) between 2 and 80),
  signature_evidence_id  uuid not null references evidence(id),
  language               text not null check (language in ('en','es')),
  statement_text         text not null,          -- the exact sentence the worker confirmed
  amount_minor           bigint not null check (amount_minor > 0),
  signed_at              timestamptz not null default now(),
  unique (payment_id, worker_id),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id),
  foreign key (workspace_id, worker_id)  references workers  (workspace_id, id)
);

-- Records a worker's signature for their share of a payment. No ledger effect.
-- Bumps the payment version so the next receipt snapshot carries the signature;
-- the current receipt is kept and marked SUPERSEDED.
create function record_handover_signature(p_workspace uuid, p_operation uuid, p_payment uuid,
                                          p_worker uuid, p_typed_name text, p_evidence uuid,
                                          p_language text, p_statement text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'sign', p_payment, p_worker, p_typed_name, p_evidence, p_language));
        v_prior jsonb; v_amount bigint; v_id uuid; v_p payments; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  select * into v_p from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  select coalesce(sum(a.amount_minor), 0) into v_amount
    from allocations a join assignments s on s.id = a.assignment_id
   where a.payment_id = p_payment and s.worker_id = p_worker;
  if v_amount = 0 then raise exception 'worker is not on this payment' using errcode = '22023'; end if;
  if not exists (select 1 from evidence e where e.id = p_evidence and e.workspace_id = p_workspace
                   and e.parent_type = 'PAYMENT' and e.parent_id = p_payment and e.content_type = 'image/png') then
    raise exception 'signature image not found for this payment' using errcode = '22023'; end if;
  if exists (select 1 from reversals where payment_id = p_payment) then
    raise exception 'payment has been reversed or corrected' using errcode = '22023'; end if;
  insert into payment_signatures (workspace_id, payment_id, worker_id, typed_name, signature_evidence_id,
                                  language, statement_text, amount_minor)
  values (p_workspace, p_payment, p_worker, trim(p_typed_name), p_evidence, p_language, p_statement, v_amount)
  returning id into v_id;
  update payments set version = version + 1 where id = p_payment returning * into v_p;
  update receipts set status = 'SUPERSEDED' where payment_id = p_payment and status = 'CURRENT';
  v_result := jsonb_build_object('signature_id', v_id, 'payment_version', v_p.version, 'amount_minor', v_amount);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- pay what's owed: several payments, one per worker, all or nothing ----------
-- p_lines: [{"assignment_id","amount_minor","method","method_note","recipient_label","reference","note"}]
-- One payment (and one receipt number) per line. If any line fails, nothing is recorded.
create function record_payout(p_workspace uuid, p_operation uuid, p_date date, p_lines jsonb)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'payout', p_date, p_lines::text));
        v_prior jsonb; v_line jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb; v_n integer;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_n := jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
  if v_n = 0 or v_n > 50 then raise exception 'between 1 and 50 lines' using errcode = '22023'; end if;
  if (select count(distinct l->>'assignment_id') from jsonb_array_elements(p_lines) l) <> v_n then
    raise exception 'each assignment once per payout' using errcode = '22023'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_res := record_payment_with_note(p_workspace, gen_random_uuid(), p_date,
               v_line->>'method', v_line->>'method_note', (v_line->>'amount_minor')::bigint,
               v_line->>'recipient_label', v_line->>'reference',
               jsonb_build_array(jsonb_build_object('assignment_id', v_line->>'assignment_id',
                                                    'amount_minor', (v_line->>'amount_minor')::bigint)),
               v_line->>'note');
    v_out := v_out || jsonb_build_object('assignment_id', v_line->>'assignment_id',
                                         'payment_id', v_res->>'payment_id', 'receipt_no', v_res->>'receipt_no');
  end loop;
  perform idem_put(p_workspace, p_operation, v_hash, jsonb_build_object('payments', v_out));
  return jsonb_build_object('payments', v_out);
end $$;

-- ---------- read models ----------
-- Totals per assignment by type; every column comes from the ledger, so it always ties to the balance.
create view assignment_totals as
select a.workspace_id, a.id as assignment_id, a.project_id, a.worker_id,
  coalesce(sum(l.signed_delta) filter (where l.event_type in ('EARNING','EARNING_CORRECTION')), 0) as earned_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'REIMBURSEMENT'), 0)                 as reimbursed_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'ADJUSTMENT' and l.signed_delta > 0), 0) as added_minor,
  coalesce(-sum(l.signed_delta) filter (where l.event_type = 'ADJUSTMENT' and l.signed_delta < 0), 0) as taken_off_minor,
  coalesce(-sum(l.signed_delta) filter (where l.event_type = 'PAYMENT'), 0)                      as paid_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'PAYMENT_REVERSAL'), 0)              as reversed_minor,
  coalesce(sum(l.signed_delta), 0)                                                               as balance_minor
from assignments a left join ledger_events l on l.assignment_id = a.id
group by a.workspace_id, a.id, a.project_id, a.worker_id;

-- Net paid per worker per calendar year (payments minus reversals, by effective date), all projects.
create view worker_year_paid as
select l.workspace_id, a.worker_id, extract(year from l.effective_date)::int as year,
       -sum(l.signed_delta) as net_paid_minor
from ledger_events l join assignments a on a.id = l.assignment_id
where l.event_type in ('PAYMENT','PAYMENT_REVERSAL')
group by l.workspace_id, a.worker_id, extract(year from l.effective_date);


-- ---------- public receipt links: open and acknowledge (called by the public page, no session) ----------
-- The public endpoint hashes the token from the URL and passes only the hash.
-- Returns the link row if usable; raises P0002 for unknown, expired or revoked links (same error for all three).
create function open_share_link(p_token_hash bytea) returns share_links
language plpgsql security definer as $$
declare v share_links;
begin
  update share_links
     set open_count = open_count + 1,
         first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now()
   where token_hash = p_token_hash and revoked_at is null and expires_at > now()
  returning * into v;
  if not found then raise exception 'link not available' using errcode = 'P0002'; end if;
  return v;
end $$;

create function acknowledge_share_link(p_token_hash bytea, p_kind text, p_typed_name text, p_note text)
returns jsonb language plpgsql security definer as $$
declare v share_links; v_id uuid;
begin
  select * into v from share_links
   where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then raise exception 'link not available' using errcode = 'P0002'; end if;
  if p_kind not in ('RECEIVED','QUERY') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_kind = 'QUERY' and coalesce(length(trim(p_note)), 0) = 0 then
    raise exception 'a question needs a note' using errcode = '22023'; end if;
  if p_kind = 'RECEIVED' and exists (select 1 from acknowledgments where share_link_id = v.id and kind = 'RECEIVED') then
    return jsonb_build_object('status', 'already_confirmed');
  end if;
  insert into acknowledgments (workspace_id, share_link_id, kind, typed_name, note)
  values (v.workspace_id, v.id, p_kind, nullif(trim(p_typed_name), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  return jsonb_build_object('status', 'recorded', 'acknowledgment_id', v_id);
end $$;
