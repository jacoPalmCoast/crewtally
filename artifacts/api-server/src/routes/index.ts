import { Router, type IRouter } from "express";
import type { Pool } from "pg";
import type { AuthConfigLoader } from "../auth/config";
import { createAuthConfigLoader, getDefaultAuthConfig } from "../auth/config";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { createAuthRateLimiter } from "../middlewares/auth-rate-limit";
import { requireSession } from "../middlewares/session";
import { createAuthRouter } from "./auth";
import { createHealthRouter } from "./health";
import { createMeRouter } from "./me";

export interface RouterLogger {
  info: (fields: Record<string, unknown>, message?: string) => void;
  error: (fields: Record<string, unknown>, message?: string) => void;
}

export interface RouterOptions {
  db?: Pool;
  env?: NodeJS.ProcessEnv;
  getAuthConfig?: AuthConfigLoader;
  fetcher?: typeof fetch;
  logger?: RouterLogger;
  testOnlyProtectedRouter?: IRouter;
}

export function createRouter(options: RouterOptions = {}): IRouter {
  const db = options.db ?? pool;
  const fetcher = options.fetcher ?? fetch;
  const getConfig = options.getAuthConfig ??
    (options.env ? createAuthConfigLoader(options.env) : getDefaultAuthConfig);

  const router: IRouter = Router();
  router.use(createHealthRouter(db, logger));
  router.use("/auth", createAuthRateLimiter());
  router.use("/auth", createAuthRouter({
    db,
    getConfig,
    fetcher,
    logger: options.logger ?? logger,
  }));

  const protect = requireSession(db);
  router.use((req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/auth/")) {
      next();
      return;
    }
    protect(req, res, next);
  });
  router.use(createMeRouter(db));
  if (options.testOnlyProtectedRouter) router.use(options.testOnlyProtectedRouter);
  return router;
}

const router: IRouter = createRouter();
export default router;
