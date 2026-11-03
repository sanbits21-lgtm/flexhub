import { Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Divider, Muted } from './ui';
import { cap, fmtDate, rupees } from '../lib/format';
import { colors } from '../lib/theme';

export type ReceiptData = { title: string; amount: number; status: string; memberName: string; invoice: string; method?: string; planName?: string; validUntil?: string; gym?: string };

export function Receipt({ r, onDone }: { r: ReceiptData; onDone: () => void }) {
  const paid = r.status === 'paid';
  const share = () => Share.share({
    message: `${r.gym ? `${r.gym}\n` : ''}Receipt ${r.invoice}\n${r.memberName}\n${r.planName ? `${r.planName}\n` : ''}${rupees(r.amount)} (${r.status}${r.method ? `, ${cap(r.method)}` : ''})${r.validUntil ? `\nValid until ${fmtDate(r.validUntil)}` : ''}`,
  }).catch(() => {});
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: paid ? colors.successSoft : colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={paid ? 'checkmark' : 'time'} size={34} color={paid ? colors.success : colors.warn} />
      </View>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>{r.title}</Text>
      <Text style={{ color: colors.ink, fontSize: 40, fontWeight: '800', letterSpacing: -1.2 }}>{rupees(r.amount)}</Text>
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
        <Divider />
        <Line k="Member" v={r.memberName} />
        {r.planName ? <Line k="Plan" v={r.planName} /> : null}
        {r.validUntil ? <Line k="Valid until" v={fmtDate(r.validUntil)} /> : null}
        {r.method ? <Line k="Method" v={cap(r.method)} /> : null}
        <Line k="Status" v={cap(r.status)} />
        <Line k="Invoice" v={r.invoice} />
        <Divider />
      </View>
      {!paid && <Muted>This is recorded as pending. Mark it paid from Payments once it arrives.</Muted>}
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
        <Button title="Share receipt" kind="secondary" icon="share-outline" onPress={share} />
        <Button title="Done" onPress={onDone} />
      </View>
    </Card>
  );
}

const Line = ({ k, v }: { k: string; v: string }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
    <Text style={{ color: colors.muted, fontSize: 14 }}>{k}</Text>
    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
  </View>
);
