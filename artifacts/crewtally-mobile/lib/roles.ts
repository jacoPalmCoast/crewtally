import type { Role, WorkspaceKind } from './mobileApi';

const ROLE_LABEL: Record<Role, string> = {
  ORGANIZER: 'Organizer', PARTNER: 'Partner', OWNER: 'Owner', ADMIN: 'Admin', LEAD: 'Crew lead', WORKER: 'Worker',
};
export const roleLabel = (r: Role | string): string => ROLE_LABEL[r as Role] ?? r;
export const kindLabel = (k: WorkspaceKind): string => (k === 'HOME' ? 'Home' : 'Business');
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
/** Pulls the token out of https://…/join/<token> (or a bare token). */
export function tokenFromLink(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const m = /\/join\/([A-Za-z0-9_-]{20,})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{32,}$/.test(t) ? t : null;
}
