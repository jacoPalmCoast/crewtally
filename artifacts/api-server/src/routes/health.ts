import { Router, type IRouter } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

export function createHealthRouter(
  db: Pool = pool,
  log: typeof logger = logger,
): IRouter {
  const router: IRouter = Router();
  router.get("/health", async (_req, res, next) => {
    let phase = "database";
    try {
      await db.query("select 1");
      phase = "migration_count";
      const result = await db.query<{ count: string }>("select count(*)::text as count from schema_migrations");
      phase = "response";
      res.json({ status: "ok", db: "ok", migrations: Number(result.rows[0]?.count ?? 0) });
    } catch (error) {
      log.error({ correlationId: res.locals.correlationId, phase }, "health failed");
      next(error);
    }
  });
  return router;
}

export default createHealthRouter();
