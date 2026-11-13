import { useSyncExternalStore } from 'react';

/** Tiny observable store (no external state library needed). */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  patch(partial: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      emit();
    },
    patch(partial) {
      let changed = false;
      for (const k of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[k], partial[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object>(store: Store<T>): T;
export function useStore<T extends object, U>(store: Store<T>, select: (s: T) => U): U;
export function useStore<T extends object, U>(store: Store<T>, select?: (s: T) => U): T | U {
  const pick = () => (select ? select(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, pick, pick);
}

/** localStorage helpers that never throw (private mode, blocked storage). */
export const safeStorage = {
  get(key: string, area: 'local' | 'session' = 'local'): string | null {
    try {
      return (area === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string, area: 'local' | 'session' = 'local'): void {
    try {
      (area === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
    } catch {
      /* storage unavailable – ignore */
    }
  },
  remove(key: string, area: 'local' | 'session' = 'local'): void {
    try {
      (area === 'local' ? window.localStorage : window.sessionStorage).removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
