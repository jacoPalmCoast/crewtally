-- Baseline 2.0 (Phase 1b): workspaces, memberships, roles, invitations, email codes, actor, account deletion.
do $$
declare
  u_org uuid; u_partner uuid; u_other uuid; u_owner uuid; u_admin uuid; u_worker uuid; u_stranger uuid;
  ws_home uuid; ws_home2 uuid; ws_biz uuid; ws_other uuid;
  p uuid; w uuid; a uuid; wb uuid; r jsonb; failed boolean; st text; ok boolean; pay uuid;
  tok bytea; inv uuid; n bigint;
  function_code text;
begin
  insert into users (apple_sub) values ('t:org')     returning id into u_org;
  insert into users (apple_sub) values ('t:partner') returning id into u_partner;
  insert into users (apple_sub) values ('t:other')   returning id into u_other;
  insert into users (apple_sub) values ('t:owner')   returning id into u_owner;
  insert into users (apple_sub) values ('t:admin')   returning id into u_admin;
  insert into users (email, email_verified_at) values ('worker@example.com', now()) returning id into u_worker;
  insert into users (apple_sub) values ('t:stranger') returning id into u_stranger;

  -- ---- workspaces and the principal ----
  ws_home  := create_workspace(u_org, 'HOME', 'Debra Lane', 'USD', 'America/New_York');
  ws_home2 := create_workspace(u_org, 'HOME', 'Rental', 'USD', null);     -- one person, several workspaces
  ws_biz   := create_workspace(u_owner, 'BUSINESS', 'Rivera Builders', 'USD', 'America/New_York');
  ws_other := create_workspace(u_other, 'HOME', 'Other home', 'USD', null);
  assert (select role from memberships where workspace_id = ws_home and user_id = u_org) = 'ORGANIZER';
  assert (select role from memberships where workspace_id = ws_biz and user_id = u_owner) = 'OWNER';
  assert jsonb_array_length(my_workspaces(u_org)) = 2, 'organizer sees both workspaces';

  failed := false; begin perform create_workspace(u_org, 'HOME', 'Bad', 'USD', 'Not/AZone'); exception when others then failed := true; end;
  assert failed, 'bad time zone rejected';

  -- roles must fit the kind
  failed := false; begin insert into memberships (workspace_id,user_id,role,financial_access) values (ws_home,u_admin,'ADMIN',true); exception when others then failed := true; end;
  assert failed, 'ADMIN not allowed in Home';
  failed := false; begin insert into memberships (workspace_id,user_id,role) values (ws_biz,u_partner,'PARTNER'); exception when others then failed := true; end;
  assert failed, 'PARTNER not allowed in Business';
  -- only the billing owner can be principal, and only one
  failed := false; begin insert into memberships (workspace_id,user_id,role) values (ws_home,u_partner,'ORGANIZER'); exception when others then failed := true; end;
  assert failed, 'second organizer rejected';
  failed := false; begin update memberships set status='REMOVED', removed_at=now() where workspace_id=ws_home and user_id=u_org; exception when others then failed := true; end;
  assert failed, 'organizer cannot be removed';
  failed := false; begin update workspaces set kind='BUSINESS' where id=ws_home; exception when others then failed := true; end;
  assert failed, 'kind is fixed';
  failed := false; begin update workspaces set owner_id=u_partner where id=ws_home; exception when others then failed := true; end;
  assert failed, 'billing owner is fixed';

  -- ---- the permission matrix ----
  assert role_can('PARTNER', null, 'money.record') and role_can('PARTNER', null, 'people.add');
  assert not role_can('PARTNER', null, 'rates.set') and not role_can('PARTNER', null, 'people.remove');
  assert not role_can('PARTNER', null, 'plan.manage') and not role_can('PARTNER', null, 'members.manage');
  assert not role_can('PARTNER', null, 'account.delete_workspace');
  assert not role_can('ADMIN', false, 'money.view') and not role_can('ADMIN', false, 'rates.set');
  assert role_can('ADMIN', true, 'money.record') and role_can('ADMIN', true, 'rates.set');
  assert role_can('ADMIN', false, 'work.approve') and not role_can('ORGANIZER', null, 'work.approve');
  assert not role_can('LEAD', null, 'money.view') and not role_can('WORKER', null, 'money.view');
  assert not role_can('LEAD', null, 'crew.private') and not role_can('WORKER', null, 'export');
  assert role_can('ORGANIZER', null, 'crew.private') and role_can('PARTNER', null, 'crew.private');
  failed := false; begin perform member_can(ws_home, u_org, 'money.recrod'); exception when others then failed := true; end;
  assert failed, 'unknown action raises';

  -- ---- require_member: 404 for outsiders, 403 for missing rights, actor recorded ----
  begin perform require_member(ws_home, u_other, 'workspace.read'); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT404', 'outsider gets CT404, got ' || st;

  -- set up money in ws_home
  insert into projects (workspace_id,name,timezone) values (ws_home,'P','America/New_York') returning id into p;
  insert into workers (workspace_id,display_name) values (ws_home,'Ana') returning id into w;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws_home,p,w,'2026-09-01') returning id into a;
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws_home,a,'2026-09-01','DAY',20000);
  assert (select recorded_by from rate_agreements where assignment_id = a) is null, 'no actor → null (provided paths unchanged)';

  -- ---- Home partner invitation ----
  tok := sha256('partner-token'::bytea); inv := gen_random_uuid();
  r := create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'Partner@Example.com', tok,
                         sha256(convert_to('partner@example.com:123456','UTF8')));
  assert (select email from invitations where id = inv) = 'partner@example.com', 'email lower-cased';
  r := peek_invitation(tok);
  assert (r->>'available')::boolean and r->>'workspace_name' = 'Debra Lane' and r->>'role' = 'PARTNER';
  assert not (peek_invitation(sha256('nope'::bytea))->>'available')::boolean;
  -- the organizer cannot invite an admin, a stranger cannot invite anyone
  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'WORKER', null, w, 'x@example.com', sha256('t2'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'organizer cannot invite a worker, got ' || st;
  begin perform create_invitation(ws_home, u_stranger, gen_random_uuid(), 'PARTNER', null, null, 'y@example.com', sha256('t3'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT404', 'stranger gets CT404';
  -- a second pending invitation to the same email is refused
  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'partner@example.com', sha256('t4'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'duplicate pending invite refused';

  r := accept_invitation(u_partner, tok);
  assert r->>'role' = 'PARTNER' and (r->>'workspace_id')::uuid = ws_home;
  assert not (peek_invitation(tok)->>'available')::boolean, 'used link no longer available';
  begin perform accept_invitation(u_stranger, tok); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT410', 'link works once';

  -- partner rights in practice
  r := require_member(ws_home, u_partner, 'money.record');
  pay := (record_payment(ws_home, gen_random_uuid(), '2026-09-02', 'CASH', null, 5000, 'Ana', null,
          jsonb_build_array(jsonb_build_object('assignment_id', a, 'amount_minor', 5000)))->>'payment_id')::uuid;
  assert (select recorded_by from payments where workspace_id = ws_home order by created_at desc limit 1) = u_partner,
         'payment records the partner as actor';
  begin perform require_member(ws_home, u_partner, 'rates.set'); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'partner cannot set rates';
  begin perform create_invitation(ws_home, u_partner, gen_random_uuid(), 'PARTNER', null, null, 'z@example.com', sha256('t5'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'partner cannot invite';
  -- only one partner
  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'second@example.com', sha256('t6'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'one partner per Home workspace';

  -- partner leaves, organizer cannot
  r := remove_member(ws_home, u_partner, u_partner);
  begin perform require_member(ws_home, u_partner, 'workspace.read'); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT404', 'removed member is an outsider';
  begin perform remove_member(ws_home, u_org, u_org); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'organizer cannot leave';

  -- re-invite reactivates the same membership row
  tok := sha256('partner-token-2'::bytea);
  perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'partner@example.com', tok, sha256('c'::bytea));
  r := accept_invitation(u_partner, tok);
  assert (select count(*) from memberships where workspace_id = ws_home and user_id = u_partner) = 1;
  assert (select status from memberships where workspace_id = ws_home and user_id = u_partner) = 'ACTIVE';
  r := remove_member(ws_home, u_org, u_partner);
  assert (select removed_by from memberships where workspace_id = ws_home and user_id = u_partner) = u_org;

  -- expired link: peek says unavailable, accept marks it EXPIRED
  tok := sha256('old'::bytea); inv := gen_random_uuid();
  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'late@example.com', tok, sha256('c'::bytea));
  update invitations set expires_at = now() - interval '1 minute' where id = inv;
  assert not (peek_invitation(tok)->>'available')::boolean;
  r := accept_invitation(u_stranger, tok);
  assert r->>'error' = 'INVITATION_NOT_AVAILABLE' and (select status from invitations where id = inv) = 'EXPIRED';

  -- code fallback: five wrong codes lock it; a fresh invite with the right code works
  inv := gen_random_uuid();
  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'code@example.com', sha256('ct'::bytea),
                            sha256(convert_to('code@example.com:654321','UTF8')));
  for i in 1..5 loop
    r := accept_invitation_code(u_owner, 'code@example.com', sha256(convert_to('code@example.com:000000','UTF8')));
    assert r->>'error' = 'INVITATION_CODE_WRONG';
  end loop;
  assert (select status from invitations where id = inv) = 'PENDING', 'a stranger''s guesses never change the invitation';
  r := accept_invitation_code(u_owner, 'code@example.com', sha256(convert_to('code@example.com:654321','UTF8')));
  assert r->>'error' = 'INVITATION_CODE_WRONG', 'after five wrong tries that person can''t try again today, even with the right code';
  r := accept_invitation_code(u_stranger, 'CODE@example.com ', sha256(convert_to('code@example.com:654321','UTF8')));
  assert r->>'role' = 'PARTNER', 'the real invitee still joins with the right code';
  r := remove_member(ws_home, u_org, u_stranger);

  -- decline and revoke
  tok := sha256('dec'::bytea); inv := gen_random_uuid();
  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'dec@example.com', tok, sha256('c'::bytea));
  r := decline_invitation(tok);
  assert (select status from invitations where id = inv) = 'DECLINED';
  inv := gen_random_uuid();
  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'rev@example.com', sha256('rev'::bytea), sha256('c'::bytea));
  r := revoke_invitation(ws_home, u_org, inv);
  assert (select status from invitations where id = inv) = 'REVOKED';
  begin perform revoke_invitation(ws_other, u_other, inv); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT404', 'cannot revoke another workspace''s invitation';

  -- ---- Business roles ----
  insert into workers (workspace_id,display_name) values (ws_biz,'Luis') returning id into wb;
  tok := sha256('admin'::bytea);
  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'ADMIN', false, null, 'admin@example.com', tok, sha256('c'::bytea));
  r := accept_invitation(u_admin, tok);
  assert (select financial_access from memberships where workspace_id = ws_biz and user_id = u_admin) = false;
  begin perform require_member(ws_biz, u_admin, 'money.view'); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'admin without money access cannot see money';
  -- an admin without money access can't create a login bound to a worker record (it would show that worker's money)
  begin perform create_invitation(ws_biz, u_admin, gen_random_uuid(), 'WORKER', null, wb, 'w0@example.com', sha256('w0'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'worker binding needs money access';
  tok := sha256('worker'::bytea);
  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, wb, 'worker@example.com', tok, sha256('c'::bytea));
  begin perform create_invitation(ws_biz, u_admin, gen_random_uuid(), 'ADMIN', true, null, 'a2@example.com', sha256('a2'::bytea), sha256('c'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'admin cannot invite admins';
  failed := false; begin perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, null, 'nw@example.com', sha256('nw'::bytea), sha256('c'::bytea)); exception when others then failed := true; end;
  assert failed, 'worker invitation needs a worker record';
  r := accept_invitation(u_worker, tok);
  assert (select worker_id from memberships where workspace_id = ws_biz and user_id = u_worker) = wb;
  -- admin cannot give money access; owner can
  begin perform change_member_role(ws_biz, u_admin, u_admin, 'ADMIN', true); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'admin cannot change own role';
  r := change_member_role(ws_biz, u_owner, u_admin, 'ADMIN', true);
  assert member_can(ws_biz, u_admin, 'money.record'), 'owner granted money access';
  r := change_member_role(ws_biz, u_admin, u_worker, 'LEAD', null);
  assert (select role from memberships where workspace_id = ws_biz and user_id = u_worker) = 'LEAD';
  assert (select worker_id from memberships where workspace_id = ws_biz and user_id = u_worker) = wb, 'lead keeps worker record';
  begin perform change_member_role(ws_biz, u_admin, u_owner, 'ADMIN', false); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'nobody demotes the owner';
  r := member_permissions(ws_biz, u_worker);
  assert r->>'role' = 'LEAD' and not (r->'can'->>'money.view')::boolean and (r->'can'->>'work.record')::boolean;
  -- one login per worker record
  tok := sha256('dup-worker'::bytea);
  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, wb, 'dup@example.com', tok, sha256('c'::bytea));
  begin perform accept_invitation(u_stranger, tok); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'worker record already has a login';

  -- ---- email codes ----
  r := issue_email_code('Sam@Example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8')));
  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:999999','UTF8')));
  assert verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8'))), 'right code';
  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8'))), 'code works once';
  r := issue_email_code('sam@example.com', 'LINK', sha256(convert_to('sam@example.com:444444','UTF8')));
  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:222222','UTF8')));
  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:333333','UTF8')));
  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:222222','UTF8'))), 'older code of the same purpose stops working';
  assert verify_email_code('sam@example.com', 'LINK', sha256(convert_to('sam@example.com:444444','UTF8'))), 'a SIGN_IN code never cancels a LINK code';
  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:555555','UTF8')));   -- fifth
  begin perform issue_email_code('sam@example.com', 'SIGN_IN', sha256('x'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT429', 'sixth code in an hour refused';
  -- five wrong tries burn the code
  r := issue_email_code('kim@example.com', 'SIGN_IN', sha256(convert_to('kim@example.com:121212','UTF8')));
  for i in 1..5 loop perform verify_email_code('kim@example.com', 'SIGN_IN', sha256('bad'::bytea)); end loop;
  assert not verify_email_code('kim@example.com', 'SIGN_IN', sha256(convert_to('kim@example.com:121212','UTF8'))), 'burned after five';
  -- purpose matters
  r := issue_email_code('lee@example.com', 'LINK', sha256(convert_to('lee@example.com:343434','UTF8')));
  assert not verify_email_code('lee@example.com', 'SIGN_IN', sha256(convert_to('lee@example.com:343434','UTF8'))), 'LINK code is not a SIGN_IN code';

  -- a 24-hour failure budget per email: after 20 wrong tries nothing is checked or issued
  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b1'::bytea));
  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b2'::bytea));
  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b3'::bytea));
  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b4'::bytea));
  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
  begin perform issue_email_code('budget@example.com', 'SIGN_IN', sha256('b5'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT429', 'no new codes after 20 wrong tries in 24 hours';

  -- sign-in checks the code itself
  r := issue_email_code('worker@example.com', 'SIGN_IN', sha256(convert_to('w:1','UTF8')));
  assert sign_in_with_email_code('worker@example.com', sha256(convert_to('w:wrong','UTF8'))) is null, 'wrong code signs nobody in';
  assert sign_in_with_email_code('worker@example.com', sha256(convert_to('w:1','UTF8'))) = u_worker, 'existing verified email signs in to the same user';
  n := (select count(*) from users);
  r := issue_email_code('new@example.com', 'SIGN_IN', sha256(convert_to('n:1','UTF8')));
  u_stranger := sign_in_with_email_code('NEW@example.com', sha256(convert_to('n:1','UTF8')));
  assert u_stranger is not null and (select count(*) from users) = n + 1, 'new user created once';
  r := issue_email_code('org@example.com', 'LINK', sha256(convert_to('o:1','UTF8')));
  r := link_email_code(u_org, 'org@example.com', sha256(convert_to('o:1','UTF8')));
  assert (select email from users where id = u_org) = 'org@example.com';
  begin perform link_email_code(u_org, 'org2@example.com', sha256('x'::bytea)); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'an account with an email can''t swap it here';
  r := issue_email_code('org@example.com', 'LINK', sha256(convert_to('o:2','UTF8')));
  begin perform link_email_code(u_partner, 'org@example.com', sha256(convert_to('o:2','UTF8'))); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'email already used by another account';

  -- ---- account deletion ----
  insert into sessions (user_id, token_hash, expires_at) values (u_org, sha256('s1'::bytea), now() + interval '30 days');
  -- org is partner in ws_other
  tok := sha256('org-in-other'::bytea);
  perform create_invitation(ws_other, u_other, gen_random_uuid(), 'PARTNER', null, null, 'org2@example.com', tok, sha256('c'::bytea));
  r := accept_invitation(u_org, tok);
  -- org's own workspace has a partner again
  tok := sha256('partner-back'::bytea);
  perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'p3@example.com', tok, sha256('c'::bytea));
  r := accept_invitation(u_partner, tok);
  perform create_invitation(ws_home2, u_org, gen_random_uuid(), 'PARTNER', null, null, 'pending@example.com', sha256('pend'::bytea), sha256('c'::bytea));

  inv := (select id from invitations where email = 'pending@example.com');
  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'ADMIN', false, null, 'org@example.com', sha256('to-org'::bytea), sha256('c'::bytea));
  r := delete_user_account(u_org);
  assert jsonb_array_length(r->'deleted_workspaces') = 2, 'both owned workspaces deleted';
  assert not exists (select 1 from workspaces where id in (ws_home, ws_home2));
  assert not exists (select 1 from payments where workspace_id = ws_home);
  assert not exists (select 1 from memberships where workspace_id = ws_home), 'memberships of deleted workspace gone';
  assert exists (select 1 from workspaces where id = ws_other), 'workspace where they were partner stays';
  assert (select status from memberships where workspace_id = ws_other and user_id = u_org) = 'REMOVED';
  assert (select deleted_at is not null and apple_sub is null and email is null from users where id = u_org), 'identity scrubbed';
  assert not exists (select 1 from sessions where user_id = u_org and revoked_at is null), 'sessions revoked';
  assert exists (select 1 from users where id = u_partner and deleted_at is null), 'partner account untouched';
  assert jsonb_array_length(my_workspaces(u_partner)) = 0;
  begin perform require_member(ws_other, u_org, 'workspace.read'); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT404', 'deleted user is an outsider';
  assert not exists (select 1 from invitations where email = 'org@example.com' and status = 'PENDING'), 'invitations to the deleted person are revoked';
  -- a deleted Apple id can sign up again fresh
  insert into users (apple_sub) values ('t:org');

  raise notice '11_identity_memberships: PASS';
end $$;

-- names and Apple linking
do $$
declare u1 uuid; u2 uuid; ws uuid; st text; r jsonb;
begin
  r := issue_email_code('first@example.com', 'SIGN_IN', sha256('f:1'::bytea));
  u1 := sign_in_with_email_code('first@example.com', sha256('f:1'::bytea));
  insert into users (apple_sub) values ('t:link-other') returning id into u2;
  r := set_display_name(u1, '  Dana ');
  assert (select display_name from users where id = u1) = 'Dana';
  begin perform set_display_name(u1, repeat('x', 61)); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = '22023', 'name too long';
  r := link_apple(u1, 't:link-me');
  assert (select apple_sub from users where id = u1) = 't:link-me';
  r := link_apple(u1, 't:link-me');                                   -- same again is fine
  begin perform link_apple(u1, 't:another'); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'cannot replace a linked Apple ID';
  begin perform link_apple(u1, 't:link-other'); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT409', 'Apple ID used by another account';
  -- invitation keeps the inviter's label
  ws := create_workspace(u2, 'HOME', 'Labelled', 'USD', null);
  perform create_invitation(ws, u2, gen_random_uuid(), 'PARTNER', null, null, 'lab@example.com', sha256('lab'::bytea), sha256('c'::bytea), ' Sam ');
  assert (select invitee_name from invitations where email = 'lab@example.com') = 'Sam';
  -- Apple credentials: one per client kind
  insert into apple_credentials (user_id, client_kind, refresh_token_ciphertext, iv, auth_tag, updated_at) values (u2, 'APP', '\x00'::bytea, '\x00'::bytea, '\x00'::bytea, now()), (u2, 'WEB', '\x00'::bytea, '\x00'::bytea, '\x00'::bytea, now());
  assert (select count(*) from apple_credentials where user_id = u2) = 2;
  raise notice '11b_names_and_linking: PASS';
end $$;

-- inviters who lose the right, revoke rules, recorded_by can't be faked
do $$
declare uo uuid; ua uuid; ub uuid; ux uuid; ws uuid; w uuid; tok bytea; inv uuid; r jsonb; st text; p uuid; a uuid;
begin
  insert into users (apple_sub) values ('t:o2') returning id into uo;
  insert into users (apple_sub) values ('t:a2') returning id into ua;
  insert into users (apple_sub) values ('t:b2') returning id into ub;
  insert into users (apple_sub) values ('t:x2') returning id into ux;
  ws := create_workspace(uo, 'BUSINESS', 'Inviter test', 'USD', null);
  tok := sha256('a2'::bytea);
  perform create_invitation(ws, uo, gen_random_uuid(), 'ADMIN', false, null, 'a2@example.com', tok, sha256('c'::bytea));
  r := accept_invitation(ua, tok);
  -- the admin invites their own second address, then is removed: that invitation dies
  tok := sha256('sneak'::bytea); inv := gen_random_uuid();
  perform create_invitation(ws, ua, inv, 'LEAD', null, null, 'sneak@example.com', tok, sha256('c'::bytea));
  r := remove_member(ws, uo, ua);
  assert (select status from invitations where id = inv) = 'REVOKED', 'removing someone revokes what they sent';
  -- even if it had stayed pending, accept re-checks the inviter
  insert into memberships (workspace_id, user_id, role, financial_access) values (ws, ub, 'ADMIN', false)
    on conflict (workspace_id, user_id) do nothing;
  tok := sha256('later'::bytea); inv := gen_random_uuid();
  perform create_invitation(ws, ub, inv, 'LEAD', null, null, 'later@example.com', tok, sha256('c'::bytea));
  update memberships set status = 'REMOVED', removed_at = now() where workspace_id = ws and user_id = ub;  -- simulate a missed revoke
  r := accept_invitation(ux, tok);
  assert r->>'error' = 'INVITATION_NOT_AVAILABLE', 'accept re-checks the inviter';
  assert not member_can(ws, ux, 'workspace.read');
  -- an admin without money can't revoke the owner's money-admin invitation
  update memberships set status = 'ACTIVE', removed_at = null where workspace_id = ws and user_id = ub;
  inv := gen_random_uuid();
  perform create_invitation(ws, uo, inv, 'ADMIN', true, null, 'fin@example.com', sha256('fin'::bytea), sha256('c'::bytea));
  begin perform revoke_invitation(ws, ub, inv); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'cannot revoke an invitation you could not have made';
  -- demoting an admin to lead withdraws their pending invitations
  inv := gen_random_uuid();
  perform create_invitation(ws, ub, inv, 'LEAD', null, null, 'l3@example.com', sha256('l3'::bytea), sha256('c'::bytea));
  r := change_member_role(ws, uo, ub, 'LEAD', null);
  assert (select status from invitations where id = inv) = 'REVOKED', 'demotion withdraws invitations';
  begin perform change_member_role(ws, uo, ub, 'WORKER', null); st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = '22023', 'worker role needs a worker record';
  -- recorded_by: the actor wins, a mismatch is refused
  insert into projects (workspace_id,name,timezone) values (ws,'J','UTC') returning id into p;
  insert into workers (workspace_id,display_name) values (ws,'W') returning id into w;
  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w,'2026-09-01') returning id into a;
  r := require_member(ws, uo, 'rates.set');
  begin
    insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor,recorded_by)
    values (ws,a,'2026-09-01','HOUR',3000,ua);
    st := 'none';
  exception when others then get stacked diagnostics st = returned_sqlstate; end;
  assert st = 'CT403', 'recorded_by cannot name someone else';
  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,a,'2026-09-01','HOUR',3000);
  assert (select recorded_by from rate_agreements where assignment_id = a) = uo, 'actor recorded';
  raise notice '11c_inviters_and_actor: PASS';
end $$;

-- many accounts can't add up guesses on one invitation email; the link still works
do $$
declare uo uuid; ws uuid; u uuid; tok bytea; r jsonb;
begin
  insert into users (apple_sub) values ('t:spray-org') returning id into uo;
  ws := create_workspace(uo, 'HOME', 'Spray', 'USD', null);
  tok := sha256('spray-link'::bytea);
  perform create_invitation(ws, uo, gen_random_uuid(), 'PARTNER', null, null, 'spray@example.com', tok,
                            sha256(convert_to('spray@example.com:777777','UTF8')));
  for k in 1..4 loop
    insert into users (apple_sub) values ('t:spray-' || k) returning id into u;
    for i in 1..5 loop perform accept_invitation_code(u, 'spray@example.com', sha256('wrong'::bytea)); end loop;
  end loop;
  insert into users (apple_sub) values ('t:spray-real') returning id into u;
  r := accept_invitation_code(u, 'spray@example.com', sha256(convert_to('spray@example.com:777777','UTF8')));
  assert r->>'error' = 'INVITATION_CODE_WRONG', 'code path off after 20 wrong tries across accounts';
  r := accept_invitation(u, tok);
  assert r->>'role' = 'PARTNER', 'the link still works';
  raise notice '11d_code_spray: PASS';
end $$;
