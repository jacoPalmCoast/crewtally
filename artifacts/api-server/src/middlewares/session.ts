import type { RequestHandler } from "express";
import type { Pool } from "pg";
import { hashSessionToken } from "../auth/apple";

export interface SessionContext {
  userId: string;
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
           SELECT s.id AS "sessionId", s.user_id AS "userId",
                  (s.last_seen_at <= now() - interval '24 hours') AS extend_session
           FROM sessions s
           JOIN users u ON u.id = s.user_id
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
          SELECT e."sessionId", e."userId"
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