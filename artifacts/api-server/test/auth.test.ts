import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import pg from "pg";
import request from "supertest";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import {
  decodeProtectedHeader,
  decodeJwt,
  exportJWK,
  jwtVerify,
  SignJWT,
} from "jose";
import { createApp } from "../src/app";
import {
  APPLE_JWKS_URL,
  APPLE_TOKEN_URL,
  createAppleClientSecret,
  decryptRefreshToken,
  encryptRefreshToken,
  exchangeAppleAuthorizationCode,
  createSessionToken,
  hashSessionToken,
} from "../src/auth/apple";
import { createAuthConfigLoader, loadAuthConfig } from "../src/auth/config";
import { createAuthRateLimiter } from "../src/middlewares/auth-rate-limit";
import { migrate } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { createTenancyHarness } from "./helpers/tenancy";
import { createTestOnlyResourceRouter } from "./helpers/test-only-resources";

const appEnv = process.env.APP_ENV;
const databaseUrl = process.env.DATABASE_URL;
if (appEnv === "production") throw new Error("Refusing auth tests in production");
if (!databaseUrl) throw new Error("DATABASE_URL is required for isolated auth tests");
const databaseName = new URL(databaseUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
if (/prod(?:uction)?/i.test(databaseName)) throw new Error("Refusing auth tests against a production database");

const schema = `test_auth_${randomUUID().replace(/-/g, "")}`;
let isolated: pg.Pool;
const appleSigningPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const clientSecretPair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const clientSecretPem = clientSecretPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const bundleId = "com.crewtallyapp.crewtally";
const jwtKeyId = "local-apple-test-key";
const devSigninFixtureCode = "unit-test-development-signin-code";
let appleJwk: Record<string, unknown>;

interface LogEntry {
  fields: Record<string, unknown>;
  message?: string;
}

interface TestApp {
  app: Express;
  logs: LogEntry[];
  fetcher: typeof fetch;
  env: NodeJS.ProcessEnv;
  jwksFetchCount: () => number;
}

function makeEnvironment(
  environment: "development" | "production" = "development",
  audiences = environment === "development" ? `host.exp.Exponent,${bundleId}` : bundleId,
): NodeJS.ProcessEnv {
  return {
    APP_ENV: environment,
    APPLE_TEAM_ID: "TEAMTEST01",
    APPLE_KEY_ID: "KEYTEST001",
    APPLE_PRIVATE_KEY: clientSecretPem,
    APPLE_BUNDLE_ID: bundleId,
    APPLE_AUDIENCES: audiences,
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ...(environment === "development" ? { DEV_SIGNIN_CODE: devSigninFixtureCode } : {}),
  };
}

function makeTestApp(
  environment: "development" | "production" = "development",
  options: {
    tokenResponse?: () => Response;
    testRoutes?: boolean;
    devSigninCode?: string | null;
  } = {},
): TestApp {
  const logs: LogEntry[] = [];
  const env = makeEnvironment(environment);
  if (options.devSigninCode === null) delete env.DEV_SIGNIN_CODE;
  else if (options.devSigninCode !== undefined) env.DEV_SIGNIN_CODE = options.devSigninCode;
  let jwksFetchCount = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.toString() === APPLE_JWKS_URL) {
      jwksFetchCount++;
      return new Response(JSON.stringify({ keys: [appleJwk] }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
      });
    }
    if (url.toString() === APPLE_TOKEN_URL) {
      if (options.tokenResponse) return options.tokenResponse();
      return new Response(JSON.stringify({ refresh_token: "runtime-generated-refresh-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    void init;
    throw new Error("Unexpected mocked network request");
  };
  const app = createApp({
    db: isolated,
    env,
    fetcher,
    logger: {
      info: (fields, message) => logs.push({ fields, message }),
      error: (fields, message) => logs.push({ fields, message }),
    },
    ...(options.testRoutes
      ? { testOnlyProtectedRouter: createTestOnlyResourceRouter(isolated) }
      : {}),
  });
  return { app, logs, fetcher, env, jwksFetchCount: () => jwksFetchCount };
}

function nonce(): string {
  return randomBytes(32).toString("base64url");
}

async function makeIdentityToken(
  rawNonce: string,
  overrides: {
    issuer?: string;
    audience?: string | string[];
    subject?: string;
    expiration?: number;
    signingKey?: typeof appleSigningPair.privateKey;
    nonceClaim?: string;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const signingKey = overrides.signingKey ?? appleSigningPair.privateKey;
  return new SignJWT({
    nonce: overrides.nonceClaim ?? createHash("sha256").update(rawNonce).digest("hex"),
  })
    .setProtectedHeader({ alg: "RS256", kid: jwtKeyId })
    .setIssuer(overrides.issuer ?? "https://appleid.apple.com")
    .setAudience(overrides.audience ?? bundleId)
    .setSubject(overrides.subject ?? `local-sub-${randomUUID()}`)
    .setIssuedAt(now - 1)
    .setExpirationTime(overrides.expiration ?? now + 300)
    .sign(signingKey);
}

async function signIn(app: Express, rawNonce: string, identityToken?: string) {
  return request(app)
    .post("/v1/auth/apple")
    .send({
      identityToken: identityToken ?? await makeIdentityToken(rawNonce),
      authorizationCode: `runtime-local-code-${randomUUID()}`,
      rawNonce,
    });
}

function devSignIn(app: Express, label: "owner-a" | "owner-b", code = devSigninFixtureCode, alias = false) {
  return request(app)
    .post(`${alias ? "/api" : ""}/v1/auth/dev`)
    .send({ code, label });
}

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  isolated = new pg.Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
  });
  await migrate(isolated, path.resolve("../../db/migrations"));
  await isolated.query(
    `CREATE TABLE test_auth_resources (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       workspace_id uuid NOT NULL REFERENCES workspaces(id)
     )`,
  );
  appleJwk = await exportJWK(appleSigningPair.publicKey);
  appleJwk.kid = jwtKeyId;
  appleJwk.alg = "RS256";
  appleJwk.use = "sig";
});

afterAll(async () => {
  if (isolated) await isolated.end();
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});

describe("Phase 1 auth configuration and cryptography", () => {
  it("loads an already formatted Apple P-256 PEM and all six Secrets", () => {
    const env = makeEnvironment();
    const config = loadAuthConfig(env);
    expect(config.appEnv).toBe("development");
    expect(config.appleAudiences).toEqual(["host.exp.Exponent", bundleId]);
    expect(config.applePrivateKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    expect(config.tokenEncryptionKey.byteLength).toBe(32);
  });

  it("parses fixture config and the P-256 key once per memoized loader", () => {
    const env = makeEnvironment();
    let parseCount = 0;
    const loadOnce = createAuthConfigLoader(env, source => {
      parseCount++;
      return loadAuthConfig(source);
    });
    const first = loadOnce();
    const second = loadOnce();
    expect(first).toBe(second);
    expect(parseCount).toBe(1);
  });

  it("rebuilds a space-collapsed PEM body into 64-character lines", () => {
    const env = makeEnvironment();
    env.APPLE_PRIVATE_KEY = clientSecretPem.replace(/\r?\n/g, " ");
    const config = loadAuthConfig(env);
    expect(config.applePrivateKey.asymmetricKeyType).toBe("ec");
    expect(config.applePrivateKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
  });

  it("normalizes escaped backslash-n sequences embedded in the PEM body", () => {
    const env = makeEnvironment();
    const body = clientSecretPem.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/s)?.[1]!;
    const encodedBody = body.replace(/\s/g, "");
    env.APPLE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----${encodedBody.slice(0, 32)}\\n${encodedBody.slice(32)}-----END PRIVATE KEY-----`;
    const config = loadAuthConfig(env);
    expect(config.applePrivateKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
  });

  it("reports a safe private-key error for garbage without echoing the supplied value", () => {
    const env = makeEnvironment();
    env.APPLE_PRIVATE_KEY = "runtime-invalid-private-key-material";
    try {
      loadAuthConfig(env);
      throw new Error("Expected invalid private key to fail");
    } catch (error) {
      expect(error).toMatchObject({ message: "APPLE_PRIVATE_KEY Secret is invalid" });
      expect(String(error)).not.toContain("runtime-invalid-private-key-material");
    }
  });

  it("rejects non-EC-P-256 Apple client keys in a safe format error", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const env = makeEnvironment();
    env.APPLE_PRIVATE_KEY = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => loadAuthConfig(env)).toThrow("APPLE_PRIVATE_KEY Secret must be an EC P-256 private key");
  });

  it("fails safely for every missing Secret without exposing other config values", () => {
    const names = [
      "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
      "APPLE_BUNDLE_ID", "APPLE_AUDIENCES", "TOKEN_ENCRYPTION_KEY",
    ];
    for (const name of names) {
      const env = makeEnvironment();
      delete env[name];
      expect(() => loadAuthConfig(env), name).toThrow(`${name} Secret is missing`);
    }
  });

  it("rejects missing or unrecognized APP_ENV instead of allowing a development bypass", () => {
    const missing = makeEnvironment();
    delete missing.APP_ENV;
    expect(() => loadAuthConfig(missing)).toThrow("APP_ENV must be development or production");
    expect(() => loadAuthConfig({ ...makeEnvironment(), APP_ENV: "test" })).toThrow(
      "APP_ENV must be development or production",
    );
  });

  it("disallows Expo Go audiences in production", () => {
    const env = makeEnvironment("production", `host.exp.Exponent,${bundleId}`);
    expect(() => loadAuthConfig(env)).toThrow(
      "Production APPLE_AUDIENCES Secret must contain only APPLE_BUNDLE_ID",
    );
  });

  it("encrypts and decrypts refresh tokens with AES-256-GCM and rejects a tampered tag", () => {
    const key = randomBytes(32);
    const userId = randomUUID();
    const original = "runtime-generated-refresh-token";
    const encrypted = encryptRefreshToken(original, key, userId);
    expect(decryptRefreshToken(encrypted, key, userId)).toBe(original);
    const tampered = { ...encrypted, authTag: Buffer.from(encrypted.authTag) };
    tampered.authTag[0] = tampered.authTag[0]! ^ 1;
    expect(() => decryptRefreshToken(tampered, key, userId)).toThrow("Apple credential encryption failed");
  });

  it("creates an ES256 Apple client secret valid for exactly five minutes", async () => {
    const env = makeEnvironment("production");
    const config = loadAuthConfig(env);
    const clientSecret = await createAppleClientSecret(config, 1_800_000_000);
    const header = decodeProtectedHeader(clientSecret);
    const claims = decodeJwt(clientSecret);
    expect(header).toMatchObject({ alg: "ES256", kid: "KEYTEST001", typ: "JWT" });
    expect(claims.iss).toBe("TEAMTEST01");
    expect(claims.sub).toBe(bundleId);
    expect(claims.aud).toBe("https://appleid.apple.com");
    expect(claims.exp! - claims.iat!).toBe(300);
    await expect(jwtVerify(clientSecret, clientSecretPair.publicKey, {
      issuer: "TEAMTEST01",
      audience: "https://appleid.apple.com",
    })).resolves.toBeDefined();
  });

  it("exchanges an authorization code as form data without a redirect URI", async () => {
    const config = loadAuthConfig(makeEnvironment("production"));
    let captured: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      expect(input.toString()).toBe(APPLE_TOKEN_URL);
      captured = init;
      return new Response(JSON.stringify({ refresh_token: "runtime-generated-refresh-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await expect(exchangeAppleAuthorizationCode("runtime-local-code", config, fetcher)).resolves.toBe(
      "runtime-generated-refresh-token",
    );
    expect(captured?.method).toBe("POST");
    expect(captured?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    const form = new URLSearchParams(captured?.body as URLSearchParams);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("client_id")).toBe(bundleId);
    expect(form.get("code")).toBe("runtime-local-code");
    expect(form.get("client_secret")).toBeTruthy();
    expect(form.has("redirect_uri")).toBe(false);
  });
});

describe("Phase 1 sign-in and session routes", () => {
  it("registers development sign-in only when enabled with a nonempty code", async () => {
    const cases = [
      makeTestApp("development", { devSigninCode: null }).app,
      makeTestApp("development", { devSigninCode: "" }).app,
      makeTestApp("production").app,
      makeTestApp("production", { devSigninCode: devSigninFixtureCode }).app,
    ];
    for (const app of cases) {
      for (const route of ["/v1/auth/dev", "/api/v1/auth/dev"]) {
        const response = await request(app).post(route).send({
          code: devSigninFixtureCode,
          label: "owner-a",
        });
        expect(response.status).toBe(404);
        expect(response.status).not.toBe(403);
      }
    }
  });

  it("creates isolated development owners through the shared session path", async () => {
    const testApp = makeTestApp("development", { testRoutes: true });
    const [ownerA, ownerB, ownerARepeat] = await Promise.all([
      devSignIn(testApp.app, "owner-a"),
      devSignIn(testApp.app, "owner-b", devSigninFixtureCode, true),
      devSignIn(testApp.app, "owner-a"),
    ]);
    for (const response of [ownerA, ownerB, ownerARepeat]) {
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        sessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        workspace: { name: "My workspace", currency: "USD", locale: "en-US" },
        user: { id: expect.any(String) },
      });
    }
    expect(ownerA.body.user.id).toBe(ownerARepeat.body.user.id);
    expect(ownerA.body.workspace.id).toBe(ownerARepeat.body.workspace.id);
    expect(ownerA.body.user.id).not.toBe(ownerB.body.user.id);
    expect(ownerA.body.workspace.id).not.toBe(ownerB.body.workspace.id);

    const users = await isolated.query<{ id: string; apple_sub: string }>(
      "SELECT id, apple_sub FROM users WHERE apple_sub = ANY($1::text[]) ORDER BY apple_sub",
      [["dev:owner-a", "dev:owner-b"]],
    );
    expect(users.rows).toHaveLength(2);
    expect(users.rows.map(row => row.apple_sub)).toEqual(["dev:owner-a", "dev:owner-b"]);
    expect(users.rows.find(row => row.apple_sub === "dev:owner-a")!.id).toBe(ownerA.body.user.id);
    expect(users.rows.find(row => row.apple_sub === "dev:owner-b")!.id).toBe(ownerB.body.user.id);

    const workspaceCount = await isolated.query(
      "SELECT id FROM workspaces WHERE owner_id = ANY($1::uuid[])",
      [[ownerA.body.user.id, ownerB.body.user.id]],
    );
    expect(workspaceCount.rowCount).toBe(2);
    const credentials = await isolated.query(
      "SELECT user_id FROM apple_credentials WHERE user_id = ANY($1::uuid[])",
      [[ownerA.body.user.id, ownerB.body.user.id]],
    );
    expect(credentials.rowCount).toBe(0);
    expect(testApp.jwksFetchCount()).toBe(0);

    for (const response of [ownerA, ownerB, ownerARepeat]) {
      const token = response.body.sessionToken as string;
      const stored = await isolated.query<{ token_hash: Buffer; session_text: string }>(
        `SELECT token_hash, encode(token_hash, 'hex') AS session_text
         FROM sessions WHERE token_hash = $1`,
        [hashSessionToken(token)],
      );
      expect(stored.rowCount).toBe(1);
      expect(stored.rows[0]!.token_hash).toEqual(hashSessionToken(token));
      expect(stored.rows[0]!.session_text).not.toContain(token);
    }

    const ownerABearer = `Bearer ${ownerA.body.sessionToken}`;
    const ownerBBearer = `Bearer ${ownerB.body.sessionToken}`;
    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerABearer)).body.workspace.id)
      .toBe(ownerA.body.workspace.id);
    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerBBearer)).body.workspace.id)
      .toBe(ownerB.body.workspace.id);
    const foreignResource = await isolated.query<{ id: string }>(
      "INSERT INTO test_auth_resources (workspace_id) VALUES ($1) RETURNING id",
      [ownerB.body.workspace.id],
    );
    const foreignId = foreignResource.rows[0]!.id;
    expect((await request(testApp.app).get(`/v1/test/resources/${foreignId}`)
      .set("Authorization", ownerABearer)).status).toBe(404);
    expect((await request(testApp.app).get(`/v1/test/resources/${foreignId}`)
      .set("Authorization", ownerBBearer)).status).toBe(200);

    const ownerASessionHash = hashSessionToken(ownerA.body.sessionToken as string);
    await isolated.query(
      `UPDATE sessions
       SET last_seen_at = now() - interval '25 hours',
           expires_at = now() + interval '1 day'
       WHERE token_hash = $1`,
      [ownerASessionHash],
    );
    const expiryBefore = await isolated.query<{ expires_at: Date }>(
      "SELECT expires_at FROM sessions WHERE token_hash = $1",
      [ownerASessionHash],
    );
    expect((await request(testApp.app).get("/v1/me").set("Authorization", ownerABearer)).status).toBe(200);
    const expiryAfter = await isolated.query<{ expires_at: Date; last_seen_at: Date }>(
      "SELECT expires_at, last_seen_at FROM sessions WHERE token_hash = $1",
      [ownerASessionHash],
    );
    expect(expiryAfter.rows[0]!.expires_at.getTime()).toBeGreaterThan(expiryBefore.rows[0]!.expires_at.getTime());
    expect(Date.now() - expiryAfter.rows[0]!.last_seen_at.getTime()).toBeLessThan(60_000);

    const authEvents = testApp.logs.filter(entry => entry.message === "auth_dev_signin");
    expect(authEvents.map(entry => entry.fields.label).sort()).toEqual(["owner-a", "owner-a", "owner-b"]);
    expect(authEvents.every(entry => Object.keys(entry.fields).length === 1)).toBe(true);
    const serializedLogs = JSON.stringify(testApp.logs);
    for (const sensitiveValue of [
      devSigninFixtureCode,
      ownerA.body.sessionToken,
      ownerB.body.sessionToken,
      ownerARepeat.body.sessionToken,
      "dev:owner-a",
      "dev:owner-b",
    ]) {
      expect(serializedLogs).not.toContain(sensitiveValue);
    }
  });

  it("returns one generic unauthorized response for wrong development codes without logging them", async () => {
    const testApp = makeTestApp();
    const usersBefore = await isolated.query<{ count: string }>(
      "SELECT count(*) AS count FROM users WHERE apple_sub = 'dev:owner-a'",
    );
    const attemptedCodes = [
      `wrong-code-${randomUUID()}`,
      `another-wrong-code-${randomUUID()}`,
    ];
    const responses = await Promise.all(
      attemptedCodes.map(code => devSignIn(testApp.app, "owner-a", code)),
    );
    expect(responses.map(response => response.status)).toEqual([401, 401]);
    expect(responses.map(({ body }) => body.error.code)).toEqual(["INVALID_CREDENTIALS", "INVALID_CREDENTIALS"]);
    expect(responses.map(({ body }) => body.error.message))
      .toEqual(["Sign in could not be completed", "Sign in could not be completed"]);
    const serializedLogs = JSON.stringify(testApp.logs);
    for (const attemptedCode of [...attemptedCodes, devSigninFixtureCode]) {
      expect(serializedLogs).not.toContain(attemptedCode);
    }
    expect(testApp.logs.some(entry => entry.message === "auth_dev_signin")).toBe(false);
    const usersAfter = await isolated.query<{ count: string }>(
      "SELECT count(*) AS count FROM users WHERE apple_sub = 'dev:owner-a'",
    );
    expect(usersAfter.rows[0]!.count).toBe(usersBefore.rows[0]!.count);
  });

  it("strictly validates the development sign-in body and applies the shared 10-per-minute limit", async () => {
    const app = makeTestApp().app;
    const invalidBodies = [
      {},
      { code: "", label: "owner-a" },
      { code: "x".repeat(4097), label: "owner-a" },
      { code: devSigninFixtureCode, label: "owner-c" },
      { code: devSigninFixtureCode, label: "owner-a", extra: "rejected" },
    ];
    for (const body of invalidBodies) {
      const response = await request(app).post("/v1/auth/dev").send(body);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("INVALID_INPUT");
    }

    const limitedApp = makeTestApp().app;
    const responses = await Promise.all(
      Array.from({ length: 11 }, () => devSignIn(limitedApp, "owner-a", "wrong-fixture-code")),
    );
    expect(responses.filter(response => response.status === 401)).toHaveLength(10);
    expect(responses.filter(response => response.status === 429)).toHaveLength(1);
  });

  it("verifies the SHA-256 hex nonce, signs in, and creates exactly one workspace", async () => {
    const testApp = makeTestApp();
    const rawNonce = nonce();
    const sub = `first-sign-in-sub-${randomUUID()}`;
    const identityToken = await makeIdentityToken(rawNonce, { subject: sub });
    const response = await signIn(testApp.app, rawNonce, identityToken);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      sessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      workspace: { name: "My workspace", currency: "USD", locale: "en-US" },
      user: { id: expect.any(String) },
    });
    const userRows = await isolated.query<{ id: string }>(
      "SELECT id FROM users WHERE apple_sub = $1",
      [sub],
    );
    const workspaceRows = await isolated.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE owner_id = $1",
      [response.body.user.id],
    );
    const sessionRows = await isolated.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM sessions WHERE user_id = $1",
      [response.body.user.id],
    );
    expect(userRows.rowCount).toBe(1);
    expect(workspaceRows.rowCount).toBe(1);
    expect(sessionRows.rowCount).toBe(1);
  });

  it("reuses the same user and workspace on concurrent repeat sign-ins", async () => {
    const testApp = makeTestApp();
    const rawNonce = nonce();
    const sub = `repeat-sub-${randomUUID()}`;
    const identityToken = await makeIdentityToken(rawNonce, { subject: sub });
    const [first, second] = await Promise.all([
      signIn(testApp.app, rawNonce, identityToken),
      signIn(testApp.app, rawNonce, identityToken),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.user.id).toBe(second.body.user.id);
    expect(first.body.workspace.id).toBe(second.body.workspace.id);
    const users = await isolated.query("SELECT id FROM users WHERE apple_sub = $1", [sub]);
    const workspaces = await isolated.query("SELECT id FROM workspaces WHERE owner_id = $1", [first.body.user.id]);
    expect(users.rowCount).toBe(1);
    expect(workspaces.rowCount).toBe(1);
  });

  it("caches the Apple JWKS response while verifying separate sign-ins", async () => {
    const testApp = makeTestApp();
    for (let index = 0; index < 2; index++) {
      const rawNonce = nonce();
      const response = await signIn(testApp.app, rawNonce);
      expect(response.status).toBe(200);
    }
    expect(testApp.jwksFetchCount()).toBe(1);
  });

  it("enforces strict auth request properties and bounded token, code, and nonce lengths", async () => {
    const app = makeTestApp().app;
    const rawNonce = nonce();
    const validToken = await makeIdentityToken(rawNonce);
    const invalidBodies = [
      { identityToken: validToken, authorizationCode: "local-code", rawNonce, extra: "rejected" },
      { identityToken: "x".repeat(16_385), authorizationCode: "local-code", rawNonce },
      { identityToken: validToken, authorizationCode: "x".repeat(4_097), rawNonce },
      { identityToken: validToken, authorizationCode: "local-code", rawNonce: "short" },
      { identityToken: validToken, authorizationCode: "local-code", rawNonce: `${"A".repeat(42)}B` },
    ];
    for (const body of invalidBodies) {
      const response = await request(app).post("/v1/auth/apple").send(body);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("INVALID_INPUT");
    }
  });

  it.each([
    ["wrong issuer", { issuer: "https://invalid.appleid.example" }],
    ["wrong audience", { audience: "com.example.untrusted" }],
    ["expired token", { expiration: Math.floor(Date.now() / 1000) - 60 }],
    ["bad signature", { signingKey: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey }],
    ["nonce mismatch", { nonceClaim: "not-the-sha256-hex-nonce" }],
  ])("returns 401 for %s", async (_name, overrides) => {
    const testApp = makeTestApp();
    const rawNonce = nonce();
    const identityToken = await makeIdentityToken(rawNonce, overrides);
    const response = await signIn(testApp.app, rawNonce, identityToken);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_IDENTITY_TOKEN");
  });

  it("stores only the session SHA-256 hash and never the raw token", async () => {
    const testApp = makeTestApp();
    const rawNonce = nonce();
    const response = await signIn(testApp.app, rawNonce);
    expect(response.status).toBe(200);
    const sessionToken = response.body.sessionToken as string;
    const stored = await isolated.query<{ token_hash: Buffer; session_text: string }>(
      `SELECT token_hash, encode(token_hash, 'hex') AS session_text
       FROM sessions WHERE token_hash = $1`,
      [hashSessionToken(sessionToken)],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]!.token_hash).toEqual(hashSessionToken(sessionToken));
    expect(stored.rows[0]!.session_text).not.toContain(sessionToken);
  });

  it("rejects expired and revoked sessions and slides an active expiry after 24 hours", async () => {
    const harness = createTenancyHarness(isolated, makeTestApp().app);
    const expired = await harness.createOwner();
    await isolated.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [
      hashSessionToken(expired.token),
    ]);
    expect((await expired.agent.get("/v1/me")).status).toBe(401);

    const revoked = await harness.createOwner();
    await isolated.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [
      hashSessionToken(revoked.token),
    ]);
    expect((await revoked.agent.get("/v1/me")).status).toBe(401);

    const sliding = await harness.createOwner();
    await isolated.query(
      `UPDATE sessions
       SET last_seen_at = now() - interval '25 hours',
           expires_at = now() + interval '1 day'
       WHERE token_hash = $1`,
      [hashSessionToken(sliding.token)],
    );
    const before = await isolated.query<{ expires_at: Date }>(
      "SELECT expires_at FROM sessions WHERE token_hash = $1",
      [hashSessionToken(sliding.token)],
    );
    expect((await sliding.agent.get("/v1/me")).status).toBe(200);
    const after = await isolated.query<{ expires_at: Date; last_seen_at: Date }>(
      "SELECT expires_at, last_seen_at FROM sessions WHERE token_hash = $1",
      [hashSessionToken(sliding.token)],
    );
    expect(after.rows[0]!.expires_at.getTime()).toBeGreaterThan(before.rows[0]!.expires_at.getTime());
    expect(Date.now() - after.rows[0]!.last_seen_at.getTime()).toBeLessThan(60_000);
  });

  it("rejects unknown or malformed bearer tokens and accepts a case-insensitive scheme", async () => {
    const app = makeTestApp().app;
    const owner = await createTenancyHarness(isolated, app).createOwner();
    expect((await request(app).get("/v1/me").set("Authorization", `Bearer ${createSessionToken()}`)).status).toBe(401);
    expect((await request(app).get("/v1/me").set("Authorization", `Bearer ${owner.token} trailing`)).status).toBe(401);
    expect((await request(app).get("/v1/me").set("Authorization", `bEaReR ${owner.token}`)).status).toBe(200);
  });

  it("requires and revokes only the caller's own session on signout", async () => {
    const app = makeTestApp().app;
    const harness = createTenancyHarness(isolated, app);
    const first = await harness.createOwner();
    const second = await harness.createOwner();
    const response = await first.agent.post("/v1/auth/signout").send({});
    expect(response.status).toBe(204);
    expect(response.headers["cache-control"]).toBe("no-store");
    const sessions = await isolated.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM sessions WHERE token_hash = ANY($1::bytea[])",
      [[hashSessionToken(first.token), hashSessionToken(second.token)]],
    );
    expect(sessions.rows.filter(row => row.revoked_at).length).toBe(1);
    expect((await first.agent.get("/v1/me")).status).toBe(401);
    expect((await second.agent.get("/v1/me")).status).toBe(200);
  });

  it("returns each owner's own /me workspace and proves cross-workspace 404 behavior", async () => {
    const app = makeTestApp("development", { testRoutes: true }).app;
    const harness = createTenancyHarness(isolated, app);
    const first = await harness.createOwner();
    const second = await harness.createOwner();
    const firstMe = await first.agent.get("/v1/me");
    const secondMe = await second.agent.get("/v1/me");
    expect(firstMe.headers["cache-control"]).toBe("no-store");
    expect(firstMe.body.workspace.id).toBe(first.workspaceId);
    expect(secondMe.body.workspace.id).toBe(second.workspaceId);

    const resource = await isolated.query<{ id: string }>(
      "INSERT INTO test_auth_resources (workspace_id) VALUES ($1) RETURNING id",
      [second.workspaceId],
    );
    const otherWorkspaceId = resource.rows[0]!.id;
    await first.expectNotFoundAcrossWorkspaces("/v1/test/resources/:id", "get", otherWorkspaceId);
    expect((await second.agent.get(`/v1/test/resources/${otherWorkspaceId}`)).status).toBe(200);
    await expect(first.expectNotFoundAcrossWorkspaces(
      "/v1/test/helpers/unscoped/:id",
      "get",
      otherWorkspaceId,
    )).rejects.toThrow();
  });

  it("returns 401 without a token for every registered protected v1 route", async () => {
    const app = makeTestApp("development", { testRoutes: true }).app;
    const protectedRoutes = [
      ["get", "/v1/me"],
      ["post", "/v1/auth/signout"],
      ["get", `/v1/test/resources/${randomUUID()}`],
      ["get", `/v1/test/helpers/unscoped/${randomUUID()}`],
    ] as const;
    for (const [method, route] of protectedRoutes) {
      const response = method === "get"
        ? await request(app).get(route)
        : await request(app).post(route);
      expect(response.status, `${method.toUpperCase()} ${route}`).toBe(401);
      expect(response.body.error.code).toBe("SESSION_EXPIRED");
    }
  });

  it("applies a bounded 10-per-minute auth IP limit without trusting forwarded headers", async () => {
    let currentTime = 1_800_000_000_000;
    const app = makeTestApp().app;
    const statuses: number[] = [];
    for (let index = 0; index < 11; index++) {
      const response = await request(app)
        .post("/v1/auth/apple")
        .set("X-Forwarded-For", `198.51.100.${index + 1}`)
        .send({});
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every(status => status === 422)).toBe(true);
    expect(statuses[10]).toBe(429);

    const limiter = createAuthRateLimiter(() => currentTime, 1);
    const invokeLimiter = (peerIp: string) => new Promise<number>((resolve) => {
      let statusCode = 204;
      const response = {
        locals: { correlationId: randomUUID() },
        setHeader: () => undefined,
        status: (status: number) => {
          statusCode = status;
          return response;
        },
        json: () => resolve(statusCode),
      };
      limiter(
        { socket: { remoteAddress: peerIp } } as unknown as import("express").Request,
        response as unknown as import("express").Response,
        () => resolve(204),
      );
    });
    expect(await invokeLimiter("peer-a")).toBe(204);
    expect(await invokeLimiter("peer-b")).toBe(429);
    currentTime += 60_001;
    expect(await invokeLimiter("peer-b")).toBe(204);
  });

  it("serves the documented health path through both v1 aliases with its existing payload", async () => {
    const app = makeTestApp().app;
    const direct = await request(app).get("/v1/health");
    const proxy = await request(app).get("/api/v1/health");
    expect(direct.status).toBe(200);
    expect(proxy.status).toBe(200);
    expect(direct.body).toEqual({ status: "ok", db: "ok", migrations: 2 });
    expect(proxy.body).toEqual(direct.body);
  });

  it("serves Apple sign-in, /me, and signout through the /api/v1 alias", async () => {
    const app = makeTestApp().app;
    const rawNonce = nonce();
    const response = await request(app)
      .post("/api/v1/auth/apple")
      .send({
        identityToken: await makeIdentityToken(rawNonce),
        authorizationCode: `runtime-local-code-${randomUUID()}`,
        rawNonce,
      });
    expect(response.status).toBe(200);
    const bearer = `Bearer ${response.body.sessionToken}`;
    expect((await request(app).get("/api/v1/me").set("Authorization", bearer)).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/signout").set("Authorization", bearer)).status).toBe(204);
  });

  it("fails production sign-in closed on Apple exchange errors without logging Apple response data", async () => {
    const appleResponseMarker = `runtime-apple-response-${randomUUID()}`;
    const testApp = makeTestApp("production", {
      tokenResponse: () => new Response(JSON.stringify({
        error: "invalid_grant",
        error_description: appleResponseMarker,
      }), { status: 400, headers: { "content-type": "application/json" } }),
    });
    const rawNonce = nonce();
    const attemptedSub = `exchange-failure-sub-${randomUUID()}`;
    const response = await signIn(
      testApp.app,
      rawNonce,
      await makeIdentityToken(rawNonce, { subject: attemptedSub }),
    );
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("APPLE_EXCHANGE_FAILED");
    expect(response.body.error.message).not.toContain(appleResponseMarker);
    const inserted = await isolated.query(
      "SELECT id FROM users WHERE apple_sub = $1",
      [attemptedSub],
    );
    expect(inserted.rowCount).toBe(0);
    expect(JSON.stringify(testApp.logs)).not.toContain(appleResponseMarker);
  });

  it("stores production Apple refresh tokens only as AES-256-GCM ciphertext", async () => {
    const testApp = makeTestApp("production");
    const rawNonce = nonce();
    const sub = `encrypted-sub-${randomUUID()}`;
    const response = await signIn(
      testApp.app,
      rawNonce,
      await makeIdentityToken(rawNonce, { subject: sub }),
    );
    expect(response.status).toBe(200);
    const stored = await isolated.query<{
      id: string;
      refresh_token_ciphertext: Buffer;
      iv: Buffer;
      auth_tag: Buffer;
    }>(
      `SELECT c.user_id AS id, c.refresh_token_ciphertext, c.iv, c.auth_tag
       FROM apple_credentials c
       JOIN users u ON u.id = c.user_id
       WHERE u.apple_sub = $1`,
      [sub],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]!.refresh_token_ciphertext.toString("utf8"))
      .not.toBe("runtime-generated-refresh-token");
    const config = loadAuthConfig(testApp.env);
    expect(decryptRefreshToken({
      ciphertext: stored.rows[0]!.refresh_token_ciphertext,
      iv: stored.rows[0]!.iv,
      authTag: stored.rows[0]!.auth_tag,
    }, config.tokenEncryptionKey, stored.rows[0]!.id)).toBe("runtime-generated-refresh-token");
  });

  it("logs and continues after a failed development exchange", async () => {
    const testApp = makeTestApp("development", {
      tokenResponse: () => new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    });
    const rawNonce = nonce();
    const sub = `development-exchange-failure-${randomUUID()}`;
    const response = await signIn(
      testApp.app,
      rawNonce,
      await makeIdentityToken(rawNonce, { subject: sub }),
    );
    expect(response.status).toBe(200);
    expect(testApp.logs.some(entry => entry.fields.apple_exchange === "skipped_dev")).toBe(true);
    const credentials = await isolated.query(
      `SELECT c.user_id FROM apple_credentials c
       JOIN users u ON u.id = c.user_id WHERE u.apple_sub = $1`,
      [sub],
    );
    expect(credentials.rowCount).toBe(0);
  });

  it("stores a successful development exchange refresh token encrypted", async () => {
    const testApp = makeTestApp("development", {
      tokenResponse: () => new Response(JSON.stringify({
        refresh_token: "runtime-generated-development-refresh-token",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const rawNonce = nonce();
    const sub = `development-exchange-success-${randomUUID()}`;
    const response = await signIn(
      testApp.app,
      rawNonce,
      await makeIdentityToken(rawNonce, { subject: sub }),
    );
    expect(response.status).toBe(200);
    expect(testApp.logs.some(entry => entry.fields.apple_exchange === "skipped_dev")).toBe(false);
    const stored = await isolated.query<{
      user_id: string;
      refresh_token_ciphertext: Buffer;
      iv: Buffer;
      auth_tag: Buffer;
    }>(
      `SELECT c.user_id, c.refresh_token_ciphertext, c.iv, c.auth_tag
       FROM apple_credentials c JOIN users u ON u.id = c.user_id
       WHERE u.apple_sub = $1`,
      [sub],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]!.refresh_token_ciphertext.toString("utf8"))
      .not.toBe("runtime-generated-development-refresh-token");
    const config = loadAuthConfig(testApp.env);
    expect(decryptRefreshToken({
      ciphertext: stored.rows[0]!.refresh_token_ciphertext,
      iv: stored.rows[0]!.iv,
      authTag: stored.rows[0]!.auth_tag,
    }, config.tokenEncryptionKey, stored.rows[0]!.user_id))
      .toBe("runtime-generated-development-refresh-token");
  });

  it("never logs tokens, authorization codes, Apple sub, or private keys", async () => {
    const testApp = makeTestApp("development", {
      tokenResponse: () => new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    });
    const rawNonce = nonce();
    const sub = `private-test-sub-${randomUUID()}`;
    const authorizationCode = `private-test-code-${randomUUID()}`;
    const identityToken = await makeIdentityToken(rawNonce, { subject: sub });
    const response = await request(testApp.app)
      .post("/v1/auth/apple")
      .send({ identityToken, authorizationCode, rawNonce });
    expect(response.status).toBe(200);
    const serializedLogs = JSON.stringify(testApp.logs);
    for (const secret of [identityToken, authorizationCode, response.body.sessionToken, sub, clientSecretPem]) {
      expect(serializedLogs).not.toContain(secret);
    }
    expect(serializedLogs).toContain("skipped_dev");
  });
});