# Phase B4 — Business billing, expiry and Release 1.1

> **Before pasting:**
> 1. Phase B3 passed its gate. `BUSINESS_ENABLED` is still `false`.
> 2. Do the **owner checks** below first and paste what you found into the chat with the phase. Don't create products until checks 1–3 are done.
> 3. Keep `BUSINESS_DEV_ACCESS=true` and `APP_ENV=development` in the workspace. You'll set `BUSINESS_ENABLED=true` in production only at the very end, in "Release 1.1".
> 4. Re-add the App Review sign-in Secrets in the **production** deployment (P8 had you remove them after approval): `REVIEW_EMAIL` (the same review address) and a **new** 6-digit `REVIEW_CODE`, made in the Shell with `python3 -c "import secrets; print(f'{secrets.randbelow(10**6):06d}')"`, pasted into Secrets, then the Shell cleared. Remove both again after 1.1 is approved.
> 5. Push the current code to GitHub.

**Owner checks (confirm before building; also listed in spec §19):**
1. **Price.** $29/month and $290/year are proposed (D5). Confirm them with the contractors you've spoken to. The app never hard-codes prices; they come from the App Store, so you can change them later without a new build.
2. **Subscription group.** Home Pro and Business must be able to run at the same time for the same Apple Account (one person can own a Home workspace on Pro and a Business). Our understanding is that this needs a **separate subscription group** ("CrewTally Business"), because inside one group Apple treats a second purchase as switching plans. Read Apple's current App Store Connect help on subscription groups and confirm before creating the products.
3. **RevenueCat restore / transfer setting.** CrewTally uses the **workspace id as the RevenueCat app user id**. RevenueCat has a project setting for what happens when a purchase is restored under a different app user id (transfer it, or keep it with the original). Find that setting in RevenueCat's current docs and dashboard and choose the option that **keeps the purchase with the original app user id**, so a restore can never move a Business subscription to another workspace. Paste the setting name and the doc link.
4. **Free trial.** D5: a 14-day free trial through Apple's **introductory offer** on both Business products. Apple decides who is eligible. Confirm the offer setup in App Store Connect.
5. **RevenueCat webhook event names and fields** (type, product id, original transaction id, expiration, period type for trials, auto-renew status, environment): check them against RevenueCat's current webhook docs. The Agent pastes the mapping table at the gate with the doc link; nobody guesses field names.

## Goal

- Migration `0010_business_entitlements.sql`: a verified subscription record per Business workspace (plan, billing owner, state, will-renew, unique original transaction id), its events, and one function that decides what a Business workspace may do.
- **Only the billing owner** sees anything about buying. Members never see a checkout, on iPhone or the web.
- **Unpaid** Business (setup done, never bought): setup and the sample only. **Active** (including trial, grace and billing retry): everything. **Confirmed expiry, refund or revoke**: read and export only, **but workers can still confirm receipts and raise payment questions**, and people can still be removed.
- **Home is never locked** (invariant 16). None of this touches a Home workspace.
- Restore keeps the purchase with its original workspace.
- The Business sync, offline, access, billing and settings screens.
- App Review notes and a Business review account, then **flip `BUSINESS_ENABLED` for Release 1.1**.

Nothing here changes `record_entitlement_event`, `workspace_entitlements`, Home Pro or Project Pass, any function in invariant 2, `fn_earned`, `role_can` or `require_member`.

## Read first
- `docs/CrewTally_Design_Baseline_2.0.md`: §14 Business workspace (billing, unpaid state, expiry), §2 Decisions (D3, D5), §3 Release scope, §9 Account deletion, §11 Money rules (must-not-build 19), §16 API surface, §19 Things to confirm.
- `db/migrations/0004_plans_and_project_use.sql`: `record_entitlement_event` (the Home pattern this phase mirrors: idempotent event id, expiry never moves backwards).
- `db/migrations/0008_business_foundation.sql`: the plan-limit trigger guard. **Business is already outside the Free limits since B1** (B1–B3 needed several jobs and crews). This phase re-tests it; it doesn't redefine the triggers again.
- Your P7 RevenueCat integration, webhook and `POST /v1/plan/refresh`; P8's review account and release steps; `APP_STORE_CHECKLIST_iOS.md`.
- `docs/SCREEN-COVERAGE-2.0.csv`: rows with `build_phase = B4` (16 mobile), and the P7 web rows `billing`, `plan-options`, `purchase-handoff`, `manage-plan`, `restore`, `expired`, `settings`.
- Screens: `docs/screens-2.0/mobile/` `BPlan`, `BBuyReview`, `BPlanActive`, `BBilling`, `BManageSubscription`, `BBillingTerms`, `BRestore`, `BPurchaseFailed`, `BExpired`, `BMore`, `BTeamAccess`, `BSync`, `BOffline`, `BBillingProblem`, `BPurchaseLinked`, `BReadability`; web `billing`, `expired`, `restore`, `purchase-handoff`, `team-access`.

## Must-not-build items in this phase (spec §11)
| # | Prototype behaviour | How this phase stops it | Test |
|---|---|---|---|
| 19 | Any expired workspace, Home included, pauses work and payments | The write gate applies to `BUSINESS` workspaces only; Home returns `HOME` and is never gated | `home_never_locked_after_pro_lapses` |
| — | Expired or unpaid Business blocks a worker's "I received this payment" and "I have a question" | Those two routes (and the public link page) are allowed in every state | `worker_can_confirm_after_expiry` |
| — | The client sets "active" after purchase | The app shows Business as active only after the server has a verified event | mobile `active_only_after_server_says_so` |
| — | Prices hard-coded; grace and billing retry missing | Prices and trial text come from the store; all six states are stored and shown | `prices_from_store`, state tests |
| — | Restore moves a purchase to another workspace | Unique original transaction id, refused rebinding, RevenueCat setting kept with the original | `restore_never_rebinds` |
| — | Members shown a checkout | Purchase screens render only for the billing owner; the API answers 403 to anyone else | role matrix |
| — | In-app text-size control (`BReadability`) that fights iPhone Dynamic Type | Not built as a separate setting; the screen explains that CrewTally follows iPhone Text Size (same as the Home Readability row from P7) | — |

## Build

### 1. Migration `0010_business_entitlements.sql`

Write it at this phase with `db/tests/16_business_entitlements.sql`. Additive only; end with `select harden_definer_functions();`.

**a) `workspace_subscriptions`** (the verified subscription state for a workspace):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `plan` | text not null | `HOME_PRO` or `BUSINESS` |
| `billing_owner_id` | uuid not null | references `users(id)`; must equal `workspaces.owner_id` |
| `state` | text not null | `ACTIVE`, `GRACE`, `BILLING_RETRY`, `EXPIRED`, `REFUNDED`, `REVOKED` |
| `will_renew` | boolean not null | |
| `is_trial` | boolean not null default false | |
| `product_id` | text not null | |
| `original_transaction_id` | text not null | **unique** across the table: one store subscription covers one workspace |
| `period_ends_at` | timestamptz | the current period's end (trial end during a trial) |
| `last_event_at` | timestamptz not null | the `occurred_at` of the newest event applied |
| `created_at`, `updated_at` | timestamptz not null default `now()` | |

`unique (workspace_id, plan)`. Trigger `workspace_subscriptions_rules` (before insert or update): `plan` fits the workspace kind (`BUSINESS` ↔ `BUSINESS`, `HOME` ↔ `HOME_PRO`); `billing_owner_id = workspaces.owner_id`; `workspace_id`, `plan` and `billing_owner_id` never change; `original_transaction_id` may change only when the old state is `EXPIRED`, `REFUNDED` or `REVOKED` (a new subscription after the old one ended). App code never writes this table.

In this phase only `BUSINESS` rows are written. **Home Pro stays exactly as built** on `workspace_entitlements` and `record_entitlement_event` (0004). `HOME_PRO` is in the check so Home Pro can move here later, which needs the owner's written approval.

**b) `subscription_events`** (webhook and refresh log, replay-safe):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `workspace_id` | uuid not null | references `workspaces(id) on delete cascade` |
| `event_id` | text not null unique | RevenueCat event id, or a stable synthetic id from refresh |
| `event_type` | text not null | `PURCHASED`, `RENEWED`, `AUTO_RENEW_OFF`, `AUTO_RENEW_ON`, `BILLING_ISSUE`, `EXPIRED`, `REFUNDED`, `REVOKED` |
| `product_id` | text | |
| `original_transaction_id` | text | |
| `expires_at` | timestamptz | |
| `is_trial` | boolean | |
| `occurred_at` | timestamptz not null | |
| `received_at` | timestamptz not null default `now()` | |
| `outcome` | text not null | `APPLIED`, `IGNORED_OLDER`, `BOUND_ELSEWHERE` |

No names, emails, prices or raw payloads.

**c) Functions** (`SECURITY DEFINER`, hardened):

`record_subscription_event(p_workspace, p_event_id, p_type, p_product, p_original_tx, p_expires_at, p_will_renew, p_is_trial, p_occurred_at) returns jsonb` — the **only** writer of `workspace_subscriptions` and `subscription_events` (webhook and `POST /v1/business/billing/refresh` only).
1. The workspace exists and is `BUSINESS` (else `P0002` / `22023`). Type is known; event id and original transaction id are present.
2. Idempotent by `event_id`: a repeat with the same workspace, type and original transaction id → `{"status":"duplicate"}`; different details → `23505`.
3. The original transaction id already belongs to **another** workspace → store the event with `outcome = 'BOUND_ELSEWHERE'`, change nothing, return `{"status":"bound_elsewhere"}`.
4. `occurred_at` older than the row's `last_event_at` → store with `IGNORED_OLDER`; only `period_ends_at` may still move **forward** (never backwards, same as 0004).
5. Otherwise apply and store `APPLIED`:

| Event | State after | Other fields |
|---|---|---|
| `PURCHASED`, `RENEWED` | `ACTIVE` | `period_ends_at` = the later of old and new; `will_renew` from the event (true if not given); `is_trial` from the event; first event creates the row with `billing_owner_id = workspaces.owner_id` |
| `AUTO_RENEW_OFF` / `AUTO_RENEW_ON` | unchanged | `will_renew` false / true |
| `BILLING_ISSUE` | `GRACE` if `p_expires_at` (the grace end) is in the future, else `BILLING_RETRY` | |
| `EXPIRED` | `EXPIRED` | ignored if `period_ends_at` is later than the event's expiry (a renewal already arrived) |
| `REFUNDED` | `REFUNDED` | |
| `REVOKED` | `REVOKED` | |

`business_access(p_workspace) returns text` (stable):
- `HOME` for a Home workspace. Always. The API never gates Home.
- `SETUP_ONLY`: Business with no subscription row.
- `ACTIVE`: state `ACTIVE`, `GRACE` or `BILLING_RETRY`. Billing retry stays writable until the store **confirms** expiry (D3: read-only only after a confirmed expiry); the owner sees "Billing needs attention".
- `READ_ONLY`: state `EXPIRED`, `REFUNDED` or `REVOKED`.

`business_billing_status(p_workspace) returns jsonb` (stable): plan, state, `will_renew`, `is_trial`, `period_ends_at`, product id, billing owner's user id, `access`. Never the original transaction id.

**`replit.md` update** (this phase file is the approval): in invariant 2, add "Business plan (0010): `record_subscription_event` (webhook and `POST /v1/business/billing/refresh` only)." and add `workspace_subscriptions` and `subscription_events` to the tables app code never writes directly. In invariant 16, keep the Home wording and add: "Business access is decided only by `business_access()` and the write gate in `withMember`."

**d) Database tests** (`db/tests/16_business_entitlements.sql`):
- A `BUSINESS` row for a Home workspace → `23514`; a billing owner who isn't the workspace owner → `23514`.
- Purchase → ACTIVE; same event twice → one event row, `duplicate`; renewal moves `period_ends_at` forward; an older renewal arriving late doesn't move it back.
- `BILLING_ISSUE` with a future grace end → GRACE (`access` ACTIVE); with a past one → BILLING_RETRY (`access` ACTIVE); `EXPIRED` → READ_ONLY; `REFUNDED` and `REVOKED` → READ_ONLY.
- Original transaction id of workspace A sent for workspace B → `bound_elsewhere`, B unchanged, A unchanged.
- After `EXPIRED`, a purchase with a new original transaction id in the same workspace → ACTIVE with the new id.
- `business_access` of a Home workspace is `HOME`, whatever `workspace_entitlements` says.
- Plan-limit guard (from 0008) still holds: a Business workspace with no subscription row creates 3 jobs and 6 current workers with no `CT402`; Home Free still gets `CT402`. All provided tests 08–11 pass unchanged.
- `delete_user_account(owner)` removes the subscription and its events with the workspace.

### 2. Server

**The write gate** (one place: `withMember`). Every member route in the route table now also declares a **gate class**. The completeness test fails if any member route lacks one.

| Gate class | Examples | `SETUP_ONLY` | `ACTIVE` | `READ_ONLY` |
|---|---|---|---|---|
| `read` | every GET, `POST /v1/exports`, `POST /v1/exports/work`, `POST /v1/notifications/read` | allowed | allowed | allowed |
| `setup` | `PATCH /v1/business/settings`, `POST /v1/business/setup/complete`; `POST`/`PATCH /v1/projects` and `/v1/workers`, `POST /v1/assignments`, agreements | allowed only while `setup_completed_at` is null, and only for the **first** job and first worker (a second `POST` → 402); edits to those two are allowed | allowed | 402 |
| `write` | submissions, approvals, corrections, payments, reversals, receipts, links, invitations, rate changes, everything else that writes | 402 `BUSINESS_PLAN_REQUIRED` | allowed | 402 `BUSINESS_READ_ONLY` |
| `worker_ack` | `POST /v1/my/receipts/:id/acknowledge` | allowed | allowed | **allowed** |
| `security` | `DELETE /v1/members/:userId` (remove or leave), `DELETE /v1/invitations/:id`, account deletion | allowed | allowed | **allowed** |

- The gate runs inside the same transaction as `require_member`, calling `business_access(workspace)`. Home → skip.
- The public receipt page and its two buttons (`acknowledge_share_link`, P6) aren't member routes and are never gated: test it.
- Billing routes (below) are `read` or run outside the gate, so the owner can always buy, restore and refresh.
- 402 bodies: `{"error":"BUSINESS_PLAN_REQUIRED"}` and `{"error":"BUSINESS_READ_ONLY"}`. The apps show `BPlan` to the billing owner and `BExpired` (member wording) to everyone else.

**Billing routes** (Business only):

| Route | Action | What it does |
|---|---|---|
| `GET /v1/business/billing` | `workspace.read` | Everyone: `{access, state, period_ends_at, covered: true|false, billing_owner_name}`. Only the billing owner (role `OWNER` with `plan.manage`, and the session user is `workspaces.owner_id`) also gets `can_purchase: true`, `will_renew`, `is_trial`, `product_id`, and the product ids to offer. Members get `can_purchase: false` and nothing about prices. |
| `POST /v1/business/billing/refresh` | `plan.manage` | Reads the RevenueCat customer for app user id = this workspace id through the REST API, and records the current state with `record_subscription_event` using stable synthetic ids (`refresh:biz:<original_transaction_id>:<expires_ms>:<state>`). 10 per minute per workspace. |
| `POST /v1/webhooks/revenuecat` | public (P7) | Extend the P7 mapping: products listed in `BUSINESS_PRODUCT_IDS` (server config, default `business_monthly,business_annual`) go to `record_subscription_event`; Home products keep going to `record_entitlement_event` unchanged. The `app_user_id` must be a Business workspace for Business products; otherwise 200 and log `ignored_wrong_workspace` (ids only). A transfer event for a Business product → 200, log `ignored_transfer`, write nothing (the purchase stays with its original workspace). `bound_elsewhere` → 200, log it. Check every event type and field name against RevenueCat's current webhook docs (owner check 5) and paste the mapping. |

**Account deletion** (P7 route, Business wording): before deleting, `GET /v1/account/deletion-preview` (P7) lists each Business workspace the person owns, with its member count: "Deleting your account deletes Rivera Builders for all 5 people in it." Plus the P7 line that deleting doesn't cancel an App Store subscription, with **Manage subscription**.

**Older app builds.** Release 1 builds show the Business choice whenever `GET /v1/config` says `business_enabled` (P1b), but they have no Business screens. Change `GET /v1/config` to read the `X-App-Build` header the app already sends (add it to the API client now if it doesn't) and return `business_enabled: true` only for builds at or above `BUSINESS_MIN_BUILD` (server config, set to the first 1.1 build number). The web app always gets the real value. A person on an old build who belongs to a Business workspace sees it in the switcher with "Update CrewTally to open this workspace." and a link to the App Store page; opening it does nothing else.

**Role matrix additions:**

| Route | O (billing owner) | A$ | A | L1 | W1 | Home organizer | Removed / outsider |
|---|---|---|---|---|---|---|---|
| `GET /v1/business/billing` | 200, `can_purchase: true` | 200, `can_purchase: false`, no prices | same | same | same | 404 | 404 |
| `POST /v1/business/billing/refresh` | 200 | 403 | 403 | 403 | 403 | 404 | 404 |

**Gate matrix** (new test, generated from the route table): for every member route, in a Business workspace in each of `SETUP_ONLY` (setup open), `SETUP_ONLY` (setup complete), `ACTIVE`, `GRACE`, `BILLING_RETRY`, `EXPIRED`, `REFUNDED`, `REVOKED`, call it as the role that's normally allowed and assert allowed or the exact 402 body from the table above. Then the same loop for a Home workspace with Pro expired and a Pass refunded: **nothing** returns 402 from the gate (Home limits still come only from the 0004 triggers, `CT402 PLAN_LIMIT`, on new projects and new current workers).

### 3. Mobile

**Purchases (billing owner only):**
- On entering a Business workspace, configure RevenueCat with app user id = **this workspace id** (P7 does this per workspace; Home and Business workspaces each get their own id). Never in sample mode.
- Setup's last step (B1) now goes to **`BPlan`** when `access = SETUP_ONLY`.
- `BPlan`: "One plan covers the whole business and everyone you invite." Monthly and yearly with **prices and the trial text from the store** (RevenueCat offering `business`; show "14 days free" only if the store product carries that introductory offer and RevenueCat reports the person eligible). **Restore purchases**. **Not now** goes to `BOwnerToday` in the unpaid state, where only setup edits work and a banner says "Choose a plan to invite your team and record work."
- `BBuyReview`: the store's localized price and period, "Covers <business> and everyone you invite. They pay nothing.", "Renews automatically until you cancel in your Apple Account settings.", an unticked "I understand" box, and, if this person is the organizer of a Home workspace on Pro: "This doesn't change your Home Pro plan." Then the Apple purchase sheet.
- After the store returns: call `POST /v1/business/billing/refresh`, then `GET /v1/business/billing`. Show **`BPlanActive`** only when the server says `ACTIVE`. While waiting: "Confirming with the App Store…" (retry up to 5 times over about a minute, then "We'll update this when Apple confirms. You can keep using setup.").
- `BPurchaseFailed`: "The purchase didn't finish. Your setup is saved. Try again, or restore if Apple already charged you."
- `BPlanActive`: "Rivera Builders is covered. Team members pay nothing." **Invite an admin or crew lead**, **Go to Today**.
- `BBilling` (More → Billing, owner only): status with text and icon (Active, Free trial, Billing needs attention, Ended, Refunded), period end, renews or not, "Billed through Apple", **Manage subscription** (opens `https://apps.apple.com/account/subscriptions`), **Restore purchases**, **Plan details** (`BBillingTerms`). "Don't share your Apple Account with your team. They don't need it."
- `BManageSubscription`: Apple manages renewal; cancelling keeps access to the end of the period; then records stay readable and exportable. Changing the owner doesn't move the subscription (there's no owner transfer in 1.1).
- `BBillingTerms`: one plan per business; no charge per person; on a confirmed end: read and export only, workers can still confirm receipts and ask about payments, and Home workspaces are never affected. Links to privacy and terms.
- `BBillingProblem` (owner, when state is `GRACE` or `BILLING_RETRY`): "Apple couldn't renew your plan. Check your payment details in your Apple Account. Your team can keep working while Apple retries." Members see nothing about it.
- `BRestore`: restore with the paying Apple Account, then refresh. If RevenueCat or the server reports the purchase belongs to another app user / workspace → **`BPurchaseLinked`**: "This purchase already covers another business. One purchase covers one business." If the signed-in person owns a Business workspace with an active plan, offer **Open <that workspace>**; never name a workspace the person isn't a member of.

**Members:**
- Never see `BPlan`, `BBuyReview`, `BBilling`, `BRestore` or any price. `BTeamAccess` (More → Your access): workspace, role, jobs, "Covered by <business>. You pay nothing. The owner manages the plan."
- On a 402 `BUSINESS_PLAN_REQUIRED` or `BUSINESS_READ_ONLY`: `BExpired` with member wording ("Ask the owner to renew. Your records are safe and you can still view and export them."), and for workers "You can still confirm payments and ask about them." The owner's version has **Renew** (opens `BPlan`).

**Business More, sync and offline:**
- `BMore` by role: switch workspace, Sync & recovery, work history, reports (money roles), Billing (owner) or Your access (others), Account (P7: sign out, delete account), Text size (`BReadability`). Put Sign out at the bottom.
- `BReadability`: an information row: "CrewTally follows your iPhone's Text Size. Change it in Settings → Display & Brightness → Text Size." No separate in-app size control (Dynamic Type rule, spec §17).
- `BSync`: the per-workspace queue (B2) with each item's status, including items rejected at sync: removed from the workspace (404), out of scope (404), plan required or ended (402), already submitted or changed (409). Each rejected item keeps its details on the phone with **Copy details** and **Remove from this phone**. Nothing disappears on its own.
- `BOffline`: "You can keep recording hours on this phone. Approvals, payments, invitations and sharing need a connection."

### 4. Web

- `billing` (Business): status for everyone covered; the owner sees state, period end and renewal, and "Buy, restore or manage the Business plan in the CrewTally iPhone app." No checkout, no price list, no link to a web payment page. Members see "Covered by <business>".
- `purchase-handoff`, `restore`, `manage-plan` (Business owner only): explain the iPhone steps; `manage-plan` links to Apple's subscription page.
- `expired` (Business): read and export only; worker wording as on iPhone; the owner is told to renew on the iPhone. Home never shows this page.
- Any 402 from the gate shows the matching page. The web never says "Unlimited" and the iPhone app never points to the web to pay.

### 5. Tests

**Server:**
- The gate matrix (above), generated from the route table, for every Business state and for Home.
- `home_never_locked_after_pro_lapses`: Home on Pro with 3 projects → `PRO_EXPIRED` → record work, record payments for existing workers, receipts, statements, exports and account deletion all work; a new project gets `CT402 PLAN_LIMIT` (the 0004 rule), never a Business 402.
- `worker_can_confirm_after_expiry`: Business `EXPIRED`: W1 confirms a receipt in the app → 200; W1 asks a question → 200 and notifications go out; the public link page confirm and question → 200; W1 submits hours → 402 `BUSINESS_READ_ONLY`; O records a payment → 402; O exports → 200; O removes L1 → 200.
- Unpaid: after setup complete with no subscription, `POST /v1/invitations` → 402 `BUSINESS_PLAN_REQUIRED`; a second job → 402; editing the first job → 200.
- Webhook: Business purchase event → ACTIVE; Home Pro event still goes to `workspace_entitlements` (P7 tests unchanged); a Business product for a Home workspace id → 200, nothing written; a transfer event → 200, nothing written; wrong secret → 401.
- `restore_never_rebinds`: purchase recorded for workspace A; a refresh for workspace B returning the same original transaction id → `bound_elsewhere`, A still ACTIVE, B still `SETUP_ONLY`.
- Billing visibility: `GET /v1/business/billing` as A$, A, L1, W1 has no `can_purchase: true`, no product ids, no `will_renew`; `money_key_scanner` and a new `price_key_scanner` (`price`, `product`, `offering`) pass for members.
- `GET /v1/config` with `X-App-Build` below `BUSINESS_MIN_BUILD` → `business_enabled: false` even when `BUSINESS_ENABLED=true`; at or above → true; web → true.
- Account deletion of a Business owner: the preview lists the workspace and member count; deletion removes the workspace, its subscription row and events; members get "Access removed".

**Mobile:** `active_only_after_server_says_so` (a mocked purchase success with the server still `SETUP_ONLY` shows "Confirming…", never `BPlanActive`); `prices_from_store` (mocked offering prices render; no `$29` or `$290` string in the bundle: grep test); billing screens never render for non-owners; `BSync` keeps rejected items; RevenueCat is configured with the current workspace id and never in sample mode.

**Web:** members never see billing actions; no checkout route exists; Business `expired` page wording; Home never routes to `expired`.

## Proof to paste at the gate
- `0010_business_entitlements.sql` in full and `db/tests/16_business_entitlements.sql` with its pass count.
- The gate code in `withMember`, the gate classes in the route table and the gate matrix test with its pass count.
- The webhook mapping table for Business products with the RevenueCat doc link (owner check 5).
- The RevenueCat restore/transfer setting you chose, with the doc link (owner check 3).
- The `GET /v1/config` build check.
- Test file names and counts for all suites.

## Try it on your phone (Expo Go, dev sign-in; purchases are simulated)
1. As **owner-b**: create a new Business workspace "Park Renovations". Setup → the plan screen appears with store prices from the test offering. Tap **Not now**.
2. Try to add a second job: "Choose a plan to…". Edit the first job's name: works. Try to invite someone: blocked.
3. Back to Billing → buy monthly (test mode). "Confirming with the App Store…", then **Business is active**. Invite member-d as a crew lead. Invite member-f as a worker bound to the first worker record. Record a day for that worker and record a payment to them.
4. As **member-d**: there's no Billing and no price anywhere; More → Your access says you pay nothing.
5. Send a test `EXPIRED` webhook for Park Renovations (the Agent gives you the curl command for the dev URL with the dev secret). As owner-b: records open, export works, Record payment says the plan has ended. As **member-f**: Receipts → open the payment → **I received this payment** works; Enter my hours says the plan has ended.
6. Switch owner-b to their Home workspace (create one if needed). Let its Pro lapse the same way. Recording work and payments still works.
7. Send a test purchase event for Park Renovations again: everything is writable again.
8. As owner-b, create a second Business workspace and tap **Restore purchases** there. It must not become active; you see "This purchase already covers another business" or simply no plan. (RevenueCat's test mode may not reproduce Apple's restore exactly; the server test covers the rule and TestFlight step 3 checks it for real.)

## Try it on the web
1. As owner-b: Billing shows the status and tells you to manage it on the iPhone. There's no buy button.
2. As member-d: Billing says "Covered by Park Renovations".
3. With Park Renovations expired: the web shows the read-only page for the Business workspace and never for a Home workspace.

## Release 1.1

Do these in order, after the gate passes and the review comes back PASS.

1. **App Store Connect** (owner): create the subscription group "CrewTally Business" (per owner check 2) with `business_monthly` and `business_annual` at the confirmed prices, the 14-day free trial introductory offer on both (owner check 4), review screenshots and descriptions. Connect them in RevenueCat: entitlement `business`, offering `business`. Set the restore/transfer option from owner check 3.
2. **Server config**: `BUSINESS_PRODUCT_IDS=business_monthly,business_annual`; `BUSINESS_MIN_BUILD` = the build number of the 1.1 TestFlight build.
3. **TestFlight**: publish the 1.1 build through Replit's mobile flow. With the sandbox tester: buy Business monthly on a fresh Business workspace → active within a minute and a `subscription_events` row exists; delete the app, reinstall, sign in, Restore → still active on the same workspace; try Restore while in a different Business workspace → "already covers another business"; let the sandbox subscription lapse (sandbox renewals are short) → read-only, worker confirmation still works.
4. **Review account**: using P8's review sign-in (`REVIEW_EMAIL`, `REVIEW_CODE`), seed through the API a Business workspace "Review Builders" owned by the review account, with two jobs, a crew lead and a worker (fictional names), approved and pending work, a split payment and a receipt. Leave it **unpaid** so the reviewer can see the plan screen and buy with their sandbox account.
5. **App Review notes** (add to the P8 text): "Release 1.1 adds Business workspaces for contractors with a team. The business owner buys one subscription in the app (More → Billing, or at the end of setup); everyone they invite is covered and never sees a purchase screen. The review account owns 'Review Builders', which is not yet subscribed: open it from More → Workspaces to see the plan screen. Crew leads and workers record hours; the owner approves them before they count. CrewTally keeps a record of payments the business makes outside the app; it does not move money. Home workspaces are unchanged. The web app has no purchases."
6. **Store listing**: add a Business screenshot set from the 1.1 build (Business Today, Work to approve, Record payment with split lines, Business receipt). No "Unlimited", "payroll", "AI" or verification claims. Update the App Privacy answers if anything changed (it shouldn't: no new data types).
7. **Website**: the For Business and Pricing pages (P7) switch from "coming later" to the live Business plan, with prices written as "from the App Store" or the confirmed price. No web checkout.
8. **Flip the flag**: in the production deployment's Secrets set `BUSINESS_ENABLED=true`, publish, and check `GET /api/v1/config` with the 1.1 build header (true) and without it (false). Then submit 1.1 for review.
9. After approval: `BUSINESS_DEV_ACCESS` can stay (it does nothing in production). Remove `REVIEW_EMAIL` and `REVIEW_CODE` from the production Secrets.

Update `APP_STORE_CHECKLIST_iOS.md` with the Business items from steps 1, 3, 4, 5 and 6.

## End of phase
Run the gate from `replit.md`. Stop and say "Phase B4 ready for review". After the review passes, do "Release 1.1" above and say "Release 1.1 submitted".
