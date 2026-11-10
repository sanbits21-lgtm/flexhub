// Badges and the progress summary for the member app. Everything here is computed from data we
// already keep (check-ins and body measurements) each time it is asked for, so there is nothing to
// store, nothing to migrate, and a correction to a measurement corrects the badges with it.
// Pure functions: no database, no clock except the `now` they are given.

const DAY = 86400000;
const WEEK = 7 * DAY;

const round1 = (n) => Math.round(n * 10) / 10;

// Weeks start on Monday. Day 0 of the Unix epoch was a Thursday, so Monday is day 4.
const weekIndex = (d) => Math.floor((new Date(d).getTime() - 4 * DAY) / WEEK);

/** Longest run of consecutive weeks with a visit, and the run that is still alive now. */
const weekStreaks = (visitDates, now) => {
  const weeks = [...new Set(visitDates.map(weekIndex))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  weeks.forEach((w, i) => {
    run = i > 0 && w === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  // The current run counts if there was a visit this week or last (this week may not have happened yet).
  const set = new Set(weeks);
  const thisWeek = weekIndex(now);
  let w = set.has(thisWeek) ? thisWeek : thisWeek - 1;
  let current = 0;
  while (set.has(w)) { current += 1; w -= 1; }
  return { best, current };
};

const withWeight = (metrics) => metrics.filter((m) => Number.isFinite(m.weightKg));
const withFat = (metrics) => metrics.filter((m) => Number.isFinite(m.bodyFatPct));

/** Where the member started, where they are, and what changed. Entries must be oldest first. */
const summarize = (metrics) => {
  const weights = withWeight(metrics);
  const fats = withFat(metrics);
  const heightCm = [...metrics].reverse().find((m) => Number.isFinite(m.heightCm))?.heightCm ?? null;
  const first = weights[0];
  const last = weights[weights.length - 1];
  const fatFirst = fats[0];
  const fatLast = fats[fats.length - 1];
  return {
    startWeightKg: first ? first.weightKg : null,
    latestWeightKg: last ? last.weightKg : null,
    changeKg: first && last && first !== last ? round1(last.weightKg - first.weightKg) : null,
    startBodyFatPct: fatFirst ? fatFirst.bodyFatPct : null,
    latestBodyFatPct: fatLast ? fatLast.bodyFatPct : null,
    changeBodyFatPct: fatFirst && fatLast && fatFirst !== fatLast ? round1(fatLast.bodyFatPct - fatFirst.bodyFatPct) : null,
    heightCm,
    // Shown as a number only. Labelling it "healthy" or "overweight" is not this app's call.
    bmi: last && heightCm ? round1(last.weightKg / ((heightCm / 100) ** 2)) : null,
    entries: weights.length + fats.filter((f) => !Number.isFinite(f.weightKg)).length,
  };
};

const badge = (key, group, title, text, value, target, earnedAt = null) => ({
  key,
  group,
  title,
  text,
  earned: value >= target,
  earnedAt: value >= target ? earnedAt : null,
  progress: { value: Math.min(round1(value), target), target },
});

const VISITS = [1, 10, 25, 50, 100, 250];
const STREAKS = [4, 12, 26];
const MONTHS = [3, 6, 12];
const LOSS_KG = [2, 5, 10];
const GAIN_KG = [2, 5];
const FAT_POINTS = [2, 5];

/**
 * @param visitDates check-in times, oldest first
 * @param metrics    body measurements, oldest first
 * @param goal       the member's own goal (decides which weight badges apply)
 * @param joinedAt   when they joined
 */
const computeAchievements = ({ visitDates = [], metrics = [], goal = null, joinedAt = null, now = new Date() }) => {
  const out = [];
  const total = visitDates.length;

  VISITS.forEach((n) => out.push(badge(
    `visits-${n}`, 'Visits',
    n === 1 ? 'First visit' : `${n} visits`,
    n === 1 ? 'You walked through the door.' : `${n} times at the gym.`,
    total, n, visitDates[n - 1] || null,
  )));

  const streaks = weekStreaks(visitDates, now);
  STREAKS.forEach((n) => out.push(badge(`streak-${n}`, 'Consistency', `${n} weeks in a row`, `At least one visit every week for ${n} weeks.`, streaks.best, n)));

  const months = joinedAt ? Math.floor((now.getTime() - new Date(joinedAt).getTime()) / (30.44 * DAY)) : 0;
  MONTHS.forEach((n) => out.push(badge(`member-${n}`, 'Loyalty', n === 12 ? '1 year with us' : `${n} months with us`, 'Still showing up.', Math.max(months, 0), n)));

  const weights = withWeight(metrics);
  const spanDays = weights.length > 1 ? (new Date(weights[weights.length - 1].date) - new Date(weights[0].date)) / DAY : 0;
  out.push(badge('log-first', 'Tracking', 'First measurement', 'You logged your weight.', weights.length, 1, weights[0]?.date || null));
  out.push(badge('log-month', 'Tracking', 'Tracked for a month', 'Measurements spread over four weeks.', Math.floor(spanDays), 28));

  const first = weights[0];
  const last = weights[weights.length - 1];
  if (goal === 'lose_fat') {
    const lost = first && last ? Math.max(0, first.weightKg - last.weightKg) : 0;
    LOSS_KG.forEach((n) => out.push(badge(`lost-${n}`, 'Body', `Down ${n} kg`, `${n} kg lighter than when you started.`, lost, n)));
  } else if (goal === 'build_muscle') {
    const gained = first && last ? Math.max(0, last.weightKg - first.weightKg) : 0;
    GAIN_KG.forEach((n) => out.push(badge(`gained-${n}`, 'Body', `Up ${n} kg`, `${n} kg heavier than when you started.`, gained, n)));
  }

  const fats = withFat(metrics);
  if (fats.length) {
    const drop = Math.max(0, fats[0].bodyFatPct - fats[fats.length - 1].bodyFatPct);
    FAT_POINTS.forEach((n) => out.push(badge(`fat-${n}`, 'Body', `Body fat down ${n} points`, `${n} percentage points lower than when you started.`, drop, n)));
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    achievements: out,
    stats: {
      totalVisits: total,
      visitsThisMonth: visitDates.filter((d) => new Date(d) >= monthStart).length,
      bestStreakWeeks: streaks.best,
      currentStreakWeeks: streaks.current,
    },
  };
};

module.exports = { computeAchievements, summarize, weekIndex, weekStreaks };
