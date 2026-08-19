import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { getActiveAccountCode } from './tenantSession';

const PREFIX = 'swimIT.formDraft.';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Envelope = { savedAt: number; data: unknown };

function storageKey(kind: string) {
  const code = getActiveAccountCode() || 'public';
  const demo = isApplicationDemo() ? '.demo' : '';
  return `${PREFIX}${code}${demo}.${kind}`;
}

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, raw: string) {
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* quota / private mode */
  }
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    /* ignore */
  }
}

function removeStore(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readFormDraft<T>(kind: string): T | null {
  const raw = readStore(storageKey(kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Envelope;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearFormDraft(kind);
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function writeFormDraft(kind: string, data: unknown) {
  writeStore(storageKey(kind), JSON.stringify({ savedAt: Date.now(), data }));
}

export function clearFormDraft(kind: string) {
  removeStore(storageKey(kind));
}

export function mergeDraft<T extends Record<string, unknown>>(initial: T, draft: unknown): T {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return initial;
  const source = draft as Record<string, unknown>;
  const next = { ...initial };
  (Object.keys(initial) as (keyof T)[]).forEach((key) => {
    if (!(String(key) in source)) return;
    const value = source[String(key)];
    const sample = initial[key];
    if (Array.isArray(sample)) {
      next[key] = (Array.isArray(value) ? value : sample) as T[keyof T];
      return;
    }
    if (typeof sample === 'boolean') {
      next[key] = Boolean(value) as T[keyof T];
      return;
    }
    if (typeof sample === 'string' && typeof value === 'string') {
      next[key] = value as T[keyof T];
    }
  });
  return next;
}

/** Restore a JSON draft on mount and save it as the user types. Photos are not stored. */
export function useFormDraft<T>(kind: string, value: T, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => writeFormDraft(kind, value), 400);
    return () => window.clearTimeout(timer);
  }, [kind, value, enabled]);
}

export function useDraftState<T>(kind: string, initial: T, enabled: boolean): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (!enabled) return initial;
    const saved = readFormDraft<T>(kind);
    return saved ?? initial;
  });
  useFormDraft(kind, state, enabled);
  return [state, setState];
}
