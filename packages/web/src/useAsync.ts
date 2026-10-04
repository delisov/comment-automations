import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error; data?: T };

export const useAsync = <T>(load: () => Promise<T>, deps: unknown[]) => {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ status: 'loading', data: previous.data }));
    load().then(
      (data) => {
        if (!cancelled) {
          setState({ status: 'ready', data });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
            data: previous.data,
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);

  return { ...state, reload, setData: (data: T) => setState({ status: 'ready', data }) };
};
