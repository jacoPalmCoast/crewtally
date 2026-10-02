# CrewTally design baseline 2.0

Controlling specification for the CrewTally build from Phase 1b onward | Baseline 2.0 | 2 October 2026

This document sits on top of the 1.4 specification (`docs/CrewTally_Native_App_Design_v1.4.md`). It adds workspaces, roles, the Home partner, email sign-in, the web app, the public website and the Business workspace (Release 1.1), and it says exactly which parts of the revised design to build, which to change, and which never to build.

Sections:

1. How to use this document
2. Decisions
3. Release scope
4. Identity and workspaces
5. Roles and permissions
6. Sign-in and first run
7. Invitations
8. Home partner
9. Account deletion
10. Home screens: changes from 1.4
11. Money rules: keep, adopt, must not build
12. Web app
13. Website
14. Business workspace (Release 1.1)
15. Data model and migrations
16. API surface
17. Design system and accessibility
18. Screen coverage
19. Things to confirm before building

---

# 1 How to use this document

## Precedence

When two sources disagree, the higher one wins:

| Rank | Source | Covers |
|---|---|---|
| 1 | `01_PROJECT_BRIEF_AND_INVARIANTS.md` (copied to `replit.md` in Phase 1b) | The hard invariants. They outrank everything, including this document and any phase file. |
| 2 | This document (`docs/CrewTally_Design_Baseline_2.0.md`) | Everything it covers: identity, workspaces, roles, sign-in, invitations, partner, deletion, the revised screens, web app, website, Business, data model changes, API additions, design tokens. |
| 3 | `docs/CrewTally_Native_App_Design_v1.4.md` | Money, the ledger, pay rules, receipts, statements, share links, evidence, reminders, offline queue, plans, exports, wherever this document doesn't change them. |
| 4 | The phase file you're running (`P1b…P8`, `B1…B4`) | What to build in that phase. A phase file never overrides 1–3. If it seems to, stop and say so at the gate. |
| 5 | Screen images in `docs/screens-2.0/` | Layout, wording and visual style. A picture never overrides a rule. |
| 6 | The revised design pack's prototype code and docs | Not a source. Its JavaScript is a picture of the screens, not code to copy (invariant 18). |

`docs/screens/` (the 1.4 images) is history only.

## How to read it

- Each phase file names the sections of this document to read first. Read those sections in full before writing code.
- Section numbers are stable. Phase files cite them as "§10 Home screens: changes from 1.4" and so on.
- "Keep from 1.4" means build the 1.4 behaviour described in the 1.4 spec, in the revised visual style.
- "Don't copy" means the revised image or prototype shows something wrong. Build the rule in this document instead, even where the image shows otherwise.
- Function names, error codes and table names in §4–§9 match `db/provided/migrations/0003_identity_and_memberships.sql` exactly. If you find a difference, the SQL is right; tell me at the gate.
- Business tables in §14 and §15 are designs. Their SQL is written in phases B1–B4, with tests, and reviewed at that gate.

## Words used here

| Word | Means |
|---|---|
| User | A person who signs in. One user can be in several workspaces. |
| Workspace | A set of records with one billing owner. Kind is `HOME` or `BUSINESS`. |
| Membership | One user's role in one workspace. |
| Organizer | The Home workspace's billing owner (role `ORGANIZER`). |
| Partner | The one optional helper in a Home workspace (role `PARTNER`). |
| Owner, admin, lead, worker | Business roles `OWNER`, `ADMIN` (with or without money access), `LEAD`, `WORKER`. |
| Money access | `financial_access = true` on an `ADMIN` membership. Other roles get money rights from the role itself. |
| Action | One of the 15 permission names checked by `role_can` (see §5). |
| Surface | iPhone app, web app, or website. |
| Sample | The local, read-only sample project bundled with the iPhone app. |

---

# 2 Decisions

All sixteen decisions were accepted at their recommended defaults on 2 October 2026. They are settled. Don't reopen them in a phase; if one looks wrong while building, say so at the gate.

| # | Decision | Accepted default | Where it lands |
|---|---|---|---|
| D1 | Does Business ship at launch? | No. Release 1 is Home on iPhone and web, plus the website. Business is Release 1.1 after 3–5 contractors confirm the price. The foundation for all roles is built now. | §3, §14; P1b builds all roles; B1–B4 behind `BUSINESS_ENABLED=false` |
| D2 | Web sign-in | Sign in with Apple on web plus email one-time code on web and iPhone, with account linking. Needs an email service (Resend or Postmark) and the Apple Services ID. | §6; P1c |
| D3 | What happens when a plan expires | Home: records are never locked (1.4 rule), so rewrite revised doc 03's write-pause for Home and don't build it on iPhone or web. Business: read and export only after a confirmed expiry, but workers can still confirm receipts and raise payment questions. | §11 (must-not-build 19), §14.10; P7, B4 |
| D4 | Pro wording | "As many projects and workers as you need", not "Unlimited". | §10 (P7), §13; invariant 8 |
| D5 | Business price, trial and unpaid state | Keep $29/$290 configurable; validate before creating products; offer a 14-day free trial through Apple's introductory offer. Before purchase, allow setup and the sample only, as the prototype does. | §14.9–§14.10; B4 |
| D6 | Today screen | Revised layout with one-tap Full / Half / No work, Undo, bulk "mark rest" and the project switcher. | §10 (P3) |
| D7 | My crew | Keep 1.4 My crew in the revised style. Ratings and notes are visible to the Home organizer and partner, and to the Business owner and admins only. | §10 (P2), §5 (`crew.private`) |
| D8 | Year-end tax notes | Keep (1.4 / 0003). The plans migration is now numbered 0004. | §10 (P5) |
| D9 | Time zone | Per project, defaulting from the device as in 1.4 (or from a workspace time zone if we add one). 0003 added `workspaces.default_timezone`; it is the default for new projects only. | §4.3, §10 (P2) |
| D10 | Owner and admin-entered Business work | Approved on save, recorded in the audit trail, on both iPhone and web. | §14.5 |
| D11 | Home partner | Whole workspace; can't set rates, remove people, manage the plan or delete the account; the same role on iPhone and web; one partner on every plan including Free (the pack doesn't settle which plan, and web pricing shows it as Pro). | §8 |
| D12 | Business pay types at launch | Hourly only in Business screens; the engine keeps daily pay. | §14.7 |
| D13 | Spanish | Receipts, statements and share pages in English and Spanish for both Home and Business, on iPhone and web. | §10 (P6), §12, §14.8 |
| D14 | Notifications at launch | Email for sign-in codes and invitations only; an in-app list for approvals and returns; iPhone reminders as designed; push later. | §6, §7, §14.11 |
| D15 | Icon and colours | Adopt the new icon and palette. | §17 |
| D16 | Removed 1.4 safeguards | Restore every money safeguard listed in the "Money rules" section, even where the revised screens dropped it. | §11 |

---

# 3 Release scope

## Phases

| Phase | Builds | Surfaces |
|---|---|---|
| P0, P1 | Foundation, Apple sign-in, sessions (built) | iPhone, API |
| P1b | Identity rework: migration 0003, `require_member`, workspaces, switcher, Home partner, invitations, role matrix | iPhone, API |
| P1c | Web app skeleton; email-code sign-in on web and iPhone; Sign in with Apple on the web; account linking; web cookie sessions with CSRF; web invite/join; web workspace switcher | Web, iPhone, API |
| P2 | Projects, workers, pay agreements and rate changes (`ChangePay`, `RateReview`), the sample project, plans (0004), My crew (0005) | iPhone and web |
| TestFlight checkpoint | First real build through Replit publishing; real Sign in with Apple on an iPhone | iPhone |
| P3 | Today, work entry, offline queue, Use previous workday; web record work, Home day sheet, history | iPhone and web |
| P4 | Payments: single, split, crew payments, checks, reversals, corrections, duplicates, drafts, evidence | iPhone and web |
| P5 | Reimbursements, adjustments, ledger, balance breakdown, year totals, server-side exports | iPhone and web |
| P6 | Receipts, statements, share links, public receipt page, acknowledgments, questions, hand-over signature (migration 0006) | iPhone, web, public page |
| P7 | Reminders, deletion, operations (0007), Home billing (RevenueCat), settings, website (privacy, terms, support and deletion pages move from the API to the website) | iPhone, web, website |
| P8 | Release 1: domain (forwards `/r/*`, `/join/*`, `/go/*` to the API), universal links, App Review, store assets | All |
| B1 | Business foundation: setup, jobs, leads, team and roles, invitations for all roles, lead and worker scoping, role-shaped data, plan limits that ignore Business (0008) | iPhone and web |
| B2 | Approvals, corrections, Work to approve, crew lead and worker apps, web approvals and timesheet, notifications (0009) | iPhone and web |
| B3 | Business payments by worker × job, reports, Business receipts in Spanish (no migration) | iPhone and web |
| B4 | Business billing, expiry, restore, release (0010) | iPhone, web, website |

## Release 1 (Home)

| In | Out (later or never) |
|---|---|
| Home workspace on iPhone and web | Business screens (Release 1.1, behind `BUSINESS_ENABLED=false`) |
| Organizer and one partner, on every plan | More than one partner |
| Sign in with Apple (iPhone and web), email code (iPhone and web), account linking | Merging two existing accounts |
| Invitations by link and 6-digit code | Invitations by text message sent from CrewTally |
| All 1.4 money features | Web checkout of any kind |
| Free, Project Pass, Pro (bought on iPhone only) | Push notifications |
| Receipts and statements in English and Spanish | App UI in Spanish (documents only) |
| Public receipt page with "I received this" and "I have a question" | Evidence on public links (needs file scanning) |
| Server-side CSV exports and full ZIP export | XLSX exports |
| Website: home, For Home, how it works, pricing, Use on iPhone, help, contact, privacy, terms, account deletion | Mobile-preview demo page, demo and design routes (never) |
| Android | Later, from the same code |

## Release 1.1 (Business)

Business workspace with owner, admins with or without money access, crew leads, workers, approvals, Business payments and reports, Business subscription. Built in B1–B4. The flag stays `false` in Release 1 builds; B4 turns it on for the 1.1 release only after the owner's go-ahead.

## Server settings that change scope

These are Replit Secrets or environment settings, read only by the server. The apps learn the result from `GET /v1/config` or `GET /v1/plan`, never from their own build.

| Setting | Default | What it does | Phase |
|---|---|---|---|
| `BUSINESS_ENABLED` | `false` | `true` turns Business on for everyone. Stays `false` in Release 1. | P1b (read), B4 (turned on) |
| `BUSINESS_DEV_ACCESS` | unset | `true` shows Business in development only: the server honours it only when `APP_ENV=development`, so it can't switch Business on in the published app. `businessEnabled()` = `BUSINESS_ENABLED === 'true'` or (`APP_ENV === 'development'` and `BUSINESS_DEV_ACCESS === 'true'`). | B1 |
| `PROJECT_PASS_ENABLED` | `true` | `false` hides Project Pass on iPhone and web (`GET /v1/plan` returns `project_pass_enabled: false`). The fallback if the Pass can't pass App Review in P8. | P2 (read), P8 (fallback) |
| `PUBLIC_BASE_URL` | — | The base for links people open outside the app: `https://<dev domain>/api` in development, `https://crewtallyapp.com` from P8. Invitation links are `${PUBLIC_BASE_URL}/join/<token>`; receipt links `${PUBLIC_BASE_URL}/r/<token>`. Not a secret. | P1b |

## Never

Anything in §11 "Prototype behaviours that must not be built". Demo code (invariant 18). Payroll language. Anything that moves or verifies money.

---

# 4 Identity and workspaces

Built in P1b (iPhone and API) and P1c (web). Everything here is already in migration 0003; build on it, don't re-create it.

## 4.1 Users

`users` gains (0003):

| Column | Rule |
|---|---|
| `apple_sub` | Now nullable. Set only by the Apple sign-in routes (a new user) and `link_apple` (adding Apple to a signed-in account). Stable across the iPhone app and the web for the same Apple developer team (confirm, §19). |
| `display_name` | 1–60 characters or null. Set only through `set_display_name` (`PATCH /v1/me`, P1b). |
| `email` | Lowercase, contains `@` after the first character, at most 254 characters, unique among non-null values. Present only when verified. |
| `email_verified_at` | Required whenever `email` is set (`users_email_needs_verification`). |
| constraint `users_has_identity` | A live user has an Apple identity, an email, or both. |

Rules:
- Apple sign-in never writes `users.email`, even when Apple returns an email (it is often a private relay address). A user adds email sign-in only through Account → Add email sign-in (§6.4).
- Only three code paths create users: the Apple sign-in routes (insert a row for a new `apple_sub`), the developer sign-in route (development only, `apple_sub = 'dev:<label>'`), and `sign_in_with_email_code` (it checks the code itself). After that, `users` changes only through `link_email_code`, `link_apple`, `set_display_name` and `delete_user_account`.
- `has_apple` in `GET /v1/me` is false for developer users (`apple_sub` starting `dev:`). Their Account screen shows "Developer sign-in".
- `apple_credentials` (Phase 1, changed by 0003) holds one encrypted Apple refresh token per user **per client**: `client_kind` `APP` (issued to the iPhone bundle ID) or `WEB` (issued to the web Services ID), primary key `(user_id, client_kind)`. Account deletion revokes each with its own client id (§9.2).
- Deleted users keep their row with `deleted_at` set and identity scrubbed (§9).

## 4.2 Sessions

`sessions` gains `client` (`APP` or `WEB`, default `APP`) and `csrf_hash` (required for `WEB`, constraint `sessions_web_has_csrf`).

| Client | Carries the session | CSRF |
|---|---|---|
| iPhone (`APP`) | Bearer token in the `Authorization` header, kept in Keychain (unchanged from Phase 1) | Not needed |
| Web (`WEB`) | `__Host-ct_session` cookie: `Path=/` (the `__Host-` prefix requires it), `HttpOnly`, `Secure`, `SameSite=Lax` | Required on every non-GET request (§12.4) |

The session context is `{userId, sessionId}` only. It never holds a workspace.

## 4.3 Workspaces

`workspaces` (0003 changes):

| Column | Rule |
|---|---|
| `owner_id` | The billing owner. No longer unique: one person can own several workspaces. Can't change (`workspaces_kind_fixed` trigger). |
| `kind` | `HOME` or `BUSINESS`. Can't change. |
| `default_timezone` | IANA name or null. Used only as the default time zone for new projects (D9). Each project keeps its own `timezone`, which decides work dates, plan limits and reminders. |
| `currency_code`, `currency_locked` | Unchanged from 1.4. Currency locks at the first money record. |

Creating a workspace: `create_workspace(user, kind, name, currency, timezone)`. Name 1–80 characters after trimming. Time zone must exist in `pg_timezone_names` or be null. It inserts the workspace and the principal membership (`ORGANIZER` for Home, `OWNER` for Business) in one transaction.

- `POST /v1/workspaces` with `kind=BUSINESS` answers 404 while `BUSINESS_ENABLED` isn't `true`.
- Sign-in never creates a workspace (Apple, email or dev).
- Existing Phase 1 workspaces: 0003 made each owner the `ORGANIZER`.

## 4.4 Memberships

`memberships` (0003): `workspace_id`, `user_id`, `role`, `financial_access`, `worker_id`, `status` (`ACTIVE` or `REMOVED`), `invited_by`, `created_at`, `removed_at`, `removed_by`.

| Rule | Enforced by |
|---|---|
| One membership row per user per workspace | `unique (workspace_id, user_id)` |
| Exactly one active principal (`ORGANIZER` or `OWNER`) | `memberships_one_principal` |
| At most one active `PARTNER` | `memberships_one_partner` |
| One active login per worker record | `memberships_one_login_per_worker` |
| `financial_access` set only for `ADMIN` | check |
| `worker_id` only for `LEAD` (optional) and `WORKER` (required) | checks |
| Roles fit the kind: Home → `ORGANIZER`, `PARTNER`; Business → `OWNER`, `ADMIN`, `LEAD`, `WORKER` | `memberships_rules` trigger |
| Principal is the billing owner; can't be removed, demoted, or transferred | `memberships_rules` trigger |
| Membership's user and workspace can't change | `memberships_rules` trigger |

App code never inserts, updates or deletes `memberships`. Changes go through `create_workspace`, `accept_invitation`, `accept_invitation_code`, `remove_member`, `change_member_role` and `delete_user_account`.

Removal is immediate. `require_member` reads the membership row in the same transaction as every request, so there is no cached permission to expire.

Removing a member, or changing their role so they can no longer send an invitation, revokes the pending invitations they sent (`remove_member`, `change_member_role`). Accepting an invitation re-checks that the person who sent it is still an active member who may still invite that role (and, for a worker-bound invitation, still has `money.view`); otherwise the invitation is revoked and the answer is `{"error":"INVITATION_NOT_AVAILABLE"}` → 410.

Worker records are never hard-deleted. Ending an assignment or retiring a worker keeps the row. Only workspace deletion (through `delete_user_account`) removes worker records, and the memberships and invitations bound to them go with the workspace.

## 4.5 The one door: X-Workspace-Id and require_member

Every route that touches workspace data:

1. Reads the workspace id from the `X-Workspace-Id` header. Missing or not a UUID → 404 `{"error":"NOT_FOUND"}`.
2. Begins a transaction and calls `select require_member($workspace, $user, $action)`.
3. Runs the handler with the same transaction, so the actor that `require_member` sets (`crewtally.actor`) fills `recorded_by` on every money and evidence row.
4. Commits.

`require_member` returns `{role, financial_access, worker_id, kind}`. The handler uses `role` and `worker_id` for lead and worker scoping in Business phases (§5.4), and `kind` to refuse Home-only or Business-only routes.

Helper and registration (P1b):

```ts
// server/src/auth/member.ts
withMember(req, action, async (tx, member) => { ... })
memberRoute('post', '/v1/projects', 'projects.manage', handler)
sessionRoute('get', '/v1/me', handler)
publicRoute('post', '/v1/invite/peek', handler)
```

Every `/v1` route is registered as `publicRoute`, `sessionRoute` or `memberRoute`, and every `memberRoute` declares an action. A test lists the Express router and fails if any `/v1` route is missing from the route table, or any member route has no action.

**Idempotency for session routes.** Session routes have no workspace, so they can't use `idempotency_keys` (keyed by `(workspace_id, operation_id)`). They use `user_idempotency_keys(user_id, operation_id, request_hash, response)` from 0003, through one helper, `withUserIdempotency(tx, userId, operationId, body, fn)` in `server/src/idempotency.ts` (P1b). It covers `POST /v1/workspaces`, `POST /v1/invite/accept`, `POST /v1/invite/accept-code` and the account-linking routes (P1c). Same user and same `operation_id` → the stored response; same id with a different body → 409 `OPERATION_REUSED`. Every write in P1b and P1c carries an `operation_id` (a UUID made on the device or browser and kept through retries). For every new route from P1b on, the request hash includes the actor (the signed-in user id) as well as the body, so one member's replayed id never returns another member's response. Member routes use the matching helper `withWorkspaceIdempotency(tx, workspaceId, userId, operationId, body, fn)` on `idempotency_keys`, in the same file. P2 and later reuse these two helpers.

## 4.6 Error mapping

One mapping, used by every route on every surface:

| Source | HTTP | Body `error` | Notes |
|---|---|---|---|
| SQLSTATE `CT404`, missing or bad `X-Workspace-Id`, a record id from another workspace | 404 | `NOT_FOUND` | Same body whether or not the thing exists. |
| SQLSTATE `CT403` | 403 | `FORBIDDEN` | Member without the right. |
| SQLSTATE `CT409` | 409 | `CONFLICT` | Already a member, partner seat taken, invitation pending. Linking routes use their own codes: `EMAIL_ALREADY_SET` and `EMAIL_IN_USE` (`link_email_code`, from the error message), `APPLE_ID_IN_USE` and `APPLE_ALREADY_SET` (`link_apple`), §6.4. Business functions put an API code in the error `detail` (B1); the API returns that code. |
| SQLSTATE `CT410` | 410 | `INVITATION_NOT_AVAILABLE` | |
| Function result `{"error":"INVITATION_NOT_AVAILABLE"}` (from `accept_invitation` on an expired link, or from either accept function when the inviter is no longer active or allowed; `accept_invitation` raises `CT410` for a used, revoked or unknown one) | 410 | `INVITATION_NOT_AVAILABLE` | The function returns this instead of raising, so the EXPIRED or REVOKED status it writes is kept. Map it the same as `CT410`. The apps show one message for every 410. |
| Function result `{"error":"INVITATION_CODE_WRONG"}` (from `accept_invitation_code`) | 400 | `INVITATION_CODE_WRONG` | Same answer for a wrong code, an expired invitation, and "you've tried too often today", on purpose. The apps show one message for all three (§7.4). |
| SQLSTATE `CT429` | 429 | `TOO_MANY` | Email codes: more than 5 codes for one address in an hour, or 20 wrong tries for that address in 24 hours (§6.2). |
| SQLSTATE `CT402` | 402 | `PLAN_LIMIT` | Plan limits (0004), with which limit and the maximum. |
| SQLSTATE `40001` from money functions | 409 | `STALE_VERSION` or `OPERATION_REUSED` | Stale version, or same operation id with a different payload (the idempotency helper answers `OPERATION_REUSED` the same way for routes without a database function). |
| SQLSTATE `22023`, `23514` from money functions, and `23514` from `create_invitation` | 422 | a specific code | Business rule failed, e.g. `NO_RATE_FOR_DATE`, `ALLOCATION_INVALID`, `DATE_OUTSIDE_ASSIGNMENT`, `ROLE_DOES_NOT_FIT` (role doesn't fit the workspace kind). Each phase file lists the codes it adds. Never echo the database message to the client, except where a phase file says to show it (the blocked rate-change reason, P2). |
| SQLSTATE `22023` from the identity functions (`create_workspace` bad name or time zone, `set_display_name`, `change_member_role` with no role) | 400 | `INVALID` | As P1b. Validate with zod first so this is a backstop. `change_member_role` to `WORKER` for a member with no worker record raises `22023` with the message `WORKER_RECORD_REQUIRED` → 400 `WORKER_RECORD_REQUIRED`. |
| SQLSTATE `P0002` | 404 | `NOT_FOUND` | |
| zod validation | 400 | `INVALID` with field names | |
| `sign_in_with_email_code` returns null, or `link_email_code` returns `{"error":"CODE_WRONG"}` | 400 | `CODE_WRONG` | One answer for wrong, expired, used and burned codes (§6.2). |
| Web write without a valid CSRF token or Origin | 403 | `CSRF_FAILED` | §12.4. |
| No session, or a missing, unknown, revoked or expired one | 401 | `SESSION_EXPIRED` | The body Phase 1 built. Keep it on every surface. |

## 4.7 What the apps read

| Route | Returns |
|---|---|
| `GET /v1/me` | `{user:{id, display_name, has_apple, email}, workspaces: my_workspaces(user)}`. Never another user's data. |
| `GET /v1/workspace` | `member_permissions(workspace, user)` (`role`, `financial_access`, `worker_id`, `kind`, `name`, `can`) plus currency and default time zone. |

The apps hide and show actions from `can`. Hiding is tidiness only. The server decides.

## 4.8 Switching workspaces

- The current workspace id is saved per user on the device (iPhone) or in the URL (web, `/app/w/:workspaceId/…`).
- Switching clears in-memory screens and reloads from the API.
- The offline work queue and payment drafts are keyed by user + workspace. A queued operation is always sent with the workspace it was made in, never the current one. Switching never moves, merges or drops queued work.
- A 404 on `GET /v1/workspace` for the saved workspace: show Access removed (`BAccessRemoved` with Home wording), drop the saved id, open the switcher. Queued operations for that workspace then fail with 404; show them in Needs review as "Not sent: you no longer have access to <workspace>", never silently drop them.

---

# 5 Roles and permissions

## 5.1 The roles

| Role | Kind | How many | Pays? | Notes |
|---|---|---|---|---|
| `ORGANIZER` | Home | Exactly one | Buys Pass or Pro for the workspace | The billing owner. Can't leave or be removed; deletes the workspace by deleting their account. |
| `PARTNER` | Home | At most one, on every plan including Free | Never | Helps record work and payments (§8). |
| `OWNER` | Business | Exactly one | Buys the Business subscription | Billing owner. Can't leave or be removed. |
| `ADMIN` | Business | Any | Never | With money access (`financial_access = true`) or without. Only the owner gives or changes money access. |
| `LEAD` | Business | Any | Never | Sees and records only for the jobs they lead. Never sees rates, earnings or balances. May be linked to their own worker record. |
| `WORKER` | Business | Any | Never | Linked to exactly one worker record. Sees only their own work, approved earnings and receipts. |

Seven permission sets: organizer, partner, owner, admin with money access, admin without, lead, worker. A removed member and an outsider are two more cases in every test, and both get 404.

## 5.2 Actions

The database function `role_can(role, financial_access, action)` is the only place a role turns into a right. `require_member` and `member_permissions` call it. An unknown action raises an error (SQLSTATE `22023`), so a typo can never quietly grant or deny.

| Action | What it guards |
|---|---|
| `workspace.read` | Opening the workspace and reading records the role may see (scoped for leads and workers, §5.4). Also leaving. |
| `work.record` | Recording work (Home) or submitting work (Business). |
| `work.approve` | Approving, returning and correcting Business work. |
| `money.view` | Rates, earnings, balances, payments, receipts, statements, ledger. |
| `money.record` | Payments, reversals, corrections, checks, reimbursements, adjustments, receipts and share links, payment review markers. |
| `rates.set` | Creating and changing pay agreements. |
| `people.add` | Adding worker records, adding a worker to a project or job, editing a worker's contact details. |
| `people.remove` | Ending a worker's assignment, retiring a worker from My crew. |
| `projects.manage` | Creating, editing, archiving and reopening projects or jobs. |
| `crew.private` | My crew favorites, skills, private notes and ratings. |
| `members.manage` | Inviting, revoking, removing and changing members (further limited by `can_invite` and `can_manage`). |
| `plan.manage` | Buying, restoring and managing the plan. |
| `settings.edit` | Renaming the workspace and other workspace settings. |
| `export` | Server-side exports and the full data export. |
| `account.delete_workspace` | Deleting the workspace (by deleting the principal's account, §9). |

## 5.3 Permission matrix

Straight from `role_can` in 0003. Y = allowed, — = 403.

| Action | Organizer | Partner | Owner | Admin with money | Admin without money | Lead | Worker |
|---|---|---|---|---|---|---|---|
| `workspace.read` | Y | Y | Y | Y | Y | Y (own jobs) | Y (own records) |
| `work.record` | Y | Y | Y | Y | Y | Y (own jobs' crew) | Y (own work) |
| `work.approve` | — | — | Y | Y | Y | — | — |
| `money.view` | Y | Y | Y | Y | — | — | — |
| `money.record` | Y | Y | Y | Y | — | — | — |
| `rates.set` | Y | — | Y | Y | — | — | — |
| `people.add` | Y | Y | Y | Y | Y | — | — |
| `people.remove` | Y | — | Y | Y | Y | — | — |
| `projects.manage` | Y | Y | Y | Y | Y | — | — |
| `crew.private` | Y | Y | Y | Y | Y | — | — |
| `members.manage` | Y | — | Y | Y | Y | — | — |
| `plan.manage` | Y | — | Y | — | — | — | — |
| `settings.edit` | Y | — | Y | — | — | — | — |
| `export` | Y | Y | Y | Y | — | — | — |
| `account.delete_workspace` | Y | — | Y | — | — | — | — |

Removed member and outsider: 404 on every member route, whatever the action.

`work.approve` is meaningless in Home: Home work is final on save. Home routes never call it.

### Who may invite or manage whom

`members.manage` opens the door; two more functions in 0003 narrow it.

| Actor | May invite (`can_invite`) | May remove or change (`can_manage`) |
|---|---|---|
| Organizer | `PARTNER` only | The partner only; can't change their role |
| Owner | `ADMIN` (with or without money access), `LEAD`, `WORKER` | Admins, leads, workers; may change between those roles and set money access |
| Admin | `LEAD`, `WORKER` | Leads and workers only; can't make anyone an admin or touch an admin (`change_member_role` raises `CT403` "only the owner changes admins") |
| Partner, lead, worker | Nobody (`CT403`) | Nobody |

Nobody changes their own role (`CT403`). Anyone but the principal may leave (`remove_member` with themselves as the target).

More rules from 0003:
- **Binding an invitation to a worker record** (a `WORKER`, or a `LEAD` with a worker record) needs `money.view`: the owner, or an admin with money access. Anyone else → `CT403`. An admin without money access can invite leads without a worker record only. (A login bound to a worker record sees that worker's earnings and receipts.)
- **Revoking** an invitation: allowed for invitations you sent, or ones you could have created yourself. Otherwise `CT403`.
- **Changing a role** (`change_member_role`): the new role is required (`22023` → 400 `INVALID`). Changing someone to `WORKER` needs a worker record on their membership already (`22023` `WORKER_RECORD_REQUIRED` → 400).

### What each role sees in a response

The server strips fields the role can't see. The apps never receive them.

| Field group | Shown to | Stripped for |
|---|---|---|
| Rates, earned amounts, balances, payments, receipts, statements, ledger, labour cost, budget | `money.view` | Admin without money, lead, worker (worker gets own-scope money only, §5.4) |
| Favorites, skills, private notes, ratings | `crew.private` | Lead, worker |
| Worker phone and email | `people.add` | Lead, worker |
| Member emails | `members.manage` | Everyone else |
| Plan price and purchase actions | `plan.manage` | Everyone else (they see the plan name and "Managed by <name>") |

Exports follow the same rules: an export never contains a field the caller couldn't see on screen.

## 5.4 Lead and worker scoping (Business phases)

`role_can` decides whether a role may do an action at all. It doesn't know which jobs or records. Scoping is added by the API, on top of `require_member`, in B1 and B2. It is never widened to make something work (invariant 5).

**Until B1: Home-only routes.** From P2, every Home feature route (projects, workers, assignments, work, money, receipts, exports) is registered with `kinds: ['HOME']`. `withMember` answers the standard 404 when the workspace's `kind` isn't in the route's `kinds`, so no Business member can reach a Home feature route before its scoping exists, whatever `role_can` says. The role matrix expects "kind allowed AND `role_can`". This is an interim rule, not scoping.

**From B1: lead and worker scoping replaces it.** B1 widens `kinds` to `['HOME','BUSINESS']` on the project, worker and assignment routes it lists, together with the scope and the response shaper. B2 adds the Business work routes (Home work routes answer 409 `BUSINESS_USES_SUBMISSIONS` in Business). B3 widens the payment, receipt, statement and export routes. A route stays Home-only until the phase that scopes it.

| Role | Scope built from | Can read | Can write |
|---|---|---|---|
| Lead | Jobs led by their active `LEAD` membership (`job_leads`, §14.4) | Jobs they lead; workers assigned to those jobs (name, trade, job, hours entries and their status); their own entries | Submissions for workers assigned to their jobs on dates inside the assignment. Always Pending. |
| Worker | `memberships.worker_id` | Their own worker record, own entries and status, own approved earnings, own payments (their allocation lines only), own receipts, own balance | Submissions for their own worker record on jobs they're assigned to. Always Pending. Correction requests and payment questions on their own records. |

How it's built (B1):
- `withMember` also loads `member_scope(workspace, user)` (0008) in the same transaction and passes it as `member.scope`: `{all: true}` for organizer, partner, owner and admins; `{all: false, project_ids, worker_id}` for a lead; `{all: false, project_ids: [], worker_id}` for a worker.
- Every query in a route that leads or workers can reach filters by the scope in SQL (helpers `scopeJobs`, `scopeAssignments`, `scopeWorkers` in `server/src/auth/scope.ts`). No filtering in JavaScript after the query.
- A lead or worker asking for a record outside their scope gets 404, the same as another workspace's id.
- Workers have no `money.view`. Their own money comes from own-scope routes (`GET /v1/my/money`, `GET /v1/my/receipts/:id`, B2), registered with `workspace.read`. Each requires a bound worker record and returns only that worker's allocation lines, approved earnings and balance. These routes never return another worker's data, other workers' rates, or job totals.
- Leads have no own-money route in 1.1 unless their membership is bound to a worker record; then the same `/v1/my/…` routes work for that record only.

Tests (role matrix, extended in B1 and B2): for every lead- or worker-reachable route, call it with an id from another job, another worker, and another workspace; all three answer 404 with identical bodies.

## 5.5 Role matrix test

Built in P1b (`server/test/helpers/tenancy.ts`), extended by every later phase:
- One row per registered member route: method, path, action.
- It tests the **route gate**: the action the route declares, checked through `require_member`. It does not test the extra checks a function makes inside (`can_invite`, `can_manage`, money access for worker binding, self-removal rules).
- Every case gets fresh fixtures: either each case runs in its own transaction that is rolled back, or each case sets up its own workspace and members. A remove or revoke in one case never changes another case.
- For each of organizer, partner, owner, admin with money, admin without, lead, worker, removed member, outsider, it asserts:
  - removed member and outsider → 404;
  - a role without the declared action → 403;
  - a role with the declared action → anything but 403 or 404 from the gate. The handler may still refuse with 400, 403 or 409 from the function; that's fine here.
- Function-level refusals have their own tests, listed separately in each phase file (for example: partner removes the organizer → 403; admin changes an admin → 403; organizer invites an `ADMIN` → 403 (`can_invite` refuses before the kind check); admin without money access invites a worker-bound role → 403).
- Business roles are created with the provided functions even before Business screens exist.
- A phase that adds a route adds it to the matrix in the same phase. A missing row fails the completeness test.

---

# 6 Sign-in and first run

## 6.1 Sign-in methods by surface

| Method | iPhone | Web | Phase |
|---|---|---|---|
| Sign in with Apple | Yes (built in Phase 1; real Apple sign-in proven at the TestFlight checkpoint) | Yes, Sign in with Apple JS | iPhone: built. Web: P1c |
| Email one-time code | Yes | Yes | P1c |
| Developer sign-in (test only) | Development builds only (`APP_ENV=development` and `DEV_SIGNIN_CODE` set); labels `owner-a`, `owner-b`, `member-c`, `member-d` (B1 adds `member-e`, `member-f`) | Development only, same guard and labels | Built in Phase 1; labels in P1b; web in P1c |

Developer sign-in must be absent from production builds and refused by the API in production. A test asserts both, and P8's `npm run test:release` asserts it again on the release build.

**The only sign-in exception: the App Review account (P8).** In production, for App Review only, the email start route treats one exact address (`REVIEW_EMAIL`) specially: when `REVIEW_EMAIL` and `REVIEW_CODE` are both set, it stores `REVIEW_CODE` as that address's code (hashed through `issue_email_code`) and sends no email. Verification, rate limits and sessions are unchanged. With either Secret missing, the address is like any other. The owner removes both Secrets after approval. Nothing else bypasses a sign-in method.

## 6.2 Email codes

Built in P1c on the database functions from 0003. Email is sent through one adapter over Resend or Postmark (invariant: email is used only for sign-in codes and invitations).

| Rule | Value | Enforced by |
|---|---|---|
| Code | 6 digits from `crypto.randomInt(0, 1000000)`, zero-padded | API |
| Stored as | `HMAC-SHA256(CODE_PEPPER, email + ':' + purpose + ':' + code)`. `CODE_PEPPER` is a server Secret (32 random bytes, P1b). The raw code is never stored or logged. | API, `email_codes.code_hash` |
| Valid for | 10 minutes | `issue_email_code` |
| Issue limit | 5 codes per email per hour; a sixth → `CT429` → 429 `TOO_MANY` | `issue_email_code` (advisory lock per email) |
| A new code | Cancels older unused codes for that email **of the same purpose only**. A sign-in code never cancels a `LINK` or `DELETE` code. | `issue_email_code` |
| Wrong tries per code | 5; the fifth wrong try burns the code | `verify_email_code` |
| Wrong tries per email | After 20 wrong tries in 24 hours for an email (all purposes together), nothing is checked or issued for that email until the window passes: verify answers "wrong", issue raises `CT429` | `issue_email_code`, `verify_email_code` |
| Purposes | `SIGN_IN` (sign in or create a user), `LINK` (add email to the signed-in user), `DELETE` (confirm account deletion, §9.2). A code works only for its own purpose. | `email_codes.purpose` |
| Kept | `email_codes` rows are kept 24 hours so the limits can't be reset; P7's nightly job deletes older rows | P7 cleanup job |
| Extra API limit | Start: 5 requests per minute per client IP. Verify: 10 attempts per minute per client IP. Client IP is read correctly behind Replit's proxy from P1c. | API rate limiter |

Routes (P1c):

| Route | Kind | Body | Does |
|---|---|---|---|
| `POST /v1/auth/email/start` | public | `{email}` | Normalises (trim, lowercase), checks shape, `issue_email_code(email,'SIGN_IN',hmac)`, sends the email. Always answers `{"sent":true,"expires_in_seconds":600}` for a valid address, whether or not an account exists. 429 on `CT429`. Provider failure → 502 `EMAIL_NOT_SENT`. |
| `POST /v1/auth/email/verify` | public | `{email, code, client}` | One transaction: `sign_in_with_email_code(email, hmac)`. It checks the `SIGN_IN` code itself. Null → 400 `CODE_WRONG` (one answer for wrong, expired, used and burned). A user id → session for `client` (`APP` returns a bearer token once; `WEB` sets the cookies, §12.4). The API never calls `verify_email_code` and then a separate sign-in. |
| `POST /v1/account/email/start` | session | `{email, operation_id}` | Always `issue_email_code(email,'LINK',hmac)` and send, with the same answer `{"sent":true,"expires_in_seconds":600}`. It never says up front whether the email is in use or whether this account already has one (that would let anyone check which emails have accounts). `EMAIL_IN_USE` and `EMAIL_ALREADY_SET` come only at verify. |
| `POST /v1/account/email/verify` | session | `{email, code, operation_id}` | One transaction, through `withUserIdempotency`: `link_email_code(user, email, hmac)`. It checks the `LINK` code itself. `{"error":"CODE_WRONG"}` → 400 `CODE_WRONG`. `CT409` with message `EMAIL_ALREADY_SET` → 409 `EMAIL_ALREADY_SET` (this account already has an email); with message `EMAIL_IN_USE` → 409 `EMAIL_IN_USE` (another account has it). |
| `POST /v1/account/apple` | session | `{identityToken, authorizationCode, rawNonce, client, operation_id}` | Verifies the Apple token exactly like sign-in, with the audience for `client` (`APP`: the bundle ID; `WEB`: the Services ID). Then `link_apple(user, sub)`. `CT409` → 409 `APPLE_ID_IN_USE` (that Apple ID signs in to another account) or `APPLE_ALREADY_SET` (a different Apple ID is already linked). Stores the refresh token in `apple_credentials` with that `client_kind`. |

Email wording (English only; plain text and simple HTML; no tracking pixels, no links other than the support page):
- Subject: "Your CrewTally sign-in code". The code never goes in the subject line (it would show on lock screens and in inbox previews).
- Body: "Your code is 123456. It works for 10 minutes. If you didn't ask for it, you can ignore this email." Footer: "CrewTally never moves money." and the support link.
- The link code email (subject "Confirm your email for CrewTally") and the optional invitation email are in P1c.

Logs never contain the email address or the code (invariant 9).

## 6.3 Sign in with Apple on the web

Built in P1c.
- `POST /v1/auth/apple/web`. Uses Apple's Sign in with Apple JS with a nonce, the same way the iPhone flow uses one. The server verifies the identity token's signature, issuer, expiry and nonce. The web route accepts **only** the web **Services ID** as the audience, and the iPhone route accepts only the bundle ID. Secrets: `APPLE_WEB_SERVICES_ID` and `APPLE_WEB_RETURN_URL` (the return URL is `https://<domain>/app/auth/apple`).
- The web refresh token is stored in `apple_credentials` with `client_kind = 'WEB'`, so it never replaces the iPhone's `APP` token. Account deletion revokes the `WEB` token with the Services ID as `client_id` (§9.2).
- **Owner setup task (before P1c):** create an Apple Services ID for the web, turn on Sign in with Apple for it, and register the web domain(s) and return URL(s) in the Apple developer account, including domain verification. Apple checks the verification file at the domain root: `https://<domain>/.well-known/apple-developer-domain-association.txt` (not under `/app`). In development the Agent serves it from whichever artifact answers the dev domain's root (only `/api` reaches the API, and the web app is under `/app`); from P7 the website serves it at the root of crewtallyapp.com. The owner downloads the file from Apple and uploads it where the Agent says; the Agent confirms with `curl`. Development on a Replit dev URL needs that URL registered too, or web Apple sign-in is tested on the deployed domain only. `crewtallyapp.com` is verified in P8. The P1c file walks through it.
- A web Apple sign-in finds the user by `apple_sub`, or creates a new user if the `apple_sub` is new. It never matches by email.

## 6.4 Account linking

Linking works both ways, and never merges two existing accounts.

| Situation | What happens |
|---|---|
| Email code sign-in, and a live user has that verified email | Signs in to that user (`sign_in_with_email_code`). |
| Email code sign-in, and no user has that email | Creates a new user with that verified email and no workspace. |
| Apple sign-in, known `apple_sub` | Signs in to that user. |
| Apple sign-in, new `apple_sub` | Creates a new user with no email and no workspace. |
| Apple user wants email sign-in (for example, to use the web without Apple) | Account → **Add email sign-in** → enter email → code (`LINK`) → verify → `link_email_code`. From then on, either method opens the same account. |
| Email user wants Sign in with Apple | Account → **Add Sign in with Apple** → Apple's sheet (iPhone) or Apple JS (web) → `POST /v1/account/apple` → `link_apple`. From then on, either method opens the same account. On iPhone it's proven at the TestFlight checkpoint: in the Expo Go build on the owner's iPhone, Apple's sign-in module isn't available (we saw `ExpoAppleAuthentication=false` on 1 October). |
| The email already belongs to another account | `link_email_code` raises `CT409` `EMAIL_IN_USE` → 409 `EMAIL_IN_USE` (only after the code is proven). Show: "That email already signs in to a different CrewTally account. Sign in with that email to use it, or use another email." No merging. |
| The Apple ID already belongs to another account, or a different Apple ID is already linked | `link_apple` raises `CT409` → 409 `APPLE_ID_IN_USE` ("That Apple ID already signs in to a different CrewTally account.") or `APPLE_ALREADY_SET`. No merging. |

Account screen rows (iPhone More → Account and web `/app/settings/account`, from P1c): "Sign in with Apple: On" or **Add Sign in with Apple**; "Email sign-in: <email>" or **Add email sign-in**; Sign out. No email is shown to other members unless they have `members.manage`.

Apple users who signed up with a private relay address and later sign in on the web with a real email get a **separate new account** unless they linked that email first. The web sign-in page says, under the email field: "Started on iPhone with Apple? Sign in with Apple here, or add your email in the app first (More → Account)."

## 6.5 First run on iPhone

Screens: `SignIn` → `AccountSignIn` → `ChooseWorkspace` → `Welcome`.

| Step | Build | Keep from 1.4 that the design dropped | Don't copy |
|---|---|---|---|
| `SignIn` (`docs/screens-2.0/mobile/SignIn.png`) | **Get started**, **Join my team** (P1b). **Try the Home sample** is added in P2 with the sample data; P1b leaves its place empty. | The line "CrewTally never moves money. It keeps a record of payments you make yourself." and a **Privacy** link (`https://crewtallyapp.com/privacy`, in-app browser). Both are required for App Review. | Choosing Home or Business before sign-in. |
| `AccountSignIn` | Sign in with Apple; **Continue with email** (from P1c: email → 6-digit code screen with Send a new code after 30 seconds); in development builds only, Developer sign-in (test only). | — | "Continue in demo". |
| After sign-in, no workspaces | `ChooseWorkspace`: **Home** (create), **Join a team**. **Business** only when `GET /v1/config` returns `business_enabled: true`. | — | Showing Business while the flag is off. |
| After sign-in, one or more workspaces | Open the last used workspace for this user on this device, or the first. | — | — |
| Create Home | Name (default "My home"), the device's time zone as `default_timezone`. Then `Welcome`: **Create my project**; **Explore the sample** is added in P2 (P1b leaves its place empty). | — | — |

Sample before sign-in (from P2): **Try the Home sample** opens the bundled sample with no account. In sample mode the app makes no write calls to the API; the guard lives in one place and is tested. Every sample screen shows a **Start my own** banner (1.4 rule) and never shows a sync status or "Synced at" time.

## 6.6 First run on the web

From P1c. Routes in §12.2.

- `/app/start` (`choose`): **Set up a Home workspace**, **Join a team**, and **Sign in**. Business appears only when the flag is on (B1).
- `/app/signin` (`signin`): **Sign in with Apple** (shown only once the Services ID is set up), and email → **Send code** → `/app/signin/code` (`verify`, rebuilt as a code entry screen: 6 digits, **Send a new code**, **Use another email**). No sign-in links by email.
- After sign-in: the same rules as iPhone (the last used workspace, or the first; none → `/app/start`).
- `home-setup` (`/app/start/home`): workspace name only, after sign-in. It never asks for an email before sign-in.
- Web has no interactive sample in Release 1. "Explore the sample" on the web goes to the website's How it works page (§19).
- Footer on every signed-out page: "CrewTally never moves money." and links to Privacy, Terms and Support.

## 6.7 Sign-out and sessions

- iPhone sign-out with queued work offers **Send now** or **Discard** (1.4); it never discards silently.
- Web sign-out revokes the session row and clears the cookie.
- Account → **Sign out of other devices** is not in Release 1.

---

# 7 Invitations

Built in P1b (Home partner on iPhone and API), P1c (web join and web invite for the partner), B1 (Business roles).

## 7.1 Rules

| Rule | Value | Enforced by |
|---|---|---|
| Link token | 32 random bytes, base64url; link `${PUBLIC_BASE_URL}/join/<token>` (development: `https://<dev domain>/api/join/<token>`; from P8: `https://crewtallyapp.com/join/<token>`) | API |
| Fallback code | 6 digits (`crypto.randomInt`) | API |
| Stored | `sha256(token)` in `token_hash` (unique; plain SHA-256 is enough for a 256-bit random token); `HMAC-SHA256(CODE_PEPPER, email + ':' + code)` in `code_hash`. The raw token and code are never stored, not even in the idempotency table. | API, `create_invitation` |
| Returned | Token, code and link once, in the create response | API |
| Valid for | 7 days | `create_invitation` |
| Wrong codes | Counted per signed-in person and email (`invitation_code_attempts`). 5 wrong tries in 24 hours stop **that person** trying codes for that email until the window passes. A stranger's guesses never change, lock or use up anyone's invitation, and never affect the link. | `accept_invitation_code` |
| One pending per workspace and email | `CT409` | `invitations_one_pending` |
| Already a member (by verified email) | `CT409` | `create_invitation` |
| Home: role must be `PARTNER`; Business: `ADMIN`, `LEAD` or `WORKER` | `23514` → 422 | `create_invitation` |
| Second partner | `CT409` | `create_invitation`, `memberships_one_partner` |
| Worker invitation | Must name the worker record (`worker_id`) it binds to | check constraint |
| Binding a worker record (`WORKER`, or `LEAD` with a worker) | Needs `money.view` (owner, or admin with money access); otherwise `CT403` | `create_invitation` |
| Inviter removed or demoted | Their pending invitations are revoked; accepting re-checks the inviter is still active and allowed, otherwise 410 `INVITATION_NOT_AVAILABLE` | `remove_member`, `change_member_role`, accept functions |
| Before sign-in | The person sees only the workspace name and the role | `peek_invitation` |
| Rate limits | Peek 20/min per client IP; accept by code 10/min per user | API |

## 7.2 Statuses

`PENDING` → `ACCEPTED`, `REVOKED`, `DECLINED` or `EXPIRED`. Wrong codes never lock an invitation. Only `PENDING` can be accepted. Every other status, and an unknown token, gives the same answer: "This invitation isn't available. Ask for a new one."

## 7.3 Flows

| Flow | Route and function | Notes |
|---|---|---|
| Create | `POST /v1/invitations` (`members.manage`) → `create_invitation` | Body `{role, email, name?, operation_id}` (P1c adds `send_email`). Server makes the id, token and code. `name` is the inviter's own label for the person, stored as `invitations.invitee_name` (`create_invitation`'s last parameter, `p_invitee_name`). Idempotent by `operation_id`: a retry returns the same invitation with `token` and `code` null and `already_created: true`; the app then offers **Revoke and invite again**. From P1c, `send_email: true` also emails the link and code after the commit; a failed send never undoes the invitation. |
| List | `GET /v1/invitations` (`members.manage`) | Name (the inviter's label), email, role, status, expiry. Never the token or code. |
| Revoke | `DELETE /v1/invitations/:id` (`members.manage`) → `revoke_invitation` | Allowed for invitations you sent, or ones you could have created yourself; otherwise `CT403`. `CT404` if not pending or not in this workspace. |
| Resend | Client action: revoke, then create a new invitation to the same email | New token, new code, new 7 days. |
| Peek | `POST /v1/invite/peek` (public) → `peek_invitation(sha256(token))` | `{available, workspace_name, role}` or `{available:false}`. |
| Accept by link | `POST /v1/invite/accept` (session) `{token, operation_id}` → `accept_invitation(user, sha256(token))` through `withUserIdempotency` | The person signs in first. |
| Accept by code | `POST /v1/invite/accept-code` (session) `{email, code, operation_id}` → `accept_invitation_code(user, email, HMAC(CODE_PEPPER, email+':'+code))` through `withUserIdempotency` | For when the link won't open on this device. The code proves the person got the email; the signed-in user's own email doesn't have to match. |
| Decline | `POST /v1/invite/decline` (public) → `decline_invitation` | Same answer whatever the token. The inviter sees "Declined" in the list. |
| Landing page | `GET /api/join/:token` (public HTML, served by the API; `crewtallyapp.com/join/*` forwards there from P8) | "You've been invited to help with <workspace>" from peek, **Open CrewTally on your iPhone**, and from P1c **Continue on the web** (links to `/app/join#<token>`; the token stays in the fragment, so it never reaches a server log). Unavailable: the one message. `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. |

Re-joining after removal: `accept_invitation` reactivates the old membership row with the new role.

## 7.4 Messages

| Case | Message |
|---|---|
| Wrong code, expired invitation, or tried too often (all three) | "That code didn't work. Check the email address and the code, or ask for a new invitation." |
| Unavailable (any reason) | "This invitation isn't available. Ask for a new one." |
| Joined, Home | "You're helping with <workspace>. <Organizer> manages the plan." |
| Joined, Business (B1) | "You've joined <business> as <role>. The business pays for CrewTally; you don't need a plan." |
| Already a member | "You're already in <workspace>." (open it) |
| Partner seat taken | "<Workspace> already has a partner." |

`accept_invitation_code` returns `INVITATION_CODE_WRONG` (→ 400) for a wrong code, an expired invitation and "you've tried too often today" alike, so the app can't tell them apart. That's on purpose; use the code message above for all three, on iPhone and web. A link token that isn't available (`accept_invitation` → 410, whether its result says `INVITATION_NOT_AVAILABLE` for an expired link or an inviter who lost access, or it raised `CT410` for a used, revoked or unknown one) shows the unavailable message.

**Names in member lists.** Members show their own `display_name` (set with `set_display_name`, `PATCH /v1/me`). If they have none: to roles with `members.manage`, the invitation label (`invitee_name`) from the invitation they accepted; to everyone else, the role name ("Partner", "Admin", "Crew lead", "Worker"). A deleted user shows as "Former member".

## 7.5 Universal links

`https://crewtallyapp.com/join/<token>` opens the iPhone app only from the first TestFlight build with associated domains, once `PUBLIC_BASE_URL` is `https://crewtallyapp.com` (P8). In Expo Go and in development, the code is the way in. Don't build anything for Expo Go deep links.

## 7.6 Logging

Invitation and code routes log the operation id, status and invitation id only. Never the email, token or code. A test captures log output and asserts none of them appear.

---

# 8 Home partner

Built in P1b (invite, join, leave, remove) and honoured by every later phase.

## 8.1 What a partner can and can't do

| Partner can | Partner can't |
|---|---|
| Open the whole workspace, every project | Set or change pay rates (`rates.set`) |
| Record work, mark rest as no work, use previous workday | Remove people: end assignments, retire workers (`people.remove`) |
| Record payments, splits, crew payments, reversals, corrections, check status, reimbursements, adjustments | Invite, revoke or remove members (`members.manage`) |
| Create and share receipts and statements, get hand-over signatures | Manage the plan: buy, restore, manage subscription (`plan.manage`) |
| Add workers and projects, archive and reopen projects | Rename the workspace or change settings (`settings.edit`) |
| See and edit My crew favorites, skills, notes and ratings | Delete the workspace |
| Export records | — |
| Leave the workspace; delete their own account | — |

One partner per Home workspace on every plan, including Free (D11). The partner never pays and never sees a paywall.

## 8.2 Workers a partner adds

A partner can add a worker and add them to a project, but can't enter the rate. The worker waits for the organizer.

- `POST /v1/assignments` from a partner must not include a first agreement. If it does → 403 `FORBIDDEN` (the handler checks `member_can(…,'rates.set')` before inserting an agreement), and nothing is written.
- The worker shows **Waiting for rate** (label and icon) on Today, My crew and the worker page, for everyone. The organizer sees **Set rate**.
- The organizer sets it with `POST /v1/assignments/:id/first-rate` (P2), which inserts the assignment's first `rate_agreements` row directly (invariant 2: a first agreement is inserted directly; every later change goes through `apply_rate_change`).
- No work at all can be recorded for that worker until an agreement exists: `record_work` raises "no pay agreement for date" (→ 422 `NO_RATE_FOR_DATE`), even for No work. Today shows the card with "Waiting for <organizer> to set the rate" instead of the work buttons. Never use $0 or a preset rate (invariant 6).
- The organizer sees it on next open: Crew and Projects show "<n> workers waiting for a rate" from the `waiting_for_rate` counts in `GET /v1/projects` and `GET /v1/crew`. No push.

## 8.3 Organizer screens

More → **Partner** (`HomeInvite`, `HomeInviteReady`, `InvitePending`):
- No partner and nothing pending: invite form with the partner's name (for your own reference) and email. Copy: "Your partner can record work and payments, add workers and projects, and share receipts. They can't change pay rates, remove people, invite others or manage the plan. They don't pay anything."
- After creating: link and code once, with **Share** (iOS share sheet; text: "Join me on CrewTally to help keep track of <workspace>. Open <link> on your iPhone, or enter code <code> with this email address: <email>. It works for 7 days.") and **Copy**. Then the pending card: email, expiry date, **Revoke**, **Resend**.
- With a partner: name, "Partner since <date>", **Remove partner** (confirm: "<name> will lose access to <workspace>. Their work and payments stay in your records.").

Don't copy from the design: the "Project organizer" access label and "this project" wording on `HomeInvite`/`HomeInviteReady` (the partner gets the whole workspace, as a partner). Use "Partner" and "<workspace>".

## 8.4 Partner screens

- More shows **Leave <workspace>** instead of Partner (confirm, then the switcher).
- Plan screens show the plan name and "Managed by <organizer>"; no prices, no purchase or restore buttons. A plan limit hit shows: "<Workspace> is on the Free plan, which covers 1 active project and 3 current workers. Ask <organizer> about Project Pass or Pro." (402 `PLAN_LIMIT` still comes from the server.)
- Rate fields are read-only with "Only <organizer> can change pay rates."
- Remove and retire actions are hidden.

## 8.5 Who did it

Every money and evidence row records `recorded_by` (0003 trigger, from the actor `require_member` set). `recorded_by` references `users(id)`. The trigger always uses the transaction's actor; if a value is supplied that differs from it, the insert fails with `CT403` → 403. Payment review markers (`day_reviews`) carry it too. A server test calls every money route and asserts the stored `recorded_by` = the signed-in user (never null). In the app:
- Work history, payment detail and the ledger show "Recorded by <name>" when the workspace has more than one member. A deleted user shows as "Former member".
- Needs review shows whose version is whose ("Your phone" / "<Partner>'s phone").
- Receipts and statements keep the workspace's payer display name; "Recorded by" is not printed on worker-facing documents.

## 8.6 Partner on the web

The same role and the same rules, through the same API. The web app shows and hides from `can`, exactly like the iPhone. The revised web design has no partner role and lets every Home user act as organizer, billing included; don't copy that (§12).

## 8.7 Tests

- Partner: allowed and refused routes exactly as §5.3, in the role matrix.
- Partner adds a worker with an agreement → 403; without → 201; recording work for that worker → 422 `NO_RATE_FOR_DATE`; organizer sets the rate → recording works.
- Second partner invitation → 409. Partner on Free plan → allowed.
- Partner removed → every member route 404 at once; their recorded rows keep `recorded_by`.
- Partner leaves → same as removal.

---

# 9 Account deletion

Built in P7 (iPhone and web, with migration 0007 deletion jobs). The only path that deletes records (invariant 11).

## 9.1 What `delete_user_account(user)` does

From 0003, in one transaction:

1. For every workspace where the user is the active `ORGANIZER` or `OWNER`: calls `delete_workspace_data(workspace)`. **That workspace is deleted for every member**, partner included.
2. Marks every other membership of the user `REMOVED` (they leave those workspaces; the records stay with those workspaces).
3. Revokes every pending invitation the user sent, and every pending invitation addressed to the user's email (so a new account with that email can't take them over).
4. Revokes every session of the user.
5. Deletes the user's `apple_credentials`. It doesn't delete `email_codes`: those rows are purged by P7's nightly job after 24 hours, so deleting an account never resets the email limits.
6. Sets `deleted_at` and clears `apple_sub`, `email`, `email_verified_at` and `display_name`.
7. Returns `{"deleted_workspaces": [ids]}`.

App code never calls `delete_workspace_data` directly.

## 9.2 The deletion flow

Built in P7. Routes are session routes (deletion is about the person, not one workspace).

| Step | Who | Notes |
|---|---|---|
| 1. Preview | `GET /v1/account/deletion-preview` | Lists workspaces that will be deleted (name, kind, other members by display name and role) and workspaces the user will leave, plus which sign-in methods the user has. Never emails. |
| 2. Re-authenticate | Client | Apple users: a fresh Apple identity token (same `sub`, issued in the last 10 minutes, nonce checked). Email users: a fresh code from `POST /v1/account/delete/code` (purpose `DELETE`, sent to the account's verified email; a sign-in code never works here, and a deletion code never signs anyone in). Users with both: either. |
| 3. Request | `POST /v1/account/delete` with `{confirm: "DELETE", apple_identity_token? , email_code?}` | Missing or stale proof → 401, nothing deleted. |
| 4. Revoke Apple tokens | API, before step 5 (it needs `apple_credentials`) | For **each** `apple_credentials` row: `POST https://appleid.apple.com/auth/revoke` with the client id it was issued to: the **bundle ID** for `client_kind = 'APP'`, the web **Services ID** for `'WEB'`, and the matching client secret. 200 or `400 invalid_grant` counts as done. Anything else: an `APPLE_REVOKE_FAILED` ops alert, 503 `TRY_AGAIN`, and **nothing is deleted**. |
| 5. Delete in the database | API, one transaction | `delete_user_account(user)`, then a `deletion_jobs` row (0007) per deleted workspace for files and RevenueCat. Returns 202 and clears the web cookie. |
| 6. Delete files | Cleanup job | Objects under `ws/<workspace_id>/` for each deleted workspace. |
| 7. RevenueCat | Cleanup job | Delete the RevenueCat customer for each deleted workspace id (the app user id). "Not found" counts as done; failures retry nightly and alert after 5. |
| 8. Device | iPhone | Cancel reminders, clear the local database, queue and drafts for this user. |

## 9.3 Screens and copy

`DeleteAccount` and `DeleteConfirmation` (P7), and web Settings → Data → **Delete account**.

Must show, in this order:
1. If the user is the organizer or owner of any workspace with other members: "Deleting your account deletes <workspace> for everyone in it, including <partner name>. They'll lose access to its records." One line per workspace.
2. If the user is a member elsewhere: "You'll leave <workspace>. Its records stay with <organizer or owner>."
3. "All projects, workers, payments, receipts, statements and photos in workspaces you own are deleted from our servers."
4. "Backups are kept for 30 days, then they're gone too." (1.4 note; dropped by the design, restore it.)
5. "Copies you already shared with workers can't be recalled."
6. "Deleting your account doesn't cancel an App Store subscription." with **Manage subscription** (iPhone settings link).
7. **Export my data first**.
8. An "I understand" checkbox, type DELETE, then re-authenticate.

Partners and members deleting their own account see only items 2, 5, 7 and 8.

## 9.4 Public page

`/delete-account` explains how to delete in the app or on the web, what is deleted, the 30-day backup period, and the support email for help. Required by the App Store and later Google Play. Until P7 the API serves a simple version at `/api/delete-account`; from P7 it's a website page (§13) and the API path redirects to it.

## 9.5 Tests

- Organizer with a partner deletes their account: the workspace and all its rows are gone, the partner's `GET /v1/me` no longer lists it, the partner's account still works.
- A user with both an `APP` and a `WEB` Apple token: two revoke calls, each with its own client id, before `delete_user_account`; a failed revoke → 503 and nothing deleted.
- Partner deletes their account: the organizer's workspace keeps every row the partner recorded, `recorded_by` still points to the scrubbed user, the partner seat is free.
- A user in three workspaces (organizer of one, partner of one, Business admin of one): only the first is deleted.
- Seed two workspaces; delete one; every table's row count for the other is unchanged.
- After deletion, sign-in with the same Apple ID or email creates a new user with no workspaces.

---

# 10 Home screens: changes from 1.4

How to read this section:
- One table per phase, in build order. Each row is one iPhone screen from `docs/SCREEN-COVERAGE-2.0.csv`.
- **Target** is the image in `docs/screens-2.0/mobile/<ID>.png`. Build its layout, wording and style.
- **Build** is what the screen does.
- **Keep from 1.4** is behaviour the revised design dropped that must be built anyway (D6, D7, D16).
- **Don't copy** is what the image or the prototype does wrong.
- Every phase also builds the matching web routes (§12.2). The web follows the same rules as the iPhone row.
- Where a screen shows money, the rules in §11 apply even if the row doesn't repeat them.

Rules that apply to every Home screen:
- Amounts: integer cents from the server, formatted for display only; tabular digits; right-aligned in lists.
- Every status has a text label and an icon (§17.4).
- "Record payment" never looks like a transfer button: neutral style and the helper text "Records a payment you already made."
- Screens show actions from `can`; the partner sees fewer (§8.4).
- Never "Unlimited", never "payroll", never "verified", "sent" or "delivered" for money.

## 10.1 Phase 1b: start, workspaces, partner

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `SignIn` | Get started, Join my team (§6.5). **Try the Home sample** is added in P2; leave its place empty. | "CrewTally never moves money…" line and Privacy link. | Home/Business choice before sign-in. |
| `AccountSignIn` | Sign in with Apple; dev sign-in in development builds; Continue with email from P1c. | Apple nonce flow from Phase 1 unchanged. | "Continue in demo". |
| `ChooseWorkspace` | After sign-in only: Home, Join a team; Business only when `business_enabled`. | — | Workspace time zone as the only time zone (it's a default, D9). |
| `Welcome` | Layout only: Create my project. Create my project goes to Today until P2 builds setup. Leave the **Explore the sample** slot empty in P1b; P2 adds it with the sample data. | Sample is local and read-only; Start my own banner (P2). | — |
| `WorkspaceSwitcher` | More → Workspaces: name, Home/Business, your role; Create a Home workspace. | — | Moving queued work between workspaces. |
| `JoinTeam`, `JoinInvite`, `InviteExpired`, `JoinedTeam` | Email + 6-digit code; result shows workspace name and role (§7.4). | — | Short typed codes like "RIVERA-204"; showing inviter, job or pay before sign-in; "This invitation is not for me" that records nothing (use Decline). |
| `HomeInvite`, `HomeInviteReady`, `InvitePending` | Organizer invites one partner (§8.3); link and code shown once; pending card with expiry, Revoke, Resend. | Partner limits from 1.4 partner design (no rates, no removing people, no account deletion). | "Project organizer" label; "this project" wording; no expiry or revoke. |
| `InvitePartner` | Same flow as `HomeInvite` (it's the entry from More). | — | Project-level scope. |
| `BAccessRemoved` | Any removed member, and anyone who left: "You no longer have access to this workspace. Your account and other workspaces are still here." No names (after the 404 the app can't fetch them). Then the switcher. | — | Redirect only for crew leads (the prototype); every role gets it. |
| `More`, `Account`, `Diagnostics` (partial) | More gains Workspaces and Partner (organizer) or Leave (partner). Account shows Your name (`PATCH /v1/me`), sign-in method ("Signed in with Apple", or "Developer sign-in" for `dev:` users) and Sign out; P1c adds the linking rows (§6.4). Diagnostics shows the first 8 characters of the user id, workspace id, role and kind. | Help and support entry, app version and support ID (restored fully in P7). | — |

## 10.2 Phase 2: projects, workers, pay, My crew

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `SetupProject` | Name, project use (My home, Rental, Business use) in Project settings, time zone (default from `default_timezone`, else the device). | **Work days picker** (drives Unrecorded days, Mark rest and reminders), editable time zone. | Time zone shown read-only; work days hidden. |
| `SetupWorkers` | Add workers one after another (Add another), name, phone, email, documents language. | Several workers in one pass; **From Contacts** (system picker); **From My crew**; the possible-duplicate warning when a name matches an existing crew member. | One worker only. |
| `SetupPay` | Pay per worker: daily or hourly, rate, start date, standard day length (DAY only). The rate is typed; it starts blank. | Hours example ("6 h of an 8 h day = $180"); start date shown, not silent. | A preset or default rate; ending setup without a rate for a worker the organizer added (the worker can be skipped and shows Waiting for rate). |
| `EmptyToday` | Today right after setup, everyone Unrecorded. | Pay what's owed and No payments today in their usual place (hidden at $0 owed). | Review payments as the only footer action. |
| `Workers` (Crew tab, My crew) | Whole-workspace crew list (D7): search by name or skill; filters All, Favorites, Working now, Past with counts; Skill picker; rows with favorite star, skills, average rating and project count, and owed amount or "Last worked <date> · <project>". | Everything above is 1.4 My crew; the design cut it to a project list. Visible to roles with `crew.private`; amounts only with `money.view`. | Project-scoped list; dropping past workers. |
| `WorkerDetail` | Balance card with the breakdown link, Record payment, Statement, Work history. | Favorite toggle, skills, **Call**, **Text**, Add to a project, rating card (stars average, Would hire again, latest note), **balances on every project** (so advances elsewhere are visible), Projects worked. | Hiding other projects' balances. |
| `WorkerAdvance` | Worker in advance: "Paid in advance" with the credit amount (label and icon). | Separate lines for adjustments and returned money (§11). | Folding adjustments into Expenses. |
| `AddWorker` | Name, phone, email, documents language, skills (chips, up to 12). | **Choose from Contacts**; skill chip picker. | Silent $240/day rate and "Review the agreed rate" toast. A new worker has no rate until someone with `rates.set` types one. |
| `WorkerEdit` | Edit name, phone, email, language, skills. | **Retire from My crew** (worker `INACTIVE`, `people.remove`), separate from ending an assignment. Skills editable. | Losing skills editing. |
| `DeactivateWorker` | "Remove from <project>": ends the assignment (end date); shows the balance still owed; "Work history and balances stay. You can still pay them." | Paying ended assignments still works. | The word "delete". Saying the worker leaves My crew. |
| `HireAgain` | Add to a project: choose an active project or a new one, pay basis, rate (prefilled from the worker's last agreement, editable), start date. | **Text first** opens Messages with the 1.4 message in the worker's documents language. | Bare rate with no basis or start date; "Preview an invitation message" toast. |
| `RateWorker` | Private feedback per worker per project: **1–5 stars**, Would hire again (Yes, Maybe, No), note (≤500). "Only people who manage this workspace see this." | Stars (0005 requires them, D7). Asked when a project is archived (skippable). | Dropping stars; "Only you". |
| `Projects` | Active and Archived sections, New project. | Edit, Archive, Reopen; work days and time zone on each project; advances shown apart from amounts owed. | Showing only the current project. |
| `ProjectSummary` | To date: earned, reimbursements, adjustments, paid, returned, owed, with the sum written out. By worker. | **By week**, **Pay what's owed**, **Export CSV**, freshness time; returned money on its own line. | "Net balance" that sums signed balances (one worker's advance would hide another's amount owed). Show "Owed $x" (positive balances) and "Paid in advance $y" separately. |
| `ProjectSettings` | Name, project use with the "regroups year totals" note, link to archive. | Time zone and work days editing (1.4 project detail). | Calling project use "Used for" next to Business workspace wording; say "Project use". |
| `ArchiveProject` | Confirm archive with amounts owed and advances shown separately; "Records stay. A Project Pass stays with this project." | Then offer to rate each worker (skippable). | Net balance. |
| `ChangePay` | Change pay rate: new rate, effective date, basis (daily or hourly), standard day length. Organizer only (`rates.set`). | Basis change allowed only after the last recorded work; caps. | "Future entries only" with a past date; choosing which entries to recalculate. |
| `RateReview` | Effective today or later: "Nothing already recorded changes." Backdated: list **every** affected day with old and new amounts and the total change; reason required; **Apply to all <n> days** or Cancel. | `apply_rate_change` all or nothing (`preview_rate_change` for the list). | Per-entry selection (leaves some days at the old rate). |

Plan limits in P2: the server answers 402 `PLAN_LIMIT`. P2 shows a simple limit message from the response; the revised `LimitSheet` and purchases come in P7.

Rates in P2: a first agreement is inserted directly, with its assignment (`POST /v1/assignments`, `POST /v1/setup`) or later through `POST /v1/assignments/:id/first-rate` when a partner added the worker without a rate. Every later change goes through `ChangePay` → `RateReview` → `apply_rate_change` (`POST /v1/assignments/:id/agreements`, with its preview). The web rate change page is P2 too (§12.2).

The sample project is P2: the bundled sample file, **Try the Home sample** on `SignIn` and **Explore the sample** on `Welcome`.

## 10.3 Phase 3: Today, work, offline

This is the biggest change. D6: build the revised layout and keep 1.4's one-tap speed.

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `Today` | See "Today, top to bottom" below. | One-tap Full · ½ · Other · No work (daily) and Hours · No work (hourly); 5-second Undo; bulk Mark rest; project switcher; date row with previous and next day and a calendar; Pay what's owed; No payments today. | Record day opening a full-screen form preset to Full (2 taps); No work with no Undo; balance including unsynced work. |
| `TodayDark` | Same screen in dark mode (§17). | — | — |
| `TodaySample` | Sample Today with the **Start my own** banner. | 1.4 sample banner and "nothing is saved" note. | "Rivera household" account header and "Synced at 6:20 pm" in the sample. |
| `TodayOffline` | Offline banner; queued entries marked **Waiting to send**; balance labelled "as of <time>"; "+$x waiting to send" shown apart. | Payments disabled with "Payments need a connection"; Mark rest works offline (queued). | Adding pending work to the balance. |
| `TodayList` | Not a separate view: the Needs recording / Recorded split replaces the 1.4 Cards · List switch and the Unrecorded only filter. Rows are compact (56 pt) when a project has more than six workers. | — | — |
| `TodayHours` | Full-screen hours entry: Duration (h:mm) or Start & end with unpaid break; quick picks 4, 6, 8, 10 h; note; the amount shown before Save. | **Over-12-hour confirmation**; amount on the save button. | Start/end wrapping past midnight (08:00–08:10 with a 30-minute break must be rejected, not 23 h 40 m). A break as long as or longer than the shift → error. An overnight shift needs an explicit "Ends the next day" switch. |
| `TodayOther` | Part day for a daily worker: ¼, ½, ¾, a typed fraction (up to 4 decimal places), and **Hours** when the agreement has a standard day length (`DAY_MINUTES`). | ¾ preset and hours mode (avoids rounding drift). | Only Full / Half / ¼ plus decimal. |
| `TodayMarkRest` | Confirm **Mark rest as no work (n)**: "Record No work for <n> workers still unrecorded on <date>?" Shown only on work days with unrecorded workers. | Never overwrites a recorded entry (`mark_rest_no_work`). The count leaves out workers Waiting for rate (the function skips assignments with no agreement). | Single-worker "Record no work?" screen. |
| `TodayComplete` | Everyone recorded: completion banner, Use previous workday hidden, owed total. | Pay what's owed and **No payments today** (day completion needs payment review). | Synced time while Needs review items exist. |
| `PreviousWorkday` | Use previous workday (see below). | — | Writing 8 h / Full day regardless of what happened. |
| `TodayLargeText` | Largest Dynamic Type: one column, buttons wrap to two rows, amounts under names. | — | Worker name staying small while buttons grow. |
| `WorkHistory` | Today's entries plus previous days; tap a row → `EditWorkEntry`. | Filters by **project, worker, period** and **Recorded / Unrecorded / Corrected**; revision history on each entry; Clear entry (VOID with reason). | Losing filters (the project brief asks for them). |
| `EditWorkEntry` | Correct a recorded entry: change hours or portion, change to No work, or clear it. | **Reason field, required** (the database rejects a revision after the first without a reason); revision list. | Saving a correction without a reason. |

### Today, top to bottom

1. **Header:** workspace name (opens the switcher), connection status, pending count.
2. **Project switcher** (always shown when the workspace has more than one active project).
3. **Date row:** previous day, date (tap for calendar), next day. Work dates use the project time zone.
4. **Summary:** "Owed on this project $x" (sum of positive balances only), "Paid in advance $y" when any, "+$z waiting to send" when anything is waiting to send, "Unrecorded: n" on work days.
5. **Needs recording:** one card per unrecorded worker. Name, pay ("$240/day", "$30/hr"), and the work buttons:
   - Daily: **Full** · **½** · **Other** · **No work**.
   - Hourly: **Hours** · **No work**.
   - Waiting for rate: no buttons; "Waiting for <organizer> to set the rate" (§8.2); the organizer sees **Set rate**.
6. One tap saves on the device and shows "Saved · Undo" for 5 seconds. The entry is sent when the snackbar closes or the person leaves the screen. Undo inside the window cancels the send; nothing reaches the ledger. After sending, a change is a correction (new revision, reason required).
7. **Recorded:** collapsed section with what each worker got and the amount (Pending label until the server confirms).
8. **Use previous workday** (when there are unrecorded workers and a previous workday with entries).
9. **Mark rest as no work (n)** (work days, unrecorded workers remain).
10. **Pay what's owed ($x)** when anyone on the project is owed; **No payments today** marks the day reviewed.

Timing goal (1.4 measure, kept): five workers recorded in under 30 seconds.

### Use previous workday

- "Previous workday" is the latest date before this one on which the project has at least one active entry that isn't VOID.
- Preview lists each worker who is unrecorded today and was recorded on that day, with that day's **actual** entry (Full, ½, ¾, 0.6 day, 6 h 30 m, No work) and today's amount at **today's** agreement rate (from `GET /v1/projects/:id/day/:date/previous`, §16.4; the server calculates the real amount when each entry is recorded).
- Each row has a checkbox, ticked by default. Workers that can't be copied (waiting for a rate, an hours entry with no day length on today's agreement, a pay basis change between the two dates) are listed under "Not copied" with the reason. Workers already recorded today aren't listed.
- **Record <n> workers** sends one `POST /v1/projects/:id/day/:date/copy-previous` with the ticked lines, each with its own operation id. The server re-reads every source entry, checks each target is still Unrecorded and records them all in **one transaction**. If any target was recorded in the meantime → 409 `ALREADY_RECORDED` and nothing is written. Online only.
- It never copies notes or rates; it copies the input (mode, portion or minutes) only.

Offline queue (1.4, kept): work entries only, durable SQLite queue per user + workspace, individual results, rejected entries to Needs review with both versions. Needs review and the sync screens are restyled to the revised images in P7.

## 10.4 Phase 4: payments

Adopt from the design: blank amount with a **Full balance** button, an unticked "already paid" confirmation, a before/after balance preview, a review step before every money change, and local drafts. Keep everything else from 1.4 payments.

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `Payments` | Record a payment (choose worker first); Pay what's owed; Split a payment; payment list. | Filters (date, worker, project, method); receipt number and status on each row (Check not cleared, Reversed, Superseded). | Session-only recent list. |
| `ChoosePaymentWorker` | Pick the worker; list shows each worker's balance (owed or advance). | — | Hiding the recipient vs allocation idea: "More options" must still reach Split. |
| `RecordPayment` | One worker by default. Amount starts blank; **Full balance** fills the posted balance (never more, never pending work). Method: Cash, Check, Bank transfer, Zelle, Other. Date (today by default, calendar). Reference. Check number for checks. Note. **Attach evidence** (optional). **Save draft**. | Other needs a description; amount cap ($100,000 per payment). No method is preselected: the person picks one, so the receipt shows the real method. | Evidence unreachable; Cash as a silent default. |
| `SplitPayment` | One payment to a recipient (for example, a crew lead) split across workers: recipient, total, date, method, reference, one allocation line per worker × project, "left to allocate". | Allocations must equal the total exactly; each line positive; an advance warning per line. | Recording one payment per worker with method "Via <recipient>". |
| `SplitReview` | Review the split: total, method, date, each line. Confirmation checkbox. | Duplicate warning on the split path too. | Hiding method and date. |
| `SplitRecorded` | One receipt number for the payment; each worker's own view; Share receipt per worker; Get signature. | One payment, one receipt number, per-worker views. | "Separate receipts per worker". |
| `ConfirmPayment` | Before → change → after balance; checkbox unticked; **Record payment** disabled until ticked. | **Method-specific confirmation** text: "Cash handed over", "Check issued", "Transfer made", "Zelle sent", "Payment made" (Other). | Generic "I have already made this payment" for every method. |
| `DuplicatePayment` | Possible duplicate: shows the matching payment (receipt number, date, amount, method, reference). **Record a separate payment** (new operation id) or **Keep existing record**. | Match rule: same date, amount, method and reference (1.4). A network retry is never a duplicate (operation id). | Matching on worker + amount + date + method without the reference. |
| `PaymentRecorded` | Amount, new balance, **Share receipt**, **Get signature** (prominent after cash), View receipt. | Hand-over prominent after cash. | Demoting hand-over to a small link. |
| `PayOwed` | Every worker owed money on the project, ticked, amount prefilled with what they're owed. Untick, change amounts, set **method per worker**, check number for checks, date. Total and count at the bottom. | All of it (1.4). | Amount locked to the full balance; method fixed to Cash. |
| `BulkReview` | Review: each worker, amount, method, check number; total "Record 4 payments · $1,245.00"; one confirmation. | `record_payout`: one payment per worker, **one transaction, all or nothing**. | Saving payments one by one. |
| `PayOwedDone` | Each payment with its receipt number, method, **Get signature**, **Share receipt**, and status once signed or shared. | 1.4 done screen. | Name and amount only. |
| `PaymentDetail` | Receipt card, allocation lines, method and check status, evidence, signatures, receipt versions, share history (Shared, Opened, Confirmed, Question). Actions: **Mark check cleared**, **Check returned**, **Fix this payment**. | Returned check = full reversal of every allocation (`reverse_payment`, `CHECK_RETURNED`). Clearing adds nothing. | No returned-check action; only "Record money returned". |
| `CashPaymentDetail` | Same as PaymentDetail for cash. Status line "Cash payment recorded by <payer>". | Signature line once signed. | "Bank clearance is a separate status" on cash. |
| `CheckCleared` | Success after marking cleared: "Check cleared. This doesn't add a second credit." | — | CT-099 style numbers; use R-000123. |
| `RefundSheet` ("Fix a payment") | Three choices: **Correct the payment** (wrong amount or split: reverse and record a new version in one transaction; old receipt Superseded), **Reverse the whole payment**, **Money returned** (partial reversal with lines). | Per-allocation caps: a partial reversal can't exceed what's left unreversed on that allocation; reason required. | One "Record money returned" capped at the worker's total payments across all payments. |
| `RefundReview` | Before/after for each affected worker; reason; confirm. | Spans every allocation line touched; marks the receipt Superseded or Reversed. | One worker only. |
| `Evidence` | Attach a photo or PDF to a payment (or a reimbursement in P5): Take photo, Choose photo, Choose file. List with delete. | Limits: JPEG, PNG, PDF; 10 MB each; 5 per item; metadata stripped; owner-side only; never on public links in Release 1. | Orphaned screen; web file input styling. |
| `DraftRecovery` | Resume or discard a payment draft (local only, keyed by user + workspace + project). | A draft never changes balances and can't make a receipt. | Resuming a draft for an archived project or after access was removed (block with a reason). |

Payments need a connection (1.4). Offline, the Record buttons are disabled with "Payments need a connection. Your draft is saved on this phone." Drafts are allowed.

## 10.5 Phase 5: reimbursements, adjustments, ledger, year totals, exports

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `Reimburse` ("Add expense owed") | Worker's project, amount, description, **date**, optional receipt photo (Evidence). Before/after preview. | Date field (backdating allowed); evidence; $50,000 cap. | Dropping date and evidence. |
| `ExpenseReview` | Review step for a reimbursement: before/change/after, date, description. | — | — |
| `AdjustBalance` | Direction (Increase owed / Decrease owed), **category** (Opening balance, Bonus, Overtime, Deduction, Other), amount, **date**, reason (required). Before/after. | Categories and date; $100,000 cap; separate ledger type. | Storing adjustments as Expenses. |
| `AdjustmentReview` | Review with category, direction, before/change/after, reason. | — | — |
| `BalanceBreakdown` | The balance written out with **every** component: Work + Expenses + Added − Taken off − Payments + Returned/reversed = Owed (or Paid in advance). Counts per line. See all entries; View statement. | All six ledger components on their own lines (1.4 balance formula). | Work + Expenses − Payments with adjustments hidden in Expenses and reversals hidden in Payments. |
| `Ledger` | Per worker by default, reachable from the worker page **and** More. Tabs All / Work / Expenses / Adjustments / Payments. | Filters by project, worker and date range; opening balance, running balance and closing balance; filtered totals labelled apart from all-time balances. | No running balance or date filter; "imported aggregate" rows. |
| `YearTotals` | Calendar year, net paid per worker **across all projects**, earned and reimbursed alongside; per project use; Export CSV. | 1099-NEC and household-employee notes from `tax_thresholds` (D8), year stepper, "A record of what you paid. It isn't tax advice." | Per-project only; no tax notes. |

Exports move to the server in P5 for both surfaces: `POST /v1/exports` (CSV) with scope (project, worker, date range, year) and the CSV rule in §11.2.

## 10.6 Phase 6: receipts, statements, sharing, public page

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `Receipt` | Receipt from the stored snapshot: number R-000123, payment date, payer display name, recipient, method, reference, project, allocation lines for the chosen view, honest status line, generation time. Language EN/ES. Share, Save PDF. | **Who is this for**: the worker view by default (only their line); the **full split view** only when sharing with the named recipient; "Not bank verified" and the other 1.4 status lines; Superseded and Reversed shown; optional balance "as of <time>". | CT- or BR- numbers; dropping the status line. |
| `ReceiptSigned` | Receipt with "Received and signed by <typed name>, <date time>" and the signature image. | Signature and name on the receipt and PDF. | "Receipt acknowledged" card with no signer. |
| `Handover` | Hand phone to the worker: one sentence in the worker's documents language with amount, method, payer, project and date; **typed name**; signature; Confirm; Skip. Works offline (payment must already be recorded). | Typed name, Spanish, the exact sentence stored, can't sign a reversed or superseded payment. | Signature-only, English-only, generic text. |
| `TextLink` | Share with <worker>: recipient, amount, message language, message preview, **Text receipt** (Messages with the worker's number) or Share sheet. | Link expiry (30 days receipts, 90 days statements) stated; **Revoke link** on the payment. | Hiding expiry and revoke. |
| `ShareResult` | "Shared: not confirmed. Sharing doesn't prove the worker got it." | Records "Texted" or "Share opened" only. | — |
| `WorkerLinkPage` (public page, `/api/r/:token`) | Worker view only, EN/ES switch, amount, payer, date, method, project, balance "as of" the receipt time, honest status line, signed line if any, **Yes, I received this payment** and **I have a question**. Footer "Kept with CrewTally — free for homeowners" (to `/go/app`), Privacy link, expiry date. | All of it (1.4). No login, no third-party scripts, no tracking, not indexed, no evidence. | Dropping balance, status line, privacy link and expiry. |
| `ReceiptReceived` | After "I received this": thank-you and the receipt. A second tap records nothing new ("Already confirmed"). | Status line and balance "as of". | — |
| `ReceiptQuestion` | "I have a question": note required (≤500, counter), optional typed name. "This doesn't confirm you received the payment." | Label "I have a question". | "Report a problem". |
| `QuestionSent` | "Your question was saved for <payer>. It doesn't confirm the payment. If it's urgent, contact <payer> directly." | — | Implying the payer has read it. |
| `ExpiredLink` | One page for expired, revoked, unknown and malformed links: "This receipt link isn't available. Ask the person who sent it for a new one." No payer name (an unknown token has none), so the page is byte-identical in every case. | T28: identical for all cases. | "This link has expired." |
| `Statement` | Worker statement (P6, with migration 0006): choose project (or all), period and language; generate a numbered snapshot (`S-000041`); share as PDF. P5 leaves the Statement buttons disabled. | Opening balance, each work day with input, rate and earned, **unrecorded work days listed as "Not recorded", never $0**, reimbursements and adjustments on their own lines, payments with receipt numbers, closing balance "as of". | All-time balance card only. |

Questions from workers show on the payment ("Question from <name>") and in a **Questions** list on the Payments tab until someone with `money.record` marks them resolved. Acknowledgments never change the ledger.

## 10.7 Phase 7: plans, settings, reminders, deletion, sync screens

| Screen | Build | Keep from 1.4 | Don't copy |
|---|---|---|---|
| `More` | Workspaces, Partner or Leave, Projects, Ledger, Year-end totals, Exports, Reminders, Plan, Account, Privacy, **Help and support**, Sync & recovery, app version. Needs review banner at the top when anything needs review. | Help and support entry, version, Ledger and Project summary entries, Needs review banner. | A Text & readability entry in More (see `Readability`). |
| `Plan` | Free, Project Pass, Pro monthly and annual. Prices from StoreKit/RevenueCat, never hard-coded. Pro: "As many projects and workers as you need." **Terms of use** and **Privacy policy** links. | Usage meters (projects and current workers vs Free limits); unused passes. | "Unlimited projects and workers"; one "Terms & privacy" link. |
| `PlanTerms` | Plain plan details: a Pass stays with its project through archive and reopen; Pro renews through Apple until cancelled; **records are never locked**: after Pro ends or a Pass is refunded, everything stays readable and exportable and work and payments for existing workers keep working; only new projects, reopened projects and new current workers are limited. Links: Terms of use, Privacy policy. | Never-locked rule (invariant 16). | Any write pause. |
| `PurchaseReview` | Project Pass for <project>: localized price, one time, stays with this project; "I understand" checkbox; Continue. | Pass recorded on our server; recovered from server records, not Apple restore. | Hard-coded $24.99. |
| `PurchaseAnnual`, `PurchaseMonthly` | Pro review: localized price, renews until cancelled in Apple settings, "As many projects and workers as you need." | — | "Unlimited". |
| `PurchaseSuccess` | Shown only after `POST /v1/plan/refresh` confirms the plan on the server. Pro: "Pro is active for <workspace>." Continue the interrupted step. | The app never decides its own plan. | "Ready for this project" for Pro (Pro is workspace-wide). |
| `PurchaseFailure` | "Purchase not completed. Your plan hasn't changed." Try again; Restore purchases. A user cancel just closes the sheet (no failure screen). | — | Treating cancel as failure. |
| `PlanPro` | Your plan: Pro, renewal or end date, localized price, Manage subscription. | Usage; unused passes; "Nothing is lost if Pro ends. Current workers keep working." | "Projects & workers: Unlimited". |
| `ManageSubscription` | Current plan and the server's expiry date; "Renews"/"Won't renew" from the RevenueCat customer info on the device (display only; never used to decide access); **Open Apple subscriptions** button. | — | Showing "Next renewal" after the person cancelled. |
| `LimitSheet` | Hit a Free limit: which limit and the maximum (from the 402 body); Project Pass card for this project; Compare Pro. "Saved workers in My crew don't use a slot." Partner sees §8.4 copy instead. | Monthly-equivalent shown for Pro annual; Pass says "as many workers as this project needs". | "Unlimited workers on this project". |
| `RestoreResult` | Restore purchases: the plan for **this** workspace, by name. A purchase linked to another workspace shows "This purchase belongs to another workspace you own" (name only if the person is a member there). | — | Moving a subscription to another workspace. |
| `Account` | Receipt name (payer display name) with Save and "Earlier receipts keep the name they had." Sign-in methods with Add email sign-in and Add Sign in with Apple (§6.4), Export, Privacy, Sign out, Delete account. | Sign-in method row; export contents description. | — |
| `Privacy` | Plain privacy summary; link to the full policy. | Worker data note (1.4 §15). | "Review evidence before sharing" (evidence never goes on links in Release 1). |
| `ExportData` | **Full export** (ZIP: CSV per record type, all receipt and statement PDFs, evidence, My crew private data), and quick CSVs. Server-built (§11.2). | Full ZIP (needed for deletion and data-access promises). | CSV of three record types only. |
| `DeleteAccount`, `DeleteConfirmation` | §9.3. Re-auth with Apple or an email code. | 30-day backup note; Apple disconnect; deleted-items list; subscription note. | "Removes your workspace" with no member warning. |
| `Reminders` | Per project: on/off, time (default 6:00 pm, must be confirmed), days follow the project's work days, preview of the notification text. | Several projects; this device only; skip when the day is complete; notifications-off fallback card; Open day and Remind me in 1 hour actions. | Mon–Fri chip as a separate setting (days come from work days). |
| `Diagnostics` ("Sync & recovery") | Connection, last synced, pending count, Send now, payment draft, Needs review entry. | App version, **support ID**, export pending entries, "Uninstalling loses entries that haven't been sent." | Dropping support ID and the warning. |
| `NeedsReview` | Two versions side by side with the balance effect of each and whose version is whose; Keep mine / Keep saved. | Reason recorded automatically ("Replaced after conflict"). | — |
| `ConflictReview` | Confirm the replacement: saved vs replacement earnings and balance change. | Same reason text. | — |
| `SavedLocally` | "Saved on this phone. Work entries send when you're back online. Payments need a connection." | Only work entries are queued. | Implying all recording works offline. |
| `SyncComplete` | "All entries sent at <time>." | Not shown while Needs review items exist. | — |
| `Readability` | Don't build a text-size setting. The app follows the iPhone's Dynamic Type. An information screen reached from More → Help and support: "CrewTally follows your iPhone's text size", where to change it, a live preview and **Open Settings**. | — | An in-app text size control; its own entry in More. |

Help and support (restored): More → Help and support links to the help guides (`https://crewtallyapp.com/help`) and the support page (`/support`), shows the support email and the support ID, and has the text-size row (`Readability`).

---

# 11 Money rules: keep, adopt, must not build

The money engine from 1.4 (database rules, ledger, functions and tests) stays. The revised screens are a new presentation on top of it. Where the revised prototype does money differently, the engine wins. Every phase file names the items below that apply to it, and its gate proves them with the listed test.

## 11.1 Keep from 1.4

| # | Rule | Phase | How it's tested |
|---|---|---|---|
| K1 | **Earnings:** one formula (`fn_earned`) for Home and Business, rounded once per entry, half up, to the cent. Previews use `shared/pay.ts`. | P3, B2 | 1.4 Appendix B vectors plus revised examples (7.5 h × $30 = $225.00; 0.5 × $240 = $120.00) in `shared` tests and a DB test; a Business approval test uses the same vectors. |
| K2 | **Hours stored as whole minutes** (1–1,440). Web decimal hours are converted to whole minutes with integer math; input that isn't a whole number of minutes is rejected with "Use whole minutes, like 7:20 or 7.25." | P3, B2 | Web parser tests: "7.5" → 450; "7.33" rejected; "7:20" → 440; never `parseFloat`. |
| K3 | **Daily portions:** Full, ½, ¼, ¾, a fraction to 4 decimal places, and hours (`DAY_MINUTES`) when the agreement has a standard day length. | P3 | UI test for each preset; DB test for `DAY_MINUTES` ($90 vector). |
| K4 | **Over-12-hour confirmation**; 24 h maximum per entry; cross-project warning when one worker's entries on one date add up to more than one day or more than 16 hours. | P3, B2 | Tests: 12 h 01 m asks to confirm; 25 h rejected; two projects 1 day + ½ day warns. |
| K5 | **Blank is not No work.** Unanswered stays Unrecorded on every surface (web timesheet and day sheet included). No work is an explicit choice. | P3, B2 | Web day sheet with an empty cell sends nothing for that worker; statement lists the day as "Not recorded". |
| K6 | **Mark rest as no work** (bulk, Unrecorded only, work days only, confirms count). | P3 | 1.4 T08: five workers, two recorded, mark rest → three No work, two unchanged. |
| K7 | **Undo** for 5 seconds after a Today tap; nothing reaches the ledger if undone. | P3 | Mobile test: tap, Undo within 5 s → no API call; tap, wait → one call. |
| K8 | **Rate from the agreement in force on the work date**, never the worker's current rate. | P2, P3, B2 | Backdated agreement test: entry dated before the change uses the old rate, after uses the new one, regardless of when it's saved or approved. |
| K9 | **Corrections need a reason** (revision > 1). **Backdated rate changes are all or nothing** (`apply_rate_change` with preview). Basis change only after the last recorded work. | P2, P3 | DB check rejects a second revision without reason; API test for backdated change: 409 with preview, then apply with reason → every listed day changed. |
| K10 | **Caps:** day rate $5,000; hourly $1,000; payment $100,000; reimbursement $50,000; adjustment $100,000. | P2, P4, P5 | One over-cap test per cap on both surfaces (same API error). |
| K11 | **Balance** = earnings + reimbursements + increase adjustments − payments + payment reversals − decrease adjustments. Reimbursements and adjustments are their own ledger types. | P5 | Fictional sequence (1.4 §8) as an API test; breakdown lines sum to the balance. |
| K12 | **Advances never netted** against another worker's amount owed, in any total: "Owed" sums positive balances; "Paid in advance" sums negatives separately. | P2, P3, P4 | Fixture: A owed $160, B advance $40 → project shows Owed $160.00 and Paid in advance $40.00, never $120.00. |
| K13 | **Only server-accepted work counts.** Work saved on the phone shows as "+$x waiting to send", outside the balance. | P3 | Offline test: record two entries offline → balance unchanged, pending shows the sum; after sync the balance moves. |
| K14 | **Payments:** one payment with allocation lines (split); allocations equal the payment exactly; crew payments in one transaction (`record_payout`); full and partial reversals; correction (reverse + new version, old receipt Superseded); check Issued → Cleared or Returned (credited once; returned reverses every allocation); Other needs a description. | P4 | Every 1.4 payment test from P4 still passes; plus: split of $300 into $200 + $100 is one payment and one receipt number. |
| K15 | **Payments need a connection.** Local drafts only. | P4 | Mobile test: offline → Record disabled, draft saved, no queued payment op exists. |
| K16 | **Duplicate warning:** same date, amount, method and reference. A retry with the same operation id is never a second payment; same id with a different payload → 409. | P4 | API tests for both. |
| K17 | **Receipts:** immutable snapshots, per-workspace number `R-000123` on every surface; worker view by default; full split view only for the named recipient; honest status lines including "Not bank verified"; balance "as of" on the public page. | P6 | Snapshot test: rename the worker after recording → the old receipt still shows the old name. Number format test on iPhone, web and public page. |
| K18 | **Hand-over signature:** optional; typed name; worker's documents language; exact sentence stored; never changes money. | P6 | Spanish sentence stored verbatim; ledger unchanged after signing. |
| K19 | **Share links:** 256-bit token, hash only; 30 days for receipts, 90 for statements; revoke; expired, revoked and unknown links show the identical page (T28). | P6 | T28; revoke test. |
| K20 | **Acknowledgments:** "I received this" once per link; a question needs a note (≤500); neither changes the ledger. | P6 | Second "received" returns `already_confirmed`; ledger count unchanged. |
| K21 | **Statements:** snapshot; period and project; unrecorded work days "Not recorded", never $0; reimbursements and adjustments on their own lines. | P6 | Statement test with an unrecorded work day. |
| K22 | **Year-end totals and tax notes** (D8), net paid across projects. | P5 | 1.4 T54. |
| K23 | **History filters**: project, worker, date (the project brief asks for them). | P3, P5 | Filter tests on `/v1/work` and `/v1/ledger`. |
| K24 | **Full export** (ZIP with CSVs, receipts, statements, evidence, My crew data). | P7 | Export a seeded workspace; every table's rows appear. |
| K25 | **Project time zone** decides work dates, plan limits and reminders; workspace time zone is only a default (D9). **Currency locks** at the first money record. | P2 | Project in `America/Los_Angeles` at 11 pm Eastern still records the Pacific date. |
| K26 | **Records never locked in Home** (invariant 16). | P7 | 1.4 T51: lapse Pro → existing workers keep recording and being paid. |
| K27 | **No inferred rates or work** (invariant 6): no default rate, no $0 rate, no automatic No work, no automatic payments. | P2, P3, B1, B2 | Add a worker without a rate → recording returns 422 `NO_RATE_FOR_DATE`. |
| K28 | **Evidence:** optional on payments and reimbursements; owner-side only; never on public links in Release 1. | P4, P6 | Public page HTML contains no evidence URL. |
| K29 | **Copy that matters for App Review and support:** "CrewTally never moves money" and Privacy link on the first screen; Help and support; support ID on Diagnostics; "Uninstalling loses entries that haven't been sent"; 30-day backup note on deletion; Terms of use and Privacy policy links on the Plan screen. | P1b, P7 | Screen tests for each string. |

## 11.2 Adopt from the revised design

| # | Rule | Phase | How it's tested |
|---|---|---|---|
| A1 | **Payment form:** amount starts blank; **Full balance** fills the posted balance (`max(0, balance)`); unticked "already paid" confirmation with method-specific wording. | P4 | UI test: Record disabled until ticked; Full balance ignores pending work. |
| A2 | **Review before every money change:** before → change → after preview for payments, splits, crew payments, reversals, corrections, reimbursements, adjustments and rate changes. | P2, P4, P5 | Each flow has a review screen test. |
| A3 | **Payment drafts**, local only, keyed by user + workspace + project; never change balances; never make receipts. | P4 | Draft test across app restart; switching workspaces never shows another workspace's draft. |
| A4 | **Use previous workday**, copying each worker's actual entry (§10.3). | P3 | Fixture: yesterday A Full, B ½, C 6 h 30 m, D No work → preview shows exactly those, at today's rates; copy records four entries in one transaction, and nothing if any target was recorded in the meantime. |
| A5 | **Credit wording:** "Paid in advance" for negative balances, with "This credit counts toward future work." | P2, P4 | String test. |
| A6 | **Owner inbox:** one place for worker questions (Home: Questions list in Payments) and, in Business, correction requests and payment questions (§14.11). | P6, B2 | Question appears in the list until resolved. |
| A7 | **Business approvals:** pending work excluded from balances; double approval rejected; return needs a reason; corrections replace on approval (§14.5). | B2 | §14.13 tests. |
| A8 | **CSV formula protection** on every export, built on the server: a **text** cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'`. Money and other number cells are written as plain numbers (e.g. `-50.00`) and are never prefixed. UTF-8 with BOM. | P5 | Export a worker named `=HYPERLINK("x")` and a credit of −$50.00 → the name cell starts with `'`, the money cell is `-50.00`. |

## 11.3 Prototype behaviours that must not be built

Each would put wrong money on screen or on receipts. The phase named enforces it; its gate includes the test.

| # | Don't build | Instead | Phase | Test |
|---|---|---|---|---|
| 1 | On web, an admin without money access creates a worker with a $0 rate, so approvals pay $0. | The worker record has no agreement; approval is blocked until the owner sets a rate (§14.5). | B1, B2 | Admin without money posts a rate → 403; approve a submission with no agreement → 409 `RATE_NEEDED` and it stays Pending; `rate_minor > 0` check holds. |
| 2 | On iPhone, a new Home worker silently gets $240/day without anyone entering a rate. | No agreement until someone with `rates.set` types a rate. | P2 | AddWorker without a rate creates no `rate_agreements` row; Today shows Waiting for rate. |
| 3 | The rate is copied from the worker's current field when the entry is saved, not taken from the agreement for the work date. | `record_work` (and Business approval through it) reads the agreement in force on the work date. | P3, B2 | Backdated agreement test (K8) on Home record, web record, web day sheet and Business approval. |
| 4 | Recalculating after a backdated rate change needs you to pick entries, so some days can stay at the old rate. | All-or-nothing preview and apply (K9). | P2 | API rejects any request that names a subset of days; apply changes every listed day. |
| 5 | Start/end/break times wrap past midnight: 8:00–8:10 with a 30-minute break becomes 23 h 40 m. | Reject a break ≥ the shift; overnight only with an explicit "Ends the next day" switch; result must be 1–1,440 minutes. | P3 | 08:00–08:10, 30-minute break → rejected; 22:00–06:00 with "Ends the next day" → 8 h. |
| 6 | Business and web don't round per entry, so totals drift from receipts by cents. | Totals are sums of server-calculated per-entry amounts; clients never total rates × hours themselves. | P3, B2 | Three entries of 7 h 20 m at $17.35/h: screen total = sum of the three `earned_minor` = ledger. |
| 7 | Home work saved on iPhone counts in the balance straight away, before it syncs. | Pending shown apart (K13). | P3 | K13 test. |
| 8 | Project totals on iPhone add up signed balances, so one worker's advance lowers the amount shown as owed to others. | Owed and Paid in advance shown separately (K12). | P2, P3, P4 | K12 test on Today, Projects, ProjectSummary, ArchiveProject and web Payments. |
| 9 | Adjustments are saved as expenses, and returned money is hidden inside payments. | Separate ledger types and separate lines (K11). | P5 | Breakdown with one adjustment and one partial reversal shows both lines. |
| 10 | A split payment is recorded as separate payments with method "Via [recipient]". | One payment, allocation lines, one receipt number (K14). | P4 | Split creates 1 `payments` row and n `allocations` rows. |
| 11 | Crew payments are forced to Cash at the full balance, saved one by one. | `record_payout`: editable amounts, method per worker, one transaction. | P4 | Force a failure on the third line → no payment rows written at all. |
| 12 | There's no returned-check action, so a returned check can only be entered as money returned by the worker. | **Check returned** → `reverse_payment` with kind `CHECK_RETURNED`, reversing every allocation. | P4 | Returned split check: every worker's balance goes back up by their line. |
| 13 | There's no way to correct or reverse a payment, on iPhone or web. "Record money returned" is capped at the worker's total payments, not at what's left of that payment. | Fix a payment: correct, full reversal, partial reversal capped per allocation (K14). | P4 | Partial reversal above the allocation's unreversed amount → 422; correction marks the old receipt Superseded. |
| 14 | Payments are recorded offline. | Online only; local drafts (K15). | P4 | K15 test. |
| 15 | On web, an offline correction to a Home entry hides the original's earnings until the draft is resubmitted. | Web never edits offline: corrections need a connection; the original stays until the server accepts the new revision. | P3 | Web offline: Correct button disabled with a reason; balance unchanged. |
| 16 | A Business payment is tied to the worker's current job, not to an allocation the user chooses. | Explicit allocation lines per worker × job (§14.8). | B3 | Reassign a worker to another job; earlier payments' job totals don't move. |
| 17 | Receipts on web are rendered live, not from the snapshot, and numbered with the internal payment ID. | Web renders the stored snapshot with `R-000123` (K17). | P6 | K17 rename test on the web receipt page. |
| 18 | iPhone CSV exports that carry names and descriptions don't neutralise formulas. The web does, but turns negative money into text. | Server-side exports with the A8 rule. | P5 | A8 test. |
| 19 | Revised doc 03 and both prototypes pause work and payments when any workspace expires, Home included. That stops people paying workers already owed and breaks 1.4's never-locked rule. | Home: never locked (K26). Business: read and export only after a confirmed expiry, with worker receipt confirmations and payment questions still allowed (§14.10). | P7, B4 | 1.4 T51 for Home on iPhone and web; B4 expiry tests. |

---

# 12 Web app

A second way into the same account and the same records. React + TypeScript + Vite in its own Replit artifact (`artifacts/crewtally-web`), created in P1c. It calls the same `/v1` API as the iPhone app (invariant 17). No business rule lives only in the web app.

## 12.1 Layout

| Width | Layout | Source image |
|---|---|---|
| Over 1100 px | Sidebar (238 px): CrewTally mark, workspace card (name, kind, your role; opens the switcher), navigation, person and Sign out at the bottom. Top bar with breadcrumb and connection status. Content up to 1440 px wide. | `docs/screens-2.0/web/desktop/*.png`, Home variants in `web/home/*.png` |
| 761–1100 px | Narrower sidebar (205 px); columns stack. | — |
| 760 px and under | Sidebar becomes a drawer (menu button); four quick links fixed at the bottom; tables scroll inside their card; forms one column. | `docs/screens-2.0/web/mobile/*.png` |

Home navigation (organizer and partner): **Today**, **Crew**, **Payments**, **Projects**, **Reports**, **Settings**. Mobile quick links: Today, Crew, Payments, More (opens the drawer).
Business navigation (B1–B2): Today, Jobs, Team, Approvals (owner and admins), Payments (money roles), Reports (money roles), Settings. Lead and worker navigation follows their role images in `web/roles/`.

Rules:
- Every page shows actions from `can` (`GET /v1/workspace`). The server decides.
- Money inputs and hours are typed as text and parsed with integer math (`shared/money.ts`, `shared/pay.ts`). Never `<input type="number">` with `parseFloat`.
- Tables: real `<table>` with `<th scope>`; money right-aligned with tabular digits; sortable columns announce their sort state.
- Full dark mode following the system (`prefers-color-scheme`), using the tokens in §17.
- Print styles for receipts and statements (the design's print CSS is fine).
- URLs: website at `/`, app at `/app/…`, workspace pages at `/app/w/:workspaceId/…`. The API stays at `/api`.

## 12.2 Routes

From the web rows of `docs/SCREEN-COVERAGE-2.0.csv`. Image: `docs/screens-2.0/web/desktop/<id>.png` (also `web/mobile/<id>.png`; Home variant in `web/home/<id>.png` where one exists). Paths below `…/` mean `/app/w/:workspaceId/`.

### P1c: account, setup, invitations, states

`/app` itself opens the last used workspace's `…/today` (or `/app/start` when there's none, or `/app/signin` when signed out).

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `choose` | `/app/start` | Set up a Home workspace, Join a team, Sign in. Business only when the flag is on. | Account creation out of order. |
| `signin` | `/app/signin` | Sign in with Apple; email → Send code (§6.6). | Email-only sign-in; "Use the same email you use in the app" without the Apple hint. |
| `verify` | `/app/signin/code` | 6-digit code entry, Send a new code, Use another email; errors per §6.2. | "Check your email" for a sign-in link; "Continue in demo". |
| (Apple return URL) | `/app/auth/apple` | Reached only if the Apple pop-up is blocked: explains and links back to sign-in. | — |
| `home-setup` | `/app/start/home` | Workspace name after sign-in; browser time zone as `default_timezone`. | Asking for email before sign-in. |
| `setup-ready` | `…/ready` | "Your workspace is ready." Next: create your first project (P2 page). | Demo link. |
| `join` | `/app/join` | Email + 6-digit code (signed in first). One message for a wrong code, an expired invitation, and tried too often (§7.4). | CREW-2026-style codes; separate wording per failure. |
| `invite` | `/app/join#<token>` (token state) | Token read from the fragment, kept for this tab, removed from the address bar. Workspace name and role from peek; Sign in to accept; Accept; Decline. | Showing inviter, job or pay before sign-in. |
| `invite-expired` | `/app/join` (unavailable state) | "This invitation isn't available. Ask for a new one." | Separate expired/revoked/used wording. |
| `workspaces` | `/app/workspaces` | Switcher: name, kind, role; Create a Home workspace; Join a team. | — |
| (partner page) | `…/team` | Home organizer: the partner (`member` layout) or the pending invitation (`invitations` layout), or Invite a partner. | — |
| `invite-person` | `…/team/invite` | Home: invite the partner (organizer only). Business roles in B1. | Partner permissions left undefined. |
| `invite-review` | `…/team/invite/review` | Confirm, then show link and code once with Copy. | — |
| `invitations` | `…/team/invitations` | Pending and recent: name, email, role, status, expiry; Revoke, Resend. | Pending-only list. |
| `member` | `…/team/:userId` | Home: the partner's page with Remove partner. Business roles in B1. | — |
| (leave) | `…/leave` | Partner: Leave <workspace>. | — |
| `empty-dashboard` | state of `…/today` | Empty workspace: "Create your first project." | "Explore sample records" (goes to How it works instead). |
| `access-denied` | state | 403 page: "You don't have access to this. Ask the person who manages this workspace." | — |
| `access-removed` | `/app/removed` | §4.8. | — |
| `load-error` | state | "Couldn't load. Your records haven't changed. Try again." | — |
| `not-found` | `*` | 404 page. | — |

Also in P1c: a minimal Account page at `/app/settings/account` (Your name, sign-in methods with Add email sign-in and Add Sign in with Apple, Sign out), restyled to the `profile` image in P7; web developer sign-in in development only (same guard, same four labels and the same code as iPhone, `POST /v1/auth/dev` with `client: 'WEB'`), so web try-its can sign in as `member-c`.

### P2: projects, crew, pay

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `setup-project` | `…/setup/project` | First project: name, address (optional), time zone, work days, project use. | Missing time zone, work days and project use. |
| `dashboard` | `…/today` | Home overview: projects, owed and paid in advance (separate), unrecorded today, links to the day sheet (P3) and payments (P4). Partner sees the same minus plan actions. | Home entries badged "Approved"; netted totals. |
| `projects` | `…/projects` | Active and Archived tabs; search; New project. | No archive or reopen. |
| `project` | `…/projects/:id` | Project detail: owed and paid in advance by worker, assigned crew with rates (money roles), work days, time zone, Project Pass status, archive/reopen. | Weekly-total entries; labour budget on Home. |
| `new-project` | `…/projects/new` | Name, address, time zone, work days, project use. Plan limit → 402 message with "Upgrade in the iPhone app" for the organizer, §8.4 copy for the partner. | No Free-plan limit. |
| `edit-project` | `…/projects/:id/edit` | Same form; time zone and work days editable. | — |
| `crew` | `…/crew` | My crew (D7): search, filters (All, Favorites, Working now, Past) with counts, skill filter, favorite star, skills, rating average, owed or last worked. | Team-access list as the crew page in Home. |
| `worker` | `…/crew/:workerId` | Worker page: contact, documents language, skills, favorite, rating card, balances per project, projects worked, pay agreements and history, statement link, record payment (P4). | Missing phone, email, language and rate history. |
| `add-person` | `…/crew/add` | Home: Add worker record, or Invite your partner (organizer; goes to `…/team/invite`). | — |
| `new-worker` | `…/crew/new` | Name, phone, email, documents language, skills; add to a project with pay basis, rate (blank, `rates.set` only), start date. Partner: no rate fields; worker shows Waiting for rate. | $0 rate; no effective date; no Free limit. |
| `edit-worker` | `…/crew/:workerId/edit` | Contact, language, skills; Retire from My crew (`people.remove`). Rate changes go through the rate change page. | Rate edit with no effective date; moving their one assignment. |
| `assign-crew` | `…/projects/:id/crew` | Add or end assignments on this project; each addition asks for pay (`rates.set`) or leaves the worker waiting. | Unticking removes the worker from other projects. |
| (new) rate change | `…/crew/:workerId/pay/:assignmentId` | Same as `ChangePay` + `RateReview`: effective date, all-or-nothing backdated preview with reason. Set rate for a waiting worker uses the same page with the first-rate route. | Rate edit without effective date. |

### P3: work

| ID | Path | Build | Don't copy |
|---|---|---|---|
| (new) Home day sheet | `…/projects/:id/day/:date` | Web version of Today for the whole crew: one row per assignment; daily rows have Full, ½, Other, No work buttons; hourly rows have an h:mm field and No work; rows already recorded show the value and a Correct link; Mark rest as no work (n); Use previous workday; previous and next day. Each row saves on its own (operation id per row); per-row result (saved, stale → review, invalid). Blank means Unrecorded. | Blank = "did not work"; one batch that succeeds or fails as a whole. |
| `record-work` | `…/work/new` | Single entry: project, worker, date, then the same input modes as iPhone (Full, ½, ¼, ¾, fraction, hours for daily workers with a day length; h:mm or start/end/break for hourly; No work). | Typed 0–1 fraction only; decimal hours with `step 0.01`. |
| `work-review` | `…/work/new/review` | Worker, date, input, rate and amount (money roles). | — |
| `work-saved` | `…/work/saved` | "Recorded." | "Draft saved on this device" (no web offline drafts for work). |
| `history` | `…/work` | Filters: project, worker, date range, Recorded / Unrecorded / Corrected; separate columns for daily input and hours; Export (server CSV, P5). | Status filter for Home (Pending/Approved/Returned are Business). |
| `entry` | `…/work/:assignmentId/:date` | Entry with every revision (who, when, reason); Correct (reason required); Clear (VOID, reason). | Corrections as a new superseding row; offline edits. |
| `sync` | `…/sync` | Connection status. "The web app needs a connection to save. Nothing is stored in this browser." | Offline drafts for work in the browser. |

The web has no offline work queue in Release 1. Saving needs a connection; a failed save keeps the form filled with "Not saved. Try again."

### P4: payments

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `payments` | `…/payments` | Owed and paid in advance (separate), per-worker balances with Record payment; payment history with receipt numbers, status, filters; Pay what's owed; Questions list (P6). | Netted "left to pay"; no reversals. |
| `record-payment` | `…/payments/new` | Same form as iPhone: blank amount, Full balance, all five methods, check number, reference, date, note, evidence upload. | Bank transfer/Cash/Other only; one worker; "paid against" one job. |
| (new) split | `…/payments/split` | Same as iPhone `SplitPayment`: allocation lines per worker × project, Fill from balances, Left to allocate. | Separate payments per worker. |
| `payment-review` | `…/payments/new/review` | Before/after per worker; method-specific confirmation checkbox; duplicate warning (same date, amount, method and reference). | Duplicate rule without method and reference. |
| `payment-saved` | `…/payments/:id/saved` | Recorded, new balance, Add proof, View payment (receipt and share arrive in P6). | — |
| (new) payment detail | `…/payments/:id` | Allocations, check status (Mark cleared, Check returned), Fix this payment (correct, reverse, money returned), evidence, receipt versions, share history. | — |
| (new) pay what's owed | `…/payments/pay-owed` | Same as iPhone `PayOwed` + `BulkReview`, one transaction. | Cash at full balance. |

The web keeps no payment drafts (nothing is stored in the browser, §12.2 P3). Offline, every record and fix button is disabled with "Needs a connection"; the form stays filled while the page is open.

### P5: records

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `reports` | `…/reports` | Tabs: **Summary** (all six balance components, by project, by worker, by week; Owed and Paid in advance apart), **Ledger** (filters, opening, running and closing balance), **Year-end totals** (tax notes). Server-side CSV exports with date range, project and worker. | Summary CSV that turns credits into text; no date range. |
| (new) reimbursement and adjustment | dialogs on `…/crew/:workerId` | Same fields and review steps as iPhone `Reimburse` / `ExpenseReview` and `AdjustBalance` / `AdjustmentReview`. | — |
| (new) balance breakdown | on `…/crew/:workerId` | All six lines per project and in total, and the activity list. | — |

### P6: receipts and sharing

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `receipt` | `…/payments/:id/receipt` | From the stored snapshot (`GET /v1/receipts/:id`): R-000123, views (worker, full for recipient), EN/ES, status line, signature line; Print / Save PDF. | Live render; `PAY-<timestamp>` numbers; "something looks wrong" to a signed-in page. |
| `share-receipt` | `…/payments/:id/share` | Create a link (worker view, language) → copy link and message text (the web can't open Messages); revoke existing links. | No revoke. |
| `statement` | `…/reports/statements/:workerId` | Statement builder: project (or all), period, language; generates the snapshot (`S-000041`); Print / Save PDF; earlier statements. | All-records only; English only. |
| (new) questions | section on `…/payments` | Worker questions from the public page, with Mark resolved (`money.record`). | — |
| `public-receipt` | `/r/:token` (served by the API at `/api/r/:token`, §10.6 `WorkerLinkPage`) | The web image is the visual target for the API page: worker view, EN/ES switch, I received this payment, I have a question (no sign-in). | Issue link to a signed-in route. |

### P7: settings, plan, data, website

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `settings` | `…/settings/workspace` | Workspace name and receipt name (`payer_display_name`) (`settings.edit`), currency (shown, locked after the first money record), default time zone for new projects. Partner sees them read-only. | Date format option; USD-only dropdown. |
| `profile` | `/app/settings/account` | Your name, sign-in methods with Add email sign-in and Add Sign in with Apple, Sign out, Delete account. Restyles the P1c Account page. | "Email verification link". |
| `accessibility` | `/app/settings/appearance` | Theme: System, Light, Dark (saved per browser). Reduced motion follows the device. | "Larger text" toggle (browser zoom does this; the layout must reflow at 200% zoom and 320 px). |
| `billing` | `…/settings/plan` | Current plan: Free, Project Pass on <project>, or Pro, with dates from the server; usage vs Free limits; "Plans are bought in the CrewTally iPhone app." Organizer only sees Compare and Restore links; partner sees "Managed by <organizer>". | Leaving out Free and Project Pass; Business price on Home. |
| `plan-options` | `…/settings/plan/compare` | Free, Project Pass, Pro side by side with the same US list prices and copy as the website pricing page (§13.2), plus "Bought in the CrewTally iPhone app. Apple shows the final price in your currency." | "Unlimited"; buy buttons. |
| `plan-review` | `…/settings/plan/review` | Explains what the chosen plan covers and how to buy it in the iPhone app. | — |
| `purchase-handoff` | `…/settings/plan/iphone` | "Open CrewTally on your iPhone → More → Plan." | Any web checkout or price link. |
| `manage-plan` | `…/settings/plan/manage` | How to manage or cancel in iPhone Settings → your name → Subscriptions. | — |
| `restore` | `…/settings/plan/restore` | How to restore in the iPhone app; it stays with its original workspace. | — |
| `data` | `…/settings/data` | Exports (server-side), full export (ZIP), **Delete account** (§9, re-auth with Apple or email code). | "Reset sample records"; request-only deletion. |
| `expired` | — | Not built for Home (never locked). Built in B4 for Business only (§14.10). | Home read-only state. |

Website routes (`website`, `for-home`, `for-business`, `how-it-works`, `pricing`, `download`, `help`, `help-start`, `help-work`, `help-money`, `help-billing`, `contact`, `privacy`, `terms`) are in §13. `mobile-preview` is not built.

### B1 and B2: Business on the web

| ID | Path | Phase | Build |
|---|---|---|---|
| `business-setup` | `/app/start/business` | B1 | Business name (after sign-in), time zone. |
| `roles` | `…/team/roles` | B1 | Role table from §5.3 in plain words, Business roles only. |
| `approvals` | `…/approvals` | B2 | Work to approve: Pending submissions (with "Waiting for rate" items), correction requests, and payment questions for money roles. |
| `approval` | `…/approvals/:id` | B2 | One submission: input, worker, job, date, submitter, earnings if approved (money roles only), Approve once, Return. |
| `return-work` | `…/approvals/:id/return` | B2 | Reason required (server-checked). |
| `my-receipt` | `…/my/receipts/:id` | B2 | Worker's own receipt (own lines only), EN/ES, I received this payment, I have a question. |
| `my-money` | `…/my/money` | B2 | Worker's own approved earnings, payments, balance, receipts. Pending shown apart. |
| `report-issue` | `…/my/question` | B2 | Worker's question about a payment (a payment question) or approved hours (a correction request), linked to the record; goes to Work to approve. |
| `team-access` | `…/my/access` | B2 | Workspace, role, jobs (a list), billing owner. |
| `notifications` | `…/notifications` | B2 | In-app list (D14): approvals, returns, corrections, questions. No email, no push. |
| `timesheet` | `…/timesheet` | B2 | One job, one day, every assigned worker: hours (h:mm or decimal hours that make whole minutes) and an explicit **No work** per row; blank = not recorded. Owner/admin rows approve on save; lead rows submit Pending. |
| `timesheet-review` | `…/timesheet/review` | B2 | Confirm rows; per-row results. |

Never built: `demo`, `design`, the "Design preview" strip, "Reset sample records", role switchers, browser-stored sample data, the private preview link (invariant 18). Every link in the design that points into the demo gets a real destination or is removed.

## 12.3 Same API, same rules

- The web calls the same `/v1` routes with the same bodies, actions and errors as the iPhone.
- The role matrix test runs against routes, so it covers the web automatically. A web-only check never counts as enforcement.
- Exports are built on the server (`POST /v1/exports`) and downloaded by the browser. No CSV is built in the browser.
- Receipts and statements are always rendered from stored snapshots.
- Error copy is shared from `shared/` so both surfaces say the same thing.

## 12.4 Web sessions and CSRF

Built in P1c.

| Item | Rule |
|---|---|
| Session cookie | `__Host-ct_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`, `Max-Age` 30 days. The value is a 32-byte random session token; the database stores only its SHA-256, as for app sessions. The row has `client = 'WEB'`. |
| CSRF token | A separate 32-byte random token in the `__Host-ct_csrf` cookie (`Secure; SameSite=Lax; Path=/`, **not** HttpOnly, so the web app can read it); its SHA-256 is stored in `sessions.csrf_hash`. |
| Check | Every cookie-authenticated POST, PUT, PATCH and DELETE must send `X-CSRF-Token` equal to the `__Host-ct_csrf` cookie, whose SHA-256 must equal `csrf_hash` (constant-time compares), and an `Origin` in the allowed list (the dev domain in development; `WEB_ORIGINS`, set to `https://crewtallyapp.com` in P8). Missing or wrong → 403 `CSRF_FAILED`, nothing written. |
| App sessions | Bearer tokens (`client = 'APP'`); no CSRF. If a request carries both, the Bearer token is used and the cookie ignored. A Bearer token for a WEB session, or a cookie for an APP session → 401 `SESSION_EXPIRED`. |
| Lifetime | Same 30-day sliding rules as Phase 1 sessions. Accepted by default (C4, §19); the owner can say otherwise before P1c. |
| Sign-out | `POST /v1/auth/signout` revokes the row and clears both cookies. |
| Workspace | `X-Workspace-Id` header from the URL's workspace id (`/app/w/:workspaceId/…`), exactly like the iPhone. |
| Headers | `Content-Security-Policy` with no third-party script sources except Apple's sign-in script on the sign-in page; `Referrer-Policy: no-referrer` on public pages; `X-Frame-Options: DENY`. No CORS headers: the web app and API are same-origin. |

## 12.5 No purchases on the web

- The web shows plans and what they cover, and sends the organizer to the iPhone app to buy, restore or manage.
- No checkout, no payment links, no prices that differ from the App Store's.
- The iPhone app never points people to the web to pay.

## 12.6 Home partner on the web

Same role, same refusals (§8). Pages hidden from the partner: invite and remove members, plan actions, workspace settings, rate fields (read-only), retire and end assignment. The server refuses them anyway.

---

# 13 Website

Built in P7, in the web artifact, as public pages at the root of crewtallyapp.com (domain set up in P8). Until P7 the API serves simple `/api/privacy`, `/api/support` and `/api/delete-account` pages; from P7 those are website pages (`/privacy`, `/support`, `/delete-account`, plus `/terms`) and the API paths redirect (301) to them, so there's one copy of each text. In P8, crewtallyapp.com forwards only `/r/*`, `/join/*` and `/go/*` to the API. No sign-in, no cookies except the app's own session cookie on `/api`, no analytics, no third-party scripts, no tracking pixels. Images: `docs/screens-2.0/web/desktop/<id>.png` and `web/mobile/<id>.png`.

## 13.1 Pages

| ID | Path | Build | Don't copy |
|---|---|---|---|
| `website` | `/` | Hero, Home audience card (Business card says "Coming later" until Release 1.1), three-step explainer, "CrewTally never moves money. It keeps a record of payments you make yourself." Header: Sign in (`/app/signin`), Get started (`/app/start`). Main CTAs: Get the iPhone app (`/download`), Use it on the web (`/app/signin`). | "Explore the web app" demo CTA; design-preview strip; All screens link. |
| `for-home` | `/for-home` | For homeowners: Today, payments, receipts in English and Spanish, partner on every plan. CTAs: Get started, Use on iPhone. | "Try the experience" demo link; partner shown as Pro-only. |
| `for-business` | `/for-business` | Release 1: a short "Coming later" page describing Business, no setup button, no price. Release 1.1 (B4): the full page with "Workers record their own hours and the owner approves them" and Set up a business. | Demo links; "workers never need an account" contradictions (workers in Business can sign in; Home workers never need one). |
| `how-it-works` | `/how-it-works` | Release 1: Home steps (create project, add crew, record work, record payment, share receipt). Business steps added in B4. | Demo CTA. |
| `pricing` | `/pricing` | §13.2. | — |
| `download` | `/download` | "Use CrewTally on iPhone": the App Store link once the app is live (before that, "Coming to the App Store"); "Already use CrewTally? Sign in on the web." | Placeholder store copy; link to the mobile preview. |
| `mobile-preview` | — | **Not built.** It only launches the demo. | — |
| `help` | `/help` | Help centre: topic search over the guides (in the page, no external service), four guide cards, Contact support. | — |
| `help-start` | `/help/getting-started` | Create a Home workspace, add a project and workers, sign in on iPhone and web with the same account (explain Apple vs email, Add email sign-in and Add Sign in with Apple, §6.4). | "Same account" with no linking explanation. |
| `help-work` | `/help/recording-work` | Recording full, half, part days and hours; No work vs not recorded; corrections need a reason. Business approvals section added in B4. | Approvals described for Home. |
| `help-money` | `/help/payments-and-receipts` | Record only money paid outside CrewTally; balance formula with all components; split payments; checks; fixing a payment; receipts and "Not bank verified"; worker questions. | "Left to pay = approved earnings minus payments". |
| `help-billing` | `/help/plans-and-access` | Free, Project Pass, Pro; bought in the iPhone app; partner on every plan and never pays; records never locked. Business billing added in B4. | Partner as Pro-only. |
| `contact` | `/support` (`/contact` redirects there) | Support email address (mailto), expected reply time, what to include (support ID from the app), links to help and `/delete-account`. No form: email is used only for sign-in codes and invitations. | A form that sends nothing. |
| `privacy` | `/privacy` | Website page from P7 (`/api/privacy` redirects here). Real policy text (§13.3). | "Not a published policy" outline. |
| `terms` | `/terms` | Website page from P7. Real terms text (§13.3). | "Not a legal agreement" outline. |
| (new) account deletion | `/delete-account` | Website page from P7 (§9.4); `/api/delete-account` redirects here. | — |

Footer on every page: CrewTally, "CrewTally never moves money.", Help, Pricing, Privacy, Terms, Support, Delete account.

Public paths that must keep working alongside the website (P8 checks each with `curl`): `/r/*`, `/join/*`, `/go/*` (forwarded to the API), `/privacy`, `/terms`, `/support`, `/delete-account`, `/app/*` (web artifact), and the `/api/privacy`, `/api/support`, `/api/delete-account` redirects.

## 13.2 Pricing copy rules

| Rule | Detail |
|---|---|
| Plans shown in Release 1 | **Free** ($0: 1 active project and 3 current workers; everything else included, receipts, statements, Spanish documents, signatures, exports, a partner), **Project Pass** ($24.99 once per project: one project, as many workers as it needs, stays with the project through archive and reopen), **Pro** ($7.99/month or $49.99/year: as many projects and workers as you need). |
| Business | Not shown in Release 1. In Release 1.1 (B4), shown with the confirmed price; until the price is confirmed, not shown at all. |
| Never | "Unlimited"; exports, statements or partner access listed as Pro-only; "payroll"; any claim that CrewTally sends or verifies payments. |
| Partner | "Invite one partner on any plan. Partners never pay." |
| Where to buy | "Plans are bought in the CrewTally iPhone app. Apple shows the final price in your currency." |
| Workers | "Workers never pay and never need an account." (Release 1.1 adds: "Business workers can sign in to record their own hours; the business pays.") |
| Records | "Your records are never locked. If Pro ends, everything stays and the people you already pay keep working." |
| Prices | US list prices, matching App Store Connect. If App Store prices change, this page changes in the same release. |

## 13.3 Legal pages need the owner's real details

The design's privacy and terms pages are outlines. With P7, the owner provides these inputs; the Agent writes them into the website's `/privacy`, `/terms`, `/support` and `/delete-account` pages and never invents them:

| Input | Used in |
|---|---|
| Legal entity name and the state it's registered in | Privacy, Terms |
| Mailing address | Privacy, Terms |
| Support email address and privacy contact email | Privacy, Terms, Support, Contact, deletion page |
| Effective date | Privacy, Terms |
| Governing law and venue | Terms |
| Data retention: logs 30 days, backups 30 days, records until deleted (1.4 product choices; owner confirms) | Privacy, deletion page |
| Service providers that handle data: hosting (Replit), Apple (sign-in, purchases), RevenueCat (purchases), the email provider (Resend or Postmark) | Privacy |
| Worker data statement (third-party names and contacts; how organizers delete them) | Privacy |
| Children: not for children (wording owner-approved) | Privacy |
| Subscription terms: auto-renew, cancel in Apple settings, refunds through Apple; standard Apple EULA or a custom one | Terms |
| "CrewTally keeps records of payments you make yourself. It doesn't move, hold or verify money." | Terms |
| Not tax or legal advice | Terms |

If any input is missing at the P8 gate, the gate fails. No placeholders ship.

---

# 14 Business workspace (Release 1.1)

Built in B1–B4, after Release 1. Everything stays behind `BUSINESS_ENABLED=false` until B4 and the owner's go-ahead (invariant 13). The foundation (memberships with all roles, `role_can`, `require_member`, the role matrix) is already built in P1b.

Business uses the same money engine as Home: the same `fn_earned`, ledger, payments with allocations, reversals, corrections, receipts, statements, share links and exports. What's new is who can do what, approvals, jobs with clients, crew leads, and the Business subscription.

## 14.1 How Business works

1. **Setup.** The owner signs in, creates a Business workspace (name, time zone), creates the first client job and the first worker record, and can explore the sample. That's all an unpaid Business can do (§14.10).
2. **Team.** The owner invites admins (with or without money access), crew leads (for one or more jobs) and workers (bound to a worker record). Admins invite leads and workers.
3. **Jobs and crew.** Owner and admins create jobs (name, client, address, budget), add workers to jobs with an hourly agreement, and set or change each job's crew lead.
4. **Recording.** Leads record hours for their jobs' crew. Workers with the app record their own hours. Owner and admin entries are approved on save.
5. **Approval.** Lead and worker submissions are Pending until the owner or an admin approves or returns them. Approval adds earnings exactly once.
6. **Corrections.** A correction keeps the original's earnings until it's approved; on approval it replaces them in one step.
7. **Payments.** Owner and admins with money access record outside payments with explicit allocations per worker × job, share receipts in English or Spanish, and export reports.
8. **What leads and workers see.** Leads never see rates, earnings or balances. Workers see only their own hours, approved earnings, payments and receipts.
9. **Billing.** One subscription per Business workspace, bought by the owner on iPhone, covers everyone invited. Nobody else pays.
10. **Expiry.** After a confirmed expiry: read and export only, but workers can still confirm receipts and ask payment questions.

## 14.2 Screens by phase (iPhone)

Images: `docs/screens-2.0/mobile/<ID>.png`. Web routes in §12.2.

| Phase | Screens | Build notes | Don't copy |
|---|---|---|---|
| B1 | `BWelcome`, `BSetup`, `BFirstJob`, `BFirstCrew` | Setup after sign-in; job name, client, address (optional), time zone, work days; first worker with an **hourly** agreement and effective date. | Choosing Business before sign-in; rate set on the worker instead of the assignment; no effective date. |
| B1 | `BOwnerToday`, `BAdminToday` | Owner/admin Today: approvals waiting, needs-a-rate items, today's hours by job; money cards only with `money.view`. Admin without money: no amounts at all. | — |
| B1 | `BJobs`, `BNewJob`, `BJob`, `BJobCosts`, `BAssignCrew` | Jobs list (leads see their jobs only); new job with client, address, budget (money roles), time zone, work days; job overview with its crew lead (**Change lead**, including No lead), crew and hours; job costs by allocation (money roles); assign crew adds an assignment without removing other jobs. | One job per lead (a lead can lead several jobs); one job per worker; job costs from the worker's current job; balances across all jobs shown under one job. |
| B1 | `BTeam`, `BAddPerson`, `BAddWorker`, `BWorkerRecord`, `BInvite`, `BInviteReview`, `BInviteReady`, `BMember`, `BRoles`, `BRemoveMember`, `BAccessDenied` | Team list; add worker record (admin without money: no rate fields, worker waits for a rate); invite with role rules from §5.3 (only the owner sees Admin and the money access switch); invitation ready shows link and code once, with Revoke and Resend; member page with **Change role**, **Money access** (owner only), jobs led, Remove access. | Admins inviting admins; a $0 rate; invitation not bound to a worker record; no revoke or role change. |
| B2 | `BOwnerRecord`, `BWorkReview`, `BWorkSaved` | Owner/admin record hours for a job's crew (h:mm, explicit No work); approved on save with an audit event. | Single date only (allow choosing the date); 0 hours meaning no work. |
| B2 | `BApprovals`, `BApproval`, `BReturnWork`, `BApprovalDone`, `BCorrectionReview` | Queue (Pending submissions, correction requests, needs-a-rate); approve once; return with a reason; review a correction request and enter the corrected value (approved on save). Approve and correct need a connection. | Rate taken at submission; correcting offline; 168-hour corrections (24 h per day entry). |
| B2 | `BHistory` | Work history with job, worker, date and status filters. | Week-range entries ("21–25 Sep, 40 h"); one entry per day per job. |
| B2 | `BLeadToday`, `BLeadRecord`, `BLeadSubmissions`, `BLeadEntry`, `BLeadCrew`, `BCrewMember` | Lead app: jobs they lead (Jobs tab reuses `BJobs`, filtered), record hours for that crew (Pending), see statuses and return reasons, resubmit a returned entry as a new version with a reason. Crew list: names, trade, job, hours only. | Overwriting a returned entry in place; showing contacts, private notes, ratings, rates or balances. |
| B2 | `BWorkerToday`, `BWorkerHours`, `BWorkerReview`, `BWorkerHistory`, `BWorkerEntry`, `BWorkerCorrection`, `BWorkerMoney`, `BWorkerReceipt`, `BReceiptProblem` | Worker app: record own hours (today or a past date inside the assignment, never a future date), history and statuses, ask for a correction (text), own approved earnings and payments (pending shown apart), own receipts with **I received this payment** and **I have a question**. | Today-only entry; questions with no destination. |
| B3 | `BBalances`, `BWorkerBalance`, `BPayment`, `BPaymentReview`, `BPaymentSaved`, `BReceipt`, `BShareReceipt`, `BReports`, `BDuplicatePayment` | Per-worker balances (rollup of their assignments) with per-job lines; payment with explicit allocation lines per job; all Home payment features (§14.8); receipts with job lines, EN/ES; reports by job, worker and date range. | Implicit job; missing Zelle, check number, split, reversals, evidence, Spanish. |
| B4 | `BPlan`, `BBuyReview`, `BPlanActive`, `BBilling`, `BManageSubscription`, `BBillingTerms`, `BRestore`, `BPurchaseFailed`, `BPurchaseLinked`, `BBillingProblem`, `BExpired` | §14.9–§14.10. Prices from StoreKit. Active only after the server confirms. | Hard-coded prices; client-side activation; blocking worker acknowledgments on expiry. |
| B4 | `BMore`, `BTeamAccess`, `BSync`, `BOffline`, `BReadability` | More: reminders, account, deletion, help; team access for members; sync with rejected items listed (removed, expired, duplicate); offline: "Approvals and payments need a connection." `BReadability`: not built (Dynamic Type, as Home). | Text size setting; offline payments. |

## 14.3 Roles in Business

§5 is the reference. In short: owner (everything, billing), admin with money access (everything but billing, settings and deleting the workspace; can't touch admins), admin without money access (same minus money, rates and exports), lead (own jobs, records hours, no money), worker (own records, own money only through own-scope routes).

## 14.4 Jobs, clients and leads

A Business job is a `projects` row. B1 (migration 0008) adds, both null for Home (a trigger enforces it):

| Column | Type and rule |
|---|---|
| `client_name` | text, 1–80 characters; **required** for a Business job, null for Home |
| `budget_minor` | bigint 1–1,000,000,000 or null; display only, never in the ledger; shown and set only with `money.view` |

The job's location is the existing `projects.address` (no second column). Business jobs get `project_use = 'BUSINESS'` from the same trigger, and `pass_id` stays null (Project Pass is Home only). Projects keep `timezone`, `work_days`, `status` (archive and reopen). Workers gain `trade` (text, 1–40 characters, or null). Workers still have no rate column.

`job_leads` (0008): one row per job that has a crew lead.

| Column | Rule |
|---|---|
| `id` | uuid primary key |
| `workspace_id` | uuid not null → `workspaces(id) on delete cascade` |
| `project_id` | uuid not null; foreign key `(workspace_id, project_id)` → `projects`; **unique** (a job has at most one lead) |
| `membership_id` | uuid not null → `memberships(id)`; trigger: same workspace, kind `BUSINESS`, role `LEAD`, status `ACTIVE` |
| `assigned_by`, `assigned_at` | uuid not null → `users(id)`; timestamptz default now() |

Rules:
- A lead can lead several jobs; a job has at most one lead.
- Owner and admins set, change or clear a job's lead with `set_job_lead` (`PUT /v1/projects/:id/lead`, action `projects.manage`).
- A lead whose membership is removed or changed to another role simply stops counting: every scoping query joins `memberships` on `role = 'LEAD' and status = 'ACTIVE'`.
- A lead's invitation can name jobs (`invitation_jobs`, added with `add_invitation_jobs` in the same transaction as `create_invitation`); `apply_invitation_jobs` sets them after acceptance, in the same transaction, skipping jobs that already have a lead.
- Assigning a worker to a job never ends their other assignments.
- `business_settings` (0008) holds the Business payer display name ("Paid by" on receipts) and `setup_completed_at`.

## 14.5 Approvals

Business work goes through **submissions** (`work_submissions`, 0009), a sidecar to the ledger. A submission is a proposed entry for one assignment (worker × job) and one date. It never touches `work_entries`, `work_revisions` or the ledger until it's approved. On approval the server calls the unchanged `record_work`, so the rate, rounding, revisions and ledger rules are exactly Home's. In a Business workspace, `work_entries` hold approved work only.

### States

| State | Means | Counts in balances? |
|---|---|---|
| `PENDING` | Submitted by a lead or worker; waiting for owner or admin. | No |
| `APPROVED` | Approved (or approved on save for owner/admin entries). Its revision is in the ledger. | Yes, through the ledger |
| `RETURNED` | Sent back with a reason. A fix is a new submission. | No |
| `SUPERSEDED` | Replaced by a newer submission for the same assignment and date while Pending or Returned. | No |

### Transitions (functions in 0009, B2)

| From | To | By | Function | Rules |
|---|---|---|---|---|
| — | `PENDING` | Lead (own jobs' crew), worker (own record) | `submit_work` | Inside the assignment dates, not after the job's today; job active; Business screens send `HOUR_MINUTES` (1–1,440), `NO_WORK` or (corrections) `VOID`; note ≤ 500; operation id. A Pending submission for the same assignment and date by the same person becomes `SUPERSEDED`. No agreement yet is allowed: the work waits for a rate. |
| — | `APPROVED` | Owner, admin | `submit_work` → approval step | **Approved on save** (D10): `AUTO_APPROVED` approval event and an audit row. Same on iPhone and web. With no rate it stays `PENDING` with `waiting_for_rate`. |
| `PENDING` | `APPROVED` | Owner, admin | `approve_work_submission` | Row lock; must still be `PENDING`, else 409 `ALREADY_REVIEWED` (double approval rejected). The entry's version must equal the submission's base version, else 409 `ENTRY_CHANGED`. No agreement in force on the work date → 409 `RATE_NEEDED` (stays Pending). Archived job → 409 `JOB_ARCHIVED`. Calls `record_work`: rate from the agreement in force **on the work date**; one rounding step; `EARNING` or `EARNING_CORRECTION` (the difference). |
| `PENDING` | `RETURNED` | Owner, admin | `return_work_submission` | Reason required, 1–500 characters, checked in the function. No ledger change. |
| `PENDING`, `RETURNED` | `SUPERSEDED` | System | inside `submit_work` | When a newer submission arrives for the same assignment and date. |

Rules that apply to all transitions:
- **Ledger `EARNING` rows are written only at approval** (or approved-on-save), never at submission.
- **Approve, return and correction review need a connection.** Clients disable them offline and never queue them. Lead and worker submissions may be queued offline like Home work entries and are sent with their operation ids.
- One entry per worker per job per day. A worker can work two jobs on one day; more than 16 hours or more than one day across jobs needs a confirmation (409 `CROSS_JOB_CONFIRM`; the message never names the other job to a lead or worker).
- Hourly only in Business screens (§14.7).
- An approved entry is changed only by an approved correction (with a reason). It's never edited in place.
- Every decision writes an `approval_events` row (insert-only).
- The Home work routes (`PUT /v1/work/…`, void, mark rest) answer 409 `BUSINESS_USES_SUBMISSIONS` in a Business workspace.

## 14.6 Corrections and correction requests

| Who | How | Result |
|---|---|---|
| Lead or worker, on a **returned** submission | Resubmit with the change | New `PENDING` submission; the returned one becomes `SUPERSEDED`. |
| Lead, on an **approved** entry | Submit a correction (reason required) | A `CORRECTION` submission, `PENDING`. The approved earnings stay until it's approved; approval posts only the difference. |
| Worker, on an **approved** entry | Correction request (`request_work_correction`): note 1–500 characters | `correction_requests` row `OPEN`; shows in Work to approve. The approved earnings stay. |
| Owner or admin, on an approved entry or an open request | Enter the corrected value with a reason (`BCorrectionReview`) | A correction submission, approved on save; `EARNING_CORRECTION` for the difference; the request becomes `CORRECTED`. |
| Owner or admin, on a request they don't accept | **Keep as is** with a note (`keep_work_as_is`) | Request `KEPT`; the worker sees the note. |

## 14.7 Hourly only (D12)

- Business screens offer only hours (h:mm, or decimal hours that make whole minutes) and No work.
- The API refuses a `DAY` pay agreement in a `BUSINESS` workspace (422 `BUSINESS_HOURLY_ONLY`).
- The database keeps daily pay; nothing in the engine changes.

## 14.8 Business payments

Built in B3 with no migration. Same functions and routes as Home (`record_payment_with_note`, `reverse_payment`, `correct_payment`, `set_check_cleared`, `record_handover_signature`), same rules (§11), roles with `money.record`.

- **Explicit allocation per worker × job.** Each allocation line points to one assignment. The form lists the worker's assignments with their balances; the person chooses the job (or splits across jobs). Nothing is attached to "the worker's current job". A payment without allocation lines → 400 `ALLOCATIONS_REQUIRED`.
- **Full balance** fills only the lines on screen, and they stay editable.
- Methods: Cash, Check (with number, clearance, returned), Bank transfer, Zelle, Other (description).
- Split payments to a lead for several workers, reversals, corrections, evidence, hand-over signature: all as Home. Business 1.1 has no bulk "Pay what's owed" screen.
- Receipts: the workspace's one `R-000123` sequence, job on each allocation line, "Paid by" from `business_settings`, worker's documents language (D13). Never a `BR-` prefix, never the client's details.
- Job costs (`BJobCosts`, reports) come from allocations and the ledger per assignment, so reassigning a worker never moves past job costs.
- Exports: money exports need `export`; a work-only export (`POST /v1/exports/work`, `workspace.read`, scoped) serves admins without money access, leads and workers, with no money columns.

## 14.9 Business billing

| Item | Rule |
|---|---|
| Price | $29/month or $290/year, **configurable**: set in App Store Connect, shown from StoreKit, never hard-coded. Validate with contractors before creating products (D5). |
| Trial | 14-day free trial through Apple's introductory offer (D5). Confirm the offer setup and eligibility rules before building (§19). |
| Products | `business_monthly`, `business_annual`: two auto-renewing subscriptions in a **subscription group separate from Home Pro** ("CrewTally Business"), so a person can have Home Pro on one workspace and Business on another. Confirm with Apple's documentation before creating them (§19). |
| Who buys | The billing owner only (`plan.manage`, and the session user is `workspaces.owner_id`). Admins, leads and workers never see checkout; they see "Covered by <business>". |
| Where | iPhone only. The web explains and points to the iPhone app (§12.5). |
| RevenueCat | App user id = the **workspace id** (as Home). Restore must keep a purchase with its original workspace. Choose RevenueCat's restore/transfer setting that does that; confirm the current option and default before B4 (§19). |
| Restore finds a purchase on another workspace | `BPurchaseLinked`: "This purchase already covers another business. One purchase covers one business." Name another workspace only if the person is a member of it. Never move it. |
| Server record | RevenueCat webhook → `record_subscription_event` (new in 0010; the Home `record_entitlement_event` and `workspace_entitlements` stay unchanged). Idempotent by event id. `original_transaction_id` is unique in `workspace_subscriptions`, so one subscription can't attach to two workspaces. |
| State | `ACTIVE`, `GRACE`, `BILLING_RETRY`, `EXPIRED`, `REFUNDED`, `REVOKED`, plus `will_renew` and `is_trial`. The app shows what the server says. |
| Home and Business together | Allowed. Buying Business never cancels Home Pro; a note on `BBuyReview` says so when the person has Home Pro. |
| Account deletion | Doesn't cancel the subscription; the deletion screen says so (§9). |

## 14.10 Unpaid and expired Business

`business_access(workspace)` (0010, read-only) returns `HOME` for a Home workspace (never gated), `SETUP_ONLY` (Business with no subscription), `ACTIVE` (`ACTIVE`, `GRACE`, `BILLING_RETRY`; confirm in §19), or `READ_ONLY` (`EXPIRED`, `REFUNDED`, `REVOKED`). `withMember` checks it in the same transaction for every member route, using the gate class each route declares (B4). Refused → 402 `BUSINESS_PLAN_REQUIRED` (setup only) or 402 `BUSINESS_READ_ONLY` (ended).

| Action | Setup only | Active | Read only |
|---|---|---|---|
| Read (scoped), export | Yes | Yes | Yes |
| Business settings, first job, first worker and its rate (while setup is open) | Yes | Yes | No |
| A second job or worker | No | Yes | No |
| Explore the sample | Yes | Yes | Yes |
| Invite | No | Yes | No |
| Remove members, leave, revoke invitations, delete account | Yes | Yes | Yes (reducing access is always allowed) |
| Record or submit work, approve, return, correct | No | Yes | No |
| Payments, reimbursements, adjustments, receipts, share links | No | Yes | No |
| Worker: "I received this payment" and "I have a question" (in-app and by link) | Yes | Yes | **Yes** |
| Buy, restore, refresh the plan (owner) | Yes | Yes | Yes |

Read-only screens: `BExpired` for everyone ("Ask the owner to renew. Your records are safe and you can still view and export them."; workers also: "You can still confirm payments and ask about them."), with **Renew** for the owner. Queued submissions sent after expiry are rejected with 402 and kept in `BSync`.

Home never uses any of this (invariant 16).

## 14.11 Work to approve and notifications

Work to approve (`BApprovals` and web `approvals`, `GET /v1/approvals`) lists:
- Pending submissions, oldest first (owner and all admins), including "Waiting for rate" rows: roles with `rates.set` see **Set rate**; admins without money see "The owner needs to set a rate";
- Open correction requests (owner and all admins);
- Open payment questions from workers, in-app or by link (owner and admins **with money access** only, because they hold the payment details). Resolving needs `money.record`.

`BReceiptProblem` copy: "This goes to the business owner and anyone who records payments. It doesn't confirm the payment."

Notifications (D14): an in-app list (`notifications`, 0009), no email and no push. Created by the B2 functions: work submitted (owner and admins), returned and approved (the submitter), correction requested (owner and admins) and resolved (the requester), payment question (owner and admins with money access), receipt ready (the worker). A notification stores ids only; the API builds the text at read time through the role shaper, so someone who loses money access never sees an amount from an old notice.

## 14.12 Business tables and functions (SQL written in B1, B2 and B4, with tests)

Every new table carries `workspace_id`, uses composite foreign keys on `(workspace_id, id)` so nothing points across workspaces, cascades from `workspaces` so account deletion leaves no rows, is written only by `SECURITY DEFINER` functions hardened like 0003's (each calls `require_member` itself as a second line behind the API), and is added to the app's "never write" list (invariant 2), except `business_settings`, which holds no money and is written through `withMember`. The phase files have the exact columns and checks.

| Migration | Phase | Tables and changes | Functions |
|---|---|---|---|
| 0008 `business_foundation` | B1 | `projects.client_name`, `projects.budget_minor`, `workers.trade`, `job_leads`, `business_settings`, `invitation_jobs`. **Plan limits ignore Business:** the three 0004 plan-limit trigger functions are redefined with one guard at the top (`kind = 'BUSINESS'` → return), keeping every line of their Home logic and the trigger names. | `member_scope`, `lead_project_ids`, `set_job_lead`, `add_invitation_jobs`, `apply_invitation_jobs` |
| 0009 `business_work_states` | B2 | `work_submissions`, `approval_events` (insert-only), `correction_requests`, `member_acknowledgments` (in-app receipt confirmations and questions; the public page keeps `acknowledgments`), `notifications` | `submit_work`, `approve_work_submission`, `return_work_submission`, `request_work_correction`, `keep_work_as_is`, `acknowledge_payment_in_app`, `resolve_payment_question`, `mark_notifications_read`, `preview_submission`; read helpers `business_day_status`, `worker_money` |
| — | B3 | No migration. | — |
| 0010 `business_entitlements` | B4 | `workspace_subscriptions` (plan, billing owner, state, will-renew, trial, unique original transaction id), `subscription_events` | `record_subscription_event` (webhook and `POST /v1/business/billing/refresh` only), `business_access`, `business_billing_status` |

## 14.13 Business tests (minimum, per phase)

| Phase | Test |
|---|---|
| B1 | Role matrix with all seven sets on every Business route; lead and worker scope 404s (§5.4); `money_key_scanner` finds no money keys for admins without money, leads or workers; admin can't invite an admin or change money access; admin without money adds a worker without rate fields and posting a rate → 403; a lead invited for two jobs leads both after accepting by link and by code; removing a lead takes their jobs out of scope at once; Business workspaces aren't limited by Home Free limits while Home Free still is. |
| B2 | Submit → no ledger rows; approve → exactly one `EARNING`; approve twice concurrently (two connections) → one succeeds, one 409 `ALREADY_REVIEWED`, one ledger row; return without reason → refused; a pending correction leaves the approved balance unchanged; approving it posts only the difference; owner entry approved on save with an `AUTO_APPROVED` event on iPhone and web; approval with no agreement → 409 `RATE_NEEDED` and the submission stays Pending; rate from the agreement on the work date even when the agreement changed between submission and approval; `DAY` agreement in Business → 422; worker sees only own records; lead never receives a rate, earned amount or balance field. |
| B3 | Payment with lines on two jobs → each job's cost moves by its line; reassign the worker → past job costs unchanged; returned check reverses both lines; Spanish receipt; non-money admin → 403 on payment routes and no money fields anywhere; work-only export has no money columns. |
| B4 | Setup only: first job and first worker allowed, second job → 402, invite → 402; webhook sequence ACTIVE → EXPIRED → read and export work, submission → 402, worker "I received this payment" and a payment question still work; restore on another workspace never moves the purchase; same event id twice → one row; one original transaction can't attach to two workspaces; a Home workspace of the same person keeps working throughout. |

---

# 15 Data model and migrations

Migrations are additive (invariant 4). `db/schema.sql` is 0001 and never changes. A provided migration moves from `db/provided/migrations/` into `db/migrations/` in the phase that names it, never earlier, with its tests from `db/provided/tests/` into `db/tests/`.

## 15.1 Migration list

| # | File | Phase | Status | Contents |
|---|---|---|---|---|
| 0001 | `db/schema.sql` | P0 | Applied | Money engine, ledger, receipts, statements, share links, evidence, reminders, audit, idempotency. |
| 0002 | `0002_auth.sql` | P1 | Applied | Users, sessions, Apple credentials. |
| 0003 | `0003_identity_and_memberships.sql` | P1b | Provided, tested | §15.2. |
| 0004 | `0004_plans_and_project_use.sql` | P2 | Provided (was 0003 in 1.4; content unchanged) | Project use, workspace entitlements (Pro), project passes, entitlement events, tax thresholds, growth counters, plan-limit triggers, `record_entitlement_event`, `plan_status`, `year_totals_with_thresholds`. |
| 0005 | `0005_crew.sql` | P2 | Provided (was 0004 in 1.4; content unchanged) | Worker favorites, skills, private note; `worker_ratings` (stars 1–5, would hire, note); `rate_assignment`, `crew_summary`, `worker_last_rate`. |
| 0006 | Receipts and statements | P6 | Written in P6 (was 0005 in 1.4) | As 1.4 P6, plus nothing Business-specific. |
| 0007 | Deletion jobs and alerts | P7 | Written in P7 (was 0006 in 1.4) | Deletion job queue for §9.2; ops alerts. |
| 0008 | `0008_business_foundation.sql` | B1 | Written in B1 (§14.12) | Job columns, worker trade, `job_leads`, `business_settings`, `invitation_jobs`, scope and lead functions, plan-limit triggers that ignore Business. |
| 0009 | `0009_business_work_states.sql` | B2 | Written in B2 (§14.12) | `work_submissions`, `approval_events`, `correction_requests`, `member_acknowledgments`, `notifications` and their functions. |
| — | — | B3 | No migration | Business payments and reports use the 0001 functions and P4–P6 routes. |
| 0010 | `0010_business_entitlements.sql` | B4 | Written in B4 (§14.12) | `workspace_subscriptions`, `subscription_events`, `record_subscription_event`, `business_access`, `business_billing_status`. |

Database test files: `01`–`07` (0001), `11_identity_memberships.sql` (P1b, provided), `08`–`10` (P2, provided), then files the Agent writes: `12_receipts_statements.sql` (P6), `13_deletion_jobs.sql` (P7), `14_business_foundation.sql` (B1), `15_business_work_states.sql` (B2), `16_business_entitlements.sql` (B4).

The baseline 1.4 files `0003_plans_and_project_use.sql` and `0004_crew.sql` are superseded by 0004 and 0005 above. They were never applied; delete any copies (P1b).

## 15.2 What 0003 changes (summary)

| Table | Change |
|---|---|
| `users` | `apple_sub` nullable; `display_name`, `email`, `email_verified_at`; `users_email_needs_verification`, `users_has_identity`; unique email. |
| `sessions` | `client` (`APP`, `WEB`), `csrf_hash`, `sessions_web_has_csrf`. |
| `workspaces` | Unique owner dropped; `kind`; `default_timezone`; kind and billing owner can't change. |
| `memberships` (new) | §4.4. Existing owners become organizers. |
| `invitations` (new) | §7. Includes `invitee_name` (the inviter's label, 1–60 characters or null). `code_hash` holds `HMAC-SHA256(CODE_PEPPER, email:code)`. |
| `email_codes` (new) | §6.2. Purposes `SIGN_IN`, `LINK`, `DELETE`. Rows kept 24 hours, then purged by P7's nightly job. |
| `apple_credentials` | `client_kind` (`APP` or `WEB`, default `APP`); primary key `(user_id, client_kind)`, so the iPhone and web refresh tokens are kept apart (§4.1, §9.2). |
| Money and evidence tables | `recorded_by uuid references users(id)` on `work_revisions`, `payments`, `reversals`, `reimbursements`, `adjustments`, `rate_agreements`, `payment_signatures`, `receipts`, `statements`, `share_links`, `evidence`, `day_reviews`, filled by the `*_recorded_by` triggers from the transaction's actor. A supplied value that differs from the actor → `CT403`. |
| `user_idempotency_keys` (new) | `(user_id, operation_id)` primary key, `request_hash`, `response`. For session routes with no workspace (§4.5). |
| `invitation_code_attempts` (new) | Wrong invitation codes per signed-in person and email, with a 24-hour window (§7.1). |

Functions in 0003: `role_can`, `member_can`, `require_member`, `member_permissions`, `create_workspace`, `can_invite`, `create_invitation` (last parameter `p_invitee_name`, default null), `peek_invitation`, `join_from_invitation` (internal), `accept_invitation`, `accept_invitation_code`, `decline_invitation`, `revoke_invitation`, `can_manage`, `remove_member`, `change_member_role`, `issue_email_code`, `verify_email_code`, `sign_in_with_email_code`, `link_email_code`, `link_apple`, `set_display_name`, `delete_user_account`, `my_workspaces`. Every `SECURITY DEFINER` function has a fixed `search_path` and execute revoked from public.

## 15.3 Tables the app never writes directly

From invariant 2, plus the Business tables when they arrive: `ledger_events`, `payments`, `allocations`, `reversals`, `reversal_lines`, `work_entries`, `work_revisions`, `reimbursements`, `adjustments`, `payment_signatures`, `memberships`, `invitations`, `invitation_code_attempts`, `email_codes`, `workspace_entitlements`, `project_passes`, `entitlement_events`; from P7 `deletion_jobs` rows are written only by the deletion route and cleanup job, and P7's nightly job deletes `email_codes` rows older than 24 hours (the one delete allowed on that table); from B1 `job_leads`, `invitation_jobs`; from B2 `work_submissions`, `approval_events`, `correction_requests`, `member_acknowledgments`, `notifications`; from B4 `workspace_subscriptions`, `subscription_events`. `receipts` and `statements` are insert-only snapshots.

## 15.4 Things that stay as 1.4 decided

- Per-assignment pay agreements with `effective_from`; an assignment's first agreement is inserted directly by a role with `rates.set`, with the assignment or later (when a partner added the worker without a rate); every later change through `apply_rate_change`.
- Project time zone (required) decides dates; `workspaces.default_timezone` is only a default.
- Workspace currency locked at the first money record.
- `idempotency_keys` stays keyed by `(workspace_id, operation_id)` for member routes; operation ids are random UUIDs made on the device or browser, so several people writing in one workspace don't collide. New routes include the actor in the request hash. Session routes use `user_idempotency_keys` (§4.5).
- `audit_events` keeps `actor_id`; money rows now also carry `recorded_by`.
- My crew stars stay (D7); `worker_ratings` unchanged.

---

# 16 API surface

All routes under `/v1` (reachable at `/api/v1/…`). Every `/v1` route is registered as `publicRoute`, `sessionRoute` or `memberRoute`. Every member route is registered with `memberRoute(method, path, action, handler)` and runs inside `withMember`. Session routes need a signed-in user but no workspace. Public routes need neither. Every write carries an `operation_id` (member routes: `idempotency_keys`; session routes: `user_idempotency_keys` through `withUserIdempotency`, §4.5).

Server settings that the API reads (§3): `BUSINESS_ENABLED`, `BUSINESS_DEV_ACCESS` (development only, B1), `PROJECT_PASS_ENABLED` (returned by `GET /v1/plan`, P2), `PUBLIC_BASE_URL` (links, P1b), `CODE_PEPPER` (Secret, code hashes, P1b). Every route with an id has a cross-workspace 404 test; every member route is in the role matrix. From P2 to B1, Home feature routes are registered with `kinds: ['HOME']` (§5.4). The phase file has each route's body and errors; this table is the index.

## 16.1 P1b

| Route | Kind | Action | Notes |
|---|---|---|---|
| `GET /v1/config` | public | — | `{business_enabled}` from `businessEnabled()` (P1c adds the web Apple fields and `dev_signin`). |
| `POST /v1/auth/apple` (Phase 1) | public | — | Finds or creates the user; **no workspace**. Stores the refresh token with `client_kind = 'APP'`. |
| `POST /v1/auth/dev` (Phase 1) | public, dev only | — | Labels `owner-a`, `owner-b`, `member-c`, `member-d` (B1 adds `member-e`, `member-f`). `has_apple` is false for these users. |
| `GET /v1/me` | session | — | §4.7. |
| `PATCH /v1/me` | session | — | `{display_name}` → `set_display_name`. |
| `POST /v1/workspaces` | session | — | `{kind, name, timezone, operation_id}` → `create_workspace` through `withUserIdempotency`; Business 404 while the flag is off. |
| `GET /v1/workspace` | member | `workspace.read` | `member_permissions` + currency and default time zone. |
| `PATCH /v1/workspace` | member | `settings.edit` | Rename (P1b); receipt name `payer_display_name` (P2); default time zone (P7). |
| `GET /v1/members` | member | `workspace.read` | Names per §7.4; emails only for `members.manage`. |
| `DELETE /v1/members/:userId` | member | `workspace.read` | `remove_member` (leaving, or removing with `members.manage` checked inside). |
| `PATCH /v1/members/:userId` | member | `members.manage` | `change_member_role`. |
| `POST /v1/invitations` | member | `members.manage` | `create_invitation` (with `p_invitee_name`). Worker binding needs `money.view` (403 otherwise). Link `${PUBLIC_BASE_URL}/join/<token>`. |
| `GET /v1/invitations` | member | `members.manage` | |
| `DELETE /v1/invitations/:id` | member | `members.manage` | `revoke_invitation`; only your own invitations or ones you could have created (403 otherwise). |
| `POST /v1/invite/peek` | public | — | `peek_invitation`; 20/min per client IP. |
| `POST /v1/invite/accept` | session | — | `accept_invitation` through `withUserIdempotency`; 410 for an unavailable link. |
| `POST /v1/invite/accept-code` | session | — | `accept_invitation_code` through `withUserIdempotency`; 400 `INVITATION_CODE_WRONG`; 10/min per user; 5 wrong tries per person and email in 24 hours. |
| `POST /v1/invite/decline` | public | — | `decline_invitation`. |
| `GET /api/join/:token` | public page | — | Landing page (§7.3). |

## 16.2 P1c

| Route | Kind | Action | Notes |
|---|---|---|---|
| `POST /v1/auth/email/start` | public | — | §6.2. |
| `POST /v1/auth/email/verify` | public | — | `sign_in_with_email_code`; creates an `APP` or `WEB` session. |
| `POST /v1/auth/apple/web` | public | — | Sign in with Apple JS token; Services ID audience only; `WEB` session; refresh token stored with `client_kind = 'WEB'`. 404 until the Services ID Secrets are set. |
| `POST /v1/auth/signout` | session | — | Revokes the session; clears the web cookies. |
| `POST /v1/auth/dev` (web) | public, dev only | — | The same route with `client: 'WEB'`: sets the web cookies. Same guard, labels and code as iPhone. |
| `POST /v1/account/email/start` | session | — | Always sends a `LINK` code; same answer every time. |
| `POST /v1/account/email/verify` | session | — | `link_email_code`; 409 `EMAIL_ALREADY_SET` or `EMAIL_IN_USE` only here. |
| `POST /v1/account/apple` | session | — | `link_apple` (§6.4). |
| `GET /v1/config` | public | — | Adds `apple_web_enabled`, `apple_web_client_id`, `apple_web_redirect_uri`, and `dev_signin` (true only with `APP_ENV=development` and `DEV_SIGNIN_CODE` set). |
| `POST /v1/invitations` | member | `members.manage` | Adds `send_email`. |

## 16.3 P2

| Route | Action | Notes |
|---|---|---|
| `GET /v1/projects?status=` | `workspace.read` | Owed and paid in advance apart; `waiting_for_rate` count. |
| `POST /v1/projects` | `projects.manage` | 402 `PLAN_LIMIT` from 0004 triggers. `pass_id` also needs `plan.manage`. |
| `GET /v1/projects/:id`, `PATCH /v1/projects/:id` | `workspace.read` / `projects.manage` | Name, address, time zone, work days, project use. |
| `POST /v1/projects/:id/archive`, `/reopen` | `projects.manage` | |
| `GET /v1/projects/:id/summary` | `money.view` | P5 adds weekly totals. |
| `GET /v1/projects/:id/unrated` | `crew.private` | |
| `POST /v1/setup` | `projects.manage` (+ `people.add`, + `rates.set` with pay) | First run in one transaction. |
| `GET /v1/workers`, `GET /v1/workers/:id` | `workspace.read` | Money fields only with `money.view`; contact fields only with `people.add`; private fields only with `crew.private`. |
| `POST /v1/workers`, `PATCH /v1/workers/:id`, `POST /v1/workers/:id/reactivate` | `people.add` | No rate here. Private fields also need `crew.private`. |
| `POST /v1/workers/:id/deactivate` | `people.remove` | Retire from My crew. |
| `GET /v1/workers/:id/last-rate` | `money.view` | Hire again prefill. |
| `GET /v1/crew` | `workspace.read` | Private fields with `crew.private`; amounts with `money.view`. |
| `POST /v1/assignments` | `people.add` (+ `rates.set` with an agreement) | A first agreement in the body is inserted directly with the assignment; without `rates.set` → 403, nothing written. |
| `GET /v1/assignments/:id` | `workspace.read` | |
| `PATCH /v1/assignments/:id` | `people.remove` | End date (remove from project). |
| `POST /v1/assignments/:id/first-rate` | `rates.set` | Inserts the first agreement directly for a waiting assignment; 409 `RATE_ALREADY_SET` if one exists. |
| `POST /v1/assignments/:id/agreements/preview`, `POST /v1/assignments/:id/agreements` | `rates.set` | `preview_rate_change`, `apply_rate_change`. Backdated → 409 `CONFIRMATION_REQUIRED` with the preview unless confirmed with a reason. |
| `PUT /v1/assignments/:id/rating` | `crew.private` | `rate_assignment`. |
| `GET /v1/plan` | `workspace.read` | Purchase hints only for `plan.manage`. |

## 16.4 P3

| Route | Action | Notes |
|---|---|---|
| `GET /v1/projects/:id/day/:date` | `workspace.read` | Cards; money fields per role. |
| `GET /v1/projects/:id/day/:date/previous` | `workspace.read` | Use previous workday preview: source date, lines (each prior entry's input and today's amount at the agreement in force today), skipped lines with reasons. |
| `POST /v1/projects/:id/day/:date/copy-previous` | `work.record` | Records the chosen lines in one transaction; 409 `ALREADY_RECORDED` and nothing written if a target was recorded meanwhile. |
| `PUT /v1/work/:assignmentId/:date` | `work.record` | Home only; Business workspaces → 409 `BUSINESS_USES_SUBMISSIONS` (B2). |
| `POST /v1/work/:assignmentId/:date/void` | `work.record` | Reason required. |
| `POST /v1/projects/:id/day/:date/mark-rest` | `work.record` | Home only. |
| `POST /v1/projects/:id/day/:date/review` | `money.record` | "No payments today". |
| `GET /v1/work` | `workspace.read` | Filters project, worker, from, to, state; amounts only with `money.view`. |
| `GET /v1/work/:assignmentId/:date/revisions` | `workspace.read` | Includes who recorded each revision (§7.4 names). |

## 16.5 P4

| Route | Action | Notes |
|---|---|---|
| `GET /v1/balances` | `money.view` | Owed and advances returned separately. |
| `POST /v1/payments/duplicate-check` | `money.record` | Date, amount, method, reference. |
| `POST /v1/payments` | `money.record` | Single or split. |
| `GET /v1/payments`, `GET /v1/payments/:id` | `money.view` | |
| `POST /v1/payments/:id/reversals` | `money.record` | Full or partial with lines. |
| `POST /v1/payments/:id/clearance` | `money.record` | Cleared, or Returned (`CHECK_RETURNED` reversal). |
| `POST /v1/payments/:id/correct` | `money.record` | |
| `GET /v1/payouts/preview` | `money.view` | |
| `POST /v1/payouts` | `money.record` | `record_payout`. |
| `POST /v1/evidence` | `money.record` | Payments (P4); reimbursements (P5). |
| `GET /v1/evidence`, `GET /v1/evidence/:id/content` | `money.view` | Metadata; streamed file. Never a storage URL. |

## 16.6 P5

| Route | Action | Notes |
|---|---|---|
| `POST /v1/reimbursements`, `POST /v1/adjustments` | `money.record` | |
| `GET /v1/workers/:id/balance` | `money.view` | The six-line breakdown per assignment and in total. |
| `GET /v1/workers/:id/activity` | `money.view` | |
| `GET /v1/ledger` | `money.view` | Opening, running and closing balance. |
| `GET /v1/projects/:id/summary` | `money.view` | Adds weekly totals. |
| `GET /v1/reports/overview` | `money.view` | Web reports page. |
| `GET /v1/reports/year-totals` | `money.view` | |
| `POST /v1/exports` | `export` | Server-built CSV for both surfaces; A8 rule; scoped to what the caller can see. |

## 16.7 P6

| Route | Action | Notes |
|---|---|---|
| `POST /v1/receipts`, `GET /v1/receipts/:id` | `money.record` / `money.view` | Snapshot; views WORKER and FULL. |
| `GET /v1/payments/:id/receipts` | `money.view` | Versions. |
| `POST /v1/statements`, `GET /v1/statements/:id` | `money.record` / `money.view` | Snapshot (`S-000041`), migration 0006. |
| `GET /v1/workers/:id/statements` | `money.view` | |
| `POST /v1/links`, `DELETE /v1/links/:id` | `money.record` | |
| `POST /v1/payments/:id/signatures` | `money.record` | `record_handover_signature`. |
| `GET /v1/questions` | `money.view` | Worker questions from the public page, open and resolved. |
| `POST /v1/acknowledgments/:id/resolve` | `money.record` | `resolve_acknowledgment`. |
| `GET /api/r/:token`, `GET /api/r/:token/question`, `POST /api/r/:token/ack` | public | `open_share_link`, `acknowledge_share_link`. |
| `GET /api/go/app` | public | Footer redirect. |

## 16.8 P7

| Route | Action | Notes |
|---|---|---|
| `GET /v1/account/deletion-preview` | session | §9.2. |
| `POST /v1/account/delete/code` | session | Fresh email code for re-authentication (purpose `DELETE`). |
| `POST /v1/account/delete` | session | Re-auth with an Apple token or email code; revokes every Apple token; `delete_user_account`; cleanup jobs. |
| `POST /v1/workspace/export` | `export` | Full ZIP for the workspace in `X-Workspace-Id`. |
| `POST /v1/plan/refresh` | `plan.manage` | |
| `POST /v1/webhooks/revenuecat` | public (shared secret) | `record_entitlement_event`. |
| `GET /v1/plan` | `workspace.read` | Adds `managed_by_name`. |
| `PATCH /v1/workspace` | `settings.edit` | Adds `default_timezone`. |
| `GET /api/privacy`, `/api/support`, `/api/delete-account` | public | From P7: 301 redirects to the website pages (§13). |

Reminders are local to each phone: no reminders route (P7).

## 16.9 B1–B4

| Route | Phase | Action | Notes |
|---|---|---|---|
| `POST /v1/workspaces` (`kind=BUSINESS`) | B1 | session | Allowed when the flag is on; also creates `business_settings`. |
| `GET /v1/business/settings`, `PATCH …`, `POST /v1/business/setup/complete` | B1 | `workspace.read` / `settings.edit` | Business only. |
| P2 project, worker and assignment routes | B1 | as P2 | `kinds` widened to Business with scope and shaper; Business fields; `DAY` agreements → 422 `BUSINESS_HOURLY_ONLY`. |
| `PUT /v1/projects/:id/lead`, `GET /v1/projects/:id/lead-options` | B1 | `projects.manage` | `set_job_lead`. |
| `GET /v1/jobs/:id/costs` | B1 | `money.view` | From the ledger; B3 adds payment detail. |
| `GET /v1/team` | B1 | `members.manage` | Members, worker records, pending invitations. |
| `POST /v1/invitations` (Business roles, `project_ids`, `worker_id`) | B1 | `members.manage` | Plus `add_invitation_jobs`. |
| `POST /v1/invite/accept`, `/accept-code` | B1 | session | Plus `apply_invitation_jobs` in the same transaction. |
| `POST /v1/submissions`, `POST /v1/submissions/batch` | B2 | `work.record` | `submit_work` (scoped; approved on save for owner and admins). Batch: one result per row, each its own transaction. |
| `GET /v1/submissions`, `GET /v1/submissions/:id` | B2 | `workspace.read` | Scoped. |
| `POST /v1/submissions/:id/approve`, `/return` | B2 | `work.approve` | `approve_work_submission`, `return_work_submission`. |
| `GET /v1/approvals` | B2 | `work.approve` | Work to approve; payment questions only with `money.view`. |
| `GET /v1/projects/:id/day/:date/business` | B2 | `workspace.read` | Scoped day status for crew screens and the timesheet. |
| `POST /v1/correction-requests`, `GET /v1/correction-requests` | B2 | `work.record` / `workspace.read` | Worker's own entries. |
| `POST /v1/correction-requests/:id/keep` | B2 | `work.approve` | `keep_work_as_is`. |
| `GET /v1/my/work`, `GET /v1/my/money`, `GET /v1/my/receipts/:id`, `POST /v1/my/receipts/:id/acknowledge` | B2 | `workspace.read` | Bound worker record only (§5.4). Acknowledging is allowed after expiry. |
| `GET /v1/payment-questions`, `POST /v1/payment-questions/:source/:id/resolve` | B2 | `money.view` / `money.record` | Both channels. |
| `GET /v1/notifications`, `POST /v1/notifications/read` | B2 | `workspace.read` | Own only. |
| P4–P6 payment, receipt, statement and export routes | B3 | as P4–P6 | `kinds` widened to Business; allocation lines required. |
| `GET /v1/balances?group=worker`, `GET /v1/workers/:id/balance` (per-job lines) | B3 | `money.view` | |
| `GET /v1/reports/business` | B3 | `money.view` | |
| `POST /v1/exports/work` | B3 | `workspace.read` | Work-only CSV, scoped, no money columns. |
| `GET /v1/business/billing` | B4 | `workspace.read` | Purchase details only for the billing owner. |
| `POST /v1/business/billing/refresh` | B4 | `plan.manage` | `record_subscription_event`. |
| `POST /v1/webhooks/revenuecat` (Business products) | B4 | public | `record_subscription_event`. |
| `GET /v1/config` | B4 | public | `business_enabled` only for app builds at or above `BUSINESS_MIN_BUILD`. |

---

# 17 Design system and accessibility

Adopt the new icon (`docs/App-Icon-1024.png`) and palette (D15). Tokens below come from the CSS variables in the revised design files (`designs/mobile/Home.html` and `Business.html` for the app, `designs/web/styles.css` for the web and website). Both apps read them from `shared/` (`@workspace/crewtally-shared`) so iPhone and web match.

## 17.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#f6f8f5` | `#11201c` | Screen background, on iPhone, web and website (from the design files; same as the invariants). |
| `card` | `#ffffff` | `#1b2b25` | Cards, sheets, table bodies. |
| `ink` (Home) | `#15362f` | `#eef7f1` | Main text. |
| `ink` (Business) | `#173a40` | `#eef7f1` | Main text in Business workspaces. |
| `muted` | `#5a6d64` | `#b0c4b8` | Secondary text. |
| `line` | `#dce5df` | `#3b5147` | Dividers and card borders (decorative only). |
| `field-border` | `#7f938a` | `#6f8a7e` | Input and control borders (added here; `line` is too faint for controls, §17.3). |
| `accent` (Home) | `#086b60` | `#8cddc0` | Primary buttons, links, selected states. |
| `accent` (Business) | `#145d67` | `#8fd3e0` | Same, in Business workspaces. The design files have no Business dark value (in dark mode they keep `#145d67`, which fails contrast at 2.24:1). `#8fd3e0` is adopted: 10.07:1 on the dark `bg` and 8.85:1 on the dark `card` (§17.3), well over 4.5:1. |
| `on-accent` | `#ffffff` | `#11201c` | Text on accent buttons. |
| `soft` (Home) | `#e6f2eb` | `#273f34` | Quiet panels, selected rows. |
| `soft` (Business) | `#e5eff0` | `#273f34` | Same, Business. |
| `deep` | `#103e37` | `#103e37` | Website hero, dark cards (with white text). |
| `copper` | `#a36036` | `#e3a27a` | Website numerals and small accents only. The dark value is proposed here. |
| `focus` | `#ad693c` | `#e3a27a` | Focus ring (3 px, offset 3 px). |
| `warm` | `#faf0df` | `#40311e` | Warning panel background. |
| `warn` | `#80541f` | `#f7d396` | Warning text and icons. |
| `danger` | `#a8372d` | `#ffaba1` | Errors, destructive actions. |
| `nav` | `#ffffff` | `#182923` | Tab bar and web bottom bar. |
| `badge-pending` | text `#79501a` on `#fff0cf` | text `#f7d396` on `#40311e` | Pending, Check not cleared, Waiting for rate. |
| `badge-returned` | text `#99372e` on `#f9e7e1` | text `#ffaba1` on `#40311e` | Returned, Reversed. |
| `badge-neutral` | text `#53665b` on `#edf0ee` | text `#b0c4b8` on `#273f34` | Unrecorded, Superseded, No work. |

The Business accent applies when the current workspace's `kind` is `BUSINESS`; everything else is shared.

No gradients, glass effects, shadows beyond the design's soft card shadow, or decorative animation (invariant 14).

## 17.2 Type, spacing, shape

| Item | iPhone | Web |
|---|---|---|
| Font | System (SF Pro) with Dynamic Type text styles | System stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`; Georgia only for website display headings and numerals |
| Body | 15–17 pt (Body style) | 15 px / 1.55 |
| Headings | Title 1–3 styles (26–34 pt in the images) | h1 32–36 px, h2 23 px, h3 17 px |
| Money | Tabular digits, right-aligned in lists; large amounts 30–34 pt | `font-variant-numeric: tabular-nums`; money cells right-aligned |
| Spacing | 8-point grid | 8 px grid; page padding 40 px desktop, 18 px mobile |
| Corners | Cards 12–13 pt, buttons 9–10 pt, inputs 9 pt | Cards 16 px, buttons 10 px, inputs 9 px |
| Touch targets | At least 44 × 44 pt; work buttons 48 pt high | At least 44 × 44 px; inputs 48 px high |

## 17.3 Contrast

Measured ratios (WCAG 2.1 relative luminance), with `bg` = `#f6f8f5`:

| Pair | Ratio | Needs | Result |
|---|---|---|---|
| Home accent `#086b60` on white | 6.40 | 4.5 | Pass |
| Home accent on `bg` | 5.99 | 4.5 | Pass |
| White on Home accent (button text) | 6.40 | 4.5 | Pass |
| Business accent `#145d67` on white | 7.52 | 4.5 | Pass |
| `ink` `#15362f` on `bg` | 12.29 | 4.5 | Pass |
| `muted` `#5a6d64` on `bg` / on `soft` | 5.17 / 4.80 | 4.5 | Pass |
| `warn` `#80541f` on `warm` | 5.80 | 4.5 | Pass |
| `danger` `#a8372d` on white | 6.46 | 4.5 | Pass |
| Badges (pending, returned, neutral) | 6.26 / 5.97 / 5.35 | 4.5 | Pass |
| `copper` `#a36036` on `bg` | 4.59 | 4.5 | Pass (body text size only at this ratio) |
| Focus `#ad693c` on `bg` | 4.04 | 3 (non-text) | Pass |
| `line` `#dce5df` on white | 1.29 | 3 for control borders | **Fail for controls**: use `field-border` |
| Design input border `#b7c9bd` on white | 1.74 | 3 | **Fail**: use `field-border` `#7f938a` (3.26) |
| Dark: `ink` on `bg` | 15.40 | 4.5 | Pass |
| Dark: `muted` on `card` | 8.06 | 4.5 | Pass |
| Dark: Home accent `#8cddc0` on `card` | 9.32 | 4.5 | Pass |
| Dark: Business `#145d67` on dark `bg` (as in the design files) | 2.24 | 4.5 | **Fail**: use `#8fd3e0` |
| Dark: Business accent `#8fd3e0` on dark `bg` `#11201c` / on dark `card` `#1b2b25` | 10.07 / 8.85 | 4.5 | Pass |
| Dark: `on-accent` `#11201c` on Business accent `#8fd3e0` (button text) | 10.07 | 4.5 | Pass |
| Dark: `field-border` `#6f8a7e` on `card` | 3.96 | 3 | Pass |

A contrast test in `shared/` checks every text/background pair in the token table, light and dark, and fails under 4.5:1 (3:1 for borders, icons and focus).

## 17.4 Statuses

Every status shows a text label and an icon, never colour alone:

| Status | Label | Icon idea | Tokens |
|---|---|---|---|
| Owed | "Owed $x" | arrow toward the worker | accent |
| Settled | "Settled" | check | muted |
| Paid in advance | "Paid in advance $x" | arrow back | warn |
| Pending (on the phone) | "Pending" | clock | badge-pending |
| Needs review | "Needs review" | exclamation | badge-pending |
| Unrecorded | "Not recorded" | empty circle | badge-neutral |
| No work | "No work" | dash | badge-neutral |
| Waiting for rate | "Waiting for rate" | clock | badge-pending |
| Check not cleared | "Check not cleared" | clock | badge-pending |
| Not bank verified | "Not bank verified" | info | muted |
| Reversed | "Reversed" | undo arrow | badge-returned |
| Superseded | "Superseded" | stacked pages | badge-neutral |
| Business Pending | "Pending approval" | clock | badge-pending |
| Approved | "Approved" | check | accent |
| Returned | "Returned" | return arrow | badge-returned |

## 17.5 Components

Build once per surface, from the same tokens:

| Component | Notes |
|---|---|
| Button | Primary, secondary, ghost, danger. "Record payment" uses secondary styling with the helper line "Records a payment you already made." |
| Work buttons | Full · ½ · Other · No work; Hours · No work. 48 pt high; wrap to two rows at large text. |
| Undo snackbar | 5 seconds; announced; focusable. |
| Money text and money input | Formats integer cents; input is text parsed with `shared/money.ts`. |
| Hours input | h:mm, start/end/break, overnight switch; parsed with `shared/pay.ts`. |
| Balance card | Owed / Paid in advance / Settled; "+$x waiting to send" line apart. |
| Before → after preview | Used on every money review. |
| Confirmation checkbox | Method-specific wording; unticked by default. |
| Status badge | §17.4. |
| Project switcher, date row | Today header. |
| Workspace card | Name, kind, role; opens the switcher. |
| Receipt view | One renderer per surface from the snapshot; EN/ES. |
| Empty, loading, error, offline states | 1.4 states table; never flash $0.00 while loading. |
| Web table | Real table semantics; sticky header; money right-aligned. |
| Web sidebar, drawer, bottom links | §12.1. |

## 17.6 Accessibility rules (WCAG 2.1 AA)

| Rule | iPhone | Web |
|---|---|---|
| Text contrast 4.5:1 (3:1 for large text, icons, control borders, focus) | Tokens §17.1 | Same |
| Text resizing | Dynamic Type up to the largest accessibility sizes; layouts reflow (work buttons wrap, amounts stack under names); no fixed-height text containers | 200% zoom and 320 px width with no loss of content and no horizontal page scroll (tables scroll inside their card) |
| Screen readers | `accessibilityRole`, `accessibilityLabel`, `accessibilityState` (no `aria-*` in React Native). Worker card reads "Marco Reyes, $240 a day, not recorded". Work buttons read "Full day for Marco Reyes". Saves, Undo and errors are announced. | Labels on every control; errors tied to fields with `aria-describedby`; live region for saves and per-row timesheet results; landmarks; one h1 per page |
| Keyboard | Full keyboard and Switch Control support | Every action reachable by keyboard in a logical order; skip link; dialogs trap focus and return it; Escape closes |
| Focus | System focus | Visible 3 px `focus` outline with 3 px offset on every interactive element |
| Targets | 44 × 44 pt | 44 × 44 px |
| Colour | Never the only signal (§17.4) | Same |
| Motion | Respect Reduce Motion; no decorative motion | `prefers-reduced-motion`: no transitions |
| Time limits | The 5-second Undo is an extra; the action is still correctable afterwards | Same |
| Language | Documents in Spanish set the language on the receipt view | `lang="es"` on Spanish receipt content |

The revised `TodayLargeText` image has a scaling bug (the worker's name stays small while buttons grow). Build the rule, not the image.

---

# 18 Screen coverage

`docs/SCREEN-COVERAGE-2.0.csv` has one row for every revised screen: 177 mobile and 85 web, 262 in all.

## 18.1 Columns

| Column | Means |
|---|---|
| `surface` | `mobile` or `web` |
| `id` | Screen ID; the image is `docs/screens-2.0/<image>` |
| `title`, `group` | Name and design group |
| `image` | Path under `docs/screens-2.0/` (blank for the two demo routes) |
| `category` | Kept-changed (51), New-covered-by-1.4 (42), New-scope-home (3), New-scope-identity (11), New-scope-business (70), New-scope-web (68), Website (15), Demo-only (2) |
| `roles` | Who sees it |
| `build_phase` | `P1b`, `P1c`, `P2`–`P7`, `B1`–`B4`, or `Do not build` |
| `change_vs_1.4` | What the design changed |
| `data_impact` | Schema or API effect |
| `rules_and_conflicts` | What's wrong in the design or needs care; §10–§14 say what to do about it |
| `size` | S, M, L |
| `status` | `not_started` → `built` → `verified` |
| `test_evidence` | Test file and test name (or "manual: <gate step>") proving the screen's rules |

Counts by phase: mobile P1b 14, P2 18, P3 13, P4 19, P5 7, P6 11, P7 24, B1 22, B2 24, B3 9, B4 16; web P1c 18, P2 12, P3 6, P4 4, P5 1, P6 4, P7 24, B1 2, B2 10, B4 1, Do not build 3. Each row's `build_phase` matches the phase file that builds it.

## 18.2 How to use it in a phase

1. At the start of the phase, filter `build_phase` to the phase. That's the screen list. Open every image.
2. For each row, read the matching row in §10 (Home iPhone), §12.2 (web), §13 (website) or §14.2 (Business). Those rows win over `change_vs_1.4` and the image.
3. When a screen is built, set `status` to `built` and fill `test_evidence`.
4. At the gate, paste the filtered rows for the phase. Every row must be `built` with evidence, or listed under "not finished" with a reason. The owner changes `built` to `verified` after the gate.
5. Don't change `build_phase`, `category` or the descriptive columns. If one looks wrong, say so at the gate.

## 18.3 Rows that need care

The CSV's `build_phase` column was corrected for baseline 2.0 (`ChangePay` and `RateReview` → P2, `ExpenseReview` → P5, mobile `Statement` and web `statement` → P6, web `mobile-preview` → Do not build, web `expired` → B4). These rows still need a note:

| Row | `build_phase` | Build it as |
|---|---|---|
| mobile `LimitSheet` | P7 | P2 shows a plain 402 message; P7 builds the revised sheet. |
| mobile `NeedsReview`, `ConflictReview`, `SavedLocally`, `SyncComplete` | P7 | The behaviour ships with the P3 offline queue (1.4); P7 restyles to these images. |
| mobile `More`, `Account`, `Diagnostics` | P7 | P1b and P1c build the parts they need (§10.1); P7 finishes them. |
| mobile `InvitePartner` | P1b | The same flow as `HomeInvite` (More → Partner, §10.1). |
| mobile `Readability`, `BReadability` | P7, B4 | Not built as a setting; an information screen only (§10.7). |
| mobile `TodayList` | P3 | Not a separate view (§10.3). |
| web `public-receipt` | P6 | The visual target for the API-served `/r/:token` page. |
| web `sync` | P3 | Connection status only; no browser drafts. |
| web `accessibility` | P7 | Theme choice; no "Larger text" toggle. |
| web `expired` | B4 | Business only; Home is never locked. |

## 18.4 Screens with no CSV row

These come from this document, not from the design. Add a row for each in the phase that builds it, with `category` = `Added in 2.0 spec`, `image` blank, and the nearest image named in `rules_and_conflicts`:

| Phase | Surface | Screen | Nearest image |
|---|---|---|---|
| P1c | mobile | Email code entry (in `AccountSignIn` flow) | `AccountSignIn` |
| P1c | mobile, web | Account: Add email sign-in, Add Sign in with Apple | `Account`, web `profile` |
| P1c | web | Partner page and Leave | web `member`, `invitations` |
| P3 | web | Home day sheet | web `timesheet` |
| P4 | web | Payment detail with Fix this payment, Split a payment | mobile `PaymentDetail`, `SplitPayment`, web `receipt` |
| P4 | web | Pay what's owed | mobile `PayOwed`, `BulkReview` |
| P2 | web | Rate change and Set rate | mobile `ChangePay`, `RateReview` |
| P5 | web | Ledger tab, balance breakdown | mobile `Ledger`, `BalanceBreakdown` |
| P5 | web | Reimbursement and adjustment forms | mobile `Reimburse`, `AdjustBalance` |
| P5 | web | Year-end totals | mobile `YearTotals` |
| P6 | mobile, web | Questions list | mobile `Payments` |
| P7 | website | Delete account page | web `contact` |
| B1 | mobile, web | Change a job's lead | `BJob` |
| B1 | mobile, web | Change role and money access | `BMember` |
| B2 | mobile | Correction request: Keep as is | `BCorrectionReview` |

---

# 19 Things to confirm before building

The owner confirms each item before the phase named. Until then, the phase doesn't build the part that depends on it. Nothing here reopens a decision in §2.

| # | Item | Why | Before |
|---|---|---|---|
| C1 | Email provider (Resend or Postmark), account, and a sender address on crewtallyapp.com with the DNS records the provider asks for. Check the provider's sending limits for the expected volume. | Email codes and invitations (D2, D14). | P1c |
| C2 | Apple **Services ID** for the web, Sign in with Apple turned on for it, web domains and return URLs registered and verified; whether the Replit development URL can be registered, or web Apple sign-in is tested on the deployed domain only. | Web Apple sign-in (§6.3). | P1c |
| C3 | That Apple's user identifier (`sub`) is the same for the iPhone app and the web Services ID under the same developer team. | Same account on both surfaces (§4.1). | P1c |
| C4 | Web session lifetime and idle timeout (default: same as Phase 1 sessions). | Shared computers (§12.4). | P1c |
| C5 | Resolved: 0003 has `link_apple`, so an email account can add Sign in with Apple (§6.4). On iPhone it's tested at the TestFlight checkpoint (in the Expo Go build on the owner's iPhone, Apple's sign-in module isn't available; we saw `ExpoAppleAuthentication=false` on 1 October). Nothing to confirm. | Linking (§6.4). | — |
| C6 | Web has no interactive sample in Release 1; "Explore the sample" on the web goes to How it works. | Scope (§6.6). | P1c |
| C7 | App Review: an iPhone app that offers Sign in with Apple and CrewTally's own email codes, and the review account (`REVIEW_EMAIL` + `REVIEW_CODE`, §6.1). Confirm current guideline wording. | §6.1. | TestFlight checkpoint, P8 |
| C8 | ManageSubscription shows "Renews / Won't renew" from RevenueCat customer info on the device (display only). Home Pro stays on `workspace_entitlements`; B4's 0010 stores `will_renew` for Business only. Accept, or move Home Pro to `workspace_subscriptions` later with written approval. | §10.7. | P7 |
| C9 | Legal inputs for privacy, terms, support and deletion pages (§13.3). | No placeholders ship. | P7 (pages), P8 (gate) |
| C10 | Support email address. | Help, contact, deletion page, emails. | P7 |
| C11 | Business price ($29/$290) validated with 3–5 contractors. | D1, D5. | B4 (products) |
| C12 | Apple subscription groups: Home Pro and Business in separate groups so both can be active for one person. Check against Apple's current documentation before creating products. | §14.9. | B4 |
| C13 | Apple introductory offer for the 14-day Business trial: setup and eligibility rules (they apply per subscription group and Apple ID). | D5. | B4 |
| C14 | RevenueCat restore/transfer setting: pick the one that keeps a purchase with its original app user (workspace). Check the current option name and default. | §14.9. | B4 (and re-check for Home in P7) |
| C15 | Business writes during `GRACE` and `BILLING_RETRY`: default here is "still active until a confirmed expiry". | §14.10. | B4 |
| C16 | Dark copper `#e3a27a` (not in the design files). The Business dark accent `#8fd3e0` is adopted (10.07:1 on the dark background, §17.3). | §17.1. | P7 (website) |
| C17 | B1's 0008 redefines the three 0004 plan-limit trigger functions with a Business guard (Home logic unchanged). The B1 phase file is the written approval; the owner confirms at the B1 gate. `delete_workspace_data` isn't changed: every Business table cascades from `workspaces`. | Invariant 4. | B1 |
| C18 | Exports for leads and workers: `role_can` gives `export` to money roles only, so leads and workers have no export in 1.1 (the revised doc 03 suggests scoped exports). Accept, or approve a new action later. | §5.3. | B2 |
| C19 | Reminders are stored on each phone (P7), so the organizer and the partner each choose their own; there's no server reminder row. Accept for Release 1. | §10.7. | P7 |
| C20 | For Business page and pricing in Release 1 say "Coming later" with no price. | §13. | P7 |
| C21 | Whether Replit's PostgreSQL lets the API run as a separate non-owner role (EXECUTE on the listed functions, SELECT where needed, no INSERT, UPDATE or DELETE on the protected tables, §15.3). If yes, P8 sets it up and tests it; if not, record it as an accepted risk in the QA log. | Today "app code never writes these tables" is a rule the code follows, not something the database enforces. | P8 |
