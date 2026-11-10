const User = require('../models/User');
const { logAudit } = require('../utils/audit');
const { checkPhoto, storePhoto, removePhotoFile, sendPhoto } = require('../utils/photos');

const FOLDER = 'staff-photos';

// Your own picture: tenant-admin, branch-manager and trainer (the route allows only those).
exports.upload = async (req, res) => {
  const checked = checkPhoto(req.body && req.body.image);
  if (checked.message) return res.status(checked.status).json({ message: checked.message });
  const file = await storePhoto(FOLDER, req.user._id, checked.buf, checked.type);
  const user = await User.findById(req.user._id);
  const previous = user.photoUrl;
  user.photoUrl = file;
  await user.save();
  await removePhotoFile(FOLDER, previous);
  logAudit(req, 'STAFF_UPDATE_PHOTO', { type: 'User', id: user._id });
  res.json({ hasPhoto: true });
};

exports.remove = async (req, res) => {
  const user = await User.findById(req.user._id);
  const previous = user.photoUrl;
  user.photoUrl = undefined;
  await user.save();
  await removePhotoFile(FOLDER, previous);
  res.json({ hasPhoto: false });
};

// Served through the API, not a public folder: only you and the staff of the same gym can see it.
exports.get = async (req, res) => {
  const target = await User.findById(req.params.userId).select('photoUrl tenantId');
  if (!target || !target.photoUrl) return res.status(404).json({ message: 'No photo' });
  const sameGym = String(target.tenantId) === String(req.user.tenantId);
  if (!sameGym && !['super-admin', 'platform-admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  return sendPhoto(res, FOLDER, target.photoUrl);
};
