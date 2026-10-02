// Native API adapter: bearer sessions live in SecureStore and workspace headers
// come from WorkspaceProvider. The matching contract lives in lib/api-spec/openapi.yaml.
import { reportUnauthorized } from './authEvents';
import { ApiError, ConflictError, NetworkError, ValidationError } from './api';
import { peekToken } from './sessionStore';

export type WorkspaceKind = 'HOME' | 'BUSINESS';
export type Role = 'ORGANIZER' | 'PARTNER' | 'OWNER' | 'ADMIN' | 'LEAD' | 'WORKER';

export interface MyWorkspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  role: Role;
  financial_access: boolean | null;
}
export interface MeResponse {
  user: { id: string; display_name: string | null; has_apple: boolean; email: string | null };
  workspaces: MyWorkspace[];
}
export interface WorkspaceDetail {
  id: string;
  name: string;
  kind: WorkspaceKind;
  currency: string;
  default_timezone: string | null;
  role: Role;
  financial_access: boolean | null;
  worker_id: string | null;
  can: Record<string, boolean>;
}
export interface Member {
  user_id: string;
  display_name: string | null;
  name: string | null;
  role: Role;
  financial_access: boolean | null;
  joined_at: string;
  email?: string | null;
}
export interface Invitation {
  id: string;
  invitee_name: string | null;
  email: string;
  role: Role;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' | 'DECLINED' | string;
  expires_at: string;
}
export interface CreatedInvitation {
  id: string;
  token: string | null;
  code: string | null;
  link: string | null;
  already_created?: boolean;
  email?: string;
  expires_at?: string;
}
export interface AcceptResult { workspace_id: string; role: Role; already_member?: boolean }
export interface PeekResult { available: boolean; workspace_name?: string; role?: Role }

// ---- the current workspace: one place, set by WorkspaceProvider ----
let activeWorkspaceId: string | null = null;
export function setActiveWorkspaceId(id: string | null): void { activeWorkspaceId = id; }
export function getActiveWorkspaceId(): string | null { return activeWorkspaceId; }

type GoneListener = (workspaceId: string) => void;
let goneListener: GoneListener | null = null;
/** WorkspaceProvider hears about a 404 on any workspace route: access was removed. */
export function setWorkspaceGoneListener(l: GoneListener | null): void { goneListener = l; }

function baseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!domain) {
    throw new ApiError({ kind: 'configuration', code: 'API_DOMAIN_MISSING', message: 'The API domain is not configured for this app.' });
  }
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/api/v1`;
}

interface Options {
  body?: unknown;
  /** Adds X-Workspace-Id from the current workspace. */
  workspace?: boolean;
  /** Public route: no bearer token. */
  anonymous?: boolean;
}

async function toError(response: Response): Promise<ApiError> {
  let body: { error?: unknown } = {};
  try { body = (await response.json()) as typeof body; } catch { /* no JSON body */ }
  const e = body.error;
  const code = typeof e === 'string' ? e
    : (e as { code?: string } | undefined)?.code ?? `HTTP_${response.status}`;
  const message = (e as { message?: string } | undefined)?.message ?? `The server returned an error (${response.status}).`;
  if (response.status === 409) return new ConflictError(code, message);
  if (response.status === 422) return new ValidationError(code, message);
  return new ApiError({ kind: 'http', status: response.status, code, message });
}

export async function request<T>(method: string, path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = options.anonymous ? null : peekToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.workspace) {
    if (!activeWorkspaceId) {
      throw new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'No workspace is open.' });
    }
    headers['X-Workspace-Id'] = activeWorkspaceId;
  }
  const sentFor = options.workspace ? activeWorkspaceId : null;
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new NetworkError();
  }
  if (!response.ok) {
    if (response.status === 401 && token) reportUnauthorized({ token });
    if (response.status === 404 && sentFor && path !== '/workspace') goneListener?.(sentFor);
    throw await toError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---- reads ----
export const getConfig = () => request<{ business_enabled: boolean }>('GET', '/config', { anonymous: true });
export const getMe = () => request<MeResponse>('GET', '/me');
export const getWorkspace = () => request<WorkspaceDetail>('GET', '/workspace', { workspace: true });
export const getMembers = () => request<{ members: Member[] }>('GET', '/members', { workspace: true });
export const getInvitations = () => request<{ invitations: Invitation[] }>('GET', '/invitations', { workspace: true });

// ---- writes: every one carries an operation_id made on the phone and kept through retries ----
export const patchMe = (displayName: string, operationId: string) =>
  request<unknown>('PATCH', '/me', { body: { display_name: displayName, operation_id: operationId } });
export const createWorkspace = (
  input: { kind: WorkspaceKind; name: string; timezone: string },
  operationId: string,
) => request<{ id: string; name: string; kind: WorkspaceKind }>('POST', '/workspaces', { body: { ...input, operation_id: operationId } });
export const createInvitation = (
  input: { role: Role; email: string; name?: string },
  operationId: string,
) => request<CreatedInvitation>('POST', '/invitations', { workspace: true, body: { ...input, operation_id: operationId } });
// DELETE bodies carry the operation_id too, so a retry is recognised.
export const revokeInvitation = (id: string, operationId: string) =>
  request<unknown>('DELETE', `/invitations/${encodeURIComponent(id)}`, { workspace: true, body: { operation_id: operationId } });
export const removeMember = (userId: string, operationId: string) =>
  request<unknown>('DELETE', `/members/${encodeURIComponent(userId)}`, { workspace: true, body: { operation_id: operationId } });
export const peekInvite = (token: string) =>
  request<PeekResult>('POST', '/invite/peek', { anonymous: true, body: { token } });
export const acceptInvite = (token: string, operationId: string) =>
  request<AcceptResult>('POST', '/invite/accept', { body: { token, operation_id: operationId } });
export const acceptInviteCode = (email: string, code: string, operationId: string) =>
  request<AcceptResult>('POST', '/invite/accept-code', { body: { email, code, operation_id: operationId } });
