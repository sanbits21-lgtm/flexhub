import { Text, View } from 'react-native';
import { PlanShell } from '../../components/PlanShell';
import { Card, Muted, Stat, StatGrid } from '../../components/ui';
import type { DietPlan } from '../../lib/api';
import { colors } from '../../lib/theme';

export default function Diet() {
  return (
    <PlanShell<DietPlan>
      type="diet"
      title="Diet"
      noun="diet plan"
      render={(plan) => (
        <>
          <StatGrid>
            <Stat label="Calories / day" value={plan.caloriesTarget} tone="accent" />
            <Stat label="Protein / day" value={`${plan.proteinG} g`} />
          </StatGrid>
          {plan.meals.map((m) => (
            <Card key={m.name} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }}>{m.name}</Text>
                <Text style={{ color: colors.link, fontWeight: '700' }}>{m.calories} kcal</Text>
              </View>
              {m.items.map((item) => <Text key={item} style={{ color: colors.ink, fontSize: 15, paddingVertical: 2 }}>{`•  ${item}`}</Text>)}
            </Card>
          ))}
          {plan.tips.length > 0 && (
            <Card>
              <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 6 }}>Tips</Text>
              {plan.tips.map((t) => <Muted key={t}>{`- ${t}`}</Muted>)}
            </Card>
          )}
        </>
      )}
    />
  );
}
