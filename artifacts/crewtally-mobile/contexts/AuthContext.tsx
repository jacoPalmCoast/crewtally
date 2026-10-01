import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { getMe, signInWithApple, signOut as signOutRequest } from '@workspace/api-client-react';
import { createNoncePair } from '@/lib/appleNonce';
import { setUnauthorizedListener } from '@/lib/authEvents';
import { clearToken, loadToken, peekToken, saveToken } from '@/lib/sessionStore';

export type AuthStatus = 'restoring' | 'retry' | 'signedOut' | 'signedIn';
export interface AuthWorkspace { id: string; name: string; currency: string; locale: string }

export const SIGN_IN_AGAIN_NOTICE = 'Please sign in again';

export type SignInResult = 'ok' | 'cancelled' | 'failed';
export type SignOutResult = 'ok' | 'failed';
export type DeveloperSignInLabel = 'owner-a' | 'owner-b';

interface AuthValue {
  status: AuthStatus;
  workspace: AuthWorkspace | null;
  userId: string | null;
  notice: string | null;
  message: string | null;
  busy: boolean;
  pendingRoute: string | null;
  signIn: () => Promise<SignInResult>;
  developerSignIn: (code: string, label: DeveloperSignInLabel) => Promise<SignInResult>;
  signOut: () => Promise<SignOutResult>;
  retryRestore: () => void;
  rememberRoute: (path: string) => void;
  consumePendingRoute: () => string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
};

function safeSignInMessage(e: unknown): string {
  const status = statusOf(e);
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status === 401) return 'Apple could not be verified. Please try again.';
  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
  return 'Sign in did not finish. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [workspace, setWorkspace] = useState<AuthWorkspace | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const busy = working || cleaning;
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const generation = useRef(0);
  const mounted = useRef(true);
  const lastRoute = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const pendingOwner = useRef<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const signingOutToken = useRef<string | null>(null);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const dropCaches = useCallback(async () => {
    // Only user-scoped server cache. Local drafts (AsyncStorage) are never touched.
    await queryClientRef.current.cancelQueries();
    queryClientRef.current.clear();
  }, []);

  // Barrier: sign-in never completes while a previous expiry/sign-out cleanup is running.
  const cleanupRef = useRef<Promise<void>>(Promise.resolve());
  const runCleanup = useCallback(
    (clearing: Promise<void>): Promise<boolean> => {
      clearing.catch(() => undefined); // observed below; avoids a transient unhandled rejection
      const prior = cleanupRef.current;
      setCleaning(true);
      const p = (async () => {
        await prior;
        let ok = true;
        try {
          await dropCaches();
        } catch {
          ok = false;
        }
        try {
          await clearing;
        } catch {
          ok = false;
        }
        if (!ok && mounted.current) setMessage('Saved sign-in could not be removed from this device.');
        return ok;
      })();
      const done = p.then(() => {
        if (cleanupRef.current === done && mounted.current) setCleaning(false);
      });
      cleanupRef.current = done;
      return p;
    },
    [dropCaches],
  );

  const expire = useCallback(
    async (token: string | null) => {
      if (!token || peekToken() !== token || signingOutToken.current === token) return;
      generation.current += 1;
      const wasSignedIn = ownerRef.current !== null;
      pendingRef.current = wasSignedIn ? lastRoute.current : null;
      pendingOwner.current = wasSignedIn ? ownerRef.current : null;
      setPendingRoute(pendingRef.current);
      setStatus('signedOut');
      setNotice(SIGN_IN_AGAIN_NOTICE);
      setMessage(null);
      const clearing = clearToken(); // cached token is dropped synchronously
      setWorkspace(null);
      setUserId(null);
      ownerRef.current = null;
      await runCleanup(clearing);
    },
    [runCleanup],
  );
  const expireRef = useRef(expire);
  expireRef.current = expire;

  useEffect(() => {
    mounted.current = true;
    const off = setUnauthorizedListener((report) => void expireRef.current(report.token));
    return () => {
      mounted.current = false;
      off();
    };
  }, []);

  const restore = useCallback(async () => {
    const gen = ++generation.current;
    setStatus('restoring');
    setMessage(null);
    let token: string | null;
    try {
      token = await loadToken();
    } catch {
      if (gen !== generation.current) return;
      setStatus('retry');
      setMessage('Your saved sign-in could not be read. Try again.');
      return;
    }
    if (gen !== generation.current) return;
    if (!token) {
      setStatus('signedOut');
      return;
    }
    try {
      const me = await getMe();
      if (gen !== generation.current || peekToken() !== token) return; // superseded by a newer sign-in
      ownerRef.current = me.user.id;
      setWorkspace(me.workspace);
      setUserId(me.user.id);
      setStatus('signedIn');
    } catch (e) {
      if (gen !== generation.current) return;
      if (statusOf(e) === 401) {
        await expireRef.current(token);
        return;
      }
      // Network or server trouble: keep the token, block the app, offer retry.
      setStatus('retry');
      setMessage('Could not reach CrewTally. Your sign-in is still saved. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const completeSignIn = useCallback(async (
    result: Awaited<ReturnType<typeof signInWithApple>>,
    gen: number,
  ): Promise<SignInResult> => {
    if (gen !== generation.current) return 'failed';
    try {
      await saveToken(result.sessionToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Your sign-in could not be saved securely.');
      return 'failed';
    }
    if (gen !== generation.current) {
      await clearToken().catch(() => undefined);
      return 'failed';
    }
    const sameOwner = pendingOwner.current === result.user.id;
    if (!sameOwner) {
      await dropCaches();
      pendingRef.current = null;
      setPendingRoute(null);
    }
    pendingOwner.current = null;
    ownerRef.current = result.user.id;
    setWorkspace(result.workspace);
    setUserId(result.user.id);
    setNotice(null);
    setStatus('signedIn');
    return 'ok';
  }, [dropCaches]);

  const signIn = useCallback(async (): Promise<SignInResult> => {
    if (working) return 'failed';
    setBusy(true);
    await cleanupRef.current;
    const gen = ++generation.current;
    setMessage(null);
    try {
      const { rawNonce, hashedNonce } = await createNoncePair();
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashedNonce });
      } catch (e) {
        if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
        setMessage('Sign in with Apple did not finish. Please try again.');
        return 'failed';
      }
      if (!credential.identityToken || !credential.authorizationCode) {
        setMessage('Apple did not return a sign-in. Please try again.');
        return 'failed';
      }
      let result: Awaited<ReturnType<typeof signInWithApple>>;
      try {
        result = await signInWithApple({
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          rawNonce,
        });
      } catch (e) {
        setMessage(safeSignInMessage(e));
        return 'failed';
      }
      return await completeSignIn(result, gen);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [working, completeSignIn]);

  const developerSignIn = useCallback(async (
    code: string,
    label: DeveloperSignInLabel,
  ): Promise<SignInResult> => {
    if (
      !__DEV__
      || Constants.expoConfig?.extra?.appEnv !== 'development'
      || working
    ) return 'failed';
    setBusy(true);
    await cleanupRef.current;
    const gen = ++generation.current;
    setMessage(null);
    try {
      if (__DEV__ && Constants.expoConfig?.extra?.appEnv === 'development') {
        let result: Awaited<ReturnType<typeof signInWithApple>>;
        try {
          const { requestDevSignIn } = require('@/lib/devSignInApi') as {
            requestDevSignIn: (
              code: string,
              label: DeveloperSignInLabel,
            ) => Promise<Awaited<ReturnType<typeof signInWithApple>>>;
          };
          result = await requestDevSignIn(code, label);
        } catch (e) {
          if (gen !== generation.current) return 'failed';
          const status = statusOf(e);
          setMessage(status === 401
            ? 'Developer sign-in code was not accepted. Check it and try again.'
            : status === 429
              ? 'Too many attempts. Wait a minute and try again.'
              : 'Developer sign-in could not finish. Please try again.');
          return 'failed';
        }
        return await completeSignIn(result, gen);
      }
      return 'failed';
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [working, completeSignIn]);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    const token = peekToken();
    if (token) {
      signingOutToken.current = token;
      try {
        await signOutRequest(); // server revoke first
      } catch (e) {
        if (statusOf(e) !== 401) {
          // Revoked/expired (401) means already signed out; anything else keeps the session.
          signingOutToken.current = null;
          setMessage('Could not sign out because CrewTally was unreachable. You are still signed in. Try again.');
          return 'failed';
        }
      }
    }
    generation.current += 1;
    pendingRef.current = null;
    pendingOwner.current = null;
    setPendingRoute(null);
    ownerRef.current = null;
    setNotice(null);
    setWorkspace(null);
    setUserId(null);
    setStatus('signedOut');
    const ok = await runCleanup(clearToken());
    signingOutToken.current = null;
    return ok ? 'ok' : 'failed';
  }, [runCleanup]);

  const rememberRoute = useCallback((path: string) => {
    if (path && !path.startsWith('/sign-in')) lastRoute.current = path;
  }, []);

  const consumePendingRoute = useCallback(() => {
    const route = pendingRef.current;
    pendingRef.current = null;
    setPendingRoute(null);
    return route;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status, workspace, userId, notice, message, busy, pendingRoute,
      signIn, developerSignIn, signOut, retryRestore: () => void restore(), rememberRoute, consumePendingRoute,
    }),
    [status, workspace, userId, notice, message, busy, pendingRoute, signIn, developerSignIn, signOut, restore, rememberRoute, consumePendingRoute],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
