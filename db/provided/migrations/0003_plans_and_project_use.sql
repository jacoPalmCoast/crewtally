-- =====================================================================
-- 0003 — Plans (Free / Project Pass / Pro), project use, tax thresholds,
--        receipt-link growth counter.            Baseline 1.3, Phase 2.
-- Additive only. Loaded after 0001_schema.sql and 0002_auth.sql.
-- Plan limits are enforced here, by triggers, so no code path can skip them.
-- Limits only stop NEW projects, reopened projects and NEW assignments.
-- Existing records are never locked: work, payments, receipts, statements
-- and exports keep working on any plan, including after Pro lapses.
-- =====================================================================

-- ---------- project use: decides tax wording on year-end totals ----------
alter table projects
  add column project_use text not null default 'PERSONAL_HOME'
    check (project_use in ('PERSONAL_HOME','RENTAL','BUSINESS'));

-- ---------- Pro subscription state (one row per workspace) ----------
create table workspace_entitlements (
  workspace_id     uuid primary key references workspaces(id) on delete cascade,
  pro_active       boolean not null default false,
  pro_expires_at   timestamptz,                 -- null with pro_active = lifetime/comp
  pro_product_id   text,
  source           text check (source in ('APPLE_IAP','WEB','COMP')),
  updated_at       timestamptz not null default now()
);

-- ---------- Project Pass purchases ----------
create table project_passes (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  transaction_id   text not null unique,       -- store transaction id; one pass per purchase
  product_id       text not null,
  purchased_at     timestamptz not null,
  refunded_at      timestamptz,
  unique (workspace_id, id)
);

-- A project carries at most one pass; a pass covers at most one project.
alter table projects add column pass_id uuid unique;
alter table projects
  add constraint projects_pass_fk foreign key (workspace_id, pass_id)
  references project_passes (workspace_id, id);

-- ---------- store webhook events, for idempotency and audit ----------
create table entitlement_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  event_id         text not null unique,       -- RevenueCat event id (or web checkout id)
  event_type       text not null check (event_type in
                     ('PRO_ACTIVE','PRO_EXPIRED','PASS_PURCHASED','PASS_REFUNDED')),
  product_id       text,
  transaction_id   text,
  expires_at       timestamptz,
  occurred_at      timestamptz not null,
  received_at      timestamptz not null default now()
);

-- ---------- tax thresholds, one row per year (never hard-code in the app) ----------
create table tax_thresholds (
  tax_year     integer not null,
  kind         text not null check (kind in ('FORM_1099_NEC','HOUSEHOLD_EMPLOYEE_FICA')),
  amount_minor bigint not null check (amount_minor > 0),
  source_url   text not null,
  primary key (tax_year, kind)
);
insert into tax_thresholds values
  (2025,'FORM_1099_NEC',            60000, 'https://www.irs.gov/instructions/i1099mec'),
  (2026,'FORM_1099_NEC',           200000, 'https://www.irs.gov/instructions/i1099mec'),
  (2025,'HOUSEHOLD_EMPLOYEE_FICA', 280000, 'https://www.irs.gov/publications/p926'),
  (2026,'HOUSEHOLD_EMPLOYEE_FICA', 300000, 'https://www.irs.gov/publications/p926');

-- ---------- receipt-link growth counter: counts only, no people ----------
create table growth_counters (
  day     date not null,
  source  text not null check (source in ('RECEIPT_PAGE_VIEW','RECEIPT_FOOTER_TAP')),
  count   integer not null default 0,
  primary key (day, source)
);

-- =====================================================================
-- Plan logic
-- =====================================================================
-- How the Free worker limit works:
--  * adding or extending a CURRENT assignment on a free project needs a free slot (3 workers);
--  * assignments saved already ended (history) are always allowed and hold no slot;
--  * recording PAID work on a new day on a free project is checked too: the worker must fit among
--    the workers paid on free projects within 29 days either side of that date (plus today's current
--    workers when the date is recent). This stops end-date and backdating tricks without counting
--    old history. Correcting a day that already had paid work is never limited.
--  * an assignment never moves to another worker or project.
--  * assignments created while the project had full access (Pass or Pro) are never limited later
--    (invariant 16: existing workers keep working after Pro lapses or a pass is refunded).
alter table assignments add column created_with_full_access boolean not null default false;  -- set only by trigger
create index assignments_ws_worker on assignments (workspace_id, worker_id);

-- Free limits. Change here only; the app reads them from GET /v1/plan.
create function plan_free_limits() returns jsonb language sql immutable as $$
  select jsonb_build_object('active_projects', 1, 'workers', 3)
$$;

-- "Today" in the project's own time zone (never the server's).
create function project_today(p_project uuid) returns date
language sql stable as $$
  select (now() at time zone p.timezone)::date from projects p where p.id = p_project
$$;

create function workspace_is_pro(p_workspace uuid) returns boolean
language sql stable as $$
  select coalesce((select pro_active and (pro_expires_at is null or pro_expires_at > now())
                   from workspace_entitlements where workspace_id = p_workspace), false)
$$;

-- A project has full access when the workspace is Pro or it carries an unrefunded pass.
create function project_has_full_access(p_project uuid) returns boolean
language sql stable as $$
  select workspace_is_pro(p.workspace_id)
      or exists (select 1 from project_passes pp where pp.id = p.pass_id and pp.refunded_at is null)
  from projects p where p.id = p_project
$$;

-- Free projects = active projects without a live pass.
create function free_active_project_count(p_workspace uuid, p_exclude uuid) returns integer
language sql stable as $$
  select count(*)::int from projects p
  where p.workspace_id = p_workspace and p.status = 'ACTIVE'
    and p.id is distinct from p_exclude
    and not exists (select 1 from project_passes pp where pp.id = p.pass_id and pp.refunded_at is null)
$$;

-- Workers with a current assignment (not ended in the project's own time zone) on a free active project.
create function free_current_workers(p_workspace uuid, p_exclude_assignment uuid) returns setof uuid
language sql stable as $$
  select distinct a.worker_id
  from assignments a join projects p on p.id = a.project_id
  where a.workspace_id = p_workspace and p.status = 'ACTIVE'
    and not project_has_full_access(p.id)
    and (a.end_date is null or a.end_date >= (now() at time zone p.timezone)::date)
    and a.id is distinct from p_exclude_assignment
$$;

-- Workers paid on free projects within 29 days either side of p_date (assignments created with full access excluded).
create function free_paid_workers(p_workspace uuid, p_date date) returns setof uuid
language sql stable as $$
  select distinct a.worker_id
  from work_entries e
  join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
  join assignments a on a.id = e.assignment_id
  join projects p on p.id = a.project_id
  where a.workspace_id = p_workspace
    and not a.created_with_full_access
    and not project_has_full_access(p.id)
    and r.input_mode not in ('NO_WORK','VOID')
    and e.work_date between p_date - 29 and p_date + 29
$$;

-- Plan checks rely on a per-workspace lock, which only protects READ COMMITTED transactions.
create function require_read_committed() returns void
language plpgsql as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'plan changes must run at READ COMMITTED' using errcode = '25001';
  end if;
end $$;

-- Project time zones must be real IANA names (the plan rules use them).
create function trg_projects_timezone_valid() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger projects_timezone_valid
  before insert or update of timezone on projects
  for each row execute function trg_projects_timezone_valid();

-- One lock per workspace so two requests at once can't both pass a limit check.
create function lock_workspace_plan(p_workspace uuid) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtextextended('crewtally_plan:' || p_workspace::text, 0))
$$;

create function trg_projects_plan_limit() returns trigger
language plpgsql as $$
declare v_projects int := (plan_free_limits()->>'active_projects')::int;
        v_workers  int := (plan_free_limits()->>'workers')::int;
        v_count int;
begin
  perform require_read_committed();
  perform lock_workspace_plan(new.workspace_id);
  -- A pass stays with the first project it covers.
  if tg_op = 'UPDATE' and old.pass_id is not null and new.pass_id is distinct from old.pass_id then
    raise exception 'a project pass stays with its project' using errcode = '22023';
  end if;
  if new.status <> 'ACTIVE' then return new; end if;
  -- Nothing to check when an active project only changes other fields.
  if tg_op = 'UPDATE' and old.status = 'ACTIVE' and new.pass_id is not distinct from old.pass_id then
    return new;
  end if;
  if new.pass_id is not null then
    if exists (select 1 from project_passes pp
               where pp.id = new.pass_id and pp.workspace_id = new.workspace_id and pp.refunded_at is null) then
      return new;
    end if;
    -- A new or changed pass must be live. A refunded pass that stays on its project
    -- just means the project is checked like any other Free project.
    if tg_op = 'INSERT' or new.pass_id is distinct from old.pass_id then
      raise exception 'project pass not available' using errcode = 'P0002';
    end if;
  end if;
  if workspace_is_pro(new.workspace_id) then return new; end if;
  if free_active_project_count(new.workspace_id, new.id) >= v_projects then
    raise exception 'plan limit: active projects' using errcode = 'CT402',
      detail = jsonb_build_object('limit','active_projects','max',v_projects)::text;
  end if;
  -- Reopening a free project brings its current workers back into the Free count.
  if tg_op = 'UPDATE' then
    select count(*) into v_count from (
      select w from free_current_workers(new.workspace_id, null) w
      union
      select a.worker_id from assignments a
      where a.project_id = new.id
        and (a.end_date is null or a.end_date >= (now() at time zone new.timezone)::date)) s;
    if v_count > v_workers then
      raise exception 'plan limit: workers' using errcode = 'CT402',
        detail = jsonb_build_object('limit','workers','max',v_workers)::text;
    end if;
  end if;
  return new;
end $$;

create trigger projects_plan_limit
  before insert or update of status, pass_id on projects
  for each row execute function trg_projects_plan_limit();

create function trg_assignments_plan_limit() returns trigger
language plpgsql as $$
declare v_limit int := (plan_free_limits()->>'workers')::int; v_count int; v_today date;
begin
  if tg_op = 'UPDATE' then
    -- An assignment is one worker on one project for good: history and money hang off it.
    if new.worker_id <> old.worker_id or new.project_id <> old.project_id then
      raise exception 'an assignment can''t move to another worker or project' using errcode = '22023';
    end if;
    new.created_with_full_access := old.created_with_full_access;   -- set only at insert
    if new.end_date is not distinct from old.end_date and new.project_id = old.project_id
       and new.worker_id = old.worker_id then
      return new;
    end if;
  end if;
  perform require_read_committed();
  perform lock_workspace_plan(new.workspace_id);
  if project_has_full_access(new.project_id) then
    if tg_op = 'INSERT' then new.created_with_full_access := true; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then new.created_with_full_access := false; end if;
  if new.created_with_full_access then return new; end if;
  v_today := project_today(new.project_id);
  -- History (already ended) is always allowed and holds no slot; paid work on it is checked below.
  if new.end_date is not null and new.end_date < v_today then return new; end if;
  select count(*) into v_count from (
    select w from free_current_workers(new.workspace_id, new.id) w
    union select new.worker_id) s;
  if v_count > v_limit then
    raise exception 'plan limit: workers' using errcode = 'CT402',
      detail = jsonb_build_object('limit','workers','max',v_limit)::text;
  end if;
  return new;
end $$;

create trigger assignments_plan_limit
  before insert or update of end_date, project_id, worker_id, created_with_full_access on assignments
  for each row execute function trg_assignments_plan_limit();

-- Paid work on a free project: the worker must fit among the current and recently paid workers.
-- "No work" and cleared entries are always allowed, so marking a rest day never fails.
create function trg_work_revisions_plan_limit() returns trigger
language plpgsql as $$
declare v_limit int := (plan_free_limits()->>'workers')::int; a record; v_date date; v_count int;
begin
  if new.input_mode in ('NO_WORK','VOID') then return new; end if;
  -- Correcting a day that already had paid work is never limited (records are never locked).
  if exists (select 1 from work_revisions r where r.entry_id = new.entry_id
             and r.input_mode not in ('NO_WORK','VOID')) then
    return new;
  end if;
  select asg.workspace_id, asg.worker_id, asg.project_id, asg.created_with_full_access, e.work_date
    into a
  from work_entries e join assignments asg on asg.id = e.assignment_id where e.id = new.entry_id;
  if a.created_with_full_access or project_has_full_access(a.project_id) then return new; end if;
  perform require_read_committed();
  perform lock_workspace_plan(a.workspace_id);
  -- Today's current workers only matter for recent work; older days are judged by who was paid then.
  select count(*) into v_count from (
    select w from free_current_workers(a.workspace_id, null) w
     where a.work_date >= project_today(a.project_id) - 29
    union select w from free_paid_workers(a.workspace_id, a.work_date) w
    union select a.worker_id) s;
  if v_count > v_limit then
    raise exception 'plan limit: workers' using errcode = 'CT402',
      detail = jsonb_build_object('limit','workers','max',v_limit)::text;
  end if;
  return new;
end $$;

create trigger work_revisions_plan_limit
  before insert on work_revisions
  for each row execute function trg_work_revisions_plan_limit();

-- ---------- one idempotent entry point for store / web purchase events ----------
create function record_entitlement_event(
  p_workspace uuid, p_event_id text, p_type text, p_product text,
  p_transaction text, p_expires_at timestamptz, p_occurred_at timestamptz,
  p_source text default 'APPLE_IAP')
returns jsonb language plpgsql security definer as $$
declare v_id uuid; v_prev entitlement_events; v_other uuid;
begin
  if not exists (select 1 from workspaces where id = p_workspace) then
    raise exception 'workspace not found' using errcode = 'P0002'; end if;
  if p_type is null or p_type not in ('PRO_ACTIVE','PRO_EXPIRED','PASS_PURCHASED','PASS_REFUNDED') then
    raise exception 'unknown event type' using errcode = '22023'; end if;
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event id required' using errcode = '22023'; end if;
  if p_source is null or p_source not in ('APPLE_IAP','WEB','COMP') then
    raise exception 'unknown source' using errcode = '22023'; end if;
  if p_type in ('PASS_PURCHASED','PASS_REFUNDED') then
    if p_transaction is null then raise exception 'transaction id required' using errcode = '22023'; end if;
    select workspace_id into v_other from project_passes where transaction_id = p_transaction;
    if v_other is not null and v_other <> p_workspace then
      raise exception 'transaction belongs to another account' using errcode = '22023';
    end if;
  end if;

  -- Idempotent and race-safe: the unique event id decides.
  insert into entitlement_events (workspace_id, event_id, event_type, product_id, transaction_id, expires_at, occurred_at)
    values (p_workspace, p_event_id, p_type, p_product, p_transaction, p_expires_at, p_occurred_at)
  on conflict (event_id) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_prev from entitlement_events where event_id = p_event_id;
    if v_prev.workspace_id = p_workspace and v_prev.event_type = p_type
       and v_prev.transaction_id is not distinct from p_transaction then
      return jsonb_build_object('status','duplicate');
    end if;
    raise exception 'event id reused with different details' using errcode = '23505';
  end if;

  if p_type = 'PRO_ACTIVE' then
    insert into workspace_entitlements (workspace_id, pro_active, pro_expires_at, pro_product_id, source, updated_at)
      values (p_workspace, true, p_expires_at, p_product, p_source, now())
    on conflict (workspace_id) do update
      set pro_active = true,
          -- null means "never expires"; keep it. Otherwise never move the expiry backwards.
          pro_expires_at = case
            when workspace_entitlements.pro_active and workspace_entitlements.pro_expires_at is null then null
            when excluded.pro_expires_at is null then null
            when workspace_entitlements.pro_expires_at is null then excluded.pro_expires_at
            else greatest(workspace_entitlements.pro_expires_at, excluded.pro_expires_at) end,
          source = case when workspace_entitlements.pro_active and workspace_entitlements.pro_expires_at is null
                        then workspace_entitlements.source else excluded.source end,
          pro_product_id = excluded.pro_product_id, updated_at = now();
  elsif p_type = 'PRO_EXPIRED' then
    -- No expiry given = ended now (refund or revoke), except a comp plan, which store notices never end.
    -- With an expiry, ignore notices for an earlier period, and never end a no-expiry plan with a dated notice.
    update workspace_entitlements set pro_active = false, updated_at = now()
     where workspace_id = p_workspace
       and ((p_expires_at is null and source is distinct from 'COMP')
            or (pro_expires_at is not null and pro_expires_at <= p_expires_at));
  elsif p_type = 'PASS_PURCHASED' then
    insert into project_passes (workspace_id, transaction_id, product_id, purchased_at, refunded_at)
      values (p_workspace, p_transaction, coalesce(p_product,'project_pass'), p_occurred_at,
              -- a refund notice can arrive before the purchase notice
              (select min(occurred_at) from entitlement_events
                where workspace_id = p_workspace and transaction_id = p_transaction and event_type = 'PASS_REFUNDED'))
    on conflict (transaction_id) do nothing;
  elsif p_type = 'PASS_REFUNDED' then
    insert into project_passes (workspace_id, transaction_id, product_id, purchased_at, refunded_at)
      values (p_workspace, p_transaction, coalesce(p_product,'project_pass'), p_occurred_at, p_occurred_at)
    on conflict (transaction_id) do update
      set refunded_at = coalesce(project_passes.refunded_at, excluded.refunded_at);
  end if;
  return jsonb_build_object('status','recorded');
end $$;

-- ---------- what the app shows on the plan screen ----------
create function plan_status(p_workspace uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'pro', workspace_is_pro(p_workspace),
    'pro_expires_at', (select pro_expires_at from workspace_entitlements where workspace_id = p_workspace),
    'free_limits', plan_free_limits(),
    'free_active_projects', free_active_project_count(p_workspace, null),
    'free_workers', (select count(*)::int from free_current_workers(p_workspace, null)),
    'unused_passes', (select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'purchased_at', pp.purchased_at)
                                                order by pp.purchased_at), '[]'::jsonb)
                      from project_passes pp
                      where pp.workspace_id = p_workspace and pp.refunded_at is null
                        and not exists (select 1 from projects p where p.pass_id = pp.id)))
$$;

-- Year-end totals per worker with the tax wording the app is allowed to show.
-- Net paid = payments minus reversals by effective date (same rule as worker_year_paid),
-- split by project use so 1099 totals only count Rental and Business projects.
create function year_totals_with_thresholds(p_workspace uuid, p_year integer) returns jsonb
language sql stable as $$
  with t as (
    select (select amount_minor from tax_thresholds where tax_year = p_year and kind = 'FORM_1099_NEC') as nec,
           (select amount_minor from tax_thresholds where tax_year = p_year and kind = 'HOUSEHOLD_EMPLOYEE_FICA') as hh),
  paid as (
    select a.worker_id,
           -sum(l.signed_delta)::bigint as net_paid_minor,
           coalesce(-sum(l.signed_delta) filter (where p.project_use in ('RENTAL','BUSINESS')),0)::bigint as business_paid_minor,
           coalesce(-sum(l.signed_delta) filter (where p.project_use = 'PERSONAL_HOME'),0)::bigint as personal_paid_minor
    from ledger_events l
    join assignments a on a.id = l.assignment_id
    join projects p on p.id = a.project_id
    where l.workspace_id = p_workspace
      and l.event_type in ('PAYMENT','PAYMENT_REVERSAL')
      and extract(year from l.effective_date)::int = p_year
    group by a.worker_id)
  select jsonb_build_object(
    'year', p_year,
    'thresholds_known', (select nec is not null and hh is not null from t),
    'form_1099_nec_threshold_minor', (select nec from t),
    'household_threshold_minor', (select hh from t),
    'workers', coalesce((select jsonb_agg(jsonb_build_object(
        'worker_id', w.id, 'name', w.display_name,
        'net_paid_minor', pd.net_paid_minor,
        'business_paid_minor', pd.business_paid_minor,
        'personal_paid_minor', pd.personal_paid_minor,
        'at_or_over_1099', (select nec from t) is not null and pd.business_paid_minor >= (select nec from t),
        'near_household', (select hh from t) is not null and pd.personal_paid_minor * 5 >= (select hh from t) * 4)
      order by w.display_name)
      from paid pd join workers w on w.id = pd.worker_id and w.workspace_id = p_workspace
      where pd.net_paid_minor <> 0), '[]'::jsonb))
$$;

-- Growth counter bump (called by the public receipt page and the footer redirect).
create function bump_growth_counter(p_source text) returns void
language sql as $$
  insert into growth_counters (day, source, count) values ((now() at time zone 'UTC')::date, p_source, 1)
  on conflict (day, source) do update set count = growth_counters.count + 1
$$;

-- =====================================================================
-- Hardening for every SECURITY DEFINER function in this schema, including
-- the ones from 0001: pin search_path (so a caller's objects can't stand in
-- for ours) and remove the default EXECUTE grant to PUBLIC. The app's own
-- database role owns these functions, so it keeps access.
-- Call harden_definer_functions() again at the end of any later migration
-- that adds a SECURITY DEFINER function.
-- =====================================================================
create function harden_definer_functions() returns integer
language plpgsql as $$
declare f record; n int := 0;
begin
  for f in select p.oid::regprocedure as sig
           from pg_proc p where p.pronamespace = current_schema()::regnamespace and p.prosecdef
  loop
    execute format('alter function %s set search_path = %I, pg_temp', f.sig, current_schema());
    execute format('revoke execute on function %s from public', f.sig);
    n := n + 1;
  end loop;
  return n;
end $$;
select harden_definer_functions();
