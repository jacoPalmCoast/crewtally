-- Account deletion removes one workspace completely and nothing else; the ledger stays append-only elsewhere.
do $$
declare ws1 uuid; ws2 uuid; p uuid; w uuid; a uuid; failed boolean; n1 bigint; n2 bigint; ws uuid;
begin
  foreach ws in array array[gen_random_uuid(), gen_random_uuid()] loop
    insert into workspaces (id, owner_id, name) values (ws, gen_random_uuid(), 'D');
    insert into projects (workspace_id,name,timezone) values (ws,'P','UTC') returning id into p;
    insert into workers (workspace_id,display_name) values (ws,'W') returning id into w;
    insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w,'2026-01-01') returning id into a;
    insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,a,'2026-01-01','DAY',20000);
    perform record_work(ws,gen_random_uuid(),a,'2026-09-01','DAY_PORTION',1,null,0,null,null);
    perform record_payment(ws,gen_random_uuid(),'2026-09-02','CASH',null,5000,'W',null,
            jsonb_build_array(jsonb_build_object('assignment_id',a,'amount_minor',5000)));
    perform record_reimbursement(ws,gen_random_uuid(),a,'2026-09-02',1000,'Screws');
    if ws1 is null then ws1 := ws; else ws2 := ws; end if;
  end loop;
  select count(*) into n2 from ledger_events where workspace_id = ws2;

  -- ordinary delete of ledger rows still fails
  failed := false;
  begin delete from ledger_events where workspace_id = ws1; exception when others then failed := true; end;
  assert failed, 'ledger still append-only outside deletion';

  perform delete_workspace_data(ws1);
  assert not exists (select 1 from workspaces where id = ws1);
  assert not exists (select 1 from ledger_events where workspace_id = ws1);
  assert not exists (select 1 from payments where workspace_id = ws1);
  assert (select count(*) from ledger_events where workspace_id = ws2) = n2, 'other workspace untouched';
  assert exists (select 1 from payments where workspace_id = ws2);

  -- the flag does not leak: after the call, deleting ws2 ledger rows still fails
  failed := false;
  begin delete from ledger_events where workspace_id = ws2; exception when others then failed := true; end;
  assert failed, 'flag cleared after deletion';
  raise notice '05_account_deletion: PASS';
end $$;
