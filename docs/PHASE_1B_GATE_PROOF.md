# Phase 1b gate — 2026-10-02

BUSINESS_ENABLED remains exactly false. No Phase 1c or Business screens were built.

## Database and invariants

- replit.md is byte-for-byte identical to 01_PROJECT_BRIEF_AND_INVARIANTS.md (cmp passed).
- Only provided 0003 was applied; its SHA-256 is f533f83076ef10e6e3b745c9660e34c4dac168bc892176f67c4ef9e82b168b4f, identical to the supplied file. 0004 and 0005 remain under db/provided/migrations and were not applied.
- Superseded, unapplied baseline 1.4 backup copies of 0003_plans_and_project_use.sql and 0004_crew.sql were deleted.
- The sole provided-test change is the user-approved Apple credential fixture insert including refresh_token_ciphertext, iv, auth_tag and updated_at for both APP and WEB. Every assertion is retained; automated comparison confirmed this is the only difference from the supplied test. No other existing direct insert needed a NOT NULL fixture correction.
- No money-function implementation, fn_earned, ledger, role_can, require_member or applied migration was edited.

## Proof: withMember

### withMember and its transaction

```ts
import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export interface Member {
  role: string;
  financial_access: boolean | null;
  worker_id: string | null;
  kind: "HOME" | "BUSINESS";
}

export async function inTransaction<T>(db: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

export async function withMember<T>(
  db: Pool, req: Request, action: string,
  fn: (tx: PoolClient, member: Member, workspaceId: string) => Promise<T>,
): Promise<T> {
  const workspace = z.string().uuid().safeParse(req.get("X-Workspace-Id"));
  if (!workspace.success) throw Object.assign(new Error("Not found"), { code: "CT404" });
  return inTransaction(db, async tx => {
    const result = await tx.query<{ member: Member }>(
      "select require_member($1, $2, $3) as member", [workspace.data, req.ctx!.userId, action],
    );
    return fn(tx, result.rows[0]!.member, workspace.data);
  });
}
```

### Shared error mapping

```ts
import { ZodError } from "zod";

const states: Record<string, { status: number; code: string; message: string }> = {
  AUTH_INVALID_INPUT: { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
  INVITATIONS_UNAVAILABLE: { status: 503, code: "INVITATIONS_UNAVAILABLE", message: "Invitations are temporarily unavailable" },
  CT404: { status: 404, code: "NOT_FOUND", message: "Not found" },
  CT403: { status: 403, code: "FORBIDDEN", message: "Not allowed" },
  CT409: { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
  CT410: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
  CT429: { status: 429, code: "TOO_MANY", message: "Too many attempts. Try again later." },
  OPERATION_REUSED: { status: 409, code: "OPERATION_REUSED", message: "Operation already used for a different request" },
  INVITATION_NOT_AVAILABLE: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
  INVITATION_CODE_WRONG: { status: 400, code: "INVITATION_CODE_WRONG", message: "That code didn't work. Check the email address and the code, or ask for a new invitation." },
  P0002: { status: 404, code: "NOT_FOUND", message: "Not found" },
  "40001": { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
  "55000": { status: 409, code: "CONFIRMATION_REQUIRED", message: "Confirmation required" },
  "22023": { status: 400, code: "INVALID", message: "Invalid input" },
  "23505": { status: 409, code: "CONFLICT", message: "Record already exists" },
  "23503": { status: 404, code: "NOT_FOUND", message: "Not found" },
  "23514": { status: 422, code: "ROLE_DOES_NOT_FIT", message: "Role does not fit this workspace" },
};

export function mapError(error: unknown) {
  if (error instanceof ZodError) return { status: 400, code: "INVALID", message: "Invalid input" };
  const type = error && typeof error === "object" && "type" in error ? error.type : null;
  if (type === "entity.too.large") return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  if (type === "entity.parse.failed") return { status: 400, code: "INVALID_JSON", message: "Invalid JSON body" };
  const state = error && typeof error === "object" && "code" in error ? error.code : null;
  if (state === "22023" && error instanceof Error && error.message === "WORKER_RECORD_REQUIRED") {
    return { status: 400, code: "WORKER_RECORD_REQUIRED", message: "Worker record required" };
  }
  return (typeof state === "string" && states[state]) || {
    status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred",
  };
}
```

### Both idempotency helpers and actor-bound canonical request hash

```ts
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter(key => obj[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function requestHash(userId: string, body: unknown): string {
  return createHash("sha256").update(canonical({ userId, body })).digest("hex");
}

export async function withUserIdempotency<T>(
  tx: PoolClient, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(userId, body);
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`user:${userId}:${operationId}`]);
  const prior = await tx.query<{ request_hash: string; response: T }>(
    "select request_hash, response from user_idempotency_keys where user_id = $1 and operation_id = $2",
    [userId, operationId],
  );
  if (prior.rowCount) {
    if (prior.rows[0]!.request_hash !== hash) {
      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
    }
    return prior.rows[0]!.response;
  }
  const response = await fn();
  await tx.query("insert into user_idempotency_keys(user_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
    [userId, operationId, hash, JSON.stringify(response)]);
  return response;
}

export async function withWorkspaceIdempotency<T>(
  tx: PoolClient, workspaceId: string, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(userId, body);
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`workspace:${workspaceId}:${operationId}`]);
  const prior = await tx.query<{ request_hash: string; response: T }>(
    "select request_hash, response from idempotency_keys where workspace_id = $1 and operation_id = $2",
    [workspaceId, operationId],
  );
  if (prior.rowCount) {
    if (prior.rows[0]!.request_hash !== hash) {
      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
    }
    return prior.rows[0]!.response;
  }
  const response = await fn();
  await tx.query("insert into idempotency_keys(workspace_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
    [workspaceId, operationId, hash, JSON.stringify(response)]);
  return response;
}
```

### Route registration wrappers

```ts
import type { IRouter, RequestHandler, Request } from "express";
import type { Pool, PoolClient } from "pg";
import * as membership from "../auth/member";
import { requireSession } from "../middlewares/session";

export type Method = "get" | "post" | "patch" | "delete" | "put";
export interface RouteEntry {
  method: Method;
  path: string;
  kind: "public" | "session" | "member";
  action?: string;
}
const tables = new WeakMap<IRouter, RouteEntry[]>();
export function registeredRoutes(router: IRouter): RouteEntry[] {
  const entries = [...(tables.get(router) ?? [])];
  for (const layer of router.stack) {
    const nested = layer.handle as unknown as IRouter;
    if (!layer.route && nested?.stack) entries.push(...registeredRoutes(nested));
  }
  return entries;
}
function record(router: IRouter, entry: RouteEntry) {
  const table = tables.get(router) ?? [];
  table.push(entry);
  tables.set(router, table);
}
export function publicRoute(router: IRouter, method: Method, path: string, ...handlers: RequestHandler[]) {
  record(router, { method, path, kind: "public" });
  router[method](path, ...handlers);
}
export function sessionRoute(router: IRouter, db: Pool, method: Method, path: string, ...handlers: RequestHandler[]) {
  record(router, { method, path, kind: "session" });
  router[method](path, requireSession(db), ...handlers);
}
export function memberRoute(
  router: IRouter, db: Pool, method: Method, path: string, action: string,
  handler: (tx: PoolClient, member: membership.Member, workspaceId: string, req: Request) => Promise<unknown>,
) {
  record(router, { method, path, kind: "member", action });
  router[method](path, requireSession(db), async (req, res, next) => {
    try {
      const result = await membership.withMember(db, req, action, (tx, member, workspaceId) => handler(tx, member, workspaceId, req));
      if (path.startsWith("/invitations") && result && typeof result === "object" && "id" in result) {
        res.locals.invitationId = result.id;
      }
      res.json(result);
    } catch (error) { next(error); }
  });
}
```

## Proof: completeness and fresh-fixture role matrix

```ts
function stackRoutes(router: { stack: unknown[] }): { path: string; method: string }[] {
  const result: { path: string; method: string }[] = [];
  for (const raw of router.stack) {
    const layer = raw as { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } };
    if (layer.route) for (const method of Object.keys(layer.route.methods)) result.push({ path: layer.route.path, method });
    else if (layer.handle?.stack) result.push(...stackRoutes({ stack: layer.handle.stack }));
  }
  return result;
}

describe("route table", () => {
  it("covers every Express /v1 route exactly once and declares all member actions", () => {
    const router = createRouter({ db, env: { ...env, DEV_SIGNIN_CODE: "fixture" }, logger });
    const table = registeredRoutes(router);
    const stack = stackRoutes(router);
    expect(table.map(r => `${r.method} ${r.path}`).sort()).toEqual(stack.map(r => `${r.method} ${r.path}`).sort());
    for (const route of table) {
      expect(["public", "session", "member"]).toContain(route.kind);
      if (route.kind === "member") expect(route.action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    expect(table.filter(r => r.kind === "member")).toHaveLength(8);
  });
});

const roles = ["ORGANIZER", "PARTNER", "OWNER", "ADMIN_MONEY", "ADMIN_NO_MONEY", "LEAD", "WORKER", "REMOVED", "OUTSIDER"] as const;
const table = registeredRoutes(createRouter({ env, logger })).filter(r => r.kind === "member");

describe("fresh-fixture role matrix: declared route gate only", () => {
  for (const route of table) for (const role of roles) {
    it(`${route.method.toUpperCase()} ${route.path} [${route.action}] / ${role}`, async () => {
      const app = appFor();
      const harness = createTenancyHarness(db, app);
      const principal = await harness.createUser("matrix-principal");
      const home = ["ORGANIZER","PARTNER","REMOVED","OUTSIDER"].includes(role);
      const workspace = await harness.createWorkspace(principal, home ? "HOME" : "BUSINESS");
      let user = principal;
      if (!["ORGANIZER","OWNER"].includes(role)) {
        user = await harness.createUser("matrix-member");
        if (role !== "OUTSIDER") {
          let workerId: string | undefined;
          if (role === "WORKER") {
            workerId = (await db.query("insert into workers(workspace_id,display_name) values ($1,'Worker') returning id", [workspace])).rows[0].id;
          }
          await harness.addMember(workspace, user, role.startsWith("ADMIN") ? "ADMIN" : role === "REMOVED" ? "PARTNER" : role,
            { financial: role === "ADMIN_MONEY", workerId });
          if (role === "REMOVED") await db.query("select remove_member($1,$2,$3)", [workspace, principal.userId, user.userId]);
        }
      }
      const { agent } = await harness.agentFor(user, workspace);
      // Keep the real require_member/transaction, replace ONLY the callback after
      // the gate. Function-level refusals are tested separately below.
      const original = memberModule.withMember;
      const spy = vi.spyOn(memberModule, "withMember").mockImplementation((pool, req, action) =>
        original(pool, req, action, async () => ({ gate_passed: true })));
      try {
        const url = `/v1${route.path.replace(/:userId|:id/g, randomUUID())}`;
        const result = await agent[route.method](url).send({});
        const allowed = route.action === "workspace.read" ||
          (route.action === "settings.edit" ? ["ORGANIZER","OWNER"].includes(role) :
            ["ORGANIZER","OWNER","ADMIN_MONEY","ADMIN_NO_MONEY"].includes(role));
        expect(result.status).toBe(["REMOVED","OUTSIDER"].includes(role) ? 404 : allowed ? 200 : 403);
        if (result.status === 200) expect(result.body.gate_passed).toBe(true);
      } finally { spy.mockRestore(); }
    });
  }
});


```

8 member routes × 9 role states = 72 passing gate cases; included in the 89 passing identity tests. The real require_member and transaction run in every case; only the post-gate callback is replaced. Separate integration tests exercise the actual function-level refusals, scoping, immediate removal, committed expiry/attempts and money actor.

## Proof: Apple/developer sign-in transaction

```ts
async function createOwnerSession(
  db: Pool,
  appleSub: string,
  refreshToken?: string,
  tokenEncryptionKey?: Buffer,
): Promise<OwnerSession> {
  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query<{ id: string; deleted_at: Date | null }>(
      `INSERT INTO users (apple_sub)
       VALUES ($1)
       ON CONFLICT (apple_sub) DO UPDATE SET apple_sub = EXCLUDED.apple_sub
       RETURNING id, deleted_at`,
      [appleSub],
    );
    const user = userResult.rows[0]!;
    if (user.deleted_at) throw new DeletedAccountError();

    if (refreshToken) {
      if (!tokenEncryptionKey) throw new Error("Apple credential encryption unavailable");
      const encrypted = encryptRefreshToken(refreshToken, tokenEncryptionKey, user.id);
      await client.query(
        `INSERT INTO apple_credentials (user_id, refresh_token_ciphertext, iv, auth_tag)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, client_kind) DO UPDATE
           SET refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
               iv = EXCLUDED.iv,
               auth_tag = EXCLUDED.auth_tag,
               updated_at = now()`,
        [user.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
      );
    }

    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [user.id, tokenHash],
    );
    await client.query("COMMIT");

    return {
      sessionToken,
      userId: user.id,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve only the original safe error path.
    }
    throw error;
  } finally {
    client.release();
  }
}

function codesMatch(suppliedCode: string, configuredCode: string): boolean {
  const suppliedHash = createHash("sha256").update(suppliedCode, "utf8").digest();
  const configuredHash = createHash("sha256").update(configuredCode, "utf8").digest();
  return timingSafeEqual(suppliedHash, configuredHash);
}

function sessionResponse(session: OwnerSession) {
  return SignInWithAppleResponse.parse({
    sessionToken: session.sessionToken,
    user: { id: session.userId },
  });
}


```

## Proof: invitation hashing, creation and one-time response

```ts
export function tokenHash(token: string) { return createHash("sha256").update(token).digest(); }
export function invitationCodeHash(pepper: string, email: string, code: string) {
  return createHmac("sha256", pepper).update(`${email}:${code}`).digest();
}
function config(env: NodeJS.ProcessEnv) {
  if (!env.CODE_PEPPER || !env.PUBLIC_BASE_URL) throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
  }
  return { pepper: env.CODE_PEPPER, base: base.toString().replace(/\/$/, "") };
}
export function createInvitationRouter(db: Pool, env: NodeJS.ProcessEnv) {
  const router = Router();
  memberRoute(router, db, "post", "/invitations", "members.manage", async (tx, _member, ws, req) => {
    const body = operation.extend({ role: z.enum(["PARTNER","ADMIN","LEAD","WORKER"]), email: emailSchema,
      name: z.string().trim().max(60).optional(), financial_access: z.boolean().nullable().optional(),
      worker_id: z.string().uuid().nullable().optional() }).strict().parse(req.body);
    const { pepper, base } = config(env);
    let once: { token: string; code: string; link: string } | undefined;
    const result = await withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "POST /invitations", ...body }, async () => {
        const token = randomBytes(32).toString("base64url");
        const code = randomInt(0, 1000000).toString().padStart(6, "0");
        const result = await tx.query("select create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result",
          [ws, req.ctx!.userId, randomUUID(), body.role, body.financial_access ?? null, body.worker_id ?? null,
            body.email, tokenHash(token), invitationCodeHash(pepper, body.email, code), body.name ?? null]);
        once = { token, code, link: `${base}/join/${token}` };
        // Only the safe result is persisted. Raw credentials exist for this response only.
        return result.rows[0].result;
      });
    return { ...result, token: once?.token ?? null, code: once?.code ?? null, link: once?.link ?? null, already_created: !once };
  });

```

## Proof: accept commits before mapping error results

```ts
  const accept = (byCode: boolean): RequestHandler => async (req, res, next) => {
    try {
      const body = byCode
        ? operation.extend({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body)
        : operation.extend({ token: tokenSchema }).strict().parse(req.body);
      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
        { route: byCode ? "POST /invite/accept-code" : "POST /invite/accept", ...body }, async () => {
          const result = "token" in body
            ? await tx.query("select accept_invitation($1,$2) as result", [req.ctx!.userId, tokenHash(body.token)])
            : await tx.query("select accept_invitation_code($1,$2,$3) as result",
              [req.ctx!.userId, body.email, invitationCodeHash(config(env).pepper, body.email, body.code)]);
          return result.rows[0].result;
        }));
      // COMMIT precedes mapping error results: attempts and expiry/revocation changes must survive.
      if (result.error) {
        const mapped = mapError({ code: result.error });
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, correlationId: res.locals.correlationId } });
      } else res.json(result);
    } catch (error) { next(error); }
  };
  sessionRoute(router, db, "post", "/invite/accept", accept(false));
  sessionRoute(router, db, "post", "/invite/accept-code", invitationLimiter(10, true), accept(true));

```

## Proof: actual registered route table

Paths below are the recorded Express leaf paths. The router is mounted at /v1 and /api/v1; /apple, /dev and /signout are additionally mounted under /auth.

| Method | Recorded path | Kind | Action |
|---|---|---|---|
| GET | /health | public | — |
| POST | /apple | public | — |
| POST | /dev | public | — |
| POST | /signout | session | — |
| GET | /me | session | — |
| PATCH | /me | session | — |
| GET | /config | public | — |
| POST | /workspaces | session | — |
| GET | /workspace | member | workspace.read |
| PATCH | /workspace | member | settings.edit |
| GET | /members | member | workspace.read |
| DELETE | /members/:userId | member | workspace.read |
| PATCH | /members/:userId | member | members.manage |
| POST | /invitations | member | members.manage |
| GET | /invitations | member | members.manage |
| DELETE | /invitations/:id | member | members.manage |
| POST | /invite/peek | public | — |
| POST | /invite/accept | session | — |
| POST | /invite/accept-code | session | — |
| POST | /invite/decline | public | — |

## Proof: development memberships query

```sql
select w.name, m.role from workspaces w left join memberships m on m.workspace_id = w.id;
```

```text
 name | role
------+------
(0 rows)
```

The development database had no legacy workspaces to backfill; this is the actual query result, not a test fixture. Test workspaces live only in throwaway schemas.

## All suite counts and actual startup evidence

Database: 8 SQL files, 12 PASS groups, zero failures. Server: 5 files, 166 tests passed. Mobile: 6 suites, 77 tests passed. Web is not in scope before Phase 1c.

```text
DATABASE
01_pay_vectors: PASS
02_ledger_core: PASS
03_payments_and_checks: PASS
03b_payment_note: PASS
04_reimb_adj_rest_rates: PASS
05_account_deletion: PASS
06_payout_signatures_totals: PASS
07_share_links: PASS
11_identity_memberships: PASS
11b_names_and_linking: PASS
11c_inviters_and_actor: PASS
11d_code_spray: PASS
DB tests: all files passed
SERVER
 ✓ test/startup.test.ts (4 tests) 8ms
 ✓ test/shared.test.ts (26 tests) 47ms
 ✓ test/foundation.test.ts (6 tests) 1405ms
 ✓ test/auth.test.ts (41 tests) 2617ms
 ✓ test/identity.test.ts (89 tests) 7953ms
 Test Files  5 passed (5)
      Tests  166 passed (166)
   Duration  9.90s (transform 3.24s, setup 0ms, collect 6.26s, tests 12.03s, environment 1ms, prepare 547ms)
MOBILE
PASS __tests__/signInAvailability.test.tsx
PASS __tests__/auth.test.tsx
PASS __tests__/workspace.test.tsx
PASS __tests__/sessionRace.test.tsx
PASS __tests__/components.test.tsx
PASS __tests__/mobileApi.test.ts
Test Suites: 6 passed, 6 total
Tests:       77 passed, 77 total
Time:        6.207 s
API START
[20:36:06.294] INFO (3801): Migrations ready
    applied: 0
[20:36:06.297] INFO (3801): Server listening
    port: 8080
EXPO START
Starting project at /home/runner/workspace/artifacts/crewtally-mobile
Starting Metro Bundler
/home/runner/workspace/node_modules/.pnpm/@react-native+debugger-shell@0.86.3/node_modules/@react-native/debugger-shell/bin/react-native-devtools: error while loading shared libraries: libdbus-1.so.3: cannot open shared object file: No such file or directory
› Scan the QR code above to open in Expo Go.
exp://d545b864-b445-49e9-8fb5-949b581421df-00-nan59254efun.expo.janeway.replit.dev
› Web: http://localhost:18359
› Using Expo Go
Web Bundled 1131ms node_modules/.pnpm/expo-router@57.0.24_cb5c7044c53fe67819d4fc27a3be1ef1/node_modules/expo-router/entry.js (1612 modules)
Web Bundled 65ms node_modules/.pnpm/expo-router@57.0.24_cb5c7044c53fe67819d4fc27a3be1ef1/node_modules/expo-router/entry.js (1 module)

```

Database test filenames:

01_pay_vectors.sql     05_account_deletion.sql
02_ledger_core.sql     06_payout_signatures_totals.sql
03_payments_and_checks.sql   07_share_links.sql
04_reimb_adj_rest_rates.sql  11_identity_memberships.sql

API and mobile typechecks pass. Orval generation and shared-library TypeScript build pass. The running API answers /api/v1/health with HTTP 200 and {"status":"ok","db":"ok","migrations":3}; /api/v1/config answers HTTP 200 and {"business_enabled":false}. Unavailable /api/join pages answer HTTP 200 with no-store, no-referrer and CSP.

## Browser verification

PASS at 402 × 874: start required wording and Privacy link; Get started and Join my team both reach signed-out AccountSignIn; Developer sign-in sheet contains the four unselected labels, blank code field, disabled submit and accessible Close; controls fit without clipping. No credential was entered and no secret was accessed or logged. No Business or sample entry appears. Screenshot: screenshots/phase1b-start.jpg. Authenticated native journeys are covered by the API and native-unit suites, not this browser pass.

## Unfinished verification, assumptions and review points

- The eight-step physical iPhone/Expo Go walkthrough in the phase document was not performed here. Share sheet, native Clipboard, VoiceOver, Dynamic Type and keyboard ergonomics still need that device check; unit tests are not represented as device evidence.
- Real native Apple sign-in remains deferred to the first TestFlight build, as explicitly carried in the phase spec. The nonce, verification, encryption and auth-race regression suites pass.
- Proxy-aware client-IP rate limiting remains the explicit Phase 1c carried item. Current limiters use the socket peer; no untrusted forwarding header is trusted.
- Expo is serving, produced a new QR and bundled successfully, but optional React Native DevTools installation reports missing libdbus-1.so.3. Therefore the Expo environment is running, not warning-free. Existing shadow-style warnings and the browser dev-sheet form warning also remain. No new system dependency was added for optional DevTools.
- Static app.json retains development as extra.appEnv for this development phase. Both __DEV__ and appEnv gate developer UI, and release-guard tests pass; a production manifest label is a later publishing configuration step.
- DELETE operation_id is carried in the JSON body, now documented in OpenAPI. The nine specified authenticated identity writes use the two required helpers; unchanged Phase 1 auth endpoints and the explicitly token-only public decline endpoint retain their contracts (decline is intrinsically idempotent). The broad every-write wording should clarify these explicit exceptions.
- The supplied, unchanged 0003 also caps code guesses across accounts at 20 per email in 24 hours, in addition to five per user/email. That extra guard is tested by 11d_code_spray; it never changes the invitation or disables its link. The phase prose mentions only the per-user limit.
- HTTP errors retain the Phase 1 structured envelope {error:{code,message,correlationId}}, including SESSION_EXPIRED. The phase error-code table is interpreted as naming error.code; function error-results are converted only after COMMIT.
- No Business screens, sample mode, email sign-in/linking, web app, Phase 1c work or money-function changes were built. No other Phase 1b implementation item is intentionally deferred.

## Every created, changed, moved or deleted file

Tracked changes are marked M/D by Git. Untracked filenames below are newly created. The supplied 0003 and test11 are moves (shown by Git as deletion plus new file).

```text
M.replit
Martifacts/api-server/src/app.ts
Martifacts/api-server/src/lib/errors.ts
Martifacts/api-server/src/middlewares/session.ts
Martifacts/api-server/src/routes/auth.ts
Martifacts/api-server/src/routes/health.ts
Martifacts/api-server/src/routes/index.ts
Martifacts/api-server/src/routes/me.ts
Martifacts/api-server/test/auth.test.ts
Martifacts/api-server/test/foundation.test.ts
Martifacts/api-server/test/helpers/tenancy.ts
Martifacts/api-server/test/helpers/test-only-resources.ts
Martifacts/crewtally-mobile/__tests__/auth.test.tsx
Martifacts/crewtally-mobile/__tests__/sessionRace.test.tsx
Martifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx
Dartifacts/crewtally-mobile/app.config.ts
Martifacts/crewtally-mobile/app.json
Martifacts/crewtally-mobile/app/(tabs)/index.tsx
Martifacts/crewtally-mobile/app/(tabs)/more.tsx
Martifacts/crewtally-mobile/app/(tabs)/payments.tsx
Martifacts/crewtally-mobile/app/(tabs)/workers.tsx
Martifacts/crewtally-mobile/app/_layout.tsx
Martifacts/crewtally-mobile/app/account.tsx
Martifacts/crewtally-mobile/app/sign-in.tsx
Martifacts/crewtally-mobile/components/DevSignInSheet.tsx
Martifacts/crewtally-mobile/components/Screen.tsx
Martifacts/crewtally-mobile/constants/colors.ts
Martifacts/crewtally-mobile/contexts/AuthContext.tsx
Martifacts/crewtally-mobile/package.json
Ddb/provided/migrations/0003_identity_and_memberships.sql
Ddb/provided/tests/11_identity_memberships.sql
Mlib/api-client-react/src/generated/api.schemas.ts
Mlib/api-client-react/src/generated/api.ts
Mlib/api-spec/openapi.yaml
Mlib/api-zod/src/generated/api.ts
Mlib/api-zod/src/generated/types/appleSignInResponse.ts
Mlib/api-zod/src/generated/types/devSignInInputLabel.ts
Mlib/api-zod/src/generated/types/index.ts
Mlib/api-zod/src/generated/types/meResponse.ts
Mlib/api-zod/src/generated/types/workspace.ts
Mpnpm-lock.yaml
Mreplit.md
artifacts/api-server/src/auth/member.ts
artifacts/api-server/src/idempotency.ts
artifacts/api-server/src/middlewares/invite-rate-limit.ts
artifacts/api-server/src/routes/invitations.ts
artifacts/api-server/src/routes/members.ts
artifacts/api-server/src/routes/registration.ts
artifacts/api-server/src/routes/workspaces.ts
artifacts/api-server/test/identity.test.ts
artifacts/crewtally-mobile/__tests__/mobileApi.test.ts
artifacts/crewtally-mobile/__tests__/setup/keyboard.js
artifacts/crewtally-mobile/__tests__/workspace.test.tsx
artifacts/crewtally-mobile/app/create-workspace.tsx
artifacts/crewtally-mobile/app/gate.tsx
artifacts/crewtally-mobile/app/join.tsx
artifacts/crewtally-mobile/app/joined.tsx
artifacts/crewtally-mobile/app/partner.tsx
artifacts/crewtally-mobile/app/start.tsx
artifacts/crewtally-mobile/app/switcher.tsx
artifacts/crewtally-mobile/app/welcome.tsx
artifacts/crewtally-mobile/components/Card.tsx
artifacts/crewtally-mobile/components/Field.tsx
artifacts/crewtally-mobile/components/Notice.tsx
artifacts/crewtally-mobile/components/Page.tsx
artifacts/crewtally-mobile/components/WorkspaceHeader.tsx
artifacts/crewtally-mobile/components/WorkspaceList.tsx
artifacts/crewtally-mobile/contexts/WorkspaceContext.tsx
artifacts/crewtally-mobile/lib/intent.ts
artifacts/crewtally-mobile/lib/mobileApi.ts
artifacts/crewtally-mobile/lib/operation.ts
artifacts/crewtally-mobile/lib/roles.ts
artifacts/crewtally-mobile/lib/workspaceStore.ts
db/migrations/0003_identity_and_memberships.sql
db/tests/11_identity_memberships.sql
lib/api-zod/src/generated/types/accountNameInput.ts
lib/api-zod/src/generated/types/accountUser.ts
lib/api-zod/src/generated/types/invitation.ts
lib/api-zod/src/generated/types/invitationAcceptInput.ts
lib/api-zod/src/generated/types/invitationAccepted.ts
lib/api-zod/src/generated/types/invitationCodeInput.ts
lib/api-zod/src/generated/types/invitationCreated.ts
lib/api-zod/src/generated/types/invitationInput.ts
lib/api-zod/src/generated/types/invitationInputRole.ts
lib/api-zod/src/generated/types/invitationList.ts
lib/api-zod/src/generated/types/invitationPreview.ts
lib/api-zod/src/generated/types/invitationStatus.ts
lib/api-zod/src/generated/types/invitationTokenInput.ts
lib/api-zod/src/generated/types/member.ts
lib/api-zod/src/generated/types/memberList.ts
lib/api-zod/src/generated/types/memberRoleInput.ts
lib/api-zod/src/generated/types/memberRoleInputRole.ts
lib/api-zod/src/generated/types/nameResult.ts
lib/api-zod/src/generated/types/okResult.ts
lib/api-zod/src/generated/types/operationInput.ts
lib/api-zod/src/generated/types/publicConfig.ts
lib/api-zod/src/generated/types/workspaceAccess.ts
lib/api-zod/src/generated/types/workspaceAccessCan.ts
lib/api-zod/src/generated/types/workspaceHeaderParameter.ts
lib/api-zod/src/generated/types/workspaceInput.ts
lib/api-zod/src/generated/types/workspaceInputKind.ts
lib/api-zod/src/generated/types/workspaceKind.ts
lib/api-zod/src/generated/types/workspaceNameInput.ts
lib/api-zod/src/generated/types/workspaceSummary.ts
lib/api-zod/src/generated/types/workspaceSummaryKind.ts
screenshots/phase1b-start.jpg
docs/PHASE_1B_GATE_PROOF.md (new gate report)
```

The superseded untracked 1.4 backup copies named above were deleted; Git does not list their deletion.

Phase 1b ready for review
