import { useEffect, useState } from 'react';
import { api } from './api';

/** The signed-in gym's name (for messages sent in its name). Empty until it loads. */
export function useGymName() {
  const [name, setName] = useState('');
  useEffect(() => {
    let live = true;
    api.get<{ name: string }>('/tenant-settings').then((t) => { if (live) setName(t.name); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return name;
}
