const { getSettings, updateSettings } = require('../utils/platformSettings');
const { logAudit } = require('../utils/audit');

exports.get = async (req, res) => res.json(await getSettings());

exports.update = async (req, res) => {
  const before = await getSettings();
  const after = await updateSettings(req.body || {}, req.user._id);
  const changed = Object.fromEntries(Object.keys(after).filter((k) => before[k] !== after[k]).map((k) => [k, { from: before[k], to: after[k] }]));
  logAudit(req, 'UPDATE_PLATFORM_SETTINGS', { metadata: { changed } });
  res.json(after);
};
