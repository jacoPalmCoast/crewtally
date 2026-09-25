-- Independent review fixes (25 Sep 2026): plan-limit gaps, store-event edge cases,
-- project time zones, and SECURITY DEFINER hardening.
do $$
declare ws uuid; ws2 uuid; ws3 uuid; ws4 uuid; ws5 uuid; pt uuid; ph uuid; po uuid; p uuid; q uuid; r2 uuid; pp uuid; w uuid[] := '{}'; wid uuid; a4 uuid; a5 uuid; tz text := 'Pacific/Pago_Pago';
        r jsonb; failed boolean; i int; loc date;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Review') returning id into ws;
  for i in 1..8 loop insert into workers (workspace_id, display_name) values (ws, 'R'||i) returning id into wid; w := w || wid; end loop;

  -- 1. "Already ended" 4th worker: saved as a record, flagged, and no new work can go on it while Free.
  insert into projects (workspace_id,name,timezone) values (ws,'P','America/New_York') returning id into p;
  for i in 1..3 loop insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w[i],'2026-09-01'); end loop;
  insert into assignments (workspace_id,project_id,worker_id,start_date,end_date)
    values (ws,p,w[4],'2026-09-01', project_today(p) - 1) returning id into a4;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,a4,'2026-09-01','DAY',20000);
  failed := false;
  begin perform record_work(ws,gen_random_uuid(),a4, project_today(p) - 1,'DAY_PORTION',1,null,0,null,null);
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'no paid work for a 4th worker while 3 are current (Free)';

  -- 2. Project time zone decides "current": an assignment ending on the project's local today is current.
  update projects set status = 'ARCHIVED' where id = p;
  insert into projects (workspace_id,name,timezone) values (ws,'TZ',tz) returning id into q;
  loc := (now() at time zone tz)::date;
  for i in 1..3 loop insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,q,w[i], loc - 5); end loop;
  failed := false;
  begin insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws,q,w[5], loc - 5, loc);
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'ending on local today still counts as current';

  -- 3. Reopening a project brings its workers back into the Free count.
  perform record_entitlement_event(ws,'h-pro','PRO_ACTIVE','pro_annual',null, now() + interval '1 day', now());
  update projects set status = 'ARCHIVED' where id = q;
  insert into projects (workspace_id,name,timezone) values (ws,'Big','America/New_York') returning id into r2;
  for i in 1..6 loop insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,r2,w[i],'2026-09-01'); end loop;
  update projects set status = 'ARCHIVED' where id = r2;
  perform record_entitlement_event(ws,'h-pro-end','PRO_EXPIRED','pro_annual',null, null, now());   -- no expiry = ends now
  assert not workspace_is_pro(ws), 'refund or revoke ends Pro now';
  failed := false;
  begin update projects set status = 'ACTIVE' where id = r2;
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'reopening a 6-worker project on Free refused';

  -- 4. A pass stays with its project.
  perform record_entitlement_event(ws,'h-pass','PASS_PURCHASED','project_pass','h-txn',null,now());
  select id into pp from project_passes where transaction_id = 'h-txn';
  update projects set pass_id = pp, status = 'ACTIVE' where id = r2;          -- reopen with the pass: allowed
  update projects set status = 'ARCHIVED' where id = r2;
  failed := false;
  begin update projects set pass_id = null where id = r2; exception when sqlstate '22023' then failed := true; end;
  assert failed, 'pass cannot be removed from its project';

  -- 5. Refund notice before purchase notice leaves a refunded pass, not a live one.
  perform record_entitlement_event(ws,'h-ref-first','PASS_REFUNDED','project_pass','h-txn2',null,now());
  perform record_entitlement_event(ws,'h-buy-late','PASS_PURCHASED','project_pass','h-txn2',null,now());
  assert (select refunded_at is not null from project_passes where transaction_id = 'h-txn2'), 'refund before purchase honored';
  assert not exists (select 1 from jsonb_array_elements(plan_status(ws)->'unused_passes') x
                     where (x->>'id')::uuid = (select id from project_passes where transaction_id = 'h-txn2'));

  -- 6. A transaction id can't be claimed by another workspace.
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Other') returning id into ws2;
  failed := false;
  begin perform record_entitlement_event(ws2,'h-steal','PASS_PURCHASED','project_pass','h-txn',null,now());
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'cross-workspace transaction refused';

  -- 7. Event ids: exact repeat is a duplicate; same id with different details is refused.
  r := record_entitlement_event(ws,'h-pass','PASS_PURCHASED','project_pass','h-txn',null,now());
  assert r->>'status' = 'duplicate';
  failed := false;
  begin perform record_entitlement_event(ws2,'h-pass','PRO_ACTIVE','pro_monthly',null,now() + interval '1 day',now());
  exception when sqlstate '23505' then failed := true; end;
  assert failed, 'event id reused with different details refused';

  -- 8. No-expiry (comp or lifetime) Pro keeps "never expires".
  perform record_entitlement_event(ws2,'h-comp','PRO_ACTIVE',null,null,null,now(),'COMP');
  perform record_entitlement_event(ws2,'h-renew','PRO_ACTIVE','pro_monthly',null,now() + interval '1 day',now());
  assert (select pro_expires_at is null and source = 'COMP' from workspace_entitlements where workspace_id = ws2), 'comp kept';
  perform record_entitlement_event(ws2,'h-dated-exp','PRO_EXPIRED','pro_monthly',null,now() + interval '1 day',now());
  assert workspace_is_pro(ws2), 'dated expiry notice does not end a comp plan';
  failed := false;
  begin perform record_entitlement_event(ws2,'h-badsrc','PRO_ACTIVE',null,null,null,now(),'GIFT');
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown source refused';

  -- 9. Hardening: every SECURITY DEFINER function pins search_path and has no PUBLIC execute.
  assert not exists (
    select 1 from pg_proc p
    where p.pronamespace = current_schema()::regnamespace and p.prosecdef
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))), 'search_path pinned';
  assert not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
    where p.pronamespace = current_schema()::regnamespace and p.prosecdef
      and x.grantee = 0 and x.privilege_type = 'EXECUTE'), 'no PUBLIC execute on definer functions';


  -- 10. Ended-history tricks with no current workers: only 3 workers can be paid in 30 days.
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Trick') returning id into ws3;
  insert into projects (workspace_id,name,timezone) values (ws3,'T','America/New_York') returning id into pt;
  for i in 1..5 loop
    insert into workers (workspace_id, display_name) values (ws3, 'T'||i) returning id into wid;
    insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws3,pt,wid,'2026-09-01', project_today(pt) - 1) returning id into a5;
    insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws3,a5,'2026-09-01','DAY',20000);
    begin
      perform record_work(ws3,gen_random_uuid(),a5, project_today(pt) - 1,'DAY_PORTION',1,null,0,null,null);
      if i > 3 then raise exception 'worker % should have been refused', i; end if;
    exception when sqlstate 'CT402' then
      if i <= 3 then raise exception 'worker % refused too early', i; end if;
    end;
  end loop;
  -- "No work" is always allowed, so marking rest never fails because of the limit
  perform record_work(ws3,gen_random_uuid(),a5, project_today(pt) - 1,'NO_WORK',null,null,0,null,null);
  -- moving an ended assignment's end date later doesn't open a slot for paid work
  update assignments set end_date = project_today(pt) where id = a5;
  failed := false;
  begin perform record_work(ws3,gen_random_uuid(),a5, project_today(pt),'DAY_PORTION',1,null,0,null,null);
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'extended end date still limited';
  -- the flag column can't be set by hand
  update assignments set created_with_full_access = true where id = a5;
  assert not (select created_with_full_access from assignments where id = a5), 'full-access flag set only at insert';
  -- old history holds no slot: 3 workers saved as last year's history, then a current worker is fine
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'History') returning id into ws4;
  insert into projects (workspace_id,name,timezone) values (ws4,'H','America/New_York') returning id into ph;
  for i in 1..3 loop
    insert into workers (workspace_id, display_name) values (ws4, 'H'||i) returning id into wid;
    insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws4,ph,wid,'2025-06-02','2025-06-20');
  end loop;
  insert into workers (workspace_id, display_name) values (ws4, 'Now') returning id into wid;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws4,ph,wid, project_today(ph));
  assert (plan_status(ws4)->>'free_workers')::int = 1, 'history holds no slot';
  perform delete_workspace_data(ws4);

  -- 11. A refunded pass doesn't stop reopening its project on Pro.
  perform record_entitlement_event(ws,'h-ref-live','PASS_REFUNDED','project_pass','h-txn',null,now());
  perform record_entitlement_event(ws,'h-pro2','PRO_ACTIVE','pro_annual',null, now() + interval '1 day', now());
  update projects set status = 'ACTIVE' where id = r2;
  assert (select status from projects where id = r2) = 'ACTIVE', 'reopen on Pro with a refunded pass';

  -- 12. Unknown time zones are refused.
  failed := false;
  begin insert into projects (workspace_id,name,timezone) values (ws,'Bad','Mars/Base'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown time zone refused';

  -- 13. A comp plan isn't ended by a store refund notice.
  perform record_entitlement_event(ws2,'h-comp-refund','PRO_EXPIRED',null,null,null,now());
  assert workspace_is_pro(ws2), 'comp survives a store refund notice';

  perform delete_workspace_data(ws3);

  -- 14. Corrections of old paid days are never limited; a missed old day is judged by who was paid then.
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Old') returning id into ws5;
  insert into projects (workspace_id,name,timezone) values (ws5,'O','America/New_York') returning id into po;
  for i in 1..3 loop
    insert into workers (workspace_id, display_name) values (ws5, 'O'||i) returning id into wid;
    insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws5,po,wid, project_today(po) - 60, project_today(po) - 50) returning id into a5;
    insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws5,a5, project_today(po) - 60,'DAY',20000);
    perform record_work(ws5,gen_random_uuid(),a5, project_today(po) - 55,'DAY_PORTION',1,null,0,null,null);
  end loop;
  for i in 4..6 loop
    insert into workers (workspace_id, display_name) values (ws5, 'O'||i) returning id into wid;
    insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws5,po,wid, project_today(po));
  end loop;
  perform record_work(ws5,gen_random_uuid(),a5, project_today(po) - 55,'DAY_PORTION',0.5,null,1,'left early',null);  -- correction
  perform record_work(ws5,gen_random_uuid(),a5, project_today(po) - 54,'DAY_PORTION',1,null,0,null,null);             -- missed old day
  -- an assignment can't be handed to another worker
  failed := false;
  begin update assignments set worker_id = wid where id = a5; exception when sqlstate '22023' then failed := true; end;
  assert failed, 'assignment worker fixed';
  perform delete_workspace_data(ws5);

  perform delete_workspace_data(ws); perform delete_workspace_data(ws2);
  raise notice '10_plan_hardening: PASS';
end $$;
-- Plan rules refuse to run outside READ COMMITTED (the per-workspace lock only protects that level).
begin isolation level repeatable read;
do $$
declare ok boolean := false; ws uuid;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'RR') returning id into ws;
  begin insert into projects (workspace_id,name,timezone) values (ws,'X','UTC');
  exception when sqlstate '25001' then ok := true; end;
  assert ok, 'repeatable read refused';
  raise notice '10_plan_hardening isolation: PASS';
end $$;
rollback;
