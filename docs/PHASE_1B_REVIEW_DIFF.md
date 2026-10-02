# Phase 1b independent review diff

Base: `0ec453a`. 62 files; +4328 / −246 lines. Diff: 5718 lines, 293008 bytes (under 400 KB; no split).

Scope: `artifacts/api-server`, `artifacts/crewtally-mobile`, `shared`, `db/migrations`, `db/tests`, `lib/api-spec`. Generated folders, lockfiles, node_modules, build output, screenshots and docs excluded.

| File | Added lines | Removed lines |
|---|---:|---:|
| `artifacts/api-server/src/app.ts` | 12 | 1 |
| `artifacts/api-server/src/auth/member.ts` | 39 | 0 |
| `artifacts/api-server/src/idempotency.ts` | 58 | 0 |
| `artifacts/api-server/src/lib/errors.ts` | 16 | 3 |
| `artifacts/api-server/src/middlewares/invite-rate-limit.ts` | 19 | 0 |
| `artifacts/api-server/src/middlewares/session.ts` | 2 | 4 |
| `artifacts/api-server/src/routes/auth.ts` | 20 | 32 |
| `artifacts/api-server/src/routes/health.ts` | 2 | 1 |
| `artifacts/api-server/src/routes/index.ts` | 7 | 9 |
| `artifacts/api-server/src/routes/invitations.ts` | 121 | 0 |
| `artifacts/api-server/src/routes/me.ts` | 23 | 30 |
| `artifacts/api-server/src/routes/members.ts` | 49 | 0 |
| `artifacts/api-server/src/routes/registration.ts` | 49 | 0 |
| `artifacts/api-server/src/routes/workspaces.ts` | 42 | 0 |
| `artifacts/api-server/test/auth.test.ts` | 35 | 21 |
| `artifacts/api-server/test/foundation.test.ts` | 2 | 2 |
| `artifacts/api-server/test/helpers/tenancy.ts` | 37 | 10 |
| `artifacts/api-server/test/helpers/test-only-resources.ts` | 4 | 3 |
| `artifacts/api-server/test/identity.test.ts` | 389 | 0 |
| `artifacts/crewtally-mobile/__tests__/auth.test.tsx` | 31 | 12 |
| `artifacts/crewtally-mobile/__tests__/mobileApi.test.ts` | 100 | 0 |
| `artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx` | 6 | 4 |
| `artifacts/crewtally-mobile/__tests__/setup/keyboard.js` | 4 | 0 |
| `artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx` | 2 | 2 |
| `artifacts/crewtally-mobile/__tests__/workspace.test.tsx` | 166 | 0 |
| `artifacts/crewtally-mobile/app.config.ts` | 0 | 17 |
| `artifacts/crewtally-mobile/app.json` | 3 | 0 |
| `artifacts/crewtally-mobile/app/(tabs)/index.tsx` | 1 | 1 |
| `artifacts/crewtally-mobile/app/(tabs)/more.tsx` | 63 | 12 |
| `artifacts/crewtally-mobile/app/(tabs)/payments.tsx` | 1 | 1 |
| `artifacts/crewtally-mobile/app/(tabs)/workers.tsx` | 1 | 1 |
| `artifacts/crewtally-mobile/app/_layout.tsx` | 26 | 3 |
| `artifacts/crewtally-mobile/app/account.tsx` | 44 | 5 |
| `artifacts/crewtally-mobile/app/create-workspace.tsx` | 55 | 0 |
| `artifacts/crewtally-mobile/app/gate.tsx` | 87 | 0 |
| `artifacts/crewtally-mobile/app/join.tsx` | 166 | 0 |
| `artifacts/crewtally-mobile/app/joined.tsx` | 52 | 0 |
| `artifacts/crewtally-mobile/app/partner.tsx` | 232 | 0 |
| `artifacts/crewtally-mobile/app/sign-in.tsx` | 2 | 3 |
| `artifacts/crewtally-mobile/app/start.tsx` | 89 | 0 |
| `artifacts/crewtally-mobile/app/switcher.tsx` | 13 | 0 |
| `artifacts/crewtally-mobile/app/welcome.tsx` | 32 | 0 |
| `artifacts/crewtally-mobile/components/Card.tsx` | 9 | 0 |
| `artifacts/crewtally-mobile/components/DevSignInSheet.tsx` | 7 | 4 |
| `artifacts/crewtally-mobile/components/Field.tsx` | 32 | 0 |
| `artifacts/crewtally-mobile/components/Notice.tsx` | 21 | 0 |
| `artifacts/crewtally-mobile/components/Page.tsx` | 20 | 0 |
| `artifacts/crewtally-mobile/components/Screen.tsx` | 5 | 1 |
| `artifacts/crewtally-mobile/components/WorkspaceHeader.tsx` | 38 | 0 |
| `artifacts/crewtally-mobile/components/WorkspaceList.tsx` | 85 | 0 |
| `artifacts/crewtally-mobile/constants/colors.ts` | 40 | 38 |
| `artifacts/crewtally-mobile/contexts/AuthContext.tsx` | 30 | 12 |
| `artifacts/crewtally-mobile/contexts/WorkspaceContext.tsx` | 223 | 0 |
| `artifacts/crewtally-mobile/lib/intent.ts` | 4 | 0 |
| `artifacts/crewtally-mobile/lib/mobileApi.ts` | 159 | 0 |
| `artifacts/crewtally-mobile/lib/operation.ts` | 30 | 0 |
| `artifacts/crewtally-mobile/lib/roles.ts` | 19 | 0 |
| `artifacts/crewtally-mobile/lib/workspaceStore.ts` | 14 | 0 |
| `artifacts/crewtally-mobile/package.json` | 2 | 0 |
| `db/migrations/0003_identity_and_memberships.sql` | 694 | 0 |
| `db/tests/11_identity_memberships.sql` | 405 | 0 |
| `lib/api-spec/openapi.yaml` | 389 | 14 |

```diff
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index be71d5a..183f8cc 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -3,6 +3,8 @@ import { randomUUID } from "node:crypto";
 import { createRouter, type RouterOptions } from "./routes";
 import { logger } from "./lib/logger";
 import { mapError } from "./lib/errors";
+import { pool } from "./db/pool";
+import { joinLanding } from "./routes/invitations";
 
 export function createApp(options: RouterOptions = {}): Express {
   const app: Express = express();
@@ -11,7 +13,7 @@ export function createApp(options: RouterOptions = {}): Express {
   app.use((req, res, next) => {
     res.locals.correlationId = randomUUID();
     res.setHeader("X-Correlation-Id", res.locals.correlationId);
-    if (/(?:^|\/)auth(?:\/|$)/i.test(req.path) || /\/me$/i.test(req.path)) {
+    if (req.get("authorization") || /(?:^|\/)(?:auth|invite|invitations|join)(?:\/|$)/i.test(req.path) || /\/me$/i.test(req.path)) {
       res.setHeader("Cache-Control", "no-store");
     }
     next();
@@ -20,6 +22,14 @@ export function createApp(options: RouterOptions = {}): Express {
   app.use((req, res, next) => {
     const start = process.hrtime.bigint();
     res.on("finish", () => {
+      if (/(?:^|\/)(?:invite|invitations|join)(?:\/|$)/i.test(req.path)) {
+        const operationId = typeof req.body?.operation_id === "string" &&
+          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.body.operation_id)
+          ? req.body.operation_id : undefined;
+        log.info({ correlationId: res.locals.correlationId, operationId, invitationId: res.locals.invitationId,
+          status: res.statusCode }, "invitation request");
+        return;
+      }
       // Only use a registered path template. Unmatched paths must not enter logs.
       log.info({
         correlationId: res.locals.correlationId,
@@ -36,6 +46,7 @@ export function createApp(options: RouterOptions = {}): Express {
   // /api is the Replit proxy prefix; /v1 is also retained for direct callers.
   app.use("/api/v1", router);
   app.use("/v1", router);
+  app.get("/api/join/:token", joinLanding(options.db ?? pool));
   app.use((_req, res) => res.status(404).json({ error: {
     code: "NOT_FOUND", message: "Not found", correlationId: res.locals.correlationId,
   } }));
diff --git a/artifacts/api-server/src/auth/member.ts b/artifacts/api-server/src/auth/member.ts
new file mode 100644
index 0000000..4354dfa
--- /dev/null
+++ b/artifacts/api-server/src/auth/member.ts
@@ -0,0 +1,39 @@
+import type { Request } from "express";
+import type { Pool, PoolClient } from "pg";
+import { z } from "zod";
+
+export interface Member {
+  role: string;
+  financial_access: boolean | null;
+  worker_id: string | null;
+  kind: "HOME" | "BUSINESS";
+}
+
+export async function inTransaction<T>(db: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
+  const tx = await db.connect();
+  try {
+    await tx.query("BEGIN");
+    const result = await fn(tx);
+    await tx.query("COMMIT");
+    return result;
+  } catch (error) {
+    await tx.query("ROLLBACK");
+    throw error;
+  } finally {
+    tx.release();
+  }
+}
+
+export async function withMember<T>(
+  db: Pool, req: Request, action: string,
+  fn: (tx: PoolClient, member: Member, workspaceId: string) => Promise<T>,
+): Promise<T> {
+  const workspace = z.string().uuid().safeParse(req.get("X-Workspace-Id"));
+  if (!workspace.success) throw Object.assign(new Error("Not found"), { code: "CT404" });
+  return inTransaction(db, async tx => {
+    const result = await tx.query<{ member: Member }>(
+      "select require_member($1, $2, $3) as member", [workspace.data, req.ctx!.userId, action],
+    );
+    return fn(tx, result.rows[0]!.member, workspace.data);
+  });
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/idempotency.ts b/artifacts/api-server/src/idempotency.ts
new file mode 100644
index 0000000..c925e79
--- /dev/null
+++ b/artifacts/api-server/src/idempotency.ts
@@ -0,0 +1,58 @@
+import { createHash } from "node:crypto";
+import type { PoolClient } from "pg";
+
+function canonical(value: unknown): string {
+  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
+  if (value && typeof value === "object") {
+    const obj = value as Record<string, unknown>;
+    return `{${Object.keys(obj).sort().filter(key => obj[key] !== undefined)
+      .map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
+  }
+  return JSON.stringify(value) ?? "null";
+}
+
+export function requestHash(userId: string, body: unknown): string {
+  return createHash("sha256").update(canonical({ userId, body })).digest("hex");
+}
+
+export async function withUserIdempotency<T>(
+  tx: PoolClient, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
+): Promise<T> {
+  const hash = requestHash(userId, body);
+  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`user:${userId}:${operationId}`]);
+  const prior = await tx.query<{ request_hash: string; response: T }>(
+    "select request_hash, response from user_idempotency_keys where user_id = $1 and operation_id = $2",
+    [userId, operationId],
+  );
+  if (prior.rowCount) {
+    if (prior.rows[0]!.request_hash !== hash) {
+      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
+    }
+    return prior.rows[0]!.response;
+  }
+  const response = await fn();
+  await tx.query("insert into user_idempotency_keys(user_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
+    [userId, operationId, hash, JSON.stringify(response)]);
+  return response;
+}
+
+export async function withWorkspaceIdempotency<T>(
+  tx: PoolClient, workspaceId: string, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
+): Promise<T> {
+  const hash = requestHash(userId, body);
+  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`workspace:${workspaceId}:${operationId}`]);
+  const prior = await tx.query<{ request_hash: string; response: T }>(
+    "select request_hash, response from idempotency_keys where workspace_id = $1 and operation_id = $2",
+    [workspaceId, operationId],
+  );
+  if (prior.rowCount) {
+    if (prior.rows[0]!.request_hash !== hash) {
+      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
+    }
+    return prior.rows[0]!.response;
+  }
+  const response = await fn();
+  await tx.query("insert into idempotency_keys(workspace_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
+    [workspaceId, operationId, hash, JSON.stringify(response)]);
+  return response;
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/lib/errors.ts b/artifacts/api-server/src/lib/errors.ts
index 0697225..4265b0a 100644
--- a/artifacts/api-server/src/lib/errors.ts
+++ b/artifacts/api-server/src/lib/errors.ts
@@ -1,21 +1,34 @@
 import { ZodError } from "zod";
 
 const states: Record<string, { status: number; code: string; message: string }> = {
+  AUTH_INVALID_INPUT: { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
+  INVITATIONS_UNAVAILABLE: { status: 503, code: "INVITATIONS_UNAVAILABLE", message: "Invitations are temporarily unavailable" },
+  CT404: { status: 404, code: "NOT_FOUND", message: "Not found" },
+  CT403: { status: 403, code: "FORBIDDEN", message: "Not allowed" },
+  CT409: { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
+  CT410: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
+  CT429: { status: 429, code: "TOO_MANY", message: "Too many attempts. Try again later." },
+  OPERATION_REUSED: { status: 409, code: "OPERATION_REUSED", message: "Operation already used for a different request" },
+  INVITATION_NOT_AVAILABLE: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
+  INVITATION_CODE_WRONG: { status: 400, code: "INVITATION_CODE_WRONG", message: "That code didn't work. Check the email address and the code, or ask for a new invitation." },
   P0002: { status: 404, code: "NOT_FOUND", message: "Not found" },
   "40001": { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
   "55000": { status: 409, code: "CONFIRMATION_REQUIRED", message: "Confirmation required" },
-  "22023": { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
+  "22023": { status: 400, code: "INVALID", message: "Invalid input" },
   "23505": { status: 409, code: "CONFLICT", message: "Record already exists" },
   "23503": { status: 404, code: "NOT_FOUND", message: "Not found" },
-  "23514": { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
+  "23514": { status: 422, code: "ROLE_DOES_NOT_FIT", message: "Role does not fit this workspace" },
 };
 
 export function mapError(error: unknown) {
-  if (error instanceof ZodError) return { status: 422, code: "INVALID_INPUT", message: "Invalid input" };
+  if (error instanceof ZodError) return { status: 400, code: "INVALID", message: "Invalid input" };
   const type = error && typeof error === "object" && "type" in error ? error.type : null;
   if (type === "entity.too.large") return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
   if (type === "entity.parse.failed") return { status: 400, code: "INVALID_JSON", message: "Invalid JSON body" };
   const state = error && typeof error === "object" && "code" in error ? error.code : null;
+  if (state === "22023" && error instanceof Error && error.message === "WORKER_RECORD_REQUIRED") {
+    return { status: 400, code: "WORKER_RECORD_REQUIRED", message: "Worker record required" };
+  }
   return (typeof state === "string" && states[state]) || {
     status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred",
   };
diff --git a/artifacts/api-server/src/middlewares/invite-rate-limit.ts b/artifacts/api-server/src/middlewares/invite-rate-limit.ts
new file mode 100644
index 0000000..b0377f1
--- /dev/null
+++ b/artifacts/api-server/src/middlewares/invite-rate-limit.ts
@@ -0,0 +1,19 @@
+import type { RequestHandler } from "express";
+
+export function invitationLimiter(limit: number, byUser = false): RequestHandler {
+  const windows = new Map<string, { start: number; count: number }>();
+  return (req, res, next) => {
+    const now = Date.now();
+    for (const [key, value] of windows) if (now - value.start >= 60000) windows.delete(key);
+    const key = byUser ? req.ctx!.userId : req.ip ?? "<unknown>";
+    const window = windows.get(key) ?? { start: now, count: 0 };
+    window.count++;
+    windows.set(key, window);
+    if (window.count > limit) {
+      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((window.start + 60000 - now) / 1000))));
+      res.status(429).json({ error: { code: "TOO_MANY", message: "Too many attempts. Try again later.", correlationId: res.locals.correlationId } });
+      return;
+    }
+    next();
+  };
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/middlewares/session.ts b/artifacts/api-server/src/middlewares/session.ts
index 7c56cb3..a8dff8a 100644
--- a/artifacts/api-server/src/middlewares/session.ts
+++ b/artifacts/api-server/src/middlewares/session.ts
@@ -4,7 +4,6 @@ import { hashSessionToken } from "../auth/apple";
 
 export interface SessionContext {
   userId: string;
-  workspaceId: string;
   sessionId: string;
 }
 
@@ -33,11 +32,10 @@ export function requireSession(db: Pool): RequestHandler {
       const tokenHash = hashSessionToken(match[1]!);
       const result = await db.query<SessionContext>(
         `WITH eligible AS (
-           SELECT s.id AS "sessionId", s.user_id AS "userId", w.id AS "workspaceId",
+           SELECT s.id AS "sessionId", s.user_id AS "userId",
                   (s.last_seen_at <= now() - interval '24 hours') AS extend_session
            FROM sessions s
            JOIN users u ON u.id = s.user_id
-           JOIN workspaces w ON w.owner_id = u.id
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > now()
@@ -51,7 +49,7 @@ export function requireSession(db: Pool): RequestHandler {
            WHERE s.id = e."sessionId"
            RETURNING s.id
          )
-         SELECT e."sessionId", e."userId", e."workspaceId"
+          SELECT e."sessionId", e."userId"
          FROM eligible e
          JOIN touched t ON t.id = e."sessionId"`,
         [tokenHash],
diff --git a/artifacts/api-server/src/routes/auth.ts b/artifacts/api-server/src/routes/auth.ts
index c8cb627..b31c6bf 100644
--- a/artifacts/api-server/src/routes/auth.ts
+++ b/artifacts/api-server/src/routes/auth.ts
@@ -6,7 +6,8 @@ import {
 } from "@workspace/api-zod";
 import { createHash, timingSafeEqual } from "node:crypto";
 import type { Pool } from "pg";
-import { validate } from "../lib/validate";
+import type { ZodType } from "zod";
+import type { RequestHandler } from "express";
 import {
   createAppleJwks,
   createSessionToken,
@@ -16,7 +17,7 @@ import {
   verifyAppleIdentityToken,
 } from "../auth/apple";
 import { AuthConfigError, type AuthConfig } from "../auth/config";
-import { requireSession } from "../middlewares/session";
+import { publicRoute, sessionRoute } from "./registration";
 
 export interface AuthRouterOptions {
   db: Pool;
@@ -28,6 +29,18 @@ export interface AuthRouterOptions {
   };
 }
 
+// Preserve Phase 1's Apple/body validation response, except P1b's explicit
+// unknown-developer-label rule (400 INVALID).
+function validateAuth(schema: ZodType, dev = false): RequestHandler {
+  return (req, _res, next) => {
+    const parsed = schema.safeParse(req.body);
+    if (parsed.success) { req.body = parsed.data; next(); return; }
+    const unknownLabel = dev && typeof req.body?.label === "string" &&
+      !["owner-a", "owner-b", "member-c", "member-d"].includes(req.body.label);
+    next(Object.assign(new Error("Invalid input"), { code: unknownLabel ? "22023" : "AUTH_INVALID_INPUT" }));
+  };
+}
+
 class DeletedAccountError extends Error {
   constructor() {
     super("Account unavailable");
@@ -37,9 +50,6 @@ class DeletedAccountError extends Error {
 interface OwnerSession {
   sessionToken: string;
   userId: string;
-  workspaceId: string;
-  workspaceName: string;
-  currency: string;
 }
 
 async function createOwnerSession(
@@ -63,26 +73,13 @@ async function createOwnerSession(
     const user = userResult.rows[0]!;
     if (user.deleted_at) throw new DeletedAccountError();
 
-    const workspaceResult = await client.query<{
-      id: string;
-      name: string;
-      currency: string;
-    }>(
-      `INSERT INTO workspaces (owner_id, name, currency_code)
-       VALUES ($1, 'My workspace', 'USD')
-       ON CONFLICT (owner_id) DO UPDATE SET owner_id = EXCLUDED.owner_id
-       RETURNING id, name, currency_code::text AS currency`,
-      [user.id],
-    );
-    const workspace = workspaceResult.rows[0]!;
-
     if (refreshToken) {
       if (!tokenEncryptionKey) throw new Error("Apple credential encryption unavailable");
       const encrypted = encryptRefreshToken(refreshToken, tokenEncryptionKey, user.id);
       await client.query(
         `INSERT INTO apple_credentials (user_id, refresh_token_ciphertext, iv, auth_tag)
          VALUES ($1, $2, $3, $4)
-         ON CONFLICT (user_id) DO UPDATE
+         ON CONFLICT (user_id, client_kind) DO UPDATE
            SET refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
                iv = EXCLUDED.iv,
                auth_tag = EXCLUDED.auth_tag,
@@ -101,9 +98,6 @@ async function createOwnerSession(
     return {
       sessionToken,
       userId: user.id,
-      workspaceId: workspace.id,
-      workspaceName: workspace.name,
-      currency: workspace.currency,
     };
   } catch (error) {
     try {
@@ -126,12 +120,6 @@ function codesMatch(suppliedCode: string, configuredCode: string): boolean {
 function sessionResponse(session: OwnerSession) {
   return SignInWithAppleResponse.parse({
     sessionToken: session.sessionToken,
-    workspace: {
-      id: session.workspaceId,
-      name: session.workspaceName,
-      currency: session.currency,
-      locale: "en-US",
-    },
     user: { id: session.userId },
   });
 }
@@ -144,7 +132,7 @@ export function createAuthRouter(options: AuthRouterOptions): IRouter {
     return decoded.byteLength === 32 && decoded.toString("base64url") === rawNonce;
   });
 
-  router.post("/apple", validate(signInBodySchema), async (req, res, next) => {
+  publicRoute(router, "post", "/apple", validateAuth(signInBodySchema), async (req, res, next) => {
     let config: AuthConfig;
     try {
       config = options.getConfig();
@@ -216,8 +204,8 @@ export function createAuthRouter(options: AuthRouterOptions): IRouter {
   });
 
   if (options.devSigninCode !== undefined) {
-    router.post("/dev", validate(SignInDevBody.strict()), async (req, res, next): Promise<void> => {
-      const body = req.body as { code: string; label: "owner-a" | "owner-b" };
+    publicRoute(router, "post", "/dev", validateAuth(SignInDevBody.strict(), true), async (req, res, next): Promise<void> => {
+      const body = req.body as { code: string; label: "owner-a" | "owner-b" | "member-c" | "member-d" };
       if (!codesMatch(body.code, options.devSigninCode!)) {
         res.status(401).json({ error: {
           code: "INVALID_CREDENTIALS",
@@ -245,7 +233,7 @@ export function createAuthRouter(options: AuthRouterOptions): IRouter {
     });
   }
 
-  router.post("/signout", requireSession(options.db), async (req, res, next) => {
+  sessionRoute(router, options.db, "post", "/signout", async (req, res, next) => {
     const context = req.ctx!;
     try {
       await options.db.query(
diff --git a/artifacts/api-server/src/routes/health.ts b/artifacts/api-server/src/routes/health.ts
index fa2b02c..f548cac 100644
--- a/artifacts/api-server/src/routes/health.ts
+++ b/artifacts/api-server/src/routes/health.ts
@@ -2,13 +2,14 @@ import { Router, type IRouter } from "express";
 import type { Pool } from "pg";
 import { pool } from "../db/pool";
 import { logger } from "../lib/logger";
+import { publicRoute } from "./registration";
 
 export function createHealthRouter(
   db: Pool = pool,
   log: typeof logger = logger,
 ): IRouter {
   const router: IRouter = Router();
-  router.get("/health", async (_req, res, next) => {
+  publicRoute(router, "get", "/health", async (_req, res, next) => {
     let phase = "database";
     try {
       await db.query("select 1");
diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index 362da87..cc914d6 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@ -9,6 +9,9 @@ import { requireSession } from "../middlewares/session";
 import { createAuthRouter } from "./auth";
 import { createHealthRouter } from "./health";
 import { createMeRouter } from "./me";
+import { createWorkspaceRouter } from "./workspaces";
+import { createMembersRouter } from "./members";
+import { createInvitationRouter } from "./invitations";
 
 export interface RouterLogger {
   info: (fields: Record<string, unknown>, message?: string) => void;
@@ -47,16 +50,11 @@ export function createRouter(options: RouterOptions = {}): IRouter {
     logger: options.logger ?? logger,
   }));
 
-  const protect = requireSession(db);
-  router.use((req, res, next) => {
-    if (req.path === "/health" || req.path.startsWith("/auth/")) {
-      next();
-      return;
-    }
-    protect(req, res, next);
-  });
   router.use(createMeRouter(db));
-  if (options.testOnlyProtectedRouter) router.use(options.testOnlyProtectedRouter);
+  router.use(createWorkspaceRouter(db, env));
+  router.use(createMembersRouter(db));
+  router.use(createInvitationRouter(db, env));
+  if (options.testOnlyProtectedRouter) router.use(requireSession(db), options.testOnlyProtectedRouter);
   return router;
 }
 
diff --git a/artifacts/api-server/src/routes/invitations.ts b/artifacts/api-server/src/routes/invitations.ts
new file mode 100644
index 0000000..b9f3107
--- /dev/null
+++ b/artifacts/api-server/src/routes/invitations.ts
@@ -0,0 +1,121 @@
+import { Router, type RequestHandler } from "express";
+import type { Pool } from "pg";
+import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
+import { z } from "zod";
+import { inTransaction } from "../auth/member";
+import { withUserIdempotency, withWorkspaceIdempotency } from "../idempotency";
+import { mapError } from "../lib/errors";
+import { invitationLimiter } from "../middlewares/invite-rate-limit";
+import { memberRoute, publicRoute, sessionRoute } from "./registration";
+import { operation } from "./workspaces";
+
+const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
+const emailSchema = z.string().trim().toLowerCase().email().max(254);
+export function tokenHash(token: string) { return createHash("sha256").update(token).digest(); }
+export function invitationCodeHash(pepper: string, email: string, code: string) {
+  return createHmac("sha256", pepper).update(`${email}:${code}`).digest();
+}
+function config(env: NodeJS.ProcessEnv) {
+  if (!env.CODE_PEPPER || !env.PUBLIC_BASE_URL) throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
+  const base = new URL(env.PUBLIC_BASE_URL);
+  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
+    throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
+  }
+  return { pepper: env.CODE_PEPPER, base: base.toString().replace(/\/$/, "") };
+}
+export function createInvitationRouter(db: Pool, env: NodeJS.ProcessEnv) {
+  const router = Router();
+  memberRoute(router, db, "post", "/invitations", "members.manage", async (tx, _member, ws, req) => {
+    const body = operation.extend({ role: z.enum(["PARTNER","ADMIN","LEAD","WORKER"]), email: emailSchema,
+      name: z.string().trim().max(60).optional(), financial_access: z.boolean().nullable().optional(),
+      worker_id: z.string().uuid().nullable().optional() }).strict().parse(req.body);
+    const { pepper, base } = config(env);
+    let once: { token: string; code: string; link: string } | undefined;
+    const result = await withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
+      { route: "POST /invitations", ...body }, async () => {
+        const token = randomBytes(32).toString("base64url");
+        const code = randomInt(0, 1000000).toString().padStart(6, "0");
+        const result = await tx.query("select create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result",
+          [ws, req.ctx!.userId, randomUUID(), body.role, body.financial_access ?? null, body.worker_id ?? null,
+            body.email, tokenHash(token), invitationCodeHash(pepper, body.email, code), body.name ?? null]);
+        once = { token, code, link: `${base}/join/${token}` };
+        // Only the safe result is persisted. Raw credentials exist for this response only.
+        return result.rows[0].result;
+      });
+    return { ...result, token: once?.token ?? null, code: once?.code ?? null, link: once?.link ?? null, already_created: !once };
+  });
+  memberRoute(router, db, "get", "/invitations", "members.manage", async (tx, _member, ws) => {
+    const result = await tx.query(
+      `select id, invitee_name, email, role, status, expires_at from invitations
+       where workspace_id=$1 and (status='PENDING' or created_at > now()-interval '30 days') order by created_at desc`, [ws]);
+    return { invitations: result.rows };
+  });
+  memberRoute(router, db, "delete", "/invitations/:id", "members.manage", async (tx, _member, ws, req) => {
+    const id = z.string().uuid().parse(req.params.id);
+    const body = operation.strict().parse(req.body);
+    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
+      { route: "DELETE /invitations", id, ...body }, async () => {
+        const result = await tx.query("select revoke_invitation($1,$2,$3) as result", [ws, req.ctx!.userId, id]);
+        return result.rows[0].result;
+      });
+  });
+  publicRoute(router, "post", "/invite/peek", invitationLimiter(20), async (req, res, next) => {
+    try {
+      const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
+      const result = await db.query("select peek_invitation($1) as result", [tokenHash(token)]);
+      res.json(result.rows[0].result);
+    } catch (error) { next(error); }
+  });
+  const accept = (byCode: boolean): RequestHandler => async (req, res, next) => {
+    try {
+      const body = byCode
+        ? operation.extend({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body)
+        : operation.extend({ token: tokenSchema }).strict().parse(req.body);
+      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
+        { route: byCode ? "POST /invite/accept-code" : "POST /invite/accept", ...body }, async () => {
+          const result = "token" in body
+            ? await tx.query("select accept_invitation($1,$2) as result", [req.ctx!.userId, tokenHash(body.token)])
+            : await tx.query("select accept_invitation_code($1,$2,$3) as result",
+              [req.ctx!.userId, body.email, invitationCodeHash(config(env).pepper, body.email, body.code)]);
+          return result.rows[0].result;
+        }));
+      // COMMIT precedes mapping error results: attempts and expiry/revocation changes must survive.
+      if (result.error) {
+        const mapped = mapError({ code: result.error });
+        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, correlationId: res.locals.correlationId } });
+      } else res.json(result);
+    } catch (error) { next(error); }
+  };
+  sessionRoute(router, db, "post", "/invite/accept", accept(false));
+  sessionRoute(router, db, "post", "/invite/accept-code", invitationLimiter(10, true), accept(true));
+  publicRoute(router, "post", "/invite/decline", async (req, res, next) => {
+    try {
+      const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
+      const result = await db.query("select decline_invitation($1) as result", [tokenHash(token)]);
+      res.json(result.rows[0].result);
+    } catch (error) { next(error); }
+  });
+  return router;
+}
+
+function htmlEscape(value: string) {
+  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
+}
+export function joinLanding(db: Pool): RequestHandler {
+  const limiter = invitationLimiter(20);
+  return (req, res, next) => {
+    res.setHeader("Cache-Control", "no-store");
+    res.setHeader("Referrer-Policy", "no-referrer");
+    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
+    limiter(req, res, async error => {
+      if (error) return next(error);
+      try {
+        const token = tokenSchema.safeParse(req.params.token);
+        const data = token.success ? (await db.query("select peek_invitation($1) as result", [tokenHash(token.data)])).rows[0].result : { available: false };
+        const message = data.available ? `You've been invited to help with ${data.workspace_name}`
+          : "This invitation isn't available. Ask for a new one.";
+        res.type("html").send(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrewTally invitation</title><style>body{font:18px system-ui;background:#f6f8f5;color:#15362f;max-width:36rem;padding:2rem;margin:auto}a{color:#086b60;display:inline-block;padding:14px 0}@media(prefers-color-scheme:dark){body{background:#11201c;color:#eef7f1}a{color:#8cddc0}}</style></head><body><h1>${htmlEscape(message)}</h1>${data.available ? '<a href="crewtally-mobile://">Open CrewTally on your iPhone</a><p>In Expo Go, open CrewTally and choose Join a team. Enter the email address and code from your invitation.</p>' : ""}</body></html>`);
+      } catch (error) { next(error); }
+    });
+  };
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/routes/me.ts b/artifacts/api-server/src/routes/me.ts
index 6e255a3..d98c8bf 100644
--- a/artifacts/api-server/src/routes/me.ts
+++ b/artifacts/api-server/src/routes/me.ts
@@ -1,39 +1,32 @@
 import { Router, type IRouter } from "express";
-import { GetMeResponse } from "@workspace/api-zod";
 import type { Pool } from "pg";
-import { requireSession } from "../middlewares/session";
+import { z } from "zod";
+import { inTransaction } from "../auth/member";
+import { withUserIdempotency } from "../idempotency";
+import { sessionRoute } from "./registration";
 
 export function createMeRouter(db: Pool): IRouter {
-  const router: IRouter = Router();
-  router.get("/me", requireSession(db), async (req, res, next) => {
+  const router = Router();
+  sessionRoute(router, db, "get", "/me", async (req, res, next) => {
     try {
-      const context = req.ctx!;
-      const result = await db.query<{
-        id: string;
-        name: string;
-        currency: string;
-      }>(
-        `SELECT id, name, currency_code::text AS currency
-         FROM workspaces
-         WHERE id = $1 AND owner_id = $2`,
-        [context.workspaceId, context.userId],
+      const result = await db.query(
+        `select id, display_name, email, (apple_sub is not null and apple_sub not like 'dev:%') as has_apple,
+         my_workspaces(id) as workspaces from users where id = $1 and deleted_at is null`, [req.ctx!.userId],
       );
-      const workspace = result.rows[0];
-      if (!workspace) {
-        res.status(401).json({ error: {
-          code: "SESSION_EXPIRED",
-          message: "Session expired",
-          correlationId: res.locals.correlationId,
-        } });
-        return;
-      }
-      res.status(200).json(GetMeResponse.parse({
-        workspace: { ...workspace, locale: "en-US" },
-        user: { id: context.userId },
-      }));
-    } catch (error) {
-      next(error);
-    }
+      const { workspaces, ...user } = result.rows[0];
+      res.json({ user, workspaces });
+    } catch (error) { next(error); }
+  });
+  sessionRoute(router, db, "patch", "/me", async (req, res, next) => {
+    try {
+      const body = z.object({ display_name: z.string().trim().max(60), operation_id: z.string().uuid() }).strict().parse(req.body);
+      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
+        { route: "PATCH /me", ...body }, async () => {
+          const result = await tx.query("select set_display_name($1, $2) as result", [req.ctx!.userId, body.display_name || null]);
+          return result.rows[0].result;
+        }));
+      res.json(result);
+    } catch (error) { next(error); }
   });
   return router;
 }
\ No newline at end of file
diff --git a/artifacts/api-server/src/routes/members.ts b/artifacts/api-server/src/routes/members.ts
new file mode 100644
index 0000000..623b252
--- /dev/null
+++ b/artifacts/api-server/src/routes/members.ts
@@ -0,0 +1,49 @@
+import { Router } from "express";
+import type { Pool } from "pg";
+import { z } from "zod";
+import { withWorkspaceIdempotency } from "../idempotency";
+import { memberRoute } from "./registration";
+import { operation } from "./workspaces";
+
+export function createMembersRouter(db: Pool) {
+  const router = Router();
+  memberRoute(router, db, "get", "/members", "workspace.read", async (tx, _member, ws, req) => {
+    const permission = await tx.query("select member_can($1,$2,'members.manage') as allowed", [ws, req.ctx!.userId]);
+    const manages = permission.rows[0].allowed as boolean;
+    const result = await tx.query(
+      `select m.user_id, u.display_name, m.role, m.financial_access, m.created_at as joined_at,
+        case when $2 then u.email end as email,
+        coalesce(u.display_name, case when $2 then label.invitee_name end,
+          initcap(m.role)) as name
+       from memberships m join users u on u.id=m.user_id
+       left join lateral (select i.invitee_name from invitations i where i.workspace_id=m.workspace_id
+         and i.decided_by=m.user_id and i.status='ACCEPTED' order by i.decided_at desc limit 1) label on true
+       where m.workspace_id=$1 and m.status='ACTIVE' and u.deleted_at is null order by m.created_at`, [ws, manages],
+    );
+    return { members: result.rows.map(row => {
+      if (!manages) delete row.email;
+      return row;
+    }) };
+  });
+  memberRoute(router, db, "delete", "/members/:userId", "workspace.read", async (tx, _member, ws, req) => {
+    const userId = z.string().uuid().parse(req.params.userId);
+    const body = operation.strict().parse(req.body);
+    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
+      { route: "DELETE /members", userId, ...body }, async () => {
+        const result = await tx.query("select remove_member($1,$2,$3) as result", [ws, req.ctx!.userId, userId]);
+        return result.rows[0].result;
+      });
+  });
+  memberRoute(router, db, "patch", "/members/:userId", "members.manage", async (tx, _member, ws, req) => {
+    const userId = z.string().uuid().parse(req.params.userId);
+    const body = operation.extend({ role: z.enum(["ORGANIZER","PARTNER","OWNER","ADMIN","LEAD","WORKER"]),
+      financial_access: z.boolean().nullable().optional() }).strict().parse(req.body);
+    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
+      { route: "PATCH /members", userId, ...body }, async () => {
+        const result = await tx.query("select change_member_role($1,$2,$3,$4,$5) as result",
+          [ws, req.ctx!.userId, userId, body.role, body.financial_access ?? null]);
+        return result.rows[0].result;
+      });
+  });
+  return router;
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/routes/registration.ts b/artifacts/api-server/src/routes/registration.ts
new file mode 100644
index 0000000..e543923
--- /dev/null
+++ b/artifacts/api-server/src/routes/registration.ts
@@ -0,0 +1,49 @@
+import type { IRouter, RequestHandler, Request } from "express";
+import type { Pool, PoolClient } from "pg";
+import * as membership from "../auth/member";
+import { requireSession } from "../middlewares/session";
+
+export type Method = "get" | "post" | "patch" | "delete" | "put";
+export interface RouteEntry {
+  method: Method;
+  path: string;
+  kind: "public" | "session" | "member";
+  action?: string;
+}
+const tables = new WeakMap<IRouter, RouteEntry[]>();
+export function registeredRoutes(router: IRouter): RouteEntry[] {
+  const entries = [...(tables.get(router) ?? [])];
+  for (const layer of router.stack) {
+    const nested = layer.handle as unknown as IRouter;
+    if (!layer.route && nested?.stack) entries.push(...registeredRoutes(nested));
+  }
+  return entries;
+}
+function record(router: IRouter, entry: RouteEntry) {
+  const table = tables.get(router) ?? [];
+  table.push(entry);
+  tables.set(router, table);
+}
+export function publicRoute(router: IRouter, method: Method, path: string, ...handlers: RequestHandler[]) {
+  record(router, { method, path, kind: "public" });
+  router[method](path, ...handlers);
+}
+export function sessionRoute(router: IRouter, db: Pool, method: Method, path: string, ...handlers: RequestHandler[]) {
+  record(router, { method, path, kind: "session" });
+  router[method](path, requireSession(db), ...handlers);
+}
+export function memberRoute(
+  router: IRouter, db: Pool, method: Method, path: string, action: string,
+  handler: (tx: PoolClient, member: membership.Member, workspaceId: string, req: Request) => Promise<unknown>,
+) {
+  record(router, { method, path, kind: "member", action });
+  router[method](path, requireSession(db), async (req, res, next) => {
+    try {
+      const result = await membership.withMember(db, req, action, (tx, member, workspaceId) => handler(tx, member, workspaceId, req));
+      if (path.startsWith("/invitations") && result && typeof result === "object" && "id" in result) {
+        res.locals.invitationId = result.id;
+      }
+      res.json(result);
+    } catch (error) { next(error); }
+  });
+}
\ No newline at end of file
diff --git a/artifacts/api-server/src/routes/workspaces.ts b/artifacts/api-server/src/routes/workspaces.ts
new file mode 100644
index 0000000..b712cd9
--- /dev/null
+++ b/artifacts/api-server/src/routes/workspaces.ts
@@ -0,0 +1,42 @@
+import { Router } from "express";
+import type { Pool } from "pg";
+import { z } from "zod";
+import { inTransaction } from "../auth/member";
+import { withUserIdempotency, withWorkspaceIdempotency } from "../idempotency";
+import { memberRoute, publicRoute, sessionRoute } from "./registration";
+
+export const operation = z.object({ operation_id: z.string().uuid() });
+const name = z.string().trim().min(1).max(80);
+export async function readWorkspace(tx: Pick<Pool, "query">, id: string) {
+  const result = await tx.query("select id, name, kind, currency_code::text as currency, default_timezone from workspaces where id=$1", [id]);
+  return result.rows[0];
+}
+export function createWorkspaceRouter(db: Pool, env: NodeJS.ProcessEnv) {
+  const router = Router();
+  publicRoute(router, "get", "/config", (_req, res) => { res.json({ business_enabled: env.BUSINESS_ENABLED === "true" }); });
+  sessionRoute(router, db, "post", "/workspaces", async (req, res, next) => {
+    try {
+      const body = operation.extend({ kind: z.enum(["HOME", "BUSINESS"]), name, timezone: z.string().min(1).max(100) }).strict().parse(req.body);
+      if (body.kind === "BUSINESS" && env.BUSINESS_ENABLED !== "true") throw Object.assign(new Error("Not found"), { code: "CT404" });
+      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
+        { route: "POST /workspaces", ...body }, async () => {
+          const result = await tx.query("select create_workspace($1,$2,$3,'USD',$4) as id",
+            [req.ctx!.userId, body.kind, body.name, body.timezone]);
+          return readWorkspace(tx, result.rows[0].id);
+        }));
+      res.json(result);
+    } catch (error) { next(error); }
+  });
+  memberRoute(router, db, "get", "/workspace", "workspace.read", async (tx, _member, ws, req) => {
+    const permissions = await tx.query("select member_permissions($1,$2) as result", [ws, req.ctx!.userId]);
+    return { ...await readWorkspace(tx, ws), ...permissions.rows[0].result };
+  });
+  memberRoute(router, db, "patch", "/workspace", "settings.edit", async (tx, _member, ws, req) => {
+    const body = operation.extend({ name }).strict().parse(req.body);
+    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id, { route: "PATCH /workspace", ...body }, async () => {
+      await tx.query("update workspaces set name=$1 where id=$2", [body.name, ws]);
+      return readWorkspace(tx, ws);
+    });
+  });
+  return router;
+}
\ No newline at end of file
diff --git a/artifacts/api-server/test/auth.test.ts b/artifacts/api-server/test/auth.test.ts
index 1003f47..1766d59 100644
--- a/artifacts/api-server/test/auth.test.ts
+++ b/artifacts/api-server/test/auth.test.ts
@@ -166,7 +166,7 @@ async function signIn(app: Express, rawNonce: string, identityToken?: string) {
     });
 }
 
-function devSignIn(app: Express, label: "owner-a" | "owner-b", code = devSigninFixtureCode, alias = false) {
+function devSignIn(app: Express, label: "owner-a" | "owner-b" | "member-c" | "member-d", code = devSigninFixtureCode, alias = false) {
   return request(app)
     .post(`${alias ? "/api" : ""}/v1/auth/dev`)
     .send({ code, label });
@@ -368,14 +368,14 @@ describe("Phase 1 sign-in and session routes", () => {
       expect(response.headers["cache-control"]).toBe("no-store");
       expect(response.body).toMatchObject({
         sessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
-        workspace: { name: "My workspace", currency: "USD", locale: "en-US" },
         user: { id: expect.any(String) },
       });
     }
     expect(ownerA.body.user.id).toBe(ownerARepeat.body.user.id);
-    expect(ownerA.body.workspace.id).toBe(ownerARepeat.body.workspace.id);
+    expect(ownerA.body).not.toHaveProperty("workspace");
+    expect(ownerARepeat.body).not.toHaveProperty("workspace");
     expect(ownerA.body.user.id).not.toBe(ownerB.body.user.id);
-    expect(ownerA.body.workspace.id).not.toBe(ownerB.body.workspace.id);
+    expect(ownerB.body).not.toHaveProperty("workspace");
 
     const users = await isolated.query<{ id: string; apple_sub: string }>(
       "SELECT id, apple_sub FROM users WHERE apple_sub = ANY($1::text[]) ORDER BY apple_sub",
@@ -390,7 +390,7 @@ describe("Phase 1 sign-in and session routes", () => {
       "SELECT id FROM workspaces WHERE owner_id = ANY($1::uuid[])",
       [[ownerA.body.user.id, ownerB.body.user.id]],
     );
-    expect(workspaceCount.rowCount).toBe(2);
+    expect(workspaceCount.rowCount).toBe(0);
     const credentials = await isolated.query(
       "SELECT user_id FROM apple_credentials WHERE user_id = ANY($1::uuid[])",
       [[ownerA.body.user.id, ownerB.body.user.id]],
@@ -412,19 +412,19 @@ describe("Phase 1 sign-in and session routes", () => {
 
     const ownerABearer = `Bearer ${ownerA.body.sessionToken}`;
     const ownerBBearer = `Bearer ${ownerB.body.sessionToken}`;
-    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerABearer)).body.workspace.id)
-      .toBe(ownerA.body.workspace.id);
-    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerBBearer)).body.workspace.id)
-      .toBe(ownerB.body.workspace.id);
+    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerABearer)).body.workspaces).toEqual([]);
+    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerBBearer)).body.workspaces).toEqual([]);
+    const workspaceA = (await isolated.query("select create_workspace($1,'HOME','A','USD',null) as id", [ownerA.body.user.id])).rows[0].id;
+    const workspaceB = (await isolated.query("select create_workspace($1,'HOME','B','USD',null) as id", [ownerB.body.user.id])).rows[0].id;
     const foreignResource = await isolated.query<{ id: string }>(
       "INSERT INTO test_auth_resources (workspace_id) VALUES ($1) RETURNING id",
-      [ownerB.body.workspace.id],
+      [workspaceB],
     );
     const foreignId = foreignResource.rows[0]!.id;
     expect((await request(testApp.app).get(`/v1/test/resources/${foreignId}`)
-      .set("Authorization", ownerABearer)).status).toBe(404);
+      .set("Authorization", ownerABearer).set("X-Workspace-Id", workspaceA)).status).toBe(404);
     expect((await request(testApp.app).get(`/v1/test/resources/${foreignId}`)
-      .set("Authorization", ownerBBearer)).status).toBe(200);
+      .set("Authorization", ownerBBearer).set("X-Workspace-Id", workspaceB)).status).toBe(200);
 
     const ownerASessionHash = hashSessionToken(ownerA.body.sessionToken as string);
     await isolated.query(
@@ -489,13 +489,23 @@ describe("Phase 1 sign-in and session routes", () => {
     expect(usersAfter.rows[0]!.count).toBe(usersBefore.rows[0]!.count);
   });
 
+  it.each(["member-c", "member-d"] as const)("accepts %s as a workspace-free developer account", async label => {
+    const { app } = makeTestApp();
+    const response = await devSignIn(app, label);
+    expect(response.status).toBe(200);
+    expect(response.body).not.toHaveProperty("workspace");
+    const me = await request(app).get("/v1/me").set("Authorization", `Bearer ${response.body.sessionToken}`);
+    expect(me.status).toBe(200);
+    expect(me.body.user.has_apple).toBe(false);
+    expect(me.body.workspaces).toEqual([]);
+  });
+
   it("strictly validates the development sign-in body and applies the shared 10-per-minute limit", async () => {
     const app = makeTestApp().app;
     const invalidBodies = [
       {},
       { code: "", label: "owner-a" },
       { code: "x".repeat(4097), label: "owner-a" },
-      { code: devSigninFixtureCode, label: "owner-c" },
       { code: devSigninFixtureCode, label: "owner-a", extra: "rejected" },
     ];
     for (const body of invalidBodies) {
@@ -503,6 +513,9 @@ describe("Phase 1 sign-in and session routes", () => {
       expect(response.status).toBe(422);
       expect(response.body.error.code).toBe("INVALID_INPUT");
     }
+    const badLabel = await request(makeTestApp().app).post("/v1/auth/dev").send({ code: devSigninFixtureCode, label: "owner-c" });
+    expect(badLabel.status).toBe(400);
+    expect(badLabel.body.error.code).toBe("INVALID");
 
     const limitedApp = makeTestApp().app;
     const responses = await Promise.all(
@@ -522,7 +535,6 @@ describe("Phase 1 sign-in and session routes", () => {
     expect(response.headers["cache-control"]).toBe("no-store");
     expect(response.body).toMatchObject({
       sessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
-      workspace: { name: "My workspace", currency: "USD", locale: "en-US" },
       user: { id: expect.any(String) },
     });
     const userRows = await isolated.query<{ id: string }>(
@@ -538,11 +550,12 @@ describe("Phase 1 sign-in and session routes", () => {
       [response.body.user.id],
     );
     expect(userRows.rowCount).toBe(1);
-    expect(workspaceRows.rowCount).toBe(1);
+    expect(workspaceRows.rowCount).toBe(0);
+    expect(response.body).not.toHaveProperty("workspace");
     expect(sessionRows.rowCount).toBe(1);
   });
 
-  it("reuses the same user and workspace on concurrent repeat sign-ins", async () => {
+  it("reuses the same user and creates no workspace on concurrent repeat sign-ins", async () => {
     const testApp = makeTestApp();
     const rawNonce = nonce();
     const sub = `repeat-sub-${randomUUID()}`;
@@ -554,11 +567,12 @@ describe("Phase 1 sign-in and session routes", () => {
     expect(first.status).toBe(200);
     expect(second.status).toBe(200);
     expect(first.body.user.id).toBe(second.body.user.id);
-    expect(first.body.workspace.id).toBe(second.body.workspace.id);
+    expect(first.body).not.toHaveProperty("workspace");
+    expect(second.body).not.toHaveProperty("workspace");
     const users = await isolated.query("SELECT id FROM users WHERE apple_sub = $1", [sub]);
     const workspaces = await isolated.query("SELECT id FROM workspaces WHERE owner_id = $1", [first.body.user.id]);
     expect(users.rowCount).toBe(1);
-    expect(workspaces.rowCount).toBe(1);
+    expect(workspaces.rowCount).toBe(0);
   });
 
   it("caches the Apple JWKS response while verifying separate sign-ins", async () => {
@@ -688,8 +702,8 @@ describe("Phase 1 sign-in and session routes", () => {
     const firstMe = await first.agent.get("/v1/me");
     const secondMe = await second.agent.get("/v1/me");
     expect(firstMe.headers["cache-control"]).toBe("no-store");
-    expect(firstMe.body.workspace.id).toBe(first.workspaceId);
-    expect(secondMe.body.workspace.id).toBe(second.workspaceId);
+    expect(firstMe.body.workspaces.map((w: { id: string }) => w.id)).toEqual([first.workspaceId]);
+    expect(secondMe.body.workspaces.map((w: { id: string }) => w.id)).toEqual([second.workspaceId]);
 
     const resource = await isolated.query<{ id: string }>(
       "INSERT INTO test_auth_resources (workspace_id) VALUES ($1) RETURNING id",
@@ -766,7 +780,7 @@ describe("Phase 1 sign-in and session routes", () => {
     const proxy = await request(app).get("/api/v1/health");
     expect(direct.status).toBe(200);
     expect(proxy.status).toBe(200);
-    expect(direct.body).toEqual({ status: "ok", db: "ok", migrations: 2 });
+    expect(direct.body).toEqual({ status: "ok", db: "ok", migrations: 3 });
     expect(proxy.body).toEqual(direct.body);
   });
 
diff --git a/artifacts/api-server/test/foundation.test.ts b/artifacts/api-server/test/foundation.test.ts
index 6d20412..25c31e5 100644
--- a/artifacts/api-server/test/foundation.test.ts
+++ b/artifacts/api-server/test/foundation.test.ts
@@ -79,7 +79,7 @@ describe("Phase 0 API", () => {
     const cases: { state: string; expected: number; code: string; sql: string; args: unknown[] }[] = [
       { state: "P0002", expected: 404, code: "NOT_FOUND",
         sql: "select set_check_cleared($1,$2,$3,1)", args: [id, randomUUID(), randomUUID()] },
-      { state: "22023", expected: 422, code: "INVALID_INPUT",
+      { state: "22023", expected: 400, code: "INVALID",
         sql: "select fn_earned('HOUR',100,'DAY_PORTION',0.5,null,null)", args: [] },
     ];
     for (const test of cases) {
@@ -98,7 +98,7 @@ describe("Phase 0 API", () => {
     for (const [state, status, code] of [
       ["40001", 409, "CONFLICT"], ["55000", 409, "CONFIRMATION_REQUIRED"],
       ["23505", 409, "CONFLICT"], ["23503", 404, "NOT_FOUND"],
-      ["23514", 422, "INVALID_INPUT"], ["XXXXX", 500, "INTERNAL_ERROR"],
+      ["23514", 422, "ROLE_DOES_NOT_FIT"], ["XXXXX", 500, "INTERNAL_ERROR"],
     ] as const) {
       const probe = express();
       probe.get("/", (_req, _res, next) => next({ code: state }));
diff --git a/artifacts/api-server/test/helpers/tenancy.ts b/artifacts/api-server/test/helpers/tenancy.ts
index e3d3412..c4064d4 100644
--- a/artifacts/api-server/test/helpers/tenancy.ts
+++ b/artifacts/api-server/test/helpers/tenancy.ts
@@ -24,30 +24,48 @@ export interface TestOwner {
 
 export interface TenancyHarness {
   createOwner(): Promise<TestOwner>;
+  createUser(label: string): Promise<{ userId: string }>;
+  createWorkspace(user: { userId: string }, kind?: "HOME" | "BUSINESS"): Promise<string>;
+  addMember(workspace: string, user: { userId: string }, role: string, options?: { financial?: boolean; workerId?: string }): Promise<void>;
+  agentFor(user: { userId: string }, workspaceId?: string): Promise<{ token: string; agent: AuthedRequestAgent }>;
 }
 
 export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
-  async function createOwner(): Promise<TestOwner> {
+  async function createUser(label: string) {
     const userResult = await db.query<{ id: string }>(
       "INSERT INTO users (apple_sub) VALUES ($1) RETURNING id",
-      [`test-owner-${crypto.randomUUID()}`],
+      [`test-${label}-${crypto.randomUUID()}`],
     );
-    const userId = userResult.rows[0]!.id;
+    return { userId: userResult.rows[0]!.id };
+  }
+  async function createWorkspace(user: { userId: string }, kind: "HOME" | "BUSINESS" = "HOME") {
     const workspaceResult = await db.query<{ id: string }>(
-      "INSERT INTO workspaces (owner_id, name, currency_code) VALUES ($1, 'My workspace', 'USD') RETURNING id",
-      [userId],
+      "select create_workspace($1,$2,'My workspace','USD','America/New_York') as id",
+      [user.userId, kind],
     );
-    const workspaceId = workspaceResult.rows[0]!.id;
+    return workspaceResult.rows[0]!.id;
+  }
+  async function addMember(workspace: string, user: { userId: string }, role: string, options: { financial?: boolean; workerId?: string } = {}) {
+    const owner = (await db.query("select owner_id from workspaces where id=$1", [workspace])).rows[0].owner_id;
+    const hash = hashSessionToken(createSessionToken());
+    await db.query("select create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$8)",
+      [workspace, owner, crypto.randomUUID(), role, role === "ADMIN" ? options.financial ?? false : null,
+        options.workerId ?? null, `${crypto.randomUUID()}@example.com`, hash]);
+    await db.query("select accept_invitation($1,$2)", [user.userId, hash]);
+  }
+  async function agentFor(user: { userId: string }, workspaceId?: string) {
     const token = createSessionToken();
     await db.query(
       `INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '30 days')`,
-      [userId, hashSessionToken(token)],
+      [user.userId, hashSessionToken(token)],
     );
 
     const method = (name: Method, path: string) => {
       const test = request(app)[name](path);
-      return test.set("Authorization", `Bearer ${token}`);
+      test.set("Authorization", `Bearer ${token}`);
+      if (workspaceId) test.set("X-Workspace-Id", workspaceId);
+      return test;
     };
     const agent: AuthedRequestAgent = {
       get: path => method("get", path),
@@ -57,6 +75,12 @@ export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
       delete: path => method("delete", path),
     };
 
+    return { token, agent };
+  }
+  async function createOwner(): Promise<TestOwner> {
+    const { userId } = await createUser("owner");
+    const workspaceId = await createWorkspace({ userId });
+    const { token, agent } = await agentFor({ userId }, workspaceId);
     return {
       userId,
       workspaceId,
@@ -66,10 +90,13 @@ export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
         const path = route.includes(":id")
           ? route.replace(":id", encodeURIComponent(idFromOtherWorkspace))
           : `${route.replace(/\/$/, "")}/${encodeURIComponent(idFromOtherWorkspace)}`;
-        const response = await agent[requestMethod](path);
+        const call = agent[requestMethod](path);
+        const response = await (requestMethod === "get" ? call : call.send({
+          operation_id: crypto.randomUUID(), ...(requestMethod === "patch" ? { role: "LEAD" } : {}),
+        }));
         expect(response.status, `${requestMethod.toUpperCase()} ${route} must hide cross-workspace ids`).toBe(404);
       },
     };
   }
-  return { createOwner };
+  return { createOwner, createUser, createWorkspace, addMember, agentFor };
 }
\ No newline at end of file
diff --git a/artifacts/api-server/test/helpers/test-only-resources.ts b/artifacts/api-server/test/helpers/test-only-resources.ts
index 4db3d9f..84fea4e 100644
--- a/artifacts/api-server/test/helpers/test-only-resources.ts
+++ b/artifacts/api-server/test/helpers/test-only-resources.ts
@@ -1,14 +1,15 @@
 import { Router, type IRouter } from "express";
 import type { Pool } from "pg";
+import { withMember } from "../../src/auth/member";
 
 export function createTestOnlyResourceRouter(db: Pool): IRouter {
   const router: IRouter = Router();
   router.get("/test/resources/:id", async (req, res, next) => {
     try {
-      const result = await db.query<{ id: string }>(
+      const result = await withMember(db, req, "workspace.read", (tx, _member, ws) => tx.query<{ id: string }>(
         "SELECT id FROM test_auth_resources WHERE id = $1 AND workspace_id = $2",
-        [req.params.id, req.ctx!.workspaceId],
-      );
+        [req.params.id, ws],
+      ));
       if (!result.rowCount) {
         res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
         return;
diff --git a/artifacts/api-server/test/identity.test.ts b/artifacts/api-server/test/identity.test.ts
new file mode 100644
index 0000000..863fd1c
--- /dev/null
+++ b/artifacts/api-server/test/identity.test.ts
@@ -0,0 +1,389 @@
+import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
+import pg from "pg";
+import request from "supertest";
+import path from "node:path";
+import { randomUUID, randomBytes } from "node:crypto";
+import { Router } from "express";
+import { createApp } from "../src/app";
+import { createRouter } from "../src/routes";
+import { registeredRoutes, memberRoute, type Method } from "../src/routes/registration";
+import * as memberModule from "../src/auth/member";
+import { invitationCodeHash, tokenHash } from "../src/routes/invitations";
+import { migrate } from "../src/db/migrate";
+import { createTenancyHarness } from "./helpers/tenancy";
+import { requestHash } from "../src/idempotency";
+
+const schema = `identity_${randomUUID().replaceAll("-", "")}`;
+const root = new pg.Pool({ connectionString: process.env.DATABASE_URL });
+let db: pg.Pool;
+const env = { APP_ENV: "development", BUSINESS_ENABLED: "false",
+  CODE_PEPPER: "isolated-test-pepper", PUBLIC_BASE_URL: "https://example.test/api" };
+const logs: unknown[] = [];
+const logger = { info: (fields: unknown) => logs.push(fields), error: (fields: unknown) => logs.push(fields) };
+const appFor = () => createApp({ db, env, logger });
+const op = () => ({ operation_id: randomUUID() });
+beforeAll(async () => {
+  if (process.env.APP_ENV === "production") throw new Error("Tests forbidden in production");
+  await root.query(`create schema ${schema}`);
+  db = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
+  await migrate(db, path.resolve("../../db/migrations"));
+});
+afterAll(async () => {
+  await db?.end();
+  await root.query(`drop schema if exists ${schema} cascade`);
+  await root.end();
+});
+
+function stackRoutes(router: { stack: unknown[] }): { path: string; method: string }[] {
+  const result: { path: string; method: string }[] = [];
+  for (const raw of router.stack) {
+    const layer = raw as { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } };
+    if (layer.route) for (const method of Object.keys(layer.route.methods)) result.push({ path: layer.route.path, method });
+    else if (layer.handle?.stack) result.push(...stackRoutes({ stack: layer.handle.stack }));
+  }
+  return result;
+}
+
+describe("route table", () => {
+  it("covers every Express /v1 route exactly once and declares all member actions", () => {
+    const router = createRouter({ db, env: { ...env, DEV_SIGNIN_CODE: "fixture" }, logger });
+    const table = registeredRoutes(router);
+    const stack = stackRoutes(router);
+    expect(table.map(r => `${r.method} ${r.path}`).sort()).toEqual(stack.map(r => `${r.method} ${r.path}`).sort());
+    for (const route of table) {
+      expect(["public", "session", "member"]).toContain(route.kind);
+      if (route.kind === "member") expect(route.action).toMatch(/^[a-z_]+\.[a-z_]+$/);
+    }
+    expect(table.filter(r => r.kind === "member")).toHaveLength(8);
+  });
+});
+
+const roles = ["ORGANIZER", "PARTNER", "OWNER", "ADMIN_MONEY", "ADMIN_NO_MONEY", "LEAD", "WORKER", "REMOVED", "OUTSIDER"] as const;
+const table = registeredRoutes(createRouter({ env, logger })).filter(r => r.kind === "member");
+
+describe("fresh-fixture role matrix: declared route gate only", () => {
+  for (const route of table) for (const role of roles) {
+    it(`${route.method.toUpperCase()} ${route.path} [${route.action}] / ${role}`, async () => {
+      const app = appFor();
+      const harness = createTenancyHarness(db, app);
+      const principal = await harness.createUser("matrix-principal");
+      const home = ["ORGANIZER","PARTNER","REMOVED","OUTSIDER"].includes(role);
+      const workspace = await harness.createWorkspace(principal, home ? "HOME" : "BUSINESS");
+      let user = principal;
+      if (!["ORGANIZER","OWNER"].includes(role)) {
+        user = await harness.createUser("matrix-member");
+        if (role !== "OUTSIDER") {
+          let workerId: string | undefined;
+          if (role === "WORKER") {
+            workerId = (await db.query("insert into workers(workspace_id,display_name) values ($1,'Worker') returning id", [workspace])).rows[0].id;
+          }
+          await harness.addMember(workspace, user, role.startsWith("ADMIN") ? "ADMIN" : role === "REMOVED" ? "PARTNER" : role,
+            { financial: role === "ADMIN_MONEY", workerId });
+          if (role === "REMOVED") await db.query("select remove_member($1,$2,$3)", [workspace, principal.userId, user.userId]);
+        }
+      }
+      const { agent } = await harness.agentFor(user, workspace);
+      // Keep the real require_member/transaction, replace ONLY the callback after
+      // the gate. Function-level refusals are tested separately below.
+      const original = memberModule.withMember;
+      const spy = vi.spyOn(memberModule, "withMember").mockImplementation((pool, req, action) =>
+        original(pool, req, action, async () => ({ gate_passed: true })));
+      try {
+        const url = `/v1${route.path.replace(/:userId|:id/g, randomUUID())}`;
+        const result = await agent[route.method](url).send({});
+        const allowed = route.action === "workspace.read" ||
+          (route.action === "settings.edit" ? ["ORGANIZER","OWNER"].includes(role) :
+            ["ORGANIZER","OWNER","ADMIN_MONEY","ADMIN_NO_MONEY"].includes(role));
+        expect(result.status).toBe(["REMOVED","OUTSIDER"].includes(role) ? 404 : allowed ? 200 : 403);
+        if (result.status === 200) expect(result.body.gate_passed).toBe(true);
+      } finally { spy.mockRestore(); }
+    });
+  }
+});
+
+async function homeFixture() {
+  const app = appFor();
+  const h = createTenancyHarness(db, app);
+  const owner = await h.createOwner();
+  const partner = await h.createUser("partner");
+  return { app, h, owner, partner };
+}
+async function invite(owner: Awaited<ReturnType<typeof homeFixture>>["owner"], email = `${randomUUID()}@example.com`) {
+  const body = { ...op(), role: "PARTNER", email, name: "Reference label" };
+  const response = await owner.agent.post("/v1/invitations").send(body);
+  expect(response.status).toBe(200);
+  return { body, data: response.body };
+}
+
+describe("identity and workspace writes", () => {
+  it("creates HOME once, separates users and detects changed-body and concurrent replays", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const first = await h.createUser("create"), second = await h.createUser("second");
+    const a = (await h.agentFor(first)).agent, b = (await h.agentFor(second)).agent;
+    const body = { ...op(), kind: "HOME", name: "My home", timezone: "America/New_York" };
+    const responses = await Promise.all([a.post("/v1/workspaces").send(body), a.post("/v1/workspaces").send(body)]);
+    expect(responses.map(r => r.status)).toEqual([200,200]);
+    expect(responses[0]!.body).toEqual(responses[1]!.body);
+    expect((await db.query("select count(*)::int as n from workspaces where owner_id=$1", [first.userId])).rows[0].n).toBe(1);
+    expect((await a.post("/v1/workspaces").send({ ...body, name: "Other" })).body.error.code).toBe("OPERATION_REUSED");
+    const separate = await b.post("/v1/workspaces").send(body);
+    expect(separate.status).toBe(200);
+    expect(separate.body.id === responses[0]!.body.id).toBe(false);
+    expect((await a.post("/v1/workspaces").send({ ...body, ...op(), kind: "BUSINESS" })).status).toBe(404);
+    const invalid = await a.post("/v1/workspaces").send({ ...body, ...op(), timezone: "Not/AZone" });
+    expect(invalid.status).toBe(400);
+    expect(invalid.body.error.code).toBe("INVALID");
+    expect((await request(app).get("/v1/config")).body).toEqual({ business_enabled: false });
+  });
+  it("lists only caller memberships; saves and clears a display name idempotently", async () => {
+    const { owner, h } = await homeFixture();
+    await h.createOwner();
+    const result = await owner.agent.get("/v1/me");
+    expect(result.body.workspaces.map((w: { id: string }) => w.id)).toEqual([owner.workspaceId]);
+    const body = { ...op(), display_name: "Casey" };
+    const first = await owner.agent.patch("/v1/me").send(body);
+    expect(first.status).toBe(200);
+    expect((await owner.agent.patch("/v1/me").send(body)).body).toEqual(first.body);
+    expect((await owner.agent.get("/v1/me")).body.user.display_name).toBe("Casey");
+    expect((await owner.agent.patch("/v1/me").send({ ...op(), display_name: "" })).status).toBe(200);
+    expect((await owner.agent.get("/v1/me")).body.user.display_name).toBeNull();
+  });
+  it("makes all malformed, missing and foreign workspace headers indistinguishable", async () => {
+    const { owner, h, app } = await homeFixture();
+    const foreign = await h.createOwner();
+    const responses = await Promise.all([undefined, "malformed", foreign.workspaceId].map(header => {
+      const call = request(app).get("/v1/workspace").set("Authorization", `Bearer ${owner.token}`);
+      return header ? call.set("X-Workspace-Id", header) : call;
+    }));
+    for (const r of responses) {
+      expect(r.status).toBe(404);
+      expect({ ...r.body.error, correlationId: undefined }).toEqual({ code: "NOT_FOUND", message: "Not found", correlationId: undefined });
+    }
+  });
+  it("renames once and prevents another actor from replaying the organizer's operation", async () => {
+    const { owner, h, partner } = await homeFixture();
+    await h.addMember(owner.workspaceId, partner, "PARTNER");
+    const body = { ...op(), name: "Renamed" };
+    const first = await owner.agent.patch("/v1/workspace").send(body);
+    expect(first.status).toBe(200);
+    expect((await owner.agent.patch("/v1/workspace").send(body)).body).toEqual(first.body);
+    const partnerAgent = (await h.agentFor(partner, owner.workspaceId)).agent;
+    expect((await partnerAgent.patch("/v1/workspace").send(body)).status).toBe(403);
+    expect(requestHash(owner.userId, body) === requestHash(partner.userId, body)).toBe(false);
+  });
+});
+
+describe("invitation credentials and committed errors", () => {
+  it("commits expired-link status even when the HTTP result is 410", async () => {
+    const { owner, h, partner, app } = await homeFixture();
+    const { data } = await invite(owner);
+    await db.query("update invitations set expires_at=now()-interval '1 second' where id=$1", [data.id]);
+    const agent = (await h.agentFor(partner)).agent;
+    const body = { ...op(), token: data.token };
+    const expired = await agent.post("/v1/invite/accept").send(body);
+    expect(expired.status).toBe(410);
+    expect(expired.body.error.code).toBe("INVITATION_NOT_AVAILABLE");
+    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("EXPIRED");
+    expect((await agent.post("/v1/invite/accept").send(body)).status).toBe(410);
+    expect((await request(app).post("/v1/invite/peek").send({ token: data.token })).body).toEqual({ available: false });
+  });
+  it("enforces 20/min peek per peer and 10/min code accept per signed-in user", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const agent = (await h.agentFor(await h.createUser("limited"))).agent;
+    const token = randomBytes(32).toString("base64url");
+    for (let n=0;n<20;n++) expect((await request(app).post("/v1/invite/peek").send({ token })).status).toBe(200);
+    expect((await request(app).post("/v1/invite/peek").send({ token })).status).toBe(429);
+    for (let n=0;n<10;n++) expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: "unknown@example.com", code: "000000" })).status).toBe(400);
+    expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: "unknown@example.com", code: "000000" })).status).toBe(429);
+  });
+  it("decline has a uniform answer and makes a pending invitation unavailable", async () => {
+    const { owner, app } = await homeFixture();
+    const { data } = await invite(owner);
+    for (const token of [data.token, data.token, randomBytes(32).toString("base64url")]) {
+      const response = await request(app).post("/v1/invite/decline").send({ token });
+      expect(response.status).toBe(200);
+      expect(response.body).toEqual({ ok: true });
+    }
+    expect((await request(app).post("/v1/invite/peek").send({ token: data.token })).body).toEqual({ available: false });
+    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("DECLINED");
+  });
+  it("returns secrets once, stores HMAC/hash only, peeks minimally, joins and replays", async () => {
+    const { owner, h, partner, app } = await homeFixture();
+    const { body, data } = await invite(owner);
+    expect(data.token.length).toBe(43);
+    expect(/^\d{6}$/.test(data.code)).toBe(true);
+    expect(data.link === `${env.PUBLIC_BASE_URL}/join/${data.token}`).toBe(true);
+    const peek = await request(app).post("/v1/invite/peek").send({ token: data.token });
+    expect(peek.body).toEqual({ available: true, workspace_name: "My workspace", role: "PARTNER" });
+    const retry = await owner.agent.post("/v1/invitations").send(body);
+    expect(retry.body).toMatchObject({ id: data.id, token: null, code: null, link: null, already_created: true });
+    const row = (await db.query("select * from invitations where id=$1", [data.id])).rows[0];
+    expect(row.code_hash.equals(invitationCodeHash(env.CODE_PEPPER, body.email, data.code))).toBe(true);
+    expect(row.token_hash.equals(tokenHash(data.token))).toBe(true);
+    const stored = JSON.stringify((await db.query("select row_to_json(i)::text from invitations i where id=$1", [data.id])).rows) +
+      JSON.stringify((await db.query("select response, request_hash from idempotency_keys where workspace_id=$1", [owner.workspaceId])).rows);
+    expect(stored.includes(data.token)).toBe(false);
+    expect(stored.includes(data.code)).toBe(false);
+    expect(JSON.stringify(logs).includes(data.token)).toBe(false);
+    expect(JSON.stringify(logs).includes(data.code)).toBe(false);
+    expect(JSON.stringify(logs).includes(body.email)).toBe(false);
+    const agent = (await h.agentFor(partner, owner.workspaceId)).agent;
+    const acceptBody = { ...op(), token: data.token };
+    const accepted = await agent.post("/v1/invite/accept").send(acceptBody);
+    expect(accepted.status).toBe(200);
+    expect((await agent.post("/v1/invite/accept").send(acceptBody)).body).toEqual(accepted.body);
+    expect((await agent.get("/v1/workspace")).body.role).toBe("PARTNER");
+    expect((await owner.agent.post("/v1/invitations").send({ ...body, ...op(), email: `${randomUUID()}@example.com` })).status).toBe(409);
+    expect((await agent.post("/v1/invitations").send({ ...body, ...op() })).status).toBe(403);
+    const members = await agent.get("/v1/members");
+    expect(members.body.members.every((m: object) => !("email" in m))).toBe(true);
+    const names = (await owner.agent.get("/v1/members")).body.members;
+    expect(names.find((m: { user_id: string }) => m.user_id === partner.userId).name).toBe("Reference label");
+    expect(members.body.members.find((m: { user_id: string }) => m.user_id === partner.userId).name).toBe("Partner");
+    const landing = await request(app).get(`/api/join/${data.token}`);
+    expect(landing.headers["cache-control"]).toBe("no-store");
+    expect(landing.headers["referrer-policy"]).toBe("no-referrer");
+    expect(landing.text.includes("This invitation isn&#39;t available")).toBe(true);
+  });
+  it("commits five wrong attempts, replays without charging again, and lets another person join", async () => {
+    const { owner, h, partner } = await homeFixture();
+    const { body, data } = await invite(owner);
+    const stranger = (await h.agentFor(await h.createUser("stranger"))).agent;
+    const wrong = data.code === "000000" ? "000001" : "000000";
+    const firstBody = { ...op(), email: body.email, code: wrong };
+    for (let n = 0; n < 5; n++) {
+      const response = await stranger.post("/v1/invite/accept-code").send(n === 0 ? firstBody : { ...firstBody, ...op() });
+      expect(response.status).toBe(400);
+      expect(response.body.error.code).toBe("INVITATION_CODE_WRONG");
+    }
+    expect((await stranger.post("/v1/invite/accept-code").send(firstBody)).status).toBe(400);
+    expect((await db.query("select attempts from invitation_code_attempts where email=$1", [body.email])).rows[0].attempts).toBe(5);
+    const blocked = await stranger.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code });
+    expect(blocked.status).toBe(400);
+    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("PENDING");
+    const agent = (await h.agentFor(partner)).agent;
+    expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code })).status).toBe(200);
+    const keys = JSON.stringify((await db.query("select response, request_hash from user_idempotency_keys")).rows);
+    expect(keys.includes(data.token)).toBe(false);
+    expect(keys.includes(data.code)).toBe(false);
+  });
+  it("keeps the link usable after the guesser's code limit and maps expired/revoked/unknown uniformly", async () => {
+    const { owner, h, partner, app } = await homeFixture();
+    const { body, data } = await invite(owner);
+    const guesser = (await h.agentFor(await h.createUser("guesser"))).agent;
+    for (let n=0;n<5;n++) await guesser.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code === "999999" ? "999998" : "999999" });
+    expect((await (await h.agentFor(partner)).agent.post("/v1/invite/accept").send({ ...op(), token: data.token })).status).toBe(200);
+    const fixture = await homeFixture(), pending = await invite(fixture.owner);
+    const revokeBody = op();
+    expect((await fixture.owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(revokeBody)).status).toBe(200);
+    expect((await fixture.owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(revokeBody)).status).toBe(200);
+    for (const token of [pending.data.token, randomBytes(32).toString("base64url")]) {
+      expect((await request(app).post("/v1/invite/peek").send({ token })).body).toEqual({ available: false });
+      const acceptance = await guesser.post("/v1/invite/accept").send({ ...op(), token });
+      expect(acceptance.status).toBe(410);
+      expect(acceptance.body.error.code).toBe("INVITATION_NOT_AVAILABLE");
+    }
+  });
+  it("escapes workspace names on public HTML and exposes neither contacts nor credentials in HTML", async () => {
+    const { owner, app } = await homeFixture();
+    await owner.agent.patch("/v1/workspace").send({ ...op(), name: "<script>alert(1)</script>" });
+    const { data, body } = await invite(owner);
+    const result = await request(app).get(`/api/join/${data.token}`);
+    expect(result.text.includes("<script>")).toBe(false);
+    expect(result.text.includes("&lt;script&gt;")).toBe(true);
+    expect(result.text.includes(data.token)).toBe(false);
+    expect(result.text.includes(data.code)).toBe(false);
+    expect(result.text.includes(body.email)).toBe(false);
+  });
+});
+
+describe("function-level refusals, scoping and immediate removal", () => {
+  it("forbids partner management/principal leave and clears removed access across every route", async () => {
+    const { owner, h, partner } = await homeFixture();
+    await h.addMember(owner.workspaceId, partner, "PARTNER");
+    const agent = (await h.agentFor(partner, owner.workspaceId)).agent;
+    expect((await agent.delete(`/v1/members/${owner.userId}`).send(op())).status).toBe(403);
+    expect((await owner.agent.delete(`/v1/members/${owner.userId}`).send(op())).status).toBe(403);
+    expect((await owner.agent.post("/v1/invitations").send({ ...op(), role: "ADMIN", email: "admin@example.com" })).status).toBe(403);
+    expect((await owner.agent.patch(`/v1/members/${partner.userId}`).send(op())).body.error.code).toBe("INVALID");
+    expect((await owner.agent.patch(`/v1/members/${owner.userId}`).send({ ...op(), role: "PARTNER" })).status).toBe(403);
+    const removedBody = op();
+    expect((await owner.agent.delete(`/v1/members/${partner.userId}`).send(removedBody)).status).toBe(200);
+    expect((await owner.agent.delete(`/v1/members/${partner.userId}`).send(removedBody)).status).toBe(200);
+    for (const route of table) expect((await agent[route.method](`/v1${route.path.replace(/:userId|:id/g, randomUUID())}`).send(op())).status).toBe(404);
+    expect((await agent.get("/v1/me")).status).toBe(200);
+    expect((await agent.get("/v1/me")).body.workspaces).toEqual([]);
+    await h.addMember(owner.workspaceId, partner, "PARTNER");
+    expect((await agent.get("/v1/workspace")).status).toBe(200);
+    expect((await agent.delete(`/v1/members/${partner.userId}`).send(op())).status).toBe(200);
+    expect((await agent.get("/v1/workspace")).status).toBe(404);
+  });
+  it("refuses foreign member and invitation ids without touching their workspace", async () => {
+    const { owner } = await homeFixture(), second = await homeFixture();
+    await second.h.addMember(second.owner.workspaceId, second.partner, "PARTNER");
+    expect((await owner.agent.delete(`/v1/members/${second.partner.userId}`).send(op())).status).toBe(404);
+    expect((await owner.agent.patch(`/v1/members/${second.partner.userId}`).send({ ...op(), role: "PARTNER" })).status).toBe(404);
+    const third = await homeFixture(), pending = await invite(third.owner);
+    expect((await owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(op())).status).toBe(404);
+  });
+  it("enforces admin/worker binding/refusal rules and revokes a removed inviter's link", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const owner = await h.createUser("business-owner"), admin = await h.createUser("admin"), lead = await h.createUser("lead");
+    const ws = await h.createWorkspace(owner, "BUSINESS");
+    await h.addMember(ws, admin, "ADMIN", { financial: false });
+    await h.addMember(ws, lead, "LEAD");
+    const a = (await h.agentFor(admin, ws)).agent, o = (await h.agentFor(owner, ws)).agent;
+    const worker = (await db.query("insert into workers(workspace_id,display_name) values($1,'W') returning id", [ws])).rows[0].id;
+    expect((await a.patch(`/v1/members/${admin.userId}`).send({ ...op(), role: "ADMIN" })).status).toBe(403);
+    expect((await o.patch(`/v1/members/${lead.userId}`).send({ ...op(), role: "WORKER" })).body.error.code).toBe("WORKER_RECORD_REQUIRED");
+    expect((await a.post("/v1/invitations").send({ ...op(), role: "WORKER", email: "w@example.com", worker_id: worker })).status).toBe(403);
+    const moneyInvite = await o.post("/v1/invitations").send({ ...op(), role: "ADMIN", financial_access: true, email: "money@example.com" });
+    expect(moneyInvite.status).toBe(200);
+    expect((await a.delete(`/v1/invitations/${moneyInvite.body.id}`).send(op())).status).toBe(403);
+    const invitation = await a.post("/v1/invitations").send({ ...op(), role: "LEAD", email: `${randomUUID()}@example.com` });
+    expect(invitation.status).toBe(200);
+    expect((await o.delete(`/v1/members/${admin.userId}`).send(op())).status).toBe(200);
+    const outsider = (await h.agentFor(await h.createUser("joiner"))).agent;
+    expect((await outsider.post("/v1/invite/accept").send({ ...op(), token: invitation.body.token })).status).toBe(410);
+  });
+  it("admin cannot manage a different admin; demotion revokes invitations it can no longer send", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const owner = await h.createUser("owner"), admin = await h.createUser("admin"), admin2 = await h.createUser("admin2");
+    const ws = await h.createWorkspace(owner, "BUSINESS");
+    await h.addMember(ws, admin, "ADMIN", { financial: true });
+    await h.addMember(ws, admin2, "ADMIN");
+    const a = (await h.agentFor(admin, ws)).agent, o = (await h.agentFor(owner, ws)).agent;
+    expect((await a.patch(`/v1/members/${admin2.userId}`).send({ ...op(), role: "LEAD" })).status).toBe(403);
+    const invitation = await a.post("/v1/invitations").send({ ...op(), role: "LEAD", email: `${randomUUID()}@example.com` });
+    expect(invitation.status).toBe(200);
+    expect((await o.patch(`/v1/members/${admin.userId}`).send({ ...op(), role: "LEAD" })).status).toBe(200);
+    expect((await db.query("select status from invitations where id=$1", [invitation.body.id])).rows[0].status).toBe("REVOKED");
+  });
+});
+
+describe("actor is transaction scoped", () => {
+  it("record_payment through a test-only withMember route records the caller and refuses a forged actor", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const owner = await h.createOwner();
+    const worker = (await db.query("insert into workers(workspace_id,display_name) values($1,'W') returning id", [owner.workspaceId])).rows[0].id;
+    const project = (await db.query("insert into projects(workspace_id,name,timezone) values($1,'P','UTC') returning id", [owner.workspaceId])).rows[0].id;
+    const assignment = (await db.query("insert into assignments(workspace_id,project_id,worker_id,start_date) values($1,$2,$3,'2026-10-01') returning id",
+      [owner.workspaceId, project, worker])).rows[0].id;
+    const router = Router();
+    memberRoute(router, db, "post", "/test/payment", "money.record", async (tx, _member, ws, req) => {
+      if (req.body.recorded_by && req.body.recorded_by !== req.ctx!.userId) {
+        throw Object.assign(new Error("Actor mismatch"), { code: "CT403" });
+      }
+      const result = await tx.query("select record_payment($1,$2,'2026-10-02','CASH',null,100,'W',null,$3) as result",
+        [ws, req.body.operation_id, JSON.stringify([{ assignment_id: assignment, amount_minor: 100 }])]);
+      return result.rows[0].result;
+    });
+    const moneyApp = createApp({ db, env, logger, testOnlyProtectedRouter: router });
+    const moneyAgent = (await createTenancyHarness(db, moneyApp).agentFor({ userId: owner.userId }, owner.workspaceId)).agent;
+    expect((await moneyAgent.post("/v1/test/payment").send(op())).status).toBe(200);
+    expect((await db.query("select recorded_by from payments where workspace_id=$1", [owner.workspaceId])).rows[0].recorded_by).toBe(owner.userId);
+    expect((await moneyAgent.post("/v1/test/payment").send({ ...op(), recorded_by: randomUUID() })).status).toBe(403);
+    const clean = await db.query("select nullif(current_setting('crewtally.actor',true),'') as actor");
+    expect(clean.rows[0].actor).toBeNull();
+  });
+});
\ No newline at end of file
diff --git a/artifacts/crewtally-mobile/__tests__/auth.test.tsx b/artifacts/crewtally-mobile/__tests__/auth.test.tsx
index 94b3835..23b5023 100644
--- a/artifacts/crewtally-mobile/__tests__/auth.test.tsx
+++ b/artifacts/crewtally-mobile/__tests__/auth.test.tsx
@@ -26,6 +26,10 @@ jest.mock('@react-native-async-storage/async-storage', () => ({
 }));
 jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
 jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
+jest.mock('@/lib/mobileApi', () => ({
+  ...jest.requireActual('@/lib/mobileApi'),
+  getMe: jest.fn(), getWorkspace: jest.fn(),
+}));
 jest.mock('@workspace/api-client-react', () => ({
   getMe: jest.fn(), signInWithApple: jest.fn(), signInDev: jest.fn(), signOut: jest.fn(), healthCheck: jest.fn(),
   setBaseUrl: jest.fn(), setAuthTokenGetter: jest.fn(), setUnauthorizedHandler: jest.fn(),
@@ -35,6 +39,8 @@ import * as Apple from 'expo-apple-authentication';
 import * as Crypto from 'expo-crypto';
 import * as SecureStore from 'expo-secure-store';
 import * as Api from '@workspace/api-client-react';
+import * as Mobile from '@/lib/mobileApi';
+import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
 import { AuthProvider, useAuth } from '@/contexts/AuthContext';
 import { base64Url, createNoncePair } from '@/lib/appleNonce';
 import { peekToken } from '@/lib/sessionStore';
@@ -42,10 +48,12 @@ import { reportUnauthorized } from '@/lib/authEvents';
 import AccountScreen from '@/app/account';
 import MoreScreen from '@/app/(tabs)/more';
 
-const api = Api as unknown as Record<'getMe' | 'signInWithApple' | 'signInDev' | 'signOut' | 'healthCheck', jest.Mock>;
+const api = { ...(Api as unknown as Record<'signInWithApple' | 'signInDev' | 'signOut' | 'healthCheck', jest.Mock>), getMe: Mobile.getMe as unknown as jest.Mock };
+const getWorkspaceMock = Mobile.getWorkspace as unknown as jest.Mock;
 const apple = Apple as unknown as { signInAsync: jest.Mock };
-const WS = { id: 'abcdef12-0000-4000-8000-000000000000', name: 'My workspace', currency: 'USD', locale: 'en-US' };
-const ME = { workspace: WS, user: { id: 'u1' } };
+const WS = { id: 'abcdef12-0000-4000-8000-000000000000', name: 'My workspace', kind: 'HOME', role: 'ORGANIZER', financial_access: true };
+const ME = { user: { id: 'u1', display_name: null, has_apple: true, email: null }, workspaces: [WS] };
+const DETAIL = { ...WS, currency: 'USD', default_timezone: 'America/Chicago', worker_id: null, can: { 'workspace.read': true, 'members.manage': true } };
 const TOKEN = 'T'.repeat(43);
 const http = (status: number) => Object.assign(new Error('x'), { name: 'ApiError', status });
 
@@ -61,9 +69,10 @@ beforeEach(() => {
   qc = new QueryClient();
   api.getMe.mockResolvedValue(ME);
   apple.signInAsync.mockResolvedValue({ identityToken: 'id', authorizationCode: 'code' });
-  api.signInWithApple.mockResolvedValue({ sessionToken: TOKEN, workspace: WS, user: { id: 'u1' } });
-  api.signInDev.mockResolvedValue({ sessionToken: TOKEN, workspace: WS, user: { id: 'u1' } });
+  api.signInWithApple.mockResolvedValue({ sessionToken: TOKEN, user: { id: 'u1' } });
+  api.signInDev.mockResolvedValue({ sessionToken: TOKEN, user: { id: 'u1' } });
   api.signOut.mockResolvedValue(undefined);
+  getWorkspaceMock.mockResolvedValue(DETAIL);
   jest.spyOn(console, 'error').mockImplementation(() => undefined);
 });
 
@@ -191,12 +200,22 @@ describe('sign in', () => {
   });
 });
 
+describe('sign-in and workspaces', () => {
+  it('sign-in itself brings no workspace; the list comes from GET /v1/me', async () => {
+    const h = await signedIn();
+    expect(h.result.current.workspaces).toBeNull();
+    await act(async () => { await h.result.current.refreshMe(); });
+    expect(h.result.current.workspaces).toEqual([WS]);
+    expect(h.result.current.profile?.has_apple).toBe(true);
+  });
+});
+
 describe('launch restore', () => {
   it('restores a session when /me succeeds', async () => {
     store['crewtally.session.v1'] = TOKEN;
     const h = setup();
     await waitFor(() => expect(h.result.current.status).toBe('signedIn'));
-    expect(h.result.current.workspace?.id).toBe(WS.id);
+    expect(h.result.current.workspaces?.map((w) => w.id)).toEqual([WS.id]);
   });
 
   it('on 401 deletes the token and shows sign-in', async () => {
@@ -256,7 +275,7 @@ describe('later 401', () => {
     const h = await signedIn();
     await act(async () => { h.result.current.rememberRoute('/payments'); });
     await act(async () => { reportUnauthorized({ token: TOKEN }); });
-    api.signInWithApple.mockResolvedValue({ sessionToken: 'N'.repeat(43), workspace: WS, user: { id: 'u2' } });
+    api.signInWithApple.mockResolvedValue({ sessionToken: 'N'.repeat(43), user: { id: 'u2' } });
     await act(async () => { await h.result.current.signIn(); });
     expect(h.result.current.pendingRoute).toBeNull();
   });
@@ -269,7 +288,7 @@ describe('later 401', () => {
     await act(async () => { reportUnauthorized({ token: TOKEN }); });
     expect(qc.getQueryData(['user-scoped'])).toBeUndefined();
     expect(AsyncStorage.clear).not.toHaveBeenCalled();
-    api.signInDev.mockResolvedValue({ sessionToken: 'D'.repeat(43), workspace: WS, user: { id: 'u1' } });
+    api.signInDev.mockResolvedValue({ sessionToken: 'D'.repeat(43), user: { id: 'u1' } });
     await act(async () => { await h.result.current.developerSignIn('owner-secret', 'owner-a'); });
     expect(h.result.current.status).toBe('signedIn');
     expect(h.result.current.pendingRoute).toBe('/payments');
@@ -336,13 +355,13 @@ describe('screens', () => {
     expect(api.signOut).toHaveBeenCalledTimes(1);
   });
 
-  it('Diagnostics shows first 8 chars of workspace ID, version and API status', async () => {
+  it('Diagnostics shows the full workspace ID, first 8 chars of user ID, version and API status', async () => {
     api.healthCheck.mockResolvedValue({ status: 'ok', db: 'ok', migrations: 2 });
-    render(<Harness><MoreScreen /></Harness>, { wrapper });
+    render(<Harness><WorkspaceProvider><MoreScreen /></WorkspaceProvider></Harness>, { wrapper });
     await waitFor(() => screen.getByTestId('go'));
     await act(async () => { fireEvent.press(screen.getByTestId('go')); });
-    await waitFor(() => screen.getByText('abcdef12'));
-    expect(screen.queryByText(WS.id)).toBeNull();
+    await waitFor(() => screen.getByText(WS.id));
+    expect(screen.getByText('u1')).toBeTruthy();
     await waitFor(() => screen.getByText('ok'));
     expect(screen.getByText('App version')).toBeTruthy();
   });
diff --git a/artifacts/crewtally-mobile/__tests__/mobileApi.test.ts b/artifacts/crewtally-mobile/__tests__/mobileApi.test.ts
new file mode 100644
index 0000000..3fe972f
--- /dev/null
+++ b/artifacts/crewtally-mobile/__tests__/mobileApi.test.ts
@@ -0,0 +1,100 @@
+const mockToken = { value: 'TOK' as string | null };
+jest.mock('@/lib/sessionStore', () => ({ peekToken: () => mockToken.value }));
+jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn() }));
+jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
+
+import { reportUnauthorized } from '@/lib/authEvents';
+import * as Api from '@/lib/mobileApi';
+import { createOperationKeeper } from '@/lib/operation';
+import { roleLabel, tokenFromLink } from '@/lib/roles';
+
+jest.mock('@/lib/authEvents', () => ({ reportUnauthorized: jest.fn() }));
+
+const WS = '11111111-2222-4333-8444-555555555555';
+const fetchMock = jest.fn();
+const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
+
+beforeEach(() => {
+  jest.clearAllMocks();
+  process.env.EXPO_PUBLIC_DOMAIN = 'dev.example.test';
+  mockToken.value = 'TOK';
+  Api.setActiveWorkspaceId(null);
+  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
+});
+
+describe('API client', () => {
+  it('sends X-Workspace-Id on workspace routes only', async () => {
+    fetchMock.mockResolvedValue(ok({ id: WS }));
+    Api.setActiveWorkspaceId(WS);
+    await Api.getWorkspace();
+    await Api.getMe();
+    const [first, second] = fetchMock.mock.calls;
+    expect(first[0]).toBe('https://dev.example.test/api/v1/workspace');
+    expect(first[1].headers['X-Workspace-Id']).toBe(WS);
+    expect(first[1].headers.Authorization).toBe('Bearer TOK');
+    expect(second[1].headers['X-Workspace-Id']).toBeUndefined();
+  });
+
+  it('does not call a workspace route when no workspace is open', async () => {
+    await expect(Api.getMembers()).rejects.toMatchObject({ status: 404 });
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it('puts the operation_id in every write body, and a retry sends the same one', async () => {
+    Api.setActiveWorkspaceId(WS);
+    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('op-2'));
+    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok({ id: 'i1' }));
+    const input = { role: 'PARTNER' as const, email: 'a@b.co' };
+    await expect(Api.createInvitation(input, keeper.idFor('a@b.co'))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
+    await Api.createInvitation(input, keeper.idFor('a@b.co')); // retry
+    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
+    expect(bodies[0].operation_id).toBe('op-1');
+    expect(bodies[1].operation_id).toBe('op-1');
+    keeper.done();
+    expect(keeper.idFor('a@b.co')).toBe('op-2');
+  });
+
+  it('a changed request gets a new operation_id', () => {
+    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('a').mockReturnValueOnce('b'));
+    expect(keeper.idFor('x')).toBe('a');
+    expect(keeper.idFor('y')).toBe('b');
+  });
+
+  it.each([
+    ['patchMe', () => Api.patchMe('Casey', 'op')],
+    ['createWorkspace', () => Api.createWorkspace({ kind: 'HOME', name: 'n', timezone: 'UTC' }, 'op')],
+    ['acceptInvite', () => Api.acceptInvite('t', 'op')],
+    ['acceptInviteCode', () => Api.acceptInviteCode('a@b.co', '123456', 'op')],
+    ['removeMember', () => Api.removeMember('u', 'op')],
+    ['revokeInvitation', () => Api.revokeInvitation('i', 'op')],
+  ])('%s carries operation_id', async (_n, call) => {
+    Api.setActiveWorkspaceId(WS);
+    fetchMock.mockResolvedValue(ok({}));
+    await call();
+    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation_id).toBe('op');
+  });
+
+  it('reads string error bodies and reports 401 with the token that failed', async () => {
+    fetchMock.mockResolvedValue(ok({ error: 'SESSION_EXPIRED' }, 401));
+    await expect(Api.getMe()).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
+    expect(reportUnauthorized).toHaveBeenCalledWith({ token: 'TOK' });
+    fetchMock.mockResolvedValue(ok({ error: 'INVITATION_CODE_WRONG' }, 400));
+    await expect(Api.acceptInviteCode('a@b.co', '1', 'op')).rejects.toMatchObject({ status: 400, code: 'INVITATION_CODE_WRONG' });
+  });
+
+  it('peek is public: no bearer token', async () => {
+    fetchMock.mockResolvedValue(ok({ available: false }));
+    await Api.peekInvite('t');
+    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
+  });
+});
+
+describe('invitation helpers', () => {
+  it('extracts the token from a join link', () => {
+    const t = 'A'.repeat(43);
+    expect(tokenFromLink(`https://dev.example.test/api/join/${t}`)).toBe(t);
+    expect(tokenFromLink(t)).toBe(t);
+    expect(tokenFromLink('nonsense')).toBeNull();
+  });
+  it('labels roles', () => { expect(roleLabel('PARTNER')).toBe('Partner'); });
+});
diff --git a/artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx b/artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx
index 9f1b1c0..f0d58e8 100644
--- a/artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx
+++ b/artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx
@@ -20,6 +20,7 @@ jest.mock('expo-crypto', () => ({
   CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
   CryptoEncoding: { HEX: 'hex' },
 }));
+jest.mock('@/lib/mobileApi', () => ({ ...jest.requireActual('@/lib/mobileApi'), getMe: jest.fn() }));
 jest.mock('@workspace/api-client-react', () => ({
   getMe: jest.fn(), signInWithApple: jest.fn(), signOut: jest.fn(),
   setBaseUrl: jest.fn(), setAuthTokenGetter: jest.fn(), setUnauthorizedHandler: jest.fn(),
@@ -28,15 +29,16 @@ jest.mock('@workspace/api-client-react', () => ({
 import * as Apple from 'expo-apple-authentication';
 import * as SecureStore from 'expo-secure-store';
 import * as Api from '@workspace/api-client-react';
+import * as Mobile from '@/lib/mobileApi';
 import { AuthProvider, useAuth } from '@/contexts/AuthContext';
 import { clearToken, loadToken, peekToken, saveToken } from '@/lib/sessionStore';
 import { reportUnauthorized } from '@/lib/authEvents';
 
-const api = Api as unknown as Record<'getMe' | 'signInWithApple', jest.Mock>;
+const api = { signInWithApple: (Api as unknown as Record<'signInWithApple', jest.Mock>).signInWithApple, getMe: Mobile.getMe as unknown as jest.Mock };
 const apple = Apple as unknown as { signInAsync: jest.Mock };
 const OLD = 'O'.repeat(43);
 const NEW = 'N'.repeat(43);
-const WS = { id: 'abcdef12-0000-4000-8000-000000000000', name: 'My workspace', currency: 'USD', locale: 'en-US' };
+const ME = { user: { id: 'u1', display_name: null, has_apple: true, email: null }, workspaces: [] };
 
 function gate() {
   let release!: () => void;
@@ -108,9 +110,9 @@ describe('sign-in vs expiry cleanup', () => {
   it('signIn cannot complete until the expiry delete finishes, and the old delete never wipes the new token', async () => {
     qcRef.current = new QueryClient();
     mockStore[KEY] = OLD;
-    api.getMe.mockResolvedValue({ workspace: WS, user: { id: 'u1' } });
+    api.getMe.mockResolvedValue(ME);
     apple.signInAsync.mockResolvedValue({ identityToken: 'id', authorizationCode: 'code' });
-    api.signInWithApple.mockResolvedValue({ sessionToken: NEW, workspace: WS, user: { id: 'u1' } });
+    api.signInWithApple.mockResolvedValue({ sessionToken: NEW, user: { id: 'u1' } });
     const h = renderHook(() => useAuth(), { wrapper });
     await waitFor(() => expect(h.result.current.status).toBe('signedIn'));
 
diff --git a/artifacts/crewtally-mobile/__tests__/setup/keyboard.js b/artifacts/crewtally-mobile/__tests__/setup/keyboard.js
new file mode 100644
index 0000000..80c1eb0
--- /dev/null
+++ b/artifacts/crewtally-mobile/__tests__/setup/keyboard.js
@@ -0,0 +1,4 @@
+jest.mock('react-native-keyboard-controller', () => {
+  const { ScrollView } = require('react-native');
+  return { KeyboardAwareScrollView: ScrollView, KeyboardProvider: ({ children }) => children };
+});
diff --git a/artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx b/artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx
index 3c6b7f2..49a5cc7 100644
--- a/artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx
+++ b/artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx
@@ -169,11 +169,11 @@ it('a production bundle hides diagnostics regardless of the manifest environment
   expect(nativeLookup).not.toHaveBeenCalled();
 });
 
-it('Apple availability hides the developer sign-in button', async () => {
+it('developer sign-in is offered in development builds even when Apple is available', async () => {
   check.mockResolvedValue(true);
   render(<SignInScreen />);
   await waitFor(() => expect(screen.getByTestId('apple-sign-in')).toBeTruthy());
-  expect(screen.queryByTestId('dev-signin-button')).toBeNull();
+  expect(screen.getByTestId('dev-signin-button')).toBeTruthy();
 });
 
 it('a production bundle hides developer sign-in regardless of a development manifest', async () => {
diff --git a/artifacts/crewtally-mobile/__tests__/workspace.test.tsx b/artifacts/crewtally-mobile/__tests__/workspace.test.tsx
new file mode 100644
index 0000000..ed85c4d
--- /dev/null
+++ b/artifacts/crewtally-mobile/__tests__/workspace.test.tsx
@@ -0,0 +1,166 @@
+import React from 'react';
+import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react-native';
+import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
+
+const saved: Record<string, string> = {};
+jest.mock('@react-native-async-storage/async-storage', () => ({
+  __esModule: true,
+  default: {
+    getItem: jest.fn(async (k: string) => saved[k] ?? null),
+    setItem: jest.fn(async (k: string, v: string) => { saved[k] = v; }),
+    removeItem: jest.fn(async (k: string) => { delete saved[k]; }),
+  },
+}));
+jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
+const mockPush = jest.fn();
+jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
+jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
+jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'op') }));
+jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn(async () => ({ status: 'ok' })) }));
+const mockAuth = {
+  status: 'signedIn', userId: 'u1', workspaces: null as unknown[] | null,
+  refreshMe: jest.fn(), profile: null,
+};
+jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
+jest.mock('@/lib/mobileApi', () => ({
+  ...jest.requireActual('@/lib/mobileApi'),
+  getWorkspace: jest.fn(),
+}));
+
+import * as Mobile from '@/lib/mobileApi';
+import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
+import MoreScreen from '@/app/(tabs)/more';
+
+const getWorkspace = Mobile.getWorkspace as unknown as jest.Mock;
+const A = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Home A', kind: 'HOME', role: 'ORGANIZER', financial_access: true };
+const B = { id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Home B', kind: 'HOME', role: 'PARTNER', financial_access: true };
+const detail = (w: typeof A, can: Record<string, boolean>) => ({ ...w, currency: 'USD', default_timezone: 'UTC', worker_id: null, can });
+const gone = Object.assign(new Error('x'), { name: 'ApiError', status: 404 });
+
+let qc: QueryClient;
+const wrapper = ({ children }: { children: React.ReactNode }) => (
+  <QueryClientProvider client={qc}><WorkspaceProvider>{children}</WorkspaceProvider></QueryClientProvider>
+);
+
+beforeEach(() => {
+  jest.clearAllMocks();
+  for (const k of Object.keys(saved)) delete saved[k];
+  qc = new QueryClient();
+  mockAuth.status = 'signedIn';
+  mockAuth.workspaces = [A, B];
+  mockAuth.refreshMe.mockResolvedValue(null);
+  Mobile.setActiveWorkspaceId(null);
+});
+
+describe('WorkspaceProvider', () => {
+  it('opens the first workspace and saves it for this user', async () => {
+    getWorkspace.mockResolvedValue(detail(A, { 'workspace.read': true }));
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
+    expect(h.result.current.workspaceId).toBe(A.id);
+    expect(h.result.current.role).toBe('ORGANIZER');
+    expect(h.result.current.kind).toBe('HOME');
+    expect(Mobile.getActiveWorkspaceId()).toBe(A.id);
+    expect(saved['crewtally.workspace.v1.u1']).toBe(A.id);
+  });
+
+  it('opens the last used workspace', async () => {
+    saved['crewtally.workspace.v1.u1'] = B.id;
+    getWorkspace.mockResolvedValue(detail(B, {}));
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
+    expect(h.result.current.workspaceId).toBe(B.id);
+  });
+
+  it('a 404 for the current workspace clears the saved id and shows access removed', async () => {
+    saved['crewtally.workspace.v1.u1'] = A.id;
+    getWorkspace.mockRejectedValue(gone);
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
+    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
+    expect(h.result.current.workspaceId).toBeNull();
+    expect(Mobile.getActiveWorkspaceId()).toBeNull();
+    act(() => h.result.current.acknowledgeRemoved());
+    expect(h.result.current.phase).toBe('switcher');
+  });
+
+  it('a saved workspace that is no longer listed shows access removed on re-sign-in', async () => {
+    saved['crewtally.workspace.v1.u1'] = 'cccccccc-0000-4000-8000-000000000003';
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
+    expect(getWorkspace).not.toHaveBeenCalled();
+    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
+  });
+
+  it('no workspaces: first run choice, and nothing is created', async () => {
+    mockAuth.workspaces = [];
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('none'));
+    expect(getWorkspace).not.toHaveBeenCalled();
+  });
+
+  it('switching clears in-memory queries and reloads', async () => {
+    getWorkspace.mockResolvedValueOnce(detail(A, {})).mockResolvedValueOnce(detail(B, {}));
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
+    qc.setQueryData(['ws', A.id, 'members'], { members: [] });
+    await act(async () => { await h.result.current.switchTo(B.id); });
+    expect(qc.getQueryData(['ws', A.id, 'members'])).toBeUndefined();
+    expect(h.result.current.workspaceId).toBe(B.id);
+    expect(h.result.current.role).toBe('PARTNER');
+    expect(saved['crewtally.workspace.v1.u1']).toBe(B.id);
+  });
+
+  it('keeps each person\'s saved workspace separate', async () => {
+    getWorkspace.mockResolvedValue(detail(A, {}));
+    renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(saved['crewtally.workspace.v1.u1']).toBe(A.id));
+    expect(saved['crewtally.workspace.v1.u2']).toBeUndefined();
+  });
+});
+
+describe('freshness while signed in', () => {
+  it('foregrounding the app discovers removal by someone else', async () => {
+    const { AppState } = require('react-native');
+    let handler: (s: string) => void = () => undefined;
+    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => { handler = h; return { remove: jest.fn() }; }) as never);
+    getWorkspace.mockResolvedValueOnce(detail(A, {}));
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
+    getWorkspace.mockRejectedValueOnce(gone);
+    await act(async () => { handler('active'); });
+    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
+    expect(h.result.current.workspaceId).toBeNull();
+    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
+  });
+
+  it('any workspace route answering 404 triggers a re-check', async () => {
+    getWorkspace.mockResolvedValueOnce(detail(A, {}));
+    const h = renderHook(() => useWorkspace(), { wrapper });
+    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
+    getWorkspace.mockRejectedValueOnce(gone);
+    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND' }) }));
+    process.env.EXPO_PUBLIC_DOMAIN = 'x.test';
+    await act(async () => { await Mobile.getMembers().catch(() => undefined); });
+    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
+  });
+});
+
+describe('More screen follows can', () => {
+  it('shows Partner for the organizer and Leave for no one who is an organizer', async () => {
+    getWorkspace.mockResolvedValue(detail(A, { 'members.manage': true }));
+    render(<MoreScreen />, { wrapper });
+    await waitFor(() => screen.getByTestId('more-partner'));
+    expect(screen.queryByTestId('more-leave')).toBeNull();
+  });
+
+  it('hides Partner for a partner and offers Leave', async () => {
+    saved['crewtally.workspace.v1.u1'] = B.id;
+    getWorkspace.mockResolvedValue(detail(B, { 'workspace.read': true, 'members.manage': false }));
+    render(<MoreScreen />, { wrapper });
+    await waitFor(() => screen.getByTestId('more-leave'));
+    expect(screen.queryByTestId('more-partner')).toBeNull();
+    fireEvent.press(screen.getByTestId('more-workspaces'));
+    expect(mockPush).toHaveBeenCalledWith('/switcher');
+  });
+});
diff --git a/artifacts/crewtally-mobile/app.config.ts b/artifacts/crewtally-mobile/app.config.ts
deleted file mode 100644
index 408c9cd..0000000
--- a/artifacts/crewtally-mobile/app.config.ts
+++ /dev/null
@@ -1,17 +0,0 @@
-import type { ConfigContext, ExpoConfig } from 'expo/config';
-
-export default function appConfig({ config }: ConfigContext): ExpoConfig {
-  if (!config.name || !config.slug) {
-    throw new Error('Expo app configuration is missing name or slug');
-  }
-  return {
-    ...config,
-    name: config.name,
-    slug: config.slug,
-    extra: {
-      ...config.extra,
-      // Explicitly expose only this non-secret environment label to the client.
-      appEnv: process.env.APP_ENV ?? 'unknown',
-    },
-  };
-}
\ No newline at end of file
diff --git a/artifacts/crewtally-mobile/app.json b/artifacts/crewtally-mobile/app.json
index ea7f96b..67898a8 100644
--- a/artifacts/crewtally-mobile/app.json
+++ b/artifacts/crewtally-mobile/app.json
@@ -20,6 +20,9 @@
     "experiments": {
       "typedRoutes": true,
       "reactCompiler": true
+    },
+    "extra": {
+      "appEnv": "development"
     }
   }
 }
diff --git a/artifacts/crewtally-mobile/app/(tabs)/index.tsx b/artifacts/crewtally-mobile/app/(tabs)/index.tsx
index fcc4abb..5363254 100644
--- a/artifacts/crewtally-mobile/app/(tabs)/index.tsx
+++ b/artifacts/crewtally-mobile/app/(tabs)/index.tsx
@@ -4,7 +4,7 @@ import { Screen } from '@/components/Screen';
 
 export default function TodayScreen() {
   return (
-    <Screen title="Today">
+    <Screen title="Today" workspaceHeader>
       <EmptyState
         icon="calendar"
         title="Nothing to record yet"
diff --git a/artifacts/crewtally-mobile/app/(tabs)/more.tsx b/artifacts/crewtally-mobile/app/(tabs)/more.tsx
index c2db301..459f0bf 100644
--- a/artifacts/crewtally-mobile/app/(tabs)/more.tsx
+++ b/artifacts/crewtally-mobile/app/(tabs)/more.tsx
@@ -2,6 +2,11 @@ import React, { useCallback, useEffect, useState } from 'react';
 import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
 import { useRouter } from 'expo-router';
 import { useAuth } from '@/contexts/AuthContext';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { removeMember } from '@/lib/mobileApi';
+import { useOperationKeeper } from '@/lib/operation';
+import { kindLabel, roleLabel } from '@/lib/roles';
+import { SecondaryButton } from '@/components/SecondaryButton';
 import { Feather } from '@expo/vector-icons';
 import { ApiError, getAppVersion, getHealth, type ApiResponse, type HealthResponse } from '@/lib/api';
 import { PrimaryButton } from '@/components/PrimaryButton';
@@ -11,7 +16,31 @@ import { useColors } from '@/hooks/useColors';
 export default function MoreScreen() {
   const colors = useColors();
   const router = useRouter();
-  const { workspace } = useAuth();
+  const { userId } = useAuth();
+  const { workspace, workspaceId, role, kind, can, afterLeaving } = useWorkspace();
+  const leaveOp = useOperationKeeper();
+  const [confirmLeave, setConfirmLeave] = useState(false);
+  const [leaving, setLeaving] = useState(false);
+  const [leaveError, setLeaveError] = useState<string | null>(null);
+  const isHome = kind === 'HOME';
+  const showPartner = isHome && can['members.manage'] === true;
+  const showLeave = isHome && !!role && role !== 'ORGANIZER' && !!userId;
+
+  const leave = async () => {
+    if (!userId || leaving) return;
+    setLeaving(true);
+    setLeaveError(null);
+    try {
+      await removeMember(userId, leaveOp.idFor(`leave|${workspaceId}`));
+      leaveOp.done();
+      await afterLeaving();
+      router.replace('/switcher' as never);
+    } catch {
+      setLeaveError('Could not leave. Check your connection and try again.');
+    } finally {
+      setLeaving(false);
+    }
+  };
   const [health, setHealth] = useState<ApiResponse<HealthResponse> | null>(null);
   const [error, setError] = useState<ApiError | null>(null);
   const [loading, setLoading] = useState(true);
@@ -40,25 +69,37 @@ export default function MoreScreen() {
   }, [loadHealth]);
 
   return (
-    <Screen title="More">
+    <Screen title="More" workspaceHeader>
       <View style={[styles.card, styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
-        <Pressable
-          accessibilityRole="button"
-          testID="more-account"
-          onPress={() => router.push('/account' as never)}
-          style={styles.row}
-        >
-          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>Account</Text>
-          <Feather accessible={false} name="chevron-right" size={20} color={colors.mutedForeground} />
-        </Pressable>
+        <NavRow label="Workspaces" testID="more-workspaces" onPress={() => router.push('/switcher' as never)} />
+        {showPartner ? (<><View style={[styles.divider, { backgroundColor: colors.border }]} /><NavRow label="Partner" testID="more-partner" onPress={() => router.push('/partner' as never)} /></>) : null}
+        {showLeave ? (<><View style={[styles.divider, { backgroundColor: colors.border }]} /><NavRow label={`Leave ${workspace?.name ?? 'workspace'}`} testID="more-leave" onPress={() => setConfirmLeave(true)} /></>) : null}
+        <View style={[styles.divider, { backgroundColor: colors.border }]} />
+        <NavRow label="Account" testID="more-account" onPress={() => router.push('/account' as never)} />
       </View>
+      {confirmLeave ? (
+        <View style={[styles.card, styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, gap: 12 }]}>
+          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>
+            You will lose access to {workspace?.name}. Work and payments you recorded stay in the records.
+          </Text>
+          <PrimaryButton label={leaving ? 'Leaving…' : `Leave ${workspace?.name ?? 'workspace'}`} testID="leave-confirm" disabled={leaving} onPress={() => void leave()} />
+          <SecondaryButton label="Cancel" onPress={() => setConfirmLeave(false)} />
+          {leaveError ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.errorText, { color: colors.destructive }]}>{leaveError}</Text> : null}
+        </View>
+      ) : null}
       <Text accessibilityRole="header" allowFontScaling style={[styles.sectionTitle, { color: colors.foreground }]}>
         Diagnostics
       </Text>
       <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
         <DiagnosticRow label="App version" value={getAppVersion()} />
         <View style={[styles.divider, { backgroundColor: colors.border }]} />
-        <DiagnosticRow label="Workspace" value={workspace ? workspace.id.slice(0, 8) : 'Unknown'} />
+        <DiagnosticRow label="User" value={userId ? userId.slice(0, 8) : 'Unknown'} />
+        <View style={[styles.divider, { backgroundColor: colors.border }]} />
+        <DiagnosticRow label="Workspace" value={workspace ? workspace.id : 'Unknown'} />
+        <View style={[styles.divider, { backgroundColor: colors.border }]} />
+        <DiagnosticRow label="Role" value={role ? roleLabel(role).toUpperCase() : 'Unknown'} />
+        <View style={[styles.divider, { backgroundColor: colors.border }]} />
+        <DiagnosticRow label="Kind" value={kind ? kindLabel(kind).toUpperCase() : 'Unknown'} />
         <View style={[styles.divider, { backgroundColor: colors.border }]} />
         <View style={styles.row}>
           <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>API status</Text>
@@ -120,6 +161,16 @@ export default function MoreScreen() {
   );
 }
 
+function NavRow({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
+  const colors = useColors();
+  return (
+    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={styles.row}>
+      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
+      <Feather accessible={false} name="chevron-right" size={20} color={colors.mutedForeground} />
+    </Pressable>
+  );
+}
+
 function DiagnosticRow({ label, value }: { label: string; value: string }) {
   const colors = useColors();
   return (
diff --git a/artifacts/crewtally-mobile/app/(tabs)/payments.tsx b/artifacts/crewtally-mobile/app/(tabs)/payments.tsx
index 4dc9cac..67111b9 100644
--- a/artifacts/crewtally-mobile/app/(tabs)/payments.tsx
+++ b/artifacts/crewtally-mobile/app/(tabs)/payments.tsx
@@ -4,7 +4,7 @@ import { Screen } from '@/components/Screen';
 
 export default function PaymentsScreen() {
   return (
-    <Screen title="Payments">
+    <Screen title="Payments" workspaceHeader>
       <EmptyState
         icon="credit-card"
         title="No payments yet"
diff --git a/artifacts/crewtally-mobile/app/(tabs)/workers.tsx b/artifacts/crewtally-mobile/app/(tabs)/workers.tsx
index 394dac4..090d2e9 100644
--- a/artifacts/crewtally-mobile/app/(tabs)/workers.tsx
+++ b/artifacts/crewtally-mobile/app/(tabs)/workers.tsx
@@ -4,7 +4,7 @@ import { Screen } from '@/components/Screen';
 
 export default function WorkersScreen() {
   return (
-    <Screen title="Workers">
+    <Screen title="Workers" workspaceHeader>
       <EmptyState
         icon="users"
         title="No workers yet"
diff --git a/artifacts/crewtally-mobile/app/_layout.tsx b/artifacts/crewtally-mobile/app/_layout.tsx
index e6a56ce..baec287 100644
--- a/artifacts/crewtally-mobile/app/_layout.tsx
+++ b/artifacts/crewtally-mobile/app/_layout.tsx
@@ -13,6 +13,8 @@ import {
 } from '@expo-google-fonts/inter';
 import { Stack, usePathname, useRouter } from 'expo-router';
 import { AuthProvider, useAuth } from '@/contexts/AuthContext';
+import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
+import { consumeJoinAfterSignIn } from '@/lib/intent';
 import { configureApiClient } from '@/lib/authEvents';
 import * as SplashScreen from 'expo-splash-screen';
 
@@ -27,7 +29,10 @@ function RootLayoutNav() {
   const { status, pendingRoute, rememberRoute, consumePendingRoute } = useAuth();
   const pathname = usePathname();
   const router = useRouter();
+  const { phase } = useWorkspace();
   const signedIn = status === 'signedIn';
+  const inWorkspace = signedIn && (phase === 'ready' || phase === 'switching');
+  const noWorkspace = signedIn && !inWorkspace;
 
   useEffect(() => {
     rememberRoute(pathname);
@@ -40,14 +45,30 @@ function RootLayoutNav() {
     }
   }, [signedIn, pendingRoute, consumePendingRoute, router]);
 
+  useEffect(() => {
+    if (signedIn && consumeJoinAfterSignIn()) router.push('/join' as never);
+  }, [signedIn, router]);
+
   return (
     <Stack screenOptions={{ headerBackTitle: 'Back' }}>
-      <Stack.Protected guard={signedIn}>
+      <Stack.Protected guard={inWorkspace}>
         <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
+        <Stack.Screen name="welcome" options={{ title: 'Welcome', headerBackVisible: false }} />
+        <Stack.Screen name="joined" options={{ title: 'Joined', headerBackVisible: false }} />
+        <Stack.Screen name="partner" options={{ title: 'Partner', headerBackTitle: 'More' }} />
+      </Stack.Protected>
+      <Stack.Protected guard={noWorkspace}>
+        <Stack.Screen name="gate" options={{ headerShown: false }} />
+      </Stack.Protected>
+      <Stack.Protected guard={signedIn}>
         <Stack.Screen name="account" options={{ title: 'Account', headerBackTitle: 'More' }} />
+        <Stack.Screen name="switcher" options={{ title: 'Workspaces', headerBackTitle: 'Back' }} />
+        <Stack.Screen name="create-workspace" options={{ title: 'New workspace' }} />
+        <Stack.Screen name="join" options={{ title: 'Join a team' }} />
       </Stack.Protected>
       <Stack.Protected guard={!signedIn}>
-        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
+        <Stack.Screen name="start" options={{ headerShown: false }} />
+        <Stack.Screen name="sign-in" options={{ title: '', headerShadowVisible: false, headerBackTitle: 'Back' }} />
       </Stack.Protected>
     </Stack>
   );
@@ -76,7 +97,9 @@ export default function RootLayout() {
           <GestureHandlerRootView>
             <KeyboardProvider>
               <AuthProvider>
-                <RootLayoutNav />
+                <WorkspaceProvider>
+                  <RootLayoutNav />
+                </WorkspaceProvider>
               </AuthProvider>
             </KeyboardProvider>
           </GestureHandlerRootView>
diff --git a/artifacts/crewtally-mobile/app/account.tsx b/artifacts/crewtally-mobile/app/account.tsx
index 5e177c0..0708f17 100644
--- a/artifacts/crewtally-mobile/app/account.tsx
+++ b/artifacts/crewtally-mobile/app/account.tsx
@@ -1,13 +1,41 @@
 import React, { useState } from 'react';
-import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
+import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
 import { Feather } from '@expo/vector-icons';
 import { useAuth } from '@/contexts/AuthContext';
+import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
+import { Field } from '@/components/Field';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { patchMe } from '@/lib/mobileApi';
+import { useOperationKeeper } from '@/lib/operation';
 import { useColors } from '@/hooks/useColors';
 import { PRIVACY_URL, SUPPORT_URL } from '@/lib/links';
 
 export default function AccountScreen() {
   const colors = useColors();
-  const { signOut, message } = useAuth();
+  const { signOut, message, profile, refreshMe } = useAuth();
+  const nameOp = useOperationKeeper();
+  const [name, setName] = useState<string | null>(null);
+  const [saving, setSaving] = useState(false);
+  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
+  const shownName = name ?? profile?.display_name ?? '';
+
+  const saveName = async () => {
+    const value = shownName.trim();
+    if (saving || value.length > 60) return;
+    setSaving(true);
+    setSaveMsg(null);
+    try {
+      await patchMe(value, nameOp.idFor(value));
+      nameOp.done();
+      await refreshMe().catch(() => null);
+      setName(null);
+      setSaveMsg({ ok: true, text: 'Name saved.' });
+    } catch {
+      setSaveMsg({ ok: false, text: 'Could not save your name. Check your connection and try again.' });
+    } finally {
+      setSaving(false);
+    }
+  };
   const [confirming, setConfirming] = useState(false);
   const [working, setWorking] = useState(false);
   const [failed, setFailed] = useState(false);
@@ -29,15 +57,26 @@ export default function AccountScreen() {
   );
 
   return (
-    <ScrollView
+    <KeyboardAwareScrollViewCompat
       style={{ backgroundColor: colors.background }}
       contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingBottom: 34 }]}
     >
+      <View style={[styles.card, card, { padding: 16, gap: 12 }]}>
+        <Field label="Your name" hint="Shown to people in your workspaces. Never on receipts." value={shownName}
+          onChangeText={setName} maxLength={60} autoCapitalize="words" testID="account-name" />
+        <PrimaryButton label={saving ? 'Saving…' : 'Save name'} testID="account-name-save" disabled={saving || shownName.trim() === (profile?.display_name ?? '')}
+          onPress={() => void saveName()} />
+        {saveMsg ? (
+          <Text accessibilityLiveRegion="polite" allowFontScaling testID="account-name-msg"
+            style={{ color: saveMsg.ok ? colors.foreground : colors.destructive, fontSize: 15 }}>{saveMsg.text}</Text>
+        ) : null}
+      </View>
+
       <View style={[styles.card, card]}>
         <View style={styles.row}>
           <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>Sign-in</Text>
           <Text allowFontScaling testID="account-signin" style={[styles.value, { color: colors.mutedForeground }]}>
-            Signed in with Apple
+            {profile && !profile.has_apple ? 'Developer sign-in' : 'Signed in with Apple'}
           </Text>
         </View>
       </View>
@@ -76,7 +115,7 @@ export default function AccountScreen() {
           {message ?? 'Could not sign out. You are still signed in. Try again.'}
         </Text>
       ) : null}
-    </ScrollView>
+    </KeyboardAwareScrollViewCompat>
   );
 }
 
diff --git a/artifacts/crewtally-mobile/app/create-workspace.tsx b/artifacts/crewtally-mobile/app/create-workspace.tsx
new file mode 100644
index 0000000..5552c4b
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/create-workspace.tsx
@@ -0,0 +1,55 @@
+import React, { useState } from 'react';
+import { Text, StyleSheet } from 'react-native';
+import { useRouter } from 'expo-router';
+import { Field } from '@/components/Field';
+import { Notice } from '@/components/Notice';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { useOperationKeeper } from '@/lib/operation';
+
+export default function CreateWorkspaceScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { createHome } = useWorkspace();
+  const op = useOperationKeeper();
+  const [name, setName] = useState('My home');
+  const [busy, setBusy] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const trimmed = name.trim();
+
+  const submit = async () => {
+    if (busy || trimmed.length < 1 || trimmed.length > 80) return;
+    setBusy(true);
+    setError(null);
+    try {
+      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
+      // Same operation_id on a retry of the same request.
+      await createHome(trimmed, timezone, op.idFor(`${trimmed}|${timezone}`));
+      op.done();
+      router.replace('/welcome' as never);
+    } catch (e) {
+      const status = (e as { status?: number } | null)?.status;
+      setError(status === 400
+        ? 'Check the name and try again. It needs 1 to 80 characters.'
+        : status === 409
+          ? 'That request was already used with different details. Go back and try again.'
+          : 'Could not create the workspace. Check your connection and try again.');
+    } finally {
+      setBusy(false);
+    }
+  };
+
+  return (
+    <Page>
+      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Name your Home workspace</Text>
+      <Field label="Workspace name" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words"
+        testID="workspace-name" hint="Uses this device's time zone." returnKeyType="done" onSubmitEditing={() => void submit()} />
+      {error ? <Notice testID="create-error">{error}</Notice> : null}
+      <PrimaryButton label={busy ? 'Creating…' : 'Create workspace'} testID="create-submit" disabled={busy || trimmed.length < 1} onPress={() => void submit()} />
+    </Page>
+  );
+}
+
+const styles = StyleSheet.create({ title: { fontSize: 24, fontWeight: '700' } });
diff --git a/artifacts/crewtally-mobile/app/gate.tsx b/artifacts/crewtally-mobile/app/gate.tsx
new file mode 100644
index 0000000..8b78a2d
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/gate.tsx
@@ -0,0 +1,87 @@
+import React from 'react';
+import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useQuery } from '@tanstack/react-query';
+import { useRouter } from 'expo-router';
+import { SafeAreaView } from 'react-native-safe-area-context';
+import { Card } from '@/components/Card';
+import { Notice } from '@/components/Notice';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { SecondaryButton } from '@/components/SecondaryButton';
+import { WorkspaceList } from '@/components/WorkspaceList';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { getConfig } from '@/lib/mobileApi';
+
+/** Shown while signed in with no open workspace: loading, error, access removed, switcher, or first run. */
+export default function GateScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { phase, error, retry, acknowledgeRemoved } = useWorkspace();
+  const config = useQuery({ queryKey: ['config'], queryFn: getConfig, enabled: phase === 'none', retry: false });
+
+  let body: React.ReactNode;
+  if (phase === 'error') {
+    body = (
+      <>
+        <Notice testID="gate-error">{error ?? 'Something went wrong.'}</Notice>
+        <PrimaryButton label="Try again" onPress={retry} testID="gate-retry" />
+      </>
+    );
+  } else if (phase === 'removed') {
+    body = (
+      <Card>
+        <Feather accessible={false} name="lock" size={28} color={colors.copper} />
+        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Access removed</Text>
+        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+          You no longer have access to this workspace. Your account and other workspaces are still here.
+        </Text>
+        <PrimaryButton label="Choose a workspace" testID="removed-continue" onPress={acknowledgeRemoved} />
+      </Card>
+    );
+  } else if (phase === 'switcher') {
+    body = (
+      <>
+        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Workspaces</Text>
+        <WorkspaceList />
+      </>
+    );
+  } else if (phase === 'none') {
+    body = (
+      <>
+        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
+          What do you want to set up?
+        </Text>
+        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+          A workspace holds the work and payments you record.
+        </Text>
+        <PrimaryButton label="Home" testID="choose-home" onPress={() => router.push('/create-workspace' as never)} />
+        <SecondaryButton label="Join a team" testID="choose-join" onPress={() => router.push('/join' as never)} />
+        {config.data?.business_enabled ? (
+          // Business screens arrive in a later phase; the choice is listed but cannot be opened yet.
+          <SecondaryButton label="Business" testID="choose-business" disabled onPress={() => undefined} />
+        ) : null}
+      </>
+    );
+  } else {
+    body = (
+      <View style={styles.center} accessibilityLiveRegion="polite" testID="gate-loading">
+        <ActivityIndicator color={colors.primary} />
+        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Opening your workspace…</Text>
+      </View>
+    );
+  }
+
+  return (
+    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
+      <Page>{body}</Page>
+    </SafeAreaView>
+  );
+}
+
+const styles = StyleSheet.create({
+  title: { fontSize: 24, fontWeight: '700' },
+  body: { fontSize: 16, lineHeight: 24 },
+  center: { alignItems: 'center', gap: 8, paddingVertical: 48 },
+});
diff --git a/artifacts/crewtally-mobile/app/join.tsx b/artifacts/crewtally-mobile/app/join.tsx
new file mode 100644
index 0000000..827d609
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/join.tsx
@@ -0,0 +1,166 @@
+import React, { useState } from 'react';
+import { StyleSheet, Text, View } from 'react-native';
+import { useRouter } from 'expo-router';
+import { Card } from '@/components/Card';
+import { Field } from '@/components/Field';
+import { Notice } from '@/components/Notice';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { SecondaryButton } from '@/components/SecondaryButton';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { acceptInvite, acceptInviteCode, peekInvite, type PeekResult } from '@/lib/mobileApi';
+import { useOperationKeeper } from '@/lib/operation';
+import { roleLabel, tokenFromLink } from '@/lib/roles';
+
+const CODE_WRONG = "That code didn't work. Check the email address and the code, or ask for a new invitation.";
+
+function joinError(e: unknown): string {
+  const status = (e as { status?: number } | null)?.status;
+  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
+  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
+  if (status === 409) return 'This invitation can no longer be used. Ask the organizer.';
+  if (status === 400 || status === 410 || status === 404) return CODE_WRONG;
+  return 'Could not join. Please try again.';
+}
+
+/** JoinTeam, JoinInvite and the link path. The person is already signed in. */
+export default function JoinScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { openJoined } = useWorkspace();
+  const op = useOperationKeeper();
+  const [mode, setMode] = useState<'code' | 'link'>('code');
+  const [email, setEmail] = useState('');
+  const [code, setCode] = useState('');
+  const [link, setLink] = useState('');
+  const [peek, setPeek] = useState<PeekResult | null>(null);
+  const [token, setToken] = useState<string | null>(null);
+  const [unavailable, setUnavailable] = useState(false);
+  const [busy, setBusy] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+
+  const finish = async (workspaceId: string) => {
+    op.done();
+    await openJoined(workspaceId);
+    router.replace('/joined' as never);
+  };
+
+  const submitCode = async () => {
+    const e = email.trim().toLowerCase();
+    const c = code.trim();
+    if (busy || !e || !/^\d{6}$/.test(c)) return;
+    setBusy(true);
+    setError(null);
+    try {
+      const result = await acceptInviteCode(e, c, op.idFor(`code|${e}|${c}`));
+      await finish(result.workspace_id);
+    } catch (err) {
+      setError(joinError(err));
+    } finally {
+      setBusy(false);
+    }
+  };
+
+  const checkLink = async () => {
+    const t = tokenFromLink(link);
+    if (busy) return;
+    setError(null);
+    setPeek(null);
+    setUnavailable(false);
+    if (!t) { setUnavailable(true); return; }
+    setBusy(true);
+    try {
+      const r = await peekInvite(t);
+      if (r.available) { setPeek(r); setToken(t); } else setUnavailable(true);
+    } catch (err) {
+      const status = (err as { status?: number } | null)?.status;
+      if (status === undefined) setError('Could not connect to CrewTally. Check your connection and try again.');
+      else if (status === 429) setError('Too many attempts. Wait a minute and try again.');
+      else setUnavailable(true);
+    } finally {
+      setBusy(false);
+    }
+  };
+
+  const acceptLink = async () => {
+    if (!token || busy) return;
+    setBusy(true);
+    setError(null);
+    try {
+      const result = await acceptInvite(token, op.idFor(`link|${token}`));
+      await finish(result.workspace_id);
+    } catch (err) {
+      const status = (err as { status?: number } | null)?.status;
+      if (status === 410 || status === 404) { setPeek(null); setUnavailable(true); } else setError(joinError(err));
+    } finally {
+      setBusy(false);
+    }
+  };
+
+  if (unavailable) {
+    return (
+      <Page>
+        <Card>
+          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
+            This invitation isn't available
+          </Text>
+          <Text allowFontScaling testID="invite-unavailable" style={[styles.body, { color: colors.mutedForeground }]}>
+            This invitation isn't available. Ask for a new one.
+          </Text>
+          <PrimaryButton label="Back" onPress={() => setUnavailable(false)} />
+        </Card>
+      </Page>
+    );
+  }
+
+  return (
+    <Page>
+      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Join a team</Text>
+      <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+        Use the email address the invitation was sent to and its 6-digit code, or paste the invitation link.
+      </Text>
+      <View style={styles.tabs} accessibilityRole="tablist">
+        <SecondaryButton label="Email and code" style={mode === 'code' ? { borderColor: colors.primary, borderWidth: 2 } : undefined}
+          testID="join-mode-code" onPress={() => { setMode('code'); setError(null); }} />
+        <SecondaryButton label="Invitation link" style={mode === 'link' ? { borderColor: colors.primary, borderWidth: 2 } : undefined}
+          testID="join-mode-link" onPress={() => { setMode('link'); setError(null); }} />
+      </View>
+      {mode === 'code' ? (
+        <>
+          <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
+            autoCorrect={false} autoComplete="email" textContentType="emailAddress" testID="join-email" />
+          <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
+            maxLength={6} autoComplete="one-time-code" testID="join-code" />
+          {error ? <Notice testID="join-error">{error}</Notice> : null}
+          <PrimaryButton label={busy ? 'Joining…' : 'Join'} testID="join-submit"
+            disabled={busy || !email.trim() || code.length !== 6} onPress={() => void submitCode()} />
+        </>
+      ) : (
+        <>
+          <Field label="Invitation link" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false}
+            keyboardType="url" testID="join-link" />
+          {peek ? (
+            <Card>
+              <Text accessibilityRole="header" allowFontScaling style={[styles.name, { color: colors.foreground }]}>{peek.workspace_name}</Text>
+              <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+                You would join as {roleLabel(peek.role ?? 'PARTNER')}.
+              </Text>
+              <PrimaryButton label={busy ? 'Joining…' : 'Join this workspace'} testID="join-accept" disabled={busy} onPress={() => void acceptLink()} />
+            </Card>
+          ) : (
+            <PrimaryButton label={busy ? 'Checking…' : 'Check link'} testID="join-check" disabled={busy || !link.trim()} onPress={() => void checkLink()} />
+          )}
+          {error ? <Notice testID="join-error">{error}</Notice> : null}
+        </>
+      )}
+    </Page>
+  );
+}
+
+const styles = StyleSheet.create({
+  title: { fontSize: 24, fontWeight: '700' },
+  name: { fontSize: 20, fontWeight: '600' },
+  body: { fontSize: 16, lineHeight: 24 },
+  tabs: { gap: 8 },
+});
diff --git a/artifacts/crewtally-mobile/app/joined.tsx b/artifacts/crewtally-mobile/app/joined.tsx
new file mode 100644
index 0000000..1c9bfac
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/joined.tsx
@@ -0,0 +1,52 @@
+import React, { useEffect, useState } from 'react';
+import { StyleSheet, Text } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useRouter } from 'expo-router';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { getMembers } from '@/lib/mobileApi';
+import { roleLabel } from '@/lib/roles';
+
+export default function JoinedScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { workspace, workspaceId } = useWorkspace();
+  const [organizer, setOrganizer] = useState<string | null>(null);
+
+  useEffect(() => {
+    if (!workspaceId) return;
+    let live = true;
+    getMembers()
+      .then((r) => {
+        const o = r.members.find((m) => m.role === 'ORGANIZER' || m.role === 'OWNER');
+        if (live && o) setOrganizer(o.display_name ?? o.name ?? null);
+      })
+      .catch(() => undefined);
+    return () => { live = false; };
+  }, [workspaceId]);
+
+  const name = workspace?.name ?? 'this workspace';
+  const home = workspace?.kind !== 'BUSINESS';
+  return (
+    <Page>
+      <Feather accessible={false} name="check-circle" size={36} color={colors.primary} />
+      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>You joined</Text>
+      <Text allowFontScaling testID="joined-text" style={[styles.body, { color: colors.foreground }]}>
+        {home
+          ? `You're helping with ${name}. ${organizer ?? 'The organizer'} manages the plan.`
+          : `You joined ${name}.`}
+      </Text>
+      {workspace ? (
+        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Your role: {roleLabel(workspace.role)}</Text>
+      ) : null}
+      <PrimaryButton label="Continue" testID="joined-continue" onPress={() => router.replace('/(tabs)' as never)} />
+    </Page>
+  );
+}
+
+const styles = StyleSheet.create({
+  title: { fontSize: 28, fontWeight: '700' },
+  body: { fontSize: 17, lineHeight: 26 },
+});
diff --git a/artifacts/crewtally-mobile/app/partner.tsx b/artifacts/crewtally-mobile/app/partner.tsx
new file mode 100644
index 0000000..6f252c8
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/partner.tsx
@@ -0,0 +1,232 @@
+import React, { useState } from 'react';
+import { Share, StyleSheet, Text, View } from 'react-native';
+import * as Clipboard from 'expo-clipboard';
+import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
+import { Card } from '@/components/Card';
+import { Field } from '@/components/Field';
+import { Notice } from '@/components/Notice';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { SecondaryButton } from '@/components/SecondaryButton';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import {
+  createInvitation, getInvitations, getMembers, removeMember, revokeInvitation, type CreatedInvitation,
+} from '@/lib/mobileApi';
+import { useOperationKeeper } from '@/lib/operation';
+import { formatDate } from '@/lib/roles';
+
+interface Ready { id: string; link: string | null; code: string | null; email: string; expiresAt?: string; already: boolean }
+
+export function shareMessage(workspaceName: string, link: string, code: string, email: string): string {
+  return `Join me on CrewTally to help keep track of ${workspaceName}. Open ${link} on your iPhone, or enter code ${code} with this email address: ${email}. It works for 7 days.`;
+}
+
+const errText = (e: unknown, fallback: string) => {
+  const status = (e as { status?: number } | null)?.status;
+  if (status === 409) return 'This workspace already has a partner or a pending invitation.';
+  if (status === 403) return 'Only the organizer can do this.';
+  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
+  return fallback;
+};
+
+export default function PartnerScreen() {
+  const colors = useColors();
+  const qc = useQueryClient();
+  const { workspace, workspaceId, can } = useWorkspace();
+  const inviteOp = useOperationKeeper();
+  const revokeOp = useOperationKeeper();
+  const removeOp = useOperationKeeper();
+  const [name, setName] = useState('');
+  const [email, setEmail] = useState('');
+  const [ready, setReady] = useState<Ready | null>(null);
+  const [confirmRemove, setConfirmRemove] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const [copied, setCopied] = useState<string | null>(null);
+  const allowed = can['members.manage'] === true;
+
+  const members = useQuery({ queryKey: ['ws', workspaceId, 'members'], queryFn: getMembers, enabled: allowed });
+  const invitations = useQuery({ queryKey: ['ws', workspaceId, 'invitations'], queryFn: getInvitations, enabled: allowed });
+  const refetchAll = () => Promise.all([
+    qc.invalidateQueries({ queryKey: ['ws', workspaceId, 'members'] }),
+    qc.invalidateQueries({ queryKey: ['ws', workspaceId, 'invitations'] }),
+  ]);
+
+  const wsName = workspace?.name ?? 'this workspace';
+  const partner = members.data?.members.find((m) => m.role === 'PARTNER');
+  const pending = (invitations.data?.invitations ?? []).find(
+    (i) => i.role === 'PARTNER' && i.status === 'PENDING' && new Date(i.expires_at).getTime() > Date.now(),
+  );
+
+  const toReady = (r: CreatedInvitation, em: string): Ready => ({
+    id: r.id, link: r.link, code: r.code, email: em, expiresAt: r.expires_at, already: r.already_created === true || !r.token,
+  });
+
+  const invite = useMutation({
+    mutationFn: async (input: { name: string; email: string }) => {
+      const body = { role: 'PARTNER' as const, email: input.email, ...(input.name ? { name: input.name } : {}) };
+      return createInvitation(body, inviteOp.idFor(`${input.email}|${input.name}`));
+    },
+    onSuccess: async (r, v) => { inviteOp.done(); setReady(toReady(r, v.email)); setError(null); await refetchAll(); },
+    onError: (e) => setError(errText(e, 'Could not create the invitation. Try again.')),
+  });
+
+  const revoke = useMutation({
+    mutationFn: async (id: string) => revokeInvitation(id, revokeOp.idFor(id)),
+    onSuccess: async () => { revokeOp.done(); setReady(null); setError(null); await refetchAll(); },
+    onError: (e) => setError(errText(e, 'Could not revoke the invitation. Try again.')),
+  });
+
+  const resend = useMutation({
+    // Revoke this invitation, then create a new one to the same email: new link, new code, new 7 days.
+    mutationFn: async (inv: { id: string; email: string; name: string | null }) => {
+      await revokeInvitation(inv.id, revokeOp.idFor(inv.id));
+      revokeOp.done();
+      const body = { role: 'PARTNER' as const, email: inv.email, ...(inv.name ? { name: inv.name } : {}) };
+      return createInvitation(body, inviteOp.idFor(`resend|${inv.id}`));
+    },
+    onSuccess: async (r, v) => { inviteOp.done(); setReady(toReady(r, v.email)); setError(null); await refetchAll(); },
+    onError: async (e) => { setError(errText(e, 'Could not send a new invitation. Try again.')); await refetchAll(); },
+  });
+
+  const remove = useMutation({
+    mutationFn: async (userId: string) => removeMember(userId, removeOp.idFor(userId)),
+    onSuccess: async () => { removeOp.done(); setConfirmRemove(false); setError(null); await refetchAll(); },
+    onError: (e) => setError(errText(e, 'Could not remove the partner. Try again.')),
+  });
+
+  if (!allowed) {
+    return (
+      <Page>
+        <Text allowFontScaling testID="partner-not-allowed" style={[styles.body, { color: colors.mutedForeground }]}>
+          Only the organizer manages the partner.
+        </Text>
+      </Page>
+    );
+  }
+
+  const loading = members.isPending || invitations.isPending;
+  const loadFailed = members.isError || invitations.isError;
+  const busy = invite.isPending || revoke.isPending || resend.isPending || remove.isPending;
+
+  const copy = async (what: string, value: string) => {
+    await Clipboard.setStringAsync(value);
+    setCopied(what);
+  };
+
+  const readyCard = ready ? (
+    <Card>
+      <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>
+        {ready.already ? 'Invitation already created' : 'Invitation ready'}
+      </Text>
+      {ready.already || !ready.link || !ready.code ? (
+        <>
+          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+            The link and code are shown only once, when an invitation is created, and can't be shown again.
+          </Text>
+          <PrimaryButton label="Revoke and invite again" testID="partner-revoke-reinvite" disabled={busy}
+            onPress={() => void resend.mutateAsync({ id: ready.id, email: ready.email, name: pending?.invitee_name ?? null }).catch(() => undefined)} />
+        </>
+      ) : (
+        <>
+          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+            Shown once. Share it now; it can't be shown again.
+          </Text>
+          <View style={styles.kv}>
+            <Text allowFontScaling style={[styles.label, { color: colors.mutedForeground }]}>Link</Text>
+            <Text allowFontScaling selectable testID="partner-link" style={[styles.body, { color: colors.foreground }]}>{ready.link}</Text>
+            <SecondaryButton label="Copy link" testID="partner-copy-link" onPress={() => void copy('link', ready.link as string)} />
+          </View>
+          <View style={styles.kv}>
+            <Text allowFontScaling style={[styles.label, { color: colors.mutedForeground }]}>Code</Text>
+            <Text allowFontScaling selectable testID="partner-code" style={[styles.code, { color: colors.foreground }]}>{ready.code}</Text>
+            <SecondaryButton label="Copy code" testID="partner-copy-code" onPress={() => void copy('code', ready.code as string)} />
+          </View>
+          {copied ? <Notice tone="info">{copied === 'link' ? 'Link copied.' : 'Code copied.'}</Notice> : null}
+          <PrimaryButton label="Share" testID="partner-share"
+            onPress={() => void Share.share({ message: shareMessage(wsName, ready.link as string, ready.code as string, ready.email) })} />
+        </>
+      )}
+    </Card>
+  ) : null;
+
+  let body: React.ReactNode;
+  if (loading) {
+    body = <Text allowFontScaling accessibilityLiveRegion="polite" style={[styles.body, { color: colors.mutedForeground }]}>Loading…</Text>;
+  } else if (loadFailed) {
+    body = (
+      <>
+        <Notice>Could not load the partner details.</Notice>
+        <PrimaryButton label="Try again" onPress={() => void refetchAll()} />
+      </>
+    );
+  } else if (partner) {
+    const pn = partner.display_name ?? partner.name ?? 'Partner';
+    body = (
+      <Card>
+        <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>{pn}</Text>
+        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Partner since {formatDate(partner.joined_at)}</Text>
+        {confirmRemove ? (
+          <>
+            <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>
+              {pn} will lose access to {wsName}. Their work and payments stay in your records.
+            </Text>
+            <PrimaryButton label={remove.isPending ? 'Removing…' : 'Remove partner'} testID="partner-remove-confirm" disabled={busy}
+              onPress={() => void remove.mutateAsync(partner.user_id).catch(() => undefined)} />
+            <SecondaryButton label="Cancel" onPress={() => setConfirmRemove(false)} />
+          </>
+        ) : (
+          <SecondaryButton label="Remove partner" testID="partner-remove" onPress={() => setConfirmRemove(true)} />
+        )}
+      </Card>
+    );
+  } else if (pending) {
+    body = (
+      <>
+        {readyCard}
+        <Card>
+          <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>Invitation pending</Text>
+          {pending.invitee_name ? <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>{pending.invitee_name}</Text> : null}
+          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>{pending.email}</Text>
+          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Expires {formatDate(pending.expires_at)}</Text>
+          <SecondaryButton label="Resend" testID="partner-resend" disabled={busy}
+            onPress={() => void resend.mutateAsync({ id: pending.id, email: pending.email, name: pending.invitee_name }).catch(() => undefined)} />
+          <SecondaryButton label="Revoke" testID="partner-revoke" disabled={busy}
+            onPress={() => void revoke.mutateAsync(pending.id).catch(() => undefined)} />
+        </Card>
+      </>
+    );
+  } else {
+    const valid = /^\S+@\S+\.\S+$/.test(email.trim());
+    body = (
+      <>
+        {readyCard}
+        <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>
+          A partner can record work and payments, and add workers and projects. They can't change pay rates, remove people,
+          invite others or manage the plan. They pay nothing.
+        </Text>
+        <Field label="Partner's name" hint="For your own reference." value={name} onChangeText={setName} maxLength={60}
+          autoCapitalize="words" testID="partner-name" />
+        <Field label="Partner's email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
+          autoCorrect={false} autoComplete="email" textContentType="emailAddress" testID="partner-email" />
+        <PrimaryButton label={invite.isPending ? 'Creating…' : 'Create invitation'} testID="partner-create" disabled={busy || !valid}
+          onPress={() => void invite.mutateAsync({ name: name.trim(), email: email.trim().toLowerCase() }).catch(() => undefined)} />
+      </>
+    );
+  }
+
+  return (
+    <Page>
+      {body}
+      {error ? <Notice testID="partner-error">{error}</Notice> : null}
+    </Page>
+  );
+}
+
+const styles = StyleSheet.create({
+  heading: { fontSize: 20, fontWeight: '600' },
+  body: { fontSize: 16, lineHeight: 24 },
+  label: { fontSize: 14, fontWeight: '600' },
+  kv: { gap: 6 },
+  code: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
+});
diff --git a/artifacts/crewtally-mobile/app/sign-in.tsx b/artifacts/crewtally-mobile/app/sign-in.tsx
index e073770..b800029 100644
--- a/artifacts/crewtally-mobile/app/sign-in.tsx
+++ b/artifacts/crewtally-mobile/app/sign-in.tsx
@@ -40,7 +40,6 @@ export default function SignInScreen() {
   if (__DEV__) {
     if (
       Constants.expoConfig?.extra?.appEnv === 'development'
-      && availability === 'unavailable'
       && status === 'signedOut'
       && !busy
     ) {
@@ -128,7 +127,7 @@ export default function SignInScreen() {
   }
 
   return (
-    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
+    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
       <ScrollView contentContainerStyle={[styles.content, webInset]} keyboardShouldPersistTaps="handled">
         <View style={styles.top}>
           <View style={[styles.mark, { backgroundColor: colors.primary }]}>
@@ -181,7 +180,7 @@ export default function SignInScreen() {
 
 const styles = StyleSheet.create({
   safe: { flex: 1 },
-  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24, justifyContent: 'space-between', gap: 32 },
+  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, justifyContent: 'space-between', gap: 32 },
   top: { gap: 16 },
   mark: { width: 68, height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
   title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
diff --git a/artifacts/crewtally-mobile/app/start.tsx b/artifacts/crewtally-mobile/app/start.tsx
new file mode 100644
index 0000000..90a9b04
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/start.tsx
@@ -0,0 +1,89 @@
+import React from 'react';
+import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import * as WebBrowser from 'expo-web-browser';
+import { useRouter } from 'expo-router';
+import { SafeAreaView } from 'react-native-safe-area-context';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { SecondaryButton } from '@/components/SecondaryButton';
+import { useAuth } from '@/contexts/AuthContext';
+import { useColors } from '@/hooks/useColors';
+import { setJoinAfterSignIn } from '@/lib/intent';
+import { PRIVACY_URL } from '@/lib/links';
+
+/** SignIn: Get started / Join my team. (The sample slot arrives in Phase 2.) */
+export default function StartScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { status, message, notice, retryRestore } = useAuth();
+
+  let actions: React.ReactNode;
+  if (status === 'restoring') {
+    actions = (
+      <View style={styles.center} accessibilityLiveRegion="polite">
+        <ActivityIndicator color={colors.primary} />
+        <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]}>Restoring your session…</Text>
+      </View>
+    );
+  } else if (status === 'retry') {
+    actions = (
+      <>
+        {message ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.caption, { color: colors.destructive }]}>{message}</Text> : null}
+        <PrimaryButton label="Try again" onPress={retryRestore} testID="restore-retry" />
+      </>
+    );
+  } else {
+    actions = (
+      <>
+        <PrimaryButton label="Get started" testID="start-get-started" onPress={() => { setJoinAfterSignIn(false); router.push('/sign-in' as never); }} />
+        <SecondaryButton label="Join my team" testID="start-join" onPress={() => { setJoinAfterSignIn(true); router.push('/sign-in' as never); }} />
+        {/* Phase 2: "Try the Home sample" goes here. */}
+      </>
+    );
+  }
+
+  return (
+    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
+      <ScrollView contentContainerStyle={styles.content}>
+        <View style={styles.top}>
+          <View style={[styles.mark, { backgroundColor: colors.primary }]}>
+            <Feather accessible={false} name="calendar" size={32} color={colors.primaryForeground} />
+          </View>
+          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>CrewTally</Text>
+          <Text allowFontScaling style={[styles.purpose, { color: colors.mutedForeground }]}>
+            Keep an honest record of the work your crew does and the payments you make.
+          </Text>
+        </View>
+        <View style={styles.bottom}>
+          {notice ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.notice, { color: colors.warning, backgroundColor: colors.warningSurface }]}>{notice}</Text> : null}
+          {actions}
+          <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]} testID="never-moves-money">
+            CrewTally never moves money. It keeps a record of payments you make yourself.
+          </Text>
+          <Text
+            accessibilityRole="link"
+            allowFontScaling
+            testID="start-privacy"
+            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
+            style={[styles.caption, { color: colors.primary, textDecorationLine: 'underline', paddingVertical: 12 }]}
+          >
+            Privacy policy
+          </Text>
+        </View>
+      </ScrollView>
+    </SafeAreaView>
+  );
+}
+
+const styles = StyleSheet.create({
+  safe: { flex: 1 },
+  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24, justifyContent: 'space-between', gap: 32 },
+  top: { gap: 16 },
+  mark: { width: 68, height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
+  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
+  purpose: { fontSize: 18, lineHeight: 27 },
+  bottom: { gap: 14 },
+  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },
+  caption: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
+  notice: { fontSize: 16, fontWeight: '600', padding: 12, borderRadius: 12, textAlign: 'center' },
+});
diff --git a/artifacts/crewtally-mobile/app/switcher.tsx b/artifacts/crewtally-mobile/app/switcher.tsx
new file mode 100644
index 0000000..592c36f
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/switcher.tsx
@@ -0,0 +1,13 @@
+import React from 'react';
+import { useRouter } from 'expo-router';
+import { Page } from '@/components/Page';
+import { WorkspaceList } from '@/components/WorkspaceList';
+
+export default function SwitcherScreen() {
+  const router = useRouter();
+  return (
+    <Page>
+      <WorkspaceList onSwitched={() => router.replace('/(tabs)' as never)} />
+    </Page>
+  );
+}
diff --git a/artifacts/crewtally-mobile/app/welcome.tsx b/artifacts/crewtally-mobile/app/welcome.tsx
new file mode 100644
index 0000000..c0c4ba8
--- /dev/null
+++ b/artifacts/crewtally-mobile/app/welcome.tsx
@@ -0,0 +1,32 @@
+import React from 'react';
+import { StyleSheet, Text } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useRouter } from 'expo-router';
+import { Page } from '@/components/Page';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+
+export default function WelcomeScreen() {
+  const colors = useColors();
+  const router = useRouter();
+  const { workspace } = useWorkspace();
+  return (
+    <Page>
+      <Feather accessible={false} name="check-circle" size={36} color={colors.primary} />
+      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
+        {workspace ? `Welcome to ${workspace.name}` : 'Welcome'}
+      </Text>
+      <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+        CrewTally keeps a record of the work and payments you make yourself. It never moves money.
+      </Text>
+      {/* Phase 2 adds the setup screens and the sample project here. */}
+      <PrimaryButton label="Create my project" testID="welcome-create" onPress={() => router.replace('/(tabs)' as never)} />
+    </Page>
+  );
+}
+
+const styles = StyleSheet.create({
+  title: { fontSize: 28, fontWeight: '700' },
+  body: { fontSize: 17, lineHeight: 26 },
+});
diff --git a/artifacts/crewtally-mobile/components/Card.tsx b/artifacts/crewtally-mobile/components/Card.tsx
new file mode 100644
index 0000000..d2043f5
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/Card.tsx
@@ -0,0 +1,9 @@
+import React, { type ReactNode } from 'react';
+import { StyleSheet, View } from 'react-native';
+import { useColors } from '@/hooks/useColors';
+
+export function Card({ children }: { children: ReactNode }) {
+  const colors = useColors();
+  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
+}
+const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 } });
diff --git a/artifacts/crewtally-mobile/components/DevSignInSheet.tsx b/artifacts/crewtally-mobile/components/DevSignInSheet.tsx
index efe084d..b1d9a3b 100644
--- a/artifacts/crewtally-mobile/components/DevSignInSheet.tsx
+++ b/artifacts/crewtally-mobile/components/DevSignInSheet.tsx
@@ -7,6 +7,7 @@ import {
   TextInput,
   View,
 } from 'react-native';
+import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
 import { SafeAreaView } from 'react-native-safe-area-context';
 import { PrimaryButton } from '@/components/PrimaryButton';
 import { useColors } from '@/hooks/useColors';
@@ -98,7 +99,7 @@ const DevSignInSheet = __DEV__
           edges={['top', 'bottom', 'left', 'right']}
           style={[styles.safe, { backgroundColor: colors.background }]}
         >
-          <View style={styles.content}>
+          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content}>
             <View style={styles.headingRow}>
               <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>
                 Developer sign-in
@@ -129,6 +130,8 @@ const DevSignInSheet = __DEV__
             <View accessibilityRole="radiogroup" accessibilityLabel="Choose test owner" style={styles.choices}>
               {choice('owner-a', 'Owner A')}
               {choice('owner-b', 'Owner B')}
+              {choice('member-c', 'Member C')}
+              {choice('member-d', 'Member D')}
             </View>
             {error ? (
               <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]} testID="dev-signin-error">
@@ -144,7 +147,7 @@ const DevSignInSheet = __DEV__
             <Text allowFontScaling style={[styles.note, { color: colors.mutedForeground }]}>
               Test-only access for development builds.
             </Text>
-          </View>
+          </KeyboardAwareScrollViewCompat>
         </SafeAreaView>
       </Modal>
     </>
@@ -156,12 +159,12 @@ export default DevSignInSheet;
 
 const styles = StyleSheet.create({
   safe: { flex: 1 },
-  content: { flex: 1, padding: 24, gap: 18 },
+  content: { flexGrow: 1, padding: 24, gap: 18 },
   headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
   heading: { fontSize: 24, fontWeight: '700' },
   close: { fontSize: 16, textDecorationLine: 'underline' },
   input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
-  choices: { flexDirection: 'row', gap: 12 },
+  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
   choice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
   choiceText: { fontSize: 16, fontWeight: '600' },
   error: { fontSize: 14, lineHeight: 20 },
diff --git a/artifacts/crewtally-mobile/components/Field.tsx b/artifacts/crewtally-mobile/components/Field.tsx
new file mode 100644
index 0000000..7dbf28c
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/Field.tsx
@@ -0,0 +1,32 @@
+import React from 'react';
+import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
+import { useColors } from '@/hooks/useColors';
+
+export interface FieldProps extends Omit<TextInputProps, 'style'> {
+  label: string;
+  hint?: string;
+}
+
+export function Field({ label, hint, ...input }: FieldProps) {
+  const colors = useColors();
+  return (
+    <View style={styles.wrap}>
+      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
+      <TextInput
+        accessibilityLabel={label}
+        allowFontScaling
+        placeholderTextColor={colors.mutedForeground}
+        {...input}
+        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
+      />
+      {hint ? <Text allowFontScaling style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
+    </View>
+  );
+}
+
+const styles = StyleSheet.create({
+  wrap: { gap: 6 },
+  label: { fontSize: 15, fontWeight: '600' },
+  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
+  hint: { fontSize: 14, lineHeight: 20 },
+});
diff --git a/artifacts/crewtally-mobile/components/Notice.tsx b/artifacts/crewtally-mobile/components/Notice.tsx
new file mode 100644
index 0000000..75bc43e
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/Notice.tsx
@@ -0,0 +1,21 @@
+import React from 'react';
+import { StyleSheet, Text, View } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useColors } from '@/hooks/useColors';
+
+/** Text plus icon, never color alone. */
+export function Notice({ tone = 'error', children, testID }: { tone?: 'error' | 'info'; children: string; testID?: string }) {
+  const colors = useColors();
+  const color = tone === 'error' ? colors.destructive : colors.foreground;
+  return (
+    <View style={styles.row} accessibilityLiveRegion="polite" testID={testID}>
+      <Feather accessible={false} name={tone === 'error' ? 'alert-circle' : 'info'} size={18} color={color} />
+      <Text allowFontScaling style={[styles.text, { color }]}>{children}</Text>
+    </View>
+  );
+}
+
+const styles = StyleSheet.create({
+  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
+  text: { flex: 1, fontSize: 15, lineHeight: 22 },
+});
diff --git a/artifacts/crewtally-mobile/components/Page.tsx b/artifacts/crewtally-mobile/components/Page.tsx
new file mode 100644
index 0000000..c71c005
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/Page.tsx
@@ -0,0 +1,20 @@
+import React, { type ReactNode } from 'react';
+import { Platform, StyleSheet } from 'react-native';
+import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
+import { useColors } from '@/hooks/useColors';
+
+/** Scroll container for stack screens that have a navigation header. */
+export function Page({ children }: { children: ReactNode }) {
+  const colors = useColors();
+  return (
+    <KeyboardAwareScrollViewCompat
+      style={{ backgroundColor: colors.background }}
+      contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingBottom: 34 }]}
+      keyboardShouldPersistTaps="handled"
+    >
+      {children}
+    </KeyboardAwareScrollViewCompat>
+  );
+}
+
+const styles = StyleSheet.create({ content: { padding: 20, gap: 16, flexGrow: 1 } });
diff --git a/artifacts/crewtally-mobile/components/Screen.tsx b/artifacts/crewtally-mobile/components/Screen.tsx
index 0022197..c0e9d94 100644
--- a/artifacts/crewtally-mobile/components/Screen.tsx
+++ b/artifacts/crewtally-mobile/components/Screen.tsx
@@ -8,14 +8,17 @@ import {
 } from 'react-native';
 import { SafeAreaView } from 'react-native-safe-area-context';
 import { useColors } from '@/hooks/useColors';
+import { WorkspaceHeader } from '@/components/WorkspaceHeader';
 
 export interface ScreenProps {
   title: string;
   children: ReactNode;
   contentStyle?: ViewStyle;
+  /** Show the current workspace and role above the title (workspace routes). */
+  workspaceHeader?: boolean;
 }
 
-export function Screen({ title, children, contentStyle }: ScreenProps) {
+export function Screen({ title, children, contentStyle, workspaceHeader }: ScreenProps) {
   const colors = useColors();
   return (
     <SafeAreaView
@@ -26,6 +29,7 @@ export function Screen({ title, children, contentStyle }: ScreenProps) {
         contentContainerStyle={[styles.content, contentStyle]}
         keyboardShouldPersistTaps="handled"
       >
+        {workspaceHeader ? <WorkspaceHeader /> : null}
         <View style={styles.heading}>
           <Text
             accessibilityRole="header"
diff --git a/artifacts/crewtally-mobile/components/WorkspaceHeader.tsx b/artifacts/crewtally-mobile/components/WorkspaceHeader.tsx
new file mode 100644
index 0000000..be89e58
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/WorkspaceHeader.tsx
@@ -0,0 +1,38 @@
+import React from 'react';
+import { Pressable, StyleSheet, Text, View } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useRouter } from 'expo-router';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { kindLabel, roleLabel } from '@/lib/roles';
+
+/** Shown at the top of workspace routes: which workspace, and your role in it. */
+export function WorkspaceHeader() {
+  const colors = useColors();
+  const router = useRouter();
+  const { workspace } = useWorkspace();
+  if (!workspace) return null;
+  const detail = `${kindLabel(workspace.kind)} · ${roleLabel(workspace.role)}`;
+  return (
+    <Pressable
+      accessibilityRole="button"
+      accessibilityLabel={`Workspace ${workspace.name}, ${detail}. Switch workspace`}
+      testID="workspace-header"
+      onPress={() => router.push('/switcher' as never)}
+      style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}
+    >
+      <View style={styles.text}>
+        <Text allowFontScaling numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{workspace.name}</Text>
+        <Text allowFontScaling style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>
+      </View>
+      <Feather accessible={false} name="chevron-down" size={20} color={colors.mutedForeground} />
+    </Pressable>
+  );
+}
+
+const styles = StyleSheet.create({
+  bar: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
+  text: { flex: 1 },
+  name: { fontSize: 16, fontWeight: '600' },
+  detail: { fontSize: 14 },
+});
diff --git a/artifacts/crewtally-mobile/components/WorkspaceList.tsx b/artifacts/crewtally-mobile/components/WorkspaceList.tsx
new file mode 100644
index 0000000..a2eec12
--- /dev/null
+++ b/artifacts/crewtally-mobile/components/WorkspaceList.tsx
@@ -0,0 +1,85 @@
+import React, { useState } from 'react';
+import { Pressable, StyleSheet, Text, View } from 'react-native';
+import { Feather } from '@expo/vector-icons';
+import { useRouter } from 'expo-router';
+import { Card } from '@/components/Card';
+import { Notice } from '@/components/Notice';
+import { PrimaryButton } from '@/components/PrimaryButton';
+import { SecondaryButton } from '@/components/SecondaryButton';
+import { useAuth } from '@/contexts/AuthContext';
+import { useWorkspace } from '@/contexts/WorkspaceContext';
+import { useColors } from '@/hooks/useColors';
+import { kindLabel, roleLabel } from '@/lib/roles';
+
+/** The workspace switcher. Switching clears in-memory screens and reloads from the API. */
+export function WorkspaceList({ onSwitched }: { onSwitched?: () => void }) {
+  const colors = useColors();
+  const router = useRouter();
+  const { workspaces } = useAuth();
+  const { workspaceId, switchTo } = useWorkspace();
+  const [error, setError] = useState<string | null>(null);
+  const list = workspaces ?? [];
+
+  const pick = async (id: string) => {
+    setError(null);
+    if (id === workspaceId) { onSwitched?.(); return; }
+    await switchTo(id);
+    onSwitched?.();
+  };
+
+  return (
+    <View style={styles.wrap}>
+      {list.length === 0 ? (
+        <Card>
+          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>No workspaces</Text>
+          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+            Your account is still here. Create a Home workspace, or join a team with an invitation.
+          </Text>
+        </Card>
+      ) : (
+        <Card>
+          {list.map((w) => {
+            const current = w.id === workspaceId;
+            return (
+              <Pressable
+                key={w.id}
+                accessibilityRole="button"
+                accessibilityState={{ selected: current }}
+                accessibilityLabel={`${w.name}, ${kindLabel(w.kind)}, ${roleLabel(w.role)}${current ? ', current' : ''}`}
+                testID={`workspace-row-${w.id}`}
+                onPress={() => void pick(w.id)}
+                style={styles.row}
+              >
+                <View style={styles.rowText}>
+                  <Text allowFontScaling style={[styles.name, { color: colors.foreground }]}>{w.name}</Text>
+                  <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
+                    {kindLabel(w.kind)} · {roleLabel(w.role)}
+                  </Text>
+                </View>
+                {current ? (
+                  <View style={styles.current}>
+                    <Feather accessible={false} name="check" size={18} color={colors.primary} />
+                    <Text allowFontScaling style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Current</Text>
+                  </View>
+                ) : null}
+              </Pressable>
+            );
+          })}
+        </Card>
+      )}
+      {error ? <Notice>{error}</Notice> : null}
+      <PrimaryButton label="Create a Home workspace" testID="switcher-create" onPress={() => router.push('/create-workspace' as never)} />
+      <SecondaryButton label="Join a team" testID="switcher-join" onPress={() => router.push('/join' as never)} />
+    </View>
+  );
+}
+
+const styles = StyleSheet.create({
+  wrap: { gap: 16 },
+  title: { fontSize: 20, fontWeight: '600' },
+  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
+  rowText: { flex: 1 },
+  name: { fontSize: 16, fontWeight: '600' },
+  body: { fontSize: 15, lineHeight: 22 },
+  current: { flexDirection: 'row', alignItems: 'center', gap: 4 },
+});
diff --git a/artifacts/crewtally-mobile/constants/colors.ts b/artifacts/crewtally-mobile/constants/colors.ts
index f1c5763..1799572 100644
--- a/artifacts/crewtally-mobile/constants/colors.ts
+++ b/artifacts/crewtally-mobile/constants/colors.ts
@@ -1,47 +1,49 @@
 const colors = {
   light: {
-    text: '#17212B',
-    tint: '#0F766E',
-    background: '#F7F8FA',
-    foreground: '#17212B',
-    card: '#FFFFFF',
-    cardForeground: '#17212B',
-    primary: '#0F766E',
+    text: '#15362f',
+    tint: '#086b60',
+    background: '#f6f8f5',
+    foreground: '#15362f',
+    card: '#ffffff',
+    cardForeground: '#15362f',
+    primary: '#086b60',
     primaryForeground: '#ffffff',
-    secondary: '#EEF1F3',
-    secondaryForeground: '#17212B',
-    muted: '#EEF1F3',
-    mutedForeground: '#596673',
-    accent: '#E6F3F1',
-    accentForeground: '#0F766E',
-    destructive: '#B42318',
+    secondary: '#e6f2eb',
+    secondaryForeground: '#15362f',
+    muted: '#e6f2eb',
+    mutedForeground: '#5a6d64',
+    accent: '#e6f2eb',
+    accentForeground: '#15362f',
+    destructive: '#a8372d',
     destructiveForeground: '#ffffff',
-    border: '#D7DDE2',
-    input: '#D7DDE2',
-    warning: '#8A4B08',
-    warningSurface: '#FFF4DB',
+    border: '#dce5df',
+    input: '#7f938a',
+    copper: '#a36036',
+    warning: '#80541f',
+    warningSurface: '#faf0df',
   },
   dark: {
-    text: '#F1F5F7',
-    tint: '#5CC7B8',
-    background: '#11181D',
-    foreground: '#F1F5F7',
-    card: '#1B252B',
-    cardForeground: '#F1F5F7',
-    primary: '#5CC7B8',
-    primaryForeground: '#10211F',
-    secondary: '#263239',
-    secondaryForeground: '#F1F5F7',
-    muted: '#263239',
-    mutedForeground: '#B0BDC4',
-    accent: '#193A37',
-    accentForeground: '#7ED8CB',
-    destructive: '#FF756B',
-    destructiveForeground: '#27110F',
-    border: '#35434A',
-    input: '#35434A',
-    warning: '#F3C66B',
-    warningSurface: '#382D19',
+    text: '#eef7f1',
+    tint: '#8cddc0',
+    background: '#11201c',
+    foreground: '#eef7f1',
+    card: '#1b2b25',
+    cardForeground: '#eef7f1',
+    primary: '#8cddc0',
+    primaryForeground: '#11201c',
+    secondary: '#273f34',
+    secondaryForeground: '#eef7f1',
+    muted: '#273f34',
+    mutedForeground: '#b0c4b8',
+    accent: '#273f34',
+    accentForeground: '#eef7f1',
+    destructive: '#ffaba1',
+    destructiveForeground: '#11201c',
+    border: '#3b5147',
+    input: '#6f8a7e',
+    copper: '#e3a27a',
+    warning: '#f7d396',
+    warningSurface: '#40311e',
   },
   spacing: {
     xs: 4,
diff --git a/artifacts/crewtally-mobile/contexts/AuthContext.tsx b/artifacts/crewtally-mobile/contexts/AuthContext.tsx
index c939f1b..dc6a76a 100644
--- a/artifacts/crewtally-mobile/contexts/AuthContext.tsx
+++ b/artifacts/crewtally-mobile/contexts/AuthContext.tsx
@@ -11,23 +11,28 @@ import React, {
 import * as AppleAuthentication from 'expo-apple-authentication';
 import Constants from 'expo-constants';
 import { useQueryClient } from '@tanstack/react-query';
-import { getMe, signInWithApple, signOut as signOutRequest } from '@workspace/api-client-react';
+import { signInWithApple, signOut as signOutRequest } from '@workspace/api-client-react';
+import { getMe, type MeResponse, type MyWorkspace } from '@/lib/mobileApi';
 import { createNoncePair } from '@/lib/appleNonce';
 import { setUnauthorizedListener } from '@/lib/authEvents';
 import { clearToken, loadToken, peekToken, saveToken } from '@/lib/sessionStore';
 
 export type AuthStatus = 'restoring' | 'retry' | 'signedOut' | 'signedIn';
-export interface AuthWorkspace { id: string; name: string; currency: string; locale: string }
+export type AuthWorkspace = MyWorkspace;
+export type AuthProfile = MeResponse['user'];
 
 export const SIGN_IN_AGAIN_NOTICE = 'Please sign in again';
 
 export type SignInResult = 'ok' | 'cancelled' | 'failed';
 export type SignOutResult = 'ok' | 'failed';
-export type DeveloperSignInLabel = 'owner-a' | 'owner-b';
+export type DeveloperSignInLabel = 'owner-a' | 'owner-b' | 'member-c' | 'member-d';
 
 interface AuthValue {
   status: AuthStatus;
-  workspace: AuthWorkspace | null;
+  /** Workspaces this person belongs to; null until GET /v1/me has answered. */
+  workspaces: AuthWorkspace[] | null;
+  profile: AuthProfile | null;
+  refreshMe: () => Promise<MeResponse | null>;
   userId: string | null;
   notice: string | null;
   message: string | null;
@@ -59,7 +64,7 @@ function safeSignInMessage(e: unknown): string {
 export function AuthProvider({ children }: { children: ReactNode }) {
   const queryClient = useQueryClient();
   const [status, setStatus] = useState<AuthStatus>('restoring');
-  const [workspace, setWorkspace] = useState<AuthWorkspace | null>(null);
+  const [me, setMe] = useState<MeResponse | null>(null);
   const [userId, setUserId] = useState<string | null>(null);
   const [notice, setNotice] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);
@@ -128,7 +133,7 @@ export function AuthProvider({ children }: { children: ReactNode }) {
       setNotice(SIGN_IN_AGAIN_NOTICE);
       setMessage(null);
       const clearing = clearToken(); // cached token is dropped synchronously
-      setWorkspace(null);
+      setMe(null);
       setUserId(null);
       ownerRef.current = null;
       await runCleanup(clearing);
@@ -169,7 +174,7 @@ export function AuthProvider({ children }: { children: ReactNode }) {
       const me = await getMe();
       if (gen !== generation.current || peekToken() !== token) return; // superseded by a newer sign-in
       ownerRef.current = me.user.id;
-      setWorkspace(me.workspace);
+      setMe(me);
       setUserId(me.user.id);
       setStatus('signedIn');
     } catch (e) {
@@ -211,7 +216,7 @@ export function AuthProvider({ children }: { children: ReactNode }) {
     }
     pendingOwner.current = null;
     ownerRef.current = result.user.id;
-    setWorkspace(result.workspace);
+    setMe(null); // the workspace provider loads GET /v1/me; sign-in itself creates no workspace
     setUserId(result.user.id);
     setNotice(null);
     setStatus('signedIn');
@@ -318,7 +323,7 @@ export function AuthProvider({ children }: { children: ReactNode }) {
     setPendingRoute(null);
     ownerRef.current = null;
     setNotice(null);
-    setWorkspace(null);
+    setMe(null);
     setUserId(null);
     setStatus('signedOut');
     const ok = await runCleanup(clearToken());
@@ -326,8 +331,21 @@ export function AuthProvider({ children }: { children: ReactNode }) {
     return ok ? 'ok' : 'failed';
   }, [runCleanup]);
 
+  const refreshMe = useCallback(async (): Promise<MeResponse | null> => {
+    const gen = generation.current;
+    const token = peekToken();
+    const owner = ownerRef.current;
+    if (!token || !owner) return null;
+    const fresh = await getMe();
+    if (gen !== generation.current || peekToken() !== token || ownerRef.current !== owner || fresh.user.id !== owner) {
+      return null;
+    }
+    setMe(fresh);
+    return fresh;
+  }, []);
+
   const rememberRoute = useCallback((path: string) => {
-    if (path && !path.startsWith('/sign-in')) lastRoute.current = path;
+    if (path && !path.startsWith('/sign-in') && path !== '/start') lastRoute.current = path;
   }, []);
 
   const consumePendingRoute = useCallback(() => {
@@ -339,10 +357,10 @@ export function AuthProvider({ children }: { children: ReactNode }) {
 
   const value = useMemo<AuthValue>(
     () => ({
-      status, workspace, userId, notice, message, busy, pendingRoute,
+      status, workspaces: me ? me.workspaces : null, profile: me ? me.user : null, refreshMe, userId, notice, message, busy, pendingRoute,
       signIn, developerSignIn, signOut, retryRestore: () => void restore(), rememberRoute, consumePendingRoute,
     }),
-    [status, workspace, userId, notice, message, busy, pendingRoute, signIn, developerSignIn, signOut, restore, rememberRoute, consumePendingRoute],
+    [status, me, refreshMe, userId, notice, message, busy, pendingRoute, signIn, developerSignIn, signOut, restore, rememberRoute, consumePendingRoute],
   );
 
   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
diff --git a/artifacts/crewtally-mobile/contexts/WorkspaceContext.tsx b/artifacts/crewtally-mobile/contexts/WorkspaceContext.tsx
new file mode 100644
index 0000000..fa881ed
--- /dev/null
+++ b/artifacts/crewtally-mobile/contexts/WorkspaceContext.tsx
@@ -0,0 +1,223 @@
+import { AppState } from 'react-native';
+import React, {
+  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
+} from 'react';
+import { useQueryClient } from '@tanstack/react-query';
+import { useAuth } from '@/contexts/AuthContext';
+import {
+  createWorkspace, getWorkspace, setActiveWorkspaceId, setWorkspaceGoneListener,
+  type Role, type WorkspaceDetail, type WorkspaceKind,
+} from '@/lib/mobileApi';
+import { dropSavedWorkspaceId, loadSavedWorkspaceId, saveWorkspaceId } from '@/lib/workspaceStore';
+
+export type WorkspacePhase = 'loading' | 'switching' | 'ready' | 'removed' | 'switcher' | 'none' | 'error';
+
+interface WorkspaceValue {
+  phase: WorkspacePhase;
+  workspaceId: string | null;
+  workspace: WorkspaceDetail | null;
+  kind: WorkspaceKind | null;
+  role: Role | null;
+  can: Record<string, boolean>;
+  error: string | null;
+  switchTo: (id: string) => Promise<void>;
+  /** Create a Home workspace and open it. Returns the new id. */
+  createHome: (name: string, timezone: string, operationId: string) => Promise<string>;
+  /** After accepting an invitation: reload the list and open that workspace. */
+  openJoined: (id: string) => Promise<void>;
+  /** After leaving: forget the current workspace and show the switcher. */
+  afterLeaving: () => Promise<void>;
+  acknowledgeRemoved: () => void;
+  retry: () => void;
+}
+
+const WorkspaceContext = createContext<WorkspaceValue | null>(null);
+const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
+
+export function WorkspaceProvider({ children }: { children: ReactNode }) {
+  const { status, userId, workspaces, refreshMe } = useAuth();
+  const queryClient = useQueryClient();
+  const [phase, setPhase] = useState<WorkspacePhase>('loading');
+  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
+  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
+  const [error, setError] = useState<string | null>(null);
+
+  const token = useRef(0); // bumps on every open/reset; stale answers are ignored
+  const initializedFor = useRef<string | null>(null);
+  const userRef = useRef<string | null>(null);
+  userRef.current = userId;
+  const queryClientRef = useRef(queryClient);
+  queryClientRef.current = queryClient;
+  const refreshRef = useRef(refreshMe);
+  refreshRef.current = refreshMe;
+  const currentRef = useRef<string | null>(null);
+
+  const clearScreens = useCallback(async () => {
+    await queryClientRef.current.cancelQueries();
+    queryClientRef.current.clear();
+  }, []);
+
+  const forget = useCallback(() => {
+    setActiveWorkspaceId(null);
+    currentRef.current = null;
+    setWorkspaceId(null);
+    setWorkspace(null);
+  }, []);
+
+  const open = useCallback(async (id: string, opts?: { clear?: boolean }) => {
+    const t = ++token.current;
+    const owner = userRef.current;
+    if (opts?.clear !== false) await clearScreens();
+    if (t !== token.current) return;
+    setActiveWorkspaceId(id);
+    currentRef.current = id;
+    setWorkspaceId(id);
+    setWorkspace(null);
+    setError(null);
+    setPhase((p) => (p === 'ready' || p === 'switching' ? 'switching' : 'loading'));
+    try {
+      const detail = await getWorkspace();
+      if (t !== token.current) return;
+      setWorkspace(detail);
+      if (owner) void saveWorkspaceId(owner, id);
+      setPhase('ready');
+    } catch (e) {
+      if (t !== token.current) return;
+      if (statusOf(e) === 404) {
+        // No access any more. The same for removed and left; no names, nothing more to fetch.
+        if (owner) await dropSavedWorkspaceId(owner);
+        if (t !== token.current) return;
+        forget();
+        setPhase('removed');
+        void refreshRef.current().catch(() => undefined);
+        return;
+      }
+      setError('Could not open this workspace. Check your connection and try again.');
+      setPhase('error');
+    }
+  }, [clearScreens, forget]);
+
+  // Freshness: someone else may remove this person while the app stays open. Re-check quietly when the
+  // app returns to the foreground, every minute, and whenever any workspace route answers 404.
+  const phaseRef = useRef<WorkspacePhase>('loading');
+  phaseRef.current = phase;
+  const revalidating = useRef(false);
+  const revalidate = useCallback(async () => {
+    const id = currentRef.current;
+    const owner = userRef.current;
+    if (!id || !owner || phaseRef.current !== 'ready' || revalidating.current) return;
+    revalidating.current = true;
+    const t = token.current;
+    try {
+      const detail = await getWorkspace();
+      if (t !== token.current || currentRef.current !== id) return;
+      setWorkspace(detail);
+    } catch (e) {
+      if (t !== token.current || currentRef.current !== id) return;
+      if (statusOf(e) === 404) {
+        const removal = ++token.current;
+        await dropSavedWorkspaceId(owner);
+        if (token.current !== removal || currentRef.current !== id || userRef.current !== owner) return;
+        forget();
+        await clearScreens();
+        if (token.current !== removal || userRef.current !== owner) return;
+        setPhase('removed');
+        void refreshRef.current().catch(() => undefined);
+      }
+    } finally {
+      revalidating.current = false;
+    }
+  }, [forget, clearScreens]);
+
+  useEffect(() => {
+    if (status !== 'signedIn') return;
+    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void revalidate(); });
+    const timer = setInterval(() => { void revalidate(); }, 60000);
+    setWorkspaceGoneListener((id) => { if (id === currentRef.current) void revalidate(); });
+    return () => { sub.remove(); clearInterval(timer); setWorkspaceGoneListener(null); };
+  }, [status, revalidate]);
+
+  // Reset when the signed-in person changes or signs out.
+  useEffect(() => {
+    if (status === 'signedIn' && userId) return;
+    token.current += 1;
+    initializedFor.current = null;
+    forget();
+    setError(null);
+    setPhase('loading');
+  }, [status, userId, forget]);
+
+  // First load after sign-in: GET /v1/me, then the last used workspace, or the first.
+  useEffect(() => {
+    if (status !== 'signedIn' || !userId) return;
+    if (workspaces === null) {
+      refreshRef.current().catch(() => {
+        if (userRef.current === userId) { setError('Could not reach CrewTally. Check your connection and try again.'); setPhase('error'); }
+      });
+      return;
+    }
+    if (initializedFor.current === userId) return;
+    initializedFor.current = userId;
+    const list = workspaces;
+    void (async () => {
+      const saved = await loadSavedWorkspaceId(userId);
+      if (userRef.current !== userId) return;
+      if (saved && list.some((w) => w.id === saved)) await open(saved);
+      else if (saved) { // the saved workspace was removed while signed out
+        await dropSavedWorkspaceId(userId);
+        setPhase('removed');
+      } else if (list.length > 0) await open(list[0].id);
+      else setPhase('none');
+    })();
+  }, [status, userId, workspaces, open]);
+
+  const switchTo = useCallback(async (id: string) => { await open(id); }, [open]);
+
+  const openJoined = useCallback(async (id: string) => {
+    await refreshRef.current().catch(() => null);
+    await open(id);
+  }, [open]);
+
+  const createHome = useCallback(async (name: string, timezone: string, operationId: string) => {
+    const created = await createWorkspace({ kind: 'HOME', name, timezone }, operationId);
+    await refreshRef.current().catch(() => null);
+    await open(created.id);
+    return created.id;
+  }, [open]);
+
+  const afterLeaving = useCallback(async () => {
+    token.current += 1;
+    const owner = userRef.current;
+    if (owner) await dropSavedWorkspaceId(owner);
+    forget();
+    await clearScreens();
+    setPhase('switcher');
+    await refreshRef.current().catch(() => null);
+  }, [forget, clearScreens]);
+
+  const acknowledgeRemoved = useCallback(() => setPhase('switcher'), []);
+
+  const retry = useCallback(() => {
+    setError(null);
+    if (currentRef.current) { void open(currentRef.current, { clear: false }); return; }
+    initializedFor.current = null;
+    setPhase('loading');
+    refreshRef.current().catch(() => { setError('Could not reach CrewTally. Check your connection and try again.'); setPhase('error'); });
+  }, [open]);
+
+  const value = useMemo<WorkspaceValue>(() => ({
+    phase, workspaceId, workspace,
+    kind: workspace?.kind ?? null,
+    role: workspace?.role ?? null,
+    can: workspace?.can ?? {},
+    error, switchTo, createHome, openJoined, afterLeaving, acknowledgeRemoved, retry,
+  }), [phase, workspaceId, workspace, error, switchTo, createHome, openJoined, afterLeaving, acknowledgeRemoved, retry]);
+
+  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
+}
+
+export function useWorkspace(): WorkspaceValue {
+  const ctx = useContext(WorkspaceContext);
+  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
+  return ctx;
+}
diff --git a/artifacts/crewtally-mobile/lib/intent.ts b/artifacts/crewtally-mobile/lib/intent.ts
new file mode 100644
index 0000000..cb638b8
--- /dev/null
+++ b/artifacts/crewtally-mobile/lib/intent.ts
@@ -0,0 +1,4 @@
+// "Join my team" chosen before sign-in: remembered in memory, used once after sign-in.
+let joinAfterSignIn = false;
+export const setJoinAfterSignIn = (v: boolean) => { joinAfterSignIn = v; };
+export function consumeJoinAfterSignIn(): boolean { const v = joinAfterSignIn; joinAfterSignIn = false; return v; }
diff --git a/artifacts/crewtally-mobile/lib/mobileApi.ts b/artifacts/crewtally-mobile/lib/mobileApi.ts
new file mode 100644
index 0000000..9707c74
--- /dev/null
+++ b/artifacts/crewtally-mobile/lib/mobileApi.ts
@@ -0,0 +1,159 @@
+// Native API adapter: bearer sessions live in SecureStore and workspace headers
+// come from WorkspaceProvider. The matching contract lives in lib/api-spec/openapi.yaml.
+import { reportUnauthorized } from './authEvents';
+import { ApiError, ConflictError, NetworkError, ValidationError } from './api';
+import { peekToken } from './sessionStore';
+
+export type WorkspaceKind = 'HOME' | 'BUSINESS';
+export type Role = 'ORGANIZER' | 'PARTNER' | 'OWNER' | 'ADMIN' | 'LEAD' | 'WORKER';
+
+export interface MyWorkspace {
+  id: string;
+  name: string;
+  kind: WorkspaceKind;
+  role: Role;
+  financial_access: boolean | null;
+}
+export interface MeResponse {
+  user: { id: string; display_name: string | null; has_apple: boolean; email: string | null };
+  workspaces: MyWorkspace[];
+}
+export interface WorkspaceDetail {
+  id: string;
+  name: string;
+  kind: WorkspaceKind;
+  currency: string;
+  default_timezone: string | null;
+  role: Role;
+  financial_access: boolean | null;
+  worker_id: string | null;
+  can: Record<string, boolean>;
+}
+export interface Member {
+  user_id: string;
+  display_name: string | null;
+  name: string | null;
+  role: Role;
+  financial_access: boolean | null;
+  joined_at: string;
+  email?: string | null;
+}
+export interface Invitation {
+  id: string;
+  invitee_name: string | null;
+  email: string;
+  role: Role;
+  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' | 'DECLINED' | string;
+  expires_at: string;
+}
+export interface CreatedInvitation {
+  id: string;
+  token: string | null;
+  code: string | null;
+  link: string | null;
+  already_created?: boolean;
+  email?: string;
+  expires_at?: string;
+}
+export interface AcceptResult { workspace_id: string; role: Role; already_member?: boolean }
+export interface PeekResult { available: boolean; workspace_name?: string; role?: Role }
+
+// ---- the current workspace: one place, set by WorkspaceProvider ----
+let activeWorkspaceId: string | null = null;
+export function setActiveWorkspaceId(id: string | null): void { activeWorkspaceId = id; }
+export function getActiveWorkspaceId(): string | null { return activeWorkspaceId; }
+
+type GoneListener = (workspaceId: string) => void;
+let goneListener: GoneListener | null = null;
+/** WorkspaceProvider hears about a 404 on any workspace route: access was removed. */
+export function setWorkspaceGoneListener(l: GoneListener | null): void { goneListener = l; }
+
+function baseUrl(): string {
+  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
+  if (!domain) {
+    throw new ApiError({ kind: 'configuration', code: 'API_DOMAIN_MISSING', message: 'The API domain is not configured for this app.' });
+  }
+  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/api/v1`;
+}
+
+interface Options {
+  body?: unknown;
+  /** Adds X-Workspace-Id from the current workspace. */
+  workspace?: boolean;
+  /** Public route: no bearer token. */
+  anonymous?: boolean;
+}
+
+async function toError(response: Response): Promise<ApiError> {
+  let body: { error?: unknown } = {};
+  try { body = (await response.json()) as typeof body; } catch { /* no JSON body */ }
+  const e = body.error;
+  const code = typeof e === 'string' ? e
+    : (e as { code?: string } | undefined)?.code ?? `HTTP_${response.status}`;
+  const message = (e as { message?: string } | undefined)?.message ?? `The server returned an error (${response.status}).`;
+  if (response.status === 409) return new ConflictError(code, message);
+  if (response.status === 422) return new ValidationError(code, message);
+  return new ApiError({ kind: 'http', status: response.status, code, message });
+}
+
+export async function request<T>(method: string, path: string, options: Options = {}): Promise<T> {
+  const headers: Record<string, string> = { Accept: 'application/json' };
+  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
+  const token = options.anonymous ? null : peekToken();
+  if (token) headers.Authorization = `Bearer ${token}`;
+  if (options.workspace) {
+    if (!activeWorkspaceId) {
+      throw new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'No workspace is open.' });
+    }
+    headers['X-Workspace-Id'] = activeWorkspaceId;
+  }
+  const sentFor = options.workspace ? activeWorkspaceId : null;
+  let response: Response;
+  try {
+    response = await fetch(`${baseUrl()}${path}`, {
+      method,
+      headers,
+      body: options.body === undefined ? undefined : JSON.stringify(options.body),
+    });
+  } catch (e) {
+    if (e instanceof ApiError) throw e;
+    throw new NetworkError();
+  }
+  if (!response.ok) {
+    if (response.status === 401 && token) reportUnauthorized({ token });
+    if (response.status === 404 && sentFor && path !== '/workspace') goneListener?.(sentFor);
+    throw await toError(response);
+  }
+  if (response.status === 204) return undefined as T;
+  return (await response.json()) as T;
+}
+
+// ---- reads ----
+export const getConfig = () => request<{ business_enabled: boolean }>('GET', '/config', { anonymous: true });
+export const getMe = () => request<MeResponse>('GET', '/me');
+export const getWorkspace = () => request<WorkspaceDetail>('GET', '/workspace', { workspace: true });
+export const getMembers = () => request<{ members: Member[] }>('GET', '/members', { workspace: true });
+export const getInvitations = () => request<{ invitations: Invitation[] }>('GET', '/invitations', { workspace: true });
+
+// ---- writes: every one carries an operation_id made on the phone and kept through retries ----
+export const patchMe = (displayName: string, operationId: string) =>
+  request<unknown>('PATCH', '/me', { body: { display_name: displayName, operation_id: operationId } });
+export const createWorkspace = (
+  input: { kind: WorkspaceKind; name: string; timezone: string },
+  operationId: string,
+) => request<{ id: string; name: string; kind: WorkspaceKind }>('POST', '/workspaces', { body: { ...input, operation_id: operationId } });
+export const createInvitation = (
+  input: { role: Role; email: string; name?: string },
+  operationId: string,
+) => request<CreatedInvitation>('POST', '/invitations', { workspace: true, body: { ...input, operation_id: operationId } });
+// DELETE bodies carry the operation_id too, so a retry is recognised.
+export const revokeInvitation = (id: string, operationId: string) =>
+  request<unknown>('DELETE', `/invitations/${encodeURIComponent(id)}`, { workspace: true, body: { operation_id: operationId } });
+export const removeMember = (userId: string, operationId: string) =>
+  request<unknown>('DELETE', `/members/${encodeURIComponent(userId)}`, { workspace: true, body: { operation_id: operationId } });
+export const peekInvite = (token: string) =>
+  request<PeekResult>('POST', '/invite/peek', { anonymous: true, body: { token } });
+export const acceptInvite = (token: string, operationId: string) =>
+  request<AcceptResult>('POST', '/invite/accept', { body: { token, operation_id: operationId } });
+export const acceptInviteCode = (email: string, code: string, operationId: string) =>
+  request<AcceptResult>('POST', '/invite/accept-code', { body: { email, code, operation_id: operationId } });
diff --git a/artifacts/crewtally-mobile/lib/operation.ts b/artifacts/crewtally-mobile/lib/operation.ts
new file mode 100644
index 0000000..6276ee5
--- /dev/null
+++ b/artifacts/crewtally-mobile/lib/operation.ts
@@ -0,0 +1,30 @@
+import { useRef } from 'react';
+import * as Crypto from 'expo-crypto';
+
+export function newOperationId(): string {
+  return Crypto.randomUUID();
+}
+
+export interface OperationKeeper {
+  /** Same fingerprint (same request) returns the same operation_id, so a retry is never a second write. */
+  idFor(fingerprint: string): string;
+  /** Call after the write succeeded. */
+  done(): void;
+}
+
+export function createOperationKeeper(make: () => string = newOperationId): OperationKeeper {
+  let current: { fingerprint: string; id: string } | null = null;
+  return {
+    idFor(fingerprint) {
+      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, id: make() };
+      return current.id;
+    },
+    done() { current = null; },
+  };
+}
+
+export function useOperationKeeper(): OperationKeeper {
+  const ref = useRef<OperationKeeper | null>(null);
+  if (!ref.current) ref.current = createOperationKeeper();
+  return ref.current;
+}
diff --git a/artifacts/crewtally-mobile/lib/roles.ts b/artifacts/crewtally-mobile/lib/roles.ts
new file mode 100644
index 0000000..f09c833
--- /dev/null
+++ b/artifacts/crewtally-mobile/lib/roles.ts
@@ -0,0 +1,19 @@
+import type { Role, WorkspaceKind } from './mobileApi';
+
+const ROLE_LABEL: Record<Role, string> = {
+  ORGANIZER: 'Organizer', PARTNER: 'Partner', OWNER: 'Owner', ADMIN: 'Admin', LEAD: 'Crew lead', WORKER: 'Worker',
+};
+export const roleLabel = (r: Role | string): string => ROLE_LABEL[r as Role] ?? r;
+export const kindLabel = (k: WorkspaceKind): string => (k === 'HOME' ? 'Home' : 'Business');
+export const formatDate = (iso: string): string => {
+  const d = new Date(iso);
+  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
+};
+/** Pulls the token out of https://…/join/<token> (or a bare token). */
+export function tokenFromLink(input: string): string | null {
+  const t = input.trim();
+  if (!t) return null;
+  const m = /\/join\/([A-Za-z0-9_-]{20,})/.exec(t);
+  if (m) return m[1];
+  return /^[A-Za-z0-9_-]{32,}$/.test(t) ? t : null;
+}
diff --git a/artifacts/crewtally-mobile/lib/workspaceStore.ts b/artifacts/crewtally-mobile/lib/workspaceStore.ts
new file mode 100644
index 0000000..3243528
--- /dev/null
+++ b/artifacts/crewtally-mobile/lib/workspaceStore.ts
@@ -0,0 +1,14 @@
+import AsyncStorage from '@react-native-async-storage/async-storage';
+
+// Not secret: the id of the workspace last used, saved per user.
+const key = (userId: string) => `crewtally.workspace.v1.${userId}`;
+
+export async function loadSavedWorkspaceId(userId: string): Promise<string | null> {
+  try { return (await AsyncStorage.getItem(key(userId))) ?? null; } catch { return null; }
+}
+export async function saveWorkspaceId(userId: string, id: string): Promise<void> {
+  try { await AsyncStorage.setItem(key(userId), id); } catch { /* best effort */ }
+}
+export async function dropSavedWorkspaceId(userId: string): Promise<void> {
+  try { await AsyncStorage.removeItem(key(userId)); } catch { /* best effort */ }
+}
diff --git a/artifacts/crewtally-mobile/package.json b/artifacts/crewtally-mobile/package.json
index f03ea26..3d2d671 100644
--- a/artifacts/crewtally-mobile/package.json
+++ b/artifacts/crewtally-mobile/package.json
@@ -30,6 +30,7 @@
     "expo": "~57.0.26",
     "expo-apple-authentication": "57.0.2",
     "expo-blur": "~57.0.2",
+    "expo-clipboard": "~57.0.2",
     "expo-constants": "~57.0.20",
     "expo-crypto": "57.0.3",
     "expo-font": "~57.0.1",
@@ -66,6 +67,7 @@
   },
   "jest": {
     "preset": "jest-expo",
+    "setupFiles": ["<rootDir>/__tests__/setup/keyboard.js"],
     "testMatch": [
       "**/__tests__/**/*.test.[jt]s?(x)",
       "**/?(*.)+(spec|test).[jt]s?(x)"
diff --git a/db/migrations/0003_identity_and_memberships.sql b/db/migrations/0003_identity_and_memberships.sql
new file mode 100644
index 0000000..9b10056
--- /dev/null
+++ b/db/migrations/0003_identity_and_memberships.sql
@@ -0,0 +1,694 @@
+-- =====================================================================
+-- 0003 — Identity, workspaces, memberships, invitations, email codes,
+--        who-did-it (actor) on money rows.      Baseline 2.0, Phase 1b.
+-- Additive only. Loaded after 0001_schema.sql and 0002_auth.sql (built in Phase 1).
+--
+-- What changes:
+--  * One person can belong to several workspaces. A workspace is HOME or BUSINESS.
+--  * Roles live in memberships: HOME → ORGANIZER (one) and PARTNER (at most one);
+--    BUSINESS → OWNER (one), ADMIN (with or without money access), LEAD, WORKER.
+--  * workspaces.owner_id stays: it is the billing owner (the Home organizer or Business owner).
+--    It is no longer unique, so one person can own several workspaces.
+--  * A user signs in with Apple, with a verified email code, or both (linked).
+--  * Every money row records who wrote it (recorded_by), set from the transaction's actor.
+--  * Permission checks live in one place: role_can() / require_member().
+--
+-- Nothing here changes a money function, fn_earned or the ledger.
+-- =====================================================================
+
+-- ---------- users: email sign-in and a display name ----------
+alter table users alter column apple_sub drop not null;
+alter table users add column display_name text check (display_name is null or length(display_name) between 1 and 60);
+alter table users add column email text check (email is null or (email = lower(email) and position('@' in email) > 1 and length(email) <= 254));
+alter table users add column email_verified_at timestamptz;
+alter table users add constraint users_email_needs_verification check (email is null or email_verified_at is not null);
+alter table users add constraint users_has_identity check (deleted_at is not null or apple_sub is not null or email is not null);
+create unique index users_email_unique on users (email) where email is not null;
+
+-- ---------- sessions: phone app or web ----------
+alter table sessions add column client text not null default 'APP' check (client in ('APP','WEB'));
+alter table sessions add column csrf_hash bytea;   -- web sessions only (Phase 1c)
+alter table sessions add constraint sessions_web_has_csrf check (client = 'APP' or csrf_hash is not null);
+
+-- ---------- workspaces: several per person, two kinds ----------
+alter table workspaces drop constraint workspaces_owner_id_key;
+alter table workspaces add column kind text not null default 'HOME' check (kind in ('HOME','BUSINESS'));
+alter table workspaces add column default_timezone text;          -- default for NEW projects only (decision D9)
+create index workspaces_owner on workspaces (owner_id);
+
+create function trg_workspaces_kind_fixed() returns trigger language plpgsql as $$
+begin
+  if new.kind <> old.kind then
+    raise exception 'workspace kind cannot change' using errcode = '23514';
+  end if;
+  if new.owner_id <> old.owner_id then
+    raise exception 'billing owner cannot change here' using errcode = '23514';
+  end if;
+  return new;
+end $$;
+create trigger workspaces_kind_fixed before update on workspaces
+  for each row execute function trg_workspaces_kind_fixed();
+
+-- ---------- memberships ----------
+create table memberships (
+  id               uuid primary key default gen_random_uuid(),
+  workspace_id     uuid not null references workspaces(id) on delete cascade,
+  user_id          uuid not null references users(id),
+  role             text not null check (role in ('ORGANIZER','PARTNER','OWNER','ADMIN','LEAD','WORKER')),
+  financial_access boolean,                  -- ADMIN only: may see and record money
+  worker_id        uuid,                     -- LEAD (optional) / WORKER (required): their own worker record
+  status           text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED')),
+  invited_by       uuid references users(id),
+  created_at       timestamptz not null default now(),
+  removed_at       timestamptz,
+  removed_by       uuid references users(id),
+  unique (workspace_id, user_id),
+  check ((role = 'ADMIN') = (financial_access is not null)),
+  check (worker_id is null or role in ('LEAD','WORKER')),
+  check (role <> 'WORKER' or worker_id is not null),
+  check ((status = 'REMOVED') = (removed_at is not null)),
+  foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade
+);
+create unique index memberships_one_principal on memberships (workspace_id)
+  where role in ('ORGANIZER','OWNER') and status = 'ACTIVE';
+create unique index memberships_one_partner on memberships (workspace_id)
+  where role = 'PARTNER' and status = 'ACTIVE';
+create unique index memberships_one_login_per_worker on memberships (workspace_id, worker_id)
+  where worker_id is not null and status = 'ACTIVE';
+create index memberships_by_user on memberships (user_id) where status = 'ACTIVE';
+
+-- Roles must fit the workspace kind; the principal is the billing owner and can't be removed or demoted.
+create function trg_memberships_rules() returns trigger language plpgsql as $$
+declare v_kind text; v_owner uuid;
+begin
+  select kind, owner_id into v_kind, v_owner from workspaces where id = new.workspace_id;
+  if v_kind = 'HOME' and new.role not in ('ORGANIZER','PARTNER') then
+    raise exception 'role % does not fit a Home workspace', new.role using errcode = '23514';
+  end if;
+  if v_kind = 'BUSINESS' and new.role not in ('OWNER','ADMIN','LEAD','WORKER') then
+    raise exception 'role % does not fit a Business workspace', new.role using errcode = '23514';
+  end if;
+  if new.role in ('ORGANIZER','OWNER') and new.user_id <> v_owner then
+    raise exception 'the principal must be the billing owner' using errcode = '23514';
+  end if;
+  if tg_op = 'UPDATE' then
+    if old.role in ('ORGANIZER','OWNER') and (new.role <> old.role or new.status <> 'ACTIVE') then
+      raise exception 'the organizer or owner cannot be removed or demoted' using errcode = '23514';
+    end if;
+    if new.role in ('ORGANIZER','OWNER') and old.role not in ('ORGANIZER','OWNER') then
+      raise exception 'ownership cannot be transferred here' using errcode = '23514';
+    end if;
+    if new.user_id <> old.user_id or new.workspace_id <> old.workspace_id then
+      raise exception 'membership identity cannot change' using errcode = '23514';
+    end if;
+  end if;
+  return new;
+end $$;
+create trigger memberships_rules before insert or update on memberships
+  for each row execute function trg_memberships_rules();
+
+-- Existing Phase 1 workspaces: their owner becomes the Home organizer.
+insert into memberships (workspace_id, user_id, role)
+select w.id, w.owner_id, 'ORGANIZER'
+from workspaces w join users u on u.id = w.owner_id
+where u.deleted_at is null
+on conflict do nothing;
+
+-- ---------- permissions: the one place roles are turned into rights ----------
+-- Lead and worker scoping (own jobs, own records) is applied by the API on top of this (Business phases).
+create function role_can(p_role text, p_financial boolean, p_action text) returns boolean
+language plpgsql immutable as $$
+declare money boolean := p_role in ('ORGANIZER','PARTNER','OWNER') or (p_role = 'ADMIN' and coalesce(p_financial,false));
+begin
+  return case p_action
+    when 'workspace.read'  then true
+    when 'work.record'     then true
+    when 'work.approve'    then p_role in ('OWNER','ADMIN')
+    when 'money.view'      then money
+    when 'money.record'    then money
+    when 'rates.set'       then p_role in ('ORGANIZER','OWNER') or (p_role = 'ADMIN' and coalesce(p_financial,false))
+    when 'people.add'      then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
+    when 'people.remove'   then p_role in ('ORGANIZER','OWNER','ADMIN')
+    when 'projects.manage' then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
+    when 'crew.private'    then p_role in ('ORGANIZER','PARTNER','OWNER','ADMIN')
+    when 'members.manage'  then p_role in ('ORGANIZER','OWNER','ADMIN')
+    when 'plan.manage'     then p_role in ('ORGANIZER','OWNER')
+    when 'settings.edit'   then p_role in ('ORGANIZER','OWNER')
+    when 'export'          then money
+    when 'account.delete_workspace' then p_role in ('ORGANIZER','OWNER')
+    else null end
+  ;
+end $$;
+
+-- Raises for an unknown action so a typo can never quietly grant or deny.
+create function member_can(p_workspace uuid, p_user uuid, p_action text) returns boolean
+language plpgsql stable security definer as $$
+declare m record; r boolean;
+begin
+  if role_can('OWNER', true, p_action) is null then
+    raise exception 'unknown action %', p_action using errcode = '22023';
+  end if;
+  select ms.role, ms.financial_access into m
+  from memberships ms join users u on u.id = ms.user_id
+  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
+  if not found then return false; end if;
+  return role_can(m.role, m.financial_access, p_action);
+end $$;
+
+-- The single door for every API request that touches a workspace.
+-- Not a member (or removed, or deleted user) → CT404 (the API answers 404 and never says the workspace exists).
+-- Member without the right → CT403 (the API answers 403 FORBIDDEN).
+-- On success it records the actor for this transaction, so every money row gets recorded_by.
+create function require_member(p_workspace uuid, p_user uuid, p_action text) returns jsonb
+language plpgsql security definer as $$
+declare m record;
+begin
+  if role_can('OWNER', true, p_action) is null then
+    raise exception 'unknown action %', p_action using errcode = '22023';
+  end if;
+  select ms.role, ms.financial_access, ms.worker_id, w.kind into m
+  from memberships ms
+  join users u on u.id = ms.user_id
+  join workspaces w on w.id = ms.workspace_id
+  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
+  if not found then
+    raise exception 'not a member' using errcode = 'CT404';
+  end if;
+  if not role_can(m.role, m.financial_access, p_action) then
+    raise exception 'not allowed' using errcode = 'CT403';
+  end if;
+  perform set_config('crewtally.actor', p_user::text, true);
+  return jsonb_build_object('role', m.role, 'financial_access', m.financial_access,
+                            'worker_id', m.worker_id, 'kind', m.kind);
+end $$;
+
+-- All rights for the signed-in person in one workspace (the apps use it to shape screens; the server still checks).
+create function member_permissions(p_workspace uuid, p_user uuid) returns jsonb
+language plpgsql stable security definer as $$
+declare m record; acts text[] := array['workspace.read','work.record','work.approve','money.view','money.record',
+  'rates.set','people.add','people.remove','projects.manage','crew.private','members.manage','plan.manage',
+  'settings.edit','export','account.delete_workspace']; a text; out jsonb := '{}'::jsonb;
+begin
+  select ms.role, ms.financial_access, ms.worker_id, w.kind, w.name into m
+  from memberships ms join users u on u.id = ms.user_id join workspaces w on w.id = ms.workspace_id
+  where ms.workspace_id = p_workspace and ms.user_id = p_user and ms.status = 'ACTIVE' and u.deleted_at is null;
+  if not found then raise exception 'not a member' using errcode = 'CT404'; end if;
+  foreach a in array acts loop out := out || jsonb_build_object(a, role_can(m.role, m.financial_access, a)); end loop;
+  return jsonb_build_object('role', m.role, 'financial_access', m.financial_access, 'worker_id', m.worker_id,
+                            'kind', m.kind, 'name', m.name, 'can', out);
+end $$;
+
+-- ---------- who did it: recorded_by on every money and evidence row ----------
+create function trg_set_recorded_by() returns trigger language plpgsql as $$
+declare v uuid := nullif(current_setting('crewtally.actor', true), '')::uuid;
+begin
+  if v is not null then
+    if new.recorded_by is not null and new.recorded_by <> v then
+      raise exception 'recorded_by must be the signed-in person' using errcode = 'CT403';
+    end if;
+    new.recorded_by := v;
+  end if;
+  return new;
+end $$;
+
+do $$
+declare t text;
+begin
+  foreach t in array array['work_revisions','payments','reversals','reimbursements','adjustments',
+                           'rate_agreements','payment_signatures','receipts','statements','share_links','evidence',
+                           'day_reviews'] loop
+    execute format('alter table %I add column recorded_by uuid references users(id)', t);
+    execute format('create trigger %I before insert on %I for each row execute function trg_set_recorded_by()',
+                   t || '_recorded_by', t);
+  end loop;
+end $$;
+
+-- ---------- idempotency for session routes that have no workspace yet ----------
+-- (creating a workspace, accepting an invitation, linking a sign-in method). Same rules as idempotency_keys:
+-- same user + operation id → same response; same id with a different request → 409.
+create table user_idempotency_keys (
+  user_id      uuid not null references users(id),
+  operation_id uuid not null,
+  request_hash text not null,
+  response     jsonb not null,
+  created_at   timestamptz not null default now(),
+  primary key (user_id, operation_id)
+);
+
+-- ---------- workspace creation (sign-in no longer creates one) ----------
+create function create_workspace(p_user uuid, p_kind text, p_name text, p_currency char(3), p_timezone text)
+returns uuid language plpgsql security definer as $$
+declare v_id uuid;
+begin
+  if p_kind not in ('HOME','BUSINESS') then raise exception 'bad kind' using errcode = '22023'; end if;
+  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'bad name' using errcode = '22023'; end if;
+  if not exists (select 1 from users where id = p_user and deleted_at is null) then
+    raise exception 'user not found' using errcode = 'P0002'; end if;
+  if p_timezone is not null and not exists (select 1 from pg_timezone_names where name = p_timezone) then
+    raise exception 'bad time zone' using errcode = '22023'; end if;
+  insert into workspaces (owner_id, name, currency_code, kind, default_timezone)
+  values (p_user, btrim(p_name), coalesce(p_currency, 'USD'), p_kind, p_timezone)
+  returning id into v_id;
+  insert into memberships (workspace_id, user_id, role)
+  values (v_id, p_user, case p_kind when 'HOME' then 'ORGANIZER' else 'OWNER' end);
+  return v_id;
+end $$;
+
+-- ---------- invitations ----------
+create table invitations (
+  id               uuid primary key,                  -- generated by the API
+  workspace_id     uuid not null references workspaces(id) on delete cascade,
+  role             text not null check (role in ('PARTNER','ADMIN','LEAD','WORKER')),
+  financial_access boolean,
+  worker_id        uuid,
+  email            text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
+  invitee_name     text check (invitee_name is null or length(invitee_name) between 1 and 60),  -- the inviter's label, for their own list
+  token_hash       bytea not null unique,             -- sha256 of a 32-byte random token; the token is never stored
+  code_hash        bytea not null,                    -- HMAC-SHA256(CODE_PEPPER, email || ':' || 6-digit code), made by the API
+  status           text not null default 'PENDING'
+                   check (status in ('PENDING','ACCEPTED','REVOKED','DECLINED','EXPIRED')),
+  expires_at       timestamptz not null,
+  invited_by       uuid not null references users(id),
+  decided_by       uuid references users(id),
+  created_at       timestamptz not null default now(),
+  decided_at       timestamptz,
+  check ((role = 'ADMIN') = (financial_access is not null)),
+  check (worker_id is null or role in ('LEAD','WORKER')),
+  check (role <> 'WORKER' or worker_id is not null),
+  check ((status = 'PENDING') = (decided_at is null)),
+  foreign key (workspace_id, worker_id) references workers (workspace_id, id) on delete cascade
+);
+create unique index invitations_one_pending on invitations (workspace_id, email) where status = 'PENDING';
+create index invitations_by_email on invitations (email) where status = 'PENDING';
+
+-- Who may invite whom (doc 03): organizer → partner; owner → admin, lead, worker; admin → lead, worker.
+-- Only the owner may give money access.
+create function can_invite(p_actor_role text, p_role text, p_financial boolean) returns boolean
+language sql immutable as $$
+  select case
+    when p_actor_role = 'ORGANIZER' then p_role = 'PARTNER'
+    when p_actor_role = 'OWNER'     then p_role in ('ADMIN','LEAD','WORKER')
+    when p_actor_role = 'ADMIN'     then p_role in ('LEAD','WORKER')
+    else false end
+$$;
+
+create function create_invitation(p_workspace uuid, p_actor uuid, p_id uuid, p_role text, p_financial boolean,
+                                  p_worker uuid, p_email text, p_token_hash bytea, p_code_hash bytea,
+                                  p_invitee_name text default null)
+returns jsonb language plpgsql security definer as $$
+declare a record; v_kind text; v_email text := lower(btrim(p_email));
+begin
+  perform require_member(p_workspace, p_actor, 'members.manage');
+  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
+  select kind into v_kind from workspaces where id = p_workspace;
+  if not can_invite(a.role, p_role, p_financial) then
+    raise exception 'not allowed to invite this role' using errcode = 'CT403'; end if;
+  if (v_kind = 'HOME') <> (p_role = 'PARTNER') then
+    raise exception 'role does not fit this workspace' using errcode = '23514'; end if;
+  -- A login bound to a worker record sees that worker's earnings and receipts, so only someone
+  -- who may see money can create one.
+  if p_worker is not null and not member_can(p_workspace, p_actor, 'money.view') then
+    raise exception 'binding a worker record needs money access' using errcode = 'CT403'; end if;
+  if exists (select 1 from memberships m join users u on u.id = m.user_id
+             where m.workspace_id = p_workspace and m.status = 'ACTIVE' and u.email = v_email) then
+    raise exception 'already a member' using errcode = 'CT409'; end if;
+  if p_role = 'PARTNER' and exists (select 1 from memberships where workspace_id = p_workspace
+                                    and role = 'PARTNER' and status = 'ACTIVE') then
+    raise exception 'this workspace already has a partner' using errcode = 'CT409'; end if;
+  insert into invitations (id, workspace_id, role, financial_access, worker_id, email, invitee_name, token_hash, code_hash, expires_at, invited_by)
+  values (p_id, p_workspace, p_role, case when p_role = 'ADMIN' then coalesce(p_financial,false) end,
+          p_worker, v_email, nullif(btrim(p_invitee_name), ''), p_token_hash, p_code_hash, now() + interval '7 days', p_actor);
+  return jsonb_build_object('id', p_id, 'expires_at', now() + interval '7 days');
+exception when unique_violation then
+  raise exception 'an invitation is already pending for this email' using errcode = 'CT409';
+end $$;
+
+-- What a person sees BEFORE signing in: the workspace name and the role, nothing else.
+create function peek_invitation(p_token_hash bytea) returns jsonb
+language plpgsql security definer as $$
+declare i record;
+begin
+  select inv.status, inv.expires_at, inv.role, w.name into i
+  from invitations inv join workspaces w on w.id = inv.workspace_id where inv.token_hash = p_token_hash;
+  if not found or i.status <> 'PENDING' or i.expires_at <= now() then
+    return jsonb_build_object('available', false);      -- one answer for unknown, used, revoked and expired
+  end if;
+  return jsonb_build_object('available', true, 'workspace_name', i.name, 'role', i.role);
+end $$;
+
+create function join_from_invitation(p_inv invitations, p_user uuid) returns jsonb
+language plpgsql security definer as $$
+declare existing record; inviter record;
+begin
+  -- the person who invited must still be allowed to invite this role
+  select m.role into inviter from memberships m join users u on u.id = m.user_id
+   where m.workspace_id = p_inv.workspace_id and m.user_id = p_inv.invited_by and m.status = 'ACTIVE' and u.deleted_at is null;
+  if not found or not can_invite(inviter.role, p_inv.role, p_inv.financial_access)
+     or (p_inv.worker_id is not null and not member_can(p_inv.workspace_id, p_inv.invited_by, 'money.view')) then
+    update invitations set status = 'REVOKED', decided_at = now() where id = p_inv.id;
+    return jsonb_build_object('error', 'INVITATION_NOT_AVAILABLE');
+  end if;
+  select * into existing from memberships where workspace_id = p_inv.workspace_id and user_id = p_user;
+  if found and existing.status = 'ACTIVE' then
+    update invitations set status = 'ACCEPTED', decided_by = p_user, decided_at = now() where id = p_inv.id;
+    return jsonb_build_object('workspace_id', p_inv.workspace_id, 'role', existing.role, 'already_member', true);
+  elsif found then
+    update memberships set status = 'ACTIVE', role = p_inv.role, financial_access = p_inv.financial_access,
+           worker_id = p_inv.worker_id, invited_by = p_inv.invited_by, removed_at = null, removed_by = null
+    where id = existing.id;
+  else
+    insert into memberships (workspace_id, user_id, role, financial_access, worker_id, invited_by)
+    values (p_inv.workspace_id, p_user, p_inv.role, p_inv.financial_access, p_inv.worker_id, p_inv.invited_by);
+  end if;
+  update invitations set status = 'ACCEPTED', decided_by = p_user, decided_at = now() where id = p_inv.id;
+  return jsonb_build_object('workspace_id', p_inv.workspace_id, 'role', p_inv.role, 'already_member', false);
+exception when unique_violation then
+  -- a partner already joined, or that worker record already has a login
+  raise exception 'this place is already taken' using errcode = 'CT409';
+end $$;
+
+-- Accept with the link token (the person has signed in first).
+create function accept_invitation(p_user uuid, p_token_hash bytea) returns jsonb
+language plpgsql security definer as $$
+declare inv invitations;
+begin
+  if not exists (select 1 from users where id = p_user and deleted_at is null) then
+    raise exception 'user not found' using errcode = 'P0002'; end if;
+  select * into inv from invitations where token_hash = p_token_hash for update;
+  if not found or inv.status <> 'PENDING' then
+    raise exception 'invitation not available' using errcode = 'CT410'; end if;
+  if inv.expires_at <= now() then
+    update invitations set status = 'EXPIRED', decided_at = now() where id = inv.id;
+    return jsonb_build_object('error', 'INVITATION_NOT_AVAILABLE');
+  end if;
+  return join_from_invitation(inv, p_user);
+end $$;
+
+-- Wrong-code attempts are counted per signed-in person and email, so a stranger's guesses
+-- can never lock or change someone else's invitation.
+create table invitation_code_attempts (
+  user_id      uuid not null references users(id),
+  email        text not null,
+  window_start timestamptz not null default now(),
+  attempts     smallint not null default 0,
+  primary key (user_id, email)
+);
+
+-- Accept with email + 6-digit code (when the link won't open on this device).
+-- Five wrong codes in 24 hours stop that person trying codes for that email.
+create function accept_invitation_code(p_user uuid, p_email text, p_code_hash bytea) returns jsonb
+language plpgsql security definer as $$
+declare inv invitations; v_email text := lower(btrim(p_email)); a record;
+begin
+  if not exists (select 1 from users where id = p_user and deleted_at is null) then
+    raise exception 'user not found' using errcode = 'P0002'; end if;
+  insert into invitation_code_attempts (user_id, email) values (p_user, v_email) on conflict do nothing;
+  select * into a from invitation_code_attempts where user_id = p_user and email = v_email for update;
+  if a.window_start < now() - interval '24 hours' then
+    update invitation_code_attempts set window_start = now(), attempts = 0 where user_id = p_user and email = v_email;
+    a.attempts := 0;
+  end if;
+  if a.attempts >= 5 then
+    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');      -- same answer; no more checking today
+  end if;
+  -- across everyone: after 20 wrong tries for this email in 24 hours the CODE path is off for that email
+  -- (the link keeps working), so many throwaway accounts can't add up to a real chance of guessing.
+  if (select coalesce(sum(attempts), 0) from invitation_code_attempts
+       where email = v_email and window_start > now() - interval '24 hours') >= 20 then
+    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');
+  end if;
+  update invitations set status = 'EXPIRED', decided_at = now()
+   where email = v_email and status = 'PENDING' and expires_at <= now();
+  select * into inv from invitations
+   where email = v_email and status = 'PENDING' and code_hash = p_code_hash
+   order by created_at desc limit 1 for update;
+  if not found then
+    update invitation_code_attempts set attempts = attempts + 1 where user_id = p_user and email = v_email;
+    return jsonb_build_object('error', 'INVITATION_CODE_WRONG');
+  end if;
+  return join_from_invitation(inv, p_user);
+end $$;
+
+create function decline_invitation(p_token_hash bytea) returns jsonb
+language plpgsql security definer as $$
+begin
+  update invitations set status = 'DECLINED', decided_at = now()
+   where token_hash = p_token_hash and status = 'PENDING';
+  return jsonb_build_object('ok', true);                -- same answer whatever the token
+end $$;
+
+create function revoke_invitation(p_workspace uuid, p_actor uuid, p_id uuid) returns jsonb
+language plpgsql security definer as $$
+declare a text; inv invitations;
+begin
+  perform require_member(p_workspace, p_actor, 'members.manage');
+  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
+  select * into inv from invitations where id = p_id and workspace_id = p_workspace and status = 'PENDING' for update;
+  if not found then raise exception 'invitation not found' using errcode = 'CT404'; end if;
+  if inv.invited_by <> p_actor and (not can_invite(a, inv.role, inv.financial_access)
+       or (inv.worker_id is not null and not member_can(p_workspace, p_actor, 'money.view'))) then
+    raise exception 'not allowed' using errcode = 'CT403'; end if;
+  update invitations set status = 'REVOKED', decided_by = p_actor, decided_at = now() where id = p_id;
+  return jsonb_build_object('ok', true);
+end $$;
+
+-- ---------- managing members ----------
+-- Organizer manages the partner; owner manages everyone; admin manages leads and workers (no money access changes).
+create function can_manage(p_actor_role text, p_target_role text, p_new_role text, p_new_financial boolean) returns boolean
+language sql immutable as $$
+  select case
+    when p_actor_role = 'ORGANIZER' then p_target_role = 'PARTNER' and coalesce(p_new_role,'PARTNER') = 'PARTNER'
+    when p_actor_role = 'OWNER'     then p_target_role in ('ADMIN','LEAD','WORKER')
+                                     and coalesce(p_new_role, p_target_role) in ('ADMIN','LEAD','WORKER')
+    when p_actor_role = 'ADMIN'     then p_target_role in ('LEAD','WORKER')
+                                     and coalesce(p_new_role, p_target_role) in ('LEAD','WORKER')
+    else false end
+$$;
+
+create function remove_member(p_workspace uuid, p_actor uuid, p_member_user uuid) returns jsonb
+language plpgsql security definer as $$
+declare a text; t record;
+begin
+  if p_actor = p_member_user then
+    -- leaving: anyone but the principal may leave
+    select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
+    if not found then raise exception 'not a member' using errcode = 'CT404'; end if;
+    if a in ('ORGANIZER','OWNER') then raise exception 'the organizer or owner cannot leave' using errcode = 'CT403'; end if;
+  else
+    perform require_member(p_workspace, p_actor, 'members.manage');
+    select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
+    select * into t from memberships where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE' for update;
+    if not found then raise exception 'member not found' using errcode = 'CT404'; end if;
+    if not can_manage(a, t.role, null, null) then raise exception 'not allowed' using errcode = 'CT403'; end if;
+  end if;
+  update memberships set status = 'REMOVED', removed_at = now(), removed_by = p_actor
+   where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE';
+  update invitations set status = 'REVOKED', decided_by = p_actor, decided_at = now()
+   where workspace_id = p_workspace and invited_by = p_member_user and status = 'PENDING';
+  return jsonb_build_object('ok', true);
+end $$;
+
+create function change_member_role(p_workspace uuid, p_actor uuid, p_member_user uuid, p_role text, p_financial boolean)
+returns jsonb language plpgsql security definer as $$
+declare a text; t record;
+begin
+  perform require_member(p_workspace, p_actor, 'members.manage');
+  if p_role is null then raise exception 'role required' using errcode = '22023'; end if;
+  select role into a from memberships where workspace_id = p_workspace and user_id = p_actor and status = 'ACTIVE';
+  select * into t from memberships where workspace_id = p_workspace and user_id = p_member_user and status = 'ACTIVE' for update;
+  if not found then raise exception 'member not found' using errcode = 'CT404'; end if;
+  if p_actor = p_member_user then raise exception 'cannot change your own role' using errcode = 'CT403'; end if;
+  if not can_manage(a, t.role, p_role, p_financial) then raise exception 'not allowed' using errcode = 'CT403'; end if;
+  if a <> 'OWNER' and (p_role = 'ADMIN' or t.role = 'ADMIN') then
+    raise exception 'only the owner changes admins' using errcode = 'CT403'; end if;
+  if p_role = 'WORKER' and t.worker_id is null then
+    raise exception 'WORKER_RECORD_REQUIRED' using errcode = '22023'; end if;
+  update memberships set role = p_role,
+         financial_access = case when p_role = 'ADMIN' then coalesce(p_financial, false) end,
+         worker_id = case when p_role in ('LEAD','WORKER') then worker_id end
+   where id = t.id;
+  -- invitations this person sent that they could no longer send are withdrawn
+  update invitations i set status = 'REVOKED', decided_by = p_actor, decided_at = now()
+   where i.workspace_id = p_workspace and i.invited_by = p_member_user and i.status = 'PENDING'
+     and (not can_invite(p_role, i.role, i.financial_access)
+          or (i.worker_id is not null and not role_can(p_role, p_financial, 'money.view')));
+  return jsonb_build_object('ok', true);
+end $$;
+
+-- ---------- email sign-in codes ----------
+create table email_codes (
+  id          uuid primary key default gen_random_uuid(),
+  email       text not null check (email = lower(email)),
+  purpose     text not null check (purpose in ('SIGN_IN','LINK','DELETE')),
+  code_hash   bytea not null,                         -- HMAC-SHA256(CODE_PEPPER, email || ':' || purpose || ':' || code), made by the API
+  attempts    smallint not null default 0,
+  expires_at  timestamptz not null,
+  consumed_at timestamptz,
+  created_at  timestamptz not null default now()
+);
+create index email_codes_recent on email_codes (email, created_at desc);
+
+-- At most 5 codes per email per hour; each lasts 10 minutes; a new code cancels older codes of the SAME purpose only.
+-- After 20 wrong tries in 24 hours for an email, no code is checked or issued for it until the window passes.
+-- CT429 → HTTP 429. Rows are kept 24 hours (the nightly job purges older ones) so the limits can't be reset.
+create function issue_email_code(p_email text, p_purpose text, p_code_hash bytea) returns jsonb
+language plpgsql security definer as $$
+declare v_email text := lower(btrim(p_email));
+begin
+  if p_purpose not in ('SIGN_IN','LINK','DELETE') then raise exception 'bad purpose' using errcode = '22023'; end if;
+  perform pg_advisory_xact_lock(hashtextextended('email_code:' || v_email, 0));
+  if (select count(*) from email_codes where email = v_email and created_at > now() - interval '1 hour') >= 5 then
+    raise exception 'too many codes' using errcode = 'CT429'; end if;
+  if (select coalesce(sum(attempts), 0) from email_codes where email = v_email and created_at > now() - interval '24 hours') >= 20 then
+    raise exception 'too many wrong codes' using errcode = 'CT429'; end if;
+  update email_codes set consumed_at = now()
+   where email = v_email and purpose = p_purpose and consumed_at is null;
+  insert into email_codes (email, purpose, code_hash, expires_at)
+  values (v_email, p_purpose, p_code_hash, now() + interval '10 minutes');
+  return jsonb_build_object('expires_in_seconds', 600);
+end $$;
+
+-- True once for the right code; five wrong tries burn the code.
+create function verify_email_code(p_email text, p_purpose text, p_code_hash bytea) returns boolean
+language plpgsql security definer as $$
+declare c email_codes; v_email text := lower(btrim(p_email));
+begin
+  perform pg_advisory_xact_lock(hashtextextended('email_code:' || v_email, 0));
+  if (select coalesce(sum(attempts), 0) from email_codes where email = v_email and created_at > now() - interval '24 hours') >= 20 then
+    return false;
+  end if;
+  select * into c from email_codes
+   where email = v_email and purpose = p_purpose and consumed_at is null and expires_at > now()
+   order by created_at desc limit 1 for update;
+  if not found then return false; end if;
+  if c.code_hash = p_code_hash and c.attempts < 5 then
+    update email_codes set consumed_at = now() where id = c.id;
+    return true;
+  end if;
+  update email_codes set attempts = attempts + 1,
+         consumed_at = case when attempts + 1 >= 5 then now() end
+   where id = c.id;
+  return false;
+end $$;
+
+-- Checks a SIGN_IN code; on success returns the user with that verified email, or a new one. Null = wrong code.
+create function sign_in_with_email_code(p_email text, p_code_hash bytea) returns uuid
+language plpgsql security definer as $$
+declare v_email text := lower(btrim(p_email)); v_id uuid;
+begin
+  if not verify_email_code(v_email, 'SIGN_IN', p_code_hash) then
+    return null;                                   -- the API answers 400 CODE_WRONG
+  end if;
+  select id into v_id from users where email = v_email and deleted_at is null;
+  if found then return v_id; end if;
+  insert into users (email, email_verified_at) values (v_email, now()) returning id into v_id;
+  return v_id;
+end $$;
+
+-- Checks a LINK code, then adds email sign-in to the signed-in account (e.g. an Apple user).
+create function link_email_code(p_user uuid, p_email text, p_code_hash bytea) returns jsonb
+language plpgsql security definer as $$
+declare v_email text := lower(btrim(p_email)); cur text;
+begin
+  select email into cur from users where id = p_user and deleted_at is null for update;
+  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
+  if cur is not null then
+    raise exception 'EMAIL_ALREADY_SET' using errcode = 'CT409'; end if;
+  if not verify_email_code(v_email, 'LINK', p_code_hash) then
+    return jsonb_build_object('error', 'CODE_WRONG');
+  end if;
+  if exists (select 1 from users where email = v_email and id <> p_user) then
+    raise exception 'EMAIL_IN_USE' using errcode = 'CT409'; end if;
+  update users set email = v_email, email_verified_at = now() where id = p_user;
+  return jsonb_build_object('ok', true);
+end $$;
+
+-- A person sets their own display name (shown to other members of their workspaces, never to workers on receipts).
+create function set_display_name(p_user uuid, p_name text) returns jsonb
+language plpgsql security definer as $$
+begin
+  if p_name is not null and length(btrim(p_name)) not between 1 and 60 then
+    raise exception 'bad name' using errcode = '22023'; end if;
+  update users set display_name = nullif(btrim(p_name), '') where id = p_user and deleted_at is null;
+  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
+  return jsonb_build_object('ok', true);
+end $$;
+
+-- After a verified Sign in with Apple while signed in: add Apple sign-in to an account that started with email.
+create function link_apple(p_user uuid, p_apple_sub text) returns jsonb
+language plpgsql security definer as $$
+declare cur text;
+begin
+  if p_apple_sub is null or length(p_apple_sub) = 0 then raise exception 'bad subject' using errcode = '22023'; end if;
+  if exists (select 1 from users where apple_sub = p_apple_sub and id <> p_user) then
+    raise exception 'this Apple ID is already used by another account' using errcode = 'CT409'; end if;
+  select apple_sub into cur from users where id = p_user and deleted_at is null for update;
+  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
+  if cur is not null and cur <> p_apple_sub then
+    raise exception 'a different Apple ID is already linked' using errcode = 'CT409'; end if;
+  update users set apple_sub = p_apple_sub where id = p_user;
+  return jsonb_build_object('ok', true);
+end $$;
+
+-- Apple refresh tokens: one per user per client (the iPhone app's bundle ID, or the web Services ID),
+-- so account deletion can revoke each with the right client id.
+do $$
+declare pk text;
+begin
+  if not exists (select 1 from information_schema.columns
+                 where table_schema = current_schema() and table_name = 'apple_credentials' and column_name = 'client_kind') then
+    alter table apple_credentials add column client_kind text not null default 'APP' check (client_kind in ('APP','WEB'));
+    select conname into pk from pg_constraint
+     where conrelid = 'apple_credentials'::regclass and contype = 'p';
+    if pk is not null then execute format('alter table apple_credentials drop constraint %I', pk); end if;
+    alter table apple_credentials add primary key (user_id, client_kind);
+  end if;
+end $$;
+
+-- ---------- account deletion (replaces calling delete_workspace_data directly) ----------
+-- Deletes every workspace this person is the organizer or owner of (all members lose it — the app warns first),
+-- leaves every other workspace, revokes sessions and invitations, and scrubs the identity.
+-- The API revokes the Apple token BEFORE calling this (it needs apple_credentials).
+create function delete_user_account(p_user uuid) returns jsonb
+language plpgsql security definer as $$
+declare w uuid; deleted uuid[] := '{}';
+begin
+  if not exists (select 1 from users where id = p_user and deleted_at is null) then
+    raise exception 'user not found' using errcode = 'P0002'; end if;
+  for w in select workspace_id from memberships where user_id = p_user and role in ('ORGANIZER','OWNER') and status = 'ACTIVE' loop
+    perform delete_workspace_data(w);
+    deleted := deleted || w;
+  end loop;
+  update memberships set status = 'REMOVED', removed_at = now(), removed_by = p_user
+   where user_id = p_user and status = 'ACTIVE';
+  update invitations set status = 'REVOKED', decided_by = p_user, decided_at = now()
+   where invited_by = p_user and status = 'PENDING';
+  update sessions set revoked_at = now() where user_id = p_user and revoked_at is null;
+  delete from apple_credentials where user_id = p_user;
+  update invitations set status = 'REVOKED', decided_at = now()
+   where email = (select email from users where id = p_user) and status = 'PENDING';
+  update users set deleted_at = now(), apple_sub = null, email = null, email_verified_at = null, display_name = null
+   where id = p_user;
+  return jsonb_build_object('deleted_workspaces', to_jsonb(deleted));
+end $$;
+
+-- The workspaces a signed-in person can open (for the switcher and /v1/me).
+create function my_workspaces(p_user uuid) returns jsonb
+language sql stable security definer as $$
+  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'role', m.role,
+                  'financial_access', m.financial_access) order by w.created_at), '[]'::jsonb)
+  from memberships m join workspaces w on w.id = m.workspace_id
+  join users u on u.id = m.user_id
+  where m.user_id = p_user and m.status = 'ACTIVE' and u.deleted_at is null
+$$;
+
+-- ---------- harden every SECURITY DEFINER function in this schema (same rule 0004 applies again) ----------
+do $$
+declare f record;
+begin
+  for f in select p.oid::regprocedure as sig from pg_proc p
+           where p.pronamespace = current_schema()::regnamespace and p.prosecdef loop
+    execute format('alter function %s set search_path = %I, pg_temp', f.sig, current_schema());
+    execute format('revoke execute on function %s from public', f.sig);
+  end loop;
+end $$;
diff --git a/db/tests/11_identity_memberships.sql b/db/tests/11_identity_memberships.sql
new file mode 100644
index 0000000..2d471ea
--- /dev/null
+++ b/db/tests/11_identity_memberships.sql
@@ -0,0 +1,405 @@
+-- Baseline 2.0 (Phase 1b): workspaces, memberships, roles, invitations, email codes, actor, account deletion.
+do $$
+declare
+  u_org uuid; u_partner uuid; u_other uuid; u_owner uuid; u_admin uuid; u_worker uuid; u_stranger uuid;
+  ws_home uuid; ws_home2 uuid; ws_biz uuid; ws_other uuid;
+  p uuid; w uuid; a uuid; wb uuid; r jsonb; failed boolean; st text; ok boolean; pay uuid;
+  tok bytea; inv uuid; n bigint;
+  function_code text;
+begin
+  insert into users (apple_sub) values ('t:org')     returning id into u_org;
+  insert into users (apple_sub) values ('t:partner') returning id into u_partner;
+  insert into users (apple_sub) values ('t:other')   returning id into u_other;
+  insert into users (apple_sub) values ('t:owner')   returning id into u_owner;
+  insert into users (apple_sub) values ('t:admin')   returning id into u_admin;
+  insert into users (email, email_verified_at) values ('worker@example.com', now()) returning id into u_worker;
+  insert into users (apple_sub) values ('t:stranger') returning id into u_stranger;
+
+  -- ---- workspaces and the principal ----
+  ws_home  := create_workspace(u_org, 'HOME', 'Debra Lane', 'USD', 'America/New_York');
+  ws_home2 := create_workspace(u_org, 'HOME', 'Rental', 'USD', null);     -- one person, several workspaces
+  ws_biz   := create_workspace(u_owner, 'BUSINESS', 'Rivera Builders', 'USD', 'America/New_York');
+  ws_other := create_workspace(u_other, 'HOME', 'Other home', 'USD', null);
+  assert (select role from memberships where workspace_id = ws_home and user_id = u_org) = 'ORGANIZER';
+  assert (select role from memberships where workspace_id = ws_biz and user_id = u_owner) = 'OWNER';
+  assert jsonb_array_length(my_workspaces(u_org)) = 2, 'organizer sees both workspaces';
+
+  failed := false; begin perform create_workspace(u_org, 'HOME', 'Bad', 'USD', 'Not/AZone'); exception when others then failed := true; end;
+  assert failed, 'bad time zone rejected';
+
+  -- roles must fit the kind
+  failed := false; begin insert into memberships (workspace_id,user_id,role,financial_access) values (ws_home,u_admin,'ADMIN',true); exception when others then failed := true; end;
+  assert failed, 'ADMIN not allowed in Home';
+  failed := false; begin insert into memberships (workspace_id,user_id,role) values (ws_biz,u_partner,'PARTNER'); exception when others then failed := true; end;
+  assert failed, 'PARTNER not allowed in Business';
+  -- only the billing owner can be principal, and only one
+  failed := false; begin insert into memberships (workspace_id,user_id,role) values (ws_home,u_partner,'ORGANIZER'); exception when others then failed := true; end;
+  assert failed, 'second organizer rejected';
+  failed := false; begin update memberships set status='REMOVED', removed_at=now() where workspace_id=ws_home and user_id=u_org; exception when others then failed := true; end;
+  assert failed, 'organizer cannot be removed';
+  failed := false; begin update workspaces set kind='BUSINESS' where id=ws_home; exception when others then failed := true; end;
+  assert failed, 'kind is fixed';
+  failed := false; begin update workspaces set owner_id=u_partner where id=ws_home; exception when others then failed := true; end;
+  assert failed, 'billing owner is fixed';
+
+  -- ---- the permission matrix ----
+  assert role_can('PARTNER', null, 'money.record') and role_can('PARTNER', null, 'people.add');
+  assert not role_can('PARTNER', null, 'rates.set') and not role_can('PARTNER', null, 'people.remove');
+  assert not role_can('PARTNER', null, 'plan.manage') and not role_can('PARTNER', null, 'members.manage');
+  assert not role_can('PARTNER', null, 'account.delete_workspace');
+  assert not role_can('ADMIN', false, 'money.view') and not role_can('ADMIN', false, 'rates.set');
+  assert role_can('ADMIN', true, 'money.record') and role_can('ADMIN', true, 'rates.set');
+  assert role_can('ADMIN', false, 'work.approve') and not role_can('ORGANIZER', null, 'work.approve');
+  assert not role_can('LEAD', null, 'money.view') and not role_can('WORKER', null, 'money.view');
+  assert not role_can('LEAD', null, 'crew.private') and not role_can('WORKER', null, 'export');
+  assert role_can('ORGANIZER', null, 'crew.private') and role_can('PARTNER', null, 'crew.private');
+  failed := false; begin perform member_can(ws_home, u_org, 'money.recrod'); exception when others then failed := true; end;
+  assert failed, 'unknown action raises';
+
+  -- ---- require_member: 404 for outsiders, 403 for missing rights, actor recorded ----
+  begin perform require_member(ws_home, u_other, 'workspace.read'); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT404', 'outsider gets CT404, got ' || st;
+
+  -- set up money in ws_home
+  insert into projects (workspace_id,name,timezone) values (ws_home,'P','America/New_York') returning id into p;
+  insert into workers (workspace_id,display_name) values (ws_home,'Ana') returning id into w;
+  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws_home,p,w,'2026-09-01') returning id into a;
+  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws_home,a,'2026-09-01','DAY',20000);
+  assert (select recorded_by from rate_agreements where assignment_id = a) is null, 'no actor → null (provided paths unchanged)';
+
+  -- ---- Home partner invitation ----
+  tok := sha256('partner-token'::bytea); inv := gen_random_uuid();
+  r := create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'Partner@Example.com', tok,
+                         sha256(convert_to('partner@example.com:123456','UTF8')));
+  assert (select email from invitations where id = inv) = 'partner@example.com', 'email lower-cased';
+  r := peek_invitation(tok);
+  assert (r->>'available')::boolean and r->>'workspace_name' = 'Debra Lane' and r->>'role' = 'PARTNER';
+  assert not (peek_invitation(sha256('nope'::bytea))->>'available')::boolean;
+  -- the organizer cannot invite an admin, a stranger cannot invite anyone
+  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'WORKER', null, w, 'x@example.com', sha256('t2'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'organizer cannot invite a worker, got ' || st;
+  begin perform create_invitation(ws_home, u_stranger, gen_random_uuid(), 'PARTNER', null, null, 'y@example.com', sha256('t3'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT404', 'stranger gets CT404';
+  -- a second pending invitation to the same email is refused
+  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'partner@example.com', sha256('t4'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'duplicate pending invite refused';
+
+  r := accept_invitation(u_partner, tok);
+  assert r->>'role' = 'PARTNER' and (r->>'workspace_id')::uuid = ws_home;
+  assert not (peek_invitation(tok)->>'available')::boolean, 'used link no longer available';
+  begin perform accept_invitation(u_stranger, tok); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT410', 'link works once';
+
+  -- partner rights in practice
+  r := require_member(ws_home, u_partner, 'money.record');
+  pay := (record_payment(ws_home, gen_random_uuid(), '2026-09-02', 'CASH', null, 5000, 'Ana', null,
+          jsonb_build_array(jsonb_build_object('assignment_id', a, 'amount_minor', 5000)))->>'payment_id')::uuid;
+  assert (select recorded_by from payments where workspace_id = ws_home order by created_at desc limit 1) = u_partner,
+         'payment records the partner as actor';
+  begin perform require_member(ws_home, u_partner, 'rates.set'); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'partner cannot set rates';
+  begin perform create_invitation(ws_home, u_partner, gen_random_uuid(), 'PARTNER', null, null, 'z@example.com', sha256('t5'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'partner cannot invite';
+  -- only one partner
+  begin perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'second@example.com', sha256('t6'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'one partner per Home workspace';
+
+  -- partner leaves, organizer cannot
+  r := remove_member(ws_home, u_partner, u_partner);
+  begin perform require_member(ws_home, u_partner, 'workspace.read'); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT404', 'removed member is an outsider';
+  begin perform remove_member(ws_home, u_org, u_org); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'organizer cannot leave';
+
+  -- re-invite reactivates the same membership row
+  tok := sha256('partner-token-2'::bytea);
+  perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'partner@example.com', tok, sha256('c'::bytea));
+  r := accept_invitation(u_partner, tok);
+  assert (select count(*) from memberships where workspace_id = ws_home and user_id = u_partner) = 1;
+  assert (select status from memberships where workspace_id = ws_home and user_id = u_partner) = 'ACTIVE';
+  r := remove_member(ws_home, u_org, u_partner);
+  assert (select removed_by from memberships where workspace_id = ws_home and user_id = u_partner) = u_org;
+
+  -- expired link: peek says unavailable, accept marks it EXPIRED
+  tok := sha256('old'::bytea); inv := gen_random_uuid();
+  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'late@example.com', tok, sha256('c'::bytea));
+  update invitations set expires_at = now() - interval '1 minute' where id = inv;
+  assert not (peek_invitation(tok)->>'available')::boolean;
+  r := accept_invitation(u_stranger, tok);
+  assert r->>'error' = 'INVITATION_NOT_AVAILABLE' and (select status from invitations where id = inv) = 'EXPIRED';
+
+  -- code fallback: five wrong codes lock it; a fresh invite with the right code works
+  inv := gen_random_uuid();
+  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'code@example.com', sha256('ct'::bytea),
+                            sha256(convert_to('code@example.com:654321','UTF8')));
+  for i in 1..5 loop
+    r := accept_invitation_code(u_owner, 'code@example.com', sha256(convert_to('code@example.com:000000','UTF8')));
+    assert r->>'error' = 'INVITATION_CODE_WRONG';
+  end loop;
+  assert (select status from invitations where id = inv) = 'PENDING', 'a stranger''s guesses never change the invitation';
+  r := accept_invitation_code(u_owner, 'code@example.com', sha256(convert_to('code@example.com:654321','UTF8')));
+  assert r->>'error' = 'INVITATION_CODE_WRONG', 'after five wrong tries that person can''t try again today, even with the right code';
+  r := accept_invitation_code(u_stranger, 'CODE@example.com ', sha256(convert_to('code@example.com:654321','UTF8')));
+  assert r->>'role' = 'PARTNER', 'the real invitee still joins with the right code';
+  r := remove_member(ws_home, u_org, u_stranger);
+
+  -- decline and revoke
+  tok := sha256('dec'::bytea); inv := gen_random_uuid();
+  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'dec@example.com', tok, sha256('c'::bytea));
+  r := decline_invitation(tok);
+  assert (select status from invitations where id = inv) = 'DECLINED';
+  inv := gen_random_uuid();
+  perform create_invitation(ws_home, u_org, inv, 'PARTNER', null, null, 'rev@example.com', sha256('rev'::bytea), sha256('c'::bytea));
+  r := revoke_invitation(ws_home, u_org, inv);
+  assert (select status from invitations where id = inv) = 'REVOKED';
+  begin perform revoke_invitation(ws_other, u_other, inv); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT404', 'cannot revoke another workspace''s invitation';
+
+  -- ---- Business roles ----
+  insert into workers (workspace_id,display_name) values (ws_biz,'Luis') returning id into wb;
+  tok := sha256('admin'::bytea);
+  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'ADMIN', false, null, 'admin@example.com', tok, sha256('c'::bytea));
+  r := accept_invitation(u_admin, tok);
+  assert (select financial_access from memberships where workspace_id = ws_biz and user_id = u_admin) = false;
+  begin perform require_member(ws_biz, u_admin, 'money.view'); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'admin without money access cannot see money';
+  -- an admin without money access can't create a login bound to a worker record (it would show that worker's money)
+  begin perform create_invitation(ws_biz, u_admin, gen_random_uuid(), 'WORKER', null, wb, 'w0@example.com', sha256('w0'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'worker binding needs money access';
+  tok := sha256('worker'::bytea);
+  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, wb, 'worker@example.com', tok, sha256('c'::bytea));
+  begin perform create_invitation(ws_biz, u_admin, gen_random_uuid(), 'ADMIN', true, null, 'a2@example.com', sha256('a2'::bytea), sha256('c'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'admin cannot invite admins';
+  failed := false; begin perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, null, 'nw@example.com', sha256('nw'::bytea), sha256('c'::bytea)); exception when others then failed := true; end;
+  assert failed, 'worker invitation needs a worker record';
+  r := accept_invitation(u_worker, tok);
+  assert (select worker_id from memberships where workspace_id = ws_biz and user_id = u_worker) = wb;
+  -- admin cannot give money access; owner can
+  begin perform change_member_role(ws_biz, u_admin, u_admin, 'ADMIN', true); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'admin cannot change own role';
+  r := change_member_role(ws_biz, u_owner, u_admin, 'ADMIN', true);
+  assert member_can(ws_biz, u_admin, 'money.record'), 'owner granted money access';
+  r := change_member_role(ws_biz, u_admin, u_worker, 'LEAD', null);
+  assert (select role from memberships where workspace_id = ws_biz and user_id = u_worker) = 'LEAD';
+  assert (select worker_id from memberships where workspace_id = ws_biz and user_id = u_worker) = wb, 'lead keeps worker record';
+  begin perform change_member_role(ws_biz, u_admin, u_owner, 'ADMIN', false); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'nobody demotes the owner';
+  r := member_permissions(ws_biz, u_worker);
+  assert r->>'role' = 'LEAD' and not (r->'can'->>'money.view')::boolean and (r->'can'->>'work.record')::boolean;
+  -- one login per worker record
+  tok := sha256('dup-worker'::bytea);
+  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'WORKER', null, wb, 'dup@example.com', tok, sha256('c'::bytea));
+  begin perform accept_invitation(u_stranger, tok); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'worker record already has a login';
+
+  -- ---- email codes ----
+  r := issue_email_code('Sam@Example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8')));
+  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:999999','UTF8')));
+  assert verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8'))), 'right code';
+  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:111111','UTF8'))), 'code works once';
+  r := issue_email_code('sam@example.com', 'LINK', sha256(convert_to('sam@example.com:444444','UTF8')));
+  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:222222','UTF8')));
+  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:333333','UTF8')));
+  assert not verify_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:222222','UTF8'))), 'older code of the same purpose stops working';
+  assert verify_email_code('sam@example.com', 'LINK', sha256(convert_to('sam@example.com:444444','UTF8'))), 'a SIGN_IN code never cancels a LINK code';
+  r := issue_email_code('sam@example.com', 'SIGN_IN', sha256(convert_to('sam@example.com:555555','UTF8')));   -- fifth
+  begin perform issue_email_code('sam@example.com', 'SIGN_IN', sha256('x'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT429', 'sixth code in an hour refused';
+  -- five wrong tries burn the code
+  r := issue_email_code('kim@example.com', 'SIGN_IN', sha256(convert_to('kim@example.com:121212','UTF8')));
+  for i in 1..5 loop perform verify_email_code('kim@example.com', 'SIGN_IN', sha256('bad'::bytea)); end loop;
+  assert not verify_email_code('kim@example.com', 'SIGN_IN', sha256(convert_to('kim@example.com:121212','UTF8'))), 'burned after five';
+  -- purpose matters
+  r := issue_email_code('lee@example.com', 'LINK', sha256(convert_to('lee@example.com:343434','UTF8')));
+  assert not verify_email_code('lee@example.com', 'SIGN_IN', sha256(convert_to('lee@example.com:343434','UTF8'))), 'LINK code is not a SIGN_IN code';
+
+  -- a 24-hour failure budget per email: after 20 wrong tries nothing is checked or issued
+  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b1'::bytea));
+  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
+  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b2'::bytea));
+  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
+  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b3'::bytea));
+  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
+  r := issue_email_code('budget@example.com', 'SIGN_IN', sha256('b4'::bytea));
+  for i in 1..5 loop perform verify_email_code('budget@example.com', 'SIGN_IN', sha256('no'::bytea)); end loop;
+  begin perform issue_email_code('budget@example.com', 'SIGN_IN', sha256('b5'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT429', 'no new codes after 20 wrong tries in 24 hours';
+
+  -- sign-in checks the code itself
+  r := issue_email_code('worker@example.com', 'SIGN_IN', sha256(convert_to('w:1','UTF8')));
+  assert sign_in_with_email_code('worker@example.com', sha256(convert_to('w:wrong','UTF8'))) is null, 'wrong code signs nobody in';
+  assert sign_in_with_email_code('worker@example.com', sha256(convert_to('w:1','UTF8'))) = u_worker, 'existing verified email signs in to the same user';
+  n := (select count(*) from users);
+  r := issue_email_code('new@example.com', 'SIGN_IN', sha256(convert_to('n:1','UTF8')));
+  u_stranger := sign_in_with_email_code('NEW@example.com', sha256(convert_to('n:1','UTF8')));
+  assert u_stranger is not null and (select count(*) from users) = n + 1, 'new user created once';
+  r := issue_email_code('org@example.com', 'LINK', sha256(convert_to('o:1','UTF8')));
+  r := link_email_code(u_org, 'org@example.com', sha256(convert_to('o:1','UTF8')));
+  assert (select email from users where id = u_org) = 'org@example.com';
+  begin perform link_email_code(u_org, 'org2@example.com', sha256('x'::bytea)); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'an account with an email can''t swap it here';
+  r := issue_email_code('org@example.com', 'LINK', sha256(convert_to('o:2','UTF8')));
+  begin perform link_email_code(u_partner, 'org@example.com', sha256(convert_to('o:2','UTF8'))); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'email already used by another account';
+
+  -- ---- account deletion ----
+  insert into sessions (user_id, token_hash, expires_at) values (u_org, sha256('s1'::bytea), now() + interval '30 days');
+  -- org is partner in ws_other
+  tok := sha256('org-in-other'::bytea);
+  perform create_invitation(ws_other, u_other, gen_random_uuid(), 'PARTNER', null, null, 'org2@example.com', tok, sha256('c'::bytea));
+  r := accept_invitation(u_org, tok);
+  -- org's own workspace has a partner again
+  tok := sha256('partner-back'::bytea);
+  perform create_invitation(ws_home, u_org, gen_random_uuid(), 'PARTNER', null, null, 'p3@example.com', tok, sha256('c'::bytea));
+  r := accept_invitation(u_partner, tok);
+  perform create_invitation(ws_home2, u_org, gen_random_uuid(), 'PARTNER', null, null, 'pending@example.com', sha256('pend'::bytea), sha256('c'::bytea));
+
+  inv := (select id from invitations where email = 'pending@example.com');
+  perform create_invitation(ws_biz, u_owner, gen_random_uuid(), 'ADMIN', false, null, 'org@example.com', sha256('to-org'::bytea), sha256('c'::bytea));
+  r := delete_user_account(u_org);
+  assert jsonb_array_length(r->'deleted_workspaces') = 2, 'both owned workspaces deleted';
+  assert not exists (select 1 from workspaces where id in (ws_home, ws_home2));
+  assert not exists (select 1 from payments where workspace_id = ws_home);
+  assert not exists (select 1 from memberships where workspace_id = ws_home), 'memberships of deleted workspace gone';
+  assert exists (select 1 from workspaces where id = ws_other), 'workspace where they were partner stays';
+  assert (select status from memberships where workspace_id = ws_other and user_id = u_org) = 'REMOVED';
+  assert (select deleted_at is not null and apple_sub is null and email is null from users where id = u_org), 'identity scrubbed';
+  assert not exists (select 1 from sessions where user_id = u_org and revoked_at is null), 'sessions revoked';
+  assert exists (select 1 from users where id = u_partner and deleted_at is null), 'partner account untouched';
+  assert jsonb_array_length(my_workspaces(u_partner)) = 0;
+  begin perform require_member(ws_other, u_org, 'workspace.read'); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT404', 'deleted user is an outsider';
+  assert not exists (select 1 from invitations where email = 'org@example.com' and status = 'PENDING'), 'invitations to the deleted person are revoked';
+  -- a deleted Apple id can sign up again fresh
+  insert into users (apple_sub) values ('t:org');
+
+  raise notice '11_identity_memberships: PASS';
+end $$;
+
+-- names and Apple linking
+do $$
+declare u1 uuid; u2 uuid; ws uuid; st text; r jsonb;
+begin
+  r := issue_email_code('first@example.com', 'SIGN_IN', sha256('f:1'::bytea));
+  u1 := sign_in_with_email_code('first@example.com', sha256('f:1'::bytea));
+  insert into users (apple_sub) values ('t:link-other') returning id into u2;
+  r := set_display_name(u1, '  Dana ');
+  assert (select display_name from users where id = u1) = 'Dana';
+  begin perform set_display_name(u1, repeat('x', 61)); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = '22023', 'name too long';
+  r := link_apple(u1, 't:link-me');
+  assert (select apple_sub from users where id = u1) = 't:link-me';
+  r := link_apple(u1, 't:link-me');                                   -- same again is fine
+  begin perform link_apple(u1, 't:another'); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'cannot replace a linked Apple ID';
+  begin perform link_apple(u1, 't:link-other'); st := 'none'; exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT409', 'Apple ID used by another account';
+  -- invitation keeps the inviter's label
+  ws := create_workspace(u2, 'HOME', 'Labelled', 'USD', null);
+  perform create_invitation(ws, u2, gen_random_uuid(), 'PARTNER', null, null, 'lab@example.com', sha256('lab'::bytea), sha256('c'::bytea), ' Sam ');
+  assert (select invitee_name from invitations where email = 'lab@example.com') = 'Sam';
+  -- Apple credentials: one per client kind
+  insert into apple_credentials (user_id, client_kind, refresh_token_ciphertext, iv, auth_tag, updated_at) values (u2, 'APP', '\x00'::bytea, '\x00'::bytea, '\x00'::bytea, now()), (u2, 'WEB', '\x00'::bytea, '\x00'::bytea, '\x00'::bytea, now());
+  assert (select count(*) from apple_credentials where user_id = u2) = 2;
+  raise notice '11b_names_and_linking: PASS';
+end $$;
+
+-- inviters who lose the right, revoke rules, recorded_by can't be faked
+do $$
+declare uo uuid; ua uuid; ub uuid; ux uuid; ws uuid; w uuid; tok bytea; inv uuid; r jsonb; st text; p uuid; a uuid;
+begin
+  insert into users (apple_sub) values ('t:o2') returning id into uo;
+  insert into users (apple_sub) values ('t:a2') returning id into ua;
+  insert into users (apple_sub) values ('t:b2') returning id into ub;
+  insert into users (apple_sub) values ('t:x2') returning id into ux;
+  ws := create_workspace(uo, 'BUSINESS', 'Inviter test', 'USD', null);
+  tok := sha256('a2'::bytea);
+  perform create_invitation(ws, uo, gen_random_uuid(), 'ADMIN', false, null, 'a2@example.com', tok, sha256('c'::bytea));
+  r := accept_invitation(ua, tok);
+  -- the admin invites their own second address, then is removed: that invitation dies
+  tok := sha256('sneak'::bytea); inv := gen_random_uuid();
+  perform create_invitation(ws, ua, inv, 'LEAD', null, null, 'sneak@example.com', tok, sha256('c'::bytea));
+  r := remove_member(ws, uo, ua);
+  assert (select status from invitations where id = inv) = 'REVOKED', 'removing someone revokes what they sent';
+  -- even if it had stayed pending, accept re-checks the inviter
+  insert into memberships (workspace_id, user_id, role, financial_access) values (ws, ub, 'ADMIN', false)
+    on conflict (workspace_id, user_id) do nothing;
+  tok := sha256('later'::bytea); inv := gen_random_uuid();
+  perform create_invitation(ws, ub, inv, 'LEAD', null, null, 'later@example.com', tok, sha256('c'::bytea));
+  update memberships set status = 'REMOVED', removed_at = now() where workspace_id = ws and user_id = ub;  -- simulate a missed revoke
+  r := accept_invitation(ux, tok);
+  assert r->>'error' = 'INVITATION_NOT_AVAILABLE', 'accept re-checks the inviter';
+  assert not member_can(ws, ux, 'workspace.read');
+  -- an admin without money can't revoke the owner's money-admin invitation
+  update memberships set status = 'ACTIVE', removed_at = null where workspace_id = ws and user_id = ub;
+  inv := gen_random_uuid();
+  perform create_invitation(ws, uo, inv, 'ADMIN', true, null, 'fin@example.com', sha256('fin'::bytea), sha256('c'::bytea));
+  begin perform revoke_invitation(ws, ub, inv); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'cannot revoke an invitation you could not have made';
+  -- demoting an admin to lead withdraws their pending invitations
+  inv := gen_random_uuid();
+  perform create_invitation(ws, ub, inv, 'LEAD', null, null, 'l3@example.com', sha256('l3'::bytea), sha256('c'::bytea));
+  r := change_member_role(ws, uo, ub, 'LEAD', null);
+  assert (select status from invitations where id = inv) = 'REVOKED', 'demotion withdraws invitations';
+  begin perform change_member_role(ws, uo, ub, 'WORKER', null); st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = '22023', 'worker role needs a worker record';
+  -- recorded_by: the actor wins, a mismatch is refused
+  insert into projects (workspace_id,name,timezone) values (ws,'J','UTC') returning id into p;
+  insert into workers (workspace_id,display_name) values (ws,'W') returning id into w;
+  insert into assignments (workspace_id,project_id,worker_id,start_date) values (ws,p,w,'2026-09-01') returning id into a;
+  r := require_member(ws, uo, 'rates.set');
+  begin
+    insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor,recorded_by)
+    values (ws,a,'2026-09-01','HOUR',3000,ua);
+    st := 'none';
+  exception when others then get stacked diagnostics st = returned_sqlstate; end;
+  assert st = 'CT403', 'recorded_by cannot name someone else';
+  insert into rate_agreements (workspace_id,assignment_id,effective_from,pay_basis,rate_minor) values (ws,a,'2026-09-01','HOUR',3000);
+  assert (select recorded_by from rate_agreements where assignment_id = a) = uo, 'actor recorded';
+  raise notice '11c_inviters_and_actor: PASS';
+end $$;
+
+-- many accounts can't add up guesses on one invitation email; the link still works
+do $$
+declare uo uuid; ws uuid; u uuid; tok bytea; r jsonb;
+begin
+  insert into users (apple_sub) values ('t:spray-org') returning id into uo;
+  ws := create_workspace(uo, 'HOME', 'Spray', 'USD', null);
+  tok := sha256('spray-link'::bytea);
+  perform create_invitation(ws, uo, gen_random_uuid(), 'PARTNER', null, null, 'spray@example.com', tok,
+                            sha256(convert_to('spray@example.com:777777','UTF8')));
+  for k in 1..4 loop
+    insert into users (apple_sub) values ('t:spray-' || k) returning id into u;
+    for i in 1..5 loop perform accept_invitation_code(u, 'spray@example.com', sha256('wrong'::bytea)); end loop;
+  end loop;
+  insert into users (apple_sub) values ('t:spray-real') returning id into u;
+  r := accept_invitation_code(u, 'spray@example.com', sha256(convert_to('spray@example.com:777777','UTF8')));
+  assert r->>'error' = 'INVITATION_CODE_WRONG', 'code path off after 20 wrong tries across accounts';
+  r := accept_invitation(u, tok);
+  assert r->>'role' = 'PARTNER', 'the link still works';
+  raise notice '11d_code_spray: PASS';
+end $$;
diff --git a/lib/api-spec/openapi.yaml b/lib/api-spec/openapi.yaml
index eacbec2..62872df 100644
--- a/lib/api-spec/openapi.yaml
+++ b/lib/api-spec/openapi.yaml
@@ -122,7 +122,7 @@ paths:
     get:
       operationId: getMe
       tags: [account]
-      summary: Get the authenticated owner and workspace
+      summary: Get the authenticated account and its active workspaces
       security:
         - bearerAuth: []
       responses:
@@ -141,13 +141,371 @@ paths:
           $ref: "#/components/responses/Unauthorized"
         "500":
           $ref: "#/components/responses/ServerError"
+    patch:
+      operationId: updateAccountName
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/AccountNameInput" }
+      responses:
+        "200":
+          description: Updated name
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/NameResult" }
+  /v1/config:
+    get:
+      operationId: getConfig
+      responses:
+        "200":
+          description: Public feature flag
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/PublicConfig" }
+  /v1/workspaces:
+    post:
+      operationId: createWorkspace
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/WorkspaceInput" }
+      responses:
+        "200": &workspaceResponse
+          description: Workspace
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/Workspace" }
+  /v1/workspace:
+    parameters: &workspaceParameters
+      - { $ref: "#/components/parameters/WorkspaceHeader" }
+    get:
+      operationId: getWorkspace
+      security: [{ bearerAuth: [] }]
+      responses:
+        "200":
+          description: Workspace and current member permissions
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/WorkspaceAccess" }
+    patch:
+      operationId: renameWorkspace
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/WorkspaceNameInput" }
+      responses:
+        "200": *workspaceResponse
+  /v1/members:
+    parameters: *workspaceParameters
+    get:
+      operationId: listMembers
+      security: [{ bearerAuth: [] }]
+      responses:
+        "200":
+          description: Active members; emails only with members.manage
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/MemberList" }
+  /v1/members/{userId}:
+    parameters:
+      - { $ref: "#/components/parameters/WorkspaceHeader" }
+      - name: userId
+        in: path
+        required: true
+        schema: { type: string, format: uuid }
+    delete:
+      operationId: removeMember
+      security: [{ bearerAuth: [] }]
+      requestBody: &operationBody
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/OperationInput" }
+      responses:
+        "200": &okResponse
+          description: Operation completed
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/OkResult" }
+    patch:
+      operationId: changeMemberRole
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/MemberRoleInput" }
+      responses:
+        "200": *okResponse
+  /v1/invitations:
+    parameters: *workspaceParameters
+    get:
+      operationId: listInvitations
+      security: [{ bearerAuth: [] }]
+      responses:
+        "200":
+          description: Pending and recent invitations; never raw credentials
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/InvitationList" }
+    post:
+      operationId: createInvitation
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/InvitationInput" }
+      responses:
+        "200":
+          description: Credentials returned once; replay returns null credentials
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/InvitationCreated" }
+  /v1/invitations/{id}:
+    parameters:
+      - { $ref: "#/components/parameters/WorkspaceHeader" }
+      - name: id
+        in: path
+        required: true
+        schema: { type: string, format: uuid }
+    delete:
+      operationId: revokeInvitation
+      security: [{ bearerAuth: [] }]
+      requestBody: *operationBody
+      responses:
+        "200": *okResponse
+  /v1/invite/peek:
+    post:
+      operationId: peekInvitation
+      requestBody: &tokenBody
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/InvitationTokenInput" }
+      responses:
+        "200":
+          description: Workspace name and role only, or unavailable
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/InvitationPreview" }
+  /v1/invite/accept:
+    post:
+      operationId: acceptInvitation
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/InvitationAcceptInput" }
+      responses:
+        "200": &joinedResponse
+          description: Membership created or reactivated
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/InvitationAccepted" }
+        "410":
+          description: Invitation not available
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/ErrorResponse" }
+  /v1/invite/accept-code:
+    post:
+      operationId: acceptInvitationCode
+      security: [{ bearerAuth: [] }]
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema: { $ref: "#/components/schemas/InvitationCodeInput" }
+      responses:
+        "200": *joinedResponse
+        "400":
+          description: Wrong, expired or rate-exhausted code; one opaque answer
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/ErrorResponse" }
+  /v1/invite/decline:
+    post:
+      operationId: declineInvitation
+      requestBody: *tokenBody
+      responses:
+        "200": *okResponse
 components:
+  parameters:
+    WorkspaceHeader:
+      name: X-Workspace-Id
+      in: header
+      required: true
+      schema: { type: string, format: uuid }
   securitySchemes:
     bearerAuth:
       type: http
       scheme: bearer
       bearerFormat: opaque
   schemas:
+    PublicConfig:
+      type: object
+      required: [business_enabled]
+      properties:
+        business_enabled: { type: boolean }
+      additionalProperties: false
+    OperationInput:
+      type: object
+      required: [operation_id]
+      properties:
+        operation_id: { type: string, format: uuid }
+      additionalProperties: false
+    WorkspaceInput:
+      type: object
+      required: [operation_id, kind, name, timezone]
+      properties:
+        operation_id: { type: string, format: uuid }
+        kind: { type: string, enum: [HOME, BUSINESS] }
+        name: { type: string, minLength: 1, maxLength: 80 }
+        timezone: { type: string, minLength: 1, maxLength: 100 }
+      additionalProperties: false
+    WorkspaceNameInput:
+      type: object
+      required: [operation_id, name]
+      properties:
+        operation_id: { type: string, format: uuid }
+        name: { type: string, minLength: 1, maxLength: 80 }
+      additionalProperties: false
+    AccountNameInput:
+      type: object
+      required: [operation_id, display_name]
+      properties:
+        operation_id: { type: string, format: uuid }
+        display_name: { type: string, maxLength: 60 }
+      additionalProperties: false
+    NameResult:
+      type: object
+      required: [display_name]
+      properties:
+        display_name: { type: [string, "null"] }
+    OkResult:
+      type: object
+      required: [ok]
+      properties:
+        ok: { type: boolean }
+    WorkspaceAccess:
+      allOf:
+        - { $ref: "#/components/schemas/Workspace" }
+        - type: object
+          required: [role, financial_access, worker_id, can]
+          properties:
+            role: { type: string }
+            financial_access: { type: [boolean, "null"] }
+            worker_id: { type: [string, "null"], format: uuid }
+            can:
+              type: object
+              additionalProperties: { type: boolean }
+    MemberRoleInput:
+      type: object
+      required: [operation_id, role]
+      properties:
+        operation_id: { type: string, format: uuid }
+        role: { type: string, enum: [ORGANIZER, PARTNER, OWNER, ADMIN, LEAD, WORKER] }
+        financial_access: { type: [boolean, "null"] }
+      additionalProperties: false
+    Member:
+      type: object
+      required: [user_id, display_name, name, role, financial_access, joined_at]
+      properties:
+        user_id: { type: string, format: uuid }
+        display_name: { type: [string, "null"] }
+        name: { type: string }
+        role: { type: string }
+        financial_access: { type: [boolean, "null"] }
+        joined_at: { type: string, format: date-time }
+        email: { type: [string, "null"] }
+    MemberList:
+      type: object
+      required: [members]
+      properties:
+        members:
+          type: array
+          items: { $ref: "#/components/schemas/Member" }
+    InvitationInput:
+      type: object
+      required: [operation_id, role, email]
+      properties:
+        operation_id: { type: string, format: uuid }
+        role: { type: string, enum: [PARTNER, ADMIN, LEAD, WORKER] }
+        email: { type: string, format: email, maxLength: 254 }
+        name: { type: string, maxLength: 60 }
+        financial_access: { type: [boolean, "null"] }
+        worker_id: { type: [string, "null"], format: uuid }
+      additionalProperties: false
+    Invitation:
+      type: object
+      required: [id, invitee_name, email, role, status, expires_at]
+      properties:
+        id: { type: string, format: uuid }
+        invitee_name: { type: [string, "null"] }
+        email: { type: string, format: email }
+        role: { type: string }
+        status: { type: string, enum: [PENDING, ACCEPTED, REVOKED, DECLINED, EXPIRED] }
+        expires_at: { type: string, format: date-time }
+    InvitationList:
+      type: object
+      required: [invitations]
+      properties:
+        invitations:
+          type: array
+          items: { $ref: "#/components/schemas/Invitation" }
+    InvitationCreated:
+      type: object
+      required: [id, expires_at, token, code, link, already_created]
+      properties:
+        id: { type: string, format: uuid }
+        expires_at: { type: string, format: date-time }
+        token: { type: [string, "null"] }
+        code: { type: [string, "null"] }
+        link: { type: [string, "null"] }
+        already_created: { type: boolean }
+    InvitationTokenInput:
+      type: object
+      required: [token]
+      properties:
+        token: { type: string, pattern: "^[A-Za-z0-9_-]{43}$" }
+      additionalProperties: false
+    InvitationAcceptInput:
+      type: object
+      required: [token, operation_id]
+      properties:
+        token: { type: string, pattern: "^[A-Za-z0-9_-]{43}$" }
+        operation_id: { type: string, format: uuid }
+      additionalProperties: false
+    InvitationCodeInput:
+      type: object
+      required: [email, code, operation_id]
+      properties:
+        email: { type: string, format: email, maxLength: 254 }
+        code: { type: string, pattern: "^[0-9]{6}$" }
+        operation_id: { type: string, format: uuid }
+      additionalProperties: false
+    InvitationPreview:
+      type: object
+      required: [available]
+      properties:
+        available: { type: boolean }
+        workspace_name: { type: string }
+        role: { type: string }
+    InvitationAccepted:
+      type: object
+      required: [workspace_id, role, already_member]
+      properties:
+        workspace_id: { type: string, format: uuid }
+        role: { type: string }
+        already_member: { type: boolean }
     HealthStatus:
       type: object
       properties:
@@ -189,7 +547,7 @@ components:
           maxLength: 4096
         label:
           type: string
-          enum: [owner-a, owner-b]
+          enum: [owner-a, owner-b, member-c, member-d]
       required: [code, label]
       additionalProperties: false
     AppleSignInResponse:
@@ -199,20 +557,20 @@ components:
           type: string
           minLength: 43
           maxLength: 43
-        workspace:
-          $ref: "#/components/schemas/Workspace"
         user:
           $ref: "#/components/schemas/User"
-      required: [sessionToken, workspace, user]
+      required: [sessionToken, user]
       additionalProperties: false
     MeResponse:
       type: object
       properties:
-        workspace:
-          $ref: "#/components/schemas/Workspace"
+        workspaces:
+          type: array
+          items:
+            $ref: "#/components/schemas/WorkspaceSummary"
         user:
-          $ref: "#/components/schemas/User"
-      required: [workspace, user]
+          $ref: "#/components/schemas/AccountUser"
+      required: [workspaces, user]
       additionalProperties: false
     Workspace:
       type: object
@@ -222,15 +580,32 @@ components:
           format: uuid
         name:
           type: string
-          const: My workspace
         currency:
           type: string
           const: USD
-        locale:
+        kind:
           type: string
-          const: en-US
-      required: [id, name, currency, locale]
-      additionalProperties: false
+          enum: [HOME, BUSINESS]
+        default_timezone:
+          type: [string, "null"]
+      required: [id, name, currency, kind, default_timezone]
+    WorkspaceSummary:
+      type: object
+      required: [id, name, kind, role, financial_access]
+      properties:
+        id: { type: string, format: uuid }
+        name: { type: string }
+        kind: { type: string, enum: [HOME, BUSINESS] }
+        role: { type: string }
+        financial_access: { type: [boolean, "null"] }
+    AccountUser:
+      type: object
+      required: [id, display_name, email, has_apple]
+      properties:
+        id: { type: string, format: uuid }
+        display_name: { type: [string, "null"] }
+        email: { type: [string, "null"] }
+        has_apple: { type: boolean }
     User:
       type: object
       properties:
```
