import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row, Sheet } from './ui';
import { useBranch } from '../lib/branch';
import { colors, radius } from '../lib/theme';

/**
 * Branch switcher for a gym owner. One pill showing what you are looking at; tap it for a
 * scrollable list of every branch with its headline numbers. (A sideways chip strip hides
 * most branches once a gym has more than two or three.) Everything in the app that is
 * scoped to a branch follows this choice.
 */
export function BranchBar() {
  const { branches, stats, branchId, setBranchId, branchName } = useBranch();
  const [open, setOpen] = useState(false);
  if (branches.length < 2) return null;

  const pick = (id: string) => { setBranchId(id); setOpen(false); };
  const total = Object.values(stats).reduce((s, b) => s + b.activeMembers, 0);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose a branch"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: branchId ? colors.accent : colors.line, borderRadius: radius.pill, paddingVertical: 12, minHeight: 44, paddingHorizontal: 14, opacity: pressed ? 0.8 : 1 })}>
        <Ionicons name="storefront" size={18} color={branchId ? colors.link : colors.muted} />
        <Text style={{ flex: 1, color: colors.ink, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{branchId ? branchName(branchId) : 'All branches'}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{branches.length} branches</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Choose a branch">
        <Row icon="albums" tone={branchId === '' ? 'accent' : undefined} title="All branches" subtitle={total ? `${total} active members in total` : undefined}
          right={branchId === '' ? <Ionicons name="checkmark-circle" size={22} color={colors.link} /> : <View />} onPress={() => pick('')} last={false} />
        {branches.map((b, i) => {
          const s = stats[b._id];
          const on = b._id === branchId;
          return (
            <Row key={b._id} icon="storefront" tone={on ? 'accent' : undefined} title={b.name}
              subtitle={s ? `${s.activeMembers} active | ${s.trainerCount} trainers | ${s.equipmentCount} equipment` : b.phone}
              right={on ? <Ionicons name="checkmark-circle" size={22} color={colors.link} /> : <View />} onPress={() => pick(b._id)} last={i === branches.length - 1} />
          );
        })}
      </Sheet>
    </>
  );
}
