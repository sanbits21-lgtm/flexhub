import { useEffect, useState } from 'react';
import { profileAPI } from '../services/api';

const initialsOf = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// The picture endpoint is authenticated, so an <img src> cannot fetch it: the bytes come through the
// API client (which carries the token) and are shown from a temporary object URL. `version`
// refetches after an upload; without a picture, or if it fails, initials are shown.
export default function StaffAvatar({ userId, hasPhoto, name, size = 36, version = 0 }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!hasPhoto || !userId) { setUrl(null); return undefined; }
    let objectUrl;
    let cancelled = false;
    profileAPI.photo(userId, version)
      .then((res) => { if (!cancelled) { objectUrl = URL.createObjectURL(res.data); setUrl(objectUrl); } })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [userId, hasPhoto, version]);

  const box = { width: size, height: size };
  if (!url) {
    return <span aria-hidden="true" className="inline-flex items-center justify-center rounded-full bg-accent text-accent-ink font-bold shrink-0" style={{ ...box, fontSize: size * 0.38 }}>{initialsOf(name)}</span>;
  }
  return <img src={url} alt="" className="rounded-full object-cover shrink-0" style={box} />;
}
