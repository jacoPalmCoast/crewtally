# Phase 7 — Reminders, account deletion, data export, accessibility, diagnostics, nightly jobs

## Goal

Everything Apple checks and everything that keeps the data safe:
- local daily reminders,
- in-app account deletion that revokes Sign in with Apple,
- full data export,
- an accessibility pass,
- a diagnostics screen,
- nightly reconciliation and backup jobs.

## Read first
- `docs/screens/Reminders.png`, `Account.png`, `DeleteAccount.png`, `Diagnostics.png`, `Plan.png`, `PlanPro.png`, `LimitSheet.png`.
- Spec section 10 (reminders), section 15 (account deletion, export, retention, permissions) and section 16 (monitoring, backups, diagnostics).
- Apple: "Offering account deletion in your app" (apps using Sign in with Apple must revoke tokens with the Sign in with Apple REST API), and the `POST https://appleid.apple.com/auth/revoke` endpoint.

## Build

### Reminders (local only, `expo-notifications`)
- Settings screen: More → Reminders. Controls:
  - on/off per project
  - time (default 6:00 pm; must be confirmed by tapping Save)
  - "Remind on this phone"
- Store preferences in `reminder_preferences` through `PUT /v1/projects/:id/reminders`, scoped. The `device_installation_id` is a random UUID generated once and kept in secure storage.
- **Permission flow:**
  1. Show an explainer card first: "Get a nudge at 6:00 pm on work days to record the day and review payments."
  2. Then request permission.
  3. If denied: keep the app fully usable, show an in-app reminder card on Today after the chosen time when the day isn't complete, and show an "Open Settings" link (`Linking.openSettings()`).
- **Scheduling:**
  - Schedule dated one-off notifications for the next 14 **work days**, in the project timezone, at the chosen time. Use calendar date triggers built from project-timezone wall time.
  - Refresh on app launch, foreground, settings change, timezone change and project archive.
  - Cancel and reschedule by a stable identifier `rem:<project_id>:<YYYY-MM-DD>`.
  - Stay well under iOS's limit of 64 pending notifications: 14 per project, and at most 3 projects with reminders on. Show a message if the owner tries a fourth.
- **Content:** title "Record today's work", body "Record today's work and review payments." No names, amounts or addresses. Actions:
  - **Open day** deep-links to Today for that project and date, even after midnight.
  - **Remind me in 1 hour** schedules a one-off for the same date.
- **Completion:** when the day becomes complete on this phone (all assignments recorded and payments reviewed), cancel that day's reminder.
- **DST:** a nonexistent local time moves to the next valid minute; a repeated time fires once. Unit-test both with an `America/New_York` project around 8 March 2026 and 1 November 2026.
- Archiving a project cancels its reminders.

### Account deletion (Apple requirement)
- More → Account → **Delete account**.
  1. An explainer screen lists what happens:
     - all projects, workers, payments, receipts, statements and photos are deleted from our servers;
     - PDFs you already shared can't be recalled;
     - backups age out within 30 days.
  2. The owner types "DELETE" and confirms with Sign in with Apple again (a fresh identity token).
- `POST /v1/account/delete` with the fresh token:
  1. Verify the fresh token (same `sub`).
  2. **Revoke Apple tokens**: `POST https://appleid.apple.com/auth/revoke` with `client_id` = bundle ID, the client secret JWT, the stored refresh token, and `token_type_hint=refresh_token`. Log only the HTTP status. In development with no stored token, skip and log `apple_revoke=skipped_dev`.
  3. In one transaction:
     - revoke all sessions;
     - set `users.deleted_at`;
     - write a row to a new `deletion_jobs(id, workspace_id, requested_at, completed_at)` table (migration `0006`). `deletion_jobs.workspace_id` and `ops_alerts` have **no** foreign keys, so deleting the workspace neither fails nor removes the job row.
  4. Return 202.
- **Deletion job** (runs in the nightly scheduled job, and immediately in the background after the request):
  - Calls `delete_workspace_data(workspace_id)` (provided in `db/schema.sql` and tested in `db/tests/05_account_deletion.sql`). It is the **only** path that deletes financial rows. It allows ledger deletes for that one workspace, inside that one transaction only.
  - Then, in the same transaction, deletes the auth rows the app owns: `sessions`, `apple_credentials` and `users`.
  - Then deletes the workspace's objects under `ws/<workspace_id>/`.
  - Then marks the `deletion_jobs` row complete.
  - Never disable the ledger trigger or change `session_replication_role`.
- The mobile app clears secure storage, the local SQLite database and scheduled notifications, then returns to sign-in.
- A public web page at `https://crewtallyapp.com/delete-account` explains how to delete (in the app, or by email). You'll host that with your support page.

### Data export
- More → Account → **Export my data**. `POST /v1/account/export` builds a ZIP:
  - CSVs for projects, workers (with skills, favorite and private note), assignments, agreements, ratings, work entries (with revisions), payments, allocations, reversals, reimbursements and adjustments;
  - the ledger;
  - receipt and statement snapshots as JSON;
  - evidence files.
- Stream it to the device, then open the share sheet. Scoped to the workspace.

### Diagnostics
- More → Diagnostics shows:
  - app version and build, API status, last successful refresh time;
  - pending queue count, Needs review count;
  - a support ID (the workspace id's first 8 characters).
- Buttons:
  - **Send now** (flushes the queue).
  - **Export pending entries** (a JSON file of HELD, PENDING and REJECTED ops, through the share sheet).
- Warning text: "Uninstalling the app removes entries that haven't been sent."

### Nightly jobs (Replit Scheduled Deployment)
- `server/src/jobs/nightly.ts`, run as a Replit Scheduled Deployment at 03:15 UTC.
  1. **Reconciliation.** For every assignment, recompute the balance from sources (the query at the end of `db/tests/04_reimb_adj_rest_rates.sql`) and compare it with `assignment_balances`. For every payment, check that allocations equal the amount and reversals never exceed allocations. Any mismatch logs `RECONCILIATION_MISMATCH` with ids only, and sends an alert. The alert channel is an email to the owner-operator through a transactional email provider using a Replit Secret; if none is configured, write to an `ops_alerts` table (migration `0006`) and show a banner in Diagnostics.
  2. **Backup.** `pg_dump` the production database (custom format), encrypt it with `BACKUP_ENCRYPTION_KEY`, and write it to Object Storage at `backups/YYYY-MM-DD.dump.enc`. Keep 30 days and delete older backup files; that's the only deletion this job does. Record the size and checksum.
  3. **Deletion jobs:** process any pending ones.
- **Restore rehearsal script** `scripts/restore_rehearsal.sh`:
  1. Restore the latest backup into a **new, throwaway database or schema**, never production.
  2. Run the reconciliation there.
  3. Print the counts.
  4. Refuse to run if the target looks like production.

  Document the steps in `docs/RESTORE.md`.
- Confirm what point-in-time restore Replit's production database offers. Paste what you find from Replit's docs, with the link, in the gate notes. The nightly backup stays either way.

### Accessibility pass (WCAG 2.1 AA)
- Every tappable control has an accessibility role and label. Work options read like "Worker A, full day, selected". Amounts read in full.
- Saves, Undo, errors and "Pending" are announced with `AccessibilityInfo.announceForAccessibility`.
- At the largest Dynamic Type size, work options wrap to two rows and amounts move under names. Check Today, Record payment, Worker detail, Receipt and Statement.
- Contrast: body text at least 4.5:1, icons and borders at least 3:1, in both light and dark.
- Reduce Motion is respected; there is no decorative motion anyway.
- Minimum touch target is 44 pt everywhere.

### Tests
- **Reminders:** scheduling produces the correct 14 work-day dates for a project with Monday–Saturday work days. DST cases. Completion cancels that day's reminder. Archive cancels all. Denied permission shows the in-app card.
- **Account deletion:**
  - A stale identity token or wrong `sub` returns 401.
  - Deletion revokes sessions (the old token gets 401).
  - The job removes every row for that workspace and **no rows from another workspace**: seed two workspaces, delete one, and count everything.
  - Apple revoke is called with the right parameters (mocked).
  - After a deletion, deleting a ledger row of another workspace still fails. `db/tests/05_account_deletion.sql` covers the database side; add the API-level version.
- **Export:** the ZIP contains every listed file, and the CSV amounts tie to the ledger.
- **Reconciliation job:** a clean fixture produces no alerts; a corrupted fixture (a direct insert in the test schema) produces exactly one alert.
- **Backup:** the job refuses to run if `BACKUP_ENCRYPTION_KEY` is missing, and the file name and retention logic are unit-tested.
- **Accessibility:** a snapshot test at the largest font scale for the Today card; labels are present on work options.

## Additions in baseline 1.3 (build these in this phase)

### Selling plans with Replit's RevenueCat integration
Use Replit's built-in RevenueCat integration (ask for it as "add subscriptions with RevenueCat"). It's the one allowed native module outside the Expo SDK. Tell me the steps it needs from me; I create the RevenueCat account and connect App Store Connect myself. Secrets I add in Replit Secrets: `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_SECRET_API_KEY`. The public iOS SDK key can live in app config.

**Products (App Store Connect, created by me in Phase 8; use these ids now):**

| Product id | Type | Price | Grants |
|---|---|---|---|
| `pro_monthly` | Auto-renewable, group "CrewTally Pro" | $7.99 | RevenueCat entitlement `pro` |
| `pro_annual` | Auto-renewable, same group | $49.99 | `pro` |
| `project_pass` | Consumable | $24.99 | No entitlement; each purchase adds one pass on our server |

**Mobile**
- Configure RevenueCat after sign-in with **app user id = workspace id**. Never the Apple ID, email or name. Log out of RevenueCat at sign-out. Never configure it in sample mode.
- Plan screen (from Phase 2) gains:
  - **Pro monthly**, **Pro yearly** and **Project Pass** buttons. Prices and periods come from the store through RevenueCat offerings; never hard-code prices in the app.
  - Each option shows what it includes, and the subscription options state that they renew automatically until cancelled.
  - **Restore purchases**, **Manage subscription** (opens `https://apps.apple.com/account/subscriptions`), and links to the privacy policy and terms of use.
- After any purchase or restore, call `POST /v1/plan/refresh`, then reload `GET /v1/plan`. The app shows only what the server says.
- From the limit sheet, choosing **Project Pass** buys it, refreshes the plan, then retries the blocked action with the new `pass_id`.
- In Expo Go, RevenueCat runs in its test mode (simulated purchases). Label that state in Diagnostics as "Purchases: test mode".

**Server**
- `POST /v1/webhooks/revenuecat` (public at `/api/v1/webhooks/revenuecat`; no session: add it to the `requireSession` and route smoke-test exception lists):
  - Check the `Authorization` header against `REVENUECAT_WEBHOOK_AUTH` with a constant-time compare; otherwise 401.
  - Parse with zod. Map RevenueCat event types to `record_entitlement_event` types: purchases, renewals, product changes and un-cancellations of `pro_*` → `PRO_ACTIVE` with the expiry; expirations and refunds of `pro_*` → `PRO_EXPIRED`; a `project_pass` purchase → `PASS_PURCHASED` with its store transaction id; a `project_pass` refund → `PASS_REFUNDED`. Cancellation (auto-renew turned off) changes nothing until expiry.
  - **Check every event type and field name against RevenueCat's current webhook documentation**, and paste the mapping table at the gate with the doc link. Don't guess field names.
  - Event id → `p_event_id` (idempotent). `app_user_id` must be an existing workspace; if not, return 200 and log `ignored_unknown_workspace` (ids only).
  - Log event id, type and status only. Never amounts, prices, names or emails.
- `POST /v1/plan/refresh` (session): read the customer from RevenueCat's REST API for this workspace and record the current state with `record_entitlement_event`, using stable synthetic event ids (for example `refresh:pro:<original_transaction_id>:<expires_ms>` and `refresh:pass:<transaction_id>`). Rate-limit to 10 per minute per workspace.
- Account deletion: add to the explainer "Deleting your account doesn't cancel an App Store subscription. Cancel it in Settings → your name → Subscriptions," with a **Manage subscription** button. The deletion job also deletes the RevenueCat customer through its API; if that call fails, log the status and continue.

### Tests
- Webhook: wrong or missing secret → 401; the same event twice → one `entitlement_events` row; a renewal moves the expiry forward; an out-of-order older renewal doesn't shorten it; an expiration makes the free limits apply again (T57).
- Pass: purchase event → one unused pass in `GET /v1/plan`; creating a project with it succeeds; a refund event then blocks new workers over the free limit on that project, while existing work entry still succeeds (T58).
- Unknown `app_user_id` → 200 and nothing written.
- Plan refresh with RevenueCat's API mocked: records the same state as the webhook; a second call writes nothing new.
- Mobile: RevenueCat is configured with the workspace id, never in sample mode; the Plan screen shows store prices from a mocked offering and no hard-coded prices (T59).

### Test ID tags
- Reminders behaviour (denied permission, DST shift, travel, reboot, snooze) is T32.
- The accessibility pass (every primary action reachable and announced at the largest text size and with VoiceOver) is T33.
- Account deletion in the app and the `/delete-account` page, with sessions and links revoked, is T36.
- The restore rehearsal (restored data reconciles; replayed requests post nothing twice) is T38.

## Proof to paste at the gate
- The account deletion handler.
- The deletion job code that calls `delete_workspace_data`.
- The Apple revoke call.
- The reminder scheduling function.
- The nightly job.
- The Replit database point-in-time-restore findings.

## Try it on your phone
- Turn on reminders for 1 minute from now (temporarily allow a custom time). The notification shows no names. "Open day" opens Today on the right date.
- Deny notifications in iPhone Settings. The app still works and shows the in-app card.
- Export my data and open the ZIP in Files.
- **Only with a test Apple ID:** delete the account. You're returned to sign-in, and signing in again starts fresh.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 7 ready for review".
