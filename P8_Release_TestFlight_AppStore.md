# Phase 8 — Release 1: production, domain, universal links, TestFlight pilot, App Store submission

> **Before pasting:**
> 1. Phase 7 passed its gate, and the TestFlight checkpoint (after Phase 2) is closed: real Sign in with Apple worked on your iPhone.
> 2. You have: the domain `crewtallyapp.com` at your registrar, the email provider account and sender address from Phase 1c, the RevenueCat account, and the final privacy policy and terms text you approved in Phase 7.
> 3. Pick a review email address you control (for example `review@crewtallyapp.com`). You'll add it as a Secret in section 6.

## Goal

Release 1 goes live: the API, the web app and the website run in production on `crewtallyapp.com`; the iPhone app is published through Replit to TestFlight, piloted with real owners, and submitted to the App Store.

This phase also checks, on the production deployment, the **per-client-IP rate limiting behind Replit's proxy** that Phase 1c built.

Business stays off: `BUSINESS_ENABLED=false` in production.

## Read first
- `APP_STORE_CHECKLIST_iOS.md` (keep it open) and `GATE_CHECKLIST_AND_QA_LOG.md`.
- `docs/CrewTally_Design_Baseline_2.0.md`: section 3 "Release scope", section 6 "Sign-in and first run", section 9 "Account deletion", section 13 "Website", section 19 "Things to confirm before building".
- `docs/CrewTally_Native_App_Design_v1.4.md`: section 16 (performance, operations) and section 17 "Release gates".
- Replit's current docs for: deploying a project with several artifacts (API, web, mobile), custom domains, path routing, Scheduled Deployments, and publishing a mobile app to TestFlight and the App Store. Follow Replit's flow exactly; don't use EAS CLI on Replit. Paste the links you used.

## Build

### 1. Production deployments
- Deploy the **API** as an always-on deployment (Reserved VM or what Replit's docs now recommend for an always-on API), with the **production** database, never the development one.
- Deploy the **web artifact** (website + web app) in the same publish, as Replit's multi-artifact flow does it.
- Migrations run as a separate step before the API starts. Any failed migration or changed checksum fails the deploy.
- Production Secrets (new values, never the development ones): `APP_ENV=production`, `APPLE_AUDIENCES=com.crewtallyapp.crewtally` (the iPhone route only), `APPLE_WEB_SERVICES_ID` and `APPLE_WEB_RETURN_URL=https://crewtallyapp.com/app/auth/apple` (the web route only, Phase 1c), every Apple key, `TOKEN_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `CODE_PEPPER` (a new production value; changing it later makes every pending code and invitation code stop working), `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `WEB_ORIGINS=https://crewtallyapp.com`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`, `BUSINESS_ENABLED=false`, `PUBLIC_BASE_URL=https://crewtallyapp.com`, `APP_STORE_URL` (blank until the app is live). Web session and CSRF tokens are random per session (Phase 1c); they need no Secret.
- **Making secret values (you, in the Shell):** for each of `TOKEN_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY` and `CODE_PEPPER`, run `openssl rand -base64 32` in the Shell, paste the result into the production Secrets, then clear the Shell. Never ask the Agent to generate a secret value in chat. Reuse the production `TOKEN_ENCRYPTION_KEY` from the TestFlight checkpoint if you made one there (changing it makes stored Apple tokens unreadable).
- **Production startup check:** the API refuses to start if `APPLE_AUDIENCES` contains `host.exp.Exponent`, if `DEV_SIGNIN_CODE` is set, if `BUSINESS_ENABLED` isn't `false`, or if any required Secret is missing. Paste the check.
- Turn on the nightly Scheduled Deployment from Phase 7 against production.
- The mobile app's API URL comes from Expo config (`extra.apiUrl`) per build profile. No hard-coded URLs.

### 2. Per-client-IP rate limits behind Replit's proxy (check in production)

Phase 1c built this on the dev URL. Every rate limit keyed by IP (invitation peek, email codes, Apple and email sign-in, `/api/r`, `/api/go`, exports) must count the real client on the production deployment too.
- Check the hop count on the deployed API the same way Phase 1c did: a temporary diagnostic that logs only the **number** of entries in `X-Forwarded-For` (never the addresses); read it, then remove it. If it differs from development, make `trust proxy` read the hop count from a setting (a number, never `true`) and set it per deployment.
- Keep the Phase 1c tests green, and add: the 31st `/api/r` request in a minute from one client → 429, while another client is still served.
- From two different networks (say, phone on cellular and a laptop on Wi-Fi), ask for email codes: each gets its own limit.
- Paste the production hop count and how you found it.

### 3. Domain and forwarding

Connect `crewtallyapp.com` as the custom domain (add the DNS records Replit shows at your registrar) and confirm HTTPS.

Only paths under `/api` reach the API artifact; everything else goes to the web artifact. These public paths must work on `crewtallyapp.com`:

| Public path | Served by | How |
|---|---|---|
| `/r/:token` | API `/api/r/:token` | Forward (below) |
| `/r/:token/ack` (POST) | API `/api/r/:token/ack` | Not needed: the public page's forms post to the absolute `/api/r/<token>/ack` path, so no POST is ever redirected (check the form `action` in the HTML) |
| `/join/:token` | API `/api/join/:token` | Forward |
| `/go/app` | API `/api/go/app` | Forward |
| `/privacy`, `/terms`, `/support`, `/delete-account` | The website (web artifact, Phase 7) | Website pages. Not forwarded. Phase 7 already made the API's `/api/privacy`, `/api/support` and `/api/delete-account` 301 redirects to these pages; check them here too. |
| `/.well-known/apple-app-site-association` | Web artifact, static | Section 4 |

**Forwarding.** Only `/r/*`, `/join/*` and `/go/*` are forwarded to the API; nothing else. First choice: Replit's path routing sends `/r`, `/join` and `/go` straight to the API artifact (confirm Replit supports adding these paths to the API artifact; paste the doc link). If it doesn't, the web artifact's production server answers those three paths with a **308** redirect to the same path under `/api`, with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, done on the server, never with client-side JavaScript. Tokens are never logged by either artifact.

Then set `PUBLIC_BASE_URL=https://crewtallyapp.com`, so new receipt links are `https://crewtallyapp.com/r/<token>` and invitation links `https://crewtallyapp.com/join/<token>`.

**Sign in with Apple on the web, production (carried from Phase 1c; owner, with the Agent's help):** in the Services ID `com.crewtallyapp.crewtally.web`, make sure `crewtallyapp.com` and the return URL `https://crewtallyapp.com/app/auth/apple` are registered; if Apple asks for domain verification, download the file from Apple. It must be served at the root: `https://crewtallyapp.com/.well-known/apple-developer-domain-association.txt` (not under `/app`). In production the website (web artifact) serves the root, so upload the file where the Agent tells you in the website's static files; the Agent confirms with `curl -i` that this exact URL returns it with status 200. Then click **Verify**. Then sign in with Apple on `https://crewtallyapp.com/app/signin`.

Check every row with `curl -i` against the production domain and paste the output (status, `Location` where there is one, and the security headers on `/r`).

### 4. Universal links for `/join` and `/r`

- App config: `ios.associatedDomains: ["applinks:crewtallyapp.com"]`.
- The web artifact serves `/.well-known/apple-app-site-association` as `application/json`, with no redirect and no file extension:

```json
{ "applinks": { "details": [ {
    "appIDs": ["YLS52NH2N3.com.crewtallyapp.crewtally"],
    "components": [ { "/": "/join/*" }, { "/": "/r/*" } ]
} ] } }
```

- In the app:
  - `/join/<token>` opens the Join flow with the token: peek (workspace name and role only), sign in if needed, then accept (`POST /v1/invite/accept`). Expired or used → `InviteExpired`.
  - `/r/<token>` opens the public receipt page **in the in-app browser** (`expo-web-browser`) at `https://crewtallyapp.com/api/r/<token>` (the `/api` path, so iOS doesn't route it back to the app). No session, no API call from the app, no sign-in needed. A worker without the app gets the same page in Safari.
  - Never log the token.
- Test on the TestFlight build: tap a `/join` link and a `/r` link in Notes and in Messages.

### 5. App configuration (`app.config.ts`)
- `name: "CrewTally"`, `slug`, `version: "1.0.0"`, `ios.buildNumber` (increases with every upload).
- `ios.bundleIdentifier: "com.crewtallyapp.crewtally"` (can't change after the first upload).
- `ios.supportsTablet: false`, `ios.usesAppleSignIn: true`, `ios.associatedDomains` as above.
- `ios.infoPlist`: `NSCameraUsageDescription`: "Take photos of payment receipts and handover evidence."; `ITSAppUsesNonExemptEncryption: false`. No photo library string (the system picker needs none); if Apple's tooling requires one: "Choose photos of payment receipts to attach to a payment."
- `expo-notifications` plugin, local notifications only, no push entitlement.
- **Icon:** `docs/App-Icon-1024.png` (the approved 2.0 icon: 1024×1024, RGB, no transparency). Use it as is. Splash: plain, the icon mark on the background colour `#f6f8f5`, with a dark-mode variant (`#11201c`).
- Remove every development-only path from production builds: dev sign-in, the temporary custom reminder time, any debug screen except Sync & recovery.

### 6. Release build hygiene (tests that must pass)

**No dev sign-in, no demo code:**
- Server: with `APP_ENV=production`, the route table has no `/v1/auth/dev`, and `POST /v1/auth/dev` → 404 (test).
- Mobile: with the production config, `AccountSignIn` doesn't render "Developer sign-in" (component test). After `npx expo export --platform ios` with the production profile, a script greps the bundle for `Developer sign-in`, `auth/dev`, `owner-a`, `member-c` and fails on any hit.
- Web: after `vite build`, a script greps `dist/` for `demo`, `Design preview`, `Reset sample`, `mobile-preview`, `role switcher` and the demo role labels; the router has no `/demo` or `/design` route, and both return the not-found page (test).
- Website: the Phase 7 link-check and banned-words tests run against the production build.
- One command runs all of these: `npm run test:release`. It's part of the gate from now on.

**Review account for App Review (email code).** This is the only sign-in exception in the build (spec section 6.1), and it exists for App Review in production only:
- Secrets `REVIEW_EMAIL` and `REVIEW_CODE` (6 digits, not used anywhere else). Make the code in the Shell: `python3 -c "import secrets; print(f'{secrets.randbelow(10**6):06d}')"`, paste it into Secrets, then clear the Shell.
- In the email sign-in start route only, and only when `APP_ENV=production` (tests set it explicitly): when the address equals `REVIEW_EMAIL` exactly and both Secrets are set, use `REVIEW_CODE` as the code (hashed and stored through `issue_email_code` like any code) and **don't send an email**. Verification is unchanged. The usual rate limits apply. Log only `review_sign_in=issued` with the request id.
- With either Secret missing, or outside production, the address behaves like any other (test each). The code never appears in logs or responses (test).
- `npm run test:release` also asserts that developer sign-in is absent from the release build (the server, mobile and web checks above) whatever the review Secrets are.
- Seed the review account through the API (never direct SQL): one Home workspace "Review home", a project with two daily workers and one hourly worker with rates, a week of recorded days with one unrecorded day, a split payment, a cash payment with a hand-over signature, and a texted receipt link. Fictional names and amounts only.
- Remove both Secrets after approval (and rotate `REVIEW_CODE` if you need them again).

### 7. Release hardening
- Run every suite plus `npm run test:release`. Run the smoke test against **production** with the review account and paste the results.
- **Performance** on your phone, with 20 workers and 90 days of data in a test workspace (seeded through the API): Today opens in under 0.5 s from cache; a tap shows "Saved" in under 150 ms; recording a payment takes under 2 s. On the web: the dashboard and Reports → Summary load in under 2 s on a normal connection. Record the measured numbers.
- No crash-reporting SDK in Release 1. Rely on server logs with correlation ids.
- Restore rehearsal: `scripts/restore_rehearsal.sh` against the latest production backup into a throwaway target; paste the output.
- **Database role for the API (confirm before building; spec section 19, C21).** Check whether Replit's PostgreSQL lets you create a second, non-owner role. If it does: the production API connects as `crewtally_app`, which has EXECUTE on the functions listed in invariant 2 (and the read functions the routes use), SELECT where routes read, and **no** INSERT, UPDATE or DELETE on the protected tables (invariant 2, spec section 15.3); migrations still run as the owner. A test connects as `crewtally_app` and asserts a direct `insert into payments` and `delete from ledger_events` are refused. If Replit doesn't allow it, don't work around it: record "API runs as the database owner; protected-table rules are enforced by code review and tests only" as an accepted risk in `docs/QA_LOG.md` and tell me at the gate.

### 8. In-app purchase setup (you, before the first paid build)
1. App Store Connect → Business: sign the **Paid Apps** agreement; add banking and tax details.
2. Enroll in the **App Store Small Business Program** (15%; it starts about two weeks after approval, so do it early).
3. App Store Connect → CrewTally → Subscriptions: group "CrewTally Pro" with `pro_monthly` ($7.99) and `pro_annual` ($49.99). In-App Purchases: `project_pass` (Consumable, $24.99). A review screenshot and description for each. (Business products come in B4, in their own group; confirm Apple's subscription-group rules then.)
4. Connect App Store Connect to RevenueCat (in-app purchase key); entitlement `pro` on both Pro products; webhook URL `https://crewtallyapp.com/api/v1/webhooks/revenuecat` with the `REVENUECAT_WEBHOOK_AUTH` value as the Authorization header; the restore behaviour chosen in Phase 7.
5. A Sandbox tester in App Store Connect → Users and Access.

### 9. Purchase test in TestFlight (decides the Project Pass)
- As the organizer, buy Pro monthly with the sandbox tester. Plan shows Pro within a minute; the webhook row exists.
- Delete the app, reinstall, sign in, **Restore purchases**: Pro returns to the same workspace.
- Create a second Home workspace and tap **Restore purchases** there: the subscription stays with the first workspace.
- Sign in as the partner: no buy or restore buttons; the web billing page says the organizer manages the plan.
- Buy a Project Pass, create a second project with it, add five workers.
- Let the sandbox subscription expire: recording work and payments on existing workers still works, on iPhone and web; a new project shows the limit sheet.
- **If any Project Pass step fails and can't be fixed in this phase**, set `PROJECT_PASS_ENABLED=false` (the app and web hide the Pass), remove `project_pass` from the submission, and note it in the QA log. Launch with Free and Pro.

### 10. Release gates (iPhone, web and website)
Spec 1.4 section 17's gates, applied to Release 1 (ignore Android and Play items):
- All money, role matrix, isolation, idempotency and no-signal tests pass; the no-signal checks on a real iPhone.
- No open Blocker or Major security or balance defect.
- Reconciliation job running against production with zero mismatches for 7 days.
- Restore rehearsed.
- Account deletion works in the app, on the web, and as described on `/delete-account`, including the partner cases.
- Privacy policy, App Privacy details and the build agree.
- The web app passes the Phase 7 accessibility checks at 390, 768 and 1440 px, by keyboard and with a screen reader (VoiceOver on Mac or NVDA).
- Every website page is live, links resolve, and no demo route exists.
- Universal links work from Notes and Messages on the TestFlight build.
- TestFlight pilot complete (below).

### 11. TestFlight pilot (at least 5 owners, 2 weeks)
1. Publish through Replit's mobile flow to TestFlight. Internal testers first, then external (Apple runs a short beta review).
2. At least two owners invite a partner, and at least two use the web app as well as the phone.
3. "What to test": record a day, record a split payment, text a receipt, generate a statement, invite a partner, try Airplane Mode, open the same workspace on the web.
4. Log issues in `docs/QA_LOG.md` with severity. Fix every Blocker and Major before submission.

### 12. Store assets
Recapture everything from the 2.0 production build, with the review account's fictional data; never use the design-pack drafts. Screenshots at the sizes App Store Connect asks for at upload time: Today, Record payment, Worker detail with the balance breakdown, Receipt (worker view), Statement, Partner invite. The icon is `docs/App-Icon-1024.png`. No "Unlimited", "payroll", "AI" or claims of verification anywhere in the listing or screenshots.

### 13. App Store submission
Complete every item in `APP_STORE_CHECKLIST_iOS.md`, then submit.

Review notes for Apple:
> "CrewTally keeps a record of work and of payments the user makes outside the app. It does not move money. Sign-in: Sign in with Apple, or an email code. To review with data, choose 'Get started', then 'Continue with email', enter <REVIEW_EMAIL> and the code <REVIEW_CODE>. This account has a sample Home workspace with workers, recorded days and payments. Try: Today tab → tap Full for a worker; Payments → Record a payment you already made; open a payment → Receipt. Before signing in, 'Try the Home sample' shows sample data without an account (nothing is saved). Account deletion: More → Account → Delete account (it deletes the person's workspaces; a partner who deletes only leaves). Plans: Free covers 1 active project and 3 workers; Pro and a one-time Project Pass are in-app purchases under More → Plan, available to the workspace organizer. Every record stays available on every plan."

Also put `REVIEW_EMAIL` and `REVIEW_CODE` in App Store Connect → App Review Information → "Sign-in required" (user name and password fields), and the contact phone and email for the reviewer there too.

## Proof to paste at the gate
- The production deploy configuration for each artifact, and the production startup check.
- The production rate-limit check: the hop count, how you found it, the `trust proxy` setting and the tests.
- The database-role result: the `crewtally_app` grants and test, or the accepted-risk line in the QA log.
- `curl -i` output for every row of the domain table and for the AASA file.
- The `app.config.ts` iOS section.
- `npm run test:release` output.
- The review sign-in code path and its tests.
- The smoke test output against production; measured performance numbers; the restore rehearsal output.
- The TestFlight build number.

## Try it
- Install from TestFlight (not Expo Go). Sign in with your real Apple ID, then on the web with the same account (Apple, or an email you linked). Same workspaces.
- Text yourself a receipt; tap the link in Messages: the receipt page opens.
- Send yourself a partner invitation link and tap it on a second phone with the TestFlight build: the Join flow opens.
- Run your real project for a few days before submitting.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase 8 ready for review — ready to submit" and list anything still open.
