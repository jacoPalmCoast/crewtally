import type { WorkspaceAccess } from '@workspace/api-zod';

/** Keep the S1 interim Business scope; role_can alone does not imply domain access. */
export function domainAvailable(workspace: WorkspaceAccess | null): boolean {
  return !!workspace && (workspace.kind === 'HOME' || (workspace.kind === 'BUSINESS' &&
    (workspace.role === 'OWNER' || (workspace.role === 'ADMIN' && workspace.financial_access === true))));
}

/** The input is already cents. No decimal conversion or floating-point money math. */
export function parseCents(text: string, max = 10000000): number | null {
  if (!/^[0-9]{1,8}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 && value <= max ? value : null;
}

export function validDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (kind: string) => parts.find(p => p.type === kind)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function domainError(error: unknown): string {
  const e = error as { status?: number; code?: string } | null;
  if (e?.status === 409) return 'The record changed or needs confirmation. Refresh, review it, and try again.';
  if (e?.status === 403) return 'You do not have permission to make this change.';
  if (e?.status === 404) return 'This record or workspace is no longer available. Refresh and try again.';
  if (e?.status === 422 || e?.status === 400) return 'Check the values and dates, then try again.';
  if (e?.code === 'SCOPE_CHANGED') return 'The workspace changed. Open this form again.';
  return 'Could not connect to CrewTally. Check your connection and try again.';
}
