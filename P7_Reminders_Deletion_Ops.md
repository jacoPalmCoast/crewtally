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
     - write a row to a new `deletion_jobs(id, workspace_id, requested_at, completed_at)` table (migration `0004`).
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
  - CSVs for projects, workers, assignments, agreements, work entries (with revisions), payments, allocations, reversals, reimbursements and adjustments;
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
  1. **Reconciliation.** For every assignment, recompute the balance from sources (the query at the end of `db/tests/04_reimb_adj_rest_rates.sql`) and compare it with `assignment_balances`. For every payment, check that allocations equal the amount and reversals never exceed allocations. Any mismatch logs `RECONCILIATION_MISMATCH` with ids only, and sends an alert. The alert channel is an email to the owner-operator through a transactional email provider using a Replit Secret; if none is configured, write to an `ops_alerts` table (migration `0004`) and show a banner in Diagnostics.
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
