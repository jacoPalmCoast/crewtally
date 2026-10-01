import React from 'react';
import { act, renderHook, waitFor, render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appEnv: 'development' } } },
}));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true) }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(255)),
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));
const drafts: Record<string, string> = { draft: 'keep me' };
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async (k: string) => drafts[k] ?? null), clear: jest.fn() },
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@workspace/api-client-react', () => ({
  getMe: jest.fn(), signInWithApple: jest.fn(), signInDev: jest.fn(), signOut: jest.fn(), healthCheck: jest.fn(),
  setBaseUrl: jest.fn(), setAuthTokenGetter: jest.fn(), setUnauthorizedHandler: jest.fn(),
}));

import * as Apple from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Api from '@workspace/api-client-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { base64Url, createNoncePair } from '@/lib/appleNonce';
import { peekToken } from '@/lib/sessionStore';
import { reportUnauthorized } from '@/lib/authEvents';
import AccountScreen from '@/app/account';
import MoreScreen from '@/app/(tabs)/more';

const api = Api as unknown as Record<'getMe' | 'signInWithApple' | 'signInDev' | 'signOut' | 'healthCheck', jest.Mock>;
const apple = Apple as unknown as { signInAsync: jest.Mock };
const WS = { id: 'abcdef12-0000-4000-8000-000000000000', name: 'My workspace', currency: 'USD', locale: 'en-US' };
const ME = { workspace: WS, user: { id: 'u1' } };
const TOKEN = 'T'.repeat(43);
const http = (status: number) => Object.assign(new Error('x'), { name: 'ApiError', status });

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
);
const setup = () => renderHook(() => useAuth(), { wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
  qc = new QueryClient();
  api.getMe.mockResolvedValue(ME);
  apple.signInAsync.mockResolvedValue({ identityToken: 'id', authorizationCode: 'code' });
  api.signInWithApple.mockResolvedValue({ sessionToken: TOKEN, workspace: WS, user: { id: 'u1' } });
  api.signInDev.mockResolvedValue({ sessionToken: TOKEN, workspace: WS, user: { id: 'u1' } });
  api.signOut.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function signedIn() {
  const h = setup();
  await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
  await act(async () => { await h.result.current.signIn(); });
  expect(h.result.current.status).toBe('signedIn');
  return h;
}

describe('nonce', () => {
  it('uses 32 random bytes, base64url raw nonce and SHA-256 hex via expo-crypto', async () => {
    const { rawNonce, hashedNonce } = await createNoncePair();
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(rawNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', rawNonce, { encoding: 'hex' });
    expect(hashedNonce).toHaveLength(64);
  });
});

describe('base64url', () => {
  it('encodes 32 bytes to exactly 43 chars that round-trip to the same bytes', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 251) % 256);
    const NodeBuffer = (globalThis as unknown as { Buffer: { from(x: unknown, e?: string): { toString(e: string): string } & Uint8Array } }).Buffer;
    const enc = base64Url(bytes);
    expect(enc).toHaveLength(43);
    expect(enc).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(enc).toBe(NodeBuffer.from(bytes).toString('base64url'));
    expect(Uint8Array.from(NodeBuffer.from(enc, 'base64url'))).toEqual(bytes);
    expect(base64Url(new Uint8Array(32).fill(255))).toBe('_'.repeat(42) + '8');
  });
});

describe('sign in', () => {
  it('requests no scopes, passes the hash to Apple and the raw nonce to the API', async () => {
    await signedIn();
    const input = apple.signInAsync.mock.calls[0][0];
    expect(input.requestedScopes).toEqual([]);
    expect(input.nonce).toBe('a'.repeat(64));
    const body = api.signInWithApple.mock.calls[0][0];
    expect(body.identityToken).toBe('id');
    expect(body.authorizationCode).toBe('code');
    expect(body.rawNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores the session token only in SecureStore and not in the mutation cache', async () => {
    await signedIn();
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(Object.values(store)).toEqual([TOKEN]);
    expect(peekToken()).toBe(TOKEN);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(JSON.stringify(qc.getQueryCache().getAll())).not.toContain(TOKEN);
  });

  it('treats Apple cancel as silent, not a failure', async () => {
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    apple.signInAsync.mockRejectedValue(Object.assign(new Error('c'), { code: 'ERR_REQUEST_CANCELED' }));
    let r;
    await act(async () => { r = await h.result.current.signIn(); });
    expect(r).toBe('cancelled');
    expect(h.result.current.message).toBeNull();
    expect(h.result.current.status).toBe('signedOut');
  });

  it('shows a safe message, never the raw exception', async () => {
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    api.signInWithApple.mockRejectedValue(new Error('secret-internal-detail'));
    await act(async () => { await h.result.current.signIn(); });
    expect(h.result.current.message).not.toContain('secret-internal-detail');
    expect(h.result.current.status).toBe('signedOut');
  });

  it('fails explicitly when SecureStore cannot save', async () => {
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    let r;
    await act(async () => { r = await h.result.current.signIn(); });
    expect(r).toBe('failed');
    expect(h.result.current.status).toBe('signedOut');
    expect(h.result.current.message).toMatch(/saved securely/);
  });

  it('developer sign-in uses the generated operation and shared secure session storage without invoking Apple', async () => {
    const h = setup();
    const privateCode = 'never-save-this-code';
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    let result: string | undefined;
    await act(async () => {
      result = await h.result.current.developerSignIn(privateCode, 'owner-b');
    });
    expect(result).toBe('ok');
    expect(api.signInDev).toHaveBeenCalledWith({ code: privateCode, label: 'owner-b' });
    expect(apple.signInAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(Object.values(store)).toEqual([TOKEN]);
    expect(JSON.stringify(store)).not.toContain(privateCode);
    expect(JSON.stringify(qc.getQueryCache().getAll())).not.toContain(privateCode);
    expect(JSON.stringify(qc.getMutationCache().getAll())).not.toContain(privateCode);
    expect(h.result.current.status).toBe('signedIn');
  });

  it('developer sign-in rejects a wrong code with a safe message and no persistence or logging', async () => {
    const h = setup();
    const privateCode = 'wrong-private-code';
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    api.signInDev.mockRejectedValue(Object.assign(new Error(`invalid code: ${privateCode}`), { status: 401 }));
    let result: string | undefined;
    await act(async () => {
      result = await h.result.current.developerSignIn(privateCode, 'owner-a');
    });
    expect(result).toBe('failed');
    expect(h.result.current.message).toBe('Developer sign-in code was not accepted. Check it and try again.');
    expect(h.result.current.message).not.toContain(privateCode);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(store['crewtally.session.v1']).toBeUndefined();
    expect(warning.mock.calls.flat().join(' ')).not.toContain(privateCode);
    expect((console.error as jest.Mock).mock.calls.flat().join(' ')).not.toContain(privateCode);
    expect(logger.mock.calls.flat().join(' ')).not.toContain(privateCode);
  });
});

describe('launch restore', () => {
  it('restores a session when /me succeeds', async () => {
    store['crewtally.session.v1'] = TOKEN;
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('signedIn'));
    expect(h.result.current.workspace?.id).toBe(WS.id);
  });

  it('on 401 deletes the token and shows sign-in', async () => {
    store['crewtally.session.v1'] = TOKEN;
    api.getMe.mockRejectedValue(http(401));
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('signedOut'));
    expect(store['crewtally.session.v1']).toBeUndefined();
  });

  it('on network failure keeps the token, blocks the app and retries', async () => {
    store['crewtally.session.v1'] = TOKEN;
    api.getMe.mockRejectedValueOnce(new TypeError('Network request failed'));
    const h = setup();
    await waitFor(() => expect(h.result.current.status).toBe('retry'));
    expect(store['crewtally.session.v1']).toBe(TOKEN);
    await act(async () => { h.result.current.retryRestore(); });
    await waitFor(() => expect(h.result.current.status).toBe('signedIn'));
  });

  it('ignores an old expired restore that finishes after a fresh sign-in', async () => {
    store['crewtally.session.v1'] = 'OLD'.padEnd(43, 'o');
    let reject!: (e: unknown) => void;
    api.getMe.mockReturnValueOnce(new Promise((_, rj) => { reject = rj; }));
    const h = setup();
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    await act(async () => { await h.result.current.signIn(); });
    expect(h.result.current.status).toBe('signedIn');
    await act(async () => { reject(http(401)); });
    expect(h.result.current.status).toBe('signedIn');
    expect(store['crewtally.session.v1']).toBe(TOKEN);
  });
});

describe('later 401', () => {
  it('clears the session, notices, keeps AsyncStorage drafts, and resumes the route for the same owner', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const h = await signedIn();
    qc.setQueryData(['x'], 1);
    await act(async () => { h.result.current.rememberRoute('/payments'); });
    await act(async () => { reportUnauthorized({ token: TOKEN }); });
    expect(h.result.current.status).toBe('signedOut');
    expect(h.result.current.notice).toBe('Please sign in again');
    expect(store['crewtally.session.v1']).toBeUndefined();
    expect(qc.getQueryData(['x'])).toBeUndefined();
    expect(AsyncStorage.clear).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('draft')).toBe('keep me');
    await act(async () => { await h.result.current.signIn(); });
    expect(h.result.current.status).toBe('signedIn');
    expect(h.result.current.pendingRoute).toBe('/payments');
    let route: string | null = null;
    await act(async () => { route = h.result.current.consumePendingRoute(); });
    expect(route).toBe('/payments');
  });

  it('drops the remembered route for a different owner', async () => {
    const h = await signedIn();
    await act(async () => { h.result.current.rememberRoute('/payments'); });
    await act(async () => { reportUnauthorized({ token: TOKEN }); });
    api.signInWithApple.mockResolvedValue({ sessionToken: 'N'.repeat(43), workspace: WS, user: { id: 'u2' } });
    await act(async () => { await h.result.current.signIn(); });
    expect(h.result.current.pendingRoute).toBeNull();
  });

  it('developer sign-in resumes the remembered route for the same owner after shared cleanup', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const h = await signedIn();
    qc.setQueryData(['user-scoped'], { value: 'cached' });
    await act(async () => { h.result.current.rememberRoute('/payments'); });
    await act(async () => { reportUnauthorized({ token: TOKEN }); });
    expect(qc.getQueryData(['user-scoped'])).toBeUndefined();
    expect(AsyncStorage.clear).not.toHaveBeenCalled();
    api.signInDev.mockResolvedValue({ sessionToken: 'D'.repeat(43), workspace: WS, user: { id: 'u1' } });
    await act(async () => { await h.result.current.developerSignIn('owner-secret', 'owner-a'); });
    expect(h.result.current.status).toBe('signedIn');
    expect(h.result.current.pendingRoute).toBe('/payments');
    expect(store['crewtally.session.v1']).toBe('D'.repeat(43));
    expect(await AsyncStorage.getItem('draft')).toBe('keep me');
  });

  it('ignores a 401 carrying a stale token', async () => {
    const h = await signedIn();
    await act(async () => { reportUnauthorized({ token: 'stale' }); });
    expect(h.result.current.status).toBe('signedIn');
  });
});

describe('sign out', () => {
  it('revokes on the server before clearing locally, without Apple signOut', async () => {
    const h = await signedIn();
    const order: string[] = [];
    api.signOut.mockImplementation(async () => { order.push('server'); expect(store['crewtally.session.v1']).toBe(TOKEN); });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { order.push('local'); delete store['crewtally.session.v1']; });
    await act(async () => { await h.result.current.signOut(); });
    expect(order).toEqual(['server', 'local']);
    expect(h.result.current.status).toBe('signedOut');
    expect(h.result.current.notice).toBeNull();
  });

  it('treats a revoked 401 as already signed out', async () => {
    const h = await signedIn();
    api.signOut.mockRejectedValue(http(401));
    await act(async () => { await h.result.current.signOut(); });
    expect(h.result.current.status).toBe('signedOut');
    expect(store['crewtally.session.v1']).toBeUndefined();
  });

  it('stays signed in with a clear message when the network fails', async () => {
    const h = await signedIn();
    api.signOut.mockRejectedValue(new TypeError('offline'));
    let r;
    await act(async () => { r = await h.result.current.signOut(); });
    expect(r).toBe('failed');
    expect(h.result.current.status).toBe('signedIn');
    expect(store['crewtally.session.v1']).toBe(TOKEN);
  });
});

describe('screens', () => {
  const Harness = ({ children }: { children: React.ReactNode }) => {
    const { status, signIn } = useAuth();
    return <>{status === 'signedIn' ? children : <SignInTrigger signIn={signIn} />}</>;
  };
  const SignInTrigger = ({ signIn }: { signIn: () => Promise<unknown> }) => {
    const { Text } = require('react-native');
    return <Text testID="go" onPress={() => void signIn()}>go</Text>;
  };

  it('Account shows Signed in with Apple and confirms before signing out', async () => {
    render(<Harness><AccountScreen /></Harness>, { wrapper });
    await waitFor(() => screen.getByTestId('go'));
    await act(async () => { fireEvent.press(screen.getByTestId('go')); });
    await waitFor(() => screen.getByText('Signed in with Apple'));
    fireEvent.press(screen.getByTestId('signout'));
    expect(api.signOut).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByTestId('signout-confirm')); });
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });

  it('Diagnostics shows first 8 chars of workspace ID, version and API status', async () => {
    api.healthCheck.mockResolvedValue({ status: 'ok', db: 'ok', migrations: 2 });
    render(<Harness><MoreScreen /></Harness>, { wrapper });
    await waitFor(() => screen.getByTestId('go'));
    await act(async () => { fireEvent.press(screen.getByTestId('go')); });
    await waitFor(() => screen.getByText('abcdef12'));
    expect(screen.queryByText(WS.id)).toBeNull();
    await waitFor(() => screen.getByText('ok'));
    expect(screen.getByText('App version')).toBeTruthy();
  });
});
