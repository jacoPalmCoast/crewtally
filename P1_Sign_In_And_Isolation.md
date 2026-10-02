# Phase 1 — Sign in with Apple, sessions, workspace isolation

> **Built (history).** This phase is done. Baseline 2.0 changes it in Phase 1b: sign-in no longer creates a workspace, the session no longer carries a workspace, and the isolation harness becomes the role matrix. Where this file and P1b differ, P1b wins.

> Before pasting, add these Replit Secrets (from your Apple Developer account):
> - `APPLE_TEAM_ID`
> - `APPLE_KEY_ID`
> - `APPLE_PRIVATE_KEY` (the full contents of the .p8 key)
> - `APPLE_BUNDLE_ID` (your bundle ID)
> - `APPLE_AUDIENCES`: in development `host.exp.Exponent,<your bundle ID>`; in production only `<your bundle ID>`
> - `TOKEN_ENCRYPTION_KEY`: 32 random bytes, base64 (ask the Agent to generate one and show you how to paste it into Secrets; it must not appear in code)

## Goal

The owner signs in with Apple on the iPhone. The server verifies the Apple identity token, creates the user and their workspace on first sign-in, and issues a session. From here on, every API route knows the caller's workspace from the session only. Isolation between workspaces is proven by tests that later phases reuse.

## Read first
- Spec section 3 (sign-in), section 15 (security baseline and account deletion), and invariants 5, 9 and 10 in `replit.md`.
- Apple docs: Sign in with Apple token verification, and `POST https://appleid.apple.com/auth/token` (authorization code exchange). You'll need the exchange again in Phase 7 to revoke tokens at account deletion.

## Build

### Migration `0002_auth.sql` (additive)

**users**

| Column | Type and rules |
|---|---|
| `id` | uuid primary key |
| `apple_sub` | text, unique, not null |
| `created_at` | timestamptz |
| `deleted_at` | timestamptz, null |

**sessions**

| Column | Type and rules |
|---|---|
| `id` | uuid primary key |
| `user_id` | uuid, references users |
| `token_hash` | bytea, unique, not null |
| `created_at` | timestamptz |
| `last_seen_at` | timestamptz |
| `expires_at` | timestamptz |
| `revoked_at` | timestamptz, null |

**apple_credentials**

| Column | Type and rules |
|---|---|
| `user_id` | uuid, primary key, references users |
| `refresh_token_ciphertext` | bytea |
| `iv` | bytea |
| `auth_tag` | bytea |
| `updated_at` | timestamptz |

Don't add a foreign key from `workspaces.owner_id` to `users(id)`: the provided database tests create workspaces without users. Enforce the link in code (sign-in creates the user and the workspace in one transaction).

Also add `payer_display_name text` to `workspaces` in this migration (the name shown as "Paid by" on receipts and in messages; Phase 2 adds the setting).

Don't store the Apple email or name. Request no scopes. The app doesn't need them.

### Server
- `POST /v1/auth/apple` takes `{identityToken, authorizationCode, rawNonce}`.
  - Verify the identity token with `jose` against Apple's JWKS (`https://appleid.apple.com/auth/keys`, cached). Check:
    - `iss` is `https://appleid.apple.com`
    - `aud` is one of `APPLE_AUDIENCES`
    - `exp` hasn't passed
    - the `nonce` claim equals SHA-256(`rawNonce`) as hex
  - Confirm the nonce format with a real sign-in on the phone, then lock it in with a test. If Expo passes the nonce through unhashed, adjust the comparison and explain the change in the gate notes.
  - Exchange `authorizationCode` for a refresh token using a client secret JWT:
    - ES256, signed with `APPLE_PRIVATE_KEY`
    - `iss` = team ID, `sub` = bundle ID, `aud` = `https://appleid.apple.com`
    - valid for 5 minutes
  - Store the refresh token encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
  - In development with Expo Go the exchange fails, because the client is Expo Go and not your bundle ID. When `APP_ENV=development`, log `apple_exchange=skipped_dev` and continue. In production an exchange failure fails the sign-in.
  - In one transaction, find or create the user by `sub`, create their workspace (name "My workspace", USD) on first sign-in, and create a session.
  - The session token is 32 random bytes, base64url. Return it once. Store only the SHA-256 of it. Sessions last 30 days, sliding: each authenticated request extends `expires_at` if more than 24 hours have passed since `last_seen_at`.
- `requireSession` middleware:
  - Reads `Authorization: Bearer <token>` and looks up the hash.
  - Rejects missing, unknown, revoked or expired sessions with 401 `SESSION_EXPIRED`.
  - Sets `req.ctx = {userId, workspaceId}`.
  - All `/v1` routes except `/v1/health`, `/v1/auth/*` and, from Phase 7, `/v1/webhooks/revenuecat` use it. The public pages (`/r`, `/go`, static pages) are outside `/v1` and never use it.
- `GET /v1/me` returns `{workspace:{id, name, currency, locale}, user:{id}}`.
- `POST /v1/auth/signout` sets `revoked_at` on the session.
- Rate-limit `/v1/auth/*` to 10 requests per minute per IP.
- **Isolation harness** (`server/test/helpers/tenancy.ts`) for every later phase:
  - `createOwner()` makes a user, workspace and session directly in the test schema and returns an authed request agent.
  - `expectNotFoundAcrossWorkspaces(route, method, idFromOtherWorkspace)` asserts a 404.

  Every later phase must use it for every route that takes an id.

### Mobile
- Sign-in screen, before the tabs:
  - App name and a one-line purpose.
  - The Apple button from `expo-apple-authentication` (black style in light mode, white in dark).
  - A privacy line: "We don't see your Apple email or name."
- Generate a random 32-byte `rawNonce`, pass SHA-256(rawNonce) to Apple (or the raw value, per the verification note above), then send the token, code and raw nonce to the API.
- Store the session token in `expo-secure-store` and nowhere else.
- On launch: if there's a token, call `/v1/me`. On 401, clear the token and show sign-in.
- On any later 401: keep local drafts (Phase 3 adds them), show "Please sign in again", and return to the same screen after sign-in.
- More → Account shows "Signed in with Apple" and a Sign out button, which confirms and clears the local token.

### Tests
- Signing a test JWT with a locally generated key and a mocked JWKS:
  - valid token signs in and creates exactly one workspace
  - second sign-in with the same `sub` reuses the workspace
  - wrong `iss`, wrong `aud`, expired token, bad signature and nonce mismatch each return 401
- Expired session returns 401. Revoked session returns 401. The sliding expiry extends.
- The token hash is stored; the raw token never appears in the database (query and assert).
- Encryption round trip for the refresh token. A tampered auth tag fails.
- Smoke test: every `/v1` route except health and auth returns 401 without a token.
- Isolation harness self-test: two owners, `/v1/me` returns each owner's own workspace.
- Logs contain no token and no `sub`. Capture the log output in a test and assert.

## Proof to paste at the gate
- The full token verification function.
- `requireSession`.
- The session creation SQL.
- The encryption helper.
- The test file names and counts.

## Try it on your phone
- Sign in with Apple in Expo Go. You land on the tabs.
- Kill the app and reopen it. You're still signed in.
- Sign out, then sign in again. You get the same workspace (More → Diagnostics shows the first 8 characters of the workspace ID; add that line to Diagnostics in this phase).

## Built later in Phase 1 (history)
- **Developer sign-in:** `POST /v1/auth/dev`. It works only when `APP_ENV=development` and the Secret `DEV_SIGNIN_CODE` is set; otherwise it refuses. The code is compared in constant time, and the route is rate-limited like the other `/v1/auth/*` routes. Labels `owner-a` and `owner-b`; the user's `apple_sub` is `dev:<label>`. The mobile sign-in screen shows **Developer sign-in (test only)** in development builds only. Phase 1b adds `member-c` and `member-d`.
- **Secrets from now on:** the owner makes each secret value in the Shell (`openssl rand -base64 32`, or `openssl rand -hex 8` for `DEV_SIGNIN_CODE`), pastes it into Secrets, then clears the Shell. The Agent never generates a secret value in chat. The production `TOKEN_ENCRYPTION_KEY` (TestFlight checkpoint) is made the same way, never copied from development.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 1 ready for review".
