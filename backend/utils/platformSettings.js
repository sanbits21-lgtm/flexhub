const PlatformSettings = require('../models/PlatformSettings');
const { BadRequest } = require('./query');

const envNumber = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

// What applies when the super-admin has not set a value.
const defaults = () => ({
  selfSignupEnabled: String(process.env.SELF_SIGNUP || 'on').toLowerCase() !== 'off',
  trialDays: envNumber('TRIAL_DAYS', 14),
  trialMaxMembers: envNumber('TRIAL_MAX_MEMBERS', 50),
  trialMaxBranches: envNumber('TRIAL_MAX_BRANCHES', 1),
});

/** The settings in force: stored values over environment defaults. */
const getSettings = async () => {
  const doc = await PlatformSettings.findOne({ key: 'main' }).lean();
  const base = defaults();
  const out = { ...base };
  for (const k of Object.keys(base)) if (doc && doc[k] !== undefined && doc[k] !== null) out[k] = doc[k];
  return out;
};

const whole = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
};

/** Validates and stores changes; only the keys given are touched. */
const updateSettings = async (input, userId) => {
  const set = {};
  if (input.selfSignupEnabled !== undefined) set.selfSignupEnabled = !!input.selfSignupEnabled;
  if (input.trialDays !== undefined) set.trialDays = whole(input.trialDays, 'Trial length', 1, 365);
  if (input.trialMaxMembers !== undefined) set.trialMaxMembers = whole(input.trialMaxMembers, 'Trial member limit', 1, 100000);
  if (input.trialMaxBranches !== undefined) set.trialMaxBranches = whole(input.trialMaxBranches, 'Trial branch limit', 1, 100);
  await PlatformSettings.updateOne({ key: 'main' }, { $set: { ...set, updatedBy: userId } }, { upsert: true });
  return getSettings();
};

module.exports = { getSettings, updateSettings, defaults, whole };
