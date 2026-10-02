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
      // Only this non-secret label is exposed, never the rest of process.env.
      appEnv: process.env.APP_ENV ?? 'unknown',
    },
  };
}