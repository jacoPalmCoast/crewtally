import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (!config.name || !config.slug) {
    throw new Error('Expo app configuration is missing name or slug');
  }
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    extra: {
      ...config.extra,
      // Explicitly expose only this non-secret environment label to the client.
      appEnv: process.env.APP_ENV ?? 'unknown',
    },
  };
}