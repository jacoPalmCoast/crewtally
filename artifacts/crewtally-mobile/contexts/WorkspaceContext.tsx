import { AppState } from 'react-native';
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  createWorkspace, getWorkspace, setActiveWorkspaceId, setWorkspaceGoneListener,
  type Role, type WorkspaceDetail, type WorkspaceKind,
} from '@/lib/mobileApi';
import { dropSavedWorkspaceId, loadSavedWorkspaceId, saveWorkspaceId } from '@/lib/workspaceStore';

export type WorkspacePhase = 'loading' | 'switching' | 'ready' | 'removed' | 'switcher' | 'none' | 'error';

interface WorkspaceValue {
  phase: WorkspacePhase;
  workspaceId: string | null;
  workspace: WorkspaceDetail | null;
  kind: WorkspaceKind | null;
  role: Role | null;
  can: Record<string, boolean>;
  error: string | null;
  switchTo: (id: string) => Promise<void>;
  /** Create a Home workspace and open it. Returns the new id. */
  createHome: (name: string, timezone: string, operationId: string) => Promise<string>;
  /** After accepting an invitation: reload the list and open that workspace. */
  openJoined: (id: string) => Promise<void>;
  /** After leaving: forget the current workspace and show the switcher. */
  afterLeaving: () => Promise<void>;
  acknowledgeRemoved: () => void;
  retry: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status, userId, workspaces, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<WorkspacePhase>('loading');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = useRef(0); // bumps on every open/reset; stale answers are ignored
  const initializedFor = useRef<string | null>(null);
  const userRef = useRef<string | null>(null);
  userRef.current = userId;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const refreshRef = useRef(refreshMe);
  refreshRef.current = refreshMe;
  const currentRef = useRef<string | null>(null);

  const clearScreens = useCallback(async () => {
    await queryClientRef.current.cancelQueries();
    queryClientRef.current.clear();
  }, []);

  const forget = useCallback(() => {
    setActiveWorkspaceId(null);
    currentRef.current = null;
    setWorkspaceId(null);
    setWorkspace(null);
  }, []);

  const open = useCallback(async (id: string, opts?: { clear?: boolean }) => {
    const t = ++token.current;
    const owner = userRef.current;
    if (opts?.clear !== false) await clearScreens();
    if (t !== token.current) return;
    setActiveWorkspaceId(id);
    currentRef.current = id;
    setWorkspaceId(id);
    setWorkspace(null);
    setError(null);
    setPhase((p) => (p === 'ready' || p === 'switching' ? 'switching' : 'loading'));
    try {
      const detail = await getWorkspace();
      if (t !== token.current) return;
      setWorkspace(detail);
      if (owner) void saveWorkspaceId(owner, id);
      setPhase('ready');
    } catch (e) {
      if (t !== token.current) return;
      if (statusOf(e) === 404) {
        // No access any more. The same for removed and left; no names, nothing more to fetch.
        if (owner) await dropSavedWorkspaceId(owner);
        if (t !== token.current) return;
        forget();
        setPhase('removed');
        void refreshRef.current().catch(() => undefined);
        return;
      }
      setError('Could not open this workspace. Check your connection and try again.');
      setPhase('error');
    }
  }, [clearScreens, forget]);

  // Freshness: someone else may remove this person while the app stays open. Re-check quietly when the
  // app returns to the foreground, every minute, and whenever any workspace route answers 404.
  const phaseRef = useRef<WorkspacePhase>('loading');
  phaseRef.current = phase;
  const revalidating = useRef(false);
  const revalidate = useCallback(async () => {
    const id = currentRef.current;
    const owner = userRef.current;
    if (!id || !owner || phaseRef.current !== 'ready' || revalidating.current) return;
    revalidating.current = true;
    const t = token.current;
    try {
      const detail = await getWorkspace();
      if (t !== token.current || currentRef.current !== id) return;
      setWorkspace(detail);
    } catch (e) {
      if (t !== token.current || currentRef.current !== id) return;
      if (statusOf(e) === 404) {
        const removal = ++token.current;
        await dropSavedWorkspaceId(owner);
        if (token.current !== removal || currentRef.current !== id || userRef.current !== owner) return;
        forget();
        await clearScreens();
        if (token.current !== removal || userRef.current !== owner) return;
        setPhase('removed');
        void refreshRef.current().catch(() => undefined);
      }
    } finally {
      revalidating.current = false;
    }
  }, [forget, clearScreens]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void revalidate(); });
    const timer = setInterval(() => { void revalidate(); }, 60000);
    setWorkspaceGoneListener((id) => { if (id === currentRef.current) void revalidate(); });
    return () => { sub.remove(); clearInterval(timer); setWorkspaceGoneListener(null); };
  }, [status, revalidate]);

  // Reset when the signed-in person changes or signs out.
  useEffect(() => {
    if (status === 'signedIn' && userId) return;
    token.current += 1;
    initializedFor.current = null;
    forget();
    setError(null);
    setPhase('loading');
  }, [status, userId, forget]);

  // First load after sign-in: GET /v1/me, then the last used workspace, or the first.
  useEffect(() => {
    if (status !== 'signedIn' || !userId) return;
    if (workspaces === null) {
      refreshRef.current().catch(() => {
        if (userRef.current === userId) { setError('Could not reach CrewTally. Check your connection and try again.'); setPhase('error'); }
      });
      return;
    }
    if (initializedFor.current === userId) return;
    initializedFor.current = userId;
    const list = workspaces;
    void (async () => {
      const saved = await loadSavedWorkspaceId(userId);
      if (userRef.current !== userId) return;
      if (saved && list.some((w) => w.id === saved)) await open(saved);
      else if (saved) { // the saved workspace was removed while signed out
        await dropSavedWorkspaceId(userId);
        setPhase('removed');
      } else if (list.length > 0) await open(list[0].id);
      else setPhase('none');
    })();
  }, [status, userId, workspaces, open]);

  const switchTo = useCallback(async (id: string) => { await open(id); }, [open]);

  const openJoined = useCallback(async (id: string) => {
    await refreshRef.current().catch(() => null);
    await open(id);
  }, [open]);

  const createHome = useCallback(async (name: string, timezone: string, operationId: string) => {
    const created = await createWorkspace({ kind: 'HOME', name, timezone }, operationId);
    await refreshRef.current().catch(() => null);
    await open(created.id);
    return created.id;
  }, [open]);

  const afterLeaving = useCallback(async () => {
    token.current += 1;
    const owner = userRef.current;
    if (owner) await dropSavedWorkspaceId(owner);
    forget();
    await clearScreens();
    setPhase('switcher');
    await refreshRef.current().catch(() => null);
  }, [forget, clearScreens]);

  const acknowledgeRemoved = useCallback(() => setPhase('switcher'), []);

  const retry = useCallback(() => {
    setError(null);
    if (currentRef.current) { void open(currentRef.current, { clear: false }); return; }
    initializedFor.current = null;
    setPhase('loading');
    refreshRef.current().catch(() => { setError('Could not reach CrewTally. Check your connection and try again.'); setPhase('error'); });
  }, [open]);

  const value = useMemo<WorkspaceValue>(() => ({
    phase, workspaceId, workspace,
    kind: workspace?.kind ?? null,
    role: workspace?.role ?? null,
    can: workspace?.can ?? {},
    error, switchTo, createHome, openJoined, afterLeaving, acknowledgeRemoved, retry,
  }), [phase, workspaceId, workspace, error, switchTo, createHome, openJoined, afterLeaving, acknowledgeRemoved, retry]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}
