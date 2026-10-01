export interface ApiStartupSteps {
  loadAuthConfig: () => { appEnv: "development" | "production" };
  migrate: () => Promise<unknown>;
  listen: () => Promise<void>;
}

export function warnIfProductionDevSigninCodeIsSet(
  env: NodeJS.ProcessEnv,
  log: { warn: (fields: Record<string, unknown>, message?: string) => void },
): void {
  if (env.APP_ENV === "production" && env.DEV_SIGNIN_CODE !== undefined) {
    log.warn(
      { configuration: "DEV_SIGNIN_CODE" },
      "DEV_SIGNIN_CODE is set in production and will be ignored",
    );
  }
}

export async function runApiStartup(steps: ApiStartupSteps): Promise<void> {
  const config = steps.loadAuthConfig();
  if (config.appEnv !== "production") await steps.migrate();
  await steps.listen();
}