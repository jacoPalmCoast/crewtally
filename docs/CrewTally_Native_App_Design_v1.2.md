# Native mobile app design specification

Product and engineering baseline 1.2 | 24 September 2026

This app gives homeowners and small property managers a clear record of who worked on each project, what each person earned, what was paid, and what is still owed. Workers can be paid by the day or by the hour. The owner records work in seconds, records payments made outside the app, and shares an honest record with each worker: a payment receipt, or a statement of days worked and balance owed.

CrewTally ships as a native app built with Expo (React Native), backed by a Postgres database that holds the authoritative ledger. **Current build route:** iPhone first, built on Replit with Replit Agent and published to the App Store through Replit's publish flow; Android follows from the same code. The Replit build pack (separate) carries the phase-by-phase build; this spec is its source of truth.

## What's new in baseline 1.2

| Area | Baseline 1.1 | Baseline 1.2 |
|---|---|---|
| Paying the crew | One payment at a time, or one split payment | **Pay what's owed**: pay several workers at once; one payment and one receipt each |
| Proof of payment | Worker acknowledgment only through a link in Release 1.1 | Both in Release 1: a **hand-over signature** on the owner's phone (works with no signal), and a **receipt link texted to the worker** with "I received this payment" |
| Project cost | Balances only | **Project summary**: earned, paid and owed to date, by week and by worker |
| Worker language | English only | **Receipts, statements and the hand-over screen in English or Spanish**, set per worker |
| First run | Empty app | **Sample project** to look around; never touches the real ledger |
| Recordkeeping | CSV exports | Adds **year-end totals** per worker |
| Today with a big crew | Cards only | **List view** and an **Unrecorded only** filter |
| Build route | Supabase-style backend, both stores | Replit (Postgres + Node API), iPhone first, Sign in with Apple |
| Partner access | Release 2 | Designed now, ships in **Release 1.1** |
| Pricing | Not considered | Proposal in section 19; decide before public launch |

## What changed from baseline 1.0

| Area | Baseline 1.0 | Baseline 1.1 |
|---|---|---|
| Pay basis | Daily rate only; hourly deferred | Daily **or** hourly rate per worker per project, effective dated |
| Worker records | Payment receipts only | Adds worker statements and, in Release 1.1, "I received this" acknowledgment |
| Receipt privacy | Split receipt listed every worker's amount | Per-worker view by default; full split only to the named recipient |
| Reimbursements | Deferred | Release 1: separate line type, reported apart from earnings |
| Connectivity | Full offline-first sync | Online-first. Work entries queue on the device without signal; full offline sync moves to Release 2 |
| Day completion | Every assigned worker, every day | Project work days, plus a one-tap "Mark rest as no work" |
| Rate changes | Backdated change could leave mixed rates | All-or-nothing correction preview; no mixed state |
| Save model | Batch "Save selected work" | Each tap saves, with Undo |
| Navigation | Five tabs | Four tabs; project switcher on Today |
| Stack | React Native, framework unnamed | Expo with dev builds and EAS; managed Postgres, auth and storage |
| Receipt PDFs | Server job | Rendered on the device from an immutable server snapshot |
| Recovery point | 24 hours | Minutes, using point-in-time recovery |
| Delivery | 10–14 weeks, full scope | Store submission in 8 weeks (Release 1), links and acknowledgment at 12 weeks (Release 1.1) |
| Migration | No import | One-time migration from the existing web app, run by the team |

## Design position

This is a generic product specification for a product offered to other people. It is independent of any one homeowner, property, worker, or existing website. Architecture choices, targets, defaults, and estimates are proposals. Examples use fictional workers and amounts. The document says what to build; it does not claim anything is built yet.

| Area | Baseline decision |
|---|---|
| Platforms | iPhone first (App Store). Android follows from the same code. iPad runs the iPhone app; a tablet layout comes later |
| Audience | Homeowners and small property managers paying day and hourly workers directly |
| Accounts | One owner per workspace; many projects and workers |
| Pay | Per worker per project: daily rate (full or partial days) or hourly rate |
| Money | One currency per workspace; USD at launch |
| Payments | Record external cash, check, bank transfer, Zelle, or other payment. The app never moves money |
| Records | Payment receipts and worker statements as PDF, shared through the phone's share sheet |
| Reminders | Local device notifications at an owner-chosen time on project work days |
| Connectivity | Online-first; work entries survive no signal and send when back online |
| Stack | Expo (React Native, TypeScript); Replit-hosted Node API and PostgreSQL; Replit publish flow to the App Store |
| Languages | App in English; worker-facing documents in English or Spanish |

## Reading map

Sections 2–6 cover scope, setup, navigation, wireframes, and screen behavior. Sections 7–10 define pay rules, payments, records, and reminders. Sections 11–14 cover connectivity, architecture, data, and APIs. Sections 15–18 cover security, operations, tests, and the delivery plan to both stores. Section 19 lists decisions. Appendices hold the SQL schema, calculation test vectors, and store submission checklists.

# 2 Product requirements and boundaries

## Primary job to be done

After a day of work, the owner records each worker in seconds, sees what is owed, and keeps reliable evidence of payments. Each worker can be shown exactly what they worked, earned, and were paid. The product exists to stop memory-based accounting and the disagreements it causes.

## Who it is for

The launch audience is people who pay workers directly for work on a property: homeowners running a remodel, landlords and small property managers, and crew leads who pay helpers. Workers are paid a daily or hourly rate. Contractors who bill a fixed price per job are not served in Release 1; fixed-price jobs with progress payments are planned for Release 2. Store copy and onboarding must say "day and hourly workers", not "contractors".

## Requirements

| ID | Requirement | Acceptance intent | Release |
|---|---|---|---|
| REQ-01 Projects | Create, switch, archive, and reopen projects without losing history | Archived projects stay readable; history intact | 1 |
| REQ-02 Workers | Add workers once and assign them to projects | Same person, separate agreement per project | 1 |
| REQ-03 Pay agreements | Daily or hourly rate per assignment, effective dated | Correct rate chosen for every date | 1 |
| REQ-04 Work entry | Record full day, partial day, hours, or no work; unanswered stays Unrecorded | No inference from blank | 1 |
| REQ-05 Balances | Explain every balance from earnings, reimbursements, adjustments, and payments | Balance ties to ledger to the cent | 1 |
| REQ-06 Payments | Record external payments and allocate the full amount explicitly | Allocations equal payment exactly | 1 |
| REQ-07 Reimbursements and adjustments | Pay back materials; add bonuses, deductions, opening balances | Shown apart from earnings | 1 |
| REQ-08 Receipts | Truthful, versioned payment receipt; per-worker view | No worker sees another's pay | 1 |
| REQ-09 Worker statements | Days, earnings, payments, and balance for a worker and period | Totals equal ledger for the period | 1 |
| REQ-10 Texted receipt link | Owner texts the worker a secure link; the worker views only their share and taps "I received this payment" or "I have a question" | Never changes the ledger; link expires in 30 days | 1 |
| REQ-11 Reminders | Prompt at owner-chosen time on project work days | Works with permission denied, DST, reboot | 1 |
| REQ-12 No-signal entry | Work entries saved on the device and sent later | Nothing lost on app kill | 1 |
| REQ-13 History and export | Filter, correct, reverse, and export traceable records | Opening + deltas = closing | 1 |
| REQ-14 Migration | Bring history from the existing web app | Imported balances reconcile | 1 (team-run), 1.1 (in-app) |
| REQ-15 Protection | Authenticate owners and isolate every workspace | No cross-workspace access | 1 |
| REQ-16 Account lifecycle | In-app account deletion and data export | Meets both store policies | 1 |
| REQ-17 Pay what's owed | Pay several workers in one step; one payment and receipt each | All or nothing; no double payout | 1 |
| REQ-18 Hand-over signature | Worker signs on the owner's phone for their share | Works with no signal; never changes the ledger | 1 |
| REQ-19 Project summary | Labor earned, paid and owed to date, by week and worker | Ties to ledger to the cent | 1 |
| REQ-20 Worker language | Receipts, statements and hand-over text in English or Spanish | Same numbers in both languages | 1 |
| REQ-21 Sample project | Look around with sample data before real setup | Sample data never reaches the server | 1 |
| REQ-22 Year-end totals | Net paid per worker per calendar year, all projects | Ties to payments minus reversals | 1 |
| REQ-23 Partner access | A second person records work and payments | Every action attributed to who did it | 1.1 |

## Release scope

| Release 1 (App Store launch) | Release 1.1 (~4 weeks later) | Release 2 (later) |
|---|---|---|
| Projects, workers, daily or hourly agreements, worker language | Statement links | Full offline sync across devices |
| Today with per-tap save and Undo; list view and Unrecorded filter | Evidence photos on the receipt page (with file scanning) | Cloud (push) reminders |
| Mark rest as no work, work days | In-app guided CSV import | Fixed-price jobs and progress payments |
| Payments, split allocation, checks, reversals, **pay what's owed** | XLSX export | Overtime rules |
| Reimbursements and adjustments, **hand-over signature** | Evidence scanning for shared files | Managed SMS or email sending |
| Receipts and statements as PDF via share sheet, **English or Spanish**; **receipt link texted to the worker** with confirm or question | Tablet layout | Multiple currencies |
| Evidence photos and PDFs (owner-only) | **Partner access** | Android (from the same code) |
| Local reminders | | |
| Ledger, work history, CSV export, **project summary**, **year-end totals** | | |
| Sign in with Apple, account deletion, data export, **sample project** | | |

## Out of scope

Payroll, tax withholding or tax forms, bank connections, automatic transfers, invoices, materials purchasing, and time-clock attendance tracking. A note can describe the day's tasks but never changes pay.

## Permissions

The owner manages every record in the workspace. A worker needs no account; they receive a PDF, and from Release 1.1 a link that shows only their own records. Support staff have no routine access to receipts, evidence, or contact details. Any exceptional support access needs a separately designed and audited process.

## Product measures

| Measure | Target |
|---|---|
| Record five workers for a day | Under 30 seconds (one tap each plus one "Mark rest") |
| Record a split payment | Under 45 seconds |
| Balance accuracy | All posted balances reconcile to the cent (nightly job) |
| Stability | At least 99.8% crash-free sessions in pilot |
| Record sharing | Share of payments with a receipt shared (Release 1) or acknowledged (Release 1.1) |
| Activation | Share of new owners who record a first work day within 24 hours |

Analytics never collect worker names, contact details, or money amounts.

# 3 Onboarding, projects, workers and pay

## First use

Welcome → sign in → choose **Set up my project** or **Look around first** → create first project → add workers and their pay → record today → offer reminders. Sign-in needs a connection; after that, work entry tolerates no signal.

## Sample project

"Look around first" opens a sample project (Kitchen remodel, four workers, two weeks of history), so the owner, or an App Store reviewer, can see every screen with data before typing anything real.

- The sample lives **only on the phone**. It's built from a data file shipped with the app and calculated with the same pay rules. Nothing is sent to the server, so it can never enter the real ledger, receipts or exports.
- A teal banner on every screen says "Sample project — nothing here is real", with **Start my own project**.
- Anything that would share or record money (share a receipt, record a payment) shows the flow but ends with "This is sample data" instead of recording.
- **Remove sample** is one tap in More. The sample also disappears automatically once the owner creates a real project.

## Sign-in

The iPhone release uses **Sign in with Apple only**: the simplest path on iPhone, with no passwords. Email one-time code sign-in arrives with Android. If Google sign-in is ever added on iOS, an equivalent privacy-focused option must also be offered; Sign in with Apple already meets that. Biometric unlock is an optional convenience after sign-in, never a replacement for it. Camera, contacts, and notification permissions are requested only when the owner uses that feature.

## Project setup

Required: project name and timezone. The timezone defaults from the device and is shown for confirmation. It decides which date work belongs to. Optional: address, start date, expected end date, and description.

Work days default to Monday–Saturday and can be changed. Work days drive two things: which dates count as Missing when unrecorded, and which days reminders fire. Work can still be recorded on a non-work day; it just isn't required.

A project is Active or Archived. Archiving stops reminders and new entries. Reopening restores entry. History and balances stay readable either way.

## Worker setup

Required: display name. Phone and email are optional and typed in; picking from contacts comes later. **Documents language** is English (default) or Español. It sets the language of that worker's receipts, statements and the hand-over screen. The owner's app stays in English. A worker is stored once per workspace and assigned to projects. The app warns on matching names or contacts, but never merges people automatically. A worker with financial history can't be deleted from the list; they can be made inactive.

## Pay agreements: daily or hourly

Each assignment (worker on project) has one or more pay agreements, each with an effective-from date.

| Field | Daily basis | Hourly basis |
|---|---|---|
| Rate | Per day, e.g. $240.00 | Per hour, e.g. $30.00 |
| Standard day length | Optional (e.g. 8 h). Enables "enter hours" on a daily worker | Not used |
| Work input | Full, ¼, ½, ¾, other fraction, hours (if day length set), No work | Hours and minutes, or start/end/break, No work |
| Earned | Rate × portion, or rate × minutes ÷ day minutes | Rate × minutes ÷ 60 |
| Cap | $5,000 per day | $1,000 per hour |

A worker can be daily on one project and hourly on another. The pay basis for a date comes from the agreement in force on that date.

Changing the rate amount with a future or today effective date affects only work recorded for dates from then on. A backdated rate change triggers a correction preview (section 7). Changing the basis (daily ↔ hourly) is allowed only from a date after the assignment's last recorded work. To change basis for past dates, the owner voids and re-enters those days. This avoids converting days into hours by guesswork.

Overtime is not calculated. If a worker is owed an overtime premium, the owner adds an adjustment with category Overtime.

## Opening balances and migration

New owners choose "Start from zero" or "Add opening amount" per worker. Opening amounts are adjustments with category Opening balance, a date, a direction, and a reason. They are not fake workdays.

**Migration from the existing web app (Release 1).** The team runs a one-time migration with a script. Steps: export the web app's records to CSV, map them to projects, workers, agreements, work entries, and payments, and load them into a staging workspace. Then reconcile each worker's balance against the web app, fix any differences with the owner, and commit to production with a batch ID. Release 1.1 adds a guided in-app CSV import that follows the same steps: map, preview duplicates and errors, reconcile totals, commit.

## Owner defaults

Remembered: last project, reminder time, receipt payer name (a household or personal display name), and default share view. Currency locks at the first financial posting; changing it needs a new workspace.

# 4 Navigation and mobile interaction

Four tabs: **Today**, **Workers**, **Payments**, **More**. The project switcher sits at the top of Today, and most owners have one or two active projects. More holds Projects, Ledger, Exports, Reminders, Account, Help, and Diagnostics. Deep links open the intended project, payment, or statement after sign-in.

| Screen | Main content | Primary action |
|---|---|---|
| Today | Project, date, worker cards or list, owed total, unrecorded count | Tap a work option (saves) |
| Pay what's owed | Workers owed money, amount and method each, total | Record payments |
| Hand-over | Amount, sentence to confirm (worker's language), name, signature | Confirm |
| Project summary | Earned, reimbursed, paid, owed; by week and by worker | Pay what's owed |
| Worker detail | Balance per project, pay agreements, work and payment history | Record payment |
| Record payment | Amount, method, date, recipient, allocation lines | Record payment |
| Payment detail | Allocations, evidence, clearance, receipt versions | Share receipt |
| Statement | Worker, period, days, earnings, payments, balance | Share statement |
| Ledger | Filters, opening balance, rows, running and closing balance | Export |
| Year-end totals | Net paid per worker for a calendar year, all projects | Export CSV |
| Projects | Active and archived projects, work days, timezone | New project |

## Today, top to bottom

Header: project switcher, connection status, and pending count when anything is waiting to send. Date row: previous day, date (tap for calendar), next day. Summary: total owed on this project, and an "Unrecorded: 3" chip on work days. Worker cards show name, pay (e.g. "$240/day" or "$30/hr"), work options, the amount earned for this date, and a note icon.

- Daily worker options: **Full** · **½** · **Other** · **No work**. Other opens ¼, ¾, a fraction picker, and hours (if day length is set).
- Hourly worker options: **Hours** · **No work**. Hours opens an entry sheet with quick picks (4, 6, 8, 10 h), hours:minutes fields, and an optional start/end/break calculator.

Bottom of list: **Mark rest as no work (n)**, shown only when unrecorded workers remain on a work day. Below that, **Pay what's owed ($x)** shows when anyone on the project is owed money, and **No payments today** marks the day reviewed.

**Big crews.** A **Cards · List** switch sits above the workers.
- List view shows one 56-pt row per worker: name, pay, what's recorded, and amount. Tapping a row opens the same entry controls as a sheet. About nine workers fit on an iPhone screen.
- An **Unrecorded only** filter hides everyone already done.
- The app remembers the choice per project. It switches to List automatically the first time a project has more than six workers.

Tapping the owed total opens the **project summary**.

## Per-tap save and Undo

A tap saves immediately on the device and shows "Saved" on the card with an Undo snackbar for 5 seconds. The entry is sent to the server when the snackbar closes, or straight away if the owner leaves the screen. Undo inside that window cancels the send, so nothing hits the ledger. After it's sent, a change is a correction and creates a new revision. There's no batch save button and no unsaved state on Today.

## Forms and gestures

Back gestures keep drafts. Leaving a form with changes asks Keep draft or Discard. Amount fields use the decimal keypad for the workspace locale. Dates use a calendar, never free text. Destructive actions sit in an overflow menu and explain the consequence before confirming. "Record payment" never looks like a bank transfer button: neutral styling, and the helper text "Records a payment you already made".

## Visual system

Neutral light surfaces, one teal accent, and full system dark mode. 8-point spacing grid, consistent card corners, and semantic text styles. Amounts use tabular digits and align right. Status always uses a text label and an icon, never color alone: Owed, Settled, Advance, Pending, Needs review, Check not cleared. No gradients, decorative motion, or illustration in working screens.

## Accessibility (WCAG 2.1 AA baseline)

Support Dynamic Type and Android font scaling to the largest sizes, VoiceOver and TalkBack, visible focus, switch control, and reduced motion. Touch targets are at least 44 pt on iOS and 48 dp on Android. At large text sizes, work options wrap to two rows and amounts stack under names. Saves, Undo, and field errors are announced. Text contrast is at least 4.5:1, and 3:1 for icons and control borders.

# 5 Screen designs

The full screen set lives on the design canvas ("CrewTally — iPhone screens"), and all 45 screens are exported as images into the Replit build pack (`docs/screens/`). The ten below carry most use. Examples use fictional workers and amounts, and the numbers tie across screens.

![Today: cards, list switch, Unrecorded filter, pay button](screens/Today.png)

**Today.** One card per worker; each tap saves with Undo. The owed total opens the project summary. Mark rest and Pay what's owed sit at the bottom.

![Today list view for a crew of nine](screens/TodayList.png)

**List view.** For bigger crews: one row per worker, tap a row for the entry sheet. The Unrecorded only filter hides everyone already done.

![Pay what's owed: every worker owed money, amount and method each](screens/PayOwed.png)

**Pay what's owed.** Everyone owed money is ticked with the amount prefilled. Method per worker; checks need a number. One tap records one payment per worker.

![Payments recorded, with Get signature and Text receipt per worker](screens/PayOwedDone.png)

**After payday.** Each payment has its own receipt number, with Get signature and Text receipt. Status shows once signed or texted.

![Hand-over signature in the worker's language (Spanish)](screens/Handover.png)

**Hand-over signature.** The worker confirms one sentence in their language, types their name and signs. Works with no signal. Never changes money.

![Text receipt: message preview before Messages opens](screens/TextLink.png)

**Text receipt.** The phone's Messages app opens with the worker's number and this message. The owner taps Send from their own number.

![Receipt page on the worker's phone with confirm and question buttons](screens/WorkerLinkPage.png)

**Worker's receipt page.** Shows only their share. "Yes, I received this payment" or "I have a question". Expires in 30 days.

![Signed receipt in Spanish](screens/ReceiptSigned.png)

**Signed receipt.** Same numbers in English or Spanish; the signed line and signature image appear after hand-over.

![Project summary: to-date totals, by week, by worker](screens/ProjectSummary.png)

**Project summary.** What the job has cost in labor, with the sum written out, by week and by worker.

![Worker statement](screens/Statement.png)

**Worker statement.** Opening balance, each work day ("not recorded" never shows as $0), reimbursements, payments and closing balance.

# 6 Screen behavior and states

## Daily entry rules

Each assignment starts Unrecorded for each date. The app never infers No work from a blank card.

- Daily basis. Full = portion 1. ½ = 0.5. Other: ¼, ¾, a fraction (stored to four decimal places), or hours when day length is set. No work = portion 0.
- Hourly basis. Hours = 1 to 1,440 minutes, entered as h:mm or from start/end/break. Entries over 12 hours ask for confirmation. No work = 0.
- Mark rest as no work. This records No work for every assignment that is still Unrecorded on this project and date. It only appears on work days, confirms with the count, and never overwrites a recorded entry.

## Work history

Columns: date, project, worker, pay basis, input (e.g. "½ day" or "7 h 30 m"), rate, earned, note, and revision. Filters: worker, project, period, and Recorded / Unrecorded / Corrected. Each row opens a detail sheet with its revision history. Corrections go through a form; calculated amounts are never edited directly.

## Ledger

Shows the opening balance for the period, then each row with date, type, source, increase, decrease, and running balance, ending with the closing balance. Rows are sorted by effective date, then server sequence. Backdated entries recompute later running balances; receipt and statement snapshots don't change. Filtered totals are labeled separately from all-time balances.

## States

| State | Required behavior |
|---|---|
| Empty | Explain the next step; one relevant create action |
| Loading | Keep layout stable; never flash $0.00 as a real balance |
| Saved on device | "Pending" label on the card; excluded from posted totals, shown as "+$120 pending" |
| Sent | Pending label clears only after the server confirms |
| Rejected as stale | Entry moves to Needs review with both versions side by side; nothing is lost |
| Validation error | Keep inputs; mark exact fields; say how to fix |
| No connection | Work entry allowed; payments, rates, reversals, and receipts disabled with a reason |
| Session expired | Keep the queued entries; ask to sign in; send after sign-in |
| Upload failed | Payment stays recorded; evidence retries on its own with visible status |

## Project summary

One screen per project, opened from the Today owed total or More → Projects.

- **To date:** earned (labor), reimbursements, adjustments, paid and owed. Earned + reimbursements + added − taken off − paid + reversed = owed, and the screen shows that sum.
- **By week:** labor earned per week (Monday–Sunday in the project timezone), as a simple bar list with the amounts written out, never bars alone.
- **By worker:** earned, paid and owed per worker, sorted by amount owed.
- Actions: **Pay what's owed** and **Export CSV**.
- Every figure comes from the ledger (`assignment_totals`), so it always ties to worker balances.

## Year-end totals

More → Year-end totals shows, for a chosen calendar year, the net amount paid to each worker across all projects: payments minus reversals, by payment date. Earned and reimbursed amounts show alongside for reference. **Export CSV** shares it. The screen says plainly: "A record of what you paid. It isn't tax advice." The app doesn't collect tax IDs.

## Day completion

A day is complete for a project when every assignment active on that date has an explicit entry, and the owner has marked "Payments reviewed" or recorded a payment. This applies only on work days. "No payments today" is a review marker, not a transaction. Today shows missing work and missing payment review separately.

# 7 Earnings, rates and ledger rules

## Money

All amounts are signed 64-bit integer minor units (USD cents). The workspace stores the currency code and exponent. The UI accepts formatted input; the API receives integers only. Operational maximums: day rate $5,000, hourly rate $1,000, single payment $100,000, single reimbursement $50,000, single adjustment $100,000.

## Calculation

Each work entry is rounded once, half up, to the nearest cent:

- Daily, portion: earned = day rate × portion.
- Daily, hours: earned = day rate × worked minutes ÷ standard day minutes.
- Hourly: earned = hourly rate × worked minutes ÷ 60.

The server stores the inputs (portion or minutes) and the rate snapshot. It never calculates from a rounded display value.

| Example | Pay | Input | Earned |
|---|---|---|---|
| Worker A full day | $240.00/day | 1 day | $240.00 |
| Worker A half day | $240.00/day | ½ day | $120.00 |
| Worker B quarter day | $180.00/day | ¼ day | $45.00 |
| Daily worker, hours entered | $240.00/day, 8 h day | 3 h | $90.00 |
| Rounding, daily | $250.00/day | 0.3333 day | $83.33 |
| Worker C hourly | $30.00/hr | 7 h 30 m | $225.00 |
| Rounding, hourly | $27.50/hr | 1 h 20 m | $36.67 |
| Quarter hour | $22.50/hr | 15 m | $5.63 |
| Confirmed no work | any | No work | $0.00 |

All examples are test vectors in Appendix B and pass against the reference schema.

## Rate changes and corrections

Every work revision stores the rate snapshot it used. Rate changes follow these rules:

1. **Effective today or later.** This applies to dates from the effective date onward. Nothing already recorded changes.
2. **Backdated.** The app lists every recorded entry from the new effective date onward, with old and new earnings and the total difference. The owner commits all of it with a reason, or cancels the rate change. There is no option to keep some days at the old rate; that is what prevents a mixed state.
3. **Basis change (daily ↔ hourly).** This is allowed only from a date after the last recorded work on that assignment.

A correction to a single day uses the agreement in force for that date and posts only the difference as an Earning correction. A void reverses the active earnings, keeps the history, and returns the date to Unrecorded unless No work is recorded instead. Ledger rows are never edited or deleted.

## Balance

Balance = earnings + reimbursements + increase adjustments − payments + payment reversals − decrease adjustments.

Positive means owed, zero means settled, and negative means an advance. Posted balance is always shown separately from pending on-device changes. "Total owed" sums positive balances. Advances are summed separately. One worker's advance never hides another worker's amount owed.

## Multiple projects on one date

One work entry per assignment per date. Within one project, a daily portion above 1 is invalid; extra pay is an adjustment (Bonus or Overtime). If the same worker's entries across projects on one date add up to more than one day, or more than 16 hours, the app warns and lets the owner confirm. Separate agreements can legitimately overlap. The app never prorates another project automatically.

# 8 Payments, reimbursements and adjustments

## Payment form

Required: date, amount, method, recipient, and allocation lines. Methods are Cash, Check, Bank transfer, Zelle, and Other (with a description). Optional: reference, note, evidence, and payer display name. The payment itself happens outside the app.

The recipient is who received the money, which may be a crew lead paid for several workers. Allocations are whose balance it reduces. Each allocation line points to one assignment. "Fill from balances" suggests amounts, which the owner must review. Allocations must equal the payment exactly. If a line would take a worker's balance below zero, the form warns, e.g. "This puts Worker A $40.00 in advance".

## Pay what's owed

For the usual end-of-week payday.

1. Open it from Today, Payments or the project summary. The app lists every worker owed money on the chosen project (or all projects). Each is ticked, with the amount prefilled at what they're owed.
2. The owner can untick workers, change an amount, and set the method per worker. Less than owed is fine; more shows the advance warning. Cash is the default, and a check asks for its number.
3. The total and count show at the bottom: "Record 4 payments · $1,245.00".
4. One confirmation ("I've paid these") records **one payment per worker**, each with its own receipt number, in a single transaction: all of them or none.
5. The done screen lists each payment with **Get signature** (for cash) and **Share receipt**.

Split payments to a crew lead stay available through **Record payment**.

## Hand-over signature

Proof the worker received their money, on the owner's phone, with no link or signal needed.

- It's offered after any payment that includes that worker, and prominently after cash.
- The owner taps **Hand phone to Marco**. The screen switches to the worker's language and shows one sentence, for example: "I received $160.00 in cash from Rivera household for Kitchen remodel on Thu 24 Sep 2026." In Spanish: "Recibí $160.00 en efectivo de Rivera household por Kitchen remodel el jue 24 sep 2026."
- The worker types their name and signs with a finger. **Confirm** saves the signature image (as evidence on the payment) and the exact sentence shown.
- Without signal, it's saved on the phone and sent later. The payment itself must already be recorded.
- It never changes the ledger. The receipt gains a line: "Received and signed by Marco Reyes, 24 Sep 2026 6:20 pm". A reversed or corrected payment can't be signed.
- A worker who won't sign is fine: the owner taps **Skip**, and nothing is recorded.

## Recording and checks

Payments are drafts on the device until recorded. Recording needs a connection and a confirmation: "Money was sent / cash handed over / check issued". Checks track Issued → Cleared or Returned. An issued check credits the worker immediately and shows "Check not cleared". Clearing adds no second credit. A returned check reverses every allocation.

## Reversals and corrections

A full reversal posts an opposite ledger entry for every unreversed allocation. A partial refund is a linked reversal with explicit lines, capped at each allocation's unreversed amount. Correcting a payment (wrong amount or split) reverses the old allocation set and records a new payment version in one transaction. The old receipt is marked Superseded, never overwritten. Negative payment amounts are not accepted.

## Duplicates

Every write carries an operation ID generated on the device and kept through retries. A retry returns the original result. The same operation ID with different content is rejected. The app also warns on a payment matching an existing one's date, amount, method, and reference, and lets the owner record it after review.

## Reimbursements

Reimbursements cover materials or supplies the worker paid for. Fields: worker's assignment, date, amount, description, and an optional photo of the store receipt. A reimbursement increases the amount owed and is paid through normal payment allocation. Statements, receipts, and exports show reimbursements on their own lines and never include them in earnings.

## Adjustments

Adjustments need an assignment, date, direction (increase owed or decrease owed), amount, category, and reason. Categories are Opening balance, Bonus, Overtime, Deduction, and Other. Adjustments are for things that aren't a workday, a reimbursement, or a payment.

## Fictional sequence

| Step | Worker A ($240/day) | Worker B ($180/day) |
|---|---|---|
| Both work a full day | $240.00 owed | $180.00 owed |
| A works another half day | $360.00 owed | $180.00 owed |
| Pay $300 by transfer to crew lead: A $200, B $100 | $160.00 owed | $80.00 owed |
| Pay A $200 cash | $40.00 advance | $80.00 owed |
| Transfer reversed by bank | $160.00 owed | $180.00 owed |

This sequence is an automated test against the reference schema (Appendix A).

# 9 Receipts, statements, evidence and sharing

## Receipts

After a payment is recorded, the server stores an immutable receipt snapshot. The app renders the PDF on the device from that snapshot, so the PDF is deterministic and no render server is needed in Release 1.

A receipt shows: receipt number (e.g. R-000123), generation time, payment date, payer display name, recipient, method, reference if given, project, the allocation lines for the chosen view, and payment status. The worker's remaining balance is optional and labeled "as of [time]".

**Views.** The worker view is the default when sharing: it shows only that worker's allocation line and their amount. The payment total isn't shown in this view unless the payment covers that worker alone. The full split view is offered only when sharing with the named recipient, and the preview says "Shows every worker's amount". The owner always sees the full split.

**Honest status lines.** The receipt describes a payment recorded by the owner; it is not bank verification. The status line depends on the payment:

- Check: "Check issued; clearance not confirmed" until cleared.
- Cash without acknowledgment: "Cash payment recorded by owner".
- Bank transfer, Zelle, or other: "[Method] recorded by owner. Not bank verified."
- Acknowledged (Release 1.1): "Receipt confirmed by recipient on [date]".
- Reversed or superseded: says so, with the reason.

Uploaded evidence never changes verification status.

## Documents in Spanish

Receipts, statements and the hand-over screen follow the worker's **documents language** (English or Español). The owner can switch the language for a single share from the preview.

- Numbers, dates and currency are the same in both languages; only the words change. Dates use the language's short format (e.g. "jue 24 sep 2026").
- All document wording lives in one translation file, reviewed by a fluent speaker before release. Status lines keep their honest meaning, for example: "Pago en efectivo registrado por el dueño."
- The owner's app stays in English in Release 1.

## Worker statements

A statement covers one worker, one project or all projects, and a period. It shows:

- Opening balance.
- Each work day: date, input, rate, and earned. Unrecorded work days are listed as "Not recorded", never as zero.
- Reimbursements and adjustments, each on their own lines.
- Payments, with receipt numbers.
- Closing balance, "as of" the generation time.

Statements are immutable snapshots with an ID. The statement is the main record workers use to check their pay, so it's in Release 1.

## Texting the worker a receipt link (Release 1)

After any recorded payment, the owner can tap **Text receipt**.

1. CrewTally creates a secure link for that worker's view of that receipt, in the worker's documents language.
2. The phone's own Messages app opens with the worker's mobile number and a prefilled message, for example: "Hi Dee, here's your receipt from Rivera household for $170.00 by Zelle (R-000120). Tap to view it and confirm you got it: crewtallyapp.com/r/…". In Spanish: "Hola Dee, aquí está tu recibo de Rivera household por $170.00 por Zelle (R-000120). Tócalo para verlo y confirmar que lo recibiste: …"
3. The owner taps Send, from their own number. CrewTally doesn't send texts itself in Release 1, so there's no SMS provider, no carrier registration and no per-text cost.
4. If the worker has no mobile number, the same message opens in the share sheet instead (WhatsApp, email, and so on).

Creating the link needs a connection; signing on the phone doesn't. The app records "Texted" when Messages opens and "Opened" when the worker first views the page. It never claims the text was delivered.

## Acknowledgment by link

The receipt page (see Secure links) shows two buttons: **Yes, I received this payment** and **I have a question**. A question needs a short note of up to 500 characters.

- Either one is recorded with the time and shows on the payment for the owner: "Confirmed by Dee, 24 Sep 7:05 pm", or "Question from Dee" with the note.
- A second "received" tap doesn't record again.
- A question stays open until the owner marks it resolved.
- Neither ever changes the ledger.

A receipt or statement link opened by the worker offers **I received this payment** (or, on a statement, **This is correct**) and **I have a question**. Either one records the time, an optional typed name, and an optional note of up to 500 characters, and notifies the owner in the app. Acknowledgments never change the ledger. A query shows on the payment or statement as "Question from recipient" until the owner marks it resolved.

## Evidence

Owners can take a photo, choose a photo, or choose a PDF using the system pickers. The app never requests broad photo library access. Limits are JPEG, PNG, or PDF, up to 10 MB each, five per payment or reimbursement. Photos are re-encoded before storage, which removes location and other metadata. Content type is checked from the file bytes. Originals stay owner-only. Release 1 can include evidence thumbnails in PDFs. Release 1.1 adds malware scanning for any file exposed on a link.

## Receipt page on the worker's phone

The link opens a plain web page at crewtallyapp.com/r/… served by the CrewTally API. It shows:
- the receipt in the worker's view only, in their language with an English · Español switch;
- the amount, who paid, date, method, project, their balance "as of" the receipt time, and the honest status line;
- the signed line, if they signed;
- the two acknowledgment buttons.

It has no evidence photos in Release 1; those come in Release 1.1 with file scanning. It has no login, no third-party scripts, no tracking, and isn't indexed by search engines. An expired, revoked or unknown link shows the same message: "This receipt link isn't available. Ask Rivera household to send a new one."

## Sharing journey

Open payment or worker → Receipt or Statement → choose view → preview → Share → phone share sheet (Messages, WhatsApp, Mail, and so on). The owner completes the send in their own app. Cancelling changes nothing. The app records "Generated" and "Share opened" only. It never claims Sent or Delivered.

## Secure links

Each link uses a 256-bit random token, and only its hash is stored. A link covers one receipt or statement in one view. The default expiry is 30 days for receipts and 90 days for statements. The owner can revoke or regenerate a link at any time.

The public page shows only that record and any selected evidence. It has no third-party scripts, is not indexed by search engines, and does not send the token to other sites. Link lookups are rate-limited.

Revoking a link stops future access, but it cannot recall a PDF that was already downloaded. When a record is corrected, its old link shows "Superseded" and points the owner to share the new version.

## Failures

If receipt generation fails, the payment stays recorded and the app shows "Payment recorded; receipt not ready. Retry." Only server-recorded payments can have receipts. A payment draft on the device cannot produce one.

# 10 Reminders

## Behavior

Reminders are local notifications on one chosen device. The owner sets the time, which defaults to 6:00 pm and must be confirmed. Reminders fire on the project's work days. The app schedules a rolling window of dated reminders, 14 days ahead within the iOS limit on pending notifications, and refreshes it on launch, on foreground, and when settings change. When the day is complete on that device, that day's reminder is cancelled. Suppression across devices waits for the device to refresh; the app doesn't claim it is instant.

## Time rules

Dates and reminder times use the project timezone, even when the owner travels, and the timezone is shown in settings. Around daylight-saving changes, a time that doesn't exist moves to the next valid time, and a repeated time fires once. The schedule is recomputed after timezone, clock, or app updates, and after a device restart where the platform allows.

## Permission

The app explains the benefit, then asks. If the owner says no, the app works as normal and shows an in-app reminder card with a link to settings. Android 13 and later needs the runtime notification permission. The app does not request exact alarm privileges, because a reminder a few minutes late is fine.

## Content

The lock screen shows "Record today's work and review payments." It never shows names, addresses, or amounts. Actions are **Open day** (which opens the intended date, even after midnight) and **Remind me in 1 hour**. A reminder never records anything by itself.

# 11 Connectivity and local data

## Release 1: online-first with durable work entry

The server holds the truth. The device keeps two things. First, a read cache of the active project's recent state, so screens open instantly. Second, a small durable queue of work-entry operations.

**Work entries without signal.** A tap writes the entry and its operation to a local SQLite database in one transaction, with an operation ID and the expected server version. The entry shows "Pending". The queue survives app kill and restart. It sends in order when connectivity returns, on foreground, or from "Send now". Each queued entry gets an individual result: accepted, rejected as stale, or rejected as invalid. Rejected entries move to Needs review with both versions visible. They are never silently dropped.

**Online only:** recording or reversing payments, reimbursements, adjustments, rate changes, opening balances, archiving, receipts, and statements. This prevents two devices from each posting money against a stale balance.

**Refresh:** the device re-fetches the active project snapshot on launch, on foreground, after the queue drains, and on pull-to-refresh. The snapshot covers the last 120 days of entries plus all balances. Older history loads on demand, page by page. There is no delta-sync protocol in Release 1.

**Local security:** the session token is kept in the Keychain or Keystore through secure storage. The local database holds only the cache and the queue, and relies on platform file encryption. Signing out with pending entries offers "Send now" or "Discard"; it never discards silently.

## Release 2: full offline sync

Release 2 adds offline creation of workers and assignments, a cursor-based pull with tombstones, and device-to-device conflict review. The rules below carry over from baseline 1.0, and the Release 1 design is built so they can be added without migrating data:

- Never use last-write-wins for money.
- Keep both versions on conflict.
- Local provisional totals exclude acknowledged operations immediately.

# 12 Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | Expo (current SDK at kickoff; SDK 57 with React Native 0.86 at time of writing), TypeScript | React Native's own docs recommend starting through a framework, specifically Expo |
| Builds and submission | EAS Build, EAS Submit, EAS Update | Cloud builds for both stores; over-the-air fixes limited to JavaScript |
| Navigation | Expo Router (file-based) | Deep links for payment, statement, and day |
| Local data | expo-sqlite | Read cache and work queue |
| Secrets on device | expo-secure-store | Session only |
| Notifications | expo-notifications | Local scheduling in Release 1 |
| Camera and files | expo-image-picker, expo-document-picker, expo-image-manipulator | System pickers; re-encode strips metadata |
| PDF and sharing | expo-print, expo-sharing | HTML template → PDF on device → share sheet |
| Backend | Managed Postgres with auth, storage, and server functions (Supabase or equivalent) | One vendor for Release 1 speed |
| Financial writes | Postgres functions called over RPC, one transaction each | Clients have no direct write access to financial tables |
| Reads | Row-level security scoped to the owner's workspace | Every table has workspace_id |
| Public record pages (1.1) | One server function plus a static page | Token lookup by hash |
| Crash reporting | Sentry or equivalent, with scrubbing | No amounts or names |

Pin versions after the week-1 spike, which proves auth, notifications, the SQLite queue, PDF sharing, and a store upload on both platforms. Recheck store SDK rules at release.

## Layers

| Layer | Responsibility |
|---|---|
| Screens | Layout, accessibility, navigation, permission prompts, state feedback |
| Domain | Pay calculation (shared vectors), validation, allocation checks, balance explanation |
| Data | API client, read cache, work queue, retry with backoff and jitter |
| Platform adapters | Secure storage, notifications, pickers, print, share |
| Database functions | Canonical validation, idempotency, ledger writes, audit |
| Storage | Private evidence originals; share derivatives in Release 1.1 |

The domain module has no UI imports, so its rules can be tested in isolation. The app shares calculation code and test vectors with the server, but never trust. The server recalculates every amount.

## Environments

Separate development, staging, and production projects, databases, storage buckets, signing credentials, and notification setups. Build profiles in EAS carry non-secret identifiers only; server secrets never ship in the app. The API stays backward compatible for older app versions during staged rollouts.

# 13 Data model

All tenant tables carry workspace_id and use UUID keys. Parent–child links use composite foreign keys on (workspace_id, id), so the database itself rejects a record that points across workspaces. Money is integer minor units, work dates are local DATE values, and event times are UTC. The full reference schema is in Appendix A and runs on PostgreSQL 16.

| Entity | Key fields and constraints |
|---|---|
| Workspace | owner (unique), currency code and exponent, currency_locked, receipt sequence |
| Project | name, timezone, work_days, status, version |
| Worker | display name, optional phone and email, status |
| Assignment | project, worker, start and end dates; unique project+worker |
| RateAgreement | assignment, effective_from (unique per assignment), pay_basis DAY or HOUR, rate, optional standard day minutes (DAY only), rate caps |
| WorkEntry | assignment, work_date (unique pair), active revision, version |
| WorkRevision | input mode, portion or minutes, rate and basis snapshot, earned, note, reason (required after the first revision) |
| DayReview | project, date, payments reviewed time |
| Payment | receipt number, date, method, amount, recipient, reference, clearance (checks only), version |
| Allocation | payment, assignment, positive amount; sum equals payment |
| Reversal and lines | payment, kind, reason; per-allocation amounts, capped at unreversed amount |
| Reimbursement | assignment, date, amount, description |
| Adjustment | assignment, date, direction, category, amount, reason |
| LedgerEvent | assignment, effective date, type, signed delta, source; append-only (trigger blocks update and delete) |
| Receipt | payment and version (unique), immutable snapshot, status |
| Statement | worker, optional project, period, immutable snapshot |
| ShareLink | target, view, worker, language, token hash (unique), sent via, expiry, revoked, first and last opened, open count |
| Acknowledgment | link, kind (received or query), name, note, resolved time; one "received" per link |
| Evidence | parent, object key, SHA-256, type, size, scan state |
| ReminderPreference | project, time, enabled, device |
| PaymentSignature | payment, worker, typed name, signature image (evidence), language, exact sentence, amount, time; one per worker per payment |
| Worker (1.2) | adds documents language: en or es |
| Views | `assignment_totals` (earned, reimbursed, added, taken off, paid, reversed, balance) and `worker_year_paid` |
| AuditEvent, IdempotencyKey | actor and action; operation ID with request hash and stored response |

**Nightly reconciliation job.** For every assignment, the job recomputes the balance from ledger events and compares it with the cached balance. It also checks that every payment's allocations sum to the payment amount, and that no allocation's reversals exceed it. Any mismatch alerts immediately.

# 14 API contracts

Owner APIs require an authenticated session and enforce workspace ownership. Writes carry an operation_id and, when updating, an expected_version. Responses return canonical values, the new version, and the server sequence. Financial writes are Postgres functions called over RPC; the table below lists them by purpose, with HTTP-style paths for clarity.

| Call | Contract |
|---|---|
| GET /me | Workspace, currency, defaults |
| GET /projects · POST /projects · PATCH /projects/{id} | List; create (name, timezone, work days); update, archive, reopen with version |
| GET /workers · POST /workers · PATCH /workers/{id} | List; create; update or deactivate |
| POST /assignments | Project, worker, start date, first pay agreement |
| POST /assignments/{id}/agreements | Effective date, basis, rate, day minutes. Backdated → 409 with correction preview unless confirm_correction=true and a reason is given |
| GET /projects/{id}/day/{date} | Cards for that date: agreements, entries, earned, day review state |
| PUT /work/{assignment}/{date} | Mode, portion or minutes, note, expected_version, operation_id. Returns earned and delta |
| POST /work/{assignment}/{date}/void | Reason, expected_version |
| POST /projects/{id}/day/{date}/mark-rest | operation_id; records No work for Unrecorded assignments only; returns the count |
| POST /projects/{id}/day/{date}/review | Marks payments reviewed |
| POST /payments | Date, method, amount, recipient, reference, allocation lines, operation_id |
| POST /payments/{id}/reversals | Kind, reason, optional lines, expected_version |
| POST /payments/{id}/clearance | Cleared or Returned (returned triggers full reversal) |
| POST /reimbursements · POST /adjustments | Assignment, date, amount, and description or direction, category, reason |
| GET /balances | Per assignment and per worker; posted only |
| GET /ledger | Filters (project, worker, dates); opening, rows, closing; paged |
| GET /work | History filters; paged |
| POST /receipts | Payment ID and version → snapshot (existing one returned if present) |
| POST /statements | Worker, optional project, period → snapshot |
| POST /evidence/uploads | Parent, type, size, checksum → short-lived upload URL |
| POST /links · DELETE /links/{id} | Receipt, worker view, language → token (returned once) and message text; revoke |
| GET /r/{token} · POST /r/{token}/ack | Public receipt page (HTML); acknowledgment (received, or question with note); rate-limited |
| POST /exports | Scope and format → file (CSV in Release 1; XLSX in 1.1) |
| POST /account/export · POST /account/delete | Full data export; deletion request with confirmation |
| POST /devices | Installation ID, platform (for reminder-device choice) |
| GET /payouts/preview?project_id= | Workers owed money with prefilled amounts |
| POST /payouts | operation_id, date, lines (assignment, amount, method, reference) → one payment per line, all or nothing |
| POST /payments/{id}/signatures | Worker, typed name, signature image (uploaded as evidence first), language, sentence → no ledger effect |
| GET /projects/{id}/summary | To-date totals, weekly earned, per-worker totals |
| GET /reports/year-totals?year= | Net paid, earned and reimbursed per worker; CSV export |

## Payment example

For a $300 payment: amount_minor = 30000, method = BANK_TRANSFER, recipient = "Crew lead", allocations = [{A, 20000}, {B, 10000}]. The function checks 20000 + 10000 = 30000 and that both assignments belong to the workspace. In one transaction it writes the payment, two allocations, two ledger events, the audit event, and the idempotency record.

## Errors

| Code | Meaning |
|---|---|
| 400 | Malformed input |
| 401 | Session expired |
| 404 | Not found, or not yours; the two are indistinguishable by design |
| 409 | Stale version, or operation ID reused with a different payload |
| 422 | Business rule failed (split mismatch, date outside assignment, basis mismatch) |
| 429 | Throttled; retry later |

An identical retry returns the stored result, even if the first response was lost. A queue flush returns one result per operation and never implies that all entries succeeded. Errors carry a safe correlation ID, never a stack trace.

# 15 Privacy, security and account lifecycle

## Security baseline

Session tokens stay in platform secure storage. No secrets live in the app bundle, preferences, or analytics. Transport uses TLS, and stored files are encrypted. Every read is covered by row-level security, and every write by a function that checks ownership. Storage paths are keyed by workspace and served only through short-lived signed URLs. Optional biometric lock falls back to device credentials and can never lock the owner out of their cloud records.

Logs keep operation IDs and statuses only. They never hold names, addresses, phone numbers, payment references, evidence, tokens, or notes.

## Permissions

| Permission | When requested | If declined |
|---|---|---|
| Notifications | When the owner turns on reminders | In-app reminder card |
| Camera | On "Take photo" | Choose photo or file still works |
| Photos | Not requested; the system picker grants only the chosen items | n/a |
| Contacts | Not requested; the system contact picker returns only the chosen contact | Manual entry |

The app does not use location, microphone, SMS access, or background tracking.

## Account deletion and export

Account deletion is in the app under More → Account → Delete account, and is also available as a web request page, because Google Play requires a web option as well. After an authenticated confirmation, the app:

- revokes sessions and links,
- stops reminders,
- queues cloud record and file deletion,
- clears local data.

Backups age out under the published retention period. The app explains that copies already sent to workers can't be recalled. Data export produces a ZIP with CSV files and all receipt and statement PDFs.

## Retention

Financial history is kept until the owner deletes it; archiving is the normal way to close a project. Operational logs are kept 30 days and backups 30 days. The final policy is published before launch. These are product choices, not legal advice.

## Worker data

Worker names and contact details are personal data about third parties. The privacy notice says so, explains they are used only to label records and address shares, and tells owners how to delete them.

## Abuse controls

Rate limits cover sign-in codes, public link lookups, uploads, and exports. An owner can report an exposed link and revoke it at once. Support diagnostics use redacted logs and records the owner chooses to share. Downloading an owner's full ledger is never the default support path.

# 16 Performance, operations and recovery

| Measure | Target |
|---|---|
| Tap to "Saved" on a card | Under 150 ms (local write) |
| Today screen from cache | Under 500 ms on a mid-range phone |
| Online financial write | Under 2 s p95, excluding uploads |
| Queue starts sending | Within 5 s of usable connectivity |
| Crash-free sessions | At least 99.8% in pilot |
| Service availability | 99.5% monthly initial target |
| Recovery point | Minutes (point-in-time recovery enabled) |
| Recovery time | Within one business day |
| Scale fixture | 20 projects, 200 workers, 50,000 ledger events per workspace |

Long lists are virtualized, the ledger and history are paged, and evidence is never loaded in full into memory. Targets are validated on real devices, not simulators.

**Monitoring:** crash rate, queue failures, age of Needs review items, failed payment writes, receipt failures, upload failures, reconciliation mismatches, and any suspected cross-workspace access. The last two alert immediately. Telemetry contains no amounts.

**Backups and restore:** database point-in-time recovery plus storage versioning. An isolated restore is rehearsed before launch and quarterly after that, checking receipts, evidence access, idempotency records, and links. Replaying requests after a restore must not repost money.

**Migrations and rollback:** server migrations are additive only. If a change breaks writes, pause the affected calls with a clear message rather than risk bad data. Never restore an old database over newer financial activity.

**Diagnostics screen:** app version, last successful refresh, pending count, support ID, Send now, and Export pending entries. It warns that uninstalling removes unsent entries.

# 17 Acceptance tests and release gates

| # | Scenario | Expected result | Req |
|---|---|---|---|
| T01 | Different daily rates | Full days at $240 and $180 earn $420 combined | 03, 04 |
| T02 | Hourly entry | 7 h 30 m at $30/hr earns $225.00 | 03, 04 |
| T03 | Hourly rounding | 1 h 20 m at $27.50/hr earns $36.67; 15 m at $22.50/hr earns $5.63 | 04 |
| T04 | Partial day | ½ at $240 earns $120; 0.3333 at $250 earns $83.33 | 04 |
| T05 | Hours on daily worker | 3 of 8 h at $240/day earns $90, one rounding step | 04 |
| T06 | Wrong input for basis | Day portion on an hourly agreement is rejected | 03 |
| T07 | Blank stays blank | Unanswered worker stays Unrecorded, not No work | 04 |
| T08 | Mark rest as no work | Only Unrecorded workers change; recorded entries untouched; count shown | 04 |
| T09 | Non-work day | Unrecorded Sunday is not Missing and triggers no reminder | 04, 11 |
| T10 | Undo | Undo within 5 s leaves no ledger row | 04 |
| T11 | Correction | Full → half posts −$90 at $180/day; old revision kept | 04, 05 |
| T12 | Backdated rate | Preview lists every affected day; commit posts all differences; cancel changes nothing | 03 |
| T13 | Basis change | Daily → hourly before last recorded date is rejected | 03 |
| T14 | Project isolation | Rates and balances stay separate by project | 03, 05 |
| T15 | Split payment | Allocations must equal payment; mismatch rejected with no rows written | 06 |
| T16 | Advance warning | Allocation below zero shows resulting advance before recording | 06 |
| T17 | Advance not netted | One worker's advance never reduces another's amount owed | 05 |
| T18 | Check lifecycle | Issue credits once; clear adds nothing; return reverses all lines | 06 |
| T19 | Partial reversal | Cannot reverse more than the unreversed amount | 06 |
| T20 | Double tap / lost response | One payment, one set of ledger rows; retry returns same result | 06 |
| T21 | Reimbursement | Increases owed; shown apart from earnings on statement and export | 07 |
| T22 | Per-worker receipt | Worker view shows only that worker's line; total hidden when split | 08 |
| T23 | Full split view | Offered only for the named recipient, with warning text | 08 |
| T24 | Honest status | Check shows "clearance not confirmed"; cash shows "recorded by owner" | 08 |
| T25 | Statement ties out | Opening + lines = closing = ledger balance at generation | 09, 13 |
| T26 | Statement gaps | Unrecorded work days show "Not recorded", not $0 | 09 |
| T27 | Texted link and acknowledgment | Messages opens prefilled; page shows only that worker's share; confirm recorded once; question needs a note; ledger unchanged | 10 |
| T28 | Link expiry and revoke | Expired, revoked and unknown links all show the same "not available" page | 08, 10 |
| T29 | App killed without signal | Pending entries survive restart and send once | 12 |
| T30 | Stale queued entry | Moves to Needs review with both versions; nothing lost | 12 |
| T31 | Payment without signal | Record disabled with reason; draft kept | 12 |
| T32 | Reminders | Denied permission, DST shift, travel, reboot, and snooze behave as specified | 11 |
| T33 | Large text and screen reader | Every primary action reachable and announced | — |
| T34 | Export reconciliation | Opening + deltas = closing for every worker and project | 13 |
| T35 | Cross-workspace | Any reference to another workspace is rejected (function and foreign key) | 15 |
| T36 | Account deletion | In-app and web paths both work; sessions and links revoked | 16 |
| T37 | Migration | Every migrated worker balance equals the web app's balance | 14 |
| T38 | Restore | Restored data reconciles; replayed requests post nothing twice | — |
| T39 | Pay what's owed | Four workers → four payments, four receipt numbers, balances to zero | 17 |
| T40 | Payout is atomic | One bad line → nothing recorded; retry with same ID → no double payout | 17 |
| T41 | Signature | Saved with typed name, image and exact sentence; ledger unchanged; receipt shows the signed line | 18 |
| T42 | Signature rules | Worker not on the payment, or payment reversed → rejected; one signature per worker per payment | 18 |
| T43 | Signature without signal | Saved on phone, sent after the payment exists, never duplicated | 18 |
| T44 | Project summary | Totals and per-worker lines tie to ledger; weeks follow project timezone | 19 |
| T45 | Spanish documents | Same numbers as English; no untranslated strings; status lines keep meaning | 20 |
| T46 | Sample project | No network writes while in sample; removed when first real project is created | 21 |
| T47 | Year-end totals | Net paid = payments − reversals by payment date for the year | 22 |
| T48 | List view | Nine workers fit on one screen; Unrecorded filter hides recorded workers; choice remembered | 04 |

T01–T06, T11, T15, T17–T20, T35, and the section 8 sequence run today as automated tests against the Appendix A schema.

## Release gates (Release 1)

- All money, isolation, idempotency, and no-signal tests pass on a real iPhone and a real Android phone.
- No open critical or high security or balance defects.
- Reconciliation job running in staging with zero mismatches for 7 days.
- Restore rehearsed.
- Account deletion works in the app and on the web.
- Privacy policy, App Privacy details (Apple), and Data safety form (Google) match the build.
- Pilot of at least 5 owners with real projects for 2 weeks (TestFlight and a Play closed test).

# 18 Delivery plan: fast to both stores

## Start now: accounts (critical path)

Store accounts take longer than people expect. Start them on day one, in parallel with the build.

| Item | Why | Time |
|---|---|---|
| D-U-N-S number for the publishing company | Needed to enroll as an organization on both stores | Free; up to 30 days |
| Apple Developer Program (organization) | Publish on the App Store; seller name shows as the company | $99 a year; verification after D-U-N-S |
| Google Play Console (organization) | Organization accounts go straight to production. Personal accounts created after 13 Nov 2023 must first run a closed test with at least 12 testers opted in for 14 days in a row | $25 one time |
| Domain, privacy policy, support page, account-deletion web page | Required by both stores | 1–2 days |
| Expo account and EAS plan | Cloud builds and submission | Same day |

Builds from week 1 still need an Apple account to install on iPhones. If the organization enrollment isn't active in week 1, enroll as an individual now and convert the membership to an organization once the D-U-N-S number arrives (Apple supports this conversion through developer support). Confirm the conversion path with Apple at enrollment.

If the Google organization account isn't verified by week 5, fall back to a personal Google Play account. Start its 14-day closed test in week 6 using pilot owners and team members, so it finishes before the week-8 submission. The app can move to an organization account later.

## Current route: Replit, iPhone first

The active plan is the Replit build pack: one person driving Replit Agent through nine phases, with the database money functions already written and tested. Estimate with the 1.2 additions, including texted receipt links: **about 7 weeks to App Store submission**, plus Apple review. The team timeline below stays as the reference for a staffed build.

## Build timeline (staffed team reference)

| Week | Work | Exit check |
|---|---|---|
| 1 | Spike and pipeline: Expo dev build, auth (email code, Apple, Google), schema from Appendix A, work queue, local notification, PDF share. EAS build uploaded to TestFlight and Play internal testing | Installs on real iPhone and Android phones (EAS internal builds; TestFlight and Play internal testing as soon as each account is active) |
| 2 | Projects, workers, assignments, daily and hourly agreements, work days | Owner can set up a project end to end |
| 3 | Today screen: per-tap save, Undo, Mark rest, hours sheet, queue and Needs review | T01–T10, T29–T30 pass |
| 4 | Payments: form, split, advance warning, checks, reversals, idempotency | T15–T20 pass |
| 5 | Reimbursements, adjustments, balances, ledger, work history, CSV export, backdated rate preview | T11–T14, T21, T34 pass; pilot build to 5 owners |
| 6 | Receipts and statements (snapshots, PDF, share sheet, per-worker view), evidence capture | T22–T26 pass; Play closed test starts if needed |
| 7 | Reminders, account deletion and export, accessibility pass, diagnostics, store listing, privacy forms, migration script dry run | T31–T33, T36–T37 pass |
| 8 | Hardening from pilot, restore rehearsal, release gates, submit to both stores | Gates in section 17 met |
| 9–12 | Release 1.1: secure links, acknowledgment, scanning, in-app import, XLSX, tablet layout | T27–T28 pass |

Store review isn't included in the 8 weeks and isn't guaranteed. Apple typically answers within a few days. Google's production review for a new account can take up to about a week. Plan the public launch for week 9 or 10.

**Estimate:** 8 weeks to submission is tight but realistic for the Release 1 scope with this team. Treat 8–10 weeks as the range, and re-estimate at the end of week 1.

## Team

- One senior React Native / Expo engineer.
- One full-stack engineer (Postgres, server functions, the migration script).
- Part-time product design in weeks 1–3.
- Part-time QA in weeks 5–8.

If the team is a single AI-assisted engineer, add 50% to the timeline and keep the same scope order.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| D-U-N-S or org verification slow | Store submission slips | Start day one; personal Play account fallback with the 14-day test started by week 6 |
| Store rejection | 1–2 week slip | Checklist in Appendix C; demo account for reviewers; no "verified", "payroll", or "bank" claims |
| Notification behavior differs by Android maker | Missed reminders | In-app reminder card always; test on Samsung and Pixel |
| Backdated rate and correction edge cases | Wrong balances | Server-side functions only; vectors and reconciliation job from week 1 |
| Scope creep toward full offline | Release 1 slips | Release 2 boundary written into this spec |
| Migration data doesn't reconcile | First user starts with wrong balances | Dry run in week 7; owner signs off per worker |

# 19 Decisions and references

## Settled in this baseline

| Decision | Choice |
|---|---|
| Product or personal tool | A product for other people |
| Offline | Online-first with durable work entry; full offline sync in Release 2 |
| Audience | Day and hourly workers; fixed-price jobs in Release 2 |
| Pay basis | Daily or hourly per assignment, effective dated |
| Stack | Expo; Replit-hosted Node API and PostgreSQL; Replit publish flow (iPhone first) |
| Migration | One-time team-run migration from the existing web app |
| Launch platforms | iPhone first; Android later from the same code; iPad runs the iPhone app |
| Launch currency | USD |
| Product name | CrewTally · subtitle "Work and pay for day workers" · bundle ID com.crewtallyapp.crewtally |
| Link expiry | 30 days for receipts, 90 days for statements |

## Still open

| Decision | Default until decided |
|---|---|
| Publisher website | crewtallyapp.com (bought); privacy, support and account-deletion pages live there |
| Publishing entity on both stores | An organization account with D-U-N-S |
| Pricing | Free during pilot; no billing code in Release 1. See the proposal below and decide before public launch |
| Backup and restore on Replit | Nightly encrypted dump until Replit's point-in-time restore is confirmed |
| Minimum OS versions | Whatever the Expo SDK chosen at kickoff supports |
| Launch countries | United States |

## Pricing proposal (to decide before public launch)

A starting point, not a decision. Test it with pilot owners before committing.

| Option | How it works | Fit |
|---|---|---|
| **Free with limits, then subscription** (recommended to test) | Free for 1 active project and up to 3 workers. A paid tier unlocks unlimited projects and workers. Spanish documents stay free | Homeowners with one job pay nothing; landlords and crew leads who use it all year pay |
| One-time purchase | Pay once, unlock everything | Simple, but no recurring income to cover hosting |
| Per-project pass | Pay per project for its duration | Matches how remodels work, but unusual on the App Store |

Payments for digital features inside an iPhone app go through Apple's in-app purchase, and Apple takes a share. Adding billing means another App Store review, so plan it as its own release after the pilot.

## Partner access (Release 1.1)

A spouse, partner or site lead can use the same workspace.

- The owner invites them by email or a one-time invite link. The partner signs in with their own Apple ID.
- Roles:
  - **Owner:** everything, including account deletion and removing partners.
  - **Partner:** records work, payments, reimbursements, receipts and statements. Can't delete the account, change pay rates, or remove people.
- Every ledger row, payment and signature records who did it (`actor_id`). It shows in history and on receipts as "Recorded by".
- Removing a partner ends their sessions; their past records stay.
- Needs: a `workspace_members` table, invite tokens (hashed, 7-day expiry), role checks on every write, and actor IDs on the money functions.

## Checking with real owners (before Phase 3)

Show the screens to three or four people who pay day or hourly workers: a homeowner mid-remodel, a small landlord, a crew lead. Twenty minutes each, on a phone, using the design canvas in Play mode.

1. "Tell me how you keep track of who worked and what you paid today."
2. Hand them Today: "Marco worked a full day, Sam worked 8 hours. Record that." Watch; don't help.
3. "It's Friday. Pay everyone what they're owed." Watch the pay-what's-owed flow.
4. "Get proof that Marco got his cash." Watch the hand-over.
5. "What would stop you using this?" and "What would you pay for it, if anything?"

Note where they hesitate, what they call things, and anything they expected but didn't find. If two or more people stumble on the same step, change the design before Phase 3.

## References (checked 24 September 2026)

- React Native: starting a new app through a framework (Expo recommended). https://reactnative.dev/docs/environment-setup
- Expo SDK 57 release notes (React Native 0.86). https://expo.dev/changelog/sdk-57
- Apple: upcoming SDK minimum requirements (Xcode 26 and iOS 26 SDK from 28 April 2026). https://developer.apple.com/news/upcoming-requirements/
- Apple: scheduling local notifications. https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app
- Google Play: target API level requirements (API 36 for new apps and updates from 31 August 2026). https://developer.android.com/google/play/requirements/target-sdk
- Google Play: testing requirements for new personal developer accounts (12 testers, 14 days). https://support.google.com/googleplay/android-developer/answer/14151465
- Android: notification runtime permission. https://developer.android.com/develop/ui/compose/notifications/notification-permission

Store rules change often. Recheck every item in Appendix C in the week before submission.

## Definition of done (Release 1)

The owner is live on both stores and can:

- run several projects,
- record each worker's full day, partial day, or hours in a tap, even without signal,
- record and split payments made outside the app,
- pay back materials,
- understand every balance,
- share each worker a receipt or statement that shows only their own records, in English or Spanish,
- pay the whole crew in one step and get a signature for cash,
- see what the project has cost in labor so far.

Every posted amount traces to a ledger row, and every unsent entry and unresolved conflict is visible.

# Appendix A: Reference SQL schema

The schema below is the one shipped in the Replit build pack (`db/schema.sql`). It holds every money-writing function: work entry, mark rest, payments, pay what's owed, reversals, checks, corrections, reimbursements, adjustments, rate changes with preview, hand-over signatures, texted-link open and acknowledge, and account deletion. It was loaded into PostgreSQL 16 and exercised by seven test files (`db/tests/01`–`07`) covering the pay vectors, the section 8 sequence, idempotent retries, stale versions, split and payout atomicity, check lifecycle, partial refunds, corrections, backdated rate changes, signatures, links, the totals views, isolation and deletion. All pass.

```sql
-- CrewTally: reference schema (PostgreSQL 15+)
-- All money is integer minor units (USD cents). Dates are local DATE values
-- in the project timezone. Timestamps are UTC (timestamptz).
-- Clients never write these tables directly: every financial write goes
-- through a SECURITY DEFINER function that checks ownership, versions and
-- idempotency in one transaction. Row-level security covers reads only.

-- gen_random_uuid() is built into PostgreSQL 13+; no extension needed.

-- ---------- tenancy ----------
create table workspaces (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique,              -- one owner, one workspace (Release 1)
  name              text not null,
  currency_code     char(3) not null default 'USD',
  currency_exponent smallint not null default 2 check (currency_exponent between 0 and 3),
  currency_locked   boolean not null default false,    -- set true on first financial posting
  receipt_seq       integer not null default 0,
  created_at        timestamptz not null default now()
);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  name         text not null check (length(name) between 1 and 80),
  address      text,
  timezone     text not null,                          -- IANA name, e.g. America/New_York
  work_days    smallint[] not null default '{1,2,3,4,5,6}', -- ISO weekday 1=Mon..7=Sun
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id)
);

create table workers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  display_name text not null check (length(display_name) between 1 and 60),
  phone        text,
  email        text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  document_language text not null default 'en' check (document_language in ('en','es')), -- receipts, statements, hand-over text
  version      integer not null default 1,
  unique (workspace_id, id)
);

create table assignments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  worker_id    uuid not null,
  start_date   date not null,
  end_date     date,
  version      integer not null default 1,
  unique (workspace_id, id),
  unique (project_id, worker_id),
  check (end_date is null or end_date >= start_date),
  foreign key (workspace_id, project_id) references projects (workspace_id, id),
  foreign key (workspace_id, worker_id)  references workers  (workspace_id, id)
);

-- Pay agreement: daily OR hourly, effective dated per assignment.
create table rate_agreements (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null,
  assignment_id        uuid not null,
  effective_from       date not null,
  pay_basis            text not null check (pay_basis in ('DAY','HOUR')),
  rate_minor           bigint not null check (rate_minor > 0),
  standard_day_minutes integer check (standard_day_minutes between 60 and 1440),
  created_at           timestamptz not null default now(),
  unique (assignment_id, effective_from),
  unique (workspace_id, id),
  check (pay_basis = 'DAY' or standard_day_minutes is null),
  check ((pay_basis = 'DAY'  and rate_minor <= 500000)    -- $5,000/day cap
      or (pay_basis = 'HOUR' and rate_minor <= 100000)),  -- $1,000/hour cap
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

-- ---------- work ----------
create table work_entries (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  assignment_id   uuid not null,
  work_date       date not null,
  active_revision integer not null,
  version         integer not null default 1,
  unique (assignment_id, work_date),
  unique (workspace_id, id),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table work_revisions (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null,
  entry_id               uuid not null,
  revision               integer not null,
  input_mode             text not null check (input_mode in
                           ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES','NO_WORK','VOID')),
  portion                numeric(5,4) check (portion > 0 and portion <= 1),
  minutes                integer check (minutes between 1 and 1440),
  rate_agreement_id      uuid,
  pay_basis_snapshot     text,
  rate_minor_snapshot    bigint,
  std_minutes_snapshot   integer,
  earned_minor           bigint not null check (earned_minor >= 0),
  note                   text,
  reason                 text,          -- required for revision > 1
  created_at             timestamptz not null default now(),
  unique (entry_id, revision),
  check (revision = 1 or reason is not null),
  check (
    (input_mode = 'DAY_PORTION'  and portion is not null and minutes is null) or
    (input_mode = 'DAY_MINUTES'  and minutes is not null and portion is null) or
    (input_mode = 'HOUR_MINUTES' and minutes is not null and portion is null) or
    (input_mode in ('NO_WORK','VOID') and portion is null and minutes is null and earned_minor = 0)
  ),
  foreign key (workspace_id, entry_id) references work_entries (workspace_id, id)
);

create table day_reviews (
  workspace_id         uuid not null,
  project_id           uuid not null,
  work_date            date not null,
  payments_reviewed_at timestamptz not null default now(),
  primary key (project_id, work_date),
  foreign key (workspace_id, project_id) references projects (workspace_id, id)
);

-- ---------- money ----------
create table payments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id),
  receipt_no      integer not null,
  payment_date    date not null,
  method          text not null check (method in ('CASH','CHECK','BANK_TRANSFER','ZELLE','OTHER')),
  method_note     text,
  amount_minor    bigint not null check (amount_minor > 0 and amount_minor <= 10000000), -- $100,000 cap
  recipient_label text not null,
  reference       text,
  note            text,
  clearance       text check (clearance in ('ISSUED','CLEARED','RETURNED')),
  replaces_payment_id uuid,                    -- set when this payment corrects an earlier one
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, receipt_no),
  check ((method = 'CHECK') = (clearance is not null)),
  check (method <> 'OTHER' or method_note is not null)
);

create table allocations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  payment_id    uuid not null,
  assignment_id uuid not null,
  amount_minor  bigint not null check (amount_minor > 0),
  unique (payment_id, assignment_id),
  unique (workspace_id, id),
  foreign key (workspace_id, payment_id)    references payments    (workspace_id, id),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table reversals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  payment_id   uuid not null,
  kind         text not null check (kind in ('FULL','PARTIAL','CHECK_RETURNED','CORRECTION')),
  reason       text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id)
);

create table reversal_lines (
  reversal_id   uuid not null references reversals(id),
  allocation_id uuid not null references allocations(id),
  amount_minor  bigint not null check (amount_minor > 0),
  primary key (reversal_id, allocation_id)
);

create table reimbursements (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  assignment_id uuid not null,
  reimb_date    date not null,
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 5000000),
  description   text not null,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

create table adjustments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  assignment_id uuid not null,
  adj_date      date not null,
  direction     text not null check (direction in ('INCREASE_OWED','DECREASE_OWED')),
  category      text not null check (category in ('OPENING_BALANCE','BONUS','OVERTIME','DEDUCTION','OTHER')),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 10000000),
  reason        text not null,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);

-- Append-only financial ledger. Balance = sum(signed_delta) per assignment.
-- Positive = owed to worker, zero = settled, negative = advance.
create table ledger_events (
  seq            bigint generated always as identity primary key,
  workspace_id   uuid not null,
  assignment_id  uuid not null,
  effective_date date not null,
  event_type     text not null check (event_type in
                   ('EARNING','EARNING_CORRECTION','REIMBURSEMENT','ADJUSTMENT',
                    'PAYMENT','PAYMENT_REVERSAL')),
  signed_delta   bigint not null check (signed_delta <> 0),
  source_type    text not null,
  source_id      uuid not null,
  created_at     timestamptz not null default now(),
  foreign key (workspace_id, assignment_id) references assignments (workspace_id, id)
);
create index ledger_by_assignment on ledger_events (assignment_id, effective_date, seq);

-- The only exception: delete_workspace_data() (account deletion) sets a transaction-local
-- flag naming the workspace being deleted; only that workspace's rows may then be deleted.
create function ledger_is_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('workpay.deleting_workspace', true) = old.workspace_id::text then
    return old;
  end if;
  raise exception 'ledger_events is append-only';
end $$;
create trigger ledger_no_update before update or delete on ledger_events
  for each row execute function ledger_is_append_only();

-- ---------- records, sharing, evidence ----------
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  payment_id      uuid not null,
  payment_version integer not null,
  snapshot        jsonb not null,             -- immutable facts at generation
  status          text not null default 'CURRENT' check (status in ('CURRENT','SUPERSEDED','REVERSED')),
  created_at      timestamptz not null default now(),
  unique (payment_id, payment_version),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id)
);

create table statements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  worker_id    uuid not null,
  project_id   uuid,                           -- null = all projects
  period_from  date not null,
  period_to    date not null check (period_to >= period_from),
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  foreign key (workspace_id, worker_id) references workers (workspace_id, id)
);

create table share_links (                     -- Release 1 (texted receipt and statement links)
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id),
  target_type      text not null check (target_type in ('RECEIPT','STATEMENT')),
  target_id        uuid not null,
  view             text not null check (view in ('WORKER','FULL')),
  view_worker_id   uuid,                       -- required for WORKER view
  language         text not null default 'en' check (language in ('en','es')),
  token_hash       bytea not null unique,      -- sha256 of a 256-bit random token; the token itself is never stored
  sent_via         text not null default 'SMS' check (sent_via in ('SMS','SHARE_SHEET','COPY')),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  open_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  check (view = 'FULL' or view_worker_id is not null)
);

create table acknowledgments (                 -- Release 1 (worker taps "I received this" or "I have a question")
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id),
  share_link_id uuid not null references share_links(id),
  kind          text not null check (kind in ('RECEIVED','QUERY')),
  typed_name    text check (length(typed_name) <= 80),
  note          text check (length(note) <= 500),
  resolved_at   timestamptz,                   -- owner marks a QUERY resolved
  created_at    timestamptz not null default now()
);
create unique index one_received_per_link on acknowledgments (share_link_id) where kind = 'RECEIVED';

create table evidence (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  parent_type  text not null check (parent_type in ('PAYMENT','REIMBURSEMENT')),
  parent_id    uuid not null,
  object_key   text not null,
  sha256       bytea not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','application/pdf')),
  byte_size    integer not null check (byte_size between 1 and 10485760),
  scan_state   text not null default 'NOT_REQUIRED' check (scan_state in ('NOT_REQUIRED','PENDING','CLEAN','REJECTED')),
  created_at   timestamptz not null default now()
);

create table reminder_preferences (
  project_id             uuid primary key references projects(id),
  workspace_id           uuid not null references workspaces(id),
  local_time             time not null default '18:00',
  enabled                boolean not null default true,
  device_installation_id text,
  version                integer not null default 1
);

create table audit_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  actor_id     uuid not null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now()
);

create table idempotency_keys (
  workspace_id uuid not null,
  operation_id uuid not null,
  request_hash text not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, operation_id)
);

-- ---------- derived ----------
create view assignment_balances as
select a.workspace_id, a.id as assignment_id, a.project_id, a.worker_id,
       coalesce(sum(l.signed_delta), 0) as balance_minor
from assignments a left join ledger_events l on l.assignment_id = a.id
group by a.workspace_id, a.id, a.project_id, a.worker_id;

-- ---------- calculation ----------
-- One rounding step, half up (inputs are non-negative, so round() is half up).
create function fn_earned(p_basis text, p_rate bigint, p_mode text,
                          p_portion numeric, p_minutes integer, p_std integer)
returns bigint language plpgsql immutable as $$
begin
  if p_mode in ('NO_WORK','VOID') then return 0; end if;
  if p_mode = 'DAY_PORTION'  and p_basis = 'DAY'  then return round(p_rate * p_portion); end if;
  if p_mode = 'DAY_MINUTES'  and p_basis = 'DAY'  and p_std is not null
     then return round(p_rate::numeric * p_minutes / p_std); end if;
  if p_mode = 'HOUR_MINUTES' and p_basis = 'HOUR' then return round(p_rate::numeric * p_minutes / 60); end if;
  raise exception 'input mode % not valid for pay basis %', p_mode, p_basis using errcode = '22023';
end $$;

-- ---------- write path: work ----------
-- Records or corrects one assignment/date. expected_version = 0 means "new entry".
create function record_work(p_workspace uuid, p_operation uuid, p_assignment uuid,
                            p_date date, p_mode text, p_portion numeric, p_minutes integer,
                            p_expected_version integer, p_reason text, p_note text)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_assignment, p_date, p_mode, p_portion, p_minutes, p_expected_version));
  v_prior idempotency_keys; v_ra rate_agreements; v_entry work_entries;
  v_prev_earned bigint := 0; v_earned bigint; v_rev integer; v_result jsonb;
  v_asg assignments; v_proj projects;
begin
  select * into v_prior from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'operation reused with different payload' using errcode = '40001'; end if;
    return v_prior.response;
  end if;

  select * into v_asg from assignments where id = p_assignment and workspace_id = p_workspace;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into v_proj from projects where id = v_asg.project_id;
  if v_proj.status <> 'ACTIVE' then raise exception 'project archived' using errcode = '22023'; end if;
  if p_date < v_asg.start_date or (v_asg.end_date is not null and p_date > v_asg.end_date) then
    raise exception 'date outside assignment' using errcode = '22023'; end if;

  select * into v_ra from rate_agreements
   where assignment_id = p_assignment and effective_from <= p_date
   order by effective_from desc limit 1;
  if not found then raise exception 'no pay agreement for date' using errcode = '22023'; end if;

  v_earned := fn_earned(v_ra.pay_basis, v_ra.rate_minor, p_mode, p_portion, p_minutes, v_ra.standard_day_minutes);

  select * into v_entry from work_entries where assignment_id = p_assignment and work_date = p_date for update;
  if found then
    if v_entry.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
    select earned_minor into v_prev_earned from work_revisions
      where entry_id = v_entry.id and revision = v_entry.active_revision;
    v_rev := v_entry.active_revision + 1;
    update work_entries set active_revision = v_rev, version = version + 1 where id = v_entry.id
      returning * into v_entry;
  else
    if p_expected_version <> 0 then raise exception 'stale version' using errcode = '40001'; end if;
    v_rev := 1;
    insert into work_entries (workspace_id, assignment_id, work_date, active_revision)
      values (p_workspace, p_assignment, p_date, 1) returning * into v_entry;
  end if;

  insert into work_revisions (workspace_id, entry_id, revision, input_mode, portion, minutes,
     rate_agreement_id, pay_basis_snapshot, rate_minor_snapshot, std_minutes_snapshot,
     earned_minor, note, reason)
  values (p_workspace, v_entry.id, v_rev, p_mode, p_portion, p_minutes,
     v_ra.id, v_ra.pay_basis, v_ra.rate_minor, v_ra.standard_day_minutes, v_earned, p_note, p_reason);

  if v_earned - v_prev_earned <> 0 then
    insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
    values (p_workspace, p_assignment, p_date,
            case when v_rev = 1 then 'EARNING' else 'EARNING_CORRECTION' end,
            v_earned - v_prev_earned, 'WORK_ENTRY', v_entry.id);
    update workspaces set currency_locked = true where id = p_workspace;
  end if;

  v_result := jsonb_build_object('entry_id', v_entry.id, 'version', v_entry.version,
                                 'revision', v_rev, 'earned_minor', v_earned,
                                 'delta_minor', v_earned - v_prev_earned);
  insert into idempotency_keys values (p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: payment ----------
-- p_allocations: [{"assignment_id": "...", "amount_minor": 20000}, ...]
create function record_payment(p_workspace uuid, p_operation uuid, p_date date, p_method text,
                               p_method_note text, p_amount bigint, p_recipient text,
                               p_reference text, p_allocations jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_date, p_method, p_amount, p_recipient, p_reference, p_allocations::text));
  v_prior idempotency_keys; v_sum bigint; v_bad integer; v_no integer;
  v_payment payments; v_line jsonb; v_alloc allocations; v_result jsonb;
begin
  select * into v_prior from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'operation reused with different payload' using errcode = '40001'; end if;
    return v_prior.response;
  end if;

  select coalesce(sum((l->>'amount_minor')::bigint), 0) into v_sum from jsonb_array_elements(p_allocations) l;
  if v_sum <> p_amount then
    raise exception 'allocations total % does not equal payment %', v_sum, p_amount using errcode = '22023'; end if;

  select count(*) into v_bad from jsonb_array_elements(p_allocations) l
   where (l->>'amount_minor')::bigint <= 0
      or not exists (select 1 from assignments a
                     where a.id = (l->>'assignment_id')::uuid and a.workspace_id = p_workspace);
  if v_bad > 0 then raise exception 'invalid allocation line' using errcode = '22023'; end if;

  update workspaces set receipt_seq = receipt_seq + 1, currency_locked = true
   where id = p_workspace returning receipt_seq into v_no;

  insert into payments (workspace_id, receipt_no, payment_date, method, method_note, amount_minor,
                        recipient_label, reference, clearance)
  values (p_workspace, v_no, p_date, p_method, p_method_note, p_amount, p_recipient, p_reference,
          case when p_method = 'CHECK' then 'ISSUED' end)
  returning * into v_payment;

  for v_line in select * from jsonb_array_elements(p_allocations) loop
    insert into allocations (workspace_id, payment_id, assignment_id, amount_minor)
    values (p_workspace, v_payment.id, (v_line->>'assignment_id')::uuid, (v_line->>'amount_minor')::bigint)
    returning * into v_alloc;
    insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
    values (p_workspace, v_alloc.assignment_id, p_date, 'PAYMENT', -v_alloc.amount_minor, 'ALLOCATION', v_alloc.id);
  end loop;

  v_result := jsonb_build_object('payment_id', v_payment.id, 'receipt_no', v_no, 'version', v_payment.version);
  insert into idempotency_keys values (p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- idempotency helpers ----------
create function idem_get(p_workspace uuid, p_operation uuid, p_hash text) returns jsonb
language plpgsql as $$
declare v idempotency_keys;
begin
  select * into v from idempotency_keys where workspace_id = p_workspace and operation_id = p_operation;
  if not found then return null; end if;
  if v.request_hash <> p_hash then
    raise exception 'operation reused with different payload' using errcode = '40001';
  end if;
  return v.response;
end $$;

create function idem_put(p_workspace uuid, p_operation uuid, p_hash text, p_response jsonb) returns void
language sql as $$ insert into idempotency_keys values (p_workspace, p_operation, p_hash, p_response) $$;

-- ---------- write path: reversal (full, partial, check returned, correction) ----------
-- p_lines null = reverse everything still unreversed; otherwise
-- [{"allocation_id": "...", "amount_minor": 5000}, ...] (kind must be PARTIAL).
create function reverse_payment(p_workspace uuid, p_operation uuid, p_payment uuid, p_kind text,
                                p_reason text, p_expected_version integer, p_effective_date date,
                                p_lines jsonb default null)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', p_payment, p_kind, p_expected_version, p_effective_date, coalesce(p_lines::text,'')));
  v_prior jsonb; v_payment payments; v_rev reversals; v_a record; v_amt bigint; v_total bigint := 0;
  v_left bigint; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if p_kind not in ('FULL','PARTIAL','CHECK_RETURNED','CORRECTION') then
    raise exception 'unknown reversal kind' using errcode = '22023'; end if;
  if (p_lines is not null) <> (p_kind = 'PARTIAL') then
    raise exception 'lines are required for PARTIAL and only for PARTIAL' using errcode = '22023'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;

  select * into v_payment from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if v_payment.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
  if p_kind = 'CHECK_RETURNED' and (v_payment.method <> 'CHECK' or v_payment.clearance = 'RETURNED') then
    raise exception 'only an issued or cleared check can be returned' using errcode = '22023'; end if;

  insert into reversals (workspace_id, payment_id, kind, reason)
  values (p_workspace, p_payment, p_kind, p_reason) returning * into v_rev;

  for v_a in
    select a.*, a.amount_minor - coalesce((select sum(rl.amount_minor) from reversal_lines rl
                                           where rl.allocation_id = a.id), 0) as remaining
    from allocations a where a.payment_id = p_payment order by a.id
  loop
    if p_lines is null then
      v_amt := v_a.remaining;
    else
      select coalesce(sum((l->>'amount_minor')::bigint), 0) into v_amt
        from jsonb_array_elements(p_lines) l where (l->>'allocation_id')::uuid = v_a.id;
      if v_amt < 0 or v_amt > v_a.remaining then
        raise exception 'reversal exceeds unreversed amount on allocation' using errcode = '22023'; end if;
    end if;
    if v_amt > 0 then
      insert into reversal_lines values (v_rev.id, v_a.id, v_amt);
      insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
      values (p_workspace, v_a.assignment_id, p_effective_date, 'PAYMENT_REVERSAL', v_amt, 'REVERSAL', v_rev.id);
      v_total := v_total + v_amt;
    end if;
  end loop;

  if p_lines is not null and exists (
      select 1 from jsonb_array_elements(p_lines) l
      where not exists (select 1 from allocations a where a.id = (l->>'allocation_id')::uuid and a.payment_id = p_payment)) then
    raise exception 'line does not belong to this payment' using errcode = '22023'; end if;
  if v_total = 0 then raise exception 'nothing left to reverse' using errcode = '22023'; end if;

  select coalesce(sum(a.amount_minor), 0) - coalesce((select sum(rl.amount_minor) from reversal_lines rl
           join allocations a2 on a2.id = rl.allocation_id where a2.payment_id = p_payment), 0)
    into v_left from allocations a where a.payment_id = p_payment;

  update payments set version = version + 1,
         clearance = case when p_kind = 'CHECK_RETURNED' then 'RETURNED' else clearance end
   where id = p_payment returning * into v_payment;
  update receipts set status = case when p_kind = 'CORRECTION' then 'SUPERSEDED'
                                    when v_left = 0 then 'REVERSED' else 'SUPERSEDED' end
   where payment_id = p_payment and status = 'CURRENT';

  v_result := jsonb_build_object('reversal_id', v_rev.id, 'payment_version', v_payment.version,
                                 'reversed_minor', v_total, 'unreversed_minor', v_left);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: check cleared (no ledger effect) ----------
create function set_check_cleared(p_workspace uuid, p_operation uuid, p_payment uuid, p_expected_version integer)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'clear', p_payment, p_expected_version)); v_prior jsonb; v_p payments; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  select * into v_p from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if v_p.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
  if v_p.method <> 'CHECK' or v_p.clearance <> 'ISSUED' then
    raise exception 'only an issued check can be marked cleared' using errcode = '22023'; end if;
  update payments set clearance = 'CLEARED', version = version + 1 where id = p_payment returning * into v_p;
  update receipts set status = 'SUPERSEDED' where payment_id = p_payment and status = 'CURRENT';
  v_result := jsonb_build_object('payment_version', v_p.version, 'clearance', v_p.clearance);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: correct a payment (reverse old + record new, one transaction) ----------
create function correct_payment(p_workspace uuid, p_operation uuid, p_payment uuid, p_expected_version integer,
                                p_effective_date date, p_reason text,
                                p_date date, p_method text, p_method_note text, p_amount bigint,
                                p_recipient text, p_reference text, p_allocations jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_hash text := md5(concat_ws('|', 'correct', p_payment, p_expected_version, p_date, p_method, p_amount,
                               p_recipient, p_reference, p_allocations::text));
  v_prior jsonb; v_rev jsonb; v_new jsonb; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_rev := reverse_payment(p_workspace, gen_random_uuid(), p_payment, 'CORRECTION', p_reason,
                           p_expected_version, p_effective_date);
  v_new := record_payment(p_workspace, gen_random_uuid(), p_date, p_method, p_method_note, p_amount,
                          p_recipient, p_reference, p_allocations);
  update payments set replaces_payment_id = p_payment where id = (v_new->>'payment_id')::uuid;
  v_result := jsonb_build_object('replaced_payment_id', p_payment, 'reversal', v_rev, 'payment', v_new);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: reimbursement ----------
create function record_reimbursement(p_workspace uuid, p_operation uuid, p_assignment uuid, p_date date,
                                     p_amount bigint, p_description text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'reimb', p_assignment, p_date, p_amount, p_description));
        v_prior jsonb; v_id uuid; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if coalesce(length(trim(p_description)), 0) = 0 then raise exception 'description required' using errcode = '22023'; end if;
  insert into reimbursements (workspace_id, assignment_id, reimb_date, amount_minor, description)
  values (p_workspace, p_assignment, p_date, p_amount, p_description) returning id into v_id;
  insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
  values (p_workspace, p_assignment, p_date, 'REIMBURSEMENT', p_amount, 'REIMBURSEMENT', v_id);
  update workspaces set currency_locked = true where id = p_workspace;
  v_result := jsonb_build_object('reimbursement_id', v_id);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: adjustment ----------
create function record_adjustment(p_workspace uuid, p_operation uuid, p_assignment uuid, p_date date,
                                  p_direction text, p_category text, p_amount bigint, p_reason text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'adj', p_assignment, p_date, p_direction, p_category, p_amount, p_reason));
        v_prior jsonb; v_id uuid; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;
  insert into adjustments (workspace_id, assignment_id, adj_date, direction, category, amount_minor, reason)
  values (p_workspace, p_assignment, p_date, p_direction, p_category, p_amount, p_reason) returning id into v_id;
  insert into ledger_events (workspace_id, assignment_id, effective_date, event_type, signed_delta, source_type, source_id)
  values (p_workspace, p_assignment, p_date, 'ADJUSTMENT',
          case when p_direction = 'INCREASE_OWED' then p_amount else -p_amount end, 'ADJUSTMENT', v_id);
  update workspaces set currency_locked = true where id = p_workspace;
  v_result := jsonb_build_object('adjustment_id', v_id);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: mark rest as no work ----------
-- Records NO_WORK only for assignments that are active on the date, have a pay agreement
-- in force, and are still Unrecorded (no entry, or active revision is VOID).
create function mark_rest_no_work(p_workspace uuid, p_operation uuid, p_project uuid, p_date date)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'rest', p_project, p_date)); v_prior jsonb;
        v_a record; v_count integer := 0; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  if not exists (select 1 from projects where id = p_project and workspace_id = p_workspace and status = 'ACTIVE') then
    raise exception 'project not found or archived' using errcode = 'P0002'; end if;
  for v_a in
    select a.id, e.version, r.input_mode
      from assignments a
      left join work_entries e on e.assignment_id = a.id and e.work_date = p_date
      left join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where a.project_id = p_project and a.workspace_id = p_workspace
       and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date)
       and exists (select 1 from rate_agreements ra where ra.assignment_id = a.id and ra.effective_from <= p_date)
       and (e.id is null or r.input_mode = 'VOID')
  loop
    perform record_work(p_workspace, gen_random_uuid(), v_a.id, p_date, 'NO_WORK', null, null,
                        coalesce(v_a.version, 0),
                        case when v_a.version is null then null else 'Marked no work' end, null);
    v_count := v_count + 1;
  end loop;
  v_result := jsonb_build_object('marked', v_count);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- rate changes: preview (read-only) and apply (all-or-nothing) ----------
create function preview_rate_change(p_workspace uuid, p_assignment uuid, p_from date, p_basis text,
                                    p_rate bigint, p_std integer)
returns jsonb language plpgsql stable as $$
declare v_next date; v_cur rate_agreements; v_rows jsonb := '[]'::jsonb; v_total bigint := 0;
        v_r record; v_new bigint; v_blocked text; v_last date;
begin
  if not exists (select 1 from assignments where id = p_assignment and workspace_id = p_workspace) then
    raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select min(effective_from) into v_next from rate_agreements where assignment_id = p_assignment and effective_from > p_from;
  select * into v_cur from rate_agreements where assignment_id = p_assignment and effective_from <= p_from
   order by effective_from desc limit 1;
  select max(e.work_date) into v_last from work_entries e
    join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
   where e.assignment_id = p_assignment and r.input_mode <> 'VOID';
  if v_cur.id is not null and v_cur.pay_basis <> p_basis and v_last is not null and v_last >= p_from then
    v_blocked := 'A change between daily and hourly must start after the last recorded work day ('
                 || v_last || '). Void and re-enter those days instead.';
  end if;
  for v_r in
    select e.work_date, e.version, r.input_mode, r.portion, r.minutes, r.earned_minor
      from work_entries e join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where e.assignment_id = p_assignment and e.work_date >= p_from
       and (v_next is null or e.work_date < v_next)
       and r.input_mode in ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES')
     order by e.work_date
  loop
    if v_blocked is null then
      begin
        v_new := fn_earned(p_basis, p_rate, v_r.input_mode, v_r.portion, v_r.minutes, p_std);
      exception when others then
        v_blocked := 'Day ' || v_r.work_date || ' was entered as hours; the new agreement needs a standard day length.';
      end;
    end if;
    if v_blocked is null then
      v_rows := v_rows || jsonb_build_object('work_date', v_r.work_date, 'old_earned_minor', v_r.earned_minor,
                                             'new_earned_minor', v_new, 'delta_minor', v_new - v_r.earned_minor);
      v_total := v_total + (v_new - v_r.earned_minor);
    end if;
  end loop;
  return jsonb_build_object('affected', case when v_blocked is null then v_rows else '[]'::jsonb end,
                            'total_delta_minor', case when v_blocked is null then v_total else 0 end,
                            'blocked_reason', v_blocked);
end $$;

-- Raises SQLSTATE 55000 ("confirmation required") when recorded days are affected and
-- p_confirm is false. The API returns 409 with the preview so the owner can confirm or cancel.
create function apply_rate_change(p_workspace uuid, p_operation uuid, p_assignment uuid, p_from date,
                                  p_basis text, p_rate bigint, p_std integer, p_reason text, p_confirm boolean)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'rate', p_assignment, p_from, p_basis, p_rate, p_std, p_confirm));
        v_prior jsonb; v_preview jsonb; v_id uuid; v_r record; v_count integer := 0; v_result jsonb; v_next date;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_preview := preview_rate_change(p_workspace, p_assignment, p_from, p_basis, p_rate, p_std);
  if v_preview->>'blocked_reason' is not null then
    raise exception '%', v_preview->>'blocked_reason' using errcode = '22023'; end if;
  if jsonb_array_length(v_preview->'affected') > 0 then
    if not p_confirm then raise exception 'confirmation required' using errcode = '55000'; end if;
    if coalesce(length(trim(p_reason)), 0) = 0 then raise exception 'reason required' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from rate_agreements where assignment_id = p_assignment and effective_from = p_from) then
    raise exception 'an agreement already starts on this date' using errcode = '22023'; end if;
  select min(effective_from) into v_next from rate_agreements where assignment_id = p_assignment and effective_from > p_from;

  insert into rate_agreements (workspace_id, assignment_id, effective_from, pay_basis, rate_minor, standard_day_minutes)
  values (p_workspace, p_assignment, p_from, p_basis, p_rate, p_std) returning id into v_id;

  for v_r in
    select e.work_date, e.version, r.input_mode, r.portion, r.minutes, r.note
      from work_entries e join work_revisions r on r.entry_id = e.id and r.revision = e.active_revision
     where e.assignment_id = p_assignment and e.work_date >= p_from
       and (v_next is null or e.work_date < v_next)
       and r.input_mode in ('DAY_PORTION','DAY_MINUTES','HOUR_MINUTES')
  loop
    perform record_work(p_workspace, gen_random_uuid(), p_assignment, v_r.work_date, v_r.input_mode,
                        v_r.portion, v_r.minutes, v_r.version, 'Rate change: ' || p_reason, v_r.note);
    v_count := v_count + 1;
  end loop;

  v_result := jsonb_build_object('agreement_id', v_id, 'corrected_days', v_count,
                                 'total_delta_minor', (v_preview->>'total_delta_minor')::bigint);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- write path: payment with an optional owner note ----------
-- Same as record_payment; the note is stored in the same transaction. Notes never affect money.
create function record_payment_with_note(p_workspace uuid, p_operation uuid, p_date date, p_method text,
                                         p_method_note text, p_amount bigint, p_recipient text,
                                         p_reference text, p_allocations jsonb, p_note text)
returns jsonb language plpgsql security definer as $$
declare v_result jsonb;
begin
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  v_result := record_payment(p_workspace, p_operation, p_date, p_method, p_method_note, p_amount,
                             p_recipient, p_reference, p_allocations);
  update payments set note = p_note where id = (v_result->>'payment_id')::uuid and workspace_id = p_workspace
     and note is distinct from p_note;
  return v_result;
end $$;

-- ---------- account deletion (the only path that deletes financial rows) ----------
-- Called by the deletion job for a workspace whose owner confirmed account deletion.
-- Auth tables (users, sessions, apple_credentials) are removed by the app after this returns.
create function delete_workspace_data(p_workspace uuid) returns jsonb
language plpgsql security definer as $$
declare v_counts jsonb := '{}'::jsonb; n integer;
begin
  if not exists (select 1 from workspaces where id = p_workspace) then
    raise exception 'workspace not found' using errcode = 'P0002'; end if;
  perform set_config('workpay.deleting_workspace', p_workspace::text, true);  -- this transaction only
  delete from acknowledgments where workspace_id = p_workspace;           get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('acknowledgments', n);
  delete from share_links where workspace_id = p_workspace;               get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('share_links', n);
  delete from payment_signatures where workspace_id = p_workspace;  -- table defined later in this file
  delete from evidence where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('evidence', n);
  delete from receipts where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('receipts', n);
  delete from statements where workspace_id = p_workspace;                get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('statements', n);
  delete from reversal_lines rl using reversals r where rl.reversal_id = r.id and r.workspace_id = p_workspace;
  delete from reversals where workspace_id = p_workspace;
  delete from allocations where workspace_id = p_workspace;
  delete from ledger_events where workspace_id = p_workspace;             get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('ledger_events', n);
  delete from payments where workspace_id = p_workspace;                  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments', n);
  delete from work_revisions where workspace_id = p_workspace;
  delete from work_entries where workspace_id = p_workspace;
  delete from day_reviews where workspace_id = p_workspace;
  delete from reimbursements where workspace_id = p_workspace;
  delete from adjustments where workspace_id = p_workspace;
  delete from rate_agreements where workspace_id = p_workspace;
  delete from assignments where workspace_id = p_workspace;
  delete from reminder_preferences where workspace_id = p_workspace;
  delete from workers where workspace_id = p_workspace;
  delete from projects where workspace_id = p_workspace;
  delete from audit_events where workspace_id = p_workspace;
  delete from idempotency_keys where workspace_id = p_workspace;
  delete from workspaces where id = p_workspace;
  perform set_config('workpay.deleting_workspace', '', true);
  return v_counts;
end $$;


-- =====================================================================
-- Baseline 1.2 additions
-- =====================================================================

-- ---------- hand-over signatures (worker confirms receipt on the owner's phone) ----------
create table payment_signatures (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null,
  payment_id             uuid not null,
  worker_id              uuid not null,
  typed_name             text not null check (length(trim(typed_name)) between 2 and 80),
  signature_evidence_id  uuid not null references evidence(id),
  language               text not null check (language in ('en','es')),
  statement_text         text not null,          -- the exact sentence the worker confirmed
  amount_minor           bigint not null check (amount_minor > 0),
  signed_at              timestamptz not null default now(),
  unique (payment_id, worker_id),
  foreign key (workspace_id, payment_id) references payments (workspace_id, id),
  foreign key (workspace_id, worker_id)  references workers  (workspace_id, id)
);

-- Records a worker's signature for their share of a payment. No ledger effect.
-- Bumps the payment version so the next receipt snapshot carries the signature;
-- the current receipt is kept and marked SUPERSEDED.
create function record_handover_signature(p_workspace uuid, p_operation uuid, p_payment uuid,
                                          p_worker uuid, p_typed_name text, p_evidence uuid,
                                          p_language text, p_statement text)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'sign', p_payment, p_worker, p_typed_name, p_evidence, p_language));
        v_prior jsonb; v_amount bigint; v_id uuid; v_p payments; v_result jsonb;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  select * into v_p from payments where id = p_payment and workspace_id = p_workspace for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  select coalesce(sum(a.amount_minor), 0) into v_amount
    from allocations a join assignments s on s.id = a.assignment_id
   where a.payment_id = p_payment and s.worker_id = p_worker;
  if v_amount = 0 then raise exception 'worker is not on this payment' using errcode = '22023'; end if;
  if not exists (select 1 from evidence e where e.id = p_evidence and e.workspace_id = p_workspace
                   and e.parent_type = 'PAYMENT' and e.parent_id = p_payment and e.content_type = 'image/png') then
    raise exception 'signature image not found for this payment' using errcode = '22023'; end if;
  if exists (select 1 from reversals where payment_id = p_payment) then
    raise exception 'payment has been reversed or corrected' using errcode = '22023'; end if;
  insert into payment_signatures (workspace_id, payment_id, worker_id, typed_name, signature_evidence_id,
                                  language, statement_text, amount_minor)
  values (p_workspace, p_payment, p_worker, trim(p_typed_name), p_evidence, p_language, p_statement, v_amount)
  returning id into v_id;
  update payments set version = version + 1 where id = p_payment returning * into v_p;
  update receipts set status = 'SUPERSEDED' where payment_id = p_payment and status = 'CURRENT';
  v_result := jsonb_build_object('signature_id', v_id, 'payment_version', v_p.version, 'amount_minor', v_amount);
  perform idem_put(p_workspace, p_operation, v_hash, v_result);
  return v_result;
end $$;

-- ---------- pay what's owed: several payments, one per worker, all or nothing ----------
-- p_lines: [{"assignment_id","amount_minor","method","method_note","recipient_label","reference","note"}]
-- One payment (and one receipt number) per line. If any line fails, nothing is recorded.
create function record_payout(p_workspace uuid, p_operation uuid, p_date date, p_lines jsonb)
returns jsonb language plpgsql security definer as $$
declare v_hash text := md5(concat_ws('|', 'payout', p_date, p_lines::text));
        v_prior jsonb; v_line jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb; v_n integer;
begin
  v_prior := idem_get(p_workspace, p_operation, v_hash);
  if v_prior is not null then return v_prior; end if;
  v_n := jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
  if v_n = 0 or v_n > 50 then raise exception 'between 1 and 50 lines' using errcode = '22023'; end if;
  if (select count(distinct l->>'assignment_id') from jsonb_array_elements(p_lines) l) <> v_n then
    raise exception 'each assignment once per payout' using errcode = '22023'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_res := record_payment_with_note(p_workspace, gen_random_uuid(), p_date,
               v_line->>'method', v_line->>'method_note', (v_line->>'amount_minor')::bigint,
               v_line->>'recipient_label', v_line->>'reference',
               jsonb_build_array(jsonb_build_object('assignment_id', v_line->>'assignment_id',
                                                    'amount_minor', (v_line->>'amount_minor')::bigint)),
               v_line->>'note');
    v_out := v_out || jsonb_build_object('assignment_id', v_line->>'assignment_id',
                                         'payment_id', v_res->>'payment_id', 'receipt_no', v_res->>'receipt_no');
  end loop;
  perform idem_put(p_workspace, p_operation, v_hash, jsonb_build_object('payments', v_out));
  return jsonb_build_object('payments', v_out);
end $$;

-- ---------- read models ----------
-- Totals per assignment by type; every column comes from the ledger, so it always ties to the balance.
create view assignment_totals as
select a.workspace_id, a.id as assignment_id, a.project_id, a.worker_id,
  coalesce(sum(l.signed_delta) filter (where l.event_type in ('EARNING','EARNING_CORRECTION')), 0) as earned_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'REIMBURSEMENT'), 0)                 as reimbursed_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'ADJUSTMENT' and l.signed_delta > 0), 0) as added_minor,
  coalesce(-sum(l.signed_delta) filter (where l.event_type = 'ADJUSTMENT' and l.signed_delta < 0), 0) as taken_off_minor,
  coalesce(-sum(l.signed_delta) filter (where l.event_type = 'PAYMENT'), 0)                      as paid_minor,
  coalesce(sum(l.signed_delta) filter (where l.event_type = 'PAYMENT_REVERSAL'), 0)              as reversed_minor,
  coalesce(sum(l.signed_delta), 0)                                                               as balance_minor
from assignments a left join ledger_events l on l.assignment_id = a.id
group by a.workspace_id, a.id, a.project_id, a.worker_id;

-- Net paid per worker per calendar year (payments minus reversals, by effective date), all projects.
create view worker_year_paid as
select l.workspace_id, a.worker_id, extract(year from l.effective_date)::int as year,
       -sum(l.signed_delta) as net_paid_minor
from ledger_events l join assignments a on a.id = l.assignment_id
where l.event_type in ('PAYMENT','PAYMENT_REVERSAL')
group by l.workspace_id, a.worker_id, extract(year from l.effective_date);


-- ---------- public receipt links: open and acknowledge (called by the public page, no session) ----------
-- The public endpoint hashes the token from the URL and passes only the hash.
-- Returns the link row if usable; raises P0002 for unknown, expired or revoked links (same error for all three).
create function open_share_link(p_token_hash bytea) returns share_links
language plpgsql security definer as $$
declare v share_links;
begin
  update share_links
     set open_count = open_count + 1,
         first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now()
   where token_hash = p_token_hash and revoked_at is null and expires_at > now()
  returning * into v;
  if not found then raise exception 'link not available' using errcode = 'P0002'; end if;
  return v;
end $$;

create function acknowledge_share_link(p_token_hash bytea, p_kind text, p_typed_name text, p_note text)
returns jsonb language plpgsql security definer as $$
declare v share_links; v_id uuid;
begin
  select * into v from share_links
   where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then raise exception 'link not available' using errcode = 'P0002'; end if;
  if p_kind not in ('RECEIVED','QUERY') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_kind = 'QUERY' and coalesce(length(trim(p_note)), 0) = 0 then
    raise exception 'a question needs a note' using errcode = '22023'; end if;
  if p_kind = 'RECEIVED' and exists (select 1 from acknowledgments where share_link_id = v.id and kind = 'RECEIVED') then
    return jsonb_build_object('status', 'already_confirmed');
  end if;
  insert into acknowledgments (workspace_id, share_link_id, kind, typed_name, note)
  values (v.workspace_id, v.id, p_kind, nullif(trim(p_typed_name), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  return jsonb_build_object('status', 'recorded', 'acknowledgment_id', v_id);
end $$;
```

# Appendix B: Calculation test vectors

Shared by app and server test suites. Amounts in cents. One rounding step, half up.

| # | Basis | Rate | Input | Exact | Earned |
|---|---|---|---|---|---|
| V01 | Daily | 24000/day | portion 1 | 24000 | 24000 |
| V02 | Daily | 24000/day | portion 0.5 | 12000 | 12000 |
| V03 | Daily | 18000/day | portion 0.25 | 4500 | 4500 |
| V04 | Daily | 18000/day | portion 0.75 | 13500 | 13500 |
| V05 | Daily | 25000/day | portion 0.3333 | 8332.5 | 8333 |
| V06 | Daily | 24000/day | 180 of 480 min | 9000 | 9000 |
| V07 | Daily | 20000/day | 300 of 450 min | 13333.3333 | 13333 |
| V08 | Daily | 24000/day | No work | 0 | 0 |
| V09 | Hourly | 3000/hr | 450 min | 22500 | 22500 |
| V10 | Hourly | 2750/hr | 80 min | 3666.6667 | 3667 |
| V11 | Hourly | 2250/hr | 15 min | 562.5 | 563 |
| V12 | Hourly | 1875/hr | 50 min | 1562.5 | 1563 |
| V13 | Hourly | 4500/hr | 600 min | 45000 | 45000 |
| V14 | Hourly | 3000/hr | No work | 0 | 0 |

# Appendix C: Store submission checklists

## Both stores

- Privacy policy URL, support URL, and an account-deletion web page, all live.
- Demo account with sample data for reviewers, and sign-in instructions in the review notes.
- No claims of bank verification, payroll, tax, or accounting certification anywhere in the app or listing.
- Screenshots of Today, Record payment, Worker detail, Receipt, and Statement, using fictional data.
- Crash reporting scrubbed of personal data; no advertising identifiers.

## Apple App Store

- Apple Developer Program membership (organization, with D-U-N-S).
- Built with Xcode 26 and the iOS 26 SDK (EAS build image).
- Sign in with Apple offered alongside Google sign-in.
- Account deletion reachable in the app.
- App Privacy details declared:
  - Contact info (email) and user content (names, notes, photos), both linked to the user and not used for tracking.
  - Diagnostics (crash data).
- Usage description strings for camera and notifications, in plain words.
- Export compliance: standard HTTPS only (ITSAppUsesNonExemptEncryption = NO), confirmed at submission.
- iPhone only at launch (supportsTablet false). The iPhone app runs on iPad in compatibility mode.
- TestFlight pilot builds before review.

## Google Play

- Play Console organization account. If using a personal account, 12 testers opted in for 14 days before applying for production.
- Android App Bundle targeting API level 36 or higher (required for new apps from 31 August 2026).
- Data safety form matching the build: data collected, encrypted in transit, deletion available.
- Account deletion in the app and a web URL entered in the Data safety section.
- POST_NOTIFICATIONS requested only when reminders are turned on. No exact alarm permission.
- System photo picker only; no READ_MEDIA_IMAGES or broad storage permissions.
- Content rating questionnaire, target audience (adults), and app access instructions for reviewers.
- Internal testing track in week 1; closed test with pilot owners from week 5 or 6.
