import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BranchBar } from '../../components/BranchBar';
import { Button, Card, EmptyState, Fab, Field, ListSkeleton, LoadError, Muted, Pill, Row, Screen } from '../../components/ui';
import { api, type MemberRow } from '../../lib/api';
import { useBranch } from '../../lib/branch';
import { expiryText } from '../../lib/format';
import { colors } from '../../lib/theme';
import { Choice } from '../../components/ui';

const FILTERS = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' }, { value: 'frozen', label: 'Frozen' }, { value: 'inactive', label: 'Deactivated' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];
const TONE = { active: 'success', expired: 'danger', frozen: 'warn', cancelled: 'danger' } as const;
const PAGE = 30;

export default function People() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { scoped, branchId } = useBranch();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A Home tile can deep-link here already filtered (Expiring / Expired).
  useEffect(() => { if (params.filter && FILTERS.some((f) => f.value === params.filter)) setFilter(params.filter as Filter); }, [params.filter]);
  // Debounce typing so each keystroke is not a request.
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const query = (p: number) => {
    const qs = [`page=${p}`, `limit=${PAGE}`];
    if (q) qs.push(`search=${encodeURIComponent(q)}`);
    if (filter === 'expiring') qs.push('expiringInDays=7');
    else if (filter === 'inactive') qs.push('includeInactive=true');
    else if (filter !== 'all') qs.push(`membershipStatus=${filter}`);
    return scoped(`/members?${qs.join('&')}`);
  };

  const load = async (p: number, replace: boolean) => {
    setLoading(true);
    try {
      const res = await api.get<{ members: MemberRow[]; total: number }>(query(p));
      const list = filter === 'inactive' ? res.members.filter((m) => !m.isActive) : res.members;
      setRows((prev) => (replace ? list : [...prev, ...list]));
      setTotal(res.total);
      setPage(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  };
  // Reload when the filters change AND every time this tab is shown again, so a member added,
  // edited or renewed on another screen appears without a manual pull-to-refresh.
  useFocusEffect(useCallback(() => { void load(1, true); }, [q, filter, branchId]));
  // Coming back from an add / edit / renew: refresh in place.
  const refresh = () => load(1, true);

  return (
    <Screen title="Members" subtitle={`${total} ${filter === 'all' ? 'in total' : 'shown'}`} onRefresh={refresh}
      fab={<Fab title="Add member" icon="person-add" onPress={() => router.push('/m/member-form')} />}>
      <BranchBar />
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name" autoCapitalize="none" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <Choice value={filter} options={FILTERS} onChange={setFilter} />
      </ScrollView>
      <LoadError message={error} onRetry={refresh} />

      {loading && rows.length === 0 && !error && <ListSkeleton />}
      {!loading && rows.length === 0 && !error && <Card><EmptyState icon="people-outline" title="No members found" text={q || filter !== 'all' ? 'Try a different search or filter.' : 'Tap Add member to enrol the first one.'} /></Card>}
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((m, i) => (
          <Row key={m._id} title={m.name} subtitle={`${m.memberCode.replace('GYM-', '')} | ${m.membershipEnd ? `${m.membershipStatus === 'expired' ? 'ended' : 'ends'} ${expiryText(m.membershipEnd)}` : 'no plan'}`}
            right={<Pill label={m.isActive ? m.membershipStatus : 'deactivated'} tone={m.isActive ? TONE[m.membershipStatus] : 'neutral'} />}
            onPress={() => router.push({ pathname: '/m/member/[id]', params: { id: m._id } })} last={i === rows.length - 1} />
        ))}
      </Card>
      {rows.length < total && <Button title={loading ? 'Loading...' : `Load more (${total - rows.length} left)`} kind="secondary" onPress={() => load(page + 1, false)} disabled={loading} />}
      <View style={{ height: 60 }} />
    </Screen>
  );
}
