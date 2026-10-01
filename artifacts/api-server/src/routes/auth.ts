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