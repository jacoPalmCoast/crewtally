# Phase 1b — Accounts, workspaces, roles and the Home partner (rework of Phase 1)

> **Before pasting:**
> 1. Upload the baseline 2.0 pack into the project. Replace exactly these: `docs/`, `db/provided/`, the phase files (`P*`, `B*`), `00_START_HERE.md`, `01_PROJECT_BRIEF_AND_INVARIANTS.md`, `GATE_CHECKLIST_AND_QA_LOG.md`, `APP_STORE_CHECKLIST_iOS.md`, `VALIDATION_SESSIONS.md` and `PM_Migration_From_Web_App.md`. **Never** upload over `db/migrations/`, `db/schema.sql`, `db/tests/` or `db/run_db_tests.sh` in the project: they're already there and must not change. Keep everything else the Agent built.
> 2. Add the Replit Secret `DEV_SIGNIN_CODE` if you haven't yet (in the Shell: `openssl rand -hex 8`, paste the result into Secrets, then clear the Shell). Keep `APP_ENV=development`.
> 3. Add the Replit Secret `CODE_PEPPER`: in the Shell run `openssl rand -base64 32`, paste the result into Secrets, then clear the Shell. Don't ask the Agent to make it. It's the key the server uses to hash invitation and email codes.
> 4. Add the Replit Secret `BUSINESS_ENABLED` = `false`.
> 5. Add `PUBLIC_BASE_URL` (a setting, not a secret; Secrets is fine): your dev URL plus `/api`, for example `https://<your dev domain>/api`. Ask the Agent for the exact dev domain (`$REPLIT_DEV_DOMAIN`). It becomes `https://crewtallyapp.com` in Phase 8.

## Goal

Phase 1 gave every user exactly one workspace, created at sign-in. Baseline 2.0 needs one person in several workspaces, with roles. This phase:

- replaces `replit.md` with the 2.0 `01_PROJECT_BRIEF_AND_INVARIANTS.md`;
- applies the provided migration `0003_identity_and_memberships.sql` and its tests;
- stops creating a workspace at sign-in;
- moves every route onto one permission check (`require_member`) using the workspace named in a header;
- adds creating and switching workspaces, and the **Home partner** (invite, join, leave, remove);
- turns the isolation harness into a **role matrix** that later phases extend.

Business screens are **not** built here. Business roles exist in the database and the role matrix tests, and `POST /v1/workspaces` refuses `BUSINESS` while `BUSINESS_ENABLED=false`.

Nothing in this phase touches money functions, `fn_earned`, or the ledger.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: sections "Identity and workspaces", "Roles and permissions", "Invitations", "Home partner", "Sign-in and first run", "Account deletion".
- `db/provided/migrations/0003_identity_and_memberships.sql` from top to bottom. Every function you call in this phase is there, with its error codes.
- `db/provided/tests/11_identity_memberships.sql`: it shows how each function behaves.
- Screens in `docs/screens-2.0/mobile/`: `SignIn`, `AccountSignIn`, `ChooseWorkspace`, `Welcome` (layout only), `WorkspaceSwitcher`, `JoinTeam`, `JoinInvite`, `JoinedTeam` (with Home wording: "You're helping with <workspace>. <Organizer> manages the plan."; its CSV row describes the Business welcome, which is B1), `InviteExpired`, `HomeInvite` (it replaces 1.4's `InvitePartner`), `HomeInviteReady`, `InvitePending`, `BAccessRemoved` (use it for any removed member, with Home wording), `More`, `Account`, `Diagnostics`.
- Your own Phase 1 code: the sign-in routes, `requireSession`, the dev sign-in route, the isolation harness and the mobile sign-in screen. Read them before changing anything.

## Build

### 1. `replit.md` and the database
- Replace `replit.md` with `01_PROJECT_BRIEF_AND_INVARIANTS.md` (baseline 2.0). Re-read it.
- Move `db/provided/migrations/0003_identity_and_memberships.sql` to `db/migrations/` and `db/provided/tests/11_identity_memberships.sql` to `db/tests/`. Load the migration verbatim.
- Leave `0004_plans_and_project_use.sql` and `0005_crew.sql` in `db/provided/` (Phase 2). The baseline 1.4 files `0003_plans_and_project_use.sql` and `0004_crew.sql`, if you copied them anywhere, are superseded: delete those copies (they were never applied), and say so at the gate.
- Run the migration against the development database. The migration turns every existing workspace owner into that workspace's `ORGANIZER`. Paste `select w.name, m.role from workspaces w left join memberships m on m.workspace_id = w.id;` at the gate.

### 2. Server: sessions and the one door

**Session context.** `requireSession` now sets `req.ctx = {userId, sessionId}` only. Remove `workspaceId` from the session context everywhere.

**Workspace routes.** Add one helper and use it for every route that touches workspace data:

```ts
// server/src/auth/member.ts
// Runs `fn` inside one transaction, after require_member(workspace, user, action).
// The workspace comes from the X-Workspace-Id header (must be a UUID; otherwise 404).
withMember(req, action, async (tx, member) => { ... })
```

- It begins a transaction, calls `select require_member($1, $2, $3)`, and passes the result (`role`, `financial_access`, `worker_id`, `kind`) to `fn`. Every query in `fn` uses `tx`, so the actor set by `require_member` covers the money functions called inside.
- Error mapping (one table, used everywhere; spec section 4.6 has the full list):

| From the database | HTTP | Body `error` |
|---|---|---|
| `CT404`, missing or malformed `X-Workspace-Id` | 404 | `NOT_FOUND` |
| `CT403` (no right; also a `recorded_by` that isn't the signed-in person) | 403 | `FORBIDDEN` |
| `CT409` | 409 | `CONFLICT` |
| `CT410` | 410 | `INVITATION_NOT_AVAILABLE` |
| `CT429` | 429 | `TOO_MANY` |
| `22023` (bad name, bad time zone, no role) | 400 | `INVALID` |
| `22023` with message `WORKER_RECORD_REQUIRED` (`change_member_role` to `WORKER` with no worker record) | 400 | `WORKER_RECORD_REQUIRED` |
| `23514` (role doesn't fit the workspace kind, from `create_invitation`) | 422 | `ROLE_DOES_NOT_FIT` |
| `P0002` | 404 | `NOT_FOUND` |
| Result `{"error":"INVITATION_NOT_AVAILABLE"}` | 410 | `INVITATION_NOT_AVAILABLE` |
| Result `{"error":"INVITATION_CODE_WRONG"}` | 400 | `INVITATION_CODE_WRONG` |
| (P1c) `sign_in_with_email_code` null, or result `{"error":"CODE_WRONG"}` | 400 | `CODE_WRONG` |

- The two invitation accept functions answer with an error **result** instead of raising (so the status change they make is kept). Map those in the routes. Keep the 401 body Phase 1 built (`SESSION_EXPIRED`); don't rename it.
- Register routes through a small wrapper that records `{method, path, action}` in a route table: `memberRoute('post', '/v1/projects', 'projects.manage', handler)`. Public and session-only routes register as `publicRoute` or `sessionRoute`. Every `/v1` route is one of the three, and every `memberRoute` declares an action.
- A test lists the Express router stack and fails if any `/v1` route is missing from the route table, or any member route has no action.

**Idempotency.** Every write in this phase takes an `operation_id` (a UUID made on the phone and kept through retries). Build two helpers in one file and use them for every write route:

```ts
// server/src/idempotency.ts
// Both run inside tx. Same key + same request hash → the stored response, nothing runs again.
// Same key, different hash → 409 OPERATION_REUSED. Otherwise run fn and store {request_hash, response}.
withUserIdempotency(tx, userId, operationId, body, fn)                    // user_idempotency_keys (session routes, no workspace)
withWorkspaceIdempotency(tx, workspaceId, userId, operationId, body, fn)  // idempotency_keys (member routes)
```

- The request hash always covers the signed-in user id plus the body, so one person's replayed id never returns another person's response. Every new route from now on does the same.
- Session routes use `withUserIdempotency`: `POST /v1/workspaces`, `PATCH /v1/me`, `POST /v1/invite/accept`, `POST /v1/invite/accept-code`. Member routes use `withWorkspaceIdempotency`: `PATCH /v1/workspace`, `DELETE /v1/members/:userId`, `PATCH /v1/members/:userId`, `POST /v1/invitations`, `DELETE /v1/invitations/:id`. P1c (account linking) and P2 onward reuse these two helpers; don't build a third.
- Never store a raw invitation token or code in either idempotency table.

**Existing routes.** Move every existing workspace route (from Phase 1, and anything added since) onto `withMember`. `GET /v1/me` changes (below).

**Sign-in (Apple and dev).** Keep token verification, nonce, code exchange, encryption, sliding sessions and rate limits exactly as built and tested in Phase 1. Change only this: find or create the **user** and create the session; **don't create a workspace**. Remove the "first sign-in creates My workspace" code and update its tests to assert that sign-in creates no workspace.

**Dev sign-in.** Keep `POST /v1/auth/dev` exactly as guarded in Phase 1 (only with `APP_ENV=development` and `DEV_SIGNIN_CODE` set, constant-time compare, rate-limited). Allow four labels: `owner-a`, `owner-b`, `member-c`, `member-d` (`apple_sub` = `dev:<label>`, the format Phase 1 built). Any other label → 400. `has_apple` is false for `dev:` users.

### 3. Server: new routes

| Route | Kind | Action | What it does |
|---|---|---|---|
| `GET /v1/config` | public | — | `{business_enabled}`. Nothing else in this phase. |
| `GET /v1/me` | session | — | `{user:{id, display_name, has_apple, email}, workspaces: my_workspaces(user)}`. `has_apple` is false for `dev:` users. Never returns other users' data. |
| `PATCH /v1/me` | session | — | `{display_name, operation_id}` → `set_display_name`. 1–60 characters, or empty to clear. |
| `POST /v1/workspaces` | session | — | `{kind, name, timezone, operation_id}`. Calls `create_workspace` inside `withUserIdempotency`. `kind=BUSINESS` → 404 while `BUSINESS_ENABLED` isn't `true`. Name 1–80 characters. Timezone: the device's IANA zone; invalid → 400. Same `operation_id` → the same workspace. Returns the workspace. |
| `GET /v1/workspace` | member | `workspace.read` | `member_permissions(workspace, user)` plus the workspace's name, kind, currency and default time zone. The apps shape screens from `can`. |
| `PATCH /v1/workspace` | member | `settings.edit` | Rename only, in this phase. |
| `GET /v1/members` | member | `workspace.read` | Active members: display name; if none, the invitation label (to roles with `members.manage` only); otherwise the role ("Partner"), role, money access, joined date. No emails, except to roles with `members.manage`. |
| `DELETE /v1/members/:userId` | member | `workspace.read` | Calls `remove_member` (leaving when `:userId` is the caller; otherwise the function checks `members.manage` itself). It also revokes the pending invitations the removed person sent. |
| `PATCH /v1/members/:userId` | member | `members.manage` | Calls `change_member_role`. Role required (400 `INVALID`); `WORKER` needs an existing worker record (400 `WORKER_RECORD_REQUIRED`). A demotion revokes the pending invitations the person could no longer send. Home has nothing to change yet; keep the route for Business and test the refusals. |
| `POST /v1/invitations` | member | `members.manage` | `{role, email, name (optional, the inviter's own label), operation_id}`. Server makes the invitation id, a 32-byte random token (base64url) and a 6-digit code (`crypto.randomInt`). Stores `sha256(token)` and `HMAC-SHA256(CODE_PEPPER, email + ':' + code)` through `create_invitation` (the name goes in `p_invitee_name`). Returns the token, the code and the link `${PUBLIC_BASE_URL}/join/<token>` **once**. Binding a worker record (a `WORKER`, or a `LEAD` with a worker) needs `money.view`; otherwise 403 (Business, B1). Idempotent: a retry with the same `operation_id` returns the same invitation with `token` and `code` set to null and `already_created: true` (the raw token and code are never stored anywhere); the app then offers **Revoke and invite again**. |
| `GET /v1/invitations` | member | `members.manage` | Pending and recent invitations: name, email, role, status, expiry. Never the token or code. |
| `DELETE /v1/invitations/:id` | member | `members.manage` | `revoke_invitation`. Allowed for invitations you sent, or ones you could have created yourself; otherwise 403. |
| `POST /v1/invite/peek` | public | — | `{token}` → `peek_invitation(sha256(token))`. Rate limit 20/min per client IP. Same answer for unknown, used, revoked and expired. |
| `POST /v1/invite/accept` | session | — | `{token, operation_id}` → `accept_invitation(user, sha256(token))` inside `withUserIdempotency`. The function re-checks that the inviter is still active and allowed; otherwise 410. |
| `POST /v1/invite/accept-code` | session | — | `{email, code, operation_id}` → `accept_invitation_code(user, email, HMAC-SHA256(CODE_PEPPER, email + ':' + code))` inside `withUserIdempotency`. Rate limit 10/min per user. The database counts wrong codes per person and email: after 5 in 24 hours that person gets the same 400 even with the right code. A stranger's guesses never touch the invitation. |
| `POST /v1/invite/decline` | public | — | `{token}` → `decline_invitation`. |
| `GET /api/join/:token` | public page | — | A small HTML page: "You've been invited to help with <workspace>" (from peek), "Open CrewTally on your iPhone" and, after Phase 1c, "Continue on the web". If not available: one "This invitation isn't available. Ask for a new one." page for every case. `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. |

Logging: invitation and code routes log operation id, status and invitation id only. Never the email, token or code.

### 4. Mobile

**Workspace context.**
- A `WorkspaceProvider` holds the current workspace id, its `kind`, `role` and `can`. It's saved per user on the device (AsyncStorage is fine; it isn't secret).
- The API client adds `X-Workspace-Id` to every workspace route. Every write sends an `operation_id` made on the phone and kept through retries.
- On a 404 for the current workspace (from `GET /v1/workspace`): show the Access removed screen ("You no longer have access to this workspace. Your account and other workspaces are still here." No names: after the 404 the app can't fetch them; the same screen for removed and left), then the switcher. Drop the saved current id.
- Screens show or hide actions from `can`. Hiding is for tidiness only: the server decides.

**First run and sign-in** (screens `SignIn`, `AccountSignIn`, `ChooseWorkspace`):
- `SignIn` offers **Get started** and **Join my team**. **Try the Home sample** arrives in Phase 2 with the sample data; leave its place in the layout empty for now. Keep the line "CrewTally never moves money. It keeps a record of payments you make yourself." and a Privacy link (`https://crewtallyapp.com/privacy`, opens in the in-app browser). These two lines are required for App Review, even though the design dropped them.
- **Get started** → `AccountSignIn`: Sign in with Apple (unchanged component and nonce flow), plus, in development builds only, **Developer sign-in (test only)** with the four labels and the code field. Then:
  - no workspaces → `ChooseWorkspace`: **Home** (create), **Join a team**. Show **Business** only when `GET /v1/config` says `business_enabled` (add that tiny public route; it returns only that flag).
  - one or more → open the last used workspace, or the first.
- Creating a Home workspace asks for a name (default "My home") and uses the device's time zone. Then show `Welcome` with "Create my project". "Create my project" goes to the Today tab for now; Phase 2 builds the setup screens. Leave the **Explore the sample** slot empty; Phase 2 adds it with the sample data. This phase has no sample mode at all.

**Join a team** (`JoinTeam` → `JoinInvite` → `JoinedTeam`):
- If not signed in, sign in first, then come back.
- Enter the email the invitation was sent to and the 6-digit code. Show the result: workspace name and role. Home wording: "You're helping with <workspace>. <Organizer> manages the plan."
- A wrong code, an expired invitation, and "you've tried too often today" get the same answer from the server, on purpose (nobody can probe which invitations exist). Wrong codes never lock the invitation: they only stop the person guessing, after 5 in 24 hours for that email. Show: "That code didn't work. Check the email address and the code, or ask for a new invitation." A link token that isn't available shows `InviteExpired` ("This invitation isn't available. Ask for a new one.").
- Invitation links are `${PUBLIC_BASE_URL}/join/<token>`. In development that's `https://<dev domain>/api/join/<token>`, which opens the landing page in Safari. Links of the form `https://crewtallyapp.com/join/<token>` open the app only from TestFlight onward (universal links, Phase 8). In Expo Go, the code is the way in. Don't build anything for Expo Go deep links.

**Home partner** (organizer only; `HomeInvite`, `HomeInviteReady`, `InvitePending`):
- More → **Partner**. If there's no partner and no pending invitation: invite form (partner's name for your own reference, and email). Copy says the partner can record work and payments, add workers and projects; can't change pay rates, remove people, invite others or manage the plan; and pays nothing.
- After creating: show the link and code once, with **Share** (the iOS share sheet; message text: "Join me on CrewTally to help keep track of <workspace>. Open <link> on your iPhone, or enter code <code> with this email address: <email>. It works for 7 days.") and **Copy**. Then a pending card: name, email, expiry date, **Revoke**, and **Resend** (revokes this invitation, then creates a new one to the same email: new link, new code, new 7 days).
- With a partner: their name, "Partner since <date>", **Remove partner** (confirm: "<name> will lose access to <workspace>. Their work and payments stay in your records.").
- The partner sees More → **Leave <workspace>** instead (confirm, then switcher).

**Workspace switcher** (`WorkspaceSwitcher`): More → Workspaces. Each row: name, Home/Business, your role. **Create a Home workspace**. Switching clears in-memory screens and reloads from the API.

**Account** (More → Account): **Your name** (shown to people in your workspaces; never on receipts) → `PATCH /v1/me`. "Signed in with Apple", or "Developer sign-in" for `dev:` users (`has_apple` is false for them), Sign out. Email sign-in and linking arrive in Phase 1c. Members without a name show as their invitation label to the organizer, otherwise "Partner".

**Diagnostics:** first 8 characters of the user id, current workspace id, role, and `kind`.

### 5. Tests

**Database:** `db/tests/11_identity_memberships.sql` (provided) passes with all earlier files.

**Server** — replace the isolation harness with a role harness in `server/test/helpers/tenancy.ts`:
- `createUser(label)`, `createWorkspace(user, kind)` (calls `create_workspace`), `addMember(workspace, user, role, {financial, workerId})` (inserts through the provided functions: create and accept an invitation), `agentFor(user)` (session + `X-Workspace-Id` helper).
- `expectNotFoundAcrossWorkspaces(route, method, idFromOtherWorkspace)` keeps working.
- **Role matrix:** a table of every registered member route with its declared action. It tests the **route gate** (the declared action, checked through `require_member`), nothing more. Every case gets fresh fixtures: run each case in its own transaction and roll it back, or give each case its own setup, so a remove or revoke in one case never changes another. For each of: organizer, partner, business owner, admin with money access, admin without, lead, worker, removed member, and an outsider, assert:
  - outsider and removed member → 404;
  - a role without the declared action → 403;
  - a role with the declared action → not 403 and not 404 from the gate (the handler may still answer 400, 403 or 409 from the function; that's fine here).
  Business roles are created directly with the provided functions even though Business screens don't exist yet.
- **Function-level refusals** (their own tests, separate from the matrix): partner removes the organizer → 403; organizer tries to leave → 403; partner invites → 403; organizer invites an `ADMIN` → 403 (`can_invite` refuses first; `ROLE_DOES_NOT_FIT` stays mapped as a backstop); admin changes an admin → 403; anyone changes their own role → 403; `PATCH /v1/members/:userId` with no role → 400 `INVALID`; a lead with no worker record changed to `WORKER` → 400 `WORKER_RECORD_REQUIRED`; admin without money access invites a `WORKER` bound to a worker record → 403; admin without money access revokes the owner's money-admin invitation → 403.
- The route-table completeness test (above).
- Sign-in creates no workspace (Apple and dev). `GET /v1/me` lists exactly the caller's memberships.
- `POST /v1/workspaces`: HOME works; BUSINESS → 404 with the flag off; bad time zone → 400; same `operation_id` twice → one workspace and the same response; same `operation_id` with a different body → 409; the same `operation_id` from a different user → a separate result (never the first user's response).
- Invitations: create → peek shows name and role only → accept by token → partner sees the workspace; second partner invite → 409; partner can't invite (403); revoke → peek unavailable; accept twice with the same `operation_id` → the same response; code path: five wrong codes from one signed-in person → that person gets 400 `INVITATION_CODE_WRONG` even with the right code, while another signed-in person with the right code still joins (a stranger's guesses never lock the invitation, and the link still works); with the Business fixtures, an admin invites a lead and is then removed → that invitation's link answers 410; `code_hash` is the HMAC with `CODE_PEPPER` (recompute it in the test); token and code never appear in the database (query `invitations` and the idempotency table and assert neither the raw token nor the code is present) or in logs (capture log output and assert).
- Leaving and removal: after removal, every member route for that workspace returns 404 for that person, immediately (no cached permissions).
- The actor: every money route that exists leaves `recorded_by` = the signed-in user, never null. (If no money route exists yet, call `record_payment` through `withMember` in a test-only path inside the test file, not in app code.) Later phases add each new money route to this test. A supplied `recorded_by` naming someone else → 403.
- `X-Workspace-Id` missing, malformed, or another workspace's id → identical 404 bodies.

**Mobile:** API client sets the header and an `operation_id` on writes (the same one on a retry); workspace provider handles a 404 by clearing the saved workspace; `can` hides the Partner screen for a partner.

## Proof to paste at the gate
- `withMember` and the error mapping.
- `withUserIdempotency` and `withWorkspaceIdempotency`, and the request hash (showing the user id is in it).
- The route table and the completeness test.
- The role matrix test (the table and the loop), and its pass count.
- The Apple sign-in transaction after the change (showing no workspace is created).
- The invitation create route, showing where the token and code are generated, hashed (SHA-256 for the token, HMAC with `CODE_PEPPER` for the code) and returned, and the link built from `PUBLIC_BASE_URL`.
- The output of the memberships query from Build step 1.
- Test file names and counts for all suites.

## Try it on your phone (Expo Go, dev sign-in)
1. Sign in as **owner-a**. If Phase 1 already created a workspace for owner-a, it opens (you're its organizer). Otherwise, create a Home workspace.
2. More → Partner → invite any email you choose. Copy the code.
3. Sign out. Sign in as **member-c**. You have no workspaces: tap Join a team, enter the same email and the code. You land in owner-a's workspace as Partner.
4. As member-c: More shows **Leave**, not Partner. Diagnostics shows role PARTNER. Set Your name in Account (say "Casey").
5. Sign out, sign in as owner-a: More → Partner shows Casey. Remove partner.
6. Sign in as member-c: you see "Access removed", then the switcher with nothing in it. Create your own Home workspace.
7. Sign in as **owner-b**: owner-b sees none of owner-a's or member-c's workspaces.
8. Check the pending-invitation card: invite a new email as owner-a. Copy the link and open it in Safari on your phone: it starts with your dev URL and `/api/join/`, and shows "You've been invited to help with <workspace>". Back in the app, Revoke. The code no longer works for member-d, and the link now says "This invitation isn't available. Ask for a new one."

## Carried items (from Phase 1)
- In the Expo Go build on your iPhone, Apple's sign-in module isn't available (we saw `ExpoAppleAuthentication=false` on 1 October), so real Apple sign-in is tested in the first TestFlight build.
- Per-client-IP rate limiting behind Replit's proxy is fixed in Phase 1c (it protects the public email-code and invitation routes). Phase 8 checks it in production.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 1b ready for review".
