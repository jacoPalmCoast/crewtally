# Phase 1c — Web app, email sign-in, Sign in with Apple on the web

> **Before pasting:**
>
> **A. Email service (needed for this phase).**
> 1. Make an account with **Resend** (resend.com) or **Postmark** (postmarkapp.com). Either is fine. Pick one.
> 2. In the provider, add the sending domain `crewtallyapp.com`. It shows a few DNS records (TXT records for SPF and DKIM, sometimes a CNAME for the return path). Add them exactly as shown at your domain registrar. Wait until the provider says the domain is verified. This can take from minutes to a few hours.
> 3. Create an API key that can only send email.
> 4. Add these Replit Secrets:
>    - `EMAIL_PROVIDER` = `resend` or `postmark`
>    - `EMAIL_API_KEY` = the key from step 3
>    - `EMAIL_FROM` = `CrewTally <codes@crewtallyapp.com>` (any address on the verified domain)
> 5. Check your provider's limits for new accounts. Some only let a new account send to your own address until they review it. If that happens, ask them to review the account; until then, test with your own email addresses. (Listed in spec section 19, "Things to confirm before building".)
>
> **B. Sign in with Apple on the web (you can do this later; the web Apple button stays hidden until it's done).**
> 1. Ask the Agent to print the dev domain: in the Shell, `echo $REPLIT_DEV_DOMAIN`. Write it down (it looks like `something.replit.dev`).
> 2. Go to developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers** → **+** → **Services IDs** → Continue.
> 3. Description: `CrewTally web`. Identifier: `com.crewtallyapp.crewtally.web`. Continue → Register.
> 4. Open the new Services ID. Tick **Sign in with Apple** → **Configure**:
>    - Primary App ID: `com.crewtallyapp.crewtally`
>    - Domains and Subdomains: `crewtallyapp.com` and your dev domain from step 1
>    - Return URLs: `https://crewtallyapp.com/app/auth/apple` and `https://<your dev domain>/app/auth/apple`
>    - Next → Done → Continue → **Save**.
> 5. If Apple shows a domain verification step (a **Download** button for a file called `apple-developer-domain-association.txt`), download the file. Apple checks it at the root of the domain: `https://<dev domain>/.well-known/apple-developer-domain-association.txt` (not under `/app`). The Agent decides where it goes: only `/api` reaches the API and the web app lives under `/app`, so the Agent finds which artifact answers the root of the dev domain (or adds the `/.well-known` path to the API artifact, if Replit allows it) and tells you exactly where to upload the file. Upload it there, and the Agent confirms with `curl -i` that the root URL returns the file with status 200. Then click **Verify** for the dev domain. `crewtallyapp.com` can only be verified in Phase 8, once the domain points at Replit. If Apple doesn't show a verification step, skip this.
> 6. Add these Replit Secrets:
>    - `APPLE_WEB_SERVICES_ID` = `com.crewtallyapp.crewtally.web`
>    - `APPLE_WEB_RETURN_URL` = `https://<your dev domain>/app/auth/apple`
>
>    The existing `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` are reused. If the dev domain ever changes, update step 4 and this secret.
>
> **C.** Keep `APP_ENV=development`, `DEV_SIGNIN_CODE`, `CODE_PEPPER`, `PUBLIC_BASE_URL` and `BUSINESS_ENABLED=false` as they are.
>
> **D. Two things to confirm (spec section 19).**
> - **C4, web session length:** web sessions last 30 days and slide with use, like the phone. That's accepted by default. If you want something shorter for shared computers, say so before pasting.
> - **C3, same Apple user on iPhone and web:** nothing to do now. The Agent checks it in web try-it step 6.

## Goal

The web app becomes a second way into the same account and the same records. This phase builds its skeleton and everything about getting in:

- a new **web artifact** (React + TypeScript + Vite) with the app shell, design tokens and layout;
- **email code sign-in** on the web **and** on iPhone;
- **Sign in with Apple on the web** (hidden until part B above is done);
- **account linking, both ways**: an Apple account adds email sign-in after proving the email, and an email account adds Sign in with Apple;
- **web sessions**: an HttpOnly cookie, CSRF protection and an Origin check;
- on the web: joining by invitation link or code, the workspace chooser and switcher, Home workspace creation, role-shaped navigation, and the organizer's partner page (invite, revoke, remove);
- the web states for access denied, access removed, page not found and connection errors.

Not in this phase: projects, workers, money or any record screens on the web (Phase 2 onward), purchases (never on the web), the public website (Phase 7). **No demo routes** of any kind.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: sections 4 "Identity and workspaces", 5 "Roles and permissions", 6 "Sign-in and first run", 7 "Invitations", 8 "Home partner", 12 "Web app", 16 "API surface" and 17 "Design system and accessibility".
- `db/migrations/0003_identity_and_memberships.sql`, the parts for `sessions.client` and `csrf_hash`, `email_codes`, `issue_email_code`, `verify_email_code`, `sign_in_with_email_code`, `link_email_code`, `link_apple`, `user_idempotency_keys`, `invitation_code_attempts`, `set_display_name`, `apple_credentials.client_kind`, and the invitation functions. Every function you call here is already there.
- `docs/SCREEN-COVERAGE-2.0.csv`: every row with `build_phase` = `P1c`. Their pictures are in `docs/screens-2.0/web/desktop/<id>.png` and `docs/screens-2.0/web/mobile/<id>.png`: `choose`, `signin`, `verify`, `home-setup`, `setup-ready`, `join`, `invite`, `invite-expired`, `workspaces`, `invite-person`, `invite-review`, `invitations`, `member`, `empty-dashboard`, `access-denied`, `access-removed`, `load-error`, `not-found`. Read each row's `rules_and_conflicts`: it says what the picture gets wrong.
- iPhone screens `AccountSignIn` and `Account` in `docs/screens-2.0/mobile/` (the email parts).
- Your own Phase 1 and 1b code: `requireSession`, the Apple sign-in route and its tests, the developer sign-in route, `withMember`, `withUserIdempotency`, the route table, the role harness and the invitation routes.

## Build

### 1. The web artifact
- Create `web/` as its own Replit artifact: React + TypeScript (strict) + Vite, React Router.
- Serve it under the path **`/app`** on the same domain as the API, so every API call is same-origin (`/api/v1/...`) and the public website can take `/` in Phase 7. If Replit's artifact settings can't give it `/app`, stop and tell me what it offers.
- **URL layout (every later phase uses it):** website at `/` (Phase 7), app pages at `/app/…`, and every page inside a workspace at **`/app/w/:workspaceId/…`**. The workspace id in the URL is the current workspace. Below, `…/x` means `/app/w/:workspaceId/x`. `/app` on its own opens the last used workspace's `…/today` (that last id is kept in `localStorage` per user, wrapped in try/catch; it isn't secret and nothing breaks without it).
- One API client module (`web/src/api/client.ts`). Every call goes through it. It:
  - sends `credentials: 'same-origin'`;
  - adds `X-Workspace-Id` on workspace routes, taken from the URL's `:workspaceId`;
  - adds `X-CSRF-Token` on POST, PUT, PATCH and DELETE (read from the `__Host-ct_csrf` cookie);
  - creates an `operation_id` (`crypto.randomUUID()`) when a form opens and reuses it on every retry of that form;
  - maps errors: 401 → sign-in page (then back to the same page), except on the sign-in pages themselves; 403 → Access not available; 404 on `GET /v1/workspace` → Access removed; network error or 5xx → Connection error; 400, 402 and 409 are left to the screen.
- **Design tokens.** Put the 2.0 tokens in `shared/` (one file, used by mobile and web): Home accent `#086b60`, Business accent `#145d67`, deep `#103e37`, background `#f6f8f5`, line `#dce5df`, copper `#a36036`, plus their dark-mode values (spec section 17, including the Business dark accent `#8fd3e0`). The web uses them as CSS custom properties. Full dark mode from `prefers-color-scheme`. System font stack.
- **Layout** (`docs/screens-2.0/web/desktop` and `web/mobile`, spec section 12.1):
  - Over 1100 px: left sidebar (238 px) with the CrewTally mark, the workspace card (name, kind, your role; opens the switcher), navigation, and the account menu at the bottom.
  - 761–1100 px: a narrower sidebar (205 px); columns stack.
  - 760 px and under: a top bar with a menu button that opens a drawer, plus a bottom bar with four quick links.
  - Every control is reachable by keyboard, with a visible focus ring. Targets are at least 44 px. Every status has a text label and an icon. WCAG 2.1 AA. No gradients, glass effects or decorative animation.
- **Navigation is shaped by the server's permissions.** On every `…/` page, call `GET /v1/workspace` and build the menu from `can`. In this phase the menu has: **Today** (the workspace home), **Partner** (only with `members.manage`, Home), **Workspaces**, **Account**. Later phases add items the same way. Hiding is for tidiness: the server decides.
- **No demo code.** Don't build or copy any `demo`, `design`, "Design preview", "Reset sample records", "Continue in demo", role switcher, private preview link or `mobile-preview` route. Don't store records or drafts in the browser (this holds for every later phase too). The design pack's JavaScript is a picture of the screens, not code to copy (invariant 18).
- `npm run test:web` runs vitest with React Testing Library for the web artifact.

### 2. Email (server)
- `server/src/email/` has one adapter with one function: `send({to, subject, text, html})`.
  - `EMAIL_PROVIDER=resend` or `postmark` picks the transport. Each is a small HTTPS call with the key from `EMAIL_API_KEY` and the sender from `EMAIL_FROM`. Check the provider's current API docs for the exact request shape.
  - A **fake transport** for tests and for development without a key: it appends `{to, subject, text}` to an in-memory outbox. The outbox is read only by test code through `server/test/helpers/outbox.ts`. No route, log line or debug page shows it. It never writes to the console.
  - The fake transport is used only when `APP_ENV` is `test`, or `development` with no `EMAIL_API_KEY`. With `APP_ENV=production` and no key, the server refuses to start.
- Emails are plain and short. Escape every value you put in HTML.
  - **Sign-in code.** Subject "Your CrewTally sign-in code". Body: "Your code is 123456. It works for 10 minutes. If you didn't ask for it, you can ignore this email." No links.
  - **Link code.** Subject "Confirm your email for CrewTally". Same body, plus "This adds email sign-in to your CrewTally account."
  - **Invitation** (only when the organizer ticks "Email the invitation for me"): subject "You're invited to help with <workspace>". Body: "You've been invited to help keep records for <workspace> on CrewTally. Open this link: <link>. Or open CrewTally, choose Join my team, and enter this email address and the code <code>. It works for 7 days. If you weren't expecting this, ignore this email." The apps never claim an invitation email was delivered; they say "We asked our email service to send it."
- Logs: provider name, status and request id only. Never the address, subject, body, code or link.

### 3. Email code sign-in (server)

| Route | Kind | What it does |
|---|---|---|
| `POST /v1/auth/email/start` | public | `{email}`. Lower-case and trim; at most 254 characters with one `@`; otherwise 400. Make a 6-digit code with `crypto.randomInt(0, 1000000)` (zero-padded). Call `issue_email_code(email, 'SIGN_IN', hmac)` where `hmac` = `HMAC-SHA256(CODE_PEPPER, email + ':' + 'SIGN_IN' + ':' + code)`, then send the code email. Always answer `{sent: true, expires_in_seconds: 600}`, whether or not an account exists. `CT429` → 429 `TOO_MANY` ("Too many codes for this email. Wait an hour and try again."). Provider failure → 502 `EMAIL_NOT_SENT` (same body for every address). |
| `POST /v1/auth/email/verify` | public | `{email, code, client: 'APP'\|'WEB'}`. In **one transaction**: `sign_in_with_email_code(email, hmac)` (purpose `SIGN_IN` in the HMAC). The function checks the code itself; never call `verify_email_code` and then a separate sign-in. Null → 400 `CODE_WRONG` ("That code didn't work. Check it, or ask for a new one.") — the same answer for wrong, expired, used and burned codes, and for an email that has had 10 wrong tries today. A user id → create a session (APP: return the token once, as Phase 1 does; WEB: set the cookies below and return no token). Sign-in never creates a workspace. |
| `POST /v1/account/email/start` | session | `{email, operation_id}`. Add email sign-in to the signed-in account. **Always** issues a `LINK` code (`issue_email_code(email, 'LINK', hmac)`, purpose `LINK` in the HMAC) and sends the link email, with the same answer as start. It never says up front that the email is in use or that this account already has one (that would let anyone check which emails have accounts). `CT429` → 429. |
| `POST /v1/account/email/verify` | session | `{email, code, operation_id}`. One transaction, inside `withUserIdempotency`: `link_email_code(user, email, hmac)`. The function checks the `LINK` code itself. Result `{"error":"CODE_WRONG"}` → 400 `CODE_WRONG`. `CT409` with message `EMAIL_ALREADY_SET` → 409 `EMAIL_ALREADY_SET` ("Your account already has an email."); with message `EMAIL_IN_USE` → 409 `EMAIL_IN_USE` ("That email already signs in to a different CrewTally account. Sign in with that email to use it, or use another email."). |
| `POST /v1/account/apple` | session | `{identityToken, authorizationCode, rawNonce, client: 'APP'\|'WEB', operation_id}`, inside `withUserIdempotency`. Add Sign in with Apple to the signed-in account. Verify the token exactly as the matching sign-in route does (audience: the bundle ID for `APP`, the Services ID for `WEB`; nonce; expiry), then `link_apple(user, sub)` in one transaction with storing the refresh token (encrypted) in `apple_credentials` with that `client_kind`. `CT409` → 409 `APPLE_ID_IN_USE` ("That Apple ID already signs in to a different CrewTally account.") or `APPLE_ALREADY_SET` (a different Apple ID is already on this account). `client: 'WEB'` while `apple_web_enabled` is false → 404. |
| `GET /v1/config` | public | Add `apple_web_enabled` (true only when `APPLE_WEB_SERVICES_ID` and `APPLE_WEB_RETURN_URL` are set), `apple_web_client_id` and `apple_web_redirect_uri` (both public values), and `dev_signin` (true only when `APP_ENV=development` and `DEV_SIGNIN_CODE` is set) next to `business_enabled`. |

Database limits (in 0003; don't repeat them in code): 5 codes per email per hour; a new code cancels older codes of the same purpose only; 5 tries per code; after 20 wrong tries in 24 hours for an email, nothing is checked or issued for it until the window passes. Codes last 10 minutes. `email_codes` rows are kept 24 hours (P7's nightly job purges older ones).

API rate limits on top: `/v1/auth/email/start` and `/v1/account/email/start` 5 per minute per client IP; the two verify routes 10 per minute per client IP; `/v1/invite/peek` 20 per minute per client IP (Phase 1b); `/v1/account/apple` 10 per minute per user.

**Per-client-IP rate limits behind Replit's proxy (moved here from Phase 8).** These limits protect the public email-code and invitation routes, so they must count the real client, not Replit's proxy. Every limiter keyed by IP (invitation peek, email codes, Apple and email sign-in, developer sign-in) uses the same setup:
- Find out how many proxy hops Replit adds in front of the API on the dev URL. Add a temporary diagnostic that logs only the **number** of entries in `X-Forwarded-For` (never the addresses), read it, then remove it.
- Set Express `trust proxy` to exactly that hop count (a number, never `true`). Key every IP limiter on `req.ip`.
- Tests (in-process, with a fake proxy header chain): two different client addresses get separate buckets; a client that sends its own `X-Forwarded-For` with extra entries on the left can't escape its bucket; the 6th `/v1/auth/email/start` in a minute from one client → 429 while another client is still served.
- Paste the hop count you found. Phase 8 checks it again on the production deployment (the hop count there may differ).

`GET /v1/me` returns `user: {id, display_name, has_apple, email}`; `email` is the user's own verified email (never anyone else's).

**What linking means.** Linking works both ways: an Apple user adds email sign-in after proving the email, and an email user adds Sign in with Apple. Then either way of signing in reaches the same account. There's **no** automatic linking and no merging: an email sign-in with an address that isn't on any account creates a new, separate user, even if an Apple user owns that mailbox. The sign-in screens say so (below).

### 4. Sign in with Apple on the web (server)
- `POST /v1/auth/apple/web` (public) takes `{identityToken, authorizationCode, rawNonce}`. When `apple_web_enabled` is false it returns 404.
- Reuse the Phase 1 verification exactly, with two differences: the accepted `aud` is **only** `APPLE_WEB_SERVICES_ID` (a token for the iPhone bundle id is refused here, and a web token is refused by the iPhone route), and the code exchange uses `client_id` = the Services ID, `redirect_uri` = `APPLE_WEB_RETURN_URL`, and a client secret JWT with `sub` = the Services ID.
- The nonce check is the same as iPhone (the `nonce` claim equals SHA-256(`rawNonce`) as hex). Confirm it with a real web sign-in on the dev domain and lock it in with a test, as Phase 1 did.
- Find or create the user by `sub` (the same `sub` as on iPhone, because the Services ID is grouped under the app's primary App ID), create a WEB session, and set the cookies. No workspace is created.
- Refresh token: store it (encrypted, as Phase 1 does) in `apple_credentials` with `client_kind = 'WEB'` (insert or replace the user's `WEB` row; the primary key is `(user_id, client_kind)`). The iPhone's `APP` row is never touched. Account deletion (Phase 7) revokes each row with its own client id: the bundle ID for `APP`, the Services ID for `WEB`.
- When `APP_ENV=development` and the exchange fails, behave as Phase 1 does (`apple_exchange=skipped_dev`).

### 5. Web sessions, CSRF and Origin (server)
- A WEB session is a `sessions` row with `client='WEB'`, the SHA-256 of a 32-byte random session token, and `csrf_hash` = SHA-256 of a separate 32-byte random CSRF token. Neither raw token is stored. Same 30-day sliding expiry as Phase 1.
- Cookies on every WEB sign-in:
  - `__Host-ct_session` = the session token: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`, `Max-Age` 30 days.
  - `__Host-ct_csrf` = the CSRF token: `Secure; SameSite=Lax; Path=/`, **not** HttpOnly (the web app reads it).
- `requireSession` accepts either a Bearer token (must match a session with `client='APP'`) or the session cookie (must match `client='WEB'`). A Bearer token for a WEB session, or a cookie for an APP session → 401 `SESSION_EXPIRED` (the body Phase 1 built). If a request carries both, use the Bearer token and ignore the cookie.
- For cookie-authenticated POST, PUT, PATCH and DELETE:
  1. **Origin** must be present and in the allowed list → otherwise 403 `CSRF_FAILED`. The list is `https://$REPLIT_DEV_DOMAIN` in development plus `WEB_ORIGINS` (comma-separated; set to `https://crewtallyapp.com` in Phase 8).
  2. `X-CSRF-Token` must equal the `__Host-ct_csrf` cookie, and its SHA-256 must equal `csrf_hash` (constant-time compares) → otherwise 403 `CSRF_FAILED`.
- Public POST routes used by the web (`/v1/auth/email/*`, `/v1/auth/apple/web`, `/v1/invite/peek`, `/v1/invite/decline`) need an allowed Origin when the request has one.
- Sign-in pages never redirect on a 401 from these routes; a wrong code is a 400 (spec section 4.6).
- `POST /v1/auth/signout` with a cookie revokes that session and clears both cookies (`Max-Age=0`).
- No CORS headers anywhere. The web app and API are same-origin.
- The role matrix and every member route work the same with either kind of session.

### 6. Invitations (server additions)
- `POST /v1/invitations` accepts `send_email` (boolean, default false). The invitation is created and committed exactly as in Phase 1b. After the commit, if `send_email` is true, send the invitation email. A failed send never undoes the invitation: the response says `email: 'NOT_SENT'` and the screen offers Copy instead. Otherwise `email: 'REQUESTED'`. At most 5 invitation emails per hour per user (429 `TOO_MANY`).
- The `/api/join/:token` page (Phase 1b) gets its **Continue on the web** button. It links to `/app/join#<token>` (the token stays in the URL fragment, so it never reaches a server log). Keep `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

### 7. Web screens

| Web route | Screen (`docs/screens-2.0/web/…`) | What it does |
|---|---|---|
| `/app/start` | `choose` | Public. **Home** ("Keep track of work and pay at home") and **Join a team**. **Business** only when `business_enabled`. The line "You can belong to more than one workspace." A **Sign in** link. Choosing goes to sign-in first if needed, then on. |
| `/app/signin` | `signin` | In development only (when `GET /v1/config` returns `dev_signin: true`): **Developer sign-in (test only)** with the same four labels and the same code field as iPhone → `POST /v1/auth/dev` with `client: 'WEB'`, which creates a WEB session and sets the cookies. **Sign in with Apple** (only when `apple_web_enabled`; Apple's JS from `appleid.cdn-apple.com`, loaded on this page only; `usePopup: true`, no scopes, the nonce from SHA-256 of a random `rawNonce`), and **Continue with email** (email field). The line "Started on iPhone with Apple? Sign in with Apple here, or add your email in the app first (More → Account)." Links to Join a team. Keeps "CrewTally never moves money. It keeps a record of payments you make yourself." and a Privacy link. |
| `/app/signin/code` | `verify` | "Check your email for a 6-digit code. We emailed it to <email>." Six-digit field (`autocomplete="one-time-code"`, `inputmode="numeric"`). **Use another email**. **Send a new code** (disabled for 30 seconds; shows the 429 message when the limit is hit). A spam-folder hint. The design's sign-in **link** and "Continue in demo" are not built. Wrong code: the 400 message, field kept. |
| `/app/auth/apple` | — | The registered Return URL. With popups it's only reached if a popup is blocked: show "Your browser blocked the Apple window. Allow pop-ups for this site and try again." and a link back to sign-in. |
| `/app/workspaces` | `workspaces` | Signed in. Each workspace: name, Home or Business, your role. **Create a Home workspace**, **Join a team**. Choosing one clears all cached data and opens `/app/w/<id>/today`. After sign-in: no workspaces → `/app/start`; one or more → the last used (per user), else the first. |
| `/app/start/home` | `home-setup` | Workspace name (default "My home", 1–80 characters) and the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) shown as "Times use America/New_York" with **Change** (a searchable list from `Intl.supportedValuesOf('timeZone')`). `POST /v1/workspaces` with `kind: 'HOME'`. Don't ask for an email here (the design does; you're already signed in). |
| `…/ready` | `setup-ready` | "Your Home workspace is ready. It starts on Free: 1 active project and 3 workers." **Open my workspace**. No sample link, no purchase link. |
| `…/today` | `empty-dashboard` | The workspace home. In this phase it's always the empty state: "Add your first project to start recording work." **Create my project** is shown disabled with "Available in the next update" (Phase 2 makes it work). No sample on the web in Release 1. |
| `/app/join` | `join` | Signed in (sign in first, then come back). Email the invitation was sent to, and the 6-digit code → `POST /v1/invite/accept-code` (with an `operation_id`). A 400 `INVITATION_CODE_WRONG` (a wrong code, an expired invitation, or too many tries today: the server gives one answer on purpose) shows one message: "That code didn't work. Check the email address and the code, or ask for a new invitation." Success → that workspace's `…/today`. |
| `/app/join#<token>` | `invite` | Read the token from the fragment, keep it in `sessionStorage` for this tab, and remove it from the address bar with `history.replaceState`. `POST /v1/invite/peek`. Show only what peek returns: "You've been invited to help with <workspace>" and the role ("Home partner: records work and payments; doesn't pay"). Not signed in → **Sign in to accept** (comes back here after). Signed in → **Accept** (`POST /v1/invite/accept`, then open that workspace) and **This isn't for me** (confirm, then `POST /v1/invite/decline`, then "You've declined. <Workspace> can send a new invitation if it was a mistake."). Peek unavailable, or a 410 on accept → the unavailable state. |
| `/app/join` (unavailable state) | `invite-expired` | One page for unknown, used, revoked and expired, and for an inviter who lost access: "This invitation isn't available. Ask for a new one." **Enter a code instead**, **Sign in**. Never says which case it was. |
| `…/team` | `member`, `invitations` | Only with `members.manage` (Home organizer). No partner and no pending invitation → **Invite a partner**. Pending → a card with name, email, "Expires <date>", **Revoke** (confirm). Partner → name (or their invitation label, or "Partner"), email (the organizer may see it), "Partner since <date>", **Remove access** (confirm: "<name> will lose access to <workspace>. Their work and payments stay in your records." → `DELETE /v1/members/:userId`). |
| `…/team/invite` | `invite-person` | Home: no role picker; the role is Home partner. The partner's name (for your own reference; sent as `name`), email, and **Email the invitation for me** (ticked by default). The text says what a partner can and can't do (same words as iPhone, Phase 1b) and "Your partner pays nothing." |
| `…/team/invite/review` | `invite-review` | Confirm name, email and role → **Create invitation** (one `operation_id` for this screen). Then show the link and code **once**, with **Copy link** and **Copy code**, and the email result ("We asked our email service to send it to <email>." or "We couldn't send the email. Copy the link and code and send them yourself."). A retry that comes back with `already_created: true` shows "This invitation was already created. Revoke it and invite again to get a new link." |
| `…/team/invitations` | `invitations` | Pending and recent invitations: name, email, role, status, expiry; **Revoke**; **Resend** (revoke, then invite the same email again). |
| `…/team/:userId` | `member` | The partner's page (as on `…/team`). |
| `…/leave` | — | Partner only: **Leave <workspace>** (confirm) → `DELETE /v1/members/<own id>` → `/app/workspaces`. Reached from the account menu. |
| `/app/settings/account` | (minimal; restyled to `profile` in Phase 7) | **Your name** (`PATCH /v1/me`). "Sign in with Apple: On" or **Add Sign in with Apple** (only when `apple_web_enabled`; Apple JS → `POST /v1/account/apple` with `client: 'WEB'`). "Email: <address>" or **Add email sign-in** (email → code → `/v1/account/email/verify`). Sign out. |
| any 403 | `access-denied` | "You don't have access to this. Ask the person who manages this workspace." **Back**. |
| 404 on the current workspace | `access-removed` (`/app/removed`) | "You no longer have access to this workspace." (no names; the same for removed and left) Forget it as the last used workspace. **Choose another workspace**. |
| unknown path | `not-found` | "We can't find that page." Links to your workspace and to sign-in. |
| network error or 5xx | `load-error` | "We couldn't load this. Your records haven't changed." **Try again**. |

The web app never shows plans, prices, buy buttons or links to buy (purchases stay on iPhone, Phase 7).

### 8. iPhone
- `AccountSignIn` adds **Continue with email** under Sign in with Apple: email field → code screen (six digits, `textContentType="oneTimeCode"`, keyboard `number-pad`, **Send a new code** after 30 seconds, **Use another email**). Uses `POST /v1/auth/email/start` and `/verify` with `client: 'APP'`. The token goes to `expo-secure-store` exactly like the Apple token.
- Under the buttons: "Started on the web with email? Use Continue with email here."
- **Account** (More → Account): "Sign in with Apple: On" or **Add Sign in with Apple** (the Phase 1 Apple sign-in component with a fresh nonce → `POST /v1/account/apple` with `client: 'APP'`; in the Expo Go build on your iPhone, Apple's sign-in module isn't available (we saw `ExpoAppleAuthentication=false` on 1 October), so it's tried at the TestFlight checkpoint), and "Email: <address>" or **Add email sign-in** (email → code → `/v1/account/email/verify`). The 409 messages as above. Sign out.
- Developer sign-in stays exactly as in Phase 1b.

### 9. Developer sign-in on the web (development only)
- `POST /v1/auth/dev` accepts `client: 'APP'` (default, as now) or `'WEB'`. Same guard as Phase 1 (only with `APP_ENV=development` and `DEV_SIGNIN_CODE` set, constant-time compare, rate-limited), same four labels, same code. `WEB` creates a WEB session with a `csrf_hash` and sets both cookies.
- The web sign-in page shows it only when `GET /v1/config` returns `dev_signin: true`, labelled **Developer sign-in (test only)**. Later web try-its use it to sign in as `member-c`.
- With `APP_ENV=production` the route refuses and `dev_signin` is false, so `/app/signin` never renders it (test below).

## Tests

**Server**
- Email sign-in: start → `{sent: true, …}` and the fake outbox has one email to that address with a 6-digit code → verify with `client: 'APP'` returns a token; `client: 'WEB'` sets both cookies and returns no token. A new email creates a user and **no workspace**. A second sign-in with the same email returns the same user.
- Same answer for start whether or not the email has an account (compare bodies and status). Same for `/v1/account/email/start` whether or not the email is in use, and whether or not the account already has an email.
- A 6th code for the same email inside an hour → 429. Five wrong codes → the right code no longer works (400). An expired code → 400. A used code → 400. All four 400 `CODE_WRONG` bodies are identical. After 20 wrong tries in 24 hours for one email, even a fresh right code gets 400 and start gets 429. Asking for a SIGN_IN code doesn't cancel a pending LINK code.
- `email_codes.code_hash` equals `HMAC-SHA256(CODE_PEPPER, email:purpose:code)` (recompute it in the test); the raw code is nowhere in the database.
- Linking email: an Apple user links an email (LINK purpose) → `GET /v1/me` shows it → signing in with that email reaches the same user id. Linking an email another user has → 409 `EMAIL_IN_USE` at verify (not at start). Link verify when the user already has an email → 409 `EMAIL_ALREADY_SET`. A SIGN_IN code can't be used for `/v1/account/email/verify`, or the reverse. Verify twice with the same `operation_id` → the same response.
- Linking Apple (mocked JWKS): an email user posts a valid token → `has_apple` becomes true and an Apple sign-in with that `sub` reaches the same user id; an `apple_credentials` row exists with the right `client_kind`. An Apple ID that belongs to another user → 409 `APPLE_ID_IN_USE`; a second, different Apple ID → 409 `APPLE_ALREADY_SET`; a web-audience token with `client: 'APP'` → 401.
- Apple web: with a mocked JWKS, a token with `aud` = Services ID signs in; a token with the bundle id as `aud` → 401 on the web route; a token with the Services ID → 401 on the iPhone route; flag off → 404. A web sign-in writes the `WEB` row of `apple_credentials` and leaves the `APP` row unchanged.
- Cookies: the `Set-Cookie` headers have exactly the attributes listed in Build step 5. The session row has `client='WEB'` and a `csrf_hash`. Neither raw token appears in the database (query and assert).
- CSRF and Origin: a cookie-authenticated POST with no `X-CSRF-Token`, a wrong token, a token that matches the cookie but not `csrf_hash`, no Origin, or a foreign Origin → 403 `CSRF_FAILED`, and nothing is written. GET requests don't need the token.
- `PATCH /v1/me`: name saved; 61 characters → 400; empty clears it.
- Transport mix-ups: a WEB session's token sent as Bearer → 401; an APP token in the cookie → 401.
- Sign out on the web revokes the session; the old cookie → 401.
- Invitation email: `send_email: true` puts one email in the outbox with the link and code; a failing transport still creates the invitation and returns `email: 'NOT_SENT'`; `send_email: false` sends nothing.
- Logs (capture output across every test above): no email address, code, token, cookie value or invitation link appears.
- Fake transport: with `APP_ENV=production` and no `EMAIL_API_KEY`, server start fails.
- Developer sign-in on the web: with `APP_ENV=development` and `DEV_SIGNIN_CODE` set, `client: 'WEB'` sets both cookies; with `APP_ENV=production`, the route refuses and `GET /v1/config` returns `dev_signin: false`.
- Per-client-IP limits: the three tests listed in Build step 3.
- **Role matrix:** runs every member route twice, once with a Bearer session and once with a cookie session (plus CSRF), and gets the same results. The route-table completeness test covers the new routes (all are `publicRoute` or `sessionRoute`).

**Web** (`npm run test:web`)
- The API client adds `X-Workspace-Id` (from the `/app/w/:workspaceId/…` URL) on workspace routes and `X-CSRF-Token` on writes, and reuses one `operation_id` across a retried submit.
- Navigation from `can`: an organizer sees Partner; a partner doesn't, and sees Leave.
- 404 from `GET /v1/workspace` clears the saved workspace and shows Access removed; 403 shows Access not available; a network error shows Connection error.
- `/app/join#<token>` removes the token from the address bar and shows only the workspace name and role from peek. A wrong code, an expired invitation and too many tries on `/app/join` show the same message.
- Developer sign-in is rendered only when `dev_signin` is true.
- The Apple button isn't rendered when `apple_web_enabled` is false.
- **No demo routes:** the router's route list contains no path with `demo`, `design` or `preview`; the production build output contains none of the strings "Design preview", "Reset sample", "Continue in demo" or "Private preview".
- Every page renders in dark mode without missing tokens (snapshot of computed CSS variables).

**Mobile**
- Email sign-in screens: the code field accepts only six digits; "Send a new code" is disabled for 30 seconds; the session token is saved in secure storage.
- Account shows Add email sign-in only when `email` is null, and Add Sign in with Apple only when `has_apple` is false.

## Must-not-build items for this phase
From spec section 11 "Money rules: keep, adopt, must not build" and section 12 "Web app":
- **Web Home without a partner role** (the prototype gives every Home user organizer powers, billing included). Tested by the role matrix and the web navigation test.
- **Client-only route guards.** Every web page's data comes from routes that check `require_member`; the matrix proves it.
- **Demo layer** (`demo`, `design`, Design preview, Reset sample, browser-stored records, private preview link). Tested by the no-demo test above.
- **Short guessable invitation codes and names before sign-in.** Peek shows only workspace name and role (Phase 1b tests stay green).
- **Sign-in links in email.** Codes only.

## Proof to paste at the gate
- `requireSession` after the change (Bearer and cookie paths).
- The CSRF and Origin middleware.
- The email adapter interface and the fake transport (showing it can't log and can't run in production).
- The `/v1/auth/email/verify` handler, showing the one call to `sign_in_with_email_code`, and the HMAC helper (with `CODE_PEPPER`).
- The `trust proxy` setting, the hop count you found, and the IP limiter.
- The Apple web route's audience check and code exchange parameters, and the `apple_credentials` write with `client_kind`.
- The `/v1/account/apple` handler (token check, `link_apple`, 409 mapping).
- The cookie-setting helper.
- The web API client.
- The web router's route list.
- The role matrix loop showing both session kinds.
- Test file names and counts for all four suites.

## Try it on your phone (Expo Go)
1. Sign out. On the first screen choose Get started → **Continue with email**. Enter your own email. The code arrives; enter it. You're signed in with no workspaces (unless this email was used before): create a Home workspace.
2. More → Account shows "Email: <your address>" and **Add Sign in with Apple** (in the Expo Go build on your iPhone, Apple's sign-in module isn't available, so you'll try it at the TestFlight checkpoint).
3. Sign out. Sign in as **owner-a** (developer sign-in). More → Account → **Add email sign-in** with a second address you own. Enter the code. Sign out, then Continue with email with that second address: you land in owner-a's workspace.
4. Ask for six codes in a row for one address: the sixth says to wait an hour. (Use an address you don't need for the next hour.)

## Try it on the web
1. Open `https://<dev domain>/app`. You're sent to sign-in. (In development the page also shows **Developer sign-in (test only)**; later phases use it to sign in as member-c on the web.) Continue with email using the second address from step 3 above. You land in owner-a's workspace on the web (the address bar shows `/app/w/<id>/today`): the same workspace as on the phone.
2. The sidebar shows Today, Partner, Workspaces, Account. Make the window narrow: the drawer and bottom bar appear. Tab through the page: every control shows a focus ring.
3. Partner → Invite a partner → an email you own, with "Email the invitation for me" ticked. You see the link and code once, and the email arrives.
4. In a private window, open the link from the email. You see only the workspace name and "Home partner". Sign in with a third email address → **Accept**. The private window now shows owner-a's workspace, with no Partner item in the menu, and **Leave** in the account menu.
5. In the first window, Partner shows the partner. Remove access. Refresh the private window: Access removed, then the workspace list.
6. If you did part B: sign out and use **Sign in with Apple** on the web with your real Apple ID. Then open Account: Apple is On. **C3 check (the Agent does this):** if Phase 1 ever stored an Apple user for this Apple ID, the web sign-in must land in that same account (same user id in Diagnostics and on the web Account page); paste what you see at the gate. If no iPhone Apple user exists yet, say so; Phase 8's try-it repeats the check on production (same Apple ID on iPhone and web → same workspaces). Sign out, sign in with the email from step 1 of the phone list, and use **Add Sign in with Apple** on the Account page: you get "That Apple ID already signs in to a different CrewTally account." (they're two accounts; nothing is merged).
7. Open `/app/demo` and `/app/design`: both show Page not found.
8. Turn off Wi-Fi and click around: Connection error, "Your records haven't changed."

## Carried items
- Real Sign in with Apple on iPhone: TestFlight checkpoint after Phase 2.
- Per-client-IP rate limiting behind Replit's proxy: built here; Phase 8 checks it in production.
- Revoking each Apple token at account deletion with its own client id (bundle ID for `APP`, Services ID for `WEB`): Phase 7.
- Add Sign in with Apple on iPhone: tried at the TestFlight checkpoint.
- `crewtallyapp.com` as a web origin, Apple return URL and verified domain: Phase 8.

## End of phase
Run the gate from `replit.md` (now with `npm run test:web` and the web app's startup line). Stop and say "Phase 1c ready for review".
