import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { createRouter, type RouterOptions } from "./routes";
import { logger } from "./lib/logger";
import { mapError } from "./lib/errors";

export function createApp(options: RouterOptions = {}): Express {
  const app: Express = express();
  const log = options.logger ?? logger;

  app.use((req, res, next) => {
    res.locals.correlationId = randomUUID();
    res.setHeader("X-Correlation-Id", res.locals.correlationId);
    if (/(?:^|\/)auth(?:\/|$)/i.test(req.path) || /\/me$/i.test(req.path)) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      // Only use a registered path template. Unmatched paths must not enter logs.
      log.info({
        correlationId: res.locals.correlationId,
        method: req.method,
        path: req.route?.path ?? (res.statusCode === 404 ? "<unmatched>" : "<middleware>"),
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - start) / 1000000n),
      }, "request");
    });
    next();
  });

  const router = createRouter(options);
  // /api is the Replit proxy prefix; /v1 is also retained for direct callers.
  app.use("/api/v1", router);
  app.use("/v1", router);
  app.use((_req, res) => res.status(404).json({ error: {
    code: "NOT_FOUND", message: "Not found", correlationId: res.locals.correlationId,
  } }));
  app.use(createErrorHandler(log));
  return app;
}

export function createErrorHandler(log: NonNullable<RouterOptions["logger"]> = logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mapped = mapError(err);
    log.error({
      correlationId: res.locals.correlationId,
      code: mapped.code,
      sqlstate: err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : undefined,
      errorType: err instanceof Error ? err.constructor.name : typeof err,
    }, "request failed");
    res.status(mapped.status).json({ error: {
      code: mapped.code, message: mapped.message, correlationId: res.locals.correlationId,
    } });
  };
}

export const errorHandler = createErrorHandler();
const app = createApp();

export default app;
