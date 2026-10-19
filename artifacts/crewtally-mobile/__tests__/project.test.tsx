import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project } from '@workspace/api-zod';
import type { JsonDto } from '@/lib/api';

const saved: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {
    getItem: jest.fn(async (key: string) => saved[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { saved[key] = value; }),
  },
}));
jest.mock('@workspace/api-client-react', () => ({
  listProjects: jest.fn(),
}));
const mockAuth = { userId: 'u1' };
const mockWorkspace = { phase: 'ready', workspaceId: 'w1', workspace: { kind: 'HOME', role: 'ORGANIZER', financial_access: true } };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => mockWorkspace }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listProjects } from '@workspace/api-client-react';
import { ProjectProvider, useProject } from '@/contexts/ProjectContext';
const A: JsonDto<Project> = { id: 'p1', name: 'Garden', timezone: 'UTC', work_days: [1], address: null, status: 'ACTIVE', version: 0 };
const B: JsonDto<Project> = { ...A, id: 'p2', name: 'Kitchen' };
let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={qc}><ProjectProvider>{children}</ProjectProvider></QueryClientProvider>;
const list = listProjects as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(saved).forEach(k => delete saved[k]);
  mockAuth.userId = 'u1'; mockWorkspace.workspaceId = 'w1'; mockWorkspace.phase = 'ready';
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  list.mockResolvedValue([A, B]);
});
afterEach(() => { cleanup(); qc.clear(); });

it('selects the first project, then saves and restores the user/workspace-specific choice', async () => {
  const first = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(first.result.current.projectId).toBe(A.id));
  await act(() => first.result.current.selectProject(B.id));
  expect(saved['crewtally.project.v1.u1.w1']).toBe(B.id);
  first.unmount();
  const second = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(second.result.current.projectId).toBe(B.id));
});

it('never shares a saved selection across users or workspaces', async () => {
  saved['crewtally.project.v1.u1.w1'] = B.id;
  const h = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(h.result.current.projectId).toBe(B.id));
  mockAuth.userId = 'u2';
  h.rerender({});
  await waitFor(() => expect(h.result.current.projectId).toBe(A.id));
  expect(saved['crewtally.project.v1.u1.w1']).toBe(B.id);
  expect(saved['crewtally.project.v1.u2.w1']).toBe(A.id);
  mockWorkspace.workspaceId = 'w2';
  h.rerender({});
  await waitFor(() => expect(saved['crewtally.project.v1.u2.w2']).toBe(A.id));
});

it('falls back safely when a saved project no longer exists', async () => {
  saved['crewtally.project.v1.u1.w1'] = 'removed-project';
  const h = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(h.result.current.projectId).toBe(A.id));
  await waitFor(() => expect(saved['crewtally.project.v1.u1.w1']).toBe(A.id));
});

it('ignores a slow restore after changing to another workspace', async () => {
  let resolveOld!: (value: string) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  saved['crewtally.project.v1.u1.w2'] = A.id;
  const h = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(list).toHaveBeenCalled());
  mockWorkspace.workspaceId = 'w2';
  h.rerender({});
  await waitFor(() => expect(h.result.current.projectId).toBe(A.id));
  await act(async () => { resolveOld(B.id); });
  expect(h.result.current.projectId).toBe(A.id);
});

it('exposes storage failure instead of pretending the selection persisted', async () => {
  const h = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(h.result.current.projectId).toBe(A.id));
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage full'));
  await act(() => h.result.current.selectProject(B.id));
  expect(h.result.current.projectId).toBe(B.id);
  expect(h.result.current.storageError).toMatch(/could not be saved/);
});

it('exposes a retryable project-list failure', async () => {
  list.mockRejectedValueOnce(new Error('offline'));
  const h = renderHook(() => useProject(), { wrapper });
  await waitFor(() => expect(h.result.current.error).toBeTruthy());
  expect(h.result.current.projectId).toBeNull();
  act(() => h.result.current.retry());
  await waitFor(() => expect(h.result.current.projectId).toBe(A.id));
});
