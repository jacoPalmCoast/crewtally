-- Reimbursements, adjustments, mark rest as no work, rate changes (preview + all-or-nothing).
do $$
declare ws uuid; p uuid; w1 uuid; w2 uuid; w3 uuid; w4 uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid;
        bal bigint; r jsonb; pv jsonb; failed boolean; n integer;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'R') returning id into ws;
  insert into projects (workspace_id,name,timezone) values (ws,'P','UTC') returning id into p;
  insert into workers (workspace_id,display_name) values (ws,'A') returning id into w1;
  insert into workers (workspace_id,display_name) values (ws,'B') returning id into w2;
  insert into workers (workspace_id,display_name) values (ws,'C') returning id into w3;
  insert into workers (workspace_id,display_name) values (ws,'D') returning id into w4;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w1,'2026-09-01') returning id into a1;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w2,'2026-09-01') returning id into a2;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w3,'2026-09-01') returning id into a3;
  insert into assignments (workspace_id,project_id,worker_id,start_date,end_date) values (ws,p,w4,'2026-09-01','2026-09-10') returning id into a4;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor,standard_day_minutes) values
    (ws,a1,'2026-09-01','DAY',24000,480),(ws,a2,'2026-09-01','DAY',18000,null),(ws,a3,'2026-09-01','HOUR',3000,null),
    (ws,a4,'2026-09-01','DAY',15000,null);

  -- T21 reimbursement increases owed, reported apart
  perform record_reimbursement(ws,gen_random_uuid(),a1,'2026-09-02',4000,'Drywall screws');
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal=4000;
  failed := false;
  begin perform record_reimbursement(ws,gen_random_uuid(),a1,'2026-09-02',4000,'  ');
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'description required';

  -- adjustments both directions
  perform record_adjustment(ws,gen_random_uuid(),a1,'2026-09-02','INCREASE_OWED','OPENING_BALANCE',50000,'Owed before app');
  perform record_adjustment(ws,gen_random_uuid(),a1,'2026-09-02','DECREASE_OWED','DEDUCTION',1000,'Broken tile');
  select balance_minor into bal from assignment_balances where assignment_id=a1; assert bal=4000+50000-1000;

  -- T08 mark rest: only unrecorded, active, with agreement
  perform record_work(ws,gen_random_uuid(),a1,'2026-09-14','DAY_PORTION',1,null,0,null,null);
  r := mark_rest_no_work(ws,gen_random_uuid(),p,'2026-09-14');
  assert (r->>'marked')::int = 2, 'B and C marked; A recorded; D ended';
  assert (select r2.input_mode from work_entries e join work_revisions r2 on r2.entry_id=e.id and r2.revision=e.active_revision
          where e.assignment_id=a1 and e.work_date='2026-09-14') = 'DAY_PORTION', 'A untouched';
  r := mark_rest_no_work(ws,gen_random_uuid(),p,'2026-09-14');
  assert (r->>'marked')::int = 0, 'second run marks nobody';
  -- VOID counts as unrecorded again
  perform record_work(ws,gen_random_uuid(),a1,'2026-09-14','VOID',null,null,1,'entered wrong day',null);
  r := mark_rest_no_work(ws,gen_random_uuid(),p,'2026-09-14');
  assert (r->>'marked')::int = 1, 'voided entry becomes unrecorded';

  -- T12 backdated rate change: preview, confirmation required, apply all-or-nothing
  perform record_work(ws,gen_random_uuid(),a2,'2026-09-15','DAY_PORTION',1,null,0,null,null);
  perform record_work(ws,gen_random_uuid(),a2,'2026-09-16','DAY_PORTION',0.5,null,0,null,null);
  pv := preview_rate_change(ws,a2,'2026-09-15','DAY',20000,null);
  assert jsonb_array_length(pv->'affected') = 2 and (pv->>'total_delta_minor')::bigint = 2000+1000, 'preview';
  failed := false;
  begin perform apply_rate_change(ws,gen_random_uuid(),a2,'2026-09-15','DAY',20000,null,'raise',false);
  exception when sqlstate '55000' then failed := true; end;
  assert failed, 'confirmation required';
  select balance_minor into bal from assignment_balances where assignment_id=a2; assert bal = 18000+9000, 'nothing changed before confirm';
  r := apply_rate_change(ws,gen_random_uuid(),a2,'2026-09-15','DAY',20000,null,'raise agreed',true);
  assert (r->>'corrected_days')::int = 2;
  select balance_minor into bal from assignment_balances where assignment_id=a2; assert bal = 20000+10000, 'all days at new rate';
  -- future-dated change with no affected days needs no confirmation
  r := apply_rate_change(ws,gen_random_uuid(),a2,'2026-10-01','DAY',21000,null,null,false);
  assert (r->>'corrected_days')::int = 0;
  -- a later agreement bounds the range: backdating to 09-16 only touches 09-16
  pv := preview_rate_change(ws,a2,'2026-09-16','DAY',22000,null);
  assert jsonb_array_length(pv->'affected') = 1;

  -- T13 basis change blocked over recorded work
  perform record_work(ws,gen_random_uuid(),a3,'2026-09-15','HOUR_MINUTES',null,480,0,null,null);
  failed := false;
  begin perform apply_rate_change(ws,gen_random_uuid(),a3,'2026-09-15','DAY',24000,null,'x',true);
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'T13 basis change over recorded work blocked';
  r := apply_rate_change(ws,gen_random_uuid(),a3,'2026-09-16','DAY',24000,null,null,false);
  assert (r->>'corrected_days')::int = 0, 'basis change after last recorded day allowed';
  -- hours-entered day cannot move to an agreement without day length
  perform record_work(ws,gen_random_uuid(),a1,'2026-09-15','DAY_MINUTES',null,240,0,null,null);
  pv := preview_rate_change(ws,a1,'2026-09-15','DAY',30000,null);
  assert pv->>'blocked_reason' is not null, 'needs standard day length';
  -- duplicate effective date rejected
  failed := false;
  begin perform apply_rate_change(ws,gen_random_uuid(),a2,'2026-10-01','DAY',25000,null,null,false);
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'duplicate effective date';

  -- reconciliation: ledger sum equals sum of sources
  select count(*) into n from assignment_balances b
   where b.balance_minor <> (
     coalesce((select sum(r.earned_minor) from work_entries e join work_revisions r on r.entry_id=e.id and r.revision=e.active_revision where e.assignment_id=b.assignment_id),0)
   + coalesce((select sum(amount_minor) from reimbursements where assignment_id=b.assignment_id),0)
   + coalesce((select sum(case when direction='INCREASE_OWED' then amount_minor else -amount_minor end) from adjustments where assignment_id=b.assignment_id),0)
   - coalesce((select sum(amount_minor) from allocations where assignment_id=b.assignment_id),0)
   + coalesce((select sum(rl.amount_minor) from reversal_lines rl join allocations al on al.id=rl.allocation_id where al.assignment_id=b.assignment_id),0))
     and b.workspace_id = ws;
  assert n = 0, 'ledger reconciles to sources';
  raise notice '04_reimb_adj_rest_rates: PASS';
end $$;
