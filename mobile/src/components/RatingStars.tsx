import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

const STAR = '#F5A623'; // amber on both themes

/** Read-only stars, rounded to the nearest whole star. */
export function Stars({ value, size = 18 }: { value: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <View accessible accessibilityLabel={`${value} out of 5 stars`} style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= filled ? 'star' : 'star-outline'} size={size} color={n <= filled ? STAR : colors.faint} />)}
    </View>
  );
}

/** Five tappable stars. */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === n }}
          accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
          hitSlop={4}
          style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: n <= value ? colors.warnSoft : colors.surface2 }}
        >
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={26} color={n <= value ? STAR : colors.faint} />
        </Pressable>
      ))}
    </View>
  );
}
