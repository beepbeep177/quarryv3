import { useCallback, useEffect, useState } from 'react';
import { withTimeout } from './withTimeout';

type Query<T> = (signal: AbortSignal) => Promise<T>;

/** Abort obsolete requests and keep old results from appearing under new filters. */
export function useAsyncQuery<T>(query: Query<T>, initialData: T) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ query: Query<T>; data: T; loading: boolean; error: string }>({ query, data: initialData, loading: true, error: '' });
  const refresh = useCallback(() => {
    setState(previous => ({ ...previous, loading: true, error: '' }));
    setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ query, data: initialData, loading: true, error: '' });
    async function run() {
      try {
        const data = await withTimeout(query(controller.signal), 15000);
        if (active) setState({ query, data, loading: false, error: '' });
      } catch (error) {
        if (active) setState({ query, data: initialData, loading: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.abort();
      }
    }
    void run();
    return () => { active = false; controller.abort(); };
  }, [initialData, query, revision]);
  const current = state.query === query;
  return { data: current ? state.data : initialData, loading: !current || state.loading, error: current ? state.error : '', refresh };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}
