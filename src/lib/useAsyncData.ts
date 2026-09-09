import { useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

/**
 * Loads data for the current route. Deliberately does not fall back to any
 * other snapshot or cached value on failure: a missing snapshot file must
 * surface as a visible error with a reload prompt, never a silent switch.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const generation = useRef(0);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setState({ status: 'loading' });
    loader().then(
      (data) => {
        if (generation.current === myGeneration) setState({ status: 'ready', data });
      },
      (error) => {
        if (generation.current === myGeneration) setState({ status: 'error', error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
