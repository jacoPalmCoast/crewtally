import Constants from 'expo-constants';
import { healthCheck } from '@workspace/api-client-react';
import type { ErrorResponse as ApiErrorBody, HealthStatus as HealthResponse } from '@workspace/api-zod';
export type { HealthStatus as HealthResponse } from '@workspace/api-zod';

// api-zod's date-time types are Date; JSON responses from the generated fetch
// client are strings. Derive their wire shape without duplicating any DTO.
export type JsonDto<T> = T extends Date ? string : T extends object
  ? { [K in keyof T]: JsonDto<T[K]> } : T;

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

/** Maps a generated-client error onto this app's error types. */
export function toApiError(caught: unknown): ApiError {
  if (caught instanceof ApiError) return caught;
  const e = caught as { name?: string; status?: unknown; data?: unknown; headers?: Headers } | null;
  if (e && e.name === 'ApiError' && typeof e.status === 'number') {
    const payload = (e.data as Partial<ApiErrorBody> | null)?.error;
    const detail = typeof payload === 'object' ? payload : undefined;
    const correlationId = detail?.correlationId ?? e.headers?.get?.('X-Correlation-Id') ?? undefined;
    const code = typeof payload === 'string' ? payload : detail?.code ?? `HTTP_${e.status}`;
    const message = detail?.message ?? `The server returned an error (${e.status}).`;
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