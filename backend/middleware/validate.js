const { z } = require('zod');

// Centralized request-body validation. Controllers previously hand-checked whatever
// they happened to think of, so coverage was uneven and bad input surfaced as either a
// raw Mongo error or a 500. This runs before the controller and returns a single 400
// listing every offending field.
//
// It validates shape only — ownership/scoping checks (does this plan belong to my
// tenant?) stay in the controllers, where req.scope lives.
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    }));
    return res.status(400).json({ message: `Invalid request: ${errors.map((e) => `${e.field} ${e.message}`).join('; ')}`, errors });
  }
  // Replaces the body with the parsed value so unknown keys are stripped — a client
  // can't smuggle extra fields into a controller that spreads req.body.
  req.body = { ...req.body, ...result.data };
  next();
};

// An id reaches this point either as a JSON string from the client or as a real
// Mongoose ObjectId stamped by enforceWriteScope (which runs first), so both shapes
// have to be accepted — comparing the stringified value covers each.
const isObjectIdLike = (v) => /^[0-9a-fA-F]{24}$/.test(String(v ?? ''));
const objectId = z.custom(isObjectIdLike, { message: 'must be a valid id' });
// Optional fields arrive as '' from HTML forms far more often than as undefined.
const optionalString = z.string().trim().optional().or(z.literal(''));
const optionalObjectId = z.union([z.literal(''), z.null(), objectId]).optional();
const optionalDate = z.union([z.string(), z.date()]).optional().nullable().or(z.literal(''));
const money = z.coerce.number().min(0, 'cannot be negative');

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'netbanking', 'other'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const MEMBERSHIP_STATUSES = ['active', 'expired', 'frozen', 'cancelled'];
const DURATION_UNITS = ['monthly', 'quarterly', 'half_yearly', 'yearly'];

const schemas = {
  login: z.object({
    email: z.string().email('must be a valid email'),
    password: z.string().min(1, 'is required'),
  }),

  memberCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    phone: z.string().trim().min(1, 'is required'),
    email: z.string().email('must be a valid email').optional().or(z.literal('')),
    branchId: objectId,
    membershipPlanId: optionalObjectId,
    membershipStart: optionalDate,
    assignedTrainerId: optionalObjectId,
    gender: z.enum(['male', 'female', 'other', 'prefer_not_say']).optional().or(z.literal('')),
    dob: optionalDate,
  }).passthrough(),

  memberUpdate: z.object({
    name: z.string().trim().min(1, 'is required').optional(),
    phone: z.string().trim().min(1, 'is required').optional(),
    email: z.string().email('must be a valid email').optional().or(z.literal('')),
    membershipPlanId: optionalObjectId,
    membershipStatus: z.enum(MEMBERSHIP_STATUSES).optional(),
    assignedTrainerId: optionalObjectId,
    isActive: z.boolean().optional(),
  }).passthrough(),

  memberRenew: z.object({
    membershipPlanId: optionalObjectId,
    amount: money.optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
  }).passthrough(),

  paymentCreate: z.object({
    memberId: objectId,
    membershipPlanId: optionalObjectId,
    amount: money,
    method: z.enum(PAYMENT_METHODS).optional(),
    status: z.enum(PAYMENT_STATUSES).optional(),
  }).passthrough(),

  paymentUpdate: z.object({
    status: z.enum(PAYMENT_STATUSES),
    gatewayRef: optionalString,
  }).passthrough(),

  planCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    durationUnit: z.enum(DURATION_UNITS),
    price: money,
  }).passthrough(),

  tenantCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    slug: z.string().trim().min(1, 'is required'),
    contactEmail: z.string().email('must be a valid email'),
    maxBranches: z.coerce.number().int().min(1).optional(),
    admin: z.object({
      name: z.string().trim().min(1, 'is required'),
      email: z.string().email('must be a valid email'),
      phone: z.string().trim().min(1, 'is required'),
      password: z.string().min(8, 'must be at least 8 characters'),
    }),
  }).passthrough(),

  staffCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    email: z.string().email('must be a valid email'),
    phone: z.string().trim().min(1, 'is required'),
    password: z.string().min(8, 'must be at least 8 characters'),
    role: z.enum(['branch-manager', 'trainer']).optional(),
    branchId: optionalObjectId,
    salary: z.coerce.number().min(0).optional().nullable(),
  }).passthrough(),

  equipmentCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    status: z.enum(['operational', 'under_maintenance', 'retired']).optional(),
  }).passthrough(),

  tenantSettingsUpdate: z.object({
    upiId: optionalString,
    upiPaymentLink: optionalString,
  }).passthrough(),
};

module.exports = { validate, schemas, z };
