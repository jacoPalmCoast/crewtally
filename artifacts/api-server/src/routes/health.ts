import { Router, type IRouter } from "express";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/health", async (_req, res, next) => {
  let phase = "database";
  try {
    await pool.query("select 1");
    phase = "migration_count";
    const result = await pool.query<{ count: string }>("select count(*)::text as count from schema_migrations");
    phase = "response";
    res.json({ status: "ok", db: "ok", migrations: Number(result.rows[0]?.count ?? 0) });
  } catch (error) {
    logger.error({ correlationId: res.locals.correlationId, phase }, "health failed");
    next(error);
  }
});

export default router;
