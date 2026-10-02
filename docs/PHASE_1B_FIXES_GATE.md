# Phase 1b independent-review fixes — gate

All seven review items are addressed: six code fixes and the development-data/reset-history report. BUSINESS_ENABLED is unchanged and the live config returns exactly false. replit.md remains byte-for-byte identical to the supplied brief; schema, migrations, money functions, role_can and require_member are unchanged. No Phase 1c work was started.

## Changes and regression checks

1. Accept-code request hashing uses code_hash (the CODE_PEPPER HMAC), never the raw code; token acceptance uses token_hash. Tests read each stored request_hash, match the transformed form and reject reproduction from either raw-body form. Actor and route/operation identity remain covered.
2. The actor test contains no handler-level recorded_by rejection. A test-only rates.set route inserts a forged rate row and the database trigger yields 403 FORBIDDEN. A one-connection pool plus pg_backend_pid equality proves crewtally.actor is clean on the same connection after both commit and rollback. The rate insert rolls back completely.
3. Decline has invitationLimiter(20); the 21st anonymous call gets 429 TOO_MANY and Retry-After. The OpenAPI contract documents 429 and the client was regenerated.
4. Dynamic app.config.ts reads only APP_ENV, default unknown; app.json has no fixed appEnv. Both __DEV__ and appEnv=development remain required, and existing release-guard tests are retained. New config tests cover development, production and unset APP_ENV.
5. A missing me row returns the exact Phase 1 SESSION_EXPIRED envelope. Tests cover a soft-deleted account and deletion between successful session validation and the me query, so the new branch is actually exercised.
6. Resend continues after revoke 404; Leave completes afterLeaving and switcher navigation after 404. Other errors are still thrown/reported; no permissions were broadened. One native-render Jest regression test covers each requested case.

## Full gate

Database: 8 SQL files / 12 PASS groups. Server: 5 files / 170 tests. Mobile: 8 suites / 82 tests. All pass with zero failures; the final mobile command exits successfully without forceExit or a leaked-handle warning. The new query-client fixture cancels queries, awaits mutation completion, clears caches and disables unneeded test GC timers. API/mobile typechecks, codegen and shared-library build pass. No web suite is required before Phase 1c.

```text
DB
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
 ✓ test/startup.test.ts (4 tests) 11ms
 ✓ test/shared.test.ts (26 tests) 16ms
 ✓ test/foundation.test.ts (6 tests) 1499ms
 ✓ test/auth.test.ts (41 tests) 3191ms
 ✓ test/identity.test.ts (93 tests) 8582ms
 Test Files  5 passed (5)
      Tests  170 passed (170)
   Duration  9.70s (transform 885ms, setup 0ms, collect 2.78s, tests 13.30s, environment 1ms, prepare 549ms)
MOBILE
PASS __tests__/invitationRaces.test.tsx
PASS __tests__/auth.test.tsx
PASS __tests__/signInAvailability.test.tsx
PASS __tests__/workspace.test.tsx
PASS __tests__/sessionRace.test.tsx
PASS __tests__/components.test.tsx
PASS __tests__/mobileApi.test.ts
PASS __tests__/appConfig.test.ts
Test Suites: 8 passed, 8 total
Tests:       82 passed, 82 total
Time:        6.868 s, estimated 8 s
API STARTUP
[21:18:46.022] INFO (6999): Migrations ready
    applied: 0
[21:18:46.027] INFO (6999): Server listening
    port: 8080
EXPO STARTUP
Starting project at /home/runner/workspace/artifacts/crewtally-mobile
Starting Metro Bundler
/home/runner/workspace/node_modules/.pnpm/@react-native+debugger-shell@0.86.3/node_modules/@react-native/debugger-shell/bin/react-native-devtools: error while loading shared libraries: libdbus-1.so.3: cannot open shared object file: No such file or directory
› Scan the QR code above to open in Expo Go.
› Using Expo Go
Web Bundled 1430ms node_modules/.pnpm/expo-router@57.0.24_cb5c7044c53fe67819d4fc27a3be1ef1/node_modules/expo-router/entry.js (1612 modules)

```

Live requests: /api/v1/health returns HTTP 200 with {"status":"ok","db":"ok","migrations":3}; /api/v1/config returns HTTP 200 with {"business_enabled":false}. The 402×874 sign-in screenshot confirms development sign-in is present with the dynamic development label and there is no runtime error.

## Development database: actual output

Executed in this order:

```sql
select count(*) from users;
select count(*) from workspaces;
select filename, sha256, applied_at from schema_migrations order by filename;
```

```text
 count 
-------
     0
(1 row)

 count 
-------
     0
(1 row)

             filename              |                              sha256                              |          applied_at           
-----------------------------------+------------------------------------------------------------------+-------------------------------
 0001_schema.sql                   | 5d799661564b8173eb174acf4bd903e5b93d8788dd83233474dc88db6b11c60e | 2026-09-25 01:11:06.865628+00
 0002_auth.sql                     | 1ce0d08c7a7017da7badcb9a764127132bfc51a02306dc21ee43d38a77ea00cd | 2026-10-01 17:05:39.052921+00
 0003_identity_and_memberships.sql | f533f83076ef10e6e3b745c9660e34c4dac168bc892176f67c4ef9e82b168b4f | 2026-10-02 20:25:31.947617+00
(3 rows)


```

**Reset history:** I did not reset the development database during Phase 1b or this fix pass. The ledger still contains the original schema and auth timestamps above, followed by the Phase 1b identity migration. The previous Phase 1b query already found zero legacy workspaces. Tests create and drop only isolated schemas, not public development records. I cannot certify any earlier or external data reset from row counts and the migration ledger alone; zero users/workspaces is not proof of a reset. Both development idempotency tables were also checked and had zero rows, so there were no existing real-user raw-body request hashes to migrate or delete.

## Actual changed code for every fix

```diff
diff --git a/artifacts/api-server/src/routes/invitations.ts b/artifacts/api-server/src/routes/invitations.ts
index b9f3107..a20f97f 100644
--- a/artifacts/api-server/src/routes/invitations.ts
+++ b/artifacts/api-server/src/routes/invitations.ts
@@ -71,12 +71,20 @@ export function createInvitationRouter(db: Pool, env: NodeJS.ProcessEnv) {
       const body = byCode
         ? operation.extend({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body)
         : operation.extend({ token: tokenSchema }).strict().parse(req.body);
+      // Never expose a low-entropy code to an unkeyed, offline-guessable request hash.
+      const credentialHash = "token" in body
+        ? tokenHash(body.token)
+        : invitationCodeHash(config(env).pepper, body.email, body.code);
+      const hashInput = "token" in body
+        ? { route: "POST /invite/accept", operation_id: body.operation_id, token_hash: credentialHash.toString("hex") }
+        : { route: "POST /invite/accept-code", operation_id: body.operation_id, email: body.email,
+          code_hash: credentialHash.toString("hex") };
       const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
-        { route: byCode ? "POST /invite/accept-code" : "POST /invite/accept", ...body }, async () => {
+        hashInput, async () => {
           const result = "token" in body
-            ? await tx.query("select accept_invitation($1,$2) as result", [req.ctx!.userId, tokenHash(body.token)])
+            ? await tx.query("select accept_invitation($1,$2) as result", [req.ctx!.userId, credentialHash])
             : await tx.query("select accept_invitation_code($1,$2,$3) as result",
-              [req.ctx!.userId, body.email, invitationCodeHash(config(env).pepper, body.email, body.code)]);
+              [req.ctx!.userId, body.email, credentialHash]);
           return result.rows[0].result;
         }));
       // COMMIT precedes mapping error results: attempts and expiry/revocation changes must survive.
@@ -88,7 +96,7 @@ export function createInvitationRouter(db: Pool, env: NodeJS.ProcessEnv) {
   };
   sessionRoute(router, db, "post", "/invite/accept", accept(false));
   sessionRoute(router, db, "post", "/invite/accept-code", invitationLimiter(10, true), accept(true));
-  publicRoute(router, "post", "/invite/decline", async (req, res, next) => {
+  publicRoute(router, "post", "/invite/decline", invitationLimiter(20), async (req, res, next) => {
     try {
       const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
       const result = await db.query("select decline_invitation($1) as result", [tokenHash(token)]);
diff --git a/artifacts/api-server/src/routes/me.ts b/artifacts/api-server/src/routes/me.ts
index d98c8bf..0ee3c1e 100644
--- a/artifacts/api-server/src/routes/me.ts
+++ b/artifacts/api-server/src/routes/me.ts
@@ -13,7 +13,16 @@ export function createMeRouter(db: Pool): IRouter {
         `select id, display_name, email, (apple_sub is not null and apple_sub not like 'dev:%') as has_apple,
          my_workspaces(id) as workspaces from users where id = $1 and deleted_at is null`, [req.ctx!.userId],
       );
-      const { workspaces, ...user } = result.rows[0];
+      const row = result.rows[0];
+      if (!row) {
+        res.status(401).json({ error: {
+          code: "SESSION_EXPIRED",
+          message: "Session expired",
+          correlationId: res.locals.correlationId,
+        } });
+        return;
+      }
+      const { workspaces, ...user } = row;
       res.json({ user, workspaces });
     } catch (error) { next(error); }
   });
diff --git a/artifacts/api-server/test/identity.test.ts b/artifacts/api-server/test/identity.test.ts
index 863fd1c..8796fa7 100644
--- a/artifacts/api-server/test/identity.test.ts
+++ b/artifacts/api-server/test/identity.test.ts
@@ -116,6 +116,33 @@ async function invite(owner: Awaited<ReturnType<typeof homeFixture>>["owner"], e
 }
 
 describe("identity and workspace writes", () => {
+  it("soft-deleted users receive the unchanged 401 SESSION_EXPIRED envelope", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const user = await h.createUser("deleted");
+    const agent = (await h.agentFor(user)).agent;
+    await db.query("update users set deleted_at=now(), apple_sub=null, email=null, email_verified_at=null where id=$1", [user.userId]);
+    const result = await agent.get("/v1/me");
+    expect(result.status).toBe(401);
+    expect(result.body).toEqual({ error: { code: "SESSION_EXPIRED", message: "Session expired", correlationId: expect.any(String) } });
+  });
+  it("returns SESSION_EXPIRED if the user disappears after session validation but before GET /me", async () => {
+    const app = appFor(), h = createTenancyHarness(db, app);
+    const user = await h.createUser("deleted-race");
+    const agent = (await h.agentFor(user)).agent;
+    const query = db.query.bind(db);
+    const spy = vi.spyOn(db, "query").mockImplementation((async (text: string, values?: unknown[]) => {
+      const result = await query(text, values);
+      if (text.includes("WITH eligible AS")) {
+        await query("update users set deleted_at=now(), apple_sub=null, email=null, email_verified_at=null where id=$1", [user.userId]);
+      }
+      return result;
+    }) as never);
+    try {
+      const result = await agent.get("/v1/me");
+      expect(result.status).toBe(401);
+      expect(result.body).toEqual({ error: { code: "SESSION_EXPIRED", message: "Session expired", correlationId: expect.any(String) } });
+    } finally { spy.mockRestore(); }
+  });
   it("creates HOME once, separates users and detects changed-body and concurrent replays", async () => {
     const app = appFor(), h = createTenancyHarness(db, app);
     const first = await h.createUser("create"), second = await h.createUser("second");
@@ -174,6 +201,43 @@ describe("identity and workspace writes", () => {
 });
 
 describe("invitation credentials and committed errors", () => {
+  it("persists only the request hash of peppered code/hash-token forms, never the raw credentials", async () => {
+    const { owner, h, partner } = await homeFixture();
+    const { body, data } = await invite(owner);
+    const agent = (await h.agentFor(partner)).agent;
+    const byCode = { ...op(), email: body.email, code: data.code };
+    expect((await agent.post("/v1/invite/accept-code").send(byCode)).status).toBe(200);
+    const codeStored = (await db.query(
+      "select request_hash from user_idempotency_keys where user_id=$1 and operation_id=$2",
+      [partner.userId, byCode.operation_id])).rows[0].request_hash;
+    expect(codeStored).toBe(requestHash(partner.userId, {
+      route: "POST /invite/accept-code", operation_id: byCode.operation_id, email: body.email,
+      code_hash: invitationCodeHash(env.CODE_PEPPER, body.email, data.code).toString("hex"),
+    }));
+    expect(codeStored === requestHash(partner.userId, byCode)).toBe(false);
+    expect(codeStored === requestHash(partner.userId, { route: "POST /invite/accept-code", ...byCode })).toBe(false);
+    const second = await homeFixture();
+    const secondInvite = await invite(second.owner);
+    const byToken = { ...op(), token: secondInvite.data.token };
+    expect((await agent.post("/v1/invite/accept").send(byToken)).status).toBe(200);
+    const tokenStored = (await db.query(
+      "select request_hash from user_idempotency_keys where user_id=$1 and operation_id=$2",
+      [partner.userId, byToken.operation_id])).rows[0].request_hash;
+    expect(tokenStored).toBe(requestHash(partner.userId, {
+      route: "POST /invite/accept", operation_id: byToken.operation_id, token_hash: tokenHash(byToken.token).toString("hex"),
+    }));
+    expect(tokenStored === requestHash(partner.userId, byToken)).toBe(false);
+    expect(tokenStored === requestHash(partner.userId, { route: "POST /invite/accept", ...byToken })).toBe(false);
+  });
+  it("limits anonymous decline to 20 calls per minute and returns 429 on the 21st", async () => {
+    const app = appFor();
+    const token = randomBytes(32).toString("base64url");
+    for (let n = 0; n < 20; n++) expect((await request(app).post("/v1/invite/decline").send({ token })).status).toBe(200);
+    const blocked = await request(app).post("/v1/invite/decline").send({ token });
+    expect(blocked.status).toBe(429);
+    expect(blocked.body.error.code).toBe("TOO_MANY");
+    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
+  });
   it("commits expired-link status even when the HTTP result is 410", async () => {
     const { owner, h, partner, app } = await homeFixture();
     const { data } = await invite(owner);
@@ -362,28 +426,47 @@ describe("function-level refusals, scoping and immediate removal", () => {
 });
 
 describe("actor is transaction scoped", () => {
-  it("record_payment through a test-only withMember route records the caller and refuses a forged actor", async () => {
+  it("record_payment records the caller; the database trigger rejects a forged rate actor and cleans the same connection", async () => {
     const app = appFor(), h = createTenancyHarness(db, app);
     const owner = await h.createOwner();
     const worker = (await db.query("insert into workers(workspace_id,display_name) values($1,'W') returning id", [owner.workspaceId])).rows[0].id;
     const project = (await db.query("insert into projects(workspace_id,name,timezone) values($1,'P','UTC') returning id", [owner.workspaceId])).rows[0].id;
     const assignment = (await db.query("insert into assignments(workspace_id,project_id,worker_id,start_date) values($1,$2,$3,'2026-10-01') returning id",
       [owner.workspaceId, project, worker])).rows[0].id;
+    const other = await h.createUser("other-actor");
+    // A one-connection pool proves cleanup on the exact connection used by both transactions.
+    const actorDb = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 1 });
     const router = Router();
-    memberRoute(router, db, "post", "/test/payment", "money.record", async (tx, _member, ws, req) => {
-      if (req.body.recorded_by && req.body.recorded_by !== req.ctx!.userId) {
-        throw Object.assign(new Error("Actor mismatch"), { code: "CT403" });
-      }
+    let transactionPid: number | undefined;
+    memberRoute(router, actorDb, "post", "/test/payment", "money.record", async (tx, _member, ws, req) => {
+      transactionPid = (await tx.query("select pg_backend_pid() as pid")).rows[0].pid;
       const result = await tx.query("select record_payment($1,$2,'2026-10-02','CASH',null,100,'W',null,$3) as result",
         [ws, req.body.operation_id, JSON.stringify([{ assignment_id: assignment, amount_minor: 100 }])]);
       return result.rows[0].result;
     });
-    const moneyApp = createApp({ db, env, logger, testOnlyProtectedRouter: router });
-    const moneyAgent = (await createTenancyHarness(db, moneyApp).agentFor({ userId: owner.userId }, owner.workspaceId)).agent;
-    expect((await moneyAgent.post("/v1/test/payment").send(op())).status).toBe(200);
-    expect((await db.query("select recorded_by from payments where workspace_id=$1", [owner.workspaceId])).rows[0].recorded_by).toBe(owner.userId);
-    expect((await moneyAgent.post("/v1/test/payment").send({ ...op(), recorded_by: randomUUID() })).status).toBe(403);
-    const clean = await db.query("select nullif(current_setting('crewtally.actor',true),'') as actor");
-    expect(clean.rows[0].actor).toBeNull();
+    memberRoute(router, actorDb, "post", "/test/forged-rate", "rates.set", async (tx, _member, ws) => {
+      transactionPid = (await tx.query("select pg_backend_pid() as pid")).rows[0].pid;
+      // No handler-level recorded_by check: rejection must be the provided database trigger.
+      await tx.query(`insert into rate_agreements(workspace_id,assignment_id,effective_from,pay_basis,rate_minor,recorded_by)
+        values($1,$2,'2026-10-01','HOUR',100,$3)`, [ws, assignment, other.userId]);
+      return { ok: true };
+    });
+    try {
+      const moneyApp = createApp({ db: actorDb, env, logger, testOnlyProtectedRouter: router });
+      const moneyAgent = (await createTenancyHarness(actorDb, moneyApp).agentFor({ userId: owner.userId }, owner.workspaceId)).agent;
+      const assertCleanSameConnection = async () => {
+        const clean = await actorDb.query("select pg_backend_pid() as pid, nullif(current_setting('crewtally.actor',true),'') as actor");
+        expect(clean.rows[0].pid).toBe(transactionPid);
+        expect(clean.rows[0].actor).toBeNull();
+      };
+      expect((await moneyAgent.post("/v1/test/payment").send(op())).status).toBe(200);
+      expect((await db.query("select recorded_by from payments where workspace_id=$1", [owner.workspaceId])).rows[0].recorded_by).toBe(owner.userId);
+      await assertCleanSameConnection();
+      const forged = await moneyAgent.post("/v1/test/forged-rate").send(op());
+      expect(forged.status).toBe(403);
+      expect(forged.body.error.code).toBe("FORBIDDEN");
+      expect((await db.query("select count(*)::int as n from rate_agreements where assignment_id=$1", [assignment])).rows[0].n).toBe(0);
+      await assertCleanSameConnection();
+    } finally { await actorDb.end(); }
   });
 });
\ No newline at end of file
diff --git a/artifacts/crewtally-mobile/app.json b/artifacts/crewtally-mobile/app.json
index 67898a8..ea7f96b 100644
--- a/artifacts/crewtally-mobile/app.json
+++ b/artifacts/crewtally-mobile/app.json
@@ -20,9 +20,6 @@
     "experiments": {
       "typedRoutes": true,
       "reactCompiler": true
-    },
-    "extra": {
-      "appEnv": "development"
     }
   }
 }
diff --git a/artifacts/crewtally-mobile/app/(tabs)/more.tsx b/artifacts/crewtally-mobile/app/(tabs)/more.tsx
index 459f0bf..97e0c5f 100644
--- a/artifacts/crewtally-mobile/app/(tabs)/more.tsx
+++ b/artifacts/crewtally-mobile/app/(tabs)/more.tsx
@@ -31,7 +31,12 @@ export default function MoreScreen() {
     setLeaving(true);
     setLeaveError(null);
     try {
-      await removeMember(userId, leaveOp.idFor(`leave|${workspaceId}`));
+      try {
+        await removeMember(userId, leaveOp.idFor(`leave|${workspaceId}`));
+      } catch (e) {
+        if ((e as { status?: number } | null)?.status !== 404) throw e;
+        // Already removed/left: complete the same local cleanup and navigation.
+      }
       leaveOp.done();
       await afterLeaving();
       router.replace('/switcher' as never);
diff --git a/artifacts/crewtally-mobile/app/partner.tsx b/artifacts/crewtally-mobile/app/partner.tsx
index 6f252c8..69db973 100644
--- a/artifacts/crewtally-mobile/app/partner.tsx
+++ b/artifacts/crewtally-mobile/app/partner.tsx
@@ -80,7 +80,12 @@ export default function PartnerScreen() {
   const resend = useMutation({
     // Revoke this invitation, then create a new one to the same email: new link, new code, new 7 days.
     mutationFn: async (inv: { id: string; email: string; name: string | null }) => {
-      await revokeInvitation(inv.id, revokeOp.idFor(inv.id));
+      try {
+        await revokeInvitation(inv.id, revokeOp.idFor(inv.id));
+      } catch (e) {
+        if ((e as { status?: number } | null)?.status !== 404) throw e;
+        // It disappeared between listing and revoke: still create a replacement.
+      }
       revokeOp.done();
       const body = { role: 'PARTNER' as const, email: inv.email, ...(inv.name ? { name: inv.name } : {}) };
       return createInvitation(body, inviteOp.idFor(`resend|${inv.id}`));
diff --git a/lib/api-client-react/src/generated/api.ts b/lib/api-client-react/src/generated/api.ts
index b3639f6..573fa53 100644
--- a/lib/api-client-react/src/generated/api.ts
+++ b/lib/api-client-react/src/generated/api.ts
@@ -1633,7 +1633,7 @@ return customFetch<OkResult>(getDeclineInvitationUrl(),
 
 export const getDeclineInvitationMutationKey = () => ['declineInvitation'] as const;
 
-export const getDeclineInvitationMutationOptions = <TError = ErrorType<unknown>,
+export const getDeclineInvitationMutationOptions = <TError = ErrorType<ErrorResponse>,
     TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof declineInvitation>>, TError,DeclineInvitationMutationVariables, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationOptions<Awaited<ReturnType<typeof declineInvitation>>, TError,DeclineInvitationMutationVariables, TContext> => {
 
@@ -1662,10 +1662,10 @@ const {mutation: mutationOptions, request: requestOptions} = options ?
 
     export type DeclineInvitationMutationResult = NonNullable<Awaited<ReturnType<typeof declineInvitation>>>
     export type DeclineInvitationMutationBody = BodyType<InvitationTokenInput>
-    export type DeclineInvitationMutationError = ErrorType<unknown>
+    export type DeclineInvitationMutationError = ErrorType<ErrorResponse>
     export type DeclineInvitationMutationVariables = {data: BodyType<InvitationTokenInput>}
 
-    export const useDeclineInvitation = <TError = ErrorType<unknown>,
+    export const useDeclineInvitation = <TError = ErrorType<ErrorResponse>,
     TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof declineInvitation>>, TError,DeclineInvitationMutationVariables, TContext>, request?: SecondParameter<typeof customFetch>}
  ): UseMutationResult<
         Awaited<ReturnType<typeof declineInvitation>>,
diff --git a/lib/api-spec/openapi.yaml b/lib/api-spec/openapi.yaml
index 62872df..04d25dd 100644
--- a/lib/api-spec/openapi.yaml
+++ b/lib/api-spec/openapi.yaml
@@ -337,6 +337,14 @@ paths:
       requestBody: *tokenBody
       responses:
         "200": *okResponse
+        "429":
+          description: More than 20 invitation decline requests per client IP in one minute
+          headers:
+            Retry-After:
+              schema: { type: integer }
+          content:
+            application/json:
+              schema: { $ref: "#/components/schemas/ErrorResponse" }
 components:
   parameters:
     WorkspaceHeader:

```

### New: artifacts/crewtally-mobile/app.config.ts

```tsx
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (!config.name || !config.slug) {
    throw new Error('Expo app configuration is missing name or slug');
  }
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    extra: {
      ...config.extra,
      // Only this non-secret label is exposed, never the rest of process.env.
      appEnv: process.env.APP_ENV ?? 'unknown',
    },
  };
}
```

### New: artifacts/crewtally-mobile/__tests__/appConfig.test.ts

```tsx
import type { ConfigContext } from 'expo/config';
import appConfig from '../app.config';

const original = process.env.APP_ENV;
const context: ConfigContext = {
  projectRoot: '/fixture',
  staticConfigPath: '/fixture/app.json',
  packageJsonPath: '/fixture/package.json',
  config: { name: 'CrewTally', slug: 'crewtally-mobile', extra: { retainedSetting: 'fixture' } },
};
afterEach(() => {
  if (original === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = original;
});

it.each(['development', 'production'])('sets appEnv from APP_ENV=%s without dropping config', env => {
  process.env.APP_ENV = env;
  const result = appConfig(context);
  expect(result.extra).toEqual({ retainedSetting: 'fixture', appEnv: env });
  expect(result.name).toBe('CrewTally');
  expect(result.slug).toBe('crewtally-mobile');
});

it('uses unknown when APP_ENV is absent', () => {
  delete process.env.APP_ENV;
  expect(appConfig(context).extra?.appEnv).toBe('unknown');
});
```

### New: artifacts/crewtally-mobile/__tests__/invitationRaces.test.tsx

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-operation') }));
jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn(async () => ({ status: 'ok', db: 'ok', migrations: 3 })) }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'caller' }) }));
const mockWorkspace = {
  workspaceId: 'home', workspace: { id: 'home', name: 'My home', kind: 'HOME', role: 'ORGANIZER' },
  role: 'ORGANIZER', kind: 'HOME', can: { 'members.manage': true }, afterLeaving: jest.fn(),
};
jest.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => mockWorkspace }));
jest.mock('@/lib/mobileApi', () => ({
  getMembers: jest.fn(), getInvitations: jest.fn(), createInvitation: jest.fn(),
  revokeInvitation: jest.fn(), removeMember: jest.fn(),
}));

import * as api from '@/lib/mobileApi';
import PartnerScreen from '@/app/partner';
import MoreScreen from '@/app/(tabs)/more';

const mocked = api as jest.Mocked<typeof api>;
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  } });
  mocked.getMembers.mockResolvedValue({ members: [] });
  mocked.getInvitations.mockResolvedValue({ invitations: [] });
  mockWorkspace.role = 'ORGANIZER';
  mockWorkspace.can['members.manage'] = true;
  mockWorkspace.afterLeaving.mockResolvedValue(undefined);
});
afterEach(async () => {
  await client.cancelQueries();
  cleanup();
  client.clear();
});

it('Resend creates a replacement when the revoke step returns 404', async () => {
  mocked.getInvitations.mockResolvedValue({ invitations: [{
    id: 'old-invitation', invitee_name: 'Reference label', email: 'fixture@example.com',
    role: 'PARTNER', status: 'PENDING', expires_at: '2099-01-01T00:00:00Z',
  }] });
  mocked.revokeInvitation.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  mocked.createInvitation.mockResolvedValue({
    id: 'new-invitation', token: null, code: null, link: null, already_created: true,
  });
  render(<PartnerScreen />, { wrapper });
  await waitFor(() => screen.getByTestId('partner-resend'));
  fireEvent.press(screen.getByTestId('partner-resend'));
  await waitFor(() => expect(mocked.createInvitation).toHaveBeenCalledWith(
    { role: 'PARTNER', email: 'fixture@example.com', name: 'Reference label' }, 'test-operation',
  ));
  expect(mocked.revokeInvitation).toHaveBeenCalledWith('old-invitation', 'test-operation');
  await waitFor(() => screen.getByText('Invitation already created'));
  await waitFor(() => expect(screen.getByTestId('partner-resend').props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByTestId('partner-error')).toBeNull();
});

it('Leave treats 404 as already left, cleans workspace state and opens the switcher', async () => {
  mockWorkspace.role = 'PARTNER';
  mockWorkspace.can['members.manage'] = false;
  mocked.removeMember.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  render(<MoreScreen />, { wrapper });
  fireEvent.press(screen.getByTestId('more-leave'));
  fireEvent.press(screen.getByTestId('leave-confirm'));
  await waitFor(() => expect(mockWorkspace.afterLeaving).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/switcher'));
  expect(mocked.removeMember).toHaveBeenCalledWith('caller', 'test-operation');
  expect(screen.queryByText('Could not leave. Check your connection and try again.')).toBeNull();
});
```

## Files changed

```text
 M .agents/agent_assets_metadata.toml
 M .agents/memory/MEMORY.md
 M .agents/memory/query-cache-test-lifecycle.md
 M artifacts/api-server/src/routes/invitations.ts
 M artifacts/api-server/src/routes/me.ts
 M artifacts/api-server/test/identity.test.ts
 M artifacts/crewtally-mobile/app.json
 M artifacts/crewtally-mobile/app/(tabs)/more.tsx
 M artifacts/crewtally-mobile/app/partner.tsx
 M lib/api-client-react/src/generated/api.ts
 M lib/api-spec/openapi.yaml
?? .agents/memory/credential-idempotency-hashing.md
?? artifacts/crewtally-mobile/__tests__/appConfig.test.ts
?? artifacts/crewtally-mobile/__tests__/invitationRaces.test.tsx
?? artifacts/crewtally-mobile/app.config.ts?? docs/PHASE_1B_FIXES_GATE.md
```

The asset metadata was updated automatically when this report was registered in the Library. The memory notes record the offline-guessing security lesson and asynchronous test-cache cleanup constraint; neither stores credentials or personal data. No dependencies or lockfiles changed.

## Unfinished verification / environment warnings

No requested implementation fix is unfinished. The physical iPhone walkthrough and native Apple TestFlight check remain unperformed here; unit tests and the browser screenshot are not represented as device evidence. Proxy-aware client-IP limiting is the phase document’s explicit carried item, not Phase 1c implementation. Expo is running and has generated a fresh QR, but optional React Native DevTools still cannot load libdbus-1.so.3; the existing shadow-style warning also remains. API startup is clean. The source review snapshot docs/PHASE_1B_REVIEW_DIFF.md is unchanged and intentionally remains the pre-fix snapshot.

Phase 1b fixes ready for review
