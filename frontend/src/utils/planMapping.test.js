import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_PLAN, defaultPlanMap, findPlan, guessDuration, listFilePlans, paymentSummary, plansForBranch, resolvePlan, suggestPlan, undecidedPlans,
} from './planMapping.js';

const plans = [
  { _id: 'm', name: 'Monthly', durationUnit: 'monthly', price: 1000 },
  { _id: 'q', name: 'Quarterly', durationUnit: 'quarterly', price: 2700 },
  { _id: 'y', name: 'Yearly', durationUnit: 'yearly', price: 9000 },
  { _id: 'g', name: 'Gold', durationUnit: 'half_yearly', price: 5000, branchId: 'north' },
];

test('lists each distinct plan name once, whatever its case or spacing, most used first', () => {
  const rows = [['A', 'Gold 3M'], ['B', 'gold  3m'], ['C', 'Monthly'], ['D', ''], ['E', 'Gold 3M'], ['F', '  ']];
  assert.deepEqual(listFilePlans(rows, 1), [
    { key: 'gold 3m', name: 'Gold 3M', count: 3 },
    { key: 'monthly', name: 'Monthly', count: 1 },
  ]);
  assert.deepEqual(listFilePlans(rows, -1), []);
});

test('decides only exact name matches on its own', () => {
  const list = listFilePlans([['x', 'monthly'], ['y', 'Gold 3M'], ['z', ' YEARLY ']], 1);
  assert.deepEqual(defaultPlanMap(list, plans), { monthly: 'm', yearly: 'y' });
  assert.deepEqual(undecidedPlans(list, defaultPlanMap(list, plans)).map((p) => p.name), ['Gold 3M']);
});

test('guesses the length a name hints at', () => {
  assert.equal(guessDuration('3 months'), 'quarterly');
  assert.equal(guessDuration('Quarterly pack'), 'quarterly');
  assert.equal(guessDuration('Half yearly'), 'half_yearly');
  assert.equal(guessDuration('6M'), 'half_yearly');
  assert.equal(guessDuration('1 yr'), 'yearly');
  assert.equal(guessDuration('Annual'), 'yearly');
  assert.equal(guessDuration('whatever'), 'monthly');
});

test('suggests a plan only when exactly one is a clear candidate', () => {
  const open = plans.filter((p) => !p.branchId);
  assert.equal(suggestPlan('Quarterly Gold', open)?._id, 'q'); // a plan's name appears in it
  assert.equal(suggestPlan('3 months', open)?._id, 'q'); // the length says so, one plan has it
  assert.equal(suggestPlan('1 yr', open)?._id, 'y');
  assert.equal(suggestPlan('Platinum', open), null); // says nothing about length
  assert.equal(suggestPlan('', open), null);
  const twoMonthly = [...open, { _id: 'm2', name: 'Student', durationUnit: 'monthly', price: 800 }];
  assert.equal(suggestPlan('1 month', twoMonthly), null); // two monthly plans: no guess
});

test('a row\'s plan: a choice wins, then an exact name, and "no plan" means none even with a batch plan', () => {
  const base = { plans, batchPlanId: 'y' };
  assert.equal(resolvePlan({ ...base, planName: 'Gold 3M', planMap: { 'gold 3m': 'q' } })._id, 'q');
  assert.equal(resolvePlan({ ...base, planName: 'monthly', planMap: {} })._id, 'm'); // exact name
  assert.equal(resolvePlan({ ...base, planName: 'Gold 3M', planMap: { 'gold 3m': NO_PLAN } }), null);
  assert.equal(resolvePlan({ ...base, planName: 'Gold 3M', planMap: {} }), null); // undecided: nothing is guessed
  assert.equal(resolvePlan({ ...base, planName: '', planMap: {} })._id, 'y'); // a blank cell takes the batch plan
  assert.equal(resolvePlan({ plans, planName: '', planMap: {} }), null);
  assert.equal(resolvePlan({ ...base, planName: 'x', planMap: { x: 'gone' } }), null); // a plan that no longer exists
});

test('only offers plans a branch may use', () => {
  assert.deepEqual(plansForBranch(plans, 'south').map((p) => p._id), ['m', 'q', 'y']);
  assert.deepEqual(plansForBranch(plans, 'north').map((p) => p._id), ['m', 'q', 'y', 'g']);
  assert.deepEqual(plansForBranch([{ _id: 'o', name: 'Old', isActive: false }], 'north'), []);
});

test('finds a plan by exact name regardless of case and spacing', () => {
  assert.equal(findPlan(plans, '  MONTHLY ')?._id, 'm');
  assert.equal(findPlan(plans, 'Month'), null);
  assert.equal(findPlan(plans, ''), null);
});

test('summarises the payments an import will record, skipping rows that will not be imported', () => {
  const rows = [{ membershipPlanId: 'm' }, { membershipPlanId: 'q' }, { membershipPlanId: undefined }, { membershipPlanId: 'm' }];
  assert.deepEqual(paymentSummary(rows, plans), { count: 3, total: 4700 });
  assert.deepEqual(paymentSummary(rows, plans, (_r, i) => i !== 1), { count: 2, total: 2000 });
});
