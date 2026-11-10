const { computeAchievements, summarize, weekIndex, weekStreaks } = require('../utils/achievements');

const DAY = 86400000;
const now = new Date('2026-11-11T10:00:00Z'); // a Wednesday
const daysAgo = (n) => new Date(now.getTime() - n * DAY);
const byKey = (r) => Object.fromEntries(r.achievements.map((a) => [a.key, a]));

describe('weeks and streaks', () => {
  it('start weeks on Monday', () => {
    expect(weekIndex('2026-11-09T00:00:00Z')).toBe(weekIndex('2026-11-15T23:59:00Z')); // Mon and the Sunday after
    expect(weekIndex('2026-11-16T00:00:00Z')).toBe(weekIndex('2026-11-09T00:00:00Z') + 1);
  });

  it('count the longest run and the run still alive', () => {
    // visits in 4 consecutive weeks, then a gap, then this week
    const visits = [daysAgo(60), daysAgo(53), daysAgo(46), daysAgo(39), daysAgo(1)];
    const s = weekStreaks(visits, now);
    expect(s.best).toBe(4);
    expect(s.current).toBe(1);
  });

  it('keep the run alive when this week has no visit yet but last week did', () => {
    expect(weekStreaks([daysAgo(8), daysAgo(15)], now).current).toBe(2);
    expect(weekStreaks([daysAgo(30)], now).current).toBe(0);
  });
});

describe('visit and loyalty badges', () => {
  it('earn at the milestone and show how far off the next one is', () => {
    const visits = Array.from({ length: 12 }, (_, i) => daysAgo(40 - i));
    const r = byKey(computeAchievements({ visitDates: visits, now, joinedAt: daysAgo(100) }));
    expect(r['visits-1'].earned).toBe(true);
    expect(r['visits-10'].earned).toBe(true);
    expect(r['visits-25'].earned).toBe(false);
    expect(r['visits-25'].progress).toEqual({ value: 12, target: 25 });
    expect(r['member-3'].earned).toBe(true);
    expect(r['member-6'].earned).toBe(false);
  });

  it('date a visit badge by the visit that earned it', () => {
    const visits = [daysAgo(5), daysAgo(4)];
    expect(byKey(computeAchievements({ visitDates: visits, now }))['visits-1'].earnedAt).toEqual(visits[0]);
  });

  it('count this month\'s visits', () => {
    const r = computeAchievements({ visitDates: [new Date('2026-10-30T10:00:00Z'), new Date('2026-11-02T10:00:00Z'), new Date('2026-11-10T10:00:00Z')], now });
    expect(r.stats).toMatchObject({ totalVisits: 3, visitsThisMonth: 2 });
  });
});

describe('body badges', () => {
  const metrics = (...weights) => weights.map((w, i) => ({ date: daysAgo((weights.length - i) * 20), weightKg: w }));

  it('use the goal: weight loss badges only for someone losing fat', () => {
    const m = metrics(82, 80, 77);
    const lose = byKey(computeAchievements({ metrics: m, goal: 'lose_fat', now }));
    expect(lose['lost-2'].earned).toBe(true);
    expect(lose['lost-5'].earned).toBe(true);
    expect(lose['lost-10'].earned).toBe(false);
    expect(lose['gained-2']).toBeUndefined();
    const stay = byKey(computeAchievements({ metrics: m, goal: 'stay_fit', now }));
    expect(Object.keys(stay).some((k) => k.startsWith('lost-') || k.startsWith('gained-'))).toBe(false);
  });

  it('use weight gain for someone building muscle', () => {
    const r = byKey(computeAchievements({ metrics: metrics(70, 72.5), goal: 'build_muscle', now }));
    expect(r['gained-2'].earned).toBe(true);
    expect(r['gained-5'].earned).toBe(false);
    expect(r['lost-2']).toBeUndefined();
  });

  it('do not count a weight change in the wrong direction', () => {
    const r = byKey(computeAchievements({ metrics: metrics(70, 75), goal: 'lose_fat', now }));
    expect(r['lost-2'].earned).toBe(false);
    expect(r['lost-2'].progress.value).toBe(0);
  });

  it('track body fat and the tracking habit', () => {
    const m = [
      { date: daysAgo(40), weightKg: 80, bodyFatPct: 24 },
      { date: daysAgo(1), weightKg: 79, bodyFatPct: 21.5 },
    ];
    const r = byKey(computeAchievements({ metrics: m, now }));
    expect(r['fat-2'].earned).toBe(true);
    expect(r['fat-5'].earned).toBe(false);
    expect(r['log-first'].earned).toBe(true);
    expect(r['log-month'].earned).toBe(true);
  });

  it('show no body badges when nothing was measured', () => {
    const r = byKey(computeAchievements({ goal: 'lose_fat', now }));
    expect(r['log-first'].earned).toBe(false);
    expect(r['lost-2'].earned).toBe(false);
    expect(r['fat-2']).toBeUndefined();
  });
});

describe('the progress summary', () => {
  it('reports the change since the first weight, and a BMI number without judging it', () => {
    const s = summarize([
      { date: daysAgo(30), weightKg: 85, heightCm: 175 },
      { date: daysAgo(10), bodyFatPct: 25 },
      { date: daysAgo(1), weightKg: 82, bodyFatPct: 23 },
    ]);
    expect(s).toMatchObject({ startWeightKg: 85, latestWeightKg: 82, changeKg: -3, startBodyFatPct: 25, latestBodyFatPct: 23, changeBodyFatPct: -2, heightCm: 175, bmi: 26.8 });
  });

  it('has no change with a single reading, and no BMI without a height', () => {
    const s = summarize([{ date: daysAgo(1), weightKg: 70 }]);
    expect(s.changeKg).toBeNull();
    expect(s.bmi).toBeNull();
  });
});
