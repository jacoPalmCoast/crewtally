export interface ApiStartupSteps {
  loadAuthConfig: () => { appEnv: "development" | "production" };
  migrate: () => Promise<unknown>;
  listen: () => Promise<void>;
}

export async function runApiStartup(steps: ApiStartupSteps): Promise<void> {
  const config = steps.loadAuthConfig();
  if (config.appEnv !== "production") await steps.migrate();
  await steps.listen();
}