import { useState } from 'react';
import { Text, View } from 'react-native';
import { PlanShell } from '../../components/PlanShell';
import { Card, Muted, Pill } from '../../components/ui';
import type { WorkoutPlan } from '../../lib/api';
import { colors } from '../../lib/theme';

export default function Workout() {
  const [days, setDays] = useState(3);
  return (
    <PlanShell<WorkoutPlan>
      type="workout"
      title="Workout"
      noun="workout plan"
      extra={{ days, setDays }}
      render={(plan) => (
        <>
          {plan.days.map((d) => (
            <Card key={d.day} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }}>{d.focus}</Text>
                <Pill label={d.day} tone="accent" />
              </View>
              {d.exercises.map((e, i) => (
                <View key={`${e.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ minWidth: 64, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface2 }}>
                    <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }}>{e.sets} x {e.reps}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{e.name}</Text>
                    <Muted>{[e.equipment, e.restSec ? `rest ${e.restSec}s` : '', e.notes].filter(Boolean).join(' | ')}</Muted>
                  </View>
                </View>
              ))}
            </Card>
          ))}
          {plan.notes.length > 0 && (
            <Card>
              <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 6 }}>Good to know</Text>
              {plan.notes.map((n) => <Muted key={n}>{`- ${n}`}</Muted>)}
            </Card>
          )}
        </>
      )}
    />
  );
}
