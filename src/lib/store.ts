/**
 * Minimal observable store with a selector hook, built on `useSyncExternalStore`.
 *
 * Used for state shared between screens (player profile) and for high-frequency game HUD state,
 * where components should only re-render when the slice they read changes.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      let changed = false;
      for (const key in patch) {
        if (!Object.is(patch[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        return;
      }
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Subscribes to a slice of a store. The selector should return a primitive or stable value. */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const getSnapshot = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
