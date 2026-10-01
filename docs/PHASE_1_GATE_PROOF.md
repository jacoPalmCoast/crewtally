# Phase 1 gate proof — 2026-10-01

The original proof snapshot below predates developer sign-in. The development-sign-in addendum at the end records the latest code, test results and changed files and supersedes the earlier route implementation and counts.

## Gate status: OPEN

Implementation and automated checks are complete. This is not a claim of final Phase 1 acceptance. Do not start Phase 2.

Owner decision on 2026-10-01: keep proxy trust disabled and leave the per-client-IP limiter gate open until the trusted ingress contract is confirmed. This does not close or satisfy that requirement.

### Open requirements

1. The trusted-ingress client-IP contract is not verified. Authentication currently limits 10 requests/minute per socket peer and ignores spoofable forwarding headers. Behind a shared reverse proxy, different phones may share a bucket. Do not enable forwarding-header trust without confirmed proxy peers/header rewrite semantics.
2. Owner decision: Real Sign in with Apple on a device is carried to the first TestFlight build at the end of Phase 2; Expo Go 1017880 lacks the ExpoAppleAuthentication native module. Phase 1 phone session, workspace and route-restoration checks use the development-only sign-in and remain owner acceptance items. Browser and unit tests are not phone evidence.

## Gate commands and final results

Commands: npm run test:db; npm run test:server -- --reporter=verbose; npm run test:mobile -- --verbose. Every final command exited 0.

~~~text
DB tests: all files passed
7 SQL files; 8 PASS groups; zero failures

Test Files  4 passed (4)
     Tests  70 passed (70)

Test Suites: 3 passed, 3 total
Tests:       31 passed, 31 total
Snapshots:   0 total
~~~

All existing tests stayed unchanged: 32 existing server tests and 8 existing mobile tests. No skipped, weakened, deleted, or exclusive tests. The initial mobile race-test run printed PASS but did not exit; its test-owned QueryClient GC timer was cleaned up. The final command exits normally without forceExit.

Shared library, API, mobile and scripts type checks pass. The whole-workspace type-check command is NOT green: the unchanged canvas sandbox has duplicate/incompatible React types in src/components/ui/calendar.tsx and spinner.tsx. That unrelated sandbox was not changed. Production dependency audit: 0 known vulnerabilities in every severity.

## Startup proof

Both configured services restarted successfully. API startup validated the provided config before migrations/listen; no Secret value was printed.

~~~text
[17:05:39.457] INFO: Migrations ready
    applied: 1
[17:05:39.465] INFO: Server listening
    port: 8080
Starting Metro Bundler
› Web: http://localhost:18359
› Using Expo Go (Press s to switch to development build)
Web Bundled ... (1526 modules)
~~~

Expo remains running, but its optional React Native DevTools installer still reports the pre-existing missing libdbus-1.so.3 warning. This is not a clean, warning-free startup; Metro and the app continue to serve. An update notice and shadow-style deprecation warning also remain.

Live API probes: GET /api/v1/health -> 200, {status:ok, db:ok, migrations:2}; unauthenticated GET /api/v1/me -> 401 SESSION_EXPIRED.

## Migration summary

Only db/migrations/0002_auth.sql was added. It creates users (unique Apple sub), sessions (unique SHA-256 bytea token hash; user FK), apple_credentials (ciphertext/IV/auth tag; user PK/FK), and adds workspaces.payer_display_name text. There is no workspace.owner_id-to-users FK. Existing workspaces and protected money functions remain unchanged. The live ledger lists 0001_schema.sql and 0002_auth.sql.

The migration and auth route link a new user and My workspace/USD workspace in one transaction; concurrent repeat sign-ins reuse the same workspace. No Apple email or name is stored.

Protected-file check: db/schema.sql, applied 0001, all provided SQL tests, db/provided, shared pay/money implementation, and existing server/mobile tests are unchanged. No Phase 2 migration was applied.

## Isolation and sessions

Two-owner harness self-test: each /me returns only its caller's workspace, including requests carrying forged workspace body/header values. A test-only resource route proves 404 across workspaces for GET, POST, PUT, PATCH and DELETE. No resource test route is registered by the production app. Every registered protected /v1 route returns 401 without a session. Missing, unknown, malformed, expired and revoked sessions are rejected; active expiry slides to 30 days when more than 24h have passed since last_seen_at.

The raw session token is 32 cryptographically random bytes encoded as 43-character base64url. Only its SHA-256 is stored server-side; database row checks assert the raw session token is absent. Signout revokes only the caller's session. req.ctx additionally includes a server-derived sessionId for signout; workspaceId is never sourced from caller-controlled input.

## Development versus production Apple exchange

Both environments first verify the signed identity token. Both attempt authorization-code exchange using a five-minute ES256 client secret. Only a failed exchange with explicit APP_ENV=development logs apple_exchange=skipped_dev and continues. Successful development and production refresh tokens are AES-256-GCM encrypted. A production exchange failure fails sign-in with no session/user/workspace side effect. Missing/unrecognized APP_ENV never enables the development bypass. Production audiences must contain only APPLE_BUNDLE_ID.

## Mobile and nonce contract

No Apple scopes are requested. Native nonce is SHA-256 hex of the 43-character base64url encoding of 32 random bytes; the raw nonce is sent only to the API. Expo SDK 57's iOS source assigns request.nonce = options.nonce without hashing. Local unit tests lock that contract, but the required real-phone confirmation remains unverified.

Session persistence is SecureStore only, with an in-memory request copy; there is no web/localStorage token fallback and no mutation-cache token storage. Launch calls /me. 401 clears the session, retains AsyncStorage drafts, displays Please sign in again, and remembers the screen for the same owner only. Network/server failures preserve the saved token and block the shell with retry. Serialization, epoch checks, and a cleanup barrier protect fresh sign-ins from old deletion and stale request responses.

More -> Account shows Signed in with Apple and confirms Sign out. More diagnostics shows the first 8 workspace-ID characters. Browser-only preview states that Apple sign-in requires the iPhone; it does not fake authentication. Anonymous browser /account -> /sign-in is verified at 402x874. Initial immediate capture was transiently white; the settled screen rendered correctly without errors. Native Apple flows were not browser-tested.

## Assumptions / deviations

- /me locale is fixed en-US for Phase 1 rather than adding an unspecified locale database column.
- Native raw nonce uses base64url, not hex: 32 bytes and SHA-256 hex comparison remain exactly as specified.
- Both /v1 and /api/v1 remain supported; the generated health URL is corrected to /api/v1/health.
- Signout confirmation is an in-screen confirmation panel rather than Alert; it also works in the web preview.
- Later-phase payer setting, export and account deletion actions were not added.
- Authentication/session endpoints follow P1's explicit request contract (no operation_id field). The broader idempotency invariant remains applicable to later financial writes; P1 does not specify retry identity for auth.
- Proxy-safe per-client rate limiting and real-phone acceptance remain open as above.

## Actual implementation proof

The following is copied from the current source, not a pseudocode description. It includes the complete PEM/config loader, token verification, client-secret/exchange/encryption helpers, requireSession, transaction/session creation SQL, signout and reusable tenancy harness.

### artifacts/api-server/src/auth/config.ts

~~~ts
import { createPrivateKey, type KeyObject } from "node:crypto";

export type AppEnvironment = "development" | "production";

export interface AuthConfig {
  appEnv: AppEnvironment;
  appleTeamId: string;
  appleKeyId: string;
  appleBundleId: string;
  appleAudiences: string[];
  applePrivateKey: KeyObject;
  tokenEncryptionKey: Buffer;
}

export type AuthConfigLoader = () => AuthConfig;

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

function requiredSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new AuthConfigError(`${name} Secret is missing`);
  return value;
}

function normalizePem(value: string): string {
  const withRealNewlines = value.replace(/\\n/g, "\n").trim();
  const match = withRealNewlines.match(
    /^-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----\s*([\s\S]*?)\s*-----END \1-----$/,
  );
  if (!match) throw new AuthConfigError("APPLE_PRIVATE_KEY Secret is invalid");

  const body = match[2]?.replace(/\s/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new AuthConfigError("APPLE_PRIVATE_KEY Secret is invalid");
  }

  const lines = body.match(/.{1,64}/g);
  if (!lines) throw new AuthConfigError("APPLE_PRIVATE_KEY Secret is invalid");
  return `-----BEGIN ${match[1]}-----\n${lines.join("\n")}\n-----END ${match[1]}-----\n`;
}

function loadP256PrivateKey(value: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(normalizePem(value));
  } catch (error) {
    if (error instanceof AuthConfigError) throw error;
    throw new AuthConfigError("APPLE_PRIVATE_KEY Secret is invalid");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new AuthConfigError("APPLE_PRIVATE_KEY Secret must be an EC P-256 private key");
  }
  return key;
}

function loadEncryptionKey(value: string): Buffer {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.byteLength !== 32 || decoded.toString("base64") !== value) {
      throw new Error("invalid length");
    }
    return decoded;
  } catch {
    throw new AuthConfigError("TOKEN_ENCRYPTION_KEY Secret must be base64 for exactly 32 bytes");
  }
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const appEnv = env.APP_ENV;
  if (appEnv !== "development" && appEnv !== "production") {
    throw new AuthConfigError("APP_ENV must be development or production");
  }

  const appleTeamId = requiredSecret(env, "APPLE_TEAM_ID");
  const appleKeyId = requiredSecret(env, "APPLE_KEY_ID");
  const applePrivateKeyValue = requiredSecret(env, "APPLE_PRIVATE_KEY");
  const appleBundleId = requiredSecret(env, "APPLE_BUNDLE_ID");
  const audienceValue = requiredSecret(env, "APPLE_AUDIENCES");
  const encryptionValue = requiredSecret(env, "TOKEN_ENCRYPTION_KEY");

  if (!/^[A-Z0-9]{10}$/.test(appleTeamId)) {
    throw new AuthConfigError("APPLE_TEAM_ID Secret is invalid");
  }
  if (!/^[A-Z0-9]{10}$/.test(appleKeyId)) {
    throw new AuthConfigError("APPLE_KEY_ID Secret is invalid");
  }
  if (appleBundleId.length > 255 || !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(appleBundleId)) {
    throw new AuthConfigError("APPLE_BUNDLE_ID Secret is invalid");
  }
  if (applePrivateKeyValue.length > 16_384) {
    throw new AuthConfigError("APPLE_PRIVATE_KEY Secret is invalid");
  }

  const appleAudiences = audienceValue.split(",").map(value => value.trim()).filter(Boolean);
  if (!appleAudiences.length || appleAudiences.length > 10 || new Set(appleAudiences).size !== appleAudiences.length) {
    throw new AuthConfigError("APPLE_AUDIENCES Secret is invalid");
  }
  if (appleAudiences.some(audience => audience.length > 255)) {
    throw new AuthConfigError("APPLE_AUDIENCES Secret is invalid");
  }
  if (!appleAudiences.includes(appleBundleId)) {
    throw new AuthConfigError("APPLE_AUDIENCES Secret must include APPLE_BUNDLE_ID");
  }
  if (appEnv === "production" &&
    (appleAudiences.length !== 1 || appleAudiences[0] !== appleBundleId ||
      appleAudiences.includes("host.exp.Exponent"))) {
    throw new AuthConfigError("Production APPLE_AUDIENCES Secret must contain only APPLE_BUNDLE_ID");
  }

  return {
    appEnv,
    appleTeamId,
    appleKeyId,
    appleBundleId,
    appleAudiences,
    applePrivateKey: loadP256PrivateKey(applePrivateKeyValue),
    tokenEncryptionKey: loadEncryptionKey(encryptionValue),
  };
}

export function createAuthConfigLoader(
  env: NodeJS.ProcessEnv,
  parser: (source: NodeJS.ProcessEnv) => AuthConfig = loadAuthConfig,
): AuthConfigLoader {
  let loaded = false;
  let config: AuthConfig | undefined;
  let failure: unknown;
  return () => {
    if (!loaded) {
      loaded = true;
      try {
        config = parser(env);
      } catch (error) {
        failure = error;
      }
    }
    if (failure) throw failure;
    return config!;
  };
}

const defaultAuthConfigLoader = createAuthConfigLoader(process.env);

export function getDefaultAuthConfig(): AuthConfig {
  return defaultAuthConfigLoader();
}
~~~

### artifacts/api-server/src/auth/apple.ts

~~~ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import type { AuthConfig } from "./config";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

export interface AppleIdentity {
  sub: string;
}

export class AppleExchangeError extends Error {
  constructor() {
    super("Apple authorization-code exchange failed");
    this.name = "AppleExchangeError";
  }
}

export class RefreshTokenEncryptionError extends Error {
  constructor() {
    super("Apple credential encryption failed");
    this.name = "RefreshTokenEncryptionError";
  }
}

export interface EncryptedRefreshToken {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function createAppleJwks(fetcher: typeof fetch = fetch): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(APPLE_JWKS_URL), {
    [customFetch]: fetcher,
  });
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce: string,
  config: AuthConfig,
  jwks: JWTVerifyGetKey,
): Promise<AppleIdentity> {
  const expectedNonce = createHash("sha256").update(rawNonce, "utf8").digest("hex");
  const { payload } = await jwtVerify(identityToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: config.appleAudiences,
    algorithms: ["RS256"],
  });
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) ||
    typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 255 ||
    payload.nonce !== expectedNonce) {
    throw new Error("Invalid Apple identity token");
  }
  return { sub: payload.sub };
}

export async function createAppleClientSecret(
  config: AuthConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.appleKeyId, typ: "JWT" })
    .setIssuer(config.appleTeamId)
    .setSubject(config.appleBundleId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 300)
    .sign(config.applePrivateKey);
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  config: AuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let clientSecret: string;
  try {
    clientSecret = await createAppleClientSecret(config);
  } catch {
    throw new AppleExchangeError();
  }

  let response: Response;
  try {
    response = await fetcher(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.appleBundleId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppleExchangeError();
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new AppleExchangeError();
  }
  if (!response.ok || !result || typeof result !== "object" ||
    !("refresh_token" in result) || typeof result.refresh_token !== "string" ||
    result.refresh_token.length < 1 || result.refresh_token.length > 8192) {
    throw new AppleExchangeError();
  }
  return result.refresh_token;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function encryptRefreshToken(
  refreshToken: string,
  encryptionKey: Buffer,
  userId: string,
): EncryptedRefreshToken {
  if (encryptionKey.byteLength !== 32) throw new RefreshTokenEncryptionError();
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    cipher.setAAD(Buffer.from(userId, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(refreshToken, "utf8"),
      cipher.final(),
    ]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
  } catch {
    throw new RefreshTokenEncryptionError();
  }
}

export function decryptRefreshToken(
  encrypted: EncryptedRefreshToken,
  encryptionKey: Buffer,
  userId: string,
): string {
  if (encryptionKey.byteLength !== 32) throw new RefreshTokenEncryptionError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, encrypted.iv);
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(encrypted.authTag);
    return Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new RefreshTokenEncryptionError();
  }
}
~~~

### artifacts/api-server/src/middlewares/session.ts

~~~ts
import type { RequestHandler } from "express";
import type { Pool } from "pg";
import { hashSessionToken } from "../auth/apple";

export interface SessionContext {
  userId: string;
  workspaceId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      ctx?: SessionContext;
    }
  }
}

export function requireSession(db: Pool): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
    if (!match) {
      res.status(401).json({ error: {
        code: "SESSION_EXPIRED",
        message: "Session expired",
        correlationId: res.locals.correlationId,
      } });
      return;
    }

    try {
      const tokenHash = hashSessionToken(match[1]!);
      const result = await db.query<SessionContext>(
        `WITH eligible AS (
           SELECT s.id AS "sessionId", s.user_id AS "userId", w.id AS "workspaceId",
                  (s.last_seen_at <= now() - interval '24 hours') AS extend_session
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           JOIN workspaces w ON w.owner_id = u.id
           WHERE s.token_hash = $1
             AND s.revoked_at IS NULL
             AND s.expires_at > now()
             AND u.deleted_at IS NULL
         ),
         touched AS (
           UPDATE sessions s
           SET last_seen_at = CASE WHEN e.extend_session THEN now() ELSE s.last_seen_at END,
               expires_at = CASE WHEN e.extend_session THEN now() + interval '30 days' ELSE s.expires_at END
           FROM eligible e
           WHERE s.id = e."sessionId"
           RETURNING s.id
         )
         SELECT e."sessionId", e."userId", e."workspaceId"
         FROM eligible e
         JOIN touched t ON t.id = e."sessionId"`,
        [tokenHash],
      );
      const session = result.rows[0];
      if (!session) {
        res.status(401).json({ error: {
          code: "SESSION_EXPIRED",
          message: "Session expired",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      req.ctx = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}
~~~

### artifacts/api-server/src/routes/auth.ts

~~~ts
import { Router, type IRouter } from "express";
import { SignInWithAppleBody, SignInWithAppleResponse } from "@workspace/api-zod";
import type { Pool } from "pg";
import { validate } from "../lib/validate";
import {
  createAppleJwks,
  createSessionToken,
  encryptRefreshToken,
  exchangeAppleAuthorizationCode,
  hashSessionToken,
  verifyAppleIdentityToken,
} from "../auth/apple";
import { AuthConfigError, type AuthConfig } from "../auth/config";
import { requireSession } from "../middlewares/session";

export interface AuthRouterOptions {
  db: Pool;
  getConfig: () => AuthConfig;
  fetcher: typeof fetch;
  logger: {
    info: (fields: Record<string, unknown>, message?: string) => void;
  };
}

class DeletedAccountError extends Error {
  constructor() {
    super("Account unavailable");
  }
}

export function createAuthRouter(options: AuthRouterOptions): IRouter {
  const router: IRouter = Router();
  let jwks: ReturnType<typeof createAppleJwks> | undefined;
  const signInBodySchema = SignInWithAppleBody.strict().refine(({ rawNonce }) => {
    const decoded = Buffer.from(rawNonce, "base64url");
    return decoded.byteLength === 32 && decoded.toString("base64url") === rawNonce;
  });

  router.post("/apple", validate(signInBodySchema), async (req, res, next) => {
    let config: AuthConfig;
    try {
      config = options.getConfig();
    } catch (error) {
      if (error instanceof AuthConfigError) {
        res.status(503).json({ error: {
          code: "AUTH_UNAVAILABLE",
          message: "Sign in is temporarily unavailable",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      next(error);
      return;
    }

    const body = req.body as {
      identityToken: string;
      authorizationCode: string;
      rawNonce: string;
    };
    jwks ??= createAppleJwks(options.fetcher);

    let appleSub: string;
    try {
      const identity = await verifyAppleIdentityToken(body.identityToken, body.rawNonce, config, jwks);
      appleSub = identity.sub;
    } catch {
      res.status(401).json({ error: {
        code: "INVALID_IDENTITY_TOKEN",
        message: "Apple identity could not be verified",
        correlationId: res.locals.correlationId,
      } });
      return;
    }

    let refreshToken: string | undefined;
    try {
      refreshToken = await exchangeAppleAuthorizationCode(body.authorizationCode, config, options.fetcher);
    } catch {
      if (config.appEnv === "development") {
        options.logger.info({ apple_exchange: "skipped_dev" }, "Apple authorization-code exchange");
      } else {
        // Exchange failures are deliberately opaque; Apple response bodies and
        // crypto/network error details must never be exposed or logged.
        res.status(502).json({ error: {
          code: "APPLE_EXCHANGE_FAILED",
          message: "Apple sign in could not be completed",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
    }

    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const client = await options.db.connect();
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

      const workspaceResult = await client.query<{
        id: string;
        name: string;
        currency: string;
      }>(
        `INSERT INTO workspaces (owner_id, name, currency_code)
         VALUES ($1, 'My workspace', 'USD')
         ON CONFLICT (owner_id) DO UPDATE SET owner_id = EXCLUDED.owner_id
         RETURNING id, name, currency_code::text AS currency`,
        [user.id],
      );
      const workspace = workspaceResult.rows[0]!;

      if (refreshToken) {
        const encrypted = encryptRefreshToken(refreshToken, config.tokenEncryptionKey, user.id);
        await client.query(
          `INSERT INTO apple_credentials (user_id, refresh_token_ciphertext, iv, auth_tag)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE
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

      res.status(200).json(SignInWithAppleResponse.parse({
        sessionToken,
        workspace: { id: workspace.id, name: workspace.name, currency: workspace.currency, locale: "en-US" },
        user: { id: user.id },
      }));
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve only the original safe error path.
      }
      if (error instanceof DeletedAccountError) {
        res.status(401).json({ error: {
          code: "ACCOUNT_UNAVAILABLE",
          message: "Account unavailable",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      next(error);
    } finally {
      client.release();
    }
  });

  router.post("/signout", requireSession(options.db), async (req, res, next) => {
    const context = req.ctx!;
    try {
      await options.db.query(
        `UPDATE sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE id = $1 AND user_id = $2`,
        [context.sessionId, context.userId],
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
~~~

### artifacts/api-server/test/helpers/tenancy.ts

~~~ts
import type { Express } from "express";
import type { Pool } from "pg";
import request, { type Test } from "supertest";
import { expect } from "vitest";
import { createSessionToken, hashSessionToken } from "../../src/auth/apple";

type Method = "get" | "post" | "put" | "patch" | "delete";

export interface AuthedRequestAgent {
  get: (path: string) => Test;
  post: (path: string) => Test;
  put: (path: string) => Test;
  patch: (path: string) => Test;
  delete: (path: string) => Test;
}

export interface TestOwner {
  userId: string;
  workspaceId: string;
  token: string;
  agent: AuthedRequestAgent;
  expectNotFoundAcrossWorkspaces: (route: string, method: Method, idFromOtherWorkspace: string) => Promise<void>;
}

export interface TenancyHarness {
  createOwner(): Promise<TestOwner>;
}

export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
  async function createOwner(): Promise<TestOwner> {
    const userResult = await db.query<{ id: string }>(
      "INSERT INTO users (apple_sub) VALUES ($1) RETURNING id",
      [`test-owner-${crypto.randomUUID()}`],
    );
    const userId = userResult.rows[0]!.id;
    const workspaceResult = await db.query<{ id: string }>(
      "INSERT INTO workspaces (owner_id, name, currency_code) VALUES ($1, 'My workspace', 'USD') RETURNING id",
      [userId],
    );
    const workspaceId = workspaceResult.rows[0]!.id;
    const token = createSessionToken();
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [userId, hashSessionToken(token)],
    );

    const method = (name: Method, path: string) => {
      const test = request(app)[name](path);
      return test.set("Authorization", `Bearer ${token}`);
    };
    const agent: AuthedRequestAgent = {
      get: path => method("get", path),
      post: path => method("post", path),
      put: path => method("put", path),
      patch: path => method("patch", path),
      delete: path => method("delete", path),
    };

    return {
      userId,
      workspaceId,
      token,
      agent,
      expectNotFoundAcrossWorkspaces: async (route, requestMethod, idFromOtherWorkspace) => {
        const path = route.includes(":id")
          ? route.replace(":id", encodeURIComponent(idFromOtherWorkspace))
          : `${route.replace(/\/$/, "")}/${encodeURIComponent(idFromOtherWorkspace)}`;
        const response = await agent[requestMethod](path);
        expect(response.status, `${requestMethod.toUpperCase()} ${route} must hide cross-workspace ids`).toBe(404);
      },
    };
  }
  return { createOwner };
}
~~~

## Every test name and result

### Database

- 01_pay_vectors: PASS
- 02_ledger_core: PASS
- 03_payments_and_checks: PASS
- 03b_payment_note: PASS
- 04_reimb_adj_rest_rates: PASS
- 05_account_deletion: PASS
- 06_payout_signatures_totals: PASS
- 07_share_links: PASS

### Server (70 tests, four files)

- test/startup.test.ts > startup authentication configuration > loads and caches all config before migrations and listening — PASS
- test/startup.test.ts > startup authentication configuration > loads production config before listening and does not run development migrations — PASS
- test/startup.test.ts > startup authentication configuration > fails before migration or listen when the runtime fixture private key is invalid — PASS
- test/shared.test.ts > protected shared pay vectors > V01 — PASS
- test/shared.test.ts > protected shared pay vectors > V02 — PASS
- test/shared.test.ts > protected shared pay vectors > V03 — PASS
- test/shared.test.ts > protected shared pay vectors > V04 — PASS
- test/shared.test.ts > protected shared pay vectors > V05 — PASS
- test/shared.test.ts > protected shared pay vectors > V06 — PASS
- test/shared.test.ts > protected shared pay vectors > V07 — PASS
- test/shared.test.ts > protected shared pay vectors > V08 — PASS
- test/shared.test.ts > protected shared pay vectors > V09 — PASS
- test/shared.test.ts > protected shared pay vectors > V10 — PASS
- test/shared.test.ts > protected shared pay vectors > V11 — PASS
- test/shared.test.ts > protected shared pay vectors > V12 — PASS
- test/shared.test.ts > protected shared pay vectors > V13 — PASS
- test/shared.test.ts > protected shared pay vectors > V14 — PASS
- test/shared.test.ts > protected shared pay vectors > rejects HOUR/DAY_PORTION — PASS
- test/shared.test.ts > protected shared pay vectors > rejects DAY/HOUR_MINUTES — PASS
- test/shared.test.ts > protected shared pay vectors > rejects DAY/DAY_MINUTES — PASS
- test/shared.test.ts > protected shared pay vectors > parses 240 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 240.5 — PASS
- test/shared.test.ts > protected shared pay vectors > parses $1,245.00 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 0.07 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 12.345 — PASS
- test/shared.test.ts > protected shared pay vectors > parses -5 — PASS
- test/shared.test.ts > protected shared pay vectors > parses abc — PASS
- test/shared.test.ts > protected shared pay vectors > parses <blank> — PASS
- test/shared.test.ts > protected shared pay vectors > formats integer cents — PASS
- test/foundation.test.ts > Phase 0 API > responds with the database and migration status — PASS
- test/foundation.test.ts > Phase 0 API > returns a share-link row from open_share_link in the isolated schema — PASS
- test/foundation.test.ts > Phase 0 API > maps oversized and malformed JSON bodies without exposing parser details — PASS
- test/foundation.test.ts > Phase 0 API > maps each SQLSTATE from real database function failures — PASS
- test/foundation.test.ts > Phase 0 API > smoke checks every registered route method with an empty request — PASS
- test/foundation.test.ts > Phase 0 API > rejects a changed migration checksum — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > loads an already formatted Apple P-256 PEM and all six Secrets — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > parses fixture config and the P-256 key once per memoized loader — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rebuilds a space-collapsed PEM body into 64-character lines — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > normalizes escaped backslash-n sequences embedded in the PEM body — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > reports a safe private-key error for garbage without echoing the supplied value — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rejects non-EC-P-256 Apple client keys in a safe format error — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > fails safely for every missing Secret without exposing other config values — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rejects missing or unrecognized APP_ENV instead of allowing a development bypass — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > disallows Expo Go audiences in production — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > encrypts and decrypts refresh tokens with AES-256-GCM and rejects a tampered tag — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > creates an ES256 Apple client secret valid for exactly five minutes — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > exchanges an authorization code as form data without a redirect URI — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > verifies the SHA-256 hex nonce, signs in, and creates exactly one workspace — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > reuses the same user and workspace on concurrent repeat sign-ins — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > caches the Apple JWKS response while verifying separate sign-ins — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > enforces strict auth request properties and bounded token, code, and nonce lengths — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for wrong issuer — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for wrong audience — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for expired token — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for bad signature — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for nonce mismatch — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores only the session SHA-256 hash and never the raw token — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > rejects expired and revoked sessions and slides an active expiry after 24 hours — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > rejects unknown or malformed bearer tokens and accepts a case-insensitive scheme — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > requires and revokes only the caller's own session on signout — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns each owner's own /me workspace and proves cross-workspace 404 behavior — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 without a token for every registered protected v1 route — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > applies a bounded 10-per-minute auth IP limit without trusting forwarded headers — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > serves the documented health path through both v1 aliases with its existing payload — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > serves Apple sign-in, /me, and signout through the /api/v1 alias — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > fails production sign-in closed on Apple exchange errors without logging Apple response data — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores production Apple refresh tokens only as AES-256-GCM ciphertext — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > logs and continues after a failed development exchange — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores a successful development exchange refresh token encrypted — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > never logs tokens, authorization codes, Apple sub, or private keys — PASS

### Mobile (31 tests, three files)

- __tests__/sessionRace.test.tsx > sessionStore serialization > a save queued behind a slow delete runs after it; final persisted and cached token is the new one — PASS
- __tests__/sessionRace.test.tsx > sessionStore serialization > loadToken during a clear cannot restore the old token (started after or before) — PASS
- __tests__/sessionRace.test.tsx > sessionStore serialization > a failed job surfaces its error and does not break later jobs — PASS
- __tests__/sessionRace.test.tsx > sign-in vs expiry cleanup > signIn cannot complete until the expiry delete finishes, and the old delete never wipes the new token — PASS
- __tests__/auth.test.tsx > nonce > uses 32 random bytes, base64url raw nonce and SHA-256 hex via expo-crypto — PASS
- __tests__/auth.test.tsx > base64url > encodes 32 bytes to exactly 43 chars that round-trip to the same bytes — PASS
- __tests__/auth.test.tsx > sign in > requests no scopes, passes the hash to Apple and the raw nonce to the API — PASS
- __tests__/auth.test.tsx > sign in > stores the session token only in SecureStore and not in the mutation cache — PASS
- __tests__/auth.test.tsx > sign in > treats Apple cancel as silent, not a failure — PASS
- __tests__/auth.test.tsx > sign in > shows a safe message, never the raw exception — PASS
- __tests__/auth.test.tsx > sign in > fails explicitly when SecureStore cannot save — PASS
- __tests__/auth.test.tsx > launch restore > restores a session when /me succeeds — PASS
- __tests__/auth.test.tsx > launch restore > on 401 deletes the token and shows sign-in — PASS
- __tests__/auth.test.tsx > launch restore > on network failure keeps the token, blocks the app and retries — PASS
- __tests__/auth.test.tsx > launch restore > ignores an old expired restore that finishes after a fresh sign-in — PASS
- __tests__/auth.test.tsx > later 401 > clears the session, notices, keeps AsyncStorage drafts, and resumes the route for the same owner — PASS
- __tests__/auth.test.tsx > later 401 > drops the remembered route for a different owner — PASS
- __tests__/auth.test.tsx > later 401 > ignores a 401 carrying a stale token — PASS
- __tests__/auth.test.tsx > sign out > revokes on the server before clearing locally, without Apple signOut — PASS
- __tests__/auth.test.tsx > sign out > treats a revoked 401 as already signed out — PASS
- __tests__/auth.test.tsx > sign out > stays signed in with a clear message when the network fails — PASS
- __tests__/auth.test.tsx > screens > Account shows Signed in with Apple and confirms before signing out — PASS
- __tests__/auth.test.tsx > screens > Diagnostics shows first 8 chars of workspace ID, version and API status — PASS
- __tests__/components.test.tsx > Money > formats dollars and cents and exposes a complete spoken amount — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Owed — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Settled — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Advance — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Pending — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Needs review — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Unrecorded — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Check not cleared — PASS

### Browser journey

- Anonymous launch settles to visible sign-in; anonymous Account navigation redirects to sign-in — PASS.
- Real Apple authentication, native SecureStore and actual phone navigation — NOT VERIFIED (not silently skipped or claimed as tests).

## Created or changed source/evidence files

Git status at proof generation (M = changed, ?? = new). Build output, installed dependencies and temporary /tmp logs are omitted.

~~~text
 M .agents/memory/MEMORY.md
 M .replit
 M GATE_CHECKLIST_AND_QA_LOG.md
 M artifacts/api-server/package.json
 M artifacts/api-server/src/app.ts
 M artifacts/api-server/src/index.ts
 M artifacts/api-server/src/routes/health.ts
 M artifacts/api-server/src/routes/index.ts
 M artifacts/crewtally-mobile/app.json
 M artifacts/crewtally-mobile/app/(tabs)/more.tsx
 M artifacts/crewtally-mobile/app/_layout.tsx
 M artifacts/crewtally-mobile/lib/api.ts
 M artifacts/crewtally-mobile/package.json
 M lib/api-client-react/src/custom-fetch.ts
 M lib/api-client-react/src/generated/api.schemas.ts
 M lib/api-client-react/src/generated/api.ts
 M lib/api-client-react/src/index.ts
 M lib/api-spec/openapi.yaml
 M lib/api-zod/src/generated/api.ts
 M lib/api-zod/src/generated/types/healthStatus.ts
 M lib/api-zod/src/generated/types/index.ts
 M pnpm-lock.yaml
 M replit.md
?? .agents/memory/query-cache-test-lifecycle.md
?? artifacts/api-server/src/auth/apple.ts
?? artifacts/api-server/src/auth/config.ts
?? artifacts/api-server/src/middlewares/auth-rate-limit.ts
?? artifacts/api-server/src/middlewares/session.ts
?? artifacts/api-server/src/routes/auth.ts
?? artifacts/api-server/src/routes/me.ts
?? artifacts/api-server/src/server/startup.ts
?? artifacts/api-server/test/auth.test.ts
?? artifacts/api-server/test/helpers/tenancy.ts
?? artifacts/api-server/test/helpers/test-only-resources.ts
?? artifacts/api-server/test/startup.test.ts
?? artifacts/crewtally-mobile/__tests__/auth.test.tsx
?? artifacts/crewtally-mobile/__tests__/sessionRace.test.tsx
?? artifacts/crewtally-mobile/app/account.tsx
?? artifacts/crewtally-mobile/app/sign-in.tsx
?? artifacts/crewtally-mobile/contexts/AuthContext.tsx
?? artifacts/crewtally-mobile/lib/appleNonce.ts
?? artifacts/crewtally-mobile/lib/authEvents.ts
?? artifacts/crewtally-mobile/lib/links.ts
?? artifacts/crewtally-mobile/lib/sessionStore.ts
?? db/migrations/0002_auth.sql
?? lib/api-zod/src/generated/types/appleSignInRequest.ts
?? lib/api-zod/src/generated/types/appleSignInResponse.ts
?? lib/api-zod/src/generated/types/badRequestResponse.ts
?? lib/api-zod/src/generated/types/errorResponse.ts
?? lib/api-zod/src/generated/types/errorResponseError.ts
?? lib/api-zod/src/generated/types/meResponse.ts
?? lib/api-zod/src/generated/types/rateLimitedResponse.ts
?? lib/api-zod/src/generated/types/serverErrorResponse.ts
?? lib/api-zod/src/generated/types/unauthorizedResponse.ts
?? lib/api-zod/src/generated/types/user.ts
?? lib/api-zod/src/generated/types/workspace.ts
?? screenshots/phase-1-sign-in.jpg
?? docs/PHASE_1_GATE_PROOF.md
~~~

Agent memory housekeeping files also updated: .agents/memory/MEMORY.md and .agents/memory/query-cache-test-lifecycle.md. The Python module transiently added by tooling was removed; .replit has no final diff.


---

## Development-sign-in addendum — latest gate, 2026-10-01

Owner confirmed Expo Go 1017880 lacks ExpoAppleAuthentication. Real device Apple sign-in/nonce verification is carried to the first TestFlight build at the end of Phase 2. Developer sign-in is not proof of Apple authentication. No Phase 2 work started.

POST /v1/auth/dev (and /api/v1/auth/dev) is registered only with explicit APP_ENV=development and a nonempty DEV_SIGNIN_CODE. Production and missing-code configurations have no route. Code comparison uses timingSafeEqual on equal-length SHA-256 digests; labels are strict owner-a/owner-b values. Both methods use the same transactional user/workspace/session helper. Dev users have reserved dev: subs, no exchange and no refresh credentials. Success logs contain only the fixed label and auth_dev_signin event; no code/sub/token. Production startup warns by Secret name only if configured.

The mobile sheet is gated by __DEV__, the development manifest and confirmed Apple unavailability. It has secure code entry and explicit Owner A/B selection, clears the code on submit/dismiss, and does not persist it. Both methods share cleanup, generation guards, SecureStore, cache isolation and same-owner navigation.

All final commands exit 0: DB 7 unchanged SQL files / 8 PASS groups; server 4 files / 75 tests; mobile 4 files / 51 tests. No test skipped, deleted or weakened. Library, API and mobile types pass. Package-scoped dom.iterable typing supports generated Headers.entries; no runtime URL/auth-hook changes or new packages.

Production iOS export succeeded with APP_ENV=production and NODE_ENV=production. Hermes bytecode contains none of Developer sign-in (test only), dev-signin-sheet, dev-signin-code, dev-signin-submit, requestDevSignIn or DEV_SIGNIN_CODE. The unused generated SDK endpoint URL remains; the feature sheet/helper is stripped and server production tests prove route absence.

Startup at 18:44:53 UTC: Migrations ready applied=0; Server listening port=8080. Expo session login succeeds, Metro starts in Expo Go mode, and a fresh QR is generated. Live health returns 200; POST /api/v1/auth/dev returns 404. Secret-existence check confirms DEV_SIGNIN_CODE is not set; owner must add it then restart API to mount the route. Agent has not tested phone login with that Secret. Trusted proxy/client-IP limiting remains the previously accepted open gate.

The SDK57 diagnostic uses the exact native name ExpoAppleAuthentication in requireOptionalNativeModule. QA records the TestFlight deferral and optional later Touch ID/Face ID support, supportedAuthenticationTypesAsync, matching button wording, passcode fallback and home-button iPhone testing.

### Every latest server test result

- test/startup.test.ts > startup authentication configuration > warns by configuration name in production without logging the configured value — PASS
- test/startup.test.ts > startup authentication configuration > loads and caches all config before migrations and listening — PASS
- test/startup.test.ts > startup authentication configuration > loads production config before listening and does not run development migrations — PASS
- test/startup.test.ts > startup authentication configuration > fails before migration or listen when the runtime fixture private key is invalid — PASS
- test/shared.test.ts > protected shared pay vectors > V01 — PASS
- test/shared.test.ts > protected shared pay vectors > V02 — PASS
- test/shared.test.ts > protected shared pay vectors > V03 — PASS
- test/shared.test.ts > protected shared pay vectors > V04 — PASS
- test/shared.test.ts > protected shared pay vectors > V05 — PASS
- test/shared.test.ts > protected shared pay vectors > V06 — PASS
- test/shared.test.ts > protected shared pay vectors > V07 — PASS
- test/shared.test.ts > protected shared pay vectors > V08 — PASS
- test/shared.test.ts > protected shared pay vectors > V09 — PASS
- test/shared.test.ts > protected shared pay vectors > V10 — PASS
- test/shared.test.ts > protected shared pay vectors > V11 — PASS
- test/shared.test.ts > protected shared pay vectors > V12 — PASS
- test/shared.test.ts > protected shared pay vectors > V13 — PASS
- test/shared.test.ts > protected shared pay vectors > V14 — PASS
- test/shared.test.ts > protected shared pay vectors > rejects HOUR/DAY_PORTION — PASS
- test/shared.test.ts > protected shared pay vectors > rejects DAY/HOUR_MINUTES — PASS
- test/shared.test.ts > protected shared pay vectors > rejects DAY/DAY_MINUTES — PASS
- test/shared.test.ts > protected shared pay vectors > parses 240 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 240.5 — PASS
- test/shared.test.ts > protected shared pay vectors > parses $1,245.00 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 0.07 — PASS
- test/shared.test.ts > protected shared pay vectors > parses 12.345 — PASS
- test/shared.test.ts > protected shared pay vectors > parses -5 — PASS
- test/shared.test.ts > protected shared pay vectors > parses abc — PASS
- test/shared.test.ts > protected shared pay vectors > parses <blank> — PASS
- test/shared.test.ts > protected shared pay vectors > formats integer cents — PASS
- test/foundation.test.ts > Phase 0 API > responds with the database and migration status — PASS
- test/foundation.test.ts > Phase 0 API > returns a share-link row from open_share_link in the isolated schema — PASS
- test/foundation.test.ts > Phase 0 API > maps oversized and malformed JSON bodies without exposing parser details — PASS
- test/foundation.test.ts > Phase 0 API > maps each SQLSTATE from real database function failures — PASS
- test/foundation.test.ts > Phase 0 API > smoke checks every registered route method with an empty request — PASS
- test/foundation.test.ts > Phase 0 API > rejects a changed migration checksum — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > loads an already formatted Apple P-256 PEM and all six Secrets — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > parses fixture config and the P-256 key once per memoized loader — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rebuilds a space-collapsed PEM body into 64-character lines — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > normalizes escaped backslash-n sequences embedded in the PEM body — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > reports a safe private-key error for garbage without echoing the supplied value — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rejects non-EC-P-256 Apple client keys in a safe format error — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > fails safely for every missing Secret without exposing other config values — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > rejects missing or unrecognized APP_ENV instead of allowing a development bypass — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > disallows Expo Go audiences in production — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > encrypts and decrypts refresh tokens with AES-256-GCM and rejects a tampered tag — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > creates an ES256 Apple client secret valid for exactly five minutes — PASS
- test/auth.test.ts > Phase 1 auth configuration and cryptography > exchanges an authorization code as form data without a redirect URI — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > registers development sign-in only when enabled with a nonempty code — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > creates isolated development owners through the shared session path — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns one generic unauthorized response for wrong development codes without logging them — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > strictly validates the development sign-in body and applies the shared 10-per-minute limit — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > verifies the SHA-256 hex nonce, signs in, and creates exactly one workspace — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > reuses the same user and workspace on concurrent repeat sign-ins — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > caches the Apple JWKS response while verifying separate sign-ins — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > enforces strict auth request properties and bounded token, code, and nonce lengths — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for wrong issuer — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for wrong audience — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for expired token — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for bad signature — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 for nonce mismatch — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores only the session SHA-256 hash and never the raw token — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > rejects expired and revoked sessions and slides an active expiry after 24 hours — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > rejects unknown or malformed bearer tokens and accepts a case-insensitive scheme — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > requires and revokes only the caller's own session on signout — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns each owner's own /me workspace and proves cross-workspace 404 behavior — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > returns 401 without a token for every registered protected v1 route — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > applies a bounded 10-per-minute auth IP limit without trusting forwarded headers — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > serves the documented health path through both v1 aliases with its existing payload — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > serves Apple sign-in, /me, and signout through the /api/v1 alias — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > fails production sign-in closed on Apple exchange errors without logging Apple response data — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores production Apple refresh tokens only as AES-256-GCM ciphertext — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > logs and continues after a failed development exchange — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > stores a successful development exchange refresh token encrypted — PASS
- test/auth.test.ts > Phase 1 sign-in and session routes > never logs tokens, authorization codes, Apple sub, or private keys — PASS

### Every latest mobile test result

- __tests__/signInAvailability.test.tsx (5.138 s) > iOS + available shows the native Apple button — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > iOS + unavailable shows the fallback only after a false result — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > web shows the fallback without checking native Apple availability — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a rejected availability check is visible, not silently turned into fallback, and logs only its name — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > retrying a failed check shows the native button when availability becomes true — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a synchronous check error is visible and logs no message or stack — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > development fallback displays only requested platform, native-module and version metadata — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > development fallback reports a present native module as true — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > APP_ENV production hides diagnostics even in a development bundle and performs no native lookup — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a production bundle hides diagnostics regardless of the manifest environment label — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > Apple availability hides the developer sign-in button — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a production bundle hides developer sign-in regardless of a development manifest — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > the development sheet offers a secure code field and submits the selected owner through AuthContext — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > production manifest hides developer sign-in even in a development bundle — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > does not offer developer sign-in while the saved session is restoring — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a rejected developer sign-in shows a safe error and clears the transient code from the sheet — PASS
- __tests__/signInAvailability.test.tsx (5.138 s) > a diagnostic lookup failure is explicit and does not render or log native error details — PASS
- __tests__/auth.test.tsx > nonce > uses 32 random bytes, base64url raw nonce and SHA-256 hex via expo-crypto — PASS
- __tests__/auth.test.tsx > base64url > encodes 32 bytes to exactly 43 chars that round-trip to the same bytes — PASS
- __tests__/auth.test.tsx > sign in > requests no scopes, passes the hash to Apple and the raw nonce to the API — PASS
- __tests__/auth.test.tsx > sign in > stores the session token only in SecureStore and not in the mutation cache — PASS
- __tests__/auth.test.tsx > sign in > treats Apple cancel as silent, not a failure — PASS
- __tests__/auth.test.tsx > sign in > shows a safe message, never the raw exception — PASS
- __tests__/auth.test.tsx > sign in > fails explicitly when SecureStore cannot save — PASS
- __tests__/auth.test.tsx > sign in > developer sign-in uses the generated operation and shared secure session storage without invoking Apple — PASS
- __tests__/auth.test.tsx > sign in > developer sign-in rejects a wrong code with a safe message and no persistence or logging — PASS
- __tests__/auth.test.tsx > launch restore > restores a session when /me succeeds — PASS
- __tests__/auth.test.tsx > launch restore > on 401 deletes the token and shows sign-in — PASS
- __tests__/auth.test.tsx > launch restore > on network failure keeps the token, blocks the app and retries — PASS
- __tests__/auth.test.tsx > launch restore > ignores an old expired restore that finishes after a fresh sign-in — PASS
- __tests__/auth.test.tsx > later 401 > clears the session, notices, keeps AsyncStorage drafts, and resumes the route for the same owner — PASS
- __tests__/auth.test.tsx > later 401 > drops the remembered route for a different owner — PASS
- __tests__/auth.test.tsx > later 401 > developer sign-in resumes the remembered route for the same owner after shared cleanup — PASS
- __tests__/auth.test.tsx > later 401 > ignores a 401 carrying a stale token — PASS
- __tests__/auth.test.tsx > sign out > revokes on the server before clearing locally, without Apple signOut — PASS
- __tests__/auth.test.tsx > sign out > treats a revoked 401 as already signed out — PASS
- __tests__/auth.test.tsx > sign out > stays signed in with a clear message when the network fails — PASS
- __tests__/auth.test.tsx > screens > Account shows Signed in with Apple and confirms before signing out — PASS
- __tests__/auth.test.tsx > screens > Diagnostics shows first 8 chars of workspace ID, version and API status — PASS
- __tests__/sessionRace.test.tsx > sessionStore serialization > a save queued behind a slow delete runs after it; final persisted and cached token is the new one — PASS
- __tests__/sessionRace.test.tsx > sessionStore serialization > loadToken during a clear cannot restore the old token (started after or before) — PASS
- __tests__/sessionRace.test.tsx > sessionStore serialization > a failed job surfaces its error and does not break later jobs — PASS
- __tests__/sessionRace.test.tsx > sign-in vs expiry cleanup > signIn cannot complete until the expiry delete finishes, and the old delete never wipes the new token — PASS
- __tests__/components.test.tsx > Money > formats dollars and cents and exposes a complete spoken amount — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Owed — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Settled — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Advance — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Pending — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Needs review — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Unrecorded — PASS
- __tests__/components.test.tsx > StatusLabel > renders icon and visible text for Check not cleared — PASS

### Changed files

~~~text
 M GATE_CHECKLIST_AND_QA_LOG.md
 M artifacts/api-server/src/index.ts
 M artifacts/api-server/src/routes/auth.ts
 M artifacts/api-server/src/routes/index.ts
 M artifacts/api-server/src/server/startup.ts
 M artifacts/api-server/test/auth.test.ts
 M artifacts/api-server/test/startup.test.ts
 M artifacts/crewtally-mobile/__tests__/auth.test.tsx
 M artifacts/crewtally-mobile/__tests__/signInAvailability.test.tsx
 M artifacts/crewtally-mobile/app/sign-in.tsx
 M artifacts/crewtally-mobile/contexts/AuthContext.tsx
 M docs/PHASE_1_GATE_PROOF.md
 M lib/api-client-react/src/generated/api.schemas.ts
 M lib/api-client-react/src/generated/api.ts
 M lib/api-client-react/tsconfig.json
 M lib/api-spec/openapi.yaml
 M lib/api-zod/src/generated/api.ts
 M lib/api-zod/src/generated/types/index.ts
 M replit.md
?? artifacts/crewtally-mobile/components/DevSignInSheet.tsx
?? artifacts/crewtally-mobile/lib/devSignInApi.ts
?? lib/api-zod/src/generated/types/devSignInInput.ts
?? lib/api-zod/src/generated/types/devSignInInputLabel.ts
?? lib/api-zod/src/generated/types/notFoundResponse.ts

~~~

### Latest implementation code

### artifacts/api-server/src/routes/auth.ts

~~~ts
import { Router, type IRouter } from "express";
import {
  SignInDevBody,
  SignInWithAppleBody,
  SignInWithAppleResponse,
} from "@workspace/api-zod";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { validate } from "../lib/validate";
import {
  createAppleJwks,
  createSessionToken,
  encryptRefreshToken,
  exchangeAppleAuthorizationCode,
  hashSessionToken,
  verifyAppleIdentityToken,
} from "../auth/apple";
import { AuthConfigError, type AuthConfig } from "../auth/config";
import { requireSession } from "../middlewares/session";

export interface AuthRouterOptions {
  db: Pool;
  getConfig: () => AuthConfig;
  fetcher: typeof fetch;
  devSigninCode?: string;
  logger: {
    info: (fields: Record<string, unknown>, message?: string) => void;
  };
}

class DeletedAccountError extends Error {
  constructor() {
    super("Account unavailable");
  }
}

interface OwnerSession {
  sessionToken: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  currency: string;
}

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

    const workspaceResult = await client.query<{
      id: string;
      name: string;
      currency: string;
    }>(
      `INSERT INTO workspaces (owner_id, name, currency_code)
       VALUES ($1, 'My workspace', 'USD')
       ON CONFLICT (owner_id) DO UPDATE SET owner_id = EXCLUDED.owner_id
       RETURNING id, name, currency_code::text AS currency`,
      [user.id],
    );
    const workspace = workspaceResult.rows[0]!;

    if (refreshToken) {
      if (!tokenEncryptionKey) throw new Error("Apple credential encryption unavailable");
      const encrypted = encryptRefreshToken(refreshToken, tokenEncryptionKey, user.id);
      await client.query(
        `INSERT INTO apple_credentials (user_id, refresh_token_ciphertext, iv, auth_tag)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
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
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      currency: workspace.currency,
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
    workspace: {
      id: session.workspaceId,
      name: session.workspaceName,
      currency: session.currency,
      locale: "en-US",
    },
    user: { id: session.userId },
  });
}

export function createAuthRouter(options: AuthRouterOptions): IRouter {
  const router: IRouter = Router();
  let jwks: ReturnType<typeof createAppleJwks> | undefined;
  const signInBodySchema = SignInWithAppleBody.strict().refine(({ rawNonce }) => {
    const decoded = Buffer.from(rawNonce, "base64url");
    return decoded.byteLength === 32 && decoded.toString("base64url") === rawNonce;
  });

  router.post("/apple", validate(signInBodySchema), async (req, res, next) => {
    let config: AuthConfig;
    try {
      config = options.getConfig();
    } catch (error) {
      if (error instanceof AuthConfigError) {
        res.status(503).json({ error: {
          code: "AUTH_UNAVAILABLE",
          message: "Sign in is temporarily unavailable",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      next(error);
      return;
    }

    const body = req.body as {
      identityToken: string;
      authorizationCode: string;
      rawNonce: string;
    };
    jwks ??= createAppleJwks(options.fetcher);

    let appleSub: string;
    try {
      const identity = await verifyAppleIdentityToken(body.identityToken, body.rawNonce, config, jwks);
      appleSub = identity.sub;
    } catch {
      res.status(401).json({ error: {
        code: "INVALID_IDENTITY_TOKEN",
        message: "Apple identity could not be verified",
        correlationId: res.locals.correlationId,
      } });
      return;
    }

    let refreshToken: string | undefined;
    try {
      refreshToken = await exchangeAppleAuthorizationCode(body.authorizationCode, config, options.fetcher);
    } catch {
      if (config.appEnv === "development") {
        options.logger.info({ apple_exchange: "skipped_dev" }, "Apple authorization-code exchange");
      } else {
        // Exchange failures are deliberately opaque; Apple response bodies and
        // crypto/network error details must never be exposed or logged.
        res.status(502).json({ error: {
          code: "APPLE_EXCHANGE_FAILED",
          message: "Apple sign in could not be completed",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
    }

    try {
      const session = await createOwnerSession(options.db, appleSub, refreshToken, config.tokenEncryptionKey);
      res.status(200).json(sessionResponse(session));
    } catch (error) {
      if (error instanceof DeletedAccountError) {
        res.status(401).json({ error: {
          code: "ACCOUNT_UNAVAILABLE",
          message: "Account unavailable",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      next(error);
    }
  });

  if (options.devSigninCode !== undefined) {
    router.post("/dev", validate(SignInDevBody.strict()), async (req, res, next): Promise<void> => {
      const body = req.body as { code: string; label: "owner-a" | "owner-b" };
      if (!codesMatch(body.code, options.devSigninCode!)) {
        res.status(401).json({ error: {
          code: "INVALID_CREDENTIALS",
          message: "Sign in could not be completed",
          correlationId: res.locals.correlationId,
        } });
        return;
      }

      try {
        const session = await createOwnerSession(options.db, `dev:${body.label}`);
        options.logger.info({ label: body.label }, "auth_dev_signin");
        res.status(200).json(sessionResponse(session));
      } catch (error) {
        if (error instanceof DeletedAccountError) {
          res.status(401).json({ error: {
            code: "ACCOUNT_UNAVAILABLE",
            message: "Account unavailable",
            correlationId: res.locals.correlationId,
          } });
          return;
        }
        next(error);
      }
    });
  }

  router.post("/signout", requireSession(options.db), async (req, res, next) => {
    const context = req.ctx!;
    try {
      await options.db.query(
        `UPDATE sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE id = $1 AND user_id = $2`,
        [context.sessionId, context.userId],
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
~~~

### artifacts/api-server/src/routes/index.ts

~~~ts
import { Router, type IRouter } from "express";
import type { Pool } from "pg";
import type { AuthConfigLoader } from "../auth/config";
import { createAuthConfigLoader, getDefaultAuthConfig } from "../auth/config";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { createAuthRateLimiter } from "../middlewares/auth-rate-limit";
import { requireSession } from "../middlewares/session";
import { createAuthRouter } from "./auth";
import { createHealthRouter } from "./health";
import { createMeRouter } from "./me";

export interface RouterLogger {
  info: (fields: Record<string, unknown>, message?: string) => void;
  error: (fields: Record<string, unknown>, message?: string) => void;
}

export interface RouterOptions {
  db?: Pool;
  env?: NodeJS.ProcessEnv;
  getAuthConfig?: AuthConfigLoader;
  fetcher?: typeof fetch;
  logger?: RouterLogger;
  testOnlyProtectedRouter?: IRouter;
}

export function createRouter(options: RouterOptions = {}): IRouter {
  const db = options.db ?? pool;
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const getConfig = options.getAuthConfig ??
    (options.env ? createAuthConfigLoader(options.env) : getDefaultAuthConfig);
  const devSigninCode = env.APP_ENV === "development" &&
    typeof env.DEV_SIGNIN_CODE === "string" &&
    env.DEV_SIGNIN_CODE.length > 0
    ? env.DEV_SIGNIN_CODE
    : undefined;

  const router: IRouter = Router();
  router.use(createHealthRouter(db, logger));
  router.use("/auth", createAuthRateLimiter());
  router.use("/auth", createAuthRouter({
    db,
    getConfig,
    fetcher,
    ...(devSigninCode === undefined ? {} : { devSigninCode }),
    logger: options.logger ?? logger,
  }));

  const protect = requireSession(db);
  router.use((req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/auth/")) {
      next();
      return;
    }
    protect(req, res, next);
  });
  router.use(createMeRouter(db));
  if (options.testOnlyProtectedRouter) router.use(options.testOnlyProtectedRouter);
  return router;
}

const router: IRouter = createRouter();
export default router;

~~~

### artifacts/api-server/src/server/startup.ts

~~~ts
export interface ApiStartupSteps {
  loadAuthConfig: () => { appEnv: "development" | "production" };
  migrate: () => Promise<unknown>;
  listen: () => Promise<void>;
}

export function warnIfProductionDevSigninCodeIsSet(
  env: NodeJS.ProcessEnv,
  log: { warn: (fields: Record<string, unknown>, message?: string) => void },
): void {
  if (env.APP_ENV === "production" && env.DEV_SIGNIN_CODE !== undefined) {
    log.warn(
      { configuration: "DEV_SIGNIN_CODE" },
      "DEV_SIGNIN_CODE is set in production and will be ignored",
    );
  }
}

export async function runApiStartup(steps: ApiStartupSteps): Promise<void> {
  const config = steps.loadAuthConfig();
  if (config.appEnv !== "production") await steps.migrate();
  await steps.listen();
}
~~~

### artifacts/crewtally-mobile/contexts/AuthContext.tsx

~~~ts
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { getMe, signInWithApple, signOut as signOutRequest } from '@workspace/api-client-react';
import { createNoncePair } from '@/lib/appleNonce';
import { setUnauthorizedListener } from '@/lib/authEvents';
import { clearToken, loadToken, peekToken, saveToken } from '@/lib/sessionStore';

export type AuthStatus = 'restoring' | 'retry' | 'signedOut' | 'signedIn';
export interface AuthWorkspace { id: string; name: string; currency: string; locale: string }

export const SIGN_IN_AGAIN_NOTICE = 'Please sign in again';

export type SignInResult = 'ok' | 'cancelled' | 'failed';
export type SignOutResult = 'ok' | 'failed';
export type DeveloperSignInLabel = 'owner-a' | 'owner-b';

interface AuthValue {
  status: AuthStatus;
  workspace: AuthWorkspace | null;
  userId: string | null;
  notice: string | null;
  message: string | null;
  busy: boolean;
  pendingRoute: string | null;
  signIn: () => Promise<SignInResult>;
  developerSignIn: (code: string, label: DeveloperSignInLabel) => Promise<SignInResult>;
  signOut: () => Promise<SignOutResult>;
  retryRestore: () => void;
  rememberRoute: (path: string) => void;
  consumePendingRoute: () => string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
};

function safeSignInMessage(e: unknown): string {
  const status = statusOf(e);
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status === 401) return 'Apple could not be verified. Please try again.';
  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
  return 'Sign in did not finish. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [workspace, setWorkspace] = useState<AuthWorkspace | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const busy = working || cleaning;
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const generation = useRef(0);
  const mounted = useRef(true);
  const lastRoute = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const pendingOwner = useRef<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const signingOutToken = useRef<string | null>(null);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const dropCaches = useCallback(async () => {
    // Only user-scoped server cache. Local drafts (AsyncStorage) are never touched.
    await queryClientRef.current.cancelQueries();
    queryClientRef.current.clear();
  }, []);

  // Barrier: sign-in never completes while a previous expiry/sign-out cleanup is running.
  const cleanupRef = useRef<Promise<void>>(Promise.resolve());
  const runCleanup = useCallback(
    (clearing: Promise<void>): Promise<boolean> => {
      clearing.catch(() => undefined); // observed below; avoids a transient unhandled rejection
      const prior = cleanupRef.current;
      setCleaning(true);
      const p = (async () => {
        await prior;
        let ok = true;
        try {
          await dropCaches();
        } catch {
          ok = false;
        }
        try {
          await clearing;
        } catch {
          ok = false;
        }
        if (!ok && mounted.current) setMessage('Saved sign-in could not be removed from this device.');
        return ok;
      })();
      const done = p.then(() => {
        if (cleanupRef.current === done && mounted.current) setCleaning(false);
      });
      cleanupRef.current = done;
      return p;
    },
    [dropCaches],
  );

  const expire = useCallback(
    async (token: string | null) => {
      if (!token || peekToken() !== token || signingOutToken.current === token) return;
      generation.current += 1;
      const wasSignedIn = ownerRef.current !== null;
      pendingRef.current = wasSignedIn ? lastRoute.current : null;
      pendingOwner.current = wasSignedIn ? ownerRef.current : null;
      setPendingRoute(pendingRef.current);
      setStatus('signedOut');
      setNotice(SIGN_IN_AGAIN_NOTICE);
      setMessage(null);
      const clearing = clearToken(); // cached token is dropped synchronously
      setWorkspace(null);
      setUserId(null);
      ownerRef.current = null;
      await runCleanup(clearing);
    },
    [runCleanup],
  );
  const expireRef = useRef(expire);
  expireRef.current = expire;

  useEffect(() => {
    mounted.current = true;
    const off = setUnauthorizedListener((report) => void expireRef.current(report.token));
    return () => {
      mounted.current = false;
      off();
    };
  }, []);

  const restore = useCallback(async () => {
    const gen = ++generation.current;
    setStatus('restoring');
    setMessage(null);
    let token: string | null;
    try {
      token = await loadToken();
    } catch {
      if (gen !== generation.current) return;
      setStatus('retry');
      setMessage('Your saved sign-in could not be read. Try again.');
      return;
    }
    if (gen !== generation.current) return;
    if (!token) {
      setStatus('signedOut');
      return;
    }
    try {
      const me = await getMe();
      if (gen !== generation.current || peekToken() !== token) return; // superseded by a newer sign-in
      ownerRef.current = me.user.id;
      setWorkspace(me.workspace);
      setUserId(me.user.id);
      setStatus('signedIn');
    } catch (e) {
      if (gen !== generation.current) return;
      if (statusOf(e) === 401) {
        await expireRef.current(token);
        return;
      }
      // Network or server trouble: keep the token, block the app, offer retry.
      setStatus('retry');
      setMessage('Could not reach CrewTally. Your sign-in is still saved. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const completeSignIn = useCallback(async (
    result: Awaited<ReturnType<typeof signInWithApple>>,
    gen: number,
  ): Promise<SignInResult> => {
    if (gen !== generation.current) return 'failed';
    try {
      await saveToken(result.sessionToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Your sign-in could not be saved securely.');
      return 'failed';
    }
    if (gen !== generation.current) {
      await clearToken().catch(() => undefined);
      return 'failed';
    }
    const sameOwner = pendingOwner.current === result.user.id;
    if (!sameOwner) {
      await dropCaches();
      pendingRef.current = null;
      setPendingRoute(null);
    }
    pendingOwner.current = null;
    ownerRef.current = result.user.id;
    setWorkspace(result.workspace);
    setUserId(result.user.id);
    setNotice(null);
    setStatus('signedIn');
    return 'ok';
  }, [dropCaches]);

  const signIn = useCallback(async (): Promise<SignInResult> => {
    if (working) return 'failed';
    setBusy(true);
    await cleanupRef.current;
    const gen = ++generation.current;
    setMessage(null);
    try {
      const { rawNonce, hashedNonce } = await createNoncePair();
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashedNonce });
      } catch (e) {
        if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
        setMessage('Sign in with Apple did not finish. Please try again.');
        return 'failed';
      }
      if (!credential.identityToken || !credential.authorizationCode) {
        setMessage('Apple did not return a sign-in. Please try again.');
        return 'failed';
      }
      let result: Awaited<ReturnType<typeof signInWithApple>>;
      try {
        result = await signInWithApple({
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          rawNonce,
        });
      } catch (e) {
        setMessage(safeSignInMessage(e));
        return 'failed';
      }
      return await completeSignIn(result, gen);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [working, completeSignIn]);

  const developerSignIn = useCallback(async (
    code: string,
    label: DeveloperSignInLabel,
  ): Promise<SignInResult> => {
    if (
      !__DEV__
      || Constants.expoConfig?.extra?.appEnv !== 'development'
      || working
    ) return 'failed';
    setBusy(true);
    await cleanupRef.current;
    const gen = ++generation.current;
    setMessage(null);
    try {
      if (__DEV__ && Constants.expoConfig?.extra?.appEnv === 'development') {
        let result: Awaited<ReturnType<typeof signInWithApple>>;
        try {
          const { requestDevSignIn } = require('@/lib/devSignInApi') as {
            requestDevSignIn: (
              code: string,
              label: DeveloperSignInLabel,
            ) => Promise<Awaited<ReturnType<typeof signInWithApple>>>;
          };
          result = await requestDevSignIn(code, label);
        } catch (e) {
          if (gen !== generation.current) return 'failed';
          const status = statusOf(e);
          setMessage(status === 401
            ? 'Developer sign-in code was not accepted. Check it and try again.'
            : status === 429
              ? 'Too many attempts. Wait a minute and try again.'
              : 'Developer sign-in could not finish. Please try again.');
          return 'failed';
        }
        return await completeSignIn(result, gen);
      }
      return 'failed';
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [working, completeSignIn]);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    const token = peekToken();
    if (token) {
      signingOutToken.current = token;
      try {
        await signOutRequest(); // server revoke first
      } catch (e) {
        if (statusOf(e) !== 401) {
          // Revoked/expired (401) means already signed out; anything else keeps the session.
          signingOutToken.current = null;
          setMessage('Could not sign out because CrewTally was unreachable. You are still signed in. Try again.');
          return 'failed';
        }
      }
    }
    generation.current += 1;
    pendingRef.current = null;
    pendingOwner.current = null;
    setPendingRoute(null);
    ownerRef.current = null;
    setNotice(null);
    setWorkspace(null);
    setUserId(null);
    setStatus('signedOut');
    const ok = await runCleanup(clearToken());
    signingOutToken.current = null;
    return ok ? 'ok' : 'failed';
  }, [runCleanup]);

  const rememberRoute = useCallback((path: string) => {
    if (path && !path.startsWith('/sign-in')) lastRoute.current = path;
  }, []);

  const consumePendingRoute = useCallback(() => {
    const route = pendingRef.current;
    pendingRef.current = null;
    setPendingRoute(null);
    return route;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status, workspace, userId, notice, message, busy, pendingRoute,
      signIn, developerSignIn, signOut, retryRestore: () => void restore(), rememberRoute, consumePendingRoute,
    }),
    [status, workspace, userId, notice, message, busy, pendingRoute, signIn, developerSignIn, signOut, restore, rememberRoute, consumePendingRoute],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

~~~

### artifacts/crewtally-mobile/components/DevSignInSheet.tsx

~~~ts
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColors } from '@/hooks/useColors';
import type { DeveloperSignInLabel, SignInResult } from '@/contexts/AuthContext';

interface Props {
  busy: boolean;
  onSignIn: (code: string, label: DeveloperSignInLabel) => Promise<SignInResult>;
}

const DevSignInSheet = __DEV__
  ? function DevSignInSheetComponent({ busy, onSignIn }: Props) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState<DeveloperSignInLabel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setVisible(false);
    setCode('');
    setLabel(null);
    setError(null);
  };

  const submit = async () => {
    if (!code.trim() || !label || busy) return;
    const submittedCode = code;
    setCode('');
    setError(null);
    const result = await onSignIn(submittedCode, label);
    if (result === 'ok') {
      close();
    } else {
      setError('Developer sign-in did not finish. Check the code and try again.');
    }
  };

  const choice = (value: DeveloperSignInLabel, title: string) => {
    const selected = label === value;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={title}
        key={value}
        onPress={() => setLabel(value)}
        testID={`dev-signin-${value}`}
        style={[
          styles.choice,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.muted : colors.background,
          },
        ]}
      >
        <Text allowFontScaling style={[styles.choiceText, { color: colors.foreground }]}>
          {title}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError(null);
          setVisible(true);
        }}
        testID="dev-signin-button"
        style={styles.linkButton}
      >
        <Text allowFontScaling style={[styles.link, { color: colors.mutedForeground }]}>
          Developer sign-in (test only)
        </Text>
      </Pressable>
      <Modal
        animationType="slide"
        onDismiss={close}
        onRequestClose={close}
        presentationStyle="pageSheet"
        testID="dev-signin-sheet"
        visible={visible}
      >
        <SafeAreaView
          accessibilityViewIsModal
          edges={['top', 'bottom', 'left', 'right']}
          style={[styles.safe, { backgroundColor: colors.background }]}
        >
          <View style={styles.content}>
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>
                Developer sign-in
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close developer sign-in" onPress={close}>
                <Text allowFontScaling style={[styles.close, { color: colors.primary }]}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Developer sign-in code"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setCode}
              placeholder="Code"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              testID="dev-signin-code"
              value={code}
            />
            <View accessibilityRole="radiogroup" accessibilityLabel="Choose test owner" style={styles.choices}>
              {choice('owner-a', 'Owner A')}
              {choice('owner-b', 'Owner B')}
            </View>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]} testID="dev-signin-error">
                {error}
              </Text>
            ) : null}
            <PrimaryButton
              disabled={busy || !code.trim() || !label}
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={() => void submit()}
              testID="dev-signin-submit"
            />
            <Text allowFontScaling style={[styles.note, { color: colors.mutedForeground }]}>
              Test-only access for development builds.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
  }
  : null;

export default DevSignInSheet;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, padding: 24, gap: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 24, fontWeight: '700' },
  close: { fontSize: 16, textDecorationLine: 'underline' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  choices: { flexDirection: 'row', gap: 12 },
  choice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  linkButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
});

~~~

### artifacts/crewtally-mobile/lib/devSignInApi.ts

~~~ts
import type { signInWithApple } from '@workspace/api-client-react';
import type { DeveloperSignInLabel } from '@/contexts/AuthContext';
import Constants from 'expo-constants';

type DevSignInRequest = (body: {
  code: string;
  label: DeveloperSignInLabel;
}) => Promise<Awaited<ReturnType<typeof signInWithApple>>>;

export const requestDevSignIn = __DEV__
  && Constants.expoConfig?.extra?.appEnv === 'development'
  ? function requestDevSignIn(code: string, label: DeveloperSignInLabel) {
    const { signInDev } = require('@workspace/api-client-react') as {
      signInDev: DevSignInRequest;
    };
    return signInDev({ code, label });
  }
  : null;

~~~
