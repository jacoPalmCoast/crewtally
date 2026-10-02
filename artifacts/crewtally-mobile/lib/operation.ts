import { useRef } from 'react';
import * as Crypto from 'expo-crypto';

export function newOperationId(): string {
  return Crypto.randomUUID();
}

export interface OperationKeeper {
  /** Same fingerprint (same request) returns the same operation_id, so a retry is never a second write. */
  idFor(fingerprint: string): string;
  /** Call after the write succeeded. */
  done(): void;
}

export function createOperationKeeper(make: () => string = newOperationId): OperationKeeper {
  let current: { fingerprint: string; id: string } | null = null;
  return {
    idFor(fingerprint) {
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, id: make() };
      return current.id;
    },
    done() { current = null; },
  };
}

export function useOperationKeeper(): OperationKeeper {
  const ref = useRef<OperationKeeper | null>(null);
  if (!ref.current) ref.current = createOperationKeeper();
  return ref.current;
}
