const mockToken = { value: 'TOK' as string | null };
jest.mock('@/lib/sessionStore', () => ({ peekToken: () => mockToken.value }));
jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

import { reportUnauthorized } from '@/lib/authEvents';
import * as Api from '@/lib/mobileApi';
import { createOperationKeeper } from '@/lib/operation';
import { roleLabel, tokenFromLink } from '@/lib/roles';

jest.mock('@/lib/authEvents', () => ({ reportUnauthorized: jest.fn() }));

const WS = '11111111-2222-4333-8444-555555555555';
const fetchMock = jest.fn();
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_DOMAIN = 'dev.example.test';
  mockToken.value = 'TOK';
  Api.setActiveWorkspaceId(null);
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('API client', () => {
  it('sends X-Workspace-Id on workspace routes only', async () => {
    fetchMock.mockResolvedValue(ok({ id: WS }));
    Api.setActiveWorkspaceId(WS);
    await Api.getWorkspace();
    await Api.getMe();
    const [first, second] = fetchMock.mock.calls;
    expect(first[0]).toBe('https://dev.example.test/api/v1/workspace');
    expect(first[1].headers['X-Workspace-Id']).toBe(WS);
    expect(first[1].headers.Authorization).toBe('Bearer TOK');
    expect(second[1].headers['X-Workspace-Id']).toBeUndefined();
  });

  it('does not call a workspace route when no workspace is open', async () => {
    await expect(Api.getMembers()).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts the operation_id in every write body, and a retry sends the same one', async () => {
    Api.setActiveWorkspaceId(WS);
    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('op-2'));
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok({ id: 'i1' }));
    const input = { role: 'PARTNER' as const, email: 'a@b.co' };
    await expect(Api.createInvitation(input, keeper.idFor('a@b.co'))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await Api.createInvitation(input, keeper.idFor('a@b.co')); // retry
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0].operation_id).toBe('op-1');
    expect(bodies[1].operation_id).toBe('op-1');
    keeper.done();
    expect(keeper.idFor('a@b.co')).toBe('op-2');
  });

  it('a changed request gets a new operation_id', () => {
    const keeper = createOperationKeeper(jest.fn().mockReturnValueOnce('a').mockReturnValueOnce('b'));
    expect(keeper.idFor('x')).toBe('a');
    expect(keeper.idFor('y')).toBe('b');
  });

  it.each([
    ['patchMe', () => Api.patchMe('Casey', 'op')],
    ['createWorkspace', () => Api.createWorkspace({ kind: 'HOME', name: 'n', timezone: 'UTC' }, 'op')],
    ['acceptInvite', () => Api.acceptInvite('t', 'op')],
    ['acceptInviteCode', () => Api.acceptInviteCode('a@b.co', '123456', 'op')],
    ['removeMember', () => Api.removeMember('u', 'op')],
    ['revokeInvitation', () => Api.revokeInvitation('i', 'op')],
  ])('%s carries operation_id', async (_n, call) => {
    Api.setActiveWorkspaceId(WS);
    fetchMock.mockResolvedValue(ok({}));
    await call();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation_id).toBe('op');
  });

  it('reads string error bodies and reports 401 with the token that failed', async () => {
    fetchMock.mockResolvedValue(ok({ error: 'SESSION_EXPIRED' }, 401));
    await expect(Api.getMe()).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(reportUnauthorized).toHaveBeenCalledWith({ token: 'TOK' });
    fetchMock.mockResolvedValue(ok({ error: 'INVITATION_CODE_WRONG' }, 400));
    await expect(Api.acceptInviteCode('a@b.co', '1', 'op')).rejects.toMatchObject({ status: 400, code: 'INVITATION_CODE_WRONG' });
  });

  it('peek is public: no bearer token', async () => {
    fetchMock.mockResolvedValue(ok({ available: false }));
    await Api.peekInvite('t');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
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
