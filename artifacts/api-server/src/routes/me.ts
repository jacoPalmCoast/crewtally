import { Router, type IRouter } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { inTransaction } from "../auth/member";
import { withUserIdempotency } from "../idempotency";
import { sessionRoute } from "./registration";

export function createMeRouter(db: Pool): IRouter {
  const router = Router();
  sessionRoute(router, db, "get", "/me", async (req, res, next) => {
    try {
      const result = await db.query(
        `select id, display_name, email, (apple_sub is not null and apple_sub not like 'dev:%') as has_apple,
         my_workspaces(id) as workspaces from users where id = $1 and deleted_at is null`, [req.ctx!.userId],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(401).json({ error: {
          code: "SESSION_EXPIRED",
          message: "Session expired",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      const { workspaces, ...user } = row;
      res.json({ user, workspaces });
    } catch (error) { next(error); }
  });
  sessionRoute(router, db, "patch", "/me", async (req, res, next) => {
    try {
      const body = z.object({ display_name: z.string().trim().max(60), operation_id: z.string().uuid() }).strict().parse(req.body);
      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
        { route: "PATCH /me", ...body }, async () => {
          const result = await tx.query("select set_display_name($1, $2) as result", [req.ctx!.userId, body.display_name || null]);
          return result.rows[0].result;
        }));
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}