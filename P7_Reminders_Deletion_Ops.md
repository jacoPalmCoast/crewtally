# Phase 7 — Reminders, account deletion, export, sync and recovery, accessibility, nightly jobs, Home billing, settings and the website

> **Before pasting:**
> 1. Phase 6 passed its gate.
> 2. Fill in the **owner inputs** table in section 11 (legal name, address, support email and so on) and paste it with this phase. The Agent must not invent any of them.
> 3. Add the Replit Secret `BACKUP_ENCRYPTION_KEY` (development value for testing): in the Shell run `openssl rand -base64 32`, paste the result into Secrets, then clear the Shell. Don't ask the Agent to make it. Production gets its own new value in Phase 8.
> 4. You'll add RevenueCat Secrets when the Agent asks (section 9).

## Goal

Everything Apple checks, everything that keeps the data safe, and the public website:
- local daily reminders on iPhone,
- account deletion through `delete_user_account`, on iPhone and the web, with every Sign in with Apple token (iPhone and web) revoked first,
- a public account-deletion page,
- a full data export,
- the Sync & recovery screen (was Diagnostics) and the restyled offline screens,
- an accessibility pass on iPhone and the web,
- nightly reconciliation, backup and cleanup jobs,
- Home plans sold on iPhone with RevenueCat (organizer only; records never locked), and plan pages on the web that explain purchases happen on iPhone,
- web settings, profile, accessibility and data pages,
- the website: home, audience pages, how it works, pricing, download, help, support, privacy, terms and the deletion page. From this phase the privacy, support and deletion pages live on the website, and the API's simple `/api/privacy`, `/api/support` and `/api/delete-account` pages become redirects.

This phase adds migration `0007_deletion_jobs_and_alerts.sql` (it was 0006 in baseline 1.4). You write it; its content is below.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: section 9 "Account deletion", section 8 "Home partner", section 11 "Money rules: keep, adopt, must not build", section 12 "Web app", section 13 "Website", section 17 "Design system and accessibility", section 19 "Things to confirm before building".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 10 (reminders), section 15 (deletion, export, retention, permissions, abuse controls), section 16 (monitoring, backups, diagnostics), section 19 "Plans and pricing".
- `docs/SCREEN-COVERAGE-2.0.csv`, every row with `build_phase` = P7. Read `rules_and_conflicts` for each.
- Screens: mobile `More`, `Plan`, `PlanTerms`, `PurchaseReview`, `PurchaseAnnual`, `PurchaseMonthly`, `PurchaseSuccess`, `PurchaseFailure`, `PlanPro`, `ManageSubscription`, `LimitSheet`, `RestoreResult`, `Account`, `Privacy`, `ExportData`, `DeleteAccount`, `DeleteConfirmation`, `Reminders`, `Diagnostics`, `NeedsReview`, `ConflictReview`, `SavedLocally`, `SyncComplete`, `Readability`; web `settings`, `profile`, `accessibility`, `billing`, `plan-options`, `plan-review`, `purchase-handoff`, `manage-plan`, `restore`, `data`, and the website pages `website`, `for-home`, `for-business`, `how-it-works`, `pricing`, `download`, `help`, `help-start`, `help-work`, `help-money`, `help-billing`, `contact`, `privacy`, `terms`.
- `db/migrations/0003_identity_and_memberships.sql`: `delete_user_account` (read every line; it calls `delete_workspace_data` itself).
- Apple: "Offering account deletion in your app" and the `POST https://appleid.apple.com/auth/revoke` endpoint.
- RevenueCat's current docs for the webhook event types and fields, the REST API for reading and deleting a customer, and the project's restore (transfer) behaviour setting. Paste the links at the gate.

## Not built (from the coverage file)

| CSV row | Why not |
|---|---|
| web `mobile-preview` (CSV: Do not build) | A launcher into the demo. Dropped. |
| web `expired` (CSV: B4) | Home records are never locked (invariant 16). This page belongs to Business and is built in B4. Don't build any Home read-only state on iPhone or the web. |
| web `data` "Reset sample records" | Demo code (invariant 18). |
| web `accessibility` "activity notice preference" and "Larger text" toggle | Activity notices are Business (B2). Browser zoom does larger text (spec section 12.2). |
| mobile `Readability` text-size override | iPhone already has Dynamic Type. Build `Readability` as an information screen (below), not a second text-size setting. |
| web `contact` live form | Nothing sends it. The support page shows the support email address instead. |

## Must not build (and how each is tested)

| Must not build | Test that proves it |
|---|---|
| Pausing Home work or payments when a plan expires or a Pass is refunded (spec section 11) | After a `PRO_EXPIRED` event: record work and a payment for an existing worker on iPhone **and** web (API) → 200; a new project → 402 (T51, T57). No Home route ever returns a read-only or "expired" error. |
| "Unlimited" anywhere | A test greps `mobile/src`, `web/src`, the website pages and both translation files for "unlimited" (any case) and fails on a hit. Pro is "As many projects and workers as you need." |
| Hard-coded prices in the iPhone app | Plan screens show store prices from a mocked RevenueCat offering; a grep for `7.99`, `49.99`, `24.99` in `mobile/src` finds nothing (T59). |
| A partner (or any non-organizer) buying, restoring or seeing checkout | `POST /v1/plan/refresh` → 403 for the partner; the mobile app never configures RevenueCat when the current role lacks `plan.manage` (unit test); the partner's Plan screen has no buy or restore buttons. |
| The iPhone app pointing people to the web to pay | No link from the iPhone app to the website's pricing or plan pages (grep the mobile build for `/pricing`). |
| Deletion as a "request" only, or deleting without re-authentication | Web and iPhone both call the real `POST /v1/account/delete`; a missing or stale re-authentication → 401 and nothing deleted. |
| An export narrower than everything (CSV of work only) | The ZIP test checks every file listed in section 4. |
| Payment drafts sent automatically when the connection returns | A saved payment draft stays a draft after reconnect; nothing is posted until the member taps Record (test with the queue running). |
| "All synced" while something needs review | `SyncComplete` never shows while the queue isn't empty or a Needs review item exists (unit test). |
| Demo links on the website (`demo`, `design`, "Explore the web app", "Try the experience", "Open on web") | A link-check test crawls every website page and fails on any link to a route that doesn't exist or that contains `demo` or `design`. |

## Build

### 1. Migration `0007_deletion_jobs_and_alerts.sql`

Write it in `db/migrations/`. Additive. Neither table has a foreign key, so deleting a workspace neither fails nor removes these rows.

```sql
create table deletion_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,                 -- no FK: the workspace is already gone
  kind          text not null check (kind in ('WORKSPACE_FILES','REVENUECAT_CUSTOMER')),
  requested_at  timestamptz not null default now(),
  attempts      integer not null default 0,
  last_status   text,                          -- HTTP status or short code only
  completed_at  timestamptz,
  unique (workspace_id, kind)
);

create table ops_alerts (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('RECONCILIATION_MISMATCH','APPLE_REVOKE_FAILED',
                                              'CLEANUP_FAILED','BACKUP_FAILED')),
  workspace_id  uuid,                          -- null for system-wide alerts; no FK
  ref_ids       jsonb not null default '[]',   -- ids only: never names, amounts or emails
  created_at    timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index ops_alerts_open on ops_alerts (workspace_id) where acknowledged_at is null;
```

Tests in a new `db/tests/13_deletion_jobs.sql`: after `delete_user_account` deletes a workspace, a `deletion_jobs` row for it can still be inserted and read; `05_account_deletion.sql` and `11_identity_memberships.sql` still pass unchanged.

### 2. Account deletion (iPhone and web)

**Who loses what** (from `delete_user_account`):
- Every workspace where you're the **organizer** is deleted, for everyone in it. Your partner loses access.
- Every workspace where you're the **partner**: you just leave. The organizer keeps every record, including the ones you recorded; those show "Recorded by Former member".
- Your sessions (phone and web) are revoked; pending invitations you sent, and pending invitations addressed to your email, are revoked; your Apple credentials are removed; and your identity is scrubbed. Email codes are not deleted here: the nightly job purges them after 24 hours, so deleting an account never resets the email limits.

**Routes** (all `sessionRoute`; deletion is about the person, not one workspace):

| Route | What it does |
|---|---|
| `GET /v1/account/deletion-preview` | `{deletes: [{workspace_id, name, kind, other_members: [{display_name, role}], pro_active}], leaves: [{workspace_id, name, role}], sign_in: {apple: bool, email: bool}}`. Display names only; never emails. |
| `POST /v1/account/delete/code` | For people with email sign-in: sends a fresh 6-digit code to the account's verified email through the Phase 1c email adapter (`issue_email_code`, purpose `DELETE`, hashed as `HMAC-SHA256(CODE_PEPPER, email + ':' + 'DELETE' + ':' + code)`). Subject "Confirm deleting your CrewTally account". Same database limits and API rate limits as sign-in codes. Asking for it never cancels a pending sign-in or link code. |
| `POST /v1/account/delete` | `{confirm: "DELETE", apple_identity_token?, email_code?}`. Steps below. |

**`POST /v1/account/delete`, in this order:**
1. **Re-authenticate.** Apple users send a fresh identity token (verified like sign-in, same `sub`, issued in the last 10 minutes, nonce checked). Email users send the code from `/delete/code`, checked with `verify_email_code(email, 'DELETE', hmac)` **in its own transaction, committed before anything else happens**, so a wrong try is always counted (the 5-per-code and 20-per-day limits apply). A right code is used up by that check. A sign-in or link code never works here, and a deletion code never signs anyone in. People with both may use either. A wrong code or a bad token → 401 and the request stops here: no Apple token is revoked and nothing is deleted. Tests: a wrong code twice leaves the attempt count at 2 and every Apple credential untouched; after a right code, steps 2–3 run.
2. **Revoke Apple tokens first** (`delete_user_account` removes `apple_credentials`, so this must come before it). For **each** `apple_credentials` row of the user: `POST https://appleid.apple.com/auth/revoke` with the `client_id` it was issued to, chosen by `client_kind`: the bundle ID (`com.crewtallyapp.crewtally`) for `APP`, the web Services ID (`APPLE_WEB_SERVICES_ID`) for `WEB`; the matching client secret JWT (its `sub` is that client id); the token; and `token_type_hint=refresh_token`. A 200 counts as done; so does `400 invalid_grant` (already revoked). Anything else, or a network error: insert an `ops_alerts` row `APPLE_REVOKE_FAILED` (user id only), return **503** `{"error":"TRY_AGAIN"}`, and delete nothing. In development with no stored token, skip and log `apple_revoke=skipped_dev`. Log only HTTP statuses.
3. **One transaction:** `select delete_user_account($user)` → the deleted workspace ids; insert `deletion_jobs` rows (`WORKSPACE_FILES` and `REVENUECAT_CUSTOMER`) for each id. App code never calls `delete_workspace_data`.
4. Return **202** `{deleted_workspaces: n, left_workspaces: n}`, clear the web cookie if it's a web request, and start the cleanup job in the background.

**Cleanup job** (`server/src/jobs/deletionCleanup.ts`; runs right after a deletion and in the nightly job):
- `WORKSPACE_FILES`: delete every object under `ws/<workspace_id>/` in Object Storage, then set `completed_at`.
- `REVENUECAT_CUSTOMER`: delete the RevenueCat customer whose app user id is the workspace id, through RevenueCat's REST API (check the endpoint against the current docs; paste the link). A "not found" answer counts as done.
- On failure: `attempts + 1`, `last_status`, retried nightly. After 5 failed attempts, one `CLEANUP_FAILED` alert.
- Never disable the ledger trigger or change `session_replication_role`.

**iPhone** (`Account` → `DeleteAccount` → `DeleteConfirmation`):
- `DeleteAccount` lists, from the preview:
  - "Deleted for everyone: <workspace>". For each, the other members: "<name> (partner) will lose access."
  - "You'll leave: <workspace>. <Organizer> keeps its records."
  - "Projects, workers, payments, receipts, statements and photos in the deleted workspaces are removed from our servers."
  - "PDFs and receipts you already shared can't be recalled. Receipt links stop working."
  - "Backups are kept for 30 days, then they're gone too."
  - "Deleting your account doesn't cancel an App Store subscription. Cancel it in Settings → your name → Subscriptions." with **Manage subscription** (`https://apps.apple.com/account/subscriptions`).
  - If this phone has unsent entries: "<n> entries on this phone haven't been sent. Deleting removes them."
  - **Export my data first** (opens `ExportData`).
  - An "I understand" checkbox, then **Continue**.
- `DeleteConfirmation`: **Continue with Apple** (fresh token) or, for email accounts, **Send me a code** and the code field. Then the delete call.
- Afterwards, clear secure storage, the local SQLite database (every workspace's queue and drafts), scheduled notifications, the saved workspace, and RevenueCat (`logOut`). Return to the first screen.
- On 503: "We couldn't finish. Nothing was deleted. Try again in a few minutes."

**Web** (`profile` → **Delete account**, and `data`): the same preview and wording, the checkbox, then re-authentication with Sign in with Apple on the web or an email code, then the delete call. Afterwards, go to the website home with "Your account was deleted."

**Partner deleting their account:** the preview shows only "You'll leave". Nothing in the organizer's workspace is deleted.

### 3. Public account-deletion page

A website page at `/delete-account` (section 11). From this phase, `GET /api/delete-account` (and `/api/privacy`, `/api/support`) answer **301** to the website pages `/delete-account`, `/privacy` and `/support`, so there's one copy of each text. Plain words:
- How to delete in the iPhone app (More → Account → Delete account) and on the web (Account → Delete account).
- What gets deleted, what a partner loses, that partners deleting their account only leave, that shared PDFs can't be recalled, backups age out within 30 days, and that the App Store subscription isn't cancelled by deleting.
- If you can't sign in: email the support address from the account's email and we'll confirm from that address before deleting.

For those emails, add `npm run ops:delete-account -- --email <address>`: it finds the user by verified email, prints the deletion preview (names and counts only), asks for `yes`, then runs steps 2–4 of `POST /v1/account/delete` (the same function, so the Apple revoke still comes first). It refuses to run without `APP_ENV` set and logs only ids and statuses.

### 4. Data export (iPhone and web)

`POST /v1/workspace/export` — member route, action `export` (organizer and partner yes; lead and worker no). Rate limit 2 per hour per workspace. Streams a ZIP for the current workspace:
- CSVs, written with the Phase 5 encoder: projects, workers (with skills, favorite and private note), assignments, rate agreements, ratings, work entries with revisions, payments, allocations, reversals, reimbursements, adjustments, members (display name, role, joined; no emails), and the ledger.
- `receipts/R-000123-v1.json` and `.html`, `statements/S-000041.json` and `.html` (from the shared templates), and the evidence files.
- `README.txt`: what each file is, and that it includes private notes and ratings, so keep it safe.

iPhone (`ExportData`): what's inside, the privacy note, **Download** (to the cache, then the share sheet). Web (`data`): the same, as a browser download.

### 5. Reminders (iPhone, local only)

`Reminders` screen (More → Reminders), with the 2.0 layout and the 1.4 behaviour:
- Project picker, on/off, time (default 6:00 pm, confirmed by tapping Save), and a preview line. Days come from the project's work days (set in project settings); show them, read-only.
- At most 3 projects with reminders on; a fourth shows "Reminders can be on for 3 projects at a time."
- **Stored on this phone only** (AsyncStorage per user and workspace). Reminders are local notifications, and with several members a server row per project can't hold each person's phone. Don't write `reminder_preferences`, and don't add a reminders route.
- Organizer and partner can each turn on reminders on their own phone.
- **Permission flow:** explainer card first ("Get a nudge at 6:00 pm on work days to record the day and review payments."), then the request. If denied: the app stays fully usable, Today shows an in-app reminder card after the chosen time when the day isn't complete, and an **Open Settings** link (`Linking.openSettings()`).
- **Scheduling:** dated one-off notifications for the next 14 **work days** in the project time zone at the chosen time, with identifiers `rem:<workspace_id>:<project_id>:<YYYY-MM-DD>`. Refresh on launch, foreground, settings change, time zone change, workspace switch and project archive. Cancel all of a workspace's reminders when you leave it or lose access.
- **Content:** title "Record today's work", body "Record today's work and review payments." No names, amounts or addresses. Actions **Open day** (deep link to Today for that workspace, project and date, even after midnight; switch workspace first if needed) and **Remind me in 1 hour**.
- Completion cancels that day's reminder. Archiving cancels the project's reminders.
- **DST:** a nonexistent local time moves to the next valid minute; a repeated time fires once. Unit-test with an `America/New_York` project around 8 March 2026 and 1 November 2026.

### 6. Sync & recovery, and the offline screens (iPhone)

**Sync & recovery** (`Diagnostics`, More → Sync & recovery):
- App version and build, API status, last successful refresh, connection.
- Pending queue count, Needs review count, and an interrupted payment draft if one exists (**Resume** or **Discard**; a draft is never sent on its own).
- Support ID: the first 8 characters of the workspace id and of the user id. Role and workspace kind.
- **Send now** (flushes the queue) and **Export pending entries** (JSON of HELD, PENDING and REJECTED ops through the share sheet).
- "Uninstalling the app removes entries that haven't been sent."
- "Purchases: test mode" when RevenueCat runs in test mode.
- If an open `ops_alerts` row names this workspace: "A balance check needs review. Contact support with ID <support ID>." Nothing about other workspaces.

**Restyle to the 2.0 screens, keeping the Phase 3 behaviour:**
- `NeedsReview`: both versions side by side with the balance impact. Label the server version "Recorded by <name>" (from the revision's `recorded_by`; "Former member" if needed) and the other "This phone". Keeping one writes the reason "Replaced after conflict" automatically.
- `ConflictReview`: the confirm step after "Replace with mine", with saved vs replacement earnings and the balance change.
- `SavedLocally`: "Work entries saved on this phone" with the pending count. Only work entries queue; payments never do.
- `SyncComplete`: only when the queue is empty and nothing needs review.

**More** screen (`More`): Workspaces (switch), Partner (organizer) or Leave (partner), Plan, Reminders, Ledger, Year-end totals, Projects, Exports, Account, Privacy, Sync & recovery, **Help and support**, and the app version at the bottom. A Needs review banner at the top when anything needs review. No separate text-size entry.

**Help and support** (More → Help and support): **Help guides** (`https://crewtallyapp.com/help` in the in-app browser), **Support** (`https://crewtallyapp.com/support`), the support email, the support ID, and a **Text size** row that opens `Readability`.

**Readability** (`Readability`, from Help and support): an information screen, not a setting. "CrewTally follows your iPhone's text size. Change it in Settings → Accessibility → Display & Text Size → Larger Text." A live preview of a Today card at the current size, and **Open Settings**.

**Account** (`Account`): Your name, sign-in methods with **Add email sign-in** and **Add Sign in with Apple** (Phase 1c), the workspace's receipt name with an explicit **Save** (organizer only; "Earlier receipts keep the name they were made with"), Export records, Privacy, Sign out, Delete account.

**Privacy** (`Privacy`): the in-app summary, plus a link to the full policy at `https://crewtallyapp.com/privacy`. Say evidence stays private and is never on a receipt link.

### 7. Accessibility (iPhone and web, WCAG 2.1 AA)

iPhone:
- Every tappable control has `accessibilityRole` and `accessibilityLabel`; work options read like "Worker A, full day, selected"; amounts read in full.
- Saves, Undo, errors and "Pending" are announced (`AccessibilityInfo.announceForAccessibility`).
- At the largest Dynamic Type size, work options wrap to two rows and amounts move under names. Check Today, Record payment, Worker detail, Receipt, Statement, Plan and Delete account.
- Contrast 4.5:1 for body text, 3:1 for icons and borders, light and dark. Touch targets 44 pt. Reduce Motion respected.

Web and website:
- Keyboard: every action reachable in a sensible order, visible focus, no keyboard traps, a "Skip to content" link.
- Screen readers: landmarks, labelled form controls, table headers, status messages in a polite live region.
- Text resizes to 200% without loss; layouts work at 390, 768 and 1440 px wide with no sideways scroll.
- Contrast as above, light and dark. 44 px targets. `prefers-reduced-motion` respected.
- **Appearance** (`accessibility` page, `/app/settings/appearance`): Theme **System · Light · Dark** for this browser (kept in `localStorage`, wrapped in try/catch; the page works without it). No "Larger text" toggle: browser zoom does that, and layouts reflow at 200% zoom and 320 px. Motion follows the device.

### 8. Nightly jobs (Replit Scheduled Deployment)

`server/src/jobs/nightly.ts` at 03:15 UTC:
1. **Reconciliation.** For every assignment, recompute the balance from sources (the query at the end of `db/tests/04_reimb_adj_rest_rates.sql`) and compare with `assignment_balances`. For every payment, allocations equal the amount and reversals never exceed allocations. Each mismatch: log `RECONCILIATION_MISMATCH` with ids only, and one `ops_alerts` row with the workspace id.
2. **Backup.** `pg_dump` (custom format) of the production database, encrypted with `BACKUP_ENCRYPTION_KEY`, written to Object Storage at `backups/YYYY-MM-DD.dump.enc`. Keep 30 days; deleting older backup files is the only deletion this step does. Record size and checksum. Refuse to run without the key. On failure, a `BACKUP_FAILED` alert.
3. **Deletion cleanup:** process open `deletion_jobs`.
4. **Old email codes:** `delete from email_codes where created_at < now() - interval '24 hours'`. This is the one delete app code may run on `email_codes` (invariant 2); the database's limits need the last 24 hours, so never delete newer rows. Account deletion doesn't touch `email_codes`.

**Operator view.** `npm run ops:alerts` prints open alerts by kind and count, with ids, and `npm run ops:ack -- <id>` marks one acknowledged. Email is used only for sign-in codes and invitations, so alerts don't email anyone.

**Restore rehearsal** `scripts/restore_rehearsal.sh`: restore the latest backup into a **new, throwaway** database or schema (never production; refuse if the target looks like production), run the reconciliation there, print counts, and replay a saved request with an old `operation_id` to show nothing posts twice. Document it in `docs/RESTORE.md`. Paste what Replit's docs say about point-in-time restore for its production database, with the link.

### 9. Home plans with RevenueCat (iPhone) and plan pages (web)

Use Replit's built-in RevenueCat integration ("add subscriptions with RevenueCat"). It's the one allowed native module outside the Expo SDK. Tell me the steps it needs from me; I create the RevenueCat account and connect App Store Connect. Secrets: `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`. The public iOS SDK key can live in app config.

**Products** (I create them in Phase 8; use these ids now):

| Product id | Type | Price | Grants |
|---|---|---|---|
| `pro_monthly` | Auto-renewable, group "CrewTally Pro" | $7.99 | RevenueCat entitlement `pro` |
| `pro_annual` | Auto-renewable, same group | $49.99 | `pro` |
| `project_pass` | Consumable | $24.99 | No entitlement; each purchase adds one pass on our server |

**Who:** only roles with `plan.manage` (the Home organizer). A partner never pays and never sees buy, restore or manage buttons: their Plan screen shows the plan and "<Organizer> manages the plan."

**iPhone:**
- Configure RevenueCat only when the current workspace role has `plan.manage`, with **app user id = workspace id**. Never the Apple ID, email or name. On a workspace switch, `logIn` with the new id if you manage that plan, otherwise `logOut`. `logOut` at sign-out. Never in sample mode.
- **Plan** (`Plan`): Free, Project Pass, Pro monthly and Pro yearly, each with what it includes. Prices and periods from RevenueCat offerings; never hard-coded. Subscriptions say they renew automatically until cancelled. **Restore purchases**, **Manage subscription**, and links to **Terms of use** (Apple's standard EULA, `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`) and the **Privacy policy**. Wording:
  - Free: "1 active project and 3 current workers. Receipts, statements, Spanish documents, signatures and exports included. Invite a partner."
  - Project Pass: "One project, as many workers as it needs. Stays with that project, even if you archive and reopen it."
  - Pro: "As many projects and workers as you need."
  - Everywhere: "Your records are never locked. If a plan ends, you keep recording work and paying the workers you have."
- **PlanTerms:** the same facts, plus the Terms of use and Privacy policy links (both, not one combined link).
- **PurchaseReview / PurchaseAnnual / PurchaseMonthly:** a review step before Apple's sheet with the store price, the period or "one time", the named project for a Pass, and the auto-renew note.
- After any purchase or restore: `POST /v1/plan/refresh`, then `GET /v1/plan`. Show **PurchaseSuccess** only after the server shows the new state. "Continue adding worker" resumes the interrupted action (for a Pass, attach it to the project with the new `pass_id`, then retry).
- **PurchaseFailure:** plan unchanged, Try again, Restore purchases. A user cancel is not a failure: go back quietly.
- **RestoreResult:** the workspace name and the plan the server shows. Apple doesn't restore a consumable Project Pass; passes come back from our server records.
- **PlanPro** and **ManageSubscription:** plan, the server's `pro_expires_at`, and "Renews on" or "Ends on" from RevenueCat's customer info on this phone (display only; the server still decides the plan). **Manage subscription** opens `https://apps.apple.com/account/subscriptions`.
- **LimitSheet:** Project Pass, Compare Pro plans, and "Keep <worker> in My crew without assigning them". Pass wording: "as many workers as this project needs".
- In Expo Go, RevenueCat runs in test mode; Sync & recovery says "Purchases: test mode".

**Server:**
- `POST /v1/webhooks/revenuecat` (public; add to the route-table exception list): `Authorization` checked against `REVENUECAT_WEBHOOK_AUTH` with a constant-time compare, else 401. zod-parsed. Map events to `record_entitlement_event`: purchases, renewals, product changes and un-cancellations of `pro_*` → `PRO_ACTIVE` with expiry; expirations and refunds of `pro_*` → `PRO_EXPIRED`; `project_pass` purchase → `PASS_PURCHASED` with its transaction id; refund → `PASS_REFUNDED`. Cancellation (auto-renew off) changes nothing until expiry. **Check every event type and field name against RevenueCat's current webhook docs and paste the mapping table with the link.** Event id → `p_event_id`. An unknown `app_user_id` → 200, log `ignored_unknown_workspace` (ids only). Log event id, type and status only.
- `POST /v1/plan/refresh` — member route, action `plan.manage`: read the customer from RevenueCat's REST API for this workspace and record the state with stable synthetic event ids (`refresh:pro:<original_transaction_id>:<expires_ms>`, `refresh:pass:<transaction_id>`). 10 per minute per workspace.
- `GET /v1/plan` (Phase 2) — action `workspace.read`; add `managed_by_name` (the organizer's display name) so partners see who manages it.
- **Restore across workspaces:** a purchase belongs to the workspace it was bought in. Set RevenueCat's restore behaviour so a restore never moves a subscription to another workspace (confirm the setting name and current default in RevenueCat's docs before building, and paste it; spec section 19).

**Web** (no purchases on the web; prices are the website's list prices from one config file, with "Apple shows the final price in the app"). Paths: `billing` `…/settings/plan`, `plan-options` `…/settings/plan/compare`, `plan-review` `…/settings/plan/review`, `purchase-handoff` `…/settings/plan/iphone`, `manage-plan` `…/settings/plan/manage`, `restore` `…/settings/plan/restore` (`…/x` = `/app/w/:workspaceId/x`):

| Web page (CSV id) | What it has |
|---|---|
| `billing` | Current plan from `GET /v1/plan` (Free, Project Pass on which projects, or Pro with its end or renewal date); Free and Project Pass are always listed; who manages it. Organizer: links to Compare, Manage and Restore. Partner: "<Organizer> manages the plan. You never pay." |
| `plan-options` | Free, Project Pass and Pro side by side with the wording above. |
| `plan-review` | The chosen plan summarised, then **Continue on iPhone**. |
| `purchase-handoff` | "Finish on your iPhone: open CrewTally → More → Plan, in <workspace>." No deep link, no web checkout. |
| `manage-plan` | Steps to manage or cancel in iPhone Settings, and that access stays to the end of the paid period. |
| `restore` | Steps to restore on the iPhone in the same workspace, and that a Project Pass comes back from our records. |

### 10. Web settings, profile and data

| Web page (CSV id) | What it has | Route and action |
|---|---|---|
| `settings` (`…/settings/workspace`) | Workspace name, receipt name (`payer_display_name`, from Phase 2), default time zone for new projects, currency (USD, read-only), link to switch workspace. Partner sees them read-only. | `PATCH /v1/workspace` (`settings.edit`): `{name?, default_timezone?, payer_display_name?}`; invalid time zone → 400. |
| `profile` (`/app/settings/account`) | Restyle the Phase 1c Account page: Your name, email, sign-in methods with **Add email sign-in** and **Add Sign in with Apple** (Phase 1c flows), **Sign out**, **Delete account**. | `PATCH /v1/me` (Phase 1b). |
| `accessibility` (`/app/settings/appearance`) | Section 7. | — |
| `data` (`…/settings/data`) | **Export records** (section 4), links to the Phase 5 CSV exports, **Delete account** (section 2). No reset. | `POST /v1/workspace/export` (`export`). |

### 11. The website

Built in the web artifact as public pages (no sign-in), served at the site root. Plain static pages: no third-party scripts, fonts from the app's own files, no analytics, no cookies. Same tokens, dark mode, 44 px targets and accessibility rules as the web app. Header: **Sign in** (web app sign-in) and **Get started** (web app sign-in, then Choose workspace). Footer: Help, Support, Privacy, Terms, Delete account, and "CrewTally never moves money. It keeps a record of payments you make yourself."

| Path | CSV id | Content and fixes |
|---|---|---|
| `/` | `website` | Hero, Home card, Business card ("Coming in a later release"), 3-step explainer. Main CTAs: **Get the iPhone app** (`/download`) and **Use it on the web** (sign-in). Remove the design-preview strip and every demo link. |
| `/for-home` | `for-home` | Homeowners and anyone paying day or hourly workers directly. A partner can help on every plan, including Free. CTAs as above. |
| `/for-business` | `for-business` | What Business will do, plainly, and "Business workspaces aren't available yet." No sign-up, no price, no CTA into Business setup (`BUSINESS_ENABLED` is false). |
| `/how-it-works` | `how-it-works` | Create a workspace, add workers and the agreed rate, record each day, record payments you made yourself, share an honest receipt. Home saves directly; leave Business review out until B4. |
| `/pricing` | `pricing` | Free, Project Pass and Pro with the wording in section 9 and the US list prices from `web/src/site/prices.ts` (must match App Store Connect). "Paid plans are bought in the iPhone app. Apple shows the final price." Free includes statements, exports and a partner. No Business price. FAQ: records are never locked; workers and partners never pay; CrewTally never moves money. |
| `/download` | `download` | **Download on the App Store** linking to the `APP_STORE_URL` setting once set; until then the button reads "Coming to the App Store" with no link. "Already have an account? Sign in on the web." No link to the mobile preview. |
| `/help` | `help` | Topic search (in the page, no service), four guide cards, and a support card. |
| `/help/getting-started` | `help-start` | Home setup. "Sign in the same way on iPhone and the web (Apple or email code), or link your email in Account, and you'll see the same workspaces." |
| `/help/recording-work` | `help-work` | Home recording: Full, ½, Other, No work; blank means not recorded; corrections keep history and need a reason. The Business approvals content waits for B4. |
| `/help/payments-and-receipts` | `help-money` | Record only money you already paid outside CrewTally; split payments; reversals and corrections; receipts show each worker only their own amount; "I received this payment" and "I have a question"; "Not bank verified". |
| `/help/plans-and-access` | `help-billing` | Free, Pass, Pro; the organizer buys on iPhone; partners never pay; switching workspaces. |
| `/support` (and `/contact` → 301 to `/support`; `/api/support` → 301 too) | `contact` | The support email as a `mailto:` link, expected reply time (owner input), and links to help and `/delete-account`. No form. |
| `/privacy` | `privacy` | The privacy policy (below). `/api/privacy` redirects here. |
| `/terms` | `terms` | Terms of service (below). |
| `/delete-account` | — | Section 3. `/api/delete-account` redirects here. |

**Copy rules (tested by a whole-word, case-insensitive grep of user-facing text: the built website, `web/src` and `mobile/src` strings, and the translation files):** never "Unlimited", "payroll", "AI", "seamless", "magic", "effortless", "unlock", "empower"; never say CrewTally sends, moves, verifies or delivers money; Pro is "As many projects and workers as you need"; no Business price.

**Privacy policy and terms.** The Agent writes plain-language drafts from facts about this build only: what the apps collect (account email or Apple ID, display name, worker names and contact details the user enters, work and payment records, photos and PDFs, purchase status through Apple and RevenueCat), the processors (Replit hosting and storage, the email provider from Phase 1c, RevenueCat, Apple), no tracking, no ads, no data sold, the 30-day backup and log retention, deletion and export, worker data is third-party data, children (not directed at children under 13). Terms cover: CrewTally records payments and never moves money; it isn't tax, legal or accounting advice; subscriptions are billed by Apple and renew until cancelled; Apple's standard EULA applies to the app. Every legal detail comes from the owner inputs below; I approve the final text (and may have it reviewed) before release.

**Owner inputs (pasted with this phase; a build test fails if any is empty):**

| Input | Used on |
|---|---|
| Legal operator name (the company or person who runs CrewTally) | Privacy, Terms, footer, support |
| Mailing address for legal notices | Privacy, Terms |
| Support email address | Support, Privacy, Terms, delete-account page |
| Privacy contact email (can be the same) | Privacy |
| Expected support reply time | Support |
| Governing law (state) | Terms |
| Effective date of the policy and terms | Privacy, Terms |
| Email provider name (Resend or Postmark, as set up in Phase 1c) | Privacy |
| `APP_STORE_URL` (blank until the app is live; the only input allowed to be blank) | Download, `/go/app` |

### 12. Role matrix additions

| Route | Kind / action |
|---|---|
| `GET /v1/account/deletion-preview`, `POST /v1/account/delete/code`, `POST /v1/account/delete` | session |
| `POST /v1/workspace/export` | `export` |
| `POST /v1/plan/refresh` | `plan.manage` (`kinds: ['HOME']`; B4 adds the Business billing routes) |
| `GET /v1/plan` | `workspace.read` |
| `PATCH /v1/workspace` | `settings.edit` |
| `POST /v1/webhooks/revenuecat` | public |

`POST /v1/plan/refresh`: organizer 2xx; partner 403; Business roles 404 (kind); removed and outsider 404. `PATCH /v1/workspace` (not kind-limited): organizer and business owner 2xx; everyone else 403; removed and outsider 404. `export`: as in Phase 5.

### 13. Tests

**Database:** `13_deletion_jobs.sql`; every earlier file passes.

**Server**
- Deletion, organizer: seed workspace A (organizer U, partner P) and workspace B (organizer V, U as partner). U deletes: A and everything in it is gone, B and all its rows are intact (count every table before and after), U's B membership is REMOVED, U's B payments now show "Former member", P's next request to A → 404, V sees no change (T36).
- Deletion, partner: P deletes; A is untouched; P's membership is REMOVED.
- Re-authentication: stale Apple token, wrong `sub`, wrong email code, a SIGN_IN code instead of a DELETE code, missing confirm → 401 and nothing deleted. A DELETE code sent to `/v1/auth/email/verify` → 400 `CODE_WRONG`.
- Deletion revokes pending invitations addressed to the person's email: after deletion, a new account with that email can't accept them (410 or 400).
- Email-code purge: rows older than 24 hours go; newer rows stay (so deleting an account or waiting a few hours never resets the limits).
- Order: with mocks, Apple revoke is called with the right parameters **before** `delete_user_account`; a user with an `APP` and a `WEB` row gets two revoke calls, with the bundle ID and the Services ID as `client_id`; a revoke 500 → 503, nothing deleted, one `APPLE_REVOKE_FAILED` alert; `invalid_grant` → deletion goes ahead.
- Public pages: `/api/privacy`, `/api/support` and `/api/delete-account` → 301 to `/privacy`, `/support` and `/delete-account`.
- After deletion: old app bearer token and old web cookie → 401; deleting a ledger row of another workspace still fails.
- Cleanup job: objects under `ws/<id>/` removed; RevenueCat delete called with the workspace id (mocked); a failure retries and alerts once after 5 attempts.
- Export: the ZIP has every listed file; CSV amounts tie to the ledger; it uses the Phase 5 encoder (a `=` name is neutralised); a lead or worker → 403.
- Reconciliation job: clean fixture → no alerts; a corrupted fixture (direct insert in the test schema) → exactly one alert with ids only.
- Backup: refuses without `BACKUP_ENCRYPTION_KEY`; file name and 30-day retention logic unit-tested.
- Webhook: wrong or missing secret → 401; same event twice → one `entitlement_events` row; a renewal moves the expiry forward; an older out-of-order renewal doesn't shorten it; an expiration makes the free limits apply again and existing workers keep working (T57).
- Pass: purchase → one unused pass in `GET /v1/plan`; a project with it succeeds; a refund then blocks new workers over the free limit on that project while work for existing workers still succeeds (T58).
- Unknown `app_user_id` → 200, nothing written. Plan refresh (mocked RevenueCat) records the same state as the webhook; a second call writes nothing new; a partner → 403.
- Role matrix rows for every new route.

**Mobile:** reminders give the right 14 work-day dates for a Monday–Saturday project; DST cases; completion cancels that day; archive cancels all; leaving a workspace cancels its reminders; denied permission shows the in-app card (T32). RevenueCat configured with the workspace id only for `plan.manage`, never in sample mode; Plan shows store prices from a mocked offering (T59). Deletion clears local data. `SyncComplete` rule. A snapshot at the largest font scale for the Today card; labels on work options (T33).

**Web:** axe checks (no violations) on every web app page added in this phase and every website page; keyboard test for the deletion flow; the link-check crawl; the banned-words grep; the owner-inputs test; the partner sees no plan management links.

## Proof to paste at the gate
- Migration 0007 and its test.
- The account deletion handler (re-auth, Apple revoke, the transaction) and the cleanup job.
- The Apple revoke call.
- The reminder scheduling function.
- The nightly job and the `ops:alerts` script output on the dev database.
- The RevenueCat webhook mapping table with the docs link, and the restore-behaviour setting you chose with its docs link.
- Replit's point-in-time-restore findings with the link.
- The website route list, the link-check output and the banned-words grep output.
- Role matrix rows added and the pass count; test file names and counts for all four suites.

## Try it

**On your phone (Expo Go):**
1. Turn on reminders for a minute from now (temporarily allow a custom time; remove it before Phase 8). The notification shows no names. "Open day" opens Today on the right date.
2. Deny notifications in iPhone Settings. The app still works and shows the in-app card.
3. Export records and open the ZIP in Files.
4. As member-c (partner): Plan shows "owner-a manages the plan" and no buy buttons. Delete member-c's account: the preview says "You'll leave". owner-a's records are still there, showing "Former member".
5. As owner-a with a new partner: Delete account shows "<partner> will lose access". **Only with a test account:** delete it. You're back at the first screen; the partner's next tap shows Access removed.
6. Buy Pro in test mode; the Plan screen changes only after the server confirms.

**On the web:**
1. Settings, Profile, Appearance, Plan & billing and Data & records all work by keyboard alone.
2. Plan & billing says purchases happen on the iPhone and lists Free, Project Pass and Pro.
3. Open every website page at phone width and desktop width. No demo links, no "Unlimited", footer links work, `/delete-account` and `/support` read correctly.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 7 ready for review".
