-- Phase 1 authentication and ownership records. Workspace ownership is linked
-- in the sign-in transaction so legacy workspace fixtures remain independent.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_sub text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX sessions_user_active_idx
  ON sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE apple_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  refresh_token_ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces
  ADD COLUMN payer_display_name text;