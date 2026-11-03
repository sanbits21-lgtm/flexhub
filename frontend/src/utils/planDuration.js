export const DURATION_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

// Mirrors backend/utils/planDuration.js so the end date previewed in the form is the one
// the server will store: the same day next month, clamped to the last day when that
// month is shorter (31 Oct + 1 month = 30 Nov, not 1 Dec). Works on a 'YYYY-MM-DD' string
// in UTC so the browser's timezone cannot shift the day.
export const addPlanMonths = (isoDate, durationUnit) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const target = m - 1 + DURATION_MONTHS[durationUnit];
  const lastDay = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, target, Math.min(d, lastDay))).toISOString().slice(0, 10);
};
