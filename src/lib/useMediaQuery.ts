import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Media query match, subscribed through window.matchMedia via useSyncExternalStore so the
 * correct layout paints immediately; falls back to false only if matchMedia is unavailable
 * or during server rendering. The MediaQueryList is created once per query with useMemo and
 * reused by both subscribe and getSnapshot, instead of calling matchMedia on every read. */
export function useMediaQuery(query: string): boolean {
  const mql = useMemo(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null,
    [query],
  );
  const subscribe = useCallback((onChange: () => void) => {
    if (!mql) return () => {};
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mql]);
  const getSnapshot = useCallback(() => mql !== null && mql.matches, [mql]);
  const getServerSnapshot = () => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
