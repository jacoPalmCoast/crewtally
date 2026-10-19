const mockToken = { value: 'TOK' as string | null };
jest.mock('@/lib/sessionStore', () => ({ peekToken: () => mockToken.value }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

import * as Api from '@workspace/api-client-react';
import {
  configureApiClient, setActiveWorkspaceId, setWorkspaceGoneListener, setUnauthorizedListener,
} from '@/lib/authEvents';
import { createOperationKeeper } from '@/lib/operation';
import { roleLabel, tokenFromLink } from '@/lib/roles';

const WS = '11111111-2222-4333-8444-555555555555';
const fetchMock = jest.fn();
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const headersAt = (index = 0): Headers => fetchMock.mock.calls[index][1].headers;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_DOMAIN = 'dev.example.test';
  mockToken.value = 'TOK';
  setActiveWorkspaceId(null);
  setWorkspaceGoneListener(null);
  configureApiClient();
  globalThis.fetch = fetchMock;
});
afterEach(() => { Api.setRequestPolicy(null); Api.setUnauthorizedHandler(null); });

describe('configured generated client', () => {
  it('uses the configured host once and adds workspace context only to workspace routes', async () => {
    setActiveWorkspaceId(WS);
    fetchMock.mockImplementation(async () => ok({}));
    await Api.getWorkspace();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/dev\.example\.test\//);
    expect(fetchMock.mock.calls[0][0].endsWith(Api.getGetWorkspaceUrl())).toBe(true);
    expect(headersAt().get('X-Workspace-Id')).toBe(WS);
    expect(headersAt().get('Authorization')).toBe('Bearer TOK');
    for (const call of [
      () => Api.getMe(), () => Api.getConfig(),
      () => Api.updateAccountName({ display_name: 'Casey', operation_id: 'op' }),
      () => Api.createWorkspace({ kind: 'HOME', name: 'n', timezone: 'UTC', operation_id: 'op' }),
      () => Api.peekInvitation({ token: 't' }),
      () => Api.acceptInvitation({ token: 't', operation_id: 'op' }),
      () => Api.acceptInvitationCode({ email: 'a@b.co', code: '123456', operation_id: 'op' }),
      () => Api.signInWithApple({ identityToken: 't', authorizationCode: 'a', rawNonce: 'n'.repeat(43) }),
    ]) {
      await call();
      expect(headersAt(fetchMock.mock.calls.length - 1).has('X-Workspace-Id')).toBe(false);
    }
    for (const call of [
      () => Api.listMembers(), () => Api.listInvitations(),
      () => Api.createInvitation({ role: 'PARTNER', email: 'a@b.co', operation_id: 'op' }),
      () => Api.removeMember('u', { operation_id: 'op' }),
      () => Api.revokeInvitation('i', { operation_id: 'op' }),
    ]) {
      await call();
      expect(headersAt(fetchMock.mock.calls.length - 1).get('X-Workspace-Id')).toBe(WS);
    }
  });

  it('does not fetch workspace routes without an open workspace', async () => {
    await expect(Api.listMembers()).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('scopes every S3 domain operation through the same generated fetch path', async () => {
    setActiveWorkspaceId(WS);
    fetchMock.mockImplementation(async () => ok({}));
    const writes = [
      () => Api.createProject({ name: 'Garden', timezone: 'UTC', operation_id: 'op' }),
      () => Api.createWorker({ display_name: 'Alex', operation_id: 'op' }),
      () => Api.updateWorker('w', { display_name: 'Alex', operation_id: 'op' }),
      () => Api.createAssignment('p', { worker_id: 'w', start_date: '2026-01-01', operation_id: 'op' }),
      () => Api.applyRateChange('a', { effective_from: '2026-01-01', pay_basis: 'DAY', rate_minor: 10000, operation_id: 'op' }),
      () => Api.recordWork({ assignment_id: 'a', date: '2026-01-01', mode: 'DAY_PORTION', portion: '1', expected_version: 0, operation_id: 'op' }),
      () => Api.markRestNoWork({ project_id: 'p', date: '2026-01-01', operation_id: 'op' }),
      () => Api.recordPayment({ date: '2026-01-01', method: 'CASH', amount_minor: 1000, recipient: 'Crew',
        allocations: [{ assignment_id: 'a', amount_minor: 1000 }], operation_id: 'op' }),
      () => Api.clearPayment('pay', { expected_version: 0, operation_id: 'op' }),
      () => Api.reversePayment('pay', { kind: 'FULL', reason: 'Duplicate', expected_version: 0,
        effective_date: '2026-01-01', operation_id: 'op' }),
    ];
    for (const write of writes) {
      await write();
      const index = fetchMock.mock.calls.length - 1;
      expect(headersAt(index).get('X-Workspace-Id')).toBe(WS);
      expect(JSON.parse(fetchMock.mock.calls[index][1].body).operation_id).toBe('op');
    }
    for (const read of [
      () => Api.listProjects(), () => Api.listWorkers(), () => Api.listAssignments('p'),
      () => Api.listRates('a'), () => Api.listBalances(), () => Api.listPayments(),
      () => Api.listWorkEntries({ assignment_id: 'a', from: '2026-01-01', to: '2026-01-01' }),
    ]) {
      await read();
      expect(headersAt(fetchMock.mock.calls.length - 1).get('X-Workspace-Id')).toBe(WS);
    }
    setActiveWorkspaceId(null);
    const count = fetchMock.mock.calls.length;
    for (const read of [() => Api.listProjects(), () => Api.listWorkers(), () => Api.listBalances()]) {
      await expect(read()).rejects.toMatchObject({ status: 404 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });

  it('uses only the active workspace and strips caller-supplied headers from unscoped routes', async () => {
    setActiveWorkspaceId(WS);
    fetchMock.mockImplementation(async () => ok({}));
    await Api.listMembers({ headers: { 'X-Workspace-Id': 'forged' } });
    expect(headersAt().get('X-Workspace-Id')).toBe(WS);
    await Api.getMe({ headers: { 'X-Workspace-Id': 'forged' } });
    expect(headersAt(1).has('X-Workspace-Id')).toBe(false);
  });

  it('keeps operation_id through a network failure and changes it when the request changes', async () => {
    setActiveWorkspaceId(WS);
    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('op-2'));
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockImplementation(async () => ok({}));
    const input = { role: 'PARTNER' as const, email: 'a@b.co' };
    await expect(Api.createInvitation({ ...input, operation_id: keeper.idFor(input.email) }))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await Api.createInvitation({ ...input, operation_id: keeper.idFor(input.email) });
    expect(fetchMock.mock.calls.map(c => JSON.parse(c[1].body).operation_id)).toEqual(['op-1', 'op-1']);
    expect(keeper.idFor('changed@example.com')).toBe('op-2');
  });

  it('starts a fresh operation after a successful logical write', () => {
    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('a').mockReturnValueOnce('b'));
    expect(keeper.idFor('same')).toBe('a');
    keeper.done();
    expect(keeper.idFor('same')).toBe('b');
  });

  it.each([
    ['updateAccountName', () => Api.updateAccountName({ display_name: 'Casey', operation_id: 'op' })],
    ['createWorkspace', () => Api.createWorkspace({ kind: 'HOME', name: 'n', timezone: 'UTC', operation_id: 'op' })],
    ['createInvitation', () => Api.createInvitation({ role: 'PARTNER', email: 'a@b.co', operation_id: 'op' })],
    ['acceptInvitation', () => Api.acceptInvitation({ token: 't', operation_id: 'op' })],
    ['acceptInvitationCode', () => Api.acceptInvitationCode({ email: 'a@b.co', code: '123456', operation_id: 'op' })],
    ['removeMember', () => Api.removeMember('u', { operation_id: 'op' })],
    ['revokeInvitation', () => Api.revokeInvitation('i', { operation_id: 'op' })],
  ])('%s sends operation_id through customFetch', async (_name, call) => {
    setActiveWorkspaceId(WS);
    fetchMock.mockResolvedValue(ok({}));
    await call();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation_id).toBe('op');
  });

  it('reports the failed token on 401, not a newer token installed while the request was in flight', async () => {
    let reply!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { reply = resolve; }));
    const listener = jest.fn();
    const off = setUnauthorizedListener(listener);
    try {
      const pending = Api.getMe();
      await Promise.resolve();
      expect(headersAt().get('Authorization')).toBe('Bearer TOK');
      mockToken.value = 'NEW';
      reply(ok({ error: 'SESSION_EXPIRED' }, 401));
      await expect(pending).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
      expect(listener).toHaveBeenCalledWith({ token: 'TOK' });
    } finally { off(); }
  });

  it('preserves server error codes, conflict/validation types and correlation ids', async () => {
    for (const [status, kind] of [[409, 'conflict'], [422, 'validation']] as const) {
      fetchMock.mockResolvedValue(ok({ error: { code: 'CODE', message: 'Safe message', correlationId: 'trace' } }, status));
      await expect(Api.getMe()).rejects.toMatchObject({ status, kind, code: 'CODE', correlationId: 'trace' });
    }
    fetchMock.mockResolvedValue(ok({ error: 'INVITATION_CODE_WRONG' }, 400));
    await expect(Api.acceptInvitationCode({ email: 'a@b.co', code: '1', operation_id: 'op' }))
      .rejects.toMatchObject({ status: 400, code: 'INVITATION_CODE_WRONG' });
  });

  it('keeps config and invitation peek public', async () => {
    fetchMock.mockImplementation(async () => ok({ available: false }));
    await Api.peekInvitation({ token: 't' });
    await Api.getConfig();
    expect(headersAt().has('Authorization')).toBe(false);
    expect(headersAt(1).has('Authorization')).toBe(false);
  });

  it('does not expire a session when an anonymous operation fails with 401', async () => {
    const listener = jest.fn();
    const off = setUnauthorizedListener(listener);
    try {
      fetchMock.mockResolvedValue(ok({ error: 'UNAUTHORIZED' }, 401));
      await expect(Api.peekInvitation({ token: 't' })).rejects.toMatchObject({ status: 401 });
      expect(listener).not.toHaveBeenCalled();
    } finally { off(); }
  });

  it('emits workspace-gone for the workspace the failed generated request carried', async () => {
    setActiveWorkspaceId(WS);
    const gone = jest.fn();
    setWorkspaceGoneListener(gone);
    let reply!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { reply = resolve; }));
    const pending = Api.listMembers();
    await Promise.resolve();
    setActiveWorkspaceId('new-workspace');
    reply(ok({ error: 'NOT_FOUND' }, 404));
    await expect(pending).rejects.toMatchObject({ status: 404 });
    expect(gone).toHaveBeenCalledWith(WS);
  });

  it('does not emit workspace-gone for an invitation acceptance failure', async () => {
    setActiveWorkspaceId(WS);
    const gone = jest.fn();
    setWorkspaceGoneListener(gone);
    fetchMock.mockResolvedValue(ok({ error: 'NOT_FOUND' }, 404));
    await expect(Api.acceptInvitation({ token: 't', operation_id: 'op' })).rejects.toMatchObject({ status: 404 });
    expect(gone).not.toHaveBeenCalled();
  });

  it('fails explicitly with no domain configured', async () => {
    delete process.env.EXPO_PUBLIC_DOMAIN;
    configureApiClient();
    await expect(Api.getMe()).rejects.toMatchObject({ code: 'API_DOMAIN_MISSING' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('invitation helpers', () => {
  it('extracts the token from a join link', () => {
    const t = 'A'.repeat(43);
    expect(tokenFromLink(`https://dev.example.test/api/join/${t}`)).toBe(t);
    expect(tokenFromLink(t)).toBe(t);
    expect(tokenFromLink('nonsense')).toBeNull();
  });
  it('labels roles', () => { expect(roleLabel('PARTNER')).toBe('Partner'); });
});
