-- =====================================================================
-- 0003 — Identity, workspaces, memberships, invitations, email codes,
--        who-did-it (actor) on money rows.      Baseline 2.0, Phase 1b.
-- Additive only. Loaded after 0001_schema.sql and 0002_auth.sql (built in Phase 1).
--
-- What changes:
--  * One person can belong to several workspaces. A workspace is HOME or BUSINESS.
--  * Roles live in memberships: HOME → ORGANIZER (one) and PARTNER (at most one);
--    BUSINESS → OWNER (one), ADMIN (with or without money access), LEAD, WORKER.
--  * workspaces.owner_id stays: it is the billing owner (the Home organizer or Business owner).
--    It is no longer unique, so one person can own several workspaces.
--  * A user signs in with Apple, with a verified email code, or both (linked).
--  * Every money row records who wrote it (recorded_by), set from the transaction's actor.
--  * Permission checks live in one place: role_can() / require_member().
--
-- Nothing here changes a money function, fn_earned or the ledger.
-- =====================================================================

-- ---------- users: email sign-in and a display name ----------
alter table users alter column apple_sub drop not null;
alter table users add column display_name text check (display_name is null or length(display_name) between 1 and 60);
alter table users add column email text check (email is null or (email = lower(email) and position('@' in email) > 1 and length(email) <= 254));
alter table users add column email_verified_at timestamptz;
alter table users add constraint users_email_needs_verification check (email is null or email_verified_at is not null);
alter table users add constraint users_has_identity check (deleted_at is not null or apple_sub is not null or email is not null);
create unique index users_email_unique on users (email) where email is not null;

-- ---------- sessions: phone app or web ----------
alter table sessions add column client text not null default 'APP' check (client in ('APP','WEB'));
alter table sessions add column csrf_hash bytea;   -- web sessions only (Phase 1c)
alter table sessions add constraint sessions_web_has_csrf check (client = 'APP' or csrf_hash is not null);

-- ---------- workspaces: several per person, two kinds ----------
alter table workspaces drop constraint workspaces_owner_id_key;
alter table workspaces add column kind text not null default 'HOME' check (kind in ('HOME','BUSINESS'));
alter table workspaces add column default_timezone text;          -- default for NEW projects only (decision D9)
create index workspaces_owner on workspaces (owner_id);

create function trg_workspaces_kind_fixed() returns trigger language plpgsql as $$
begin
  if new.kind <> old.kind then
    raise exception 'workspace kind cannot change' using errcode = '23514';
  end if;
  if new.owner_id <> old.owner_id then
    raise exception 'billing owner cannot change here' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger workspaces_kind_fixed before update on workspaces
  for each row execute function trg_workspaces_kind_fixed();

-- ---------- memberships ----------
create table memberships (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  user_id          uuid not null references users(id),
  role             text not null check (role in ('ORGANIZER','PARTNER','OWNER','ADMIN','LEAD','WORKER')),
  financial_access boolean,                  -- ADMIN only: may see and record money
  worker_id        uuid,                     -- LEAD (optional) / WORKER (required): their own worker record
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED')),
  invited_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  removed_at       timestamptz,
  removed_by       uuid references users(id),
  unique (workspace_id, user_id),
  check ((role = 'ADMIN') = (financial_access is not null)),
  check (worker_id is null or role in ('LEAD','WORKER')),
  check (role <> 'WORKER' or worker_id is not null),
  check ((status = 'REMOVED') = (removed_at is not null)),
  foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade
);
create unique index memberships_one_principal on memberships (workspace_id)
  where role in ('ORGANIZER','OWNER') and status = 'ACTIVE';
create unique index memberships_one_partner on memberships (workspace_id)
  where role = 'PARTNER' and status = 'ACTIVE';
create unique index memberships_one_login_per_worker on memberships (workspace_id, worker_id)
  where worker_id is not null and status = 'ACTIVE';
create index memberships_by_user on memberships (user_id) where status = 'ACTIVE';

-- Roles must fit the workspace kind; the principal is the billing owner and can't be removed or demoted.
create function trg_memberships_rules() returns trigger language plpgsql as $$
declare v_kind text; v_owner uuid;
begin
  select kind, owner_id into v_kind, v_owner from workspaces where id = new.workspace_id;
  if v_kind = 'HOME' and new.role not in ('ORGANIZER','PARTNER') then
    raise exception 'role % does not fit a Home workspace', new.role using errcode = '23514';
  end if;
  if v_kind = 'BUSINESS' and new.role not in ('OWNER','ADMIN','LEAD','WORKER') then
    raise exception 'role % does not fit a Business workspace', new.role using errcode = '23514';
  end if;
  if new.role in ('ORGANIZER','OWNER') and new.user_id <> v_owner then
    raise exception 'the principal must be the billing owner' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.role in ('ORGANIZER','OWNER') and (new.role <> old.role or new.status <> 'ACTIVE') then
      raise exception 'the organizer or owner cannot be removed or demoted' using errcode = '23514';
    end if;
    if new.role in ('ORGANIZER','OWNER') and old.role not in ('ORGANIZER','OWNER') then
      raise exception 'ownership cannot be transferred here' using errcode = '23514';
    end if;
    if new.user_id <> old.user_id or new.workspace_id <> old.workspace_id then
      raise exception 'membership identity cannot change' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger memberships_rules before insert or update on memberships
  for each row execute function trg_memberships_rules();

-- Existing Phase 1 workspaces: their owner becomes the Home organizer.
insert into memberships (workspace_id, user_id, role)
select w.id, w.owner_id, 'ORGANIZER'
from workspaces w join users u on u.id = w.owner_id
where u.deleted_at is null
on conflict do nothing;

-- ---------- permissions: the one place roles are turned into rights ----------
-- Lead and worker scoping (own jobs, own records) is applied by the API on top of this (Business phases).
create function role_can(p_role text, p_financial boolean, p_action text) returns boolean
language plpgsql immutable as $$
declare money boolean := p_role in ('ORGANIZER','PARTNER','OWNER') or (p_role = 'ADMIN' and coalesce(p_financial,false));
begin
  return case p_action
    when 'workspace.read'  then true
    when 'work.record'     then true
    when 'work.approve'    then p_role in ('OWNER','ADMIN')
    when 'money.view'      then money
    when 'money.record'    then money
    when 'rates.set'       then p_role in ('ORGANIZER','OWNER') or (p_role = 'ADMIN' and coalesce(p_financial,false))
    when 'people.add'      then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
    when 'people.remove'   then p_role in ('ORGANIZER','OWNER','ADMIN')
    when 'projects.manage' then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
    when 'crew.private'    then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
    when 'members.manage'  then p_role in ('ORGANIZER','OWNER','ADMIN')
    when 'plan.manage'     then p_role in ('ORGANIZER','OWNER')
    when 'settings.edit'   then p_role in ('ORGANIZER','OWNER')
    when 'export'          then money
    when 'account.delete_workspace' then p_role in ('ORGANIZER','OWNER')
    else null end
  ;
end $$;

-- Raises for an unknown action so a typo can never quietly grant or deny.
create function member_can(p_workspace uuid, p_user uuid, p_action text) returns boolean
language plpgsql stable security definer as $$
declare m record; r boolean;
begin
  if role_can('OWNER', true, p_action) is null then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  select ms.role, ms.financial_access into m
  from memberships ms join users u on u.id = ms.user_id
  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
  if not found then return false; end if;
  return role_can(m.role, m.financial_access, p_action);
end $$;

-- The single door for every API request that touches a workspace.
-- Not a member (or removed, or deleted user) → CT404 (the API answers 404 and never says the workspace exists).
-- Member without the right → CT403 (the API answers 403 FORBIDDEN).
-- On success it records the actor for this transaction, so every money row gets recorded_by.
create function require_member(p_workspace uuid, p_user uuid, p_action text) returns jsonb
language plpgsql security definer as $$
declare m record;
begin
  if role_can('OWNER', true, p_action) is null then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  select ms.role, ms.financial_access, ms.worker_id, w.kind into m
  from memberships ms
  join users u on u.id = ms.user_id
  join workspaces w on w.id = ms.workspace_id
  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
  if not found then
    raise exception 'not a member' using errcode = 'CT404';
  end if;
  if not role_can(m.role, m.financial_access, p_action) then
    raise exception 'not allowed' using errcode = 'CT403';
  end if;
  perform set_config('crewtally.actor', p_user::text, true);
  return jsonb_build_object('role', m.role, 'financial_access', m.financial_access,
                            'worker_id', m.worker_id, 'kind', m.kind);
end $$;

-- All rights for the signed-in person in one workspace (the apps use it to shape screens; the server still checks).
create function member_permissions(p_workspace uuid, p_user uuid) returns jsonb
language plpgsql stable security definer as $$
declare m record; acts text[] := array['workspace.read','work.record','work.approve','money.view','money.record',
  'rates.set','people.add','people.remove','projects.manage','crew.private','members.manage','plan.manage',
  'settings.edit','export','account.delete_workspace']; a text; out jsonb := '{}'::jsonb;
begin
  select ms.role, ms.financial_access, ms.worker_id, w.kind, w.name into m
  from memberships ms join users u on u.id = ms.user_id join workspaces w on w.id = ms.workspace_id
  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
  if not found then raise exception 'not a member' using errcode = 'CT404'; end if;
  foreach a in array acts loop out := out || jsonb_build_object(a, role_can(m.role, m.financial_access, a)); end loop;
  return jsonb_build_object('role', m.role, 'financial_access', m.financial_access, 'worker_id', m.worker_id,
                            'kind', m.kind, 'name', m.name, 'can', out);
end $$;

-- ---------- who did it: recorded_by on every money and evidence row ----------
create function trg_set_recorded_by() returns trigger language plpgsql as $$
declare v uuid := nullif(current_setting('crewtally.actor', true), '')::uuid;
begin
  if v is not null then
    if new.recorded_by is not null and new.recorded_by <> v then
      raise exception 'recorded_by must be the signed-in person' using errcode = 'CT403';
    end if;
    new.recorded_by := v;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['work_revisions','payments','reversals','reimbursements','adjustments',
                           'rate_agreements','payment_signatures','receipts','statements','share_links','evidence',
                           'day_reviews'] loop
    execute format('alter table %I add column recorded_by uuid references users(id)', t);
    execute format('create trigger %I before insert on %I for each row execute function trg_set_recorded_by()',
                   t || '_recorded_by', t);
  end loop;
end $$;

-- ---------- idempotency for session routes that have no workspace yet ----------
-- (creating a workspace, accepting an invitation, linking a sign-in method). Same rules as idempotency_keys:
-- same user + operation id → same response; same id with a different request → 409.
create table user_idempotency_keys (
  user_id      uuid not null references users(id),
  operation_id uuid not null,
  request_hash text not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, operation_id)
);

-- ---------- workspace creation (sign-in no longer creates one) ----------
create function create_workspace(p_user uuid, p_kind text, p_name text, p_currency char(3), p_timezone text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if p_kind not in ('HOME','BUSINESS') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'bad name' using errcode = '22023'; end if;
  if not exists (select 1 from users where id = p_user and deleted_at is null) then
    raise exception 'user not found' using errcode = 'P0002'; end if;
  if p_timezone is not null and not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'bad time zone' using errcode = '22023'; end if;
  insert into workspaces (owner_id, name, currency_code, kind, default_timezone)
  values (p_user, btrim(p_name), coalesce(p_currency, 'USD'), p_kind, p_timezone)
  returning id into v_id;
  insert into memberships (workspace_id, user_id, role)
  values (v_id, p_user, case p_kind when 'HOME' then 'ORGANIZER' else 'OWNER' end);
  return v_id;
end $$;

-- ---------- invitations ----------
create table invitations (
  id               uuid primary key,                  -- generated by the API
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  role             text not null check (role in ('PARTNER','ADMIN','LEAD','WORKER')),
  financial_access boolean,
  worker_id        uuid,
  email            text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  invitee_name     text check (invitee_name is null or length(invitee_name) between 1 and 60),  -- the inviter's label, for their own list
  token_hash       bytea not null unique,             -- sha256 of a 32-byte random token; the token is never stored
  code_hash        bytea not null,                    -- HMAC-SHA256(CODE_PEPPER, email || ':' || 6-digit code), made by the API
  status           text not null default 'PENDING'
                   check (status in ('PENDING','ACCEPTED','REVOKED','DECLINED','EXPIRED')),
  expires_at       timestamptz not null,
  invited_by       uuid not null references users(id),
  decided_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  check ((role = 'ADMIN') = (financial_access is not null)),
  check (worker_id is null or role in ('LEAD','WORKER')),
  check (role <> 'WORKER' or worker_id is not null),
  check ((status = 'PENDING') = (decided_at is null)),
  foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade
);
create unique index invitations_one_pending on invitations (workspace_id, email) where status = 'PENDING';
create index invitations_by_email on invitations (email) where status = 'PENDING';

-- Who may invite whom (doc 03): organizer → partner; owner → admin, lead, worker; admin → lead, worker.
-- Only the owner may give money access.
create function can_invite(p_actor_role text, p_role text, p_financial boolean) returns boolean
language sql immutable as $$
  select case
    when p_actor_role = 'ORGANIZER' then p_role = 'PARTNER'
    when p_actor_role = 'OWNER'     then p_role in ('ADMIN','LEAD','WORKER')
    when p_actor_role = 'ADMIN'     then p_role in ('LEAD','WORKER')
    else false end
$$;

create function create_invitation(p_workspace uuid, p_actor uuid, p_id uuid, p_role text, p_financial boolean,
                                  p_worker uuid, p_email text, p_token_hash bytea, p_code_hash bytea,
                                  p_invitee_name text default null)
returns jsonb language plpgsql security definer as $$
declare a record; v_kind text; v_email text := lower(btrim(p_email));
begin
  perform require_member(p_workspace, p_actor, 'members.manage');
  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
  select kind into v_kind from workspaces where id = p_workspace;
  if not can_invite(a.role, p_role, p_financial) then
    raise exception 'not allowed to invite this role' using errcode = 'CT403'; end if;
  if (v_kind = 'HOME') <> (p_role = 'PARTNER') then
    raise exception 'role does not fit this workspace' using errcode = '23514'; end if;
  -- A login bound to a worker record sees that worker's earnings and receipts, so only someone
  -- who may see money can create one.
  if p_worker is not null and not member_can(p_workspace, p_actor, 'money.view') then
    raise exception 'binding a worker record needs money access' using errcode = 'CT403'; end if;
  if exists (select 1 from memberships m join users u on u.id = m.user_id
             where m.workspace_id = p_workspace and m.status = 'ACTIVE' and u.email = v_email) then
    raise exception 'already a member' using errcode = 'CT409'; end if;
  if p_role = 'PARTNER' and exists (select 1 from memberships where workspace_id = p_workspace
                                    and role = 'PARTNER' and status = 'ACTIVE') then
    raise exception 'this workspace already has a partner' using errcode = 'CT409'; end if;
  insert into invitations (id, workspace_id, role, financial_access, worker_id, email, invitee_name, token_hash, code_hash, expires_at, invited_by)
  values (p_id, p_workspace, p_role, case when p_role = 'ADMIN' then coalesce(p_financial,false) end,
          p_worker, v_email, nullif(btrim(p_invitee_name), ''), p_token_hash, p_code_hash, now() + interval '7 days', p_actor);
  return jsonb_build_object('id', p_id, 'expires_at', now() + interval '7 days');
exception when unique_violation then
  raise exception 'an invitation is already pending for this email' using errcode = 'CT409';
end $$;

-- What a person sees BEFORE signing in: the workspace name and the role, nothing else.
create function peek_invitation(p_token_hash bytea) returns jsonb
language plpgsql security definer as $$
declare i record;
begin
  select inv.status, inv.expires_at, inv.role, w.name into i
  from invitations inv join workspaces w on w.id = inv.workspace_id where inv.token_hash = p_token_hash;
  if not found or i.status <> 'PENDING' or i.expires_at <= now() then
    return jsonb_build_object('available', false);      -- one answer for unknown, used, revoked and expired
  end if;
  return jsonb_build_object('available', true, 'workspace_name', i.name, 'role', i.role);
end $$;

create function join_from_invitation(p_inv invitations, p_user uuid) returns jsonb
language plpgsql security definer as $$
declare existing record; inviter record;
begin
  -- the person who invited must still be allowed to invite this role
  select m.role into inviter from memberships m join users u on u.id = m.user_id
   where m.workspace_id = p_inv.workspace_id and m.user_id = p_inv.invited_by and m.status = 'ACTIVE' and u.deleted_at is null;
  if not found or not can_invite(inviter.role, p_inv.role, p_inv.financial_access)
     or (p_inv.worker_id is not null and not member_can(p_inv.workspace_id, p_inv.invited_by, 'money.view')) then
    update invitations set status = 'REVOKED', decided_at = now() where id = p_inv.id;
    return jsonb_build_object('error', 'INVITATION_NOT_AVAILABLE');
  end if;
  select * into existing from memberships where workspace_id = p_inv.workspace_id and user_id = p_user;
  if found and existing.status = 'ACTIVE' then
    update invitations set status = 'ACCEPTED', decided_by = p_user, decided_at = now() where id = p_inv.id;
    return jsonb_build_object('workspace_id', p_inv.workspace_id, 'role', existing.role, 'already_member', true);
  elsif found then
    update memberships set status = 'ACTIVE', role = p_inv.role, financial_access = p_inv.financial_access,
           worker_id = p_inv.worker_id, invited_by = p_inv.invited_by, removed_at = null, removed_by = null
    where id = existing.id;
  else
    insert into memberships (workspace_id, user_id, role, financial_access, worker_id, invited_by)
    values (p_inv.workspace_id, p_user, p_inv.role, p_inv.financial_access, p_inv.worker_id, p_inv.invited_by);
  end if;
  update invitations set status = 'ACCEPTED', decided_by = p_user, decided_at = now() where id = p_inv.id;
  return jsonb_build_object('workspace_id', p_inv.workspace_id, 'role', p_inv.role, 'already_member', false);
exception when unique_violation then
  -- a partner already joined, or that worker record already has a login
  raise exception 'this place is already taken' using errcode = 'CT409';
end $$;

-- Accept with the link token (the person has signed in first).
create function accept_invitation(p_user uuid, p_token_hash bytea) returns jsonb
language plpgsql security definer as $$
declare inv invitations;
begin
  if not exists (select 1 from users where id = p_user and deleted_at is null) then
    raise exception 'user not found' using errcode = 'P0002'; end if;
  select * into inv from invitations where token_hash = p_token_hash for update;
  if not found or inv.status <> 'PENDING' then
    raise exception 'invitation not available' using errcode = 'CT410'; end if;
  if inv.expires_at <= now() then
    update invitations set status = 'EXPIRED', decided_at = now() where id = inv.id;
    return jsonb_build_object('error', 'INVITATION_NOT_AVAILABLE');
  end if;
  return join_from_invitation(inv, p_user);
end $$;

-- Wrong-code attempts are counted per signed-in person and email, so a stranger's guesses
-- can never lock or change someone else's invitation.
create table invitation_code_attempts (
  user_id      uuid not null references users(id),
  email        text not null,
  window_start timestamptz not null default now(),
  attempts     smallint not null default 0,
  primary key (user_id, email)
);

-- Accept with email + 6-digit code (when the link won't open on this device).
-- Five wrong codes in 24 hours stop that person trying codes for that email.
create function accept_invitation_code(p_user uuid, p_email text, p_code_hash bytea) returns jsonb
language plpgsql security definer as $$
declare inv invitations; v_email text := lower(btrim(p_email)); a record;
begin
  if not exists (select 1 from users where id = p_user and deleted_at is null) then
    raise exception 'user not found' using errcode = 'P0002'; end if;
  insert into invitation_code_attempts (user_id, email) values (p_user, v_email) on conflict do nothing;
  select * into a from invitation_code_attempts where user_id = p_user and email = v_email for update;
  if a.window_start < now() - interval '24 hours' then
    update invitation_code_attempts set window_start = now(), attempts = 0 where user_id = p_user and email = v_email;
    a.attempts := 0;
  end if;
  if a.attempts >= 5 then
    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');      -- same answer; no more checking today
  end if;
  -- across everyone: after 20 wrong tries for this email in 24 hours the CODE path is off for that email
  -- (the link keeps working), so many throwaway accounts can't add up to a real chance of guessing.
  if (select coalesce(sum(attempts), 0) from invitation_code_attempts
       where email = v_email and window_start > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');
  end if;
  update invitations set status = 'EXPIRED', decided_at = now()
   where email = v_email and status = 'PENDING' and expires_at <= now();
  select * into inv from invitations
   where email = v_email and status = 'PENDING' and code_hash = p_code_hash
   order by created_at desc limit 1 for update;
  if not found then
    update invitation_code_attempts set attempts = attempts + 1 where user_id = p_user and email = v_email;
    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');
  end if;
  return join_from_invitation(inv, p_user);
end $$;

create function decline_invitation(p_token_hash bytea) returns jsonb
language plpgsql security definer as $$
begin
  update invitations set status = 'DECLINED', decided_at = now()
   where token_hash = p_token_hash and status = 'PENDING';
  return jsonb_build_object('ok', true);                -- same answer whatever the token
end $$;

create function revoke_invitation(p_workspace uuid, p_actor uuid, p_id uuid) returns jsonb
language plpgsql security definer as $$
declare a text; inv invitations;
begin
  perform require_member(p_workspace, p_actor, 'members.manage');
  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
  select * into inv from invitations where id = p_id and workspace_id = p_workspace and status = 'PENDING' for update;
  if not found then raise exception 'invitation not found' using errcode = 'CT404'; end if;
  if inv.invited_by <> p_actor and (not can_invite(a, inv.role, inv.financial_access)
       or (inv.worker_id is not null and not member_can(p_workspace, p_actor, 'money.view'))) then
    raise exception 'not allowed' using errcode = 'CT403'; end if;
  update invitations set status = 'REVOKED', decided_by = p_actor, decided_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- managing members ----------
-- Organizer manages the partner; owner manages everyone; admin manages leads and workers (no money access changes).
create function can_manage(p_actor_role text, p_target_role text, p_new_role text, p_new_financial boolean) returns boolean
language sql immutable as $$
  select case
    when p_actor_role = 'ORGANIZER' then p_target_role = 'PARTNER' and coalesce(p_new_role,'PARTNER') = 'PARTNER'
    when p_actor_role = 'OWNER'     then p_target_role in ('ADMIN','LEAD','WORKER')
                                     and coalesce(p_new_role, p_target_role) in ('ADMIN','LEAD','WORKER')
    when p_actor_role = 'ADMIN'     then p_target_role in ('LEAD','WORKER')
                                     and coalesce(p_new_role, p_target_role) in ('LEAD','WORKER')
    else false end
$$;

create function remove_member(p_workspace uuid, p_actor uuid, p_member_user uuid) returns jsonb
language plpgsql security definer as $$
declare a text; t record;
begin
  if p_actor = p_member_user then
    -- leaving: anyone but the principal may leave
    select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
    if not found then raise exception 'not a member' using errcode = 'CT404'; end if;
    if a in ('ORGANIZER','OWNER') then raise exception 'the organizer or owner cannot leave' using errcode = 'CT403'; end if;
  else
    perform require_member(p_workspace, p_actor, 'members.manage');
    select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
    select * into t from memberships where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE' for update;
    if not found then raise exception 'member not found' using errcode = 'CT404'; end if;
    if not can_manage(a, t.role, null, null) then raise exception 'not allowed' using errcode = 'CT403'; end if;
  end if;
  update memberships set status = 'REMOVED', removed_at = now(), removed_by = p_actor
   where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE';
  update invitations set status = 'REVOKED', decided_by = p_actor, decided_at = now()
   where workspace_id = p_workspace and invited_by = p_member_user and status = 'PENDING';
  return jsonb_build_object('ok', true);
end $$;

create function change_member_role(p_workspace uuid, p_actor uuid, p_member_user uuid, p_role text, p_financial boolean)
returns jsonb language plpgsql security definer as $$
declare a text; t record;
begin
  perform require_member(p_workspace, p_actor, 'members.manage');
  if p_role is null then raise exception 'role required' using errcode = '22023'; end if;
  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
  select * into t from memberships where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE' for update;
  if not found then raise exception 'member not found' using errcode = 'CT404'; end if;
  if p_actor = p_member_user then raise exception 'cannot change your own role' using errcode = 'CT403'; end if;
  if not can_manage(a, t.role, p_role, p_financial) then raise exception 'not allowed' using errcode = 'CT403'; end if;
  if a <> 'OWNER' and (p_role = 'ADMIN' or t.role = 'ADMIN') then
    raise exception 'only the owner changes admins' using errcode = 'CT403'; end if;
  if p_role = 'WORKER' and t.worker_id is null then
    raise exception 'WORKER_RECORD_REQUIRED' using errcode = '22023'; end if;
  update memberships set role = p_role,
         financial_access = case when p_role = 'ADMIN' then coalesce(p_financial, false) end,
         worker_id = case when p_role in ('LEAD','WORKER') then worker_id end
   where id = t.id;
  -- invitations this person sent that they could no longer send are withdrawn
  update invitations i set status = 'REVOKED', decided_by = p_actor, decided_at = now()
   where i.workspace_id = p_workspace and i.invited_by = p_member_user and i.status = 'PENDING'
     and (not can_invite(p_role, i.role, i.financial_access)
          or (i.worker_id is not null and not role_can(p_role, p_financial, 'money.view')));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- email sign-in codes ----------
create table email_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  purpose     text not null check (purpose in ('SIGN_IN','LINK','DELETE')),
  code_hash   bytea not null,                         -- HMAC-SHA256(CODE_PEPPER, email || ':' || purpose || ':' || code), made by the API
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index email_codes_recent on email_codes (email, created_at desc);

-- At most 5 codes per email per hour; each lasts 10 minutes; a new code cancels older codes of the SAME purpose only.
-- After 20 wrong tries in 24 hours for an email, no code is checked or issued for it until the window passes.
-- CT429 → HTTP 429. Rows are kept 24 hours (the nightly job purges older ones) so the limits can't be reset.
create function issue_email_code(p_email text, p_purpose text, p_code_hash bytea) returns jsonb
language plpgsql security definer as $$
declare v_email text := lower(btrim(p_email));
begin
  if p_purpose not in ('SIGN_IN','LINK','DELETE') then raise exception 'bad purpose' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email_code:' || v_email, 0));
  if (select count(*) from email_codes where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many codes' using errcode = 'CT429'; end if;
  if (select coalesce(sum(attempts), 0) from email_codes where email = v_email and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too many wrong codes' using errcode = 'CT429'; end if;
  update email_codes set consumed_at = now()
   where email = v_email and purpose = p_purpose and consumed_at is null;
  insert into email_codes (email, purpose, code_hash, expires_at)
  values (v_email, p_purpose, p_code_hash, now() + interval '10 minutes');
  return jsonb_build_object('expires_in_seconds', 600);
end $$;

-- True once for the right code; five wrong tries burn the code.
create function verify_email_code(p_email text, p_purpose text, p_code_hash bytea) returns boolean
language plpgsql security definer as $$
declare c email_codes; v_email text := lower(btrim(p_email));
begin
  perform pg_advisory_xact_lock(hashtextextended('email_code:' || v_email, 0));
  if (select coalesce(sum(attempts), 0) from email_codes where email = v_email and created_at > now() - interval '24 hours') >= 20 then
    return false;
  end if;
  select * into c from email_codes
   where email = v_email and purpose = p_purpose and consumed_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then return false; end if;
  if c.code_hash = p_code_hash and c.attempts < 5 then
    update email_codes set consumed_at = now() where id = c.id;
    return true;
  end if;
  update email_codes set attempts = attempts + 1,
         consumed_at = case when attempts + 1 >= 5 then now() end
   where id = c.id;
  return false;
end $$;

-- Checks a SIGN_IN code; on success returns the user with that verified email, or a new one. Null = wrong code.
create function sign_in_with_email_code(p_email text, p_code_hash bytea) returns uuid
language plpgsql security definer as $$
declare v_email text := lower(btrim(p_email)); v_id uuid;
begin
  if not verify_email_code(v_email, 'SIGN_IN', p_code_hash) then
    return null;                                   -- the API answers 400 CODE_WRONG
  end if;
  select id into v_id from users where email = v_email and deleted_at is null;
  if found then return v_id; end if;
  insert into users (email, email_verified_at) values (v_email, now()) returning id into v_id;
  return v_id;
end $$;

-- Checks a LINK code, then adds email sign-in to the signed-in account (e.g. an Apple user).
create function link_email_code(p_user uuid, p_email text, p_code_hash bytea) returns jsonb
language plpgsql security definer as $$
declare v_email text := lower(btrim(p_email)); cur text;
begin
  select email into cur from users where id = p_user and deleted_at is null for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if cur is not null then
    raise exception 'EMAIL_ALREADY_SET' using errcode = 'CT409'; end if;
  if not verify_email_code(v_email, 'LINK', p_code_hash) then
    return jsonb_build_object('error', 'CODE_WRONG');
  end if;
  if exists (select 1 from users where email = v_email and id <> p_user) then
    raise exception 'EMAIL_IN_USE' using errcode = 'CT409'; end if;
  update users set email = v_email, email_verified_at = now() where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

-- A person sets their own display name (shown to other members of their workspaces, never to workers on receipts).
create function set_display_name(p_user uuid, p_name text) returns jsonb
language plpgsql security definer as $$
begin
  if p_name is not null and length(btrim(p_name)) not between 1 and 60 then
    raise exception 'bad name' using errcode = '22023'; end if;
  update users set display_name = nullif(btrim(p_name), '') where id = p_user and deleted_at is null;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- After a verified Sign in with Apple while signed in: add Apple sign-in to an account that started with email.
create function link_apple(p_user uuid, p_apple_sub text) returns jsonb
language plpgsql security definer as $$
declare cur text;
begin
  if p_apple_sub is null or length(p_apple_sub) = 0 then raise exception 'bad subject' using errcode = '22023'; end if;
  if exists (select 1 from users where apple_sub = p_apple_sub and id <> p_user) then
    raise exception 'this Apple ID is already used by another account' using errcode = 'CT409'; end if;
  select apple_sub into cur from users where id = p_user and deleted_at is null for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if cur is not null and cur <> p_apple_sub then
    raise exception 'a different Apple ID is already linked' using errcode = 'CT409'; end if;
  update users set apple_sub = p_apple_sub where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

-- Apple refresh tokens: one per user per client (the iPhone app's bundle ID, or the web Services ID),
-- so account deletion can revoke each with the right client id.
do $$
declare pk text;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = current_schema() and table_name = 'apple_credentials' and column_name = 'client_kind') then
    alter table apple_credentials add column client_kind text not null default 'APP' check (client_kind in ('APP','WEB'));
    select conname into pk from pg_constraint
     where conrelid = 'apple_credentials'::regclass and contype = 'p';
    if pk is not null then execute format('alter table apple_credentials drop constraint %I', pk); end if;
    alter table apple_credentials add primary key (user_id, client_kind);
  end if;
end $$;

-- ---------- account deletion (replaces calling delete_workspace_data directly) ----------
-- Deletes every workspace this person is the organizer or owner of (all members lose it — the app warns first),
-- leaves every other workspace, revokes sessions and invitations, and scrubs the identity.
-- The API revokes the Apple token BEFORE calling this (it needs apple_credentials).
create function delete_user_account(p_user uuid) returns jsonb
language plpgsql security definer as $$
declare w uuid; deleted uuid[] := '{}';
begin
  if not exists (select 1 from users where id = p_user and deleted_at is null) then
    raise exception 'user not found' using errcode = 'P0002'; end if;
  for w in select workspace_id from memberships where user_id = p_user and role in ('ORGANIZER','OWNER') and status = 'ACTIVE' loop
    perform delete_workspace_data(w);
    deleted := deleted || w;
  end loop;
  update memberships set status = 'REMOVED', removed_at = now(), removed_by = p_user
   where user_id = p_user and status = 'ACTIVE';
  update invitations set status = 'REVOKED', decided_by = p_user, decided_at = now()
   where invited_by = p_user and status = 'PENDING';
  update sessions set revoked_at = now() where user_id = p_user and revoked_at is null;
  delete from apple_credentials where user_id = p_user;
  update invitations set status = 'REVOKED', decided_at = now()
   where email = (select email from users where id = p_user) and status = 'PENDING';
  update users set deleted_at = now(), apple_sub = null, email = null, email_verified_at = null, display_name = null
   where id = p_user;
  return jsonb_build_object('deleted_workspaces', to_jsonb(deleted));
end $$;

-- The workspaces a signed-in person can open (for the switcher and /v1/me).
create function my_workspaces(p_user uuid) returns jsonb
language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'role', m.role,
                  'financial_access', m.financial_access) order by w.created_at), '[]'::jsonb)
  from memberships m join workspaces w on w.id = m.workspace_id
  join users u on u.id = m.user_id
  where m.user_id = p_user and m.status = 'ACTIVE' and u.deleted_at is null
$$;

-- ---------- harden every SECURITY DEFINER function in this schema (same rule 0004 applies again) ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = current_schema()::regnamespace and p.prosecdef loop
    execute format('alter function %s set search_path = %I, pg_temp', f.sig, current_schema());
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;
