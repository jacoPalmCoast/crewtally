-- Texted receipt links: open, expire, revoke, acknowledge once, questions need a note.
do $$
declare ws uuid; ln uuid; h bytea := sha256('token-abc'::bytea); h2 bytea := sha256('token-old'::bytea);
        r jsonb; v share_links; failed boolean;
begin
  insert into workspaces (owner_id, name) values (gen_random_uuid(),'L') returning id into ws;
  insert into share_links (workspace_id, target_type, target_id, view, view_worker_id, token_hash, expires_at)
    values (ws,'RECEIPT',gen_random_uuid(),'WORKER',gen_random_uuid(),h, now() + interval '30 days') returning id into ln;
  insert into share_links (workspace_id, target_type, target_id, view, view_worker_id, token_hash, expires_at)
    values (ws,'RECEIPT',gen_random_uuid(),'WORKER',gen_random_uuid(),h2, now() - interval '1 day');
  v := open_share_link(h); assert v.open_count = 1 and v.first_opened_at is not null;
  v := open_share_link(h); assert v.open_count = 2;
  failed := false; begin perform open_share_link(h2); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'expired link refused';
  failed := false; begin perform open_share_link(sha256('nope'::bytea)); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'unknown link refused';
  r := acknowledge_share_link(h, 'RECEIVED', 'Dee Thompson', null); assert r->>'status' = 'recorded';
  r := acknowledge_share_link(h, 'RECEIVED', 'Dee Thompson', null); assert r->>'status' = 'already_confirmed';
  failed := false; begin perform acknowledge_share_link(h, 'QUERY', null, '  '); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'question needs note';
  r := acknowledge_share_link(h, 'QUERY', null, 'I think Tuesday was a full day'); assert r->>'status' = 'recorded';
  update share_links set revoked_at = now() where id = ln;
  failed := false; begin perform acknowledge_share_link(h, 'QUERY', null, 'x'); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'revoked link refused';
  assert (select count(*) from acknowledgments where share_link_id = ln) = 2;
  raise notice '07_share_links: PASS';
end $$;
