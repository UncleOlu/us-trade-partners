import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const BURST_MS = 1000;

/**
 * A URL query parameter used for free-text search. The URL updates
 * synchronously on every change so it always matches the input. A burst of
 * rapid edits collapses into one history entry: the first edit after at
 * least 1000ms without a change pushes a new entry, and further edits
 * within 1000ms of the last change replace the current entry. Back then
 * restores the previous search rather than each keystroke.
 */
export function useSearchParam(key: string) {
  const [params, setParams] = useSearchParams();
  const lastChangeAt = useRef(-Infinity);
  const value = params.get(key) ?? '';
  const setValue = useCallback((next: string) => {
    const now = Date.now();
    const replace = now - lastChangeAt.current < BURST_MS;
    lastChangeAt.current = now;
    setParams((previous) => {
      const merged = new URLSearchParams(previous);
      if (next) merged.set(key, next); else merged.delete(key);
      return merged;
    }, { replace });
  }, [key, setParams]);
  const clear = useCallback(() => setValue(''), [setValue]);
  return { value, setValue, clear };
}
