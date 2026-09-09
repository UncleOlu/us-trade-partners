import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

/** Associate every result with its inputs, including the render before an effect runs. */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [result, setResult] = useState<{ deps: unknown[]; state: AsyncState<T> }>({ deps: [], state: { status: 'loading' } });
  useEffect(() => {
    let active = true;
    const inputs = [...deps];
    setResult({ deps: inputs, state: { status: 'loading' } });
    Promise.resolve().then(loader).then(
      (data) => { if (active) setResult({ deps: inputs, state: { status: 'ready', data } }); },
      (error) => { if (active) setResult({ deps: inputs, state: { status: 'error', error } }); },
    );
    return () => { active = false; };
    // The caller lists all inputs used by the loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return deps.length === result.deps.length && deps.every((dep, i) => Object.is(dep, result.deps[i]))
    ? result.state : { status: 'loading' };
}
