# Phase 8 — Production, TestFlight pilot, App Store submission

## Goal

The API runs as a production deployment on Replit with its own database. The iPhone app is built and published through Replit's publish flow to TestFlight, piloted with real owners, and submitted to the App Store.

## Read first
- `APP_STORE_CHECKLIST_iOS.md` (in this pack; keep it open).
- Spec section 17 (release gates).
- Replit's docs for publishing a mobile app to TestFlight and the App Store. Follow Replit's current flow exactly; don't use EAS CLI on Replit.

## Build

### Domain for receipt links
- In the Replit deployment settings, connect `crewtallyapp.com` as a custom domain (add the DNS records Replit shows at your domain registrar) and confirm HTTPS works.
- The API serves `/api/r/:token` (receipt pages), `/api/go/app` and simple static pages at `/api/privacy`, `/api/support` and `/api/delete-account`; point crewtallyapp.com's `/r/*`, `/go/*`, `/privacy`, `/support` and `/delete-account` at them. Write those three pages in plain HTML now; App Store Connect needs their URLs.

### Production API
- Deploy `/server` as a Replit **Reserved VM** deployment. It's always on, so there are no cold starts for the phone.
- Set production Secrets:
  - `APP_ENV=production`
  - `APPLE_AUDIENCES=<bundle ID>` only
  - every Apple key
  - `TOKEN_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY`: new values, not the development ones
- Use the production database, never the development one.
- On deploy, run migrations as a separate step before the server starts. If any migration fails or a checksum changed, the deploy fails.
- Enable the nightly Scheduled Deployment from Phase 7 against production.
- The mobile app's production API URL comes from Expo config (`extra.apiUrl`), set per build profile. There are no hard-coded URLs in code.
- Add a production-only check: the API refuses to start if `APPLE_AUDIENCES` contains `host.exp.Exponent`, or if any required secret is missing.

### App configuration (`app.json` / `app.config.ts`)
- `name`: app name; `slug`; `version` `1.0.0`; `ios.buildNumber` `1`.
- `ios.bundleIdentifier`: your bundle ID. It can't change after the first upload.
- `ios.supportsTablet: false` (iPhone only at launch; runs on iPad in compatibility mode).
- `ios.usesAppleSignIn: true`.
- `ios.infoPlist`:
  - `NSCameraUsageDescription`: "Take photos of payment receipts and handover evidence."
  - `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
  - No photo library usage string, because the app uses the system picker. If Apple's build tooling requires one, use "Choose photos of payment receipts to attach to a payment."
- Notifications: the `expo-notifications` plugin with local notifications only. No push entitlement.
- App icon (1024×1024, no transparency) and a splash screen: plain, teal mark on white. Ask me for the icon file or propose a simple original mark. No text in the icon.
- Remove every development-only code path from production builds: dev-only aud handling, the temporary custom reminder time, and debug screens except Diagnostics.

### Release hardening
- Run the full suite. Run the smoke test against the **production** API with a test account created for review, and paste the results.
- **Performance** on your phone, with a project of 20 workers and 90 days of data seeded through the API in the test account:
  - Today opens in under 0.5 s from cache.
  - A tap shows "Saved" in under 150 ms.
  - Recording a payment takes under 2 s.

  Measure the timings and record the actual numbers in the gate notes.
- Crash reporting: none in Release 1 (it needs a native module outside the Expo SDK). Rely on server logs with correlation IDs.
- Restore rehearsal: run `scripts/restore_rehearsal.sh` against the latest production backup into a throwaway target, and paste the output.

### In-app purchase setup (you, before the first paid build)
1. App Store Connect → Business: sign the **Paid Apps** agreement; add banking and tax details.
2. Enroll in the **App Store Small Business Program** (developer.apple.com/app-store/small-business-program). The 15% rate starts about two weeks after approval, so do this early.
3. App Store Connect → CrewTally → Subscriptions: create group "CrewTally Pro" with `pro_monthly` ($7.99) and `pro_annual` ($49.99). In-App Purchases: create `project_pass` (Consumable, $24.99). Add a review screenshot and description to each.
4. Connect App Store Connect to RevenueCat (in-app purchase key), set the entitlement `pro` on both Pro products, and set the webhook URL to `https://crewtallyapp.com/api/v1/webhooks/revenuecat` with the `REVENUECAT_WEBHOOK_AUTH` value as the Authorization header.
5. Create a Sandbox tester account in App Store Connect → Users and Access.

### Purchase test in TestFlight (decides the Project Pass)
- Buy Pro monthly with the sandbox tester. The Plan screen shows Pro within a minute; the webhook row exists.
- Delete the app, reinstall, sign in, tap **Restore purchases**: Pro returns.
- Buy a Project Pass, create a second project with it, add five workers.
- Let the sandbox subscription expire (sandbox renewals are minutes long): recording work on existing workers still works; a new project shows the limit sheet.
- **If any Project Pass step fails and can't be fixed in this phase**, set `PROJECT_PASS_ENABLED=false` (server setting read by `GET /v1/plan`; the app hides the Pass everywhere), remove `project_pass` from the submission, and note the decision in the QA log. Launch with Free and Pro.

### Release gates, iPhone only
Apply spec section 17's release gates to iPhone only: ignore the Android phone and Play closed-test items. "Deletion on the web" means the `/delete-account` page explaining how to delete in the app or by emailing support.

### TestFlight pilot (at least 5 owners, 2 weeks, per spec release gates)
1. Publish through Replit's mobile publish flow to TestFlight.
2. Add testers: internal first, then external testers (the external group needs a short beta review by Apple).
3. The TestFlight "What to test" text: record a day, record a split payment, share a receipt, generate a statement, try Airplane Mode.
4. Collect issues in `docs/QA_LOG.md` with severity. Fix all Blocker and Major issues before submission.

### App Store submission
Complete every item in `APP_STORE_CHECKLIST_iOS.md`, then submit.

Review notes for Apple:
> "Sign in with Apple is the only sign-in method. The quickest way to see the app: after signing in, tap 'Look around first' to open a sample project with data (nothing is saved). To try it for real: create a project, add a worker with a daily rate, tap Full on the Today tab, then tap 'Pay what's owed'. The app records payments made outside the app; it does not move money. Account deletion: More → Account → Delete account. Plans: Free covers 1 active project and 3 workers; Pro and a one-time Project Pass are sold with in-app purchase from More → Plan, and every record stays available on every plan."

## Proof to paste at the gate
- The production deploy config.
- The production startup check.
- The `app.config` iOS section.
- The smoke test output against production.
- Measured performance numbers.
- Restore rehearsal output.
- The TestFlight build number.

## Try it on your phone
- Install from TestFlight (not Expo Go). Sign in with your real Apple ID. This is the production workspace.
- Run your real project for a few days before submitting.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 8 ready for review — ready to submit" and list anything still open.
