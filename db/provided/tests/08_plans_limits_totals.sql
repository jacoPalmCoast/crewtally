-- Baseline 1.3: plan limits (Free / Project Pass / Pro), store events, lapse never locks records,
-- project use + tax thresholds on year-end totals, growth counter, deletion still works.
do $$
declare ws uuid; ws2 uuid; pa uuid; pb uuid; pc uuid; pd uuid; pp uuid; pp2 uuid;
        w uuid[] := '{}'; wid uuid; a1 uuid; ab uuid; ac uuid; r jsonb; failed boolean; i int; n int;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Plans') returning id into ws;
  for i in 1..8 loop
    insert into workers (workspace_id, display_name) values (ws, 'W'||i) returning id into wid;
    w := w || wid;
  end loop;

  -- ---------- Free: 1 active project ----------
  insert into projects (workspace_id,name,timezone) values (ws,'A','America/New_York') returning id into pa;
  failed := false;
  begin insert into projects (workspace_id,name,timezone) values (ws,'B','America/New_York');
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'free: second active project refused';
  update projects set status = 'ARCHIVED' where id = pa;
  insert into projects (workspace_id,name,timezone) values (ws,'B','America/New_York') returning id into pb;
  failed := false;
  begin update projects set status = 'ACTIVE' where id = pa;
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'free: reopening a second project refused';
  -- archived projects stay readable and editable in other fields
  update projects set name = 'A (done)' where id = pa;

  -- ---------- Free: 3 current workers ----------
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pb,w[1],'2026-09-01') returning id into a1;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pb,w[2],'2026-09-01');
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pb,w[3],'2026-09-01');
  failed := false;
  begin insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pb,w[4],'2026-09-01');
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'free: fourth current worker refused';
  -- an already-ended assignment (history) never counts
  insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws,pb,w[5],'2026-01-05','2026-01-09');
  -- ending a current assignment frees a slot
  update assignments set end_date = current_date - 1 where id = a1;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pb,w[4],'2026-09-01');
  r := plan_status(ws);
  assert (r->>'pro')::boolean = false and (r->>'free_active_projects')::int = 1 and (r->>'free_workers')::int = 3, 'plan status free';

  -- ---------- Project Pass ----------
  r := record_entitlement_event(ws,'evt-pass-1','PASS_PURCHASED','project_pass','txn-1',null,now());
  assert r->>'status' = 'recorded';
  r := record_entitlement_event(ws,'evt-pass-1','PASS_PURCHASED','project_pass','txn-1',null,now());
  assert r->>'status' = 'duplicate', 'store events idempotent';
  assert (select count(*) from project_passes where workspace_id = ws) = 1;
  select id into pp from project_passes where workspace_id = ws;
  assert jsonb_array_length(plan_status(ws)->'unused_passes') = 1;
  insert into projects (workspace_id,name,timezone,pass_id) values (ws,'C','America/New_York',pp) returning id into pc;
  assert jsonb_array_length(plan_status(ws)->'unused_passes') = 0;
  for i in 5..8 loop
    insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pc,w[i],'2026-09-01');
  end loop;  -- a pass project has no worker limit
  -- one pass covers one project
  update projects set status = 'ARCHIVED' where id = pb;
  failed := false;
  begin insert into projects (workspace_id,name,timezone,pass_id) values (ws,'C2','America/New_York',pp);
  exception when unique_violation then failed := true; end;
  assert failed, 'pass reused refused';
  update projects set status = 'ACTIVE' where id = pb;
  -- a pass from another workspace cannot be used
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Other') returning id into ws2;
  perform record_entitlement_event(ws2,'evt-other','PASS_PURCHASED','project_pass','txn-other',null,now());
  select id into pp2 from project_passes where workspace_id = ws2;
  failed := false;
  begin insert into projects (workspace_id,name,timezone,pass_id) values (ws,'Stolen','America/New_York',pp2);
  exception when sqlstate 'P0002' or foreign_key_violation then failed := true; end;
  assert failed, 'cross-workspace pass refused';

  -- refunded pass: existing work continues, new workers beyond the free limit are refused
  perform record_entitlement_event(ws,'evt-refund-1','PASS_REFUNDED','project_pass','txn-1',null,now());
  select id into ac from assignments where project_id = pc and worker_id = w[5];
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,ac,'2026-09-01','DAY',20000);
  perform record_work(ws,gen_random_uuid(),ac,'2026-09-02','DAY_PORTION',1,null,0,null,null);  -- still works
  failed := false;
  begin insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pc,w[3],'2026-09-01');
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'refunded pass: new worker over limit refused';

  -- ---------- Pro ----------
  perform record_entitlement_event(ws,'evt-pro-1','PRO_ACTIVE','pro_monthly',null, now() + interval '30 days', now());
  assert workspace_is_pro(ws);
  insert into projects (workspace_id,name,timezone,project_use) values (ws,'D','America/New_York','BUSINESS') returning id into pd;
  for i in 1..8 loop
    insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,pd,w[i],'2026-01-01');
  end loop;
  -- out-of-order: an older renewal never shortens the expiry
  perform record_entitlement_event(ws,'evt-pro-0','PRO_ACTIVE','pro_monthly',null, now() + interval '2 days', now() - interval '28 days');
  assert (select pro_expires_at from workspace_entitlements where workspace_id = ws) > now() + interval '20 days';
  -- an expiry notice for an earlier period does not end a renewed subscription
  perform record_entitlement_event(ws,'evt-exp-old','PRO_EXPIRED','pro_monthly',null, now() - interval '1 day', now());
  assert workspace_is_pro(ws), 'stale expiry ignored';
  -- lapse
  perform record_entitlement_event(ws,'evt-exp','PRO_EXPIRED','pro_monthly',null, now() + interval '31 days', now());
  assert not workspace_is_pro(ws);
  -- after lapse: records stay usable (work entry on an existing assignment) ...
  select id into ab from assignments where project_id = pd and worker_id = w[8];
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,ab,'2026-01-01','DAY',25000);
  perform record_work(ws,gen_random_uuid(),ab,'2026-09-03','DAY_PORTION',1,null,0,null,null);
  -- ... but new growth is limited
  failed := false;
  begin insert into projects (workspace_id,name,timezone) values (ws,'E','America/New_York');
  exception when sqlstate 'CT402' then failed := true; end;
  assert failed, 'lapsed: new free project refused';
  failed := false;
  begin perform record_entitlement_event(ws,'evt-bad','SOMETHING',null,null,null,now());
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown event type refused';

  -- ---------- year totals with thresholds ----------
  -- w8: $2,500 paid on a BUSINESS project in 2026 -> over the $2,000 1099 threshold
  perform record_work(ws,gen_random_uuid(),ab,d::date,'DAY_PORTION',1,null,0,null,null)
     from generate_series('2026-09-08'::date,'2026-09-17'::date,'1 day') d;
  perform record_payment(ws,gen_random_uuid(),'2026-09-18','CASH',null,250000,'W8',null,
          jsonb_build_array(jsonb_build_object('assignment_id',ab,'amount_minor',250000)));
  -- w5: $2,400 paid on the PERSONAL_HOME project C in 2026 -> near the $3,000 household figure (80%)
  perform record_work(ws,gen_random_uuid(),ac,d::date,'DAY_PORTION',1,null,0,null,null)
     from generate_series('2026-09-08'::date,'2026-09-19'::date,'1 day') d;
  perform record_payment(ws,gen_random_uuid(),'2026-09-20','CASH',null,240000,'W5',null,
          jsonb_build_array(jsonb_build_object('assignment_id',ac,'amount_minor',240000)));
  r := year_totals_with_thresholds(ws, 2026);
  assert (r->>'form_1099_nec_threshold_minor')::bigint = 200000, '2026 1099 threshold is $2,000';
  assert (r->>'household_threshold_minor')::bigint = 300000;
  assert (select (x->>'at_or_over_1099')::boolean from jsonb_array_elements(r->'workers') x where x->>'name' = 'W8');
  assert not (select (x->>'near_household')::boolean from jsonb_array_elements(r->'workers') x where x->>'name' = 'W8');
  assert (select (x->>'near_household')::boolean from jsonb_array_elements(r->'workers') x where x->>'name' = 'W5');
  assert not (select (x->>'at_or_over_1099')::boolean from jsonb_array_elements(r->'workers') x where x->>'name' = 'W5'),
    'personal-home payments never trigger 1099 wording';
  r := year_totals_with_thresholds(ws, 2031);
  assert (r->>'thresholds_known')::boolean = false, 'unknown year: no tax wording';
  assert (select (tax_year, amount_minor) = (2025, 60000) from tax_thresholds where tax_year = 2025 and kind = 'FORM_1099_NEC');

  -- ---------- growth counter ----------
  perform bump_growth_counter('RECEIPT_FOOTER_TAP'); perform bump_growth_counter('RECEIPT_FOOTER_TAP');
  assert (select count from growth_counters where day = current_date and source = 'RECEIPT_FOOTER_TAP') >= 2;

  -- ---------- account deletion still removes everything ----------
  r := delete_workspace_data(ws);
  assert not exists (select 1 from workspaces where id = ws);
  assert not exists (select 1 from project_passes where workspace_id = ws);
  assert not exists (select 1 from entitlement_events where workspace_id = ws);
  assert not exists (select 1 from workspace_entitlements where workspace_id = ws);
  assert exists (select 1 from project_passes where workspace_id = ws2), 'other workspace untouched';
  raise notice '08_plans_limits_totals: PASS';
end $$;
