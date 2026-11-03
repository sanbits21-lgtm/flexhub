const { addPlanDuration } = require('../utils/planDuration');

// Local-time dates, matching how the helper (and the app) reason about calendar days.
const d = (y, m, day, h = 10) => new Date(y, m - 1, day, h, 30);
const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe('addPlanDuration', () => {
  it('keeps the same day of month when it exists', () => {
    expect(ymd(addPlanDuration(d(2026, 1, 15), 'monthly'))).toEqual([2026, 2, 15]);
    expect(ymd(addPlanDuration(d(2026, 1, 15), 'quarterly'))).toEqual([2026, 4, 15]);
    expect(ymd(addPlanDuration(d(2026, 1, 15), 'half_yearly'))).toEqual([2026, 7, 15]);
    expect(ymd(addPlanDuration(d(2026, 1, 15), 'yearly'))).toEqual([2027, 1, 15]);
  });

  it('clamps to the last day instead of rolling into the next month', () => {
    expect(ymd(addPlanDuration(d(2026, 10, 31), 'monthly'))).toEqual([2026, 11, 30]);
    expect(ymd(addPlanDuration(d(2026, 1, 31), 'monthly'))).toEqual([2026, 2, 28]);
    expect(ymd(addPlanDuration(d(2028, 1, 31), 'monthly'))).toEqual([2028, 2, 29]); // leap year
    expect(ymd(addPlanDuration(d(2026, 8, 31), 'quarterly'))).toEqual([2026, 11, 30]);
    expect(ymd(addPlanDuration(d(2026, 8, 31), 'half_yearly'))).toEqual([2027, 2, 28]);
    expect(ymd(addPlanDuration(d(2028, 2, 29), 'yearly'))).toEqual([2029, 2, 28]);
  });

  it('crosses year boundaries', () => {
    expect(ymd(addPlanDuration(d(2026, 12, 31), 'monthly'))).toEqual([2027, 1, 31]);
    expect(ymd(addPlanDuration(d(2026, 11, 30), 'quarterly'))).toEqual([2027, 2, 28]);
  });

  it('keeps the time of day and does not mutate its input', () => {
    const start = d(2026, 10, 31, 17);
    const before = start.getTime();
    const end = addPlanDuration(start, 'monthly');
    expect([end.getHours(), end.getMinutes()]).toEqual([17, 30]);
    expect(start.getTime()).toBe(before);
  });
});
