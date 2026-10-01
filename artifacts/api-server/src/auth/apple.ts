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