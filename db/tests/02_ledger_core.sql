-- Test: calculation vectors, the fictional ledger sequence, idempotency, constraints.
do $$
declare
  ws uuid; p uuid; wa uuid; wb uuid; wc uuid; aa uuid; ab uuid; ac uuid; r jsonb; r2 jsonb;
  pay1 jsonb; bal bigint; failed boolean;
begin
  -- vectors (Appendix B)
  assert fn_earned('DAY',24000,'DAY_PORTION',1,null,null) = 24000;
  assert fn_earned('DAY',24000,'DAY_PORTION',0.5,null,null) = 12000;
  assert fn_earned('DAY',18000,'DAY_PORTION',0.25,null,null) = 4500;
  assert fn_earned('DAY',24000,'DAY_MINUTES',null,180,480) = 9000;
  assert fn_earned('DAY',25000,'DAY_PORTION',0.3333,null,null) = 8333;
  assert fn_earned('DAY',24000,'NO_WORK',null,null,null) = 0;
  assert fn_earned('HOUR',3000,'HOUR_MINUTES',null,450,null) = 22500;
  assert fn_earned('HOUR',2750,'HOUR_MINUTES',null,80,null) = 3667;
  assert fn_earned('HOUR',2250,'HOUR_MINUTES',null,15,null) = 563;
  assert fn_earned('DAY',20000,'DAY_MINUTES',null,300,450) = 13333;
  failed := false;
  begin perform fn_earned('HOUR',3000,'DAY_PORTION',0.5,null,null); exception when others then failed := true; end;
  assert failed, 'hourly basis must reject day portion';

  insert into workspaces (owner_id, name) values (gen_random_uuid(), 'Test') returning id into ws;
  insert into projects (workspace_id, name, timezone) values (ws, 'Kitchen', 'America/New_York') returning id into p;
  insert into workers (workspace_id, display_name) values (ws,'A') returning id into wa;
  insert into workers (workspace_id, display_name) values (ws,'B') returning id into wb;
  insert into workers (workspace_id, display_name) values (ws,'C') returning id into wc;
  insert into assignments (workspace_id, project_id, worker_id, start_date) values (ws,p,wa,'2026-09-01') returning id into aa;
  insert into assignments (workspace_id, project_id, worker_id, start_date) values (ws,p,wb,'2026-09-01') returning id into ab;
  insert into assignments (workspace_id, project_id, worker_id, start_date) values (ws,p,wc,'2026-09-01') returning id into ac;
  insert into rate_agreements (workspace_id, assignment_id, effective_from, pay_basis, rate_minor) values
    (ws,aa,'2026-09-01','DAY',24000),(ws,ab,'2026-09-01','DAY',18000),(ws,ac,'2026-09-01','HOUR',3000);

  -- Fictional sequence (section 8)
  perform record_work(ws, gen_random_uuid(), aa, '2026-09-14','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws, gen_random_uuid(), ab, '2026-09-14','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws, gen_random_uuid(), aa, '2026-09-15','DAY_PORTION',0.5,null,0,null,null);
  select balance_minor into bal from assignment_balances where assignment_id = aa; assert bal = 36000, 'A 360';
  pay1 := record_payment(ws, '00000000-0000-0000-0000-000000000001', '2026-09-15','BANK_TRANSFER',null,30000,'Crew lead',null,
          jsonb_build_array(jsonb_build_object('assignment_id',aa,'amount_minor',20000),
                            jsonb_build_object('assignment_id',ab,'amount_minor',10000)));
  select balance_minor into bal from assignment_balances where assignment_id = aa; assert bal = 16000, 'A 160';
  select balance_minor into bal from assignment_balances where assignment_id = ab; assert bal = 8000, 'B 80';
  -- idempotent retry returns same result, no new ledger rows
  r2 := record_payment(ws, '00000000-0000-0000-0000-000000000001', '2026-09-15','BANK_TRANSFER',null,30000,'Crew lead',null,
          jsonb_build_array(jsonb_build_object('assignment_id',aa,'amount_minor',20000),
                            jsonb_build_object('assignment_id',ab,'amount_minor',10000)));
  assert r2 = pay1, 'idempotent';
  assert (select count(*) from payments) = 1, 'one payment';
  perform record_payment(ws, gen_random_uuid(), '2026-09-16','CASH',null,20000,'A',null,
          jsonb_build_array(jsonb_build_object('assignment_id',aa,'amount_minor',20000)));
  select balance_minor into bal from assignment_balances where assignment_id = aa; assert bal = -4000, 'A advance 40';
  perform reverse_payment(ws, gen_random_uuid(), (pay1->>'payment_id')::uuid, 'FULL', 'bank returned', 1, '2026-09-17');
  select balance_minor into bal from assignment_balances where assignment_id = aa; assert bal = 16000, 'A 160 after reversal';
  select balance_minor into bal from assignment_balances where assignment_id = ab; assert bal = 18000, 'B 180 after reversal';

  -- correction: full -> half posts the difference and keeps history
  r := record_work(ws, gen_random_uuid(), ab, '2026-09-14','DAY_PORTION',0.5,null,1,'left at noon',null);
  assert (r->>'delta_minor')::bigint = -9000;
  assert (select count(*) from work_revisions wr join work_entries we on we.id = wr.entry_id
          where we.assignment_id = ab) = 2;
  -- stale version rejected
  failed := false;
  begin perform record_work(ws, gen_random_uuid(), ab, '2026-09-14','DAY_PORTION',1,null,1,'x',null);
  exception when sqlstate '40001' then failed := true; end;
  assert failed, 'stale version';

  -- hourly worker
  r := record_work(ws, gen_random_uuid(), ac, '2026-09-14','HOUR_MINUTES',null,450,0,null,null);
  assert (r->>'earned_minor')::bigint = 22500;

  -- mismatched split rejected atomically
  failed := false;
  begin perform record_payment(ws, gen_random_uuid(), '2026-09-16','CASH',null,10000,'A',null,
          jsonb_build_array(jsonb_build_object('assignment_id',aa,'amount_minor',9000)));
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'split mismatch';

  -- ledger is append-only
  failed := false;
  begin delete from ledger_events; exception when others then failed := true; end;
  assert failed, 'append only';

  -- cross-workspace allocation rejected
  declare ws2 uuid; p2 uuid; w2 uuid; a2 uuid; begin
    insert into workspaces (owner_id, name) values (gen_random_uuid(), 'Other') returning id into ws2;
    insert into projects (workspace_id, name, timezone) values (ws2,'X','UTC') returning id into p2;
    insert into workers (workspace_id, display_name) values (ws2,'Z') returning id into w2;
    insert into assignments (workspace_id, project_id, worker_id, start_date) values (ws2,p2,w2,'2026-01-01') returning id into a2;
    failed := false;
    begin perform record_payment(ws, gen_random_uuid(), '2026-09-16','CASH',null,100,'Z',null,
          jsonb_build_array(jsonb_build_object('assignment_id',a2,'amount_minor',100)));
    exception when sqlstate '22023' then failed := true; end;
    assert failed, 'cross workspace';
    -- composite FK blocks mixing tenants at the table level too
    failed := false;
    begin insert into assignments (workspace_id, project_id, worker_id, start_date) values (ws, p2, wa, '2026-01-01');
    exception when foreign_key_violation then failed := true; end;
    assert failed, 'composite fk';
  end;

  raise notice '02_ledger_core: PASS';
end $$;
