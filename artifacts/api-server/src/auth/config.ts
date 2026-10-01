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