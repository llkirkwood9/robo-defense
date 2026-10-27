/**
 * Small typed wrapper over the synchronous SQLite-backed key-value store.
 *
 * Synchronous access mirrors the original's SharedPreferences usage and keeps game start-up
 * simple: everything a screen needs is available on first render.
 */
import Storage from 'expo-sqlite/kv-store';

const PREFIX = 'robodefense:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch (err) {
    console.warn(`Failed to read "${key}"`, err);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    Storage.setItemSync(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to write "${key}"`, err);
  }
}

export function remove(key: string): void {
  try {
    Storage.removeItemSync(PREFIX + key);
  } catch (err) {
    console.warn(`Failed to remove "${key}"`, err);
  }
}

export { Keys } from './storageKeys';
