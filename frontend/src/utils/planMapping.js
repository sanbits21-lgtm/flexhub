// Mapping the plan names in an imported spreadsheet to the gym's own membership plans.
//
// A sheet rarely uses the gym's exact plan names ("Gold 3M", "1 yr", "Monthly pack"). Each distinct
// name in the file is therefore decided once, by the person importing: to one of the gym's plans, or to
// "no plan". Only an exact name match is decided for them, and it can be changed. Nothing else is guessed
// silently, because a plan on a member means a payment is recorded at that plan's price: a wrong guess
// would put wrong money in the books. A suggestion is offered; it is applied only when someone accepts it.
//
// Pure functions, no imports, so they can be tested without the browser.

/** The choice meaning "import these members without a plan". */
export const NO_PLAN = '__none__';

export const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** How long a plan name suggests it runs: "3 months", "Annual", "half yearly"... Defaults to monthly. */
export const guessDuration = (name) => {
  const n = norm(name);
  if (/year|annual|12\s*m|\byr\b/.test(n)) return n.includes('half') ? 'half_yearly' : 'yearly';
  if (/half|6\s*m|six/.test(n)) return 'half_yearly';
  if (/quarter|3\s*m|three/.test(n)) return 'quarterly';
  return 'monthly';
};

/** Case- and spacing-insensitive lookup by exact name. */
export const findPlan = (plans, name) => {
  const n = norm(name);
  return n ? plans.find((p) => norm(p.name) === n) || null : null;
};

/** Plans a branch may enrol members into: gym-wide ones (no branch) and that branch's own. */
export const plansForBranch = (plans, branchId) => plans.filter((p) => p.isActive !== false && (!p.branchId || String(p.branchId) === String(branchId)));

/**
 * The distinct plan names used in one column of the file, with how many rows use each, most used first.
 * Blank cells are not plans. Names that differ only in case or spacing are one name.
 */
export const listFilePlans = (rawRows, column) => {
  if (column < 0) return [];
  const seen = new Map();
  rawRows.forEach((row) => {
    const name = String(row[column] ?? '').trim();
    if (!name) return;
    const key = norm(name);
    const entry = seen.get(key);
    if (entry) entry.count += 1; else seen.set(key, { key, name, count: 1 });
  });
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** What is already decided: every file plan whose name is exactly one of the gym's plans. */
export const defaultPlanMap = (filePlans, plans) => {
  const map = {};
  filePlans.forEach((fp) => {
    const plan = findPlan(plans, fp.name);
    if (plan) map[fp.key] = plan._id;
  });
  return map;
};

/**
 * A plan worth suggesting for a name that matches none exactly, or null. Only a single clear
 * candidate is offered: one plan whose name is part of the file's name (or the reverse), else the one
 * plan of the length the name hints at. Two candidates means no suggestion.
 */
export const suggestPlan = (name, plans) => {
  const n = norm(name);
  if (!n) return null;
  const byName = plans.filter((p) => { const pn = norm(p.name); return pn && (n.includes(pn) || pn.includes(n)); });
  if (byName.length === 1) return byName[0];
  const unit = guessDuration(name);
  // Only when the name actually says a length: "Gold" guessing "monthly" is a guess about nothing.
  const says = /year|annual|12\s*m|\byr\b|half|6\s*m|six|quarter|3\s*m|three|month|1\s*m/.test(n);
  if (!says) return null;
  const byLength = plans.filter((p) => p.durationUnit === unit);
  return byLength.length === 1 ? byLength[0] : null;
};

/** The plan a row ends up with. `choice` wins; otherwise an exact name match; otherwise nothing. */
export const resolvePlan = ({ planName, planMap = {}, plans, batchPlanId }) => {
  const key = norm(planName);
  if (!key) return batchPlanId ? plans.find((p) => p._id === batchPlanId) || null : null; // no plan on the row: the batch plan, if any
  const chosen = planMap[key];
  if (chosen === NO_PLAN) return null;
  if (chosen) return plans.find((p) => p._id === chosen) || null;
  return findPlan(plans, planName);
};

/** File plans nobody has decided yet (no exact match, no choice). The import waits for these. */
export const undecidedPlans = (filePlans, planMap) => filePlans.filter((fp) => !planMap[fp.key]);

/** How many payments the import will record and their total, for rows that will actually be imported. */
export const paymentSummary = (rows, plans, isImported = () => true) => {
  const price = new Map(plans.map((p) => [p._id, Number(p.price) || 0]));
  let count = 0;
  let total = 0;
  rows.forEach((r, i) => {
    if (!r.membershipPlanId || !isImported(r, i)) return;
    count += 1;
    total += price.get(r.membershipPlanId) || 0;
  });
  return { count, total };
};
