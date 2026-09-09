import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Tracks the content width of a container element via ResizeObserver, so the
 * map SVG can be responsive without re-fetching or re-joining any data.
 * Falls back to a fixed width if ResizeObserver is unavailable.
 */
export function useContainerWidth<T extends HTMLElement>(fallback: number): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof ResizeObserver === 'undefined') {
      setWidth(el.clientWidth || fallback);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = entry.contentRect.width;
        if (next > 0) setWidth(next);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width];
}
