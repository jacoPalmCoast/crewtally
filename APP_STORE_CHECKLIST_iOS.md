# App Store checklist (iPhone, Release 1)

Checked against Apple's published requirements on 24 September 2026. Recheck everything in the week you submit; Apple changes these.

## Accounts and identity
- [ ] Apple Developer Program membership active ($99/year). Individual is fine to start; the seller name shows as your name.
- [ ] Bundle ID registered and matching `ios.bundleIdentifier`. It can't change later.
- [ ] Sign in with Apple capability enabled for the App ID.
- [ ] Sign in with Apple key (.p8) created; Key ID and Team ID stored as Replit Secrets.
- [ ] Paid Apps agreement signed; banking and tax details complete.
- [ ] App Store Small Business Program approved (15% commission).

## In-app purchases
- [ ] `pro_monthly`, `pro_annual` (one subscription group) and `project_pass` (consumable) created, priced, with review screenshots, and attached to the version being submitted. Drop `project_pass` if the TestFlight purchase test failed.
- [ ] Plan screen shows price, period, what's included, that subscriptions renew automatically until cancelled, links to the privacy policy and terms of use (Apple's standard EULA is fine), and **Restore purchases**.
- [ ] Buying, restoring, expiry and the Project Pass tested in TestFlight with a sandbox tester.
- [ ] Deleting the account tells the owner it doesn't cancel an App Store subscription and links to manage it.
- [ ] Records stay readable and usable after a subscription expires (Apple reviewers sometimes check what's lost).

## Build
- [ ] Built with Xcode 26 and the iOS 26 SDK. Apple has required this for uploads since 28 April 2026. Replit's publish flow builds it; check the build details in App Store Connect show SDK 26.
- [ ] Version 1.0.0, build number increases with every upload.
- [ ] iPhone only (`supportsTablet: false`).
- [ ] No development code paths in the production build (no Expo Go audience, no debug screens).
- [ ] Export compliance: standard HTTPS only, so `ITSAppUsesNonExemptEncryption = NO`. Confirm when App Store Connect asks.

## Policy items Apple checks
- [ ] **Account deletion in the app** (More → Account → Delete account). It deletes the account, not just deactivates it.
- [ ] **Sign in with Apple tokens revoked** on deletion, using Apple's REST API. Required for apps using Sign in with Apple.
- [ ] Sign in with Apple is the only sign-in method, so no equivalent-login rule applies.
- [ ] Permission strings in plain words (camera). Permissions are asked only when the feature is used.
- [ ] No claims of bank verification, payroll, tax, or accounting certification anywhere in the app, listing or screenshots.
- [ ] "Record payment" clearly records a payment already made; the app doesn't move money. Say this in the review notes.
- [ ] App works with notifications denied.
- [ ] No placeholder content, broken links, or "coming soon" buttons in the submitted build. Hide Release 1.1 items; don't show them disabled.

## App Store Connect listing
- [ ] App name "CrewTally" and subtitle (up to 30 characters): "Track work and pay for day workers" is 34, so use "Work and pay for day workers" (28).
- [ ] Description in plain words: who it's for, daily or hourly pay, record payments made outside the app, receipts and statements that show each worker only their own pay. No "seamless", "magic", "effortless", "unlock", "empower", and no "AI".
- [ ] Keywords, category (Business or Finance; pick one and check what similar apps use), age rating questionnaire.
- [ ] Screenshots for the required iPhone display size, using fictional workers and amounts: Today, Record payment, Worker detail, Receipt, Statement. Check the currently required sizes in App Store Connect at upload time.
- [ ] Privacy policy URL live at https://crewtallyapp.com/privacy.
- [ ] Support URL live at https://crewtallyapp.com/support, with account-deletion instructions at https://crewtallyapp.com/delete-account.
- [ ] Copyright line.

## App Privacy details ("nutrition label"), matching the build
- [ ] **User content:** worker names, notes, photos and PDFs the owner adds. Linked to the user, used for app functionality, not tracking.
- [ ] **Identifiers:** Sign in with Apple user ID. Linked to the user, used for app functionality.
- [ ] **Purchases:** purchase history (through Apple and RevenueCat). Linked to the user, used for app functionality, not tracking.
- [ ] **Diagnostics:** none (no crash-reporting SDK in Release 1).
- [ ] No tracking, no advertising data, no data sold.
- [ ] If anything in the build differs from this list, the label follows the build, not this list.

## Review
- [ ] Review notes (text in Phase 8), including how to try the main flow and where account deletion is.
- [ ] Sign in with Apple works for the reviewer's own Apple ID; no demo credentials are needed. Say so in the notes.
- [ ] Contact phone and email for the reviewer.
- [ ] TestFlight pilot complete: at least 5 owners for 2 weeks, all Blocker and Major findings fixed.
- [ ] Release gates in spec section 17 met, with the QA log up to date.

## After approval
- [ ] Choose manual release, so you pick the day.
- [ ] Keep the nightly backup and reconciliation jobs running, and check the Diagnostics banner weekly for the first month.
