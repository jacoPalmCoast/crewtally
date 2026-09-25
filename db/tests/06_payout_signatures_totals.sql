-- Pay what's owed (all or nothing), hand-over signatures, totals views, worker language.
do $$
declare ws uuid; p uuid; wm uuid; wd uuid; am uuid; ad uuid; r jsonb; r2 jsonb; op uuid := gen_random_uuid();
        bal bigint; failed boolean; pm uuid; ev uuid; n int; t record; ws2 uuid;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'P') returning id into ws;
  insert into projects (workspace_id,name,timezone) values (ws,'Kitchen','America/New_York') returning id into p;
  insert into workers (workspace_id,display_name,document_language) values (ws,'Marco','es') returning id into wm;
  insert into workers (workspace_id,display_name) values (ws,'Dee') returning id into wd;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,wm,'2026-09-14') returning id into am;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,wd,'2026-09-14') returning id into ad;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values
    (ws,am,'2026-09-14','DAY',24000),(ws,ad,'2026-09-14','DAY',18000);
  perform record_work(ws,gen_random_uuid(),am,'2026-09-24','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),ad,'2026-09-24','DAY_PORTION',1,null,0,null,null);
  failed := false;
  begin insert into workers (workspace_id,display_name,document_language) values (ws,'X','fr');
  exception when check_violation then failed := true; end;
  assert failed, 'only en/es';

  -- payout: two payments, one per worker, separate receipt numbers
  r := record_payout(ws, op, '2026-09-24', jsonb_build_array(
        jsonb_build_object('assignment_id',am,'amount_minor',24000,'method','CASH','recipient_label','Marco'),
        jsonb_build_object('assignment_id',ad,'amount_minor',18000,'method','ZELLE','recipient_label','Dee')));
  assert jsonb_array_length(r->'payments') = 2;
  assert (r->'payments'->0->>'receipt_no') <> (r->'payments'->1->>'receipt_no'), 'separate receipts';
  select balance_minor into bal from assignment_balances where assignment_id=am; assert bal = 0;
  select balance_minor into bal from assignment_balances where assignment_id=ad; assert bal = 0;
  r2 := record_payout(ws, op, '2026-09-24', jsonb_build_array(
        jsonb_build_object('assignment_id',am,'amount_minor',24000,'method','CASH','recipient_label','Marco'),
        jsonb_build_object('assignment_id',ad,'amount_minor',18000,'method','ZELLE','recipient_label','Dee')));
  assert r2 = r, 'payout idempotent';
  assert (select count(*) from payments where workspace_id = ws) = 2, 'no double payout';

  -- all or nothing: a bad line (OTHER without note) records nothing
  n := (select count(*) from payments where workspace_id = ws);
  failed := false;
  begin perform record_payout(ws, gen_random_uuid(), '2026-09-25', jsonb_build_array(
        jsonb_build_object('assignment_id',am,'amount_minor',1000,'method','CASH','recipient_label','Marco'),
        jsonb_build_object('assignment_id',ad,'amount_minor',1000,'method','OTHER','recipient_label','Dee')));
  exception when others then failed := true; end;
  assert failed and (select count(*) from payments where workspace_id = ws) = n, 'payout atomic';
  failed := false;
  begin perform record_payout(ws, gen_random_uuid(), '2026-09-25', jsonb_build_array(
        jsonb_build_object('assignment_id',am,'amount_minor',1000,'method','CASH','recipient_label','M'),
        jsonb_build_object('assignment_id',am,'amount_minor',1000,'method','CASH','recipient_label','M')));
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'same assignment twice rejected';

  -- signature
  pm := (r->'payments'->0->>'payment_id')::uuid;
  insert into receipts (workspace_id, payment_id, payment_version, snapshot) values (ws, pm, 1, '{}');
  insert into evidence (workspace_id,parent_type,parent_id,object_key,sha256,content_type,byte_size)
    values (ws,'PAYMENT',pm,'k','\x00','image/png',1200) returning id into ev;
  failed := false;
  begin perform record_handover_signature(ws, gen_random_uuid(), pm, wd, 'Dee', ev, 'en', 'x');
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'worker not on payment';
  r := record_handover_signature(ws, gen_random_uuid(), pm, wm, 'Marco Reyes', ev, 'es',
        'Recibí $240.00 en efectivo de Rivera household por Kitchen remodel.');
  assert (r->>'amount_minor')::bigint = 24000 and (r->>'payment_version')::int = 2;
  assert (select status from receipts where payment_id = pm) = 'SUPERSEDED';
  select balance_minor into bal from assignment_balances where assignment_id=am; assert bal = 0, 'signature has no money effect';
  failed := false;
  begin perform record_handover_signature(ws, gen_random_uuid(), pm, wm, 'Marco Reyes', ev, 'es', 'again');
  exception when unique_violation then failed := true; end;
  assert failed, 'one signature per worker per payment';

  -- totals views tie to balances
  perform record_reimbursement(ws, gen_random_uuid(), am, '2026-09-24', 4000, 'Screws');
  perform record_adjustment(ws, gen_random_uuid(), am, '2026-09-24', 'DECREASE_OWED', 'DEDUCTION', 500, 'Tile');
  select * into t from assignment_totals where assignment_id = am;
  assert t.earned_minor = 24000 and t.reimbursed_minor = 4000 and t.taken_off_minor = 500 and t.paid_minor = 24000;
  assert t.earned_minor + t.reimbursed_minor + t.added_minor - t.taken_off_minor - t.paid_minor + t.reversed_minor = t.balance_minor, 'totals tie';
  assert (select net_paid_minor from worker_year_paid where worker_id = wm and year = 2026) = 24000;
  perform delete_workspace_data(ws);
  assert not exists (select 1 from payment_signatures where workspace_id = ws), 'deletion covers signatures';
  raise notice '06_payout_signatures_totals: PASS';
end $$;
