import app from "./app";
import { logger } from "./lib/logger";
import { migrate, safeMigrationError } from "./db/migrate";
import { AuthConfigError, getDefaultAuthConfig } from "./auth/config";
import { runApiStartup } from "./server/startup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await runApiStartup({
    loadAuthConfig: getDefaultAuthConfig,
    migrate: async () => {
      const applied = await migrate();
      logger.info({ applied }, "Migrations ready");
    },
    listen: () => new Promise<void>((resolve, reject) => {
      const server = app.listen(port, () => {
        logger.info({ port }, "Server listening");
        resolve();
      });
      server.once("error", reject);
    }),
  });
}
start().catch((error: unknown) => {
  if (error instanceof AuthConfigError) {
    logger.error({ code: "AUTH_CONFIG_INVALID", message: error.message }, "startup configuration failed");
    process.exitCode = 1;
    return;
  }
  logger.error(safeMigrationError(error), "startup migration failed");
  process.exitCode = 1;
});
