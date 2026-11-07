const SubscriptionPackage = require('../models/SubscriptionPackage');
const Tenant = require('../models/Tenant');
const { logAudit } = require('../utils/audit');

// What the registration page may show: nothing internal, nothing about other gyms.
const PUBLIC_FIELDS = '_id name description price billingMonths trialDays maxBranches maxMembers highlights isFeatured';

const activePackages = () => SubscriptionPackage.find({ isActive: true }).sort({ sortOrder: 1, price: 1, createdAt: 1 }).select(PUBLIC_FIELDS).lean();

// Everything the super-admin edits, in one list, with how many gyms hold each package.
exports.list = async (req, res) => {
  const [packages, held] = await Promise.all([
    SubscriptionPackage.find().sort({ sortOrder: 1, price: 1, createdAt: 1 }).lean(),
    Tenant.aggregate([{ $match: { packageId: { $ne: null } } }, { $group: { _id: '$packageId', gyms: { $sum: 1 } } }]),
  ]);
  const count = new Map(held.map((h) => [String(h._id), h.gyms]));
  res.json(packages.map((p) => ({ ...p, gyms: count.get(String(p._id)) || 0 })));
};

exports.create = async (req, res) => {
  if (!req.body.name) return res.status(400).json({ message: 'Invalid request: name is required' });
  const { maxMembers, ...rest } = req.body;
  const pkg = await SubscriptionPackage.create(maxMembers === null ? rest : req.body); // null = unlimited = unset
  logAudit(req, 'CREATE_PACKAGE', { type: 'SubscriptionPackage', id: pkg._id, metadata: { name: pkg.name, price: pkg.price } });
  res.status(201).json(pkg);
};

exports.update = async (req, res) => {
  const { maxMembers, ...rest } = req.body;
  const update = { $set: rest };
  if (maxMembers === null) update.$unset = { maxMembers: 1 };
  else if (maxMembers !== undefined) update.$set.maxMembers = maxMembers;
  const pkg = await SubscriptionPackage.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!pkg) return res.status(404).json({ message: 'Package not found' });
  logAudit(req, 'UPDATE_PACKAGE', { type: 'SubscriptionPackage', id: pkg._id, metadata: { changed: Object.keys(req.body) } });
  res.json(pkg);
};

// A package that gyms registered for, or hold, is history: hide it instead of deleting it.
exports.remove = async (req, res) => {
  const pkg = await SubscriptionPackage.findById(req.params.id);
  if (!pkg) return res.status(404).json({ message: 'Package not found' });
  const inUse = await Tenant.countDocuments({ $or: [{ packageId: pkg._id }, { requestedPackageId: pkg._id }] });
  if (inUse) {
    return res.status(409).json({ message: `${inUse} gym${inUse === 1 ? ' is' : 's are'} on or waiting for this package. Hide it instead, so no new gym can choose it.` });
  }
  await pkg.deleteOne();
  logAudit(req, 'DELETE_PACKAGE', { type: 'SubscriptionPackage', id: pkg._id, metadata: { name: pkg.name } });
  res.json({ ok: true });
};

module.exports.activePackages = activePackages;
