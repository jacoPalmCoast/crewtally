import {
  setAuthTokenGetter,
  setBaseUrl,
  setUnauthorizedHandler,
} from '@workspace/api-client-react';
import { peekToken } from './sessionStore';

export interface UnauthorizedReport {
  /** Token the failed request carried, or null. Never log it. */
  token: string | null;
}

let listener: ((report: UnauthorizedReport) => void) | null = null;

/** Scoped subscription: the returned function only removes this exact listener. */
export function setUnauthorizedListener(fn: (report: UnauthorizedReport) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function reportUnauthorized(report: UnauthorizedReport): void {
  listener?.(report);
}

export function configureApiClient(): void {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) setBaseUrl(`https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`);
  setAuthTokenGetter(peekToken);
  setUnauthorizedHandler((event) => reportUnauthorized({ token: event.token }));
}
