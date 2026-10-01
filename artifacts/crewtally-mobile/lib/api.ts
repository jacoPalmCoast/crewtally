import Constants from 'expo-constants';
import { healthCheck } from '@workspace/api-client-react';
import { reportUnauthorized } from './authEvents';
import { peekToken } from './sessionStore';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlationId?: string;
  };
}

export interface HealthResponse {
  status: 'ok';
  db?: 'ok' | string;
  migrations?: number;
}

export interface ApiResponse<T> {
  data: T;
  correlationId?: string;
}

export type ApiErrorKind = 'conflict' | 'validation' | 'http' | 'network' | 'configuration';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly status?: number;
  readonly correlationId?: string;

  constructor(options: {
    kind: ApiErrorKind;
    code: string;
    message: string;
    status?: number;
    correlationId?: string;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.kind = options.kind;
    this.code = options.code;
    this.status = options.status;
    this.correlationId = options.correlationId;
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string, correlationId?: string) {
    super({ kind: 'conflict', status: 409, code, message, correlationId });
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ApiError {
  constructor(code: string, message: string, correlationId?: string) {
    super({ kind: 'validation', status: 422, code, message, correlationId });
    this.name = 'ValidationError';
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Could not connect to CrewTally. Check your connection and try again.') {
    super({ kind: 'network', code: 'NETWORK_ERROR', message });
    this.name = 'NetworkError';
  }
}

function getApiBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!domain) {
    throw new ApiError({
      kind: 'configuration',
      code: 'API_DOMAIN_MISSING',
      message: 'The API domain is not configured for this app.',
    });
  }
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/api/v1`;
}

async function responseError(response: Response, headerCorrelationId?: string): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    // Use the explicit HTTP status if the server did not return JSON.
  }

  const payload = body.error;
  const code = payload?.code ?? `HTTP_${response.status}`;
  const message = payload?.message ?? `The server returned an error (${response.status}).`;
  const correlationId = payload?.correlationId ?? headerCorrelationId;

  if (response.status === 409) return new ConflictError(code, message, correlationId);
  if (response.status === 422) return new ValidationError(code, message, correlationId);
  return new ApiError({
    kind: 'http',
    status: response.status,
    code,
    message,
    correlationId,
  });
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const baseUrl = getApiBaseUrl();
  let response: Response;
  const token = peekToken();
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new NetworkError();
  }

  const correlationId = response.headers.get('X-Correlation-Id') ?? undefined;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/apple')) reportUnauthorized({ token });
    throw await responseError(response, correlationId);
  }
  return {
    data: (await response.json()) as T,
    correlationId,
  };
}

/** Maps a generated-client error onto this app's error types. */
export function toApiError(caught: unknown): ApiError {
  if (caught instanceof ApiError) return caught;
  const e = caught as { name?: string; status?: unknown; data?: unknown; headers?: Headers } | null;
  if (e && e.name === 'ApiError' && typeof e.status === 'number') {
    const payload = (e.data as Partial<ApiErrorBody> | null)?.error;
    const correlationId = payload?.correlationId ?? e.headers?.get?.('X-Correlation-Id') ?? undefined;
    const code = payload?.code ?? `HTTP_${e.status}`;
    const message = payload?.message ?? `The server returned an error (${e.status}).`;
    if (e.status === 409) return new ConflictError(code, message, correlationId);
    if (e.status === 422) return new ValidationError(code, message, correlationId);
    return new ApiError({ kind: 'http', status: e.status, code, message, correlationId });
  }
  return new NetworkError();
}

export async function getHealth(): Promise<ApiResponse<HealthResponse>> {
  try {
    return { data: await healthCheck() };
  } catch (caught) {
    throw toApiError(caught);
  }
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? 'Unknown';
}