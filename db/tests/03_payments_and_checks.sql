-- Check lifecycle, partial reversal caps, correction, clearance, idempotency on reversal.
do $$
declare ws uuid; p uuid; w1 uuid; w2 uuid; a1 uuid; a2 uuid; pay jsonb; pay2 jsonb; bal bigint; cl text;
        failed boolean; al1 uuid; al2 uuid; r jsonb; r2 jsonb; op uuid := gen_random_uuid(); st text;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'Chk') returning id into ws;
  insert into projects (workspace_id,name,timezone) values (ws,'P','UTC') returning id into p;
  insert into workers (workspace_id,display_name) values (ws,'W1') returning id into w1;
  insert into workers (workspace_id,display_name) values (ws,'W2') returning id into w2;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w1,'2026-01-01') returning id into a1;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w2,'2026-01-01') returning id into a2;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values
    (ws,a1,'2026-01-01','DAY',20000),(ws,a2,'2026-01-01','DAY',10000);
  perform record_work(ws,gen_random_uuid(),a1,'2026-09-01','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),a2,'2026-09-01','DAY_PORTION',1,null,0,null,null);

  -- T18 check lifecycle
  pay := record_payment(ws,gen_random_uuid(),'2026-09-02','CHECK',null,20000,'W1','1042',
         jsonb_build_array(jsonb_build_object('assignment_id',a1,'amount_minor',20000)));
  select clearance into cl from payments where id=(pay->>'payment_id')::uuid; assert cl='ISSUED';
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal=0, 'credited once on issue';
  perform set_check_cleared(ws,gen_random_uuid(),(pay->>'payment_id')::uuid,1);
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal=0, 'clear adds nothing';
  failed := false;
  begin perform set_check_cleared(ws,gen_random_uuid(),(pay->>'payment_id')::uuid,2);
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'cannot clear twice';
  perform reverse_payment(ws,gen_random_uuid(),(pay->>'payment_id')::uuid,'CHECK_RETURNED','returned',2,'2026-09-05');
  select clearance into cl from payments where id=(pay->>'payment_id')::uuid; assert cl='RETURNED';
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal=20000, 'return reverses';
  failed := false;
  begin perform reverse_payment(ws,gen_random_uuid(),(pay->>'payment_id')::uuid,'FULL','again',3,'2026-09-05');
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'T19 nothing left to reverse';

  -- T19 partial reversal capped per allocation
  pay2 := record_payment(ws,gen_random_uuid(),'2026-09-03','BANK_TRANSFER',null,15000,'Crew lead',null,
          jsonb_build_array(jsonb_build_object('assignment_id',a1,'amount_minor',10000),
                            jsonb_build_object('assignment_id',a2,'amount_minor',5000)));
  select id into al1 from allocations where payment_id=(pay2->>'payment_id')::uuid and assignment_id=a1;
  select id into al2 from allocations where payment_id=(pay2->>'payment_id')::uuid and assignment_id=a2;
  r := reverse_payment(ws,op,(pay2->>'payment_id')::uuid,'PARTIAL','refund part',1,'2026-09-04',
        jsonb_build_array(jsonb_build_object('allocation_id',al1,'amount_minor',4000)));
  assert (r->>'reversed_minor')::bigint = 4000 and (r->>'unreversed_minor')::bigint = 11000;
  r2 := reverse_payment(ws,op,(pay2->>'payment_id')::uuid,'PARTIAL','refund part',1,'2026-09-04',
        jsonb_build_array(jsonb_build_object('allocation_id',al1,'amount_minor',4000)));
  assert r2 = r, 'reversal idempotent';
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal = 20000-10000+4000, 'a1 after partial';
  failed := false;
  begin perform reverse_payment(ws,gen_random_uuid(),(pay2->>'payment_id')::uuid,'PARTIAL','too much',2,'2026-09-04',
        jsonb_build_array(jsonb_build_object('allocation_id',al1,'amount_minor',6001)));
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'partial over cap rejected';
  failed := false;
  begin perform reverse_payment(ws,gen_random_uuid(),(pay2->>'payment_id')::uuid,'PARTIAL','foreign line',2,'2026-09-04',
        jsonb_build_array(jsonb_build_object('allocation_id',gen_random_uuid(),'amount_minor',1)));
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'line from another payment rejected';

  -- correction: reverse remaining + new payment, one transaction, receipt superseded
  insert into receipts (workspace_id, payment_id, payment_version, snapshot) values (ws,(pay2->>'payment_id')::uuid,2,'{}');
  r := correct_payment(ws,gen_random_uuid(),(pay2->>'payment_id')::uuid,2,'2026-09-06','wrong split',
        '2026-09-03','BANK_TRANSFER',null,15000,'Crew lead',null,
        jsonb_build_array(jsonb_build_object('assignment_id',a1,'amount_minor',7000),
                          jsonb_build_object('assignment_id',a2,'amount_minor',8000)));
  select status into st from receipts where payment_id=(pay2->>'payment_id')::uuid; assert st='SUPERSEDED';
  assert (select replaces_payment_id from payments where id=(r->'payment'->>'payment_id')::uuid) = (pay2->>'payment_id')::uuid;
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal = 20000-7000, 'a1 after correction';
  select balance_minor into bal from assignment_balances where assignment_id=a2; assert bal = 10000-8000, 'a2 after correction';
  failed := false;
  begin perform correct_payment(ws,gen_random_uuid(),(pay2->>'payment_id')::uuid,2,'2026-09-06','x',
        '2026-09-03','CASH',null,100,'x',null,jsonb_build_array(jsonb_build_object('assignment_id',a1,'amount_minor',100)));
  exception when sqlstate '40001' then failed := true; end;
  assert failed, 'stale correction rejected';
  raise notice '03_payments_and_checks: PASS';
end $$;

do $$
declare ws uuid; p uuid; w uuid; a uuid; r jsonb;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'N') returning id into ws;
  insert into projects (workspace_id,name,timezone) values (ws,'P','UTC') returning id into p;
  insert into workers (workspace_id,display_name) values (ws,'W') returning id into w;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w,'2026-01-01') returning id into a;
  r := record_payment_with_note(ws, gen_random_uuid(), '2026-09-01','CASH',null,5000,'W',null,
         jsonb_build_array(jsonb_build_object('assignment_id',a,'amount_minor',5000)), 'paid at the site');
  assert (select note from payments where id=(r->>'payment_id')::uuid) = 'paid at the site';
  raise notice '03b_payment_note: PASS';
end $$;
