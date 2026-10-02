-- =====================================================================
-- 0005 — My crew: skills, favorites, private notes, per-project ratings,
--        and a crew summary view.                  Baseline 1.4 (was 0004; renumbered in baseline 2.0), Phase 2.
-- Additive only. Loaded after 0004_plans_and_project_use.sql.
-- Nothing here touches money. Ratings and notes are private to the owner:
-- they never appear on receipts, statements, share links or worker exports.
-- =====================================================================

-- Skills: short labels, at most 12 per worker, each 1–30 characters, no duplicates.
create function skills_valid(p text[]) returns boolean language sql immutable as $$
  select p is not null
     and cardinality(p) <= 12
     and not exists (select 1 from unnest(p) s where s is null or length(trim(s)) not between 1 and 30 or s <> trim(s))
     and cardinality(p) = (select count(distinct lower(s)) from unnest(p) s)
$$;

alter table workers
  add column favorite     boolean not null default false,
  add column skills       text[]  not null default '{}' check (skills_valid(skills)),
  add column private_note text    check (length(private_note) <= 500);

-- One rating per assignment (a worker on a project). Updating it replaces the rating.
create table worker_ratings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  assignment_id uuid not null,
  stars         smallint not null check (stars between 1 and 5),
  would_hire    text not null check (would_hire in ('YES','MAYBE','NO')),
  note          text check (length(note) <= 500),
  rated_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id),
  unique (workspace_id, id),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id) on delete cascade
);

-- Rate (or re-rate) a worker on a project. Not money: no ledger effect.
create function rate_assignment(p_workspace uuid, p_assignment uuid, p_stars smallint,
                                p_would_hire text, p_note text) returns jsonb
language plpgsql security definer as $$
declare v worker_ratings;
begin
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'stars must be 1 to 5' using errcode = '22023'; end if;
  if p_would_hire is null or p_would_hire not in ('YES','MAYBE','NO') then
    raise exception 'would_hire must be YES, MAYBE or NO' using errcode = '22023'; end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22023'; end if;
  -- clock_timestamp so two ratings in one transaction still order correctly
  insert into worker_ratings (workspace_id, assignment_id, stars, would_hire, note, updated_at)
    values (p_workspace, p_assignment, p_stars, p_would_hire, nullif(trim(p_note), ''), clock_timestamp())
  on conflict (assignment_id) do update
    set stars = excluded.stars, would_hire = excluded.would_hire, note = excluded.note, updated_at = clock_timestamp()
  returning * into v;
  return jsonb_build_object('id', v.id, 'stars', v.stars, 'would_hire', v.would_hire);
end $$;

-- Crew summary for ONE workspace: one row per worker, everything the My crew list and
-- worker detail need. A function (not a view) so every step is filtered by workspace first.
-- days_worked counts active entries that are real work (not No work, not cleared).
create index share_links_ws_worker on share_links (workspace_id, view_worker_id);

create function crew_summary(p_workspace uuid)
returns table (worker_id uuid, display_name text, status text, favorite boolean, skills text[],
               projects_count int, days_worked int, last_worked date, working_now boolean,
               rating_avg numeric, rating_count int, latest_would_hire text,
               receipts_texted int, receipts_confirmed int)
language sql stable as $$
  with ws_assign as (
    select a.id, a.worker_id, a.project_id, a.end_date, p.status as project_status, p.timezone
    from assignments a join projects p on p.id = a.project_id
    where a.workspace_id = p_workspace),
  entries as (
    select wa.worker_id, e.work_date
    from ws_assign wa
    join work_entries e on e.assignment_id = wa.id
    join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
    where r.input_mode not in ('NO_WORK','VOID')),
  work as (
    select worker_id, count(*)::int as days_worked, max(work_date) as last_worked
    from entries group by worker_id),
  assign as (
    select worker_id, count(distinct project_id)::int as projects_count,
           bool_or(project_status = 'ACTIVE'
                   and (end_date is null or end_date >= (now() at time zone timezone)::date)) as working_now
    from ws_assign group by worker_id),
  ratings as (
    select wa.worker_id,
           round(avg(wr.stars)::numeric, 1) as rating_avg,
           count(*)::int as rating_count,
           (array_agg(wr.would_hire order by wr.updated_at desc))[1] as latest_would_hire
    from worker_ratings wr join ws_assign wa on wa.id = wr.assignment_id
    where wr.workspace_id = p_workspace
    group by wa.worker_id),
  links as (
    select sl.view_worker_id as worker_id,
           count(distinct sl.id)::int as receipts_texted,
           count(ak.id)::int as receipts_confirmed
    from share_links sl
    left join acknowledgments ak on ak.share_link_id = sl.id and ak.kind = 'RECEIVED'
    where sl.workspace_id = p_workspace and sl.target_type = 'RECEIPT'
    group by sl.view_worker_id)
  select w.id, w.display_name, w.status, w.favorite, w.skills,
         coalesce(asg.projects_count, 0), coalesce(wk.days_worked, 0), wk.last_worked,
         coalesce(asg.working_now, false),
         r.rating_avg, coalesce(r.rating_count, 0), r.latest_would_hire,
         coalesce(l.receipts_texted, 0), coalesce(l.receipts_confirmed, 0)
  from workers w
  left join assign asg on asg.worker_id = w.id
  left join work wk on wk.worker_id = w.id
  left join ratings r on r.worker_id = w.id
  left join links l on l.worker_id = w.id
  where w.workspace_id = p_workspace
$$;

-- Last rate used for a worker, to prefill "Add to a project".
create function worker_last_rate(p_workspace uuid, p_worker uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('project_id', a.project_id, 'pay_basis', ra.pay_basis,
                            'rate_minor', ra.rate_minor, 'standard_day_minutes', ra.standard_day_minutes,
                            'effective_from', ra.effective_from)
  from rate_agreements ra join assignments a on a.id = ra.assignment_id
  where a.workspace_id = p_workspace and a.worker_id = p_worker
  order by ra.effective_from desc, ra.created_at desc
  limit 1
$$;

-- Pin search_path and remove PUBLIC execute on the new SECURITY DEFINER function(s).
select harden_definer_functions();
