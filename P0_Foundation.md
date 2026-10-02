# Phase 0 — Foundation

> **Built (history).** This phase is done. Nothing in baseline 2.0 changes it.

> Paste after the Agent has saved `01_PROJECT_BRIEF_AND_INVARIANTS.md` as `replit.md`. Upload the pack folders `db/`, `shared/` and `docs/` into the project root first (drag them into the Replit file tree).

## Goal

A running Expo app (iPhone, via Expo Go) and a running API, both on Replit, with the database schema loaded and all three test suites wired up and green. There are no features yet. This phase proves the plumbing.

## Read first

1. `replit.md` (the brief and invariants).
2. Spec sections 4 (navigation, visual system, accessibility) and 12 (architecture).
3. `db/schema.sql` and `db/tests/*.sql`. Understand them; don't change them.
4. `shared/pay.ts`, `shared/money.ts` and `shared/pay_test_vectors.json`.
5. The screen designs in `docs/screens/`.

## Build

### Project setup
- Use Replit's Expo mobile setup for `/mobile` (TypeScript strict, Expo Router). Add `/server` as a Node + TypeScript Express API. Keep `/shared` importable from both sides (path alias or workspace package). If the template puts things elsewhere, keep its layout and tell me the mapping.
- Root `package.json` scripts:
  - `dev` starts the API and the Expo dev server together.
  - `test:db` runs `bash db/run_db_tests.sh`.
  - `test:server` runs vitest in `/server`.
  - `test:mobile` runs jest-expo in `/mobile`.
  - `test` runs all three and fails if any fails.
- Replit Secrets: set `APP_ENV=development` for the workspace. Production deployment will set `APP_ENV=production` in Phase 8.

### Database and migrations
- Create `db/migrations/0001_schema.sql` as a byte-for-byte copy of `db/schema.sql`.
- Write a small migration runner (`server/src/db/migrate.ts`):
  - It keeps a `schema_migrations(filename text primary key, sha256 text not null, applied_at timestamptz)` table.
  - It applies `db/migrations/*.sql` in filename order, each file in one transaction.
  - It **refuses to start** if an already-applied file's SHA-256 has changed. That enforces invariant 4.
  - It runs on API start in development, and as an explicit step in deployment.
- `db/run_db_tests.sh` is provided. It creates a throwaway schema, loads `schema.sql` plus later migrations, runs `db/tests/*.sql`, and drops the schema. Make `npm run test:db` call it. It needs `psql` on the path; add the PostgreSQL client to the Replit environment if it's missing.

### API skeleton (`/server`)
- Mount everything under `/v1`.
- Add a `GET /v1/health` endpoint. It returns `{status:"ok", db:"ok", migrations:<count>}` and runs `select 1` on the database.
- Middleware, in this order:
  1. Correlation ID. Generate a UUID, return it in the `X-Correlation-Id` header, and attach it to logs.
  2. JSON body limit of 1 MB.
  3. Request log: method, path template, status, duration and correlation ID. Never log bodies, query strings or headers.
  4. zod validation helper.
  5. Error handler (below).
- Error handler: map Postgres SQLSTATE codes to HTTP responses. The body shape is `{error:{code, message, correlationId}}`, with a safe message and never a stack trace.

  | SQLSTATE | HTTP |
  |---|---|
  | `P0002` | 404 |
  | `40001` | 409 |
  | `55000` | 409, with `code:"CONFIRMATION_REQUIRED"` |
  | `22023` | 422 |
  | `23505` | 409 |
  | `23503` | 404 |
  | `23514` | 422 |
  | anything else | 500 |
- Database access (`server/src/db/pool.ts`): a `pg` Pool, parameterized queries only, and a `withTransaction(fn)` helper.
- Money-function helper (`server/src/db/money.ts`): typed wrappers for each database function listed in invariant 2. Each wrapper takes `workspaceId` as its **first argument from the caller context**. In later phases, routes only ever call these wrappers for money writes.

### Mobile skeleton (`/mobile`)
- Four tabs, per spec section 4: Today, Workers, Payments, More. For now each shows a placeholder empty state with a heading.
- Theme (`mobile/theme/`):
  - Color tokens for light and dark, driven by the system scheme.
  - Neutral surfaces, text, a muted color, a border color, and the teal accent `#0F766E` (use a lighter teal for text on dark surfaces so it meets 4.5:1).
  - Warning (amber) and error (red) are used only with a label and an icon.
  - An 8-point spacing scale, card radius and typography scale. Text supports Dynamic Type with `allowFontScaling`; don't fix heights on text containers.
- Shared components:
  - `Money`: tabular digits, right-aligned option, and `accessibilityLabel` that reads the full amount (for example "240 dollars").
  - `StatusLabel`: text plus icon for Owed, Settled, Advance, Pending, Needs review, Unrecorded, Check not cleared.
  - `Screen`: safe area plus scroll.
  - `PrimaryButton` and `SecondaryButton`: at least 44 pt tall, with accessibility roles.
  - `EmptyState`.
- API client (`mobile/lib/api.ts`): base URL from Expo config, JSON, correlation ID read from responses, and typed errors (`{code, message}`). Surface 409, 422 and network errors separately.
- Show the API health result on the More tab under "Diagnostics" (version, API status). It's temporary but useful for testing.

### Tests
- **Server** (vitest):
  - `/v1/health` returns 200.
  - The error handler maps each SQLSTATE in the table above. Trigger real errors by calling the money functions with bad input in an isolated test schema, using the same create-schema/drop-schema approach as `run_db_tests.sh`.
  - A route smoke test walks every registered route and asserts no 5xx for an empty request. Keep this test permanently; later phases extend it.
  - The migration runner refuses a changed checksum.
- **Shared:** a test that runs every vector and parse case in `shared/pay_test_vectors.json` through `shared/pay.ts` and `shared/money.ts`.
- **Mobile** (jest-expo): `Money` renders `$1,245.00` and the accessibility label; `StatusLabel` renders text plus icon for every status.

## Proof to paste at the gate
- The full `migrate.ts`.
- The error-handler mapping code.
- The output of `npm run test` (all three suites).
- The output of `curl <api-url>/v1/health`.

## Try it on your phone
- Scan the Expo QR code with the iPhone camera, and the app opens in Expo Go.
- Four tabs show. Switch iPhone to dark mode and the app follows.
- Settings → Accessibility → Larger Text at maximum: nothing is cut off on any tab.
- More → Diagnostics shows API status "ok".

## Out of scope for this phase
Sign-in, any data screens, and notifications.

## End of phase
Run the gate from `replit.md`. Then stop and say "Phase 0 ready for review".
