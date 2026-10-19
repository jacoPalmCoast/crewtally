import {
  setAuthTokenGetter,
  setBaseUrl,
  setUnauthorizedHandler,
  setRequestPolicy,
  getGetWorkspaceUrl, getListMembersUrl, getListInvitationsUrl,
  getGetConfigUrl, getPeekInvitationUrl,
  getListProjectsUrl, getListWorkersUrl, getRecordWorkUrl, getListPaymentsUrl,
  getListBalancesUrl, getRemoveAssignmentUrl,
} from '@workspace/api-client-react';
import { peekToken } from './sessionStore';
import { ApiError, toApiError } from './api';

export interface UnauthorizedReport {
  /** Token the failed request carried, or null. Never log it. */
  token: string | null;
}

let listener: ((report: UnauthorizedReport) => void) | null = null;
let activeWorkspaceId: string | null = null;
let goneListener: ((workspaceId: string) => void) | null = null;

export function setActiveWorkspaceId(id: string | null): void { activeWorkspaceId = id; }
export function getActiveWorkspaceId(): string | null { return activeWorkspaceId; }
export function setWorkspaceGoneListener(fn: ((workspaceId: string) => void) | null): void { goneListener = fn; }

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
  setBaseUrl(domain ? `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : null);
  setAuthTokenGetter(peekToken);
  setUnauthorizedHandler((event) => reportUnauthorized({ token: event.token }));
  setRequestPolicy(({ url, headers }) => {
    if (!domain) throw new ApiError({
      kind: 'configuration', code: 'API_DOMAIN_MISSING', message: 'The API domain is not configured for this app.',
    });
    const path = new URL(url).pathname;
    const workspacePath = getGetWorkspaceUrl();
    const scoped = [
      workspacePath, getListMembersUrl(), getListInvitationsUrl(),
      getListProjectsUrl(), getListWorkersUrl(), getRecordWorkUrl(), getListPaymentsUrl(),
      getListBalancesUrl(), getRemoveAssignmentUrl('').replace(/\/$/, ''),
    ]
      .some(root => path === root || path.startsWith(`${root}/`));
    // Never accept a caller-supplied workspace header on an unscoped operation.
    headers.delete('X-Workspace-Id');
    const sentFor = scoped ? activeWorkspaceId : null;
    if (scoped && !sentFor) throw new ApiError({
      kind: 'http', status: 404, code: 'NOT_FOUND', message: 'No workspace is open.',
    });
    if (sentFor) headers.set('X-Workspace-Id', sentFor);
    const anonymous = path === getGetConfigUrl() || path === getPeekInvitationUrl();
    if (anonymous) headers.delete('Authorization');
    return {
      skipAuth: anonymous,
      mapError: toApiError,
      onResponse(response) {
        // /workspace is handled directly by open/revalidate, avoiding recursive revalidation.
        if (response.status === 404 && sentFor && path !== workspacePath) goneListener?.(sentFor);
      },
    };
  });
}
