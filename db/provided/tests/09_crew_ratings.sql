-- Baseline 1.4: skills, favorites, private notes, ratings, crew summary, last rate, deletion.
do $$
declare ws uuid; ws2 uuid; p1 uuid; p2 uuid; wm uuid; wj uuid; a1 uuid; a2 uuid; aj uuid; r jsonb; s record; failed boolean;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Crew') returning id into ws;
  perform record_entitlement_event(ws,'test-pro-crew','PRO_ACTIVE','pro_annual',null, now() + interval '1 year', now());
  insert into projects (workspace_id,name,timezone) values (ws,'Bathroom tile','America/New_York') returning id into p1;
  insert into projects (workspace_id,name,timezone) values (ws,'Kitchen remodel','America/New_York') returning id into p2;
  insert into workers (workspace_id,display_name,skills,favorite,private_note)
    values (ws,'Marco Reyes','{Tile,Carpentry}',true,'Clean tile cuts') returning id into wm;
  insert into workers (workspace_id,display_name,skills) values (ws,'Jorge Medina','{Roofing}') returning id into wj;

  -- skills validation
  failed := false; begin update workers set skills = '{Tile,tile}' where id = wm; exception when check_violation then failed := true; end;
  assert failed, 'duplicate skills refused (case-insensitive)';
  failed := false; begin update workers set skills = '{" Tile"}' where id = wm; exception when check_violation then failed := true; end;
  assert failed, 'untrimmed skill refused';
  failed := false; begin update workers set skills = array_fill('x'::text, array[13]) where id = wm; exception when check_violation then failed := true; end;
  assert failed, 'more than 12 skills refused';
  failed := false; begin update workers set private_note = repeat('x', 501) where id = wm; exception when check_violation then failed := true; end;
  assert failed, 'note over 500 refused';

  insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws,p1,wm,'2026-03-02','2026-03-27') returning id into a1;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p2,wm,'2026-09-14') returning id into a2;
  insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws,p1,wj,'2026-03-02','2026-03-06') returning id into aj;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values
    (ws,a1,'2026-03-02','DAY',24000),(ws,a2,'2026-09-14','DAY',26000),(ws,aj,'2026-03-02','DAY',20000);
  perform record_work(ws,gen_random_uuid(),a1,'2026-03-02','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),a1,'2026-03-03','DAY_PORTION',0.5,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),a1,'2026-03-04','NO_WORK',null,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),a2,'2026-09-15','DAY_PORTION',1,null,0,null,null);

  -- ratings
  r := rate_assignment(ws, a1, 5::smallint, 'YES', 'Great tile work');
  assert (r->>'stars')::int = 5;
  r := rate_assignment(ws, a2, 4::smallint, 'YES', null);
  r := rate_assignment(ws, a2, 4::smallint, 'MAYBE', '  ');   -- re-rate replaces, blank note becomes null
  assert (select count(*) from worker_ratings where assignment_id = a2) = 1, 'one rating per assignment';
  assert (select note from worker_ratings where assignment_id = a2) is null;
  failed := false; begin perform rate_assignment(ws, a1, 6::smallint, 'YES', null); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'stars over 5 refused';
  failed := false; begin perform rate_assignment(ws, a1, 3::smallint, 'SURE', null); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'bad would_hire refused';
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Other') returning id into ws2;
  failed := false; begin perform rate_assignment(ws2, a1, 3::smallint, 'YES', null); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'cross-workspace rating refused';

  -- crew summary
  select * into s from crew_summary(ws) where worker_id = wm;
  assert s.favorite and s.skills = '{Tile,Carpentry}';
  assert s.projects_count = 2, 'two projects';
  assert s.days_worked = 3, 'no-work day not counted';
  assert s.last_worked = '2026-09-15';
  assert s.working_now, 'current assignment on active project';
  assert s.rating_avg = 4.5 and s.rating_count = 2 and s.latest_would_hire = 'MAYBE';
  select * into s from crew_summary(ws) where worker_id = wj;
  assert not s.working_now and s.rating_count = 0 and s.days_worked = 0, 'past worker';
  -- a worker with no assignments still appears
  insert into workers (workspace_id,display_name) values (ws,'Saved only');
  assert exists (select 1 from crew_summary(ws) where display_name = 'Saved only' and not working_now and projects_count = 0);
  assert not exists (select 1 from crew_summary(ws2)), 'other workspace sees no crew';

  -- saved and past workers never count toward the free worker limit
  -- (the 0003 trigger counts only current assignments on free projects; nothing here changes that)

  -- last rate for prefill
  r := worker_last_rate(ws, wm);
  assert (r->>'rate_minor')::bigint = 26000 and (r->>'project_id')::uuid = p2;
  assert worker_last_rate(ws2, wm) is null, 'other workspace sees nothing';

  -- ratings never leak into receipts: receipts/statements are snapshots built without them (checked in app tests);
  -- here: deletion removes ratings with everything else
  r := delete_workspace_data(ws);
  assert not exists (select 1 from worker_ratings where workspace_id = ws);
  assert not exists (select 1 from workers where workspace_id = ws);
  raise notice '09_crew_ratings: PASS';
end $$;
