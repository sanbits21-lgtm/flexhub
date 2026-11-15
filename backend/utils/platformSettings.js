const PlatformSettings = require('../models/PlatformSettings');
const { BadRequest } = require('./query');
const { cleanAddress } = require('./memberAppLink');

const envNumber = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

// What applies when the super-admin has not set a value.
const defaults = () => ({
  selfSignupEnabled: String(process.env.SELF_SIGNUP || 'on').toLowerCase() !== 'off',
  trialDays: envNumber('TRIAL_DAYS', 14),
  trialMaxMembers: envNumber('TRIAL_MAX_MEMBERS', 50),
  trialMaxBranches: envNumber('TRIAL_MAX_BRANCHES', 1),
  memberAppUrl: process.env.MEMBER_APP_URL || '',
  billingUpiId: process.env.BILLING_UPI_ID || '',
  billingPayeeName: process.env.BILLING_PAYEE_NAME || '',
  billingGstPercent: 0,
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
  if (input.memberAppUrl !== undefined) set.memberAppUrl = cleanAddress(input.memberAppUrl, { template: true });
  if (input.billingUpiId !== undefined) {
    const upi = String(input.billingUpiId).trim();
    if (upi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) throw new BadRequest('The UPI ID must look like name@bank.');
    set.billingUpiId = upi;
  }
  if (input.billingPayeeName !== undefined) {
    const name = String(input.billingPayeeName).trim();
    if (name.length > 60) throw new BadRequest('The payee name must be 60 characters or fewer.');
    set.billingPayeeName = name;
  }
  if (input.billingGstPercent !== undefined) {
    const gst = Number(input.billingGstPercent);
    if (!Number.isFinite(gst) || gst < 0 || gst > 28) throw new BadRequest('GST must be between 0 and 28 percent.');
    set.billingGstPercent = gst;
  }
  await PlatformSettings.updateOne({ key: 'main' }, { $set: { ...set, updatedBy: userId } }, { upsert: true });
  return getSettings();
};

module.exports = { getSettings, updateSettings, defaults, whole };
