import { Router, type IRouter } from "express";
import type { Pool } from "pg";

export function createTestOnlyResourceRouter(db: Pool): IRouter {
  const router: IRouter = Router();
  router.get("/test/resources/:id", async (req, res, next) => {
    try {
      const result = await db.query<{ id: string }>(
        "SELECT id FROM test_auth_resources WHERE id = $1 AND workspace_id = $2",
        [req.params.id, req.ctx!.workspaceId],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
        return;
      }
      res.json({ id: result.rows[0]!.id });
    } catch (error) {
      next(error);
    }
  });

  // Deliberately unsafe test-only route proves the tenancy helper fails if a
  // later test route forgets to filter by the authenticated workspace.
  router.get("/test/helpers/unscoped/:id", async (req, res, next) => {
    try {
      const result = await db.query<{ id: string }>(
        "SELECT id FROM test_auth_resources WHERE id = $1",
        [req.params.id],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
        return;
      }
      res.json({ id: result.rows[0]!.id });
    } catch (error) {
      next(error);
    }
  });
  return router;
}