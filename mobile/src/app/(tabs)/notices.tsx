import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, LoadError, Loading, Muted, Pill, Screen } from '../../components/ui';
import { api, type NoticesResponse } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';

const KIND = { news: ['News', 'info'], offer: ['Offer', 'success'], notice: ['Notice', 'neutral'], reminder: ['Reminder', 'warn'] } as const;
const when = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// What the gym has told this member: news and offers from the owner or a branch manager, and the automatic renewal reminder.
export default function Notices() {
  const { data, error, loading, reload } = useLoad(() => api.get<NoticesResponse>('/member-app/notices'));
  const [busy, setBusy] = useState(false);

  const open = async (id: string, read: boolean, auto: boolean) => {
    if (read || auto) return;
    await api.post(`/member-app/notices/${id}/read`, {}).catch(() => null);
    void reload();
  };
  const readAll = async () => {
    setBusy(true);
    await api.post('/member-app/notices/read-all', {}).catch(() => null);
    await reload();
    setBusy(false);
  };

  if (loading) return <Screen title="Notices"><Loading /></Screen>;
  const items = data?.items ?? [];
  const unread = items.filter((i) => !i.read && !i.auto).length;

  return (
    <Screen title="Notices" subtitle={unread ? `${unread} new` : 'All caught up'} onRefresh={reload}>
      <LoadError message={error} onRetry={reload} />
      {unread > 0 && <Button title="Mark all read" kind="secondary" busy={busy} onPress={readAll} />}
      {items.length === 0 && !error && <EmptyState icon="notifications-outline" title="No notices" text="News and offers from your gym will show up here." />}
      {items.map((n) => {
        const [label, tone] = KIND[n.kind] ?? KIND.notice;
        const fresh = !n.read && !n.auto;
        return (
          <Card key={n.id} onPress={() => { void open(n.id, n.read, n.auto); }} style={fresh ? { borderColor: colors.accent } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pill label={label} tone={tone} />
              {!n.auto && <Muted>{when(n.at)}</Muted>}
            </View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 8 }}>{n.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{n.body}</Text>
            {n.link ? <Text onPress={() => { void Linking.openURL(n.link as string); }} style={{ color: colors.link, fontWeight: '700', marginTop: 8 }}>Open link</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
