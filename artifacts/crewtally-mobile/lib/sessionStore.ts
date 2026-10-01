import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'crewtally.session.v1';

export class SessionStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStorageError';
  }
}

// In-memory copy so request code never touches the keychain per call.
let cached: string | null = null;
// Bumped synchronously by every save/clear. A slower read or save that finishes
// after a newer mutation must not publish its (older) result.
let epoch = 0;
// Every SecureStore call runs through this queue, strictly one at a time.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job);
  // The queue survives a failed job; the caller still receives the rejection.
  queue = result.then(() => undefined, () => undefined);
  return result;
}

const isNative = () => Platform.OS === 'ios' || Platform.OS === 'android';

export function peekToken(): string | null {
  return cached;
}

export async function loadToken(): Promise<string | null> {
  if (!isNative()) return null; // no web fallback: the token is never put in localStorage
  const mine = epoch;
  let value: string | null;
  try {
    value = await enqueue(() => SecureStore.getItemAsync(KEY));
  } catch {
    throw new SessionStorageError('Saved sign-in could not be read from this device.');
  }
  if (mine !== epoch) return cached; // a save/clear happened meanwhile: never resurrect an old token
  cached = value;
  return value;
}

export async function saveToken(token: string): Promise<void> {
  if (!isNative()) throw new SessionStorageError('Secure storage is not available here.');
  const mine = ++epoch;
  try {
    await enqueue(() => SecureStore.setItemAsync(KEY, token));
  } catch {
    if (mine === epoch) cached = null;
    throw new SessionStorageError('Your sign-in could not be saved securely on this device.');
  }
  if (mine === epoch) cached = token;
}

export function clearToken(): Promise<void> {
  epoch += 1;
  cached = null; // synchronous: in-flight requests stop being authenticated at once
  if (!isNative()) return Promise.resolve();
  return enqueue(() => SecureStore.deleteItemAsync(KEY)).catch(() => {
    throw new SessionStorageError('Saved sign-in could not be removed from this device.');
  });
}
