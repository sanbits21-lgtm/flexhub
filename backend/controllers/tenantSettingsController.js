const Tenant = require('../models/Tenant');
const { logAudit } = require('../utils/audit');

// Read-only for branch-manager too (they need it to show the UPI QR when collecting a
// member's payment); only tenant-admin may change it — deliberately scoped to just these
// two fields, never the full Tenant document (billing/maxBranches stay platform-controlled).
exports.getMine = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(tenant);
};

exports.updateMine = async (req, res) => {
  const { upiId, upiPaymentLink } = req.body;
  const tenant = await Tenant.findByIdAndUpdate(
    req.scope.tenantId,
    { upiId: upiId || '', upiPaymentLink: upiPaymentLink || '' },
    { new: true }
  ).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  logAudit(req, 'UPDATE_TENANT_PAYMENT_SETTINGS', { type: 'Tenant', id: tenant._id });
  res.json(tenant);
};
