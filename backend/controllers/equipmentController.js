const Equipment = require('../models/Equipment');
const Branch = require('../models/Branch');
const Expense = require('../models/Expense');
const { logAudit } = require('../utils/audit');
const { sendList } = require('../utils/paginate');

const stripUnscoped = (req) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  delete filter.memberId;
  return filter;
};

exports.list = async (req, res) => {
  await sendList(res, req, Equipment, stripUnscoped(req));
};

exports.maintenanceDue = async (req, res) => {
  const filter = { ...stripUnscoped(req), nextServiceDue: { $lte: new Date() } };
  const equipment = await Equipment.find(filter).sort({ nextServiceDue: 1 });
  res.json(equipment);
};

exports.create = async (req, res) => {
  const { name, category, purchaseDate, warrantyExpiry, lastServicedAt, nextServiceDue, notes } = req.body;

  // Branch-manager's own branch is stamped by enforceWriteScope; tenant-admin (who isn't
  // locked to one branch) must pick one, so validate it belongs to their tenant here —
  // same pattern as memberController.create.
  if (!req.body.branchId) return res.status(400).json({ message: 'branchId is required' });
  const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.body.tenantId });
  if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });

  const equipment = await Equipment.create({
    tenantId: req.body.tenantId, branchId: req.body.branchId,
    name, category, purchaseDate, warrantyExpiry, lastServicedAt, nextServiceDue, notes,
  });
  logAudit(req, 'CREATE_EQUIPMENT', { type: 'Equipment', id: equipment._id });
  res.status(201).json(equipment);
};

exports.update = async (req, res) => {
  const filter = { ...stripUnscoped(req), _id: req.params.id };
  const { name, category, purchaseDate, warrantyExpiry, status, lastServicedAt, nextServiceDue, notes } = req.body;
  const equipment = await Equipment.findOneAndUpdate(
    filter,
    { name, category, purchaseDate, warrantyExpiry, status, lastServicedAt, nextServiceDue, notes },
    { new: true }
  );
  if (!equipment) return res.status(404).json({ message: 'Equipment not found' });
  logAudit(req, 'UPDATE_EQUIPMENT', { type: 'Equipment', id: equipment._id });
  res.json(equipment);
};

// Logs a service visit: when it was done, what it cost, and when it is next due. The cost goes into the books as a
// maintenance expense (when expenses are switched on for the gym), tied to this equipment and its branch.
exports.logService = async (req, res) => {
  const equipment = await Equipment.findOne({ ...stripUnscoped(req), _id: req.params.id });
  if (!equipment) return res.status(404).json({ message: 'Equipment not found' });
  const b = req.body;
  const servicedAt = b.servicedAt ? new Date(b.servicedAt) : new Date();
  const next = b.nextServiceDue ? new Date(b.nextServiceDue) : null;
  if (Number.isNaN(servicedAt.getTime()) || (next && Number.isNaN(next.getTime()))) return res.status(400).json({ message: 'A date is not valid.' });
  equipment.lastServicedAt = servicedAt;
  if (b.nextServiceDue !== undefined) equipment.nextServiceDue = next || undefined;
  if (equipment.status === 'under_maintenance') equipment.status = 'operational';
  await equipment.save();

  const cost = Number(b.cost) || 0;
  let expense = null;
  if (cost > 0 && !(req.features && req.features['pages:expenses'] === false)) {
    expense = await Expense.create({
      tenantId: equipment.tenantId, branchId: equipment.branchId, category: 'maintenance', amount: cost, date: servicedAt,
      paidTo: b.vendor || undefined, method: 'cash', note: b.note || `Service: ${equipment.name}`, equipmentId: equipment._id, createdBy: req.user._id,
    });
  }
  logAudit(req, 'SERVICE_EQUIPMENT', { type: 'Equipment', id: equipment._id });
  res.json({ equipment, expense });
};

exports.remove = async (req, res) => {
  const filter = { ...stripUnscoped(req), _id: req.params.id };
  const equipment = await Equipment.findOneAndUpdate(filter, { status: 'retired' }, { new: true });
  if (!equipment) return res.status(404).json({ message: 'Equipment not found' });
  logAudit(req, 'RETIRE_EQUIPMENT', { type: 'Equipment', id: equipment._id });
  res.json({ message: 'Equipment retired' });
};
