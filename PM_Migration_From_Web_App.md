# Optional phase — Move records from the current web app

> Run this after Phase 5 (ledger and adjustments exist) and before the TestFlight pilot, if you want your existing history in the new app. It needs an export from the current web app. Its format is unknown until you export it, so the first step is looking at the file.

## Goal

Your existing workers, pay, days worked and payments appear in the new app, and every worker's balance matches the old app to the cent. You sign it off worker by worker before anything goes to production.

## Two ways to do it

| Option | What moves | Effort | When to choose |
|---|---|---|---|
| **A. Opening balances only** (default) | Workers, pay rates, and one opening balance per worker as of a cut-over date | Hours | You mainly need correct balances going forward |
| **B. Full history** | Every day worked and every payment | 1–2 days | You want old receipts and statements in the new app |

## Steps (both options)
1. **Export.** From the current web app, export everything it can give (CSV or JSON). Upload the files into `migration/input/` in Replit. **These are real records: never commit them to GitHub** (add `migration/input/` to `.gitignore`).
2. **Inspect.** The Agent prints each file's columns and 5 sample rows with names masked, then proposes a mapping table. You approve the mapping in chat before anything is loaded.
3. **Load to staging.** A script in `scripts/migrate_webapp.ts` creates a **new development workspace**, never production. It loads data only through the API's service layer and the database functions:
   - Option A: workers and assignments with agreements, then `record_adjustment` with category OPENING_BALANCE per worker, dated the day before cut-over, with reason "Balance from previous app".
   - Option B: agreements, then `record_work` per day, `record_payment` per payment, and adjustments where the old app had them.

   Every operation uses a deterministic `operation_id`, a UUID v5 derived from the source row, so re-running the script never double-posts.
4. **Reconcile.** The script prints one line per worker: old balance, new balance, difference. Any difference other than 0.00 stops the process. Fix the mapping or the source; never force a balance with a silent adjustment.
5. **Sign off.** You check each worker's line against the old app and confirm in chat.
6. **Production.** Run the same script once against the production workspace (your real account), using the same operation IDs, and print the same reconciliation. Keep the reconciliation output in `docs/MIGRATION_RECORD.md` without names (use worker initials).

## Tests
- Re-running the script against the same workspace changes nothing (idempotent).
- A mapping with an unknown worker or a negative amount fails loudly, with the row number.
- The reconciliation report has a line for every worker in the source.

## End of phase
Run the gate from `replit.md`. Stop and say "Migration ready for sign-off".
