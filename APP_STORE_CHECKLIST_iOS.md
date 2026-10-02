# App Store checklist (iPhone, Release 1, baseline 2.0)

Apple's requirements were last checked for baseline 1.4 on 24 September 2026 and haven't been rechecked for 2.0. Recheck everything in the week you submit; Apple changes these.

## Accounts and identity
- [ ] Apple Developer Program membership active. Individual is fine to start; the seller name shows as your name.
- [ ] Bundle ID `com.crewtallyapp.crewtally` registered and matching `ios.bundleIdentifier`. It can't change later.
- [ ] Sign in with Apple capability enabled for the App ID, and the **Services ID** for Sign in with Apple on the web set up (Phase 1c) with `crewtallyapp.com` as its domain and return URL. If Apple asked for domain verification, `https://crewtallyapp.com/.well-known/apple-developer-domain-association.txt` (at the root, not under `/app`) returns the file (Phase 8 `curl` check).
- [ ] Sign in with Apple key (.p8); Key ID and Team ID stored as Replit Secrets.
- [ ] **Associated Domains** capability enabled for the App ID; `applinks:crewtallyapp.com` in the app config; the `apple-app-site-association` file served from `https://crewtallyapp.com/.well-known/` (Phase 8).
- [ ] Paid Apps agreement signed; banking and tax details complete.
- [ ] App Store Small Business Program approved (15% commission).

## Sign-in
- [ ] Two ways to sign in: **Sign in with Apple** and **email code**. Both work on a TestFlight build and on the web, and lead to the same account once linked. Linking works both ways (Account → Add email sign-in, and Add Sign in with Apple).
- [ ] Sign in with Apple is offered wherever email sign-in is, so Apple's login-services rule is met. Email code is CrewTally's own sign-in, not a third-party login.
- [ ] Sign-in never creates a workspace by itself; a new person chooses Home or Join a team.
- [ ] No developer sign-in in the build (`npm run test:release` passed). The review account (`REVIEW_EMAIL` + `REVIEW_CODE`) is the only sign-in exception, production only, and is removed after approval.

## In-app purchases
- [ ] `pro_monthly`, `pro_annual` (subscription group "CrewTally Pro") and `project_pass` (consumable) created, priced, with review screenshots, and attached to the version being submitted. Drop `project_pass` if the TestFlight purchase test failed.
- [ ] Plan screen shows price, period, what's included, that subscriptions renew automatically until cancelled, links to the **Terms of use** (Apple's standard EULA) and the **Privacy policy**, and **Restore purchases**.
- [ ] Only the workspace organizer sees buy, restore and manage. A partner sees who manages the plan and never sees checkout.
- [ ] The iPhone app doesn't point people to the website to pay.
- [ ] Buying, restoring (to the same workspace only), expiry and the Project Pass tested in TestFlight with a sandbox tester.
- [ ] Deleting the account says it doesn't cancel an App Store subscription and links to manage it.
- [ ] Records stay readable and usable after a subscription expires: existing workers keep getting work and payments recorded.
- [ ] No "Unlimited" anywhere. Pro is "As many projects and workers as you need."

## Build
- [ ] Built with the Xcode and iOS SDK versions Apple currently requires for uploads (Xcode 26 / iOS 26 SDK as of 28 April 2026; check again). Replit's publish flow builds it; confirm the SDK in App Store Connect's build details.
- [ ] Version 1.0.0; build number increases with every upload.
- [ ] iPhone only (`supportsTablet: false`).
- [ ] No development code paths in the production build: no dev sign-in, no Expo Go audience, no debug screens except Sync & recovery, no temporary reminder time, no demo or design routes.
- [ ] Icon is `docs/App-Icon-1024.png` (1024×1024, no transparency). Splash matches.
- [ ] Export compliance: standard HTTPS only, so `ITSAppUsesNonExemptEncryption = NO`. Confirm when App Store Connect asks.

## Policy items Apple checks
- [ ] **Account deletion in the app** (More → Account → Delete account). It deletes, not deactivates.
  - [ ] The organizer is told which workspaces are deleted for everyone and that the partner loses access.
  - [ ] A partner deleting their account only leaves; the organizer's records stay.
  - [ ] It works for Apple accounts (fresh Apple confirmation) and email accounts (a fresh deletion code, which only works for deletion and never signs anyone in).
- [ ] **Sign in with Apple tokens revoked** on deletion with Apple's REST API, before anything is deleted: the iPhone token with the bundle ID, the web token with the Services ID.
- [ ] Account deletion also works on the web, and `https://crewtallyapp.com/delete-account` explains both and the email fallback.
- [ ] Permission strings in plain words (camera). Permissions are asked only when the feature is used.
- [ ] No claims of bank verification, payroll, tax, or accounting certification anywhere in the app, website, listing or screenshots. The receipt says "Not bank verified" where it applies.
- [ ] "Record payment" clearly records a payment already made; the app doesn't move money. Said in the review notes and on the first screen ("CrewTally never moves money…").
- [ ] Privacy link on the first screen.
- [ ] App works with notifications denied.
- [ ] No placeholder content, broken links or "coming soon" buttons in the app. Business (Release 1.1) is hidden, not shown disabled.

## App Store Connect listing
- [ ] App name "CrewTally" and subtitle up to 30 characters: "Work and pay for day workers" (28).
- [ ] Description in plain words: who it's for, daily or hourly pay, record payments made outside the app, a partner can help, receipts and statements that show each worker only their own pay, works on iPhone and the web. No "seamless", "magic", "effortless", "unlock", "empower", "Unlimited", "payroll" or "AI".
- [ ] Keywords, category (Business or Finance; check what similar apps use), age rating questionnaire.
- [ ] Screenshots recaptured from the 2.0 build with fictional data, at the sizes App Store Connect asks for: Today, Record payment, Worker detail with the balance breakdown, Receipt (worker view), Statement, Partner invite. Never the design-pack drafts.
- [ ] Privacy policy URL live at `https://crewtallyapp.com/privacy`, with the owner's legal details filled in.
- [ ] Support URL live at `https://crewtallyapp.com/support`; deletion instructions at `https://crewtallyapp.com/delete-account`.
- [ ] Copyright line (the legal operator's name).

## App Privacy details ("nutrition label"), matching the build
- [ ] **Contact info — Email address:** for email sign-in, account linking and invitations. Linked to the user, app functionality, not tracking.
- [ ] **Contact info — Name:** the display name and the names and phone numbers of workers that the user enters. Linked to the user, app functionality.
- [ ] **User content:** work and payment records, notes, photos and PDFs the user adds, hand-over signatures. Linked to the user, app functionality, not tracking.
- [ ] **Identifiers — User ID:** the CrewTally account id and the Sign in with Apple user id. Linked, app functionality.
- [ ] **Purchases:** purchase history (through Apple and RevenueCat). Linked, app functionality, not tracking.
- [ ] **Diagnostics:** none (no crash-reporting SDK in Release 1).
- [ ] No tracking, no advertising data, no data sold.
- [ ] If anything in the build differs from this list, the label follows the build, not this list.

## Review
- [ ] Review notes (text in Phase 8): both sign-in methods, how to reach the sample data, the main flow, where account deletion is, the partner case, and that the app doesn't move money.
- [ ] Review account: `REVIEW_EMAIL` and `REVIEW_CODE` entered in App Review Information's sign-in fields; the account has fictional data seeded through the API; the email-code path for it was tested on the production build.
- [ ] Contact phone and email for the reviewer.
- [ ] TestFlight pilot complete: at least 5 owners for 2 weeks (some with a partner, some also on the web), all Blocker and Major findings fixed.
- [ ] Release gates in Phase 8 met, with the QA log up to date.

## After approval
- [ ] Choose manual release, so you pick the day.
- [ ] Set `APP_STORE_URL` so `/go/app` and the website's download button point at the App Store page.
- [ ] Remove `REVIEW_EMAIL` and `REVIEW_CODE` from production Secrets. (For the 1.1 review, B4 has you add them back with a new code, then remove them again.)
- [ ] Keep the nightly backup and reconciliation jobs running; run `npm run ops:alerts` weekly for the first month.
