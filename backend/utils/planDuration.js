const DURATION_UNITS = ['monthly', 'quarterly', 'half_yearly', 'yearly'];

const UNIT_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

// Calendar-month addition (not a fixed day count), so a monthly plan started on the
// 15th always ends on the 15th of the following month, regardless of month length.
const addPlanDuration = (startDate, durationUnit) => {
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + UNIT_MONTHS[durationUnit]);
  return end;
};

module.exports = { DURATION_UNITS, UNIT_MONTHS, addPlanDuration };
