/**
 * Web implementation of the key-value store, backed by `localStorage`
 * (SQLite on web needs special cross-origin headers, which isn't worth it for a dev target).
 */
const PREFIX = 'robodefense:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key) ?? null;
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); progress just won't persist.
  }
}

export function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    // Ignore, see writeJSON.
  }
}

export { Keys } from './storageKeys';
