/**
 * One animation clock shared by every sprite in the guide (rather than a timer per card), ticking
 * at the game's rate. It only runs while at least one animated sprite is mounted.
 */
import { useEffect } from 'react';

import { TICKS_PER_SECOND } from '@/engine/constants';
import { createStore, useStore } from '@/lib/store';

export interface Clock {
  tick: number;
}

const clock = createStore<Clock>({ tick: 0 });
let clockTimer: ReturnType<typeof setInterval> | null = null;
let clockUsers = 0;

/**
 * Subscribes to the clock. Select the visible frame rather than the tick so the component only
 * re-renders when its frame changes; the selector should be stable (e.g. from `useCallback`).
 */
export function useClock<T>(selector: (c: Clock) => T): T {
  useEffect(() => {
    if (clockUsers++ === 0) {
      clockTimer = setInterval(
        () => clock.set((c) => ({ tick: c.tick + 1 })),
        1000 / TICKS_PER_SECOND,
      );
    }
    return () => {
      if (--clockUsers === 0 && clockTimer !== null) {
        clearInterval(clockTimer);
        clockTimer = null;
      }
    };
  }, []);
  return useStore(clock, selector);
}
