import React from 'react';
import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const saved: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => saved[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { saved[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete saved[k]; }),
  },
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'op') }));
jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn(async () => ({ status: 'ok' })) }));
const mockAuth = {
  status: 'signedIn', userId: 'u1', workspaces: null as unknown[] | null,
  refreshMe: jest.fn(), profile: null,
};
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/mobileApi', () => ({
  ...jest.requireActual('@/lib/mobileApi'),
  getWorkspace: jest.fn(),
}));

import * as Mobile from '@/lib/mobileApi';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import MoreScreen from '@/app/(tabs)/more';

const getWorkspace = Mobile.getWorkspace as unknown as jest.Mock;
const A = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Home A', kind: 'HOME', role: 'ORGANIZER', financial_access: true };
const B = { id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Home B', kind: 'HOME', role: 'PARTNER', financial_access: true };
const detail = (w: typeof A, can: Record<string, boolean>) => ({ ...w, currency: 'USD', default_timezone: 'UTC', worker_id: null, can });
const gone = Object.assign(new Error('x'), { name: 'ApiError', status: 404 });

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}><WorkspaceProvider>{children}</WorkspaceProvider></QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(saved)) delete saved[k];
  qc = new QueryClient();
  mockAuth.status = 'signedIn';
  mockAuth.workspaces = [A, B];
  mockAuth.refreshMe.mockResolvedValue(null);
  Mobile.setActiveWorkspaceId(null);
});

describe('WorkspaceProvider', () => {
  it('opens the first workspace and saves it for this user', async () => {
    getWorkspace.mockResolvedValue(detail(A, { 'workspace.read': true }));
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
    expect(h.result.current.workspaceId).toBe(A.id);
    expect(h.result.current.role).toBe('ORGANIZER');
    expect(h.result.current.kind).toBe('HOME');
    expect(Mobile.getActiveWorkspaceId()).toBe(A.id);
    expect(saved['crewtally.workspace.v1.u1']).toBe(A.id);
  });

  it('opens the last used workspace', async () => {
    saved['crewtally.workspace.v1.u1'] = B.id;
    getWorkspace.mockResolvedValue(detail(B, {}));
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
    expect(h.result.current.workspaceId).toBe(B.id);
  });

  it('a 404 for the current workspace clears the saved id and shows access removed', async () => {
    saved['crewtally.workspace.v1.u1'] = A.id;
    getWorkspace.mockRejectedValue(gone);
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
    expect(h.result.current.workspaceId).toBeNull();
    expect(Mobile.getActiveWorkspaceId()).toBeNull();
    act(() => h.result.current.acknowledgeRemoved());
    expect(h.result.current.phase).toBe('switcher');
  });

  it('a saved workspace that is no longer listed shows access removed on re-sign-in', async () => {
    saved['crewtally.workspace.v1.u1'] = 'cccccccc-0000-4000-8000-000000000003';
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
    expect(getWorkspace).not.toHaveBeenCalled();
    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
  });

  it('no workspaces: first run choice, and nothing is created', async () => {
    mockAuth.workspaces = [];
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('none'));
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it('switching clears in-memory queries and reloads', async () => {
    getWorkspace.mockResolvedValueOnce(detail(A, {})).mockResolvedValueOnce(detail(B, {}));
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
    qc.setQueryData(['ws', A.id, 'members'], { members: [] });
    await act(async () => { await h.result.current.switchTo(B.id); });
    expect(qc.getQueryData(['ws', A.id, 'members'])).toBeUndefined();
    expect(h.result.current.workspaceId).toBe(B.id);
    expect(h.result.current.role).toBe('PARTNER');
    expect(saved['crewtally.workspace.v1.u1']).toBe(B.id);
  });

  it('keeps each person\'s saved workspace separate', async () => {
    getWorkspace.mockResolvedValue(detail(A, {}));
    renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(saved['crewtally.workspace.v1.u1']).toBe(A.id));
    expect(saved['crewtally.workspace.v1.u2']).toBeUndefined();
  });
});

describe('freshness while signed in', () => {
  it('foregrounding the app discovers removal by someone else', async () => {
    const { AppState } = require('react-native');
    let handler: (s: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => { handler = h; return { remove: jest.fn() }; }) as never);
    getWorkspace.mockResolvedValueOnce(detail(A, {}));
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
    getWorkspace.mockRejectedValueOnce(gone);
    await act(async () => { handler('active'); });
    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
    expect(h.result.current.workspaceId).toBeNull();
    expect(saved['crewtally.workspace.v1.u1']).toBeUndefined();
  });

  it('any workspace route answering 404 triggers a re-check', async () => {
    getWorkspace.mockResolvedValueOnce(detail(A, {}));
    const h = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(h.result.current.phase).toBe('ready'));
    getWorkspace.mockRejectedValueOnce(gone);
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND' }) }));
    process.env.EXPO_PUBLIC_DOMAIN = 'x.test';
    await act(async () => { await Mobile.getMembers().catch(() => undefined); });
    await waitFor(() => expect(h.result.current.phase).toBe('removed'));
  });
});

describe('More screen follows can', () => {
  it('shows Partner for the organizer and Leave for no one who is an organizer', async () => {
    getWorkspace.mockResolvedValue(detail(A, { 'members.manage': true }));
    render(<MoreScreen />, { wrapper });
    await waitFor(() => screen.getByTestId('more-partner'));
    expect(screen.queryByTestId('more-leave')).toBeNull();
  });

  it('hides Partner for a partner and offers Leave', async () => {
    saved['crewtally.workspace.v1.u1'] = B.id;
    getWorkspace.mockResolvedValue(detail(B, { 'workspace.read': true, 'members.manage': false }));
    render(<MoreScreen />, { wrapper });
    await waitFor(() => screen.getByTestId('more-leave'));
    expect(screen.queryByTestId('more-partner')).toBeNull();
    fireEvent.press(screen.getByTestId('more-workspaces'));
    expect(mockPush).toHaveBeenCalledWith('/switcher');
  });
});
