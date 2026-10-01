import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const KEY = 'crewtally.session.v1';
const mockStore: Record<string, string> = {};
let mockDeleteGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => {
    if (mockDeleteGate) await mockDeleteGate;
    delete mockStore[k];
  }),
}));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true) }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(1)),
  digestStringAsync: jest.fn(async () => 'b'.repeat(64)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));
jest.mock('@workspace/api-client-react', () => ({
  getMe: jest.fn(), signInWithApple: jest.fn(), signOut: jest.fn(),
  setBaseUrl: jest.fn(), setAuthTokenGetter: jest.fn(), setUnauthorizedHandler: jest.fn(),
}));

import * as Apple from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Api from '@workspace/api-client-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { clearToken, loadToken, peekToken, saveToken } from '@/lib/sessionStore';
import { reportUnauthorized } from '@/lib/authEvents';

const api = Api as unknown as Record<'getMe' | 'signInWithApple', jest.Mock>;
const apple = Apple as unknown as { signInAsync: jest.Mock };
const OLD = 'O'.repeat(43);
const NEW = 'N'.repeat(43);
const WS = { id: 'abcdef12-0000-4000-8000-000000000000', name: 'My workspace', currency: 'USD', locale: 'en-US' };

function gate() {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  return { p, release };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockDeleteGate = null;
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  await clearToken();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sessionStore serialization', () => {
  it('a save queued behind a slow delete runs after it; final persisted and cached token is the new one', async () => {
    mockStore[KEY] = OLD;
    await loadToken();
    const g = gate();
    mockDeleteGate = g.p;
    const clearing = clearToken();
    expect(peekToken()).toBeNull();
    const saving = saveToken(NEW);
    await act(async () => { await Promise.resolve(); });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    g.release();
    await clearing;
    await saving;
    expect(mockStore[KEY]).toBe(NEW);
    expect(peekToken()).toBe(NEW);
  });

  it('loadToken during a clear cannot restore the old token (started after or before)', async () => {
    mockStore[KEY] = OLD;
    await loadToken();
    const g = gate();
    mockDeleteGate = g.p;
    const before = loadToken();
    const clearing = clearToken();
    const after = loadToken();
    g.release();
    await clearing;
    expect(await before).toBeNull();
    expect(await after).toBeNull();
    expect(peekToken()).toBeNull();
    expect(mockStore[KEY]).toBeUndefined();
  });

  it('a failed job surfaces its error and does not break later jobs', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    await expect(clearToken()).rejects.toThrow(/could not be removed/);
    await saveToken(NEW);
    expect(mockStore[KEY]).toBe(NEW);
    expect(peekToken()).toBe(NEW);
  });
});

describe('sign-in vs expiry cleanup', () => {
  const qcRef: { current: QueryClient } = { current: new QueryClient() };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qcRef.current}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
  );

  afterEach(() => {
    qcRef.current.clear(); // cancels query gc timers so Jest can exit
  });

  it('signIn cannot complete until the expiry delete finishes, and the old delete never wipes the new token', async () => {
    qcRef.current = new QueryClient();
    mockStore[KEY] = OLD;
    api.getMe.mockResolvedValue({ workspace: WS, user: { id: 'u1' } });
    apple.signInAsync.mockResolvedValue({ identityToken: 'id', authorizationCode: 'code' });
    api.signInWithApple.mockResolvedValue({ sessionToken: NEW, workspace: WS, user: { id: 'u1' } });
    const h = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(h.result.current.status).toBe('signedIn'));

    const g = gate();
    mockDeleteGate = g.p;
    await act(async () => { reportUnauthorized({ token: OLD }); });
    expect(h.result.current.status).toBe('signedOut');
    expect(peekToken()).toBeNull();

    let done = false;
    let signing!: Promise<unknown>;
    await act(async () => {
      signing = h.result.current.signIn().then(() => { done = true; });
      await Promise.resolve();
    });
    expect(done).toBe(false);
    expect(Apple.signInAsync).not.toHaveBeenCalled();
    expect(h.result.current.status).toBe('signedOut');

    await act(async () => { g.release(); await signing; });
    expect(h.result.current.status).toBe('signedIn');
    expect(mockStore[KEY]).toBe(NEW);
    expect(peekToken()).toBe(NEW);

    qcRef.current.setQueryData(['fresh'], 1);
    await act(async () => { await Promise.resolve(); });
    expect(qcRef.current.getQueryData(['fresh'])).toBe(1);
  });
});
