import { View } from 'react-native';
import { Image } from 'expo-image';
import { BASE_URL, authHeaders } from '../lib/api';
import { Initials } from './ui';
import { colors } from '../lib/theme';

// The photo endpoint is authenticated, so the image request carries the bearer token.
// `version` busts the cache after an upload (the file name changes server-side, but the
// URL, keyed by member id, does not). Without a photo it falls back to initials.
export function Avatar({ memberId, hasPhoto, name = '', version = 0, size = 72 }: { memberId: string; hasPhoto: boolean; name?: string; version?: number; size?: number }) {
  if (!hasPhoto) return <Initials name={name} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.accent }}>
      <Image
        source={{ uri: `${BASE_URL}/api/member-app/photo/${memberId}?v=${version}`, headers: authHeaders() }}
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="none"
        accessibilityLabel="Profile photo"
      />
    </View>
  );
}
