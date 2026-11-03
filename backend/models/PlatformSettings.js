const mongoose = require('mongoose');

// One document for the whole installation, edited by the super-admin in the website.
// A field left unset falls back to its environment default (see utils/platformSettings.js),
// so a fresh install behaves sensibly before anyone opens the settings page.
const platformSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  selfSignupEnabled: { type: Boolean },
  trialDays: { type: Number, min: 1, max: 365 },
  trialMaxMembers: { type: Number, min: 1, max: 100000 },
  trialMaxBranches: { type: Number, min: 1, max: 100 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
