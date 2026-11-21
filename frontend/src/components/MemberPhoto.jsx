import { useEffect, useRef, useState } from 'react';
import { membersAPI } from '../services/api';

const initialsOf = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Pictures already fetched in this tab, by member and by the file they were stored as (a new upload is a new file name, so a
// changed photo is fetched again). Small round pictures, so keeping a few hundred costs next to nothing, and paging back is instant.
const CACHE_LIMIT = 300;
const cache = new Map();
const remember = (key, url) => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    URL.revokeObjectURL(cache.get(oldest));
    cache.delete(oldest);
  }
  cache.set(key, url);
};

/**
 * A member's picture for the staff members list. The picture endpoint is authenticated, so an <img src> cannot fetch it: the
 * bytes come through the API client (which carries the token). A row is only fetched once it scrolls into view, so a long list
 * does not fire a request per member. Without a picture, or if it cannot be loaded, the initials are shown.
 */
export default function MemberPhoto({ member, size = 36 }) {
  const key = member.photoUrl ? `${member._id}:${member.photoUrl}` : null;
  const box = useRef(null);
  const [url, setUrl] = useState(() => (key && cache.get(key)) || null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!key || url || near || !box.current) return undefined;
    if (!('IntersectionObserver' in window)) { setNear(true); return undefined; }
    const watcher = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); watcher.disconnect(); } }, { rootMargin: '120px' });
    watcher.observe(box.current);
    return () => watcher.disconnect();
  }, [key, url, near]);

  useEffect(() => {
    if (!key || url || !near) return undefined;
    let cancelled = false;
    membersAPI.photo(member._id, member.photoUrl)
      .then((res) => {
        const objectUrl = URL.createObjectURL(res.data);
        remember(key, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => { /* initials stay */ });
    return () => { cancelled = true; };
  }, [key, url, near, member._id, member.photoUrl]);

  const dimension = { width: size, height: size };
  return (
    <span ref={box} className="inline-flex shrink-0" style={dimension}>
      {url
        ? <img src={url} alt="" data-testid="member-photo" className="rounded-full object-cover" style={dimension} />
        : <span aria-hidden="true" className="inline-flex items-center justify-center rounded-full bg-accent-strong font-bold text-white dark:bg-accent dark:text-accent-ink" style={{ ...dimension, fontSize: size * 0.38 }}>{initialsOf(member.name)}</span>}
    </span>
  );
}
