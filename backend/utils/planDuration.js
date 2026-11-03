const DURATION_UNITS = ['monthly', 'quarterly', 'half_yearly', 'yearly'];

const UNIT_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

// Calendar-month addition (not a fixed day count), so a monthly plan started on the
// 15th always ends on the 15th of the following month, regardless of month length.
//
// When the target month is shorter than the start day (31 Oct + 1 month, 29-31 Jan + 1
// month, 29 Feb + 1 year) the end is clamped to that month's last day. Plain
// setMonth() would overflow instead: "31 Nov" becomes 1 Dec, handing the member an
// extra month, and a 31 Jan monthly plan would end in March.
const addMonthsClamped = (date, months) => {
  const out = new Date(date);
  const day = out.getDate();
  out.setDate(1); // park on a day every month has, so setMonth cannot overflow
  out.setMonth(out.getMonth() + months);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
};

const addPlanDuration = (startDate, durationUnit) => addMonthsClamped(startDate, UNIT_MONTHS[durationUnit]);

module.exports = { DURATION_UNITS, UNIT_MONTHS, addPlanDuration };
