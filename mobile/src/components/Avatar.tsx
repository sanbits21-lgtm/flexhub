import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { BASE_URL, authHeaders, refreshNow } from '../lib/api';
import { Initials } from './ui';
import { colors } from '../lib/theme';

// The photo endpoint is authenticated, so the image request carries the bearer token.
// `version` busts the cache after an upload (the file name changes server-side, but the
// URL, keyed by member id, does not). Without a photo it falls back to initials.
export function Avatar({ memberId, hasPhoto, name = '', version = 0, size = 72 }: { memberId: string; hasPhoto: boolean; name?: string; version?: number; size?: number }) {
  // The image request carries the access token, which lasts minutes; if it was refused, renew it once and try again.
  const [retry, setRetry] = useState(0);
  if (!hasPhoto) return <Initials name={name} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.accent }}>
      <Image
        source={{ uri: `${BASE_URL}/api/member-app/photo/${memberId}?v=${version}&r=${retry}`, headers: authHeaders() }}
        onError={() => { if (retry === 0) void refreshNow().then((ok) => { if (ok) setRetry(1); }); }}
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="none"
        accessibilityLabel="Profile photo"
      />
    </View>
  );
}
