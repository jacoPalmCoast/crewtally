import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import type { Pool } from "pg";
import { requireSession } from "../middlewares/session";

export function createMeRouter(db: Pool): IRouter {
  const router: IRouter = Router();
  router.get("/me", requireSession(db), async (req, res, next) => {
    try {
      const context = req.ctx!;
      const result = await db.query<{
        id: string;
        name: string;
        currency: string;
      }>(
        `SELECT id, name, currency_code::text AS currency
         FROM workspaces
         WHERE id = $1 AND owner_id = $2`,
        [context.workspaceId, context.userId],
      );
      const workspace = result.rows[0];
      if (!workspace) {
        res.status(401).json({ error: {
          code: "SESSION_EXPIRED",
          message: "Session expired",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      res.status(200).json(GetMeResponse.parse({
        workspace: { ...workspace, locale: "en-US" },
        user: { id: context.userId },
      }));
    } catch (error) {
      next(error);
    }
  });
  return router;
}