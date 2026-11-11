import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Initials, Muted, Section } from './ui';
import { StarPicker, Stars } from './RatingStars';
import { api, type MyRating, type RatingsOverview } from '../lib/api';
import { colors } from '../lib/theme';

// Rating the gym and its trainers. Members see the gym's average only once enough people have
// rated; a trainer's score is private to the owner and branch manager, and so are all comments.

function RateForm({ label, initial, path, onDone, onCancel }: { label: string; initial: MyRating | null; path: string; onDone: () => void; onCancel: () => void }) {
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try { await fn(); onDone(); } catch (e) { setError(e instanceof Error ? e.message : fallback); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 12, paddingTop: 12 }}>
      <StarPicker label={label} value={stars} onChange={setStars} />
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={500} placeholder="What went well? What could be better?" hint="Only the owner and your branch manager can read this. It does not show your name." />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button small title="Save rating" busy={busy} disabled={stars === 0} onPress={() => void run(() => api.put(path, { stars, ...(comment.trim() ? { comment: comment.trim() } : {}) }), 'Could not save your rating.')} />
        <Button small kind="secondary" title="Cancel" disabled={busy} onPress={onCancel} />
        {initial ? <Button small kind="danger" title="Remove mine" disabled={busy} onPress={() => void run(() => api.delete(path), 'Could not remove your rating.')} /> : null}
      </View>
    </View>
  );
}

export function RatingsSection({ data, reload }: { data: RatingsOverview | null; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(null); // 'gym' or a trainer id
  if (!data) return null;
  const { gym, trainers, minPublic } = data;
  const done = () => { setOpen(null); reload(); };

  return (
    <>
      <Section title="Rate your gym" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            {gym.average !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Stars value={gym.average} />
                <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 16 }}>{gym.average}</Text>
                <Muted>({gym.count} members)</Muted>
              </View>
            ) : <Muted>The gym's score shows once {minPublic} members have rated.</Muted>}
          </View>
          {gym.canRate && open !== 'gym' ? <Button small kind="secondary" title={gym.mine ? 'Change' : 'Rate'} onPress={() => setOpen('gym')} /> : null}
        </View>
        {gym.mine && open !== 'gym' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}><Muted>Your rating</Muted><Stars value={gym.mine.stars} size={15} /></View> : null}
        {!gym.canRate ? <Muted style={{ marginTop: 8 }}>You can rate the gym after your first visit.</Muted> : null}
        {open === 'gym' ? <RateForm label="Rate the gym" initial={gym.mine} path="/member-app/ratings/gym" onDone={done} onCancel={() => setOpen(null)} /> : null}
      </Card>

      <Section title="Rate your trainers" />
      <Card>
        {trainers.length === 0 ? <Muted>No trainers listed yet.</Muted> : trainers.map((t, i) => (
          <View key={t._id} style={{ paddingVertical: 10, borderBottomWidth: i === trainers.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Initials name={t.name} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{t.name}</Text>
                {t.mine ? <Stars value={t.mine.stars} size={15} /> : <Muted>{t.canRate ? 'Not rated yet' : 'Rate a trainer who trains you'}</Muted>}
              </View>
              {t.canRate && open !== t._id ? <Button small kind="secondary" title={t.mine ? 'Change' : 'Rate'} onPress={() => setOpen(t._id)} /> : null}
            </View>
            {open === t._id ? <RateForm label={`Rate ${t.name}`} initial={t.mine} path={`/member-app/ratings/trainers/${t._id}`} onDone={done} onCancel={() => setOpen(null)} /> : null}
          </View>
        ))}
        <Muted style={{ marginTop: 8 }}>Trainer ratings are private: only the owner and your branch manager see them.</Muted>
      </Card>
    </>
  );
}
