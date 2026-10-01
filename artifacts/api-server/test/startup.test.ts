import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createAuthConfigLoader, loadAuthConfig } from "../src/auth/config";
import { runApiStartup, warnIfProductionDevSigninCodeIsSet } from "../src/server/startup";

function fixtureEnv(privateKey: string): NodeJS.ProcessEnv {
  return {
    APP_ENV: "development",
    APPLE_TEAM_ID: "TEAMTEST01",
    APPLE_KEY_ID: "KEYTEST001",
    APPLE_PRIVATE_KEY: privateKey,
    APPLE_BUNDLE_ID: "com.crewtallyapp.crewtally",
    APPLE_AUDIENCES: "host.exp.Exponent,com.crewtallyapp.crewtally",
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
}

describe("startup authentication configuration", () => {
  it("warns by configuration name in production without logging the configured value", () => {
    const entries: { fields: Record<string, unknown>; message?: string }[] = [];
    const fixtureCode = "production-warning-fixture-code";
    warnIfProductionDevSigninCodeIsSet(
      { APP_ENV: "production", DEV_SIGNIN_CODE: fixtureCode },
      { warn: (fields, message) => entries.push({ fields, message }) },
    );
    expect(entries).toEqual([{
      fields: { configuration: "DEV_SIGNIN_CODE" },
      message: "DEV_SIGNIN_CODE is set in production and will be ignored",
    }]);
    expect(JSON.stringify(entries)).not.toContain(fixtureCode);

    warnIfProductionDevSigninCodeIsSet(
      { APP_ENV: "production" },
      { warn: (fields, message) => entries.push({ fields, message }) },
    );
    warnIfProductionDevSigninCodeIsSet(
      { APP_ENV: "development", DEV_SIGNIN_CODE: fixtureCode },
      { warn: (fields, message) => entries.push({ fields, message }) },
    );
    expect(entries).toHaveLength(1);
  });

  it("loads and caches all config before migrations and listening", async () => {
    const generated = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = generated.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = fixtureEnv(pem);
    let parseCount = 0;
    const loadConfig = createAuthConfigLoader(env, source => {
      parseCount++;
      return loadAuthConfig(source);
    });
    const calls: string[] = [];
    await runApiStartup({
      loadAuthConfig: () => {
        calls.push("auth-config");
        return loadConfig();
      },
      migrate: async () => {
        calls.push("migrate");
      },
      listen: async () => {
        calls.push("listen");
      },
    });
    const reused = loadConfig();
    expect(reused.appEnv).toBe("development");
    expect(parseCount).toBe(1);
    expect(calls).toEqual(["auth-config", "migrate", "listen"]);
  });

  it("loads production config before listening and does not run development migrations", async () => {
    const generated = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = generated.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = fixtureEnv(pem);
    env.APP_ENV = "production";
    env.APPLE_AUDIENCES = "com.crewtallyapp.crewtally";
    const loadConfig = createAuthConfigLoader(env);
    const calls: string[] = [];
    await runApiStartup({
      loadAuthConfig: () => {
        calls.push("auth-config");
        return loadConfig();
      },
      migrate: async () => {
        calls.push("migrate");
      },
      listen: async () => {
        calls.push("listen");
      },
    });
    expect(calls).toEqual(["auth-config", "listen"]);
  });

  it("fails before migration or listen when the runtime fixture private key is invalid", async () => {
    const env = fixtureEnv("runtime-fixture-invalid-key");
    const loadConfig = createAuthConfigLoader(env);
    const calls: string[] = [];
    await expect(runApiStartup({
      loadAuthConfig: () => {
        calls.push("auth-config");
        return loadConfig();
      },
      migrate: async () => {
        calls.push("migrate");
      },
      listen: async () => {
        calls.push("listen");
      },
    })).rejects.toMatchObject({ message: "APPLE_PRIVATE_KEY Secret is invalid" });
    expect(calls).toEqual(["auth-config"]);
  });
});