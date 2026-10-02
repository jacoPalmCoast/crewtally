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
import { createWorkspaceRouter } from "./workspaces";
import { createMembersRouter } from "./members";
import { createInvitationRouter } from "./invitations";

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
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const getConfig = options.getAuthConfig ??
    (options.env ? createAuthConfigLoader(options.env) : getDefaultAuthConfig);
  const devSigninCode = env.APP_ENV === "development" &&
    typeof env.DEV_SIGNIN_CODE === "string" &&
    env.DEV_SIGNIN_CODE.length > 0
    ? env.DEV_SIGNIN_CODE
    : undefined;

  const router: IRouter = Router();
  router.use(createHealthRouter(db, logger));
  router.use("/auth", createAuthRateLimiter());
  router.use("/auth", createAuthRouter({
    db,
    getConfig,
    fetcher,
    ...(devSigninCode === undefined ? {} : { devSigninCode }),
    logger: options.logger ?? logger,
  }));

  router.use(createMeRouter(db));
  router.use(createWorkspaceRouter(db, env));
  router.use(createMembersRouter(db));
  router.use(createInvitationRouter(db, env));
  if (options.testOnlyProtectedRouter) router.use(requireSession(db), options.testOnlyProtectedRouter);
  return router;
}

const router: IRouter = createRouter();
export default router;
