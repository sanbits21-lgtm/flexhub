import { useEffect, useState } from 'react';
import { memberApi } from './api';
import { Initials } from './ui';

// The photo endpoint is authenticated, so an <img src> cannot fetch it: the bytes come through
// the API client (which carries the token) and are shown from a temporary object URL.
// `version` refetches after an upload; without a photo, or if it fails, initials are shown.
export default function Avatar({ memberId, hasPhoto, name, size = 72, version = 0 }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!hasPhoto || !memberId) { setUrl(null); return undefined; }
    let objectUrl;
    let cancelled = false;
    memberApi.get(`/member-app/photo/${memberId}`, { params: { v: version }, responseType: 'blob' })
      .then((res) => { if (!cancelled) { objectUrl = URL.createObjectURL(res.data); setUrl(objectUrl); } })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [memberId, hasPhoto, version]);

  if (!url) return <Initials name={name} size={size} />;
  return <img src={url} alt="Profile" width={size} height={size} className="rounded-full object-cover border-2 border-accent shrink-0" style={{ width: size, height: size }} />;
}
