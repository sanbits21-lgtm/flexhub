import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

// Loads on every focus of the screen (so an edit is reflected when you navigate back) and
// again whenever `deps` change (e.g. the selected branch). reload() powers pull-to-refresh.
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, deps);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return { data, error, loading, reload, setData };
}

export { fmtDate as formatDate } from './format';
