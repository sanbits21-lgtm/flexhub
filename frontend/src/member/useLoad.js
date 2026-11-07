import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from './api';
import { useMemberAuth } from './MemberAuth';

const read = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && 'data' in v ? v : null; } catch { return null; }
};
const write = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or unavailable */ }
};

/**
 * Loads a screen's data and keeps the last good copy on this device, so a plan or schedule opens
 * in a gym with no signal. While offline the saved copy is shown with `stale` set; if the server
 * answered with an error that is shown instead, never passed off as the saved copy.
 */
export function useLoad(key, fetcher) {
  const { member } = useMemberAuth();
  const cacheKey = member ? `member:cache:${member._id}:${key}` : null;
  const [state, setState] = useState(() => {
    const cached = cacheKey ? read(cacheKey) : null;
    return { data: cached ? cached.data : null, error: null, loading: !cached, stale: false };
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      if (!alive.current) return;
      if (cacheKey) write(cacheKey, data);
      setState({ data, error: null, loading: false, stale: false });
    } catch (err) {
      if (!alive.current) return;
      const answered = !!err.response;
      setState((s) => ({ data: s.data, error: answered || !s.data ? errorText(err, 'Could not load this.') : null, loading: false, stale: !answered && !!s.data }));
    }
  }, [cacheKey]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // Coming back online (or back to the tab) refreshes what is showing.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const setData = (updater) => setState((s) => {
    const data = typeof updater === 'function' ? updater(s.data) : updater;
    if (cacheKey) write(cacheKey, data);
    return { ...s, data };
  });

  return { ...state, reload: load, setData };
}
