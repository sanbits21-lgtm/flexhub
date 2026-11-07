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
// One ceiling for every rupee amount: a typo like 1000000000000000 must not reach the books.
const MAX_MONEY = 10_000_000;
const money = z.coerce.number().min(0, 'cannot be negative').max(MAX_MONEY, 'is too large');
const positiveMoney = money.refine((v) => v > 0, 'must be greater than zero');
// Digits with an optional leading + (or a bracketed area code) and common separators; 6 to 18 characters.
const phone = z.string().trim().regex(/^\+?[0-9(][0-9\s\-()]{5,17}$/, 'must be a valid phone number');
const personName = z.string().trim().min(1, 'is required').max(100, 'is too long');
const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 86400000);
// A date of birth must be a real past date; a membership start must be near today
// (the server derives the end date from it, so 1999 or 2099 would silently misdate a plan).
const pastDate = optionalDate.refine((v) => {
  if (!v) return true;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d <= new Date() && d >= yearsAgo(120);
}, 'must be a real date of birth in the past');
const nearDate = optionalDate.refine((v) => {
  if (!v) return true;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d >= yearsAgo(1) && d <= new Date(Date.now() + 366 * 86400000);
}, 'must be within a year of today');

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'netbanking', 'other'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const MEMBERSHIP_STATUSES = ['active', 'expired', 'frozen', 'cancelled'];
const DURATION_UNITS = ['monthly', 'quarterly', 'half_yearly', 'yearly'];
const CLASS_SESSION_STATUSES = ['scheduled', 'cancelled', 'completed'];

const schemas = {
  verifyEmail: z.object({ token: z.string().regex(/^[0-9a-f]{64}$/, 'is not valid') }).strict(),
  resendVerification: z.object({ email: z.string().trim().email('must be a valid email').max(120) }).strict(),
  signup: z.object({
    gymName: z.string().trim().min(2, 'must be at least 2 characters').max(60, 'is too long'),
    ownerName: personName,
    email: z.string().trim().email('must be a valid email').max(120),
    phone,
    password: z.string().min(8, 'must be at least 8 characters').max(72, 'must be 72 characters or fewer'),
    slug: z.string().trim().max(40).optional(),
    packageId: objectId.optional(),
    website: z.string().optional(),
  }).strict(),

  // A subscription package (super-admin). `maxMembers: null` means unlimited.
  packageSave: z.object({
    name: z.string().trim().min(2, 'must be at least 2 characters').max(40, 'is too long'),
    description: z.string().trim().max(200, 'is too long'),
    price: money,
    billingCycle: z.enum(['monthly', 'quarterly', 'yearly']),
    trialDays: z.coerce.number().int('must be a whole number').min(0).max(365),
    maxBranches: z.coerce.number().int('must be a whole number').min(1).max(100),
    maxMembers: z.coerce.number().int('must be a whole number').min(1).max(100000).nullable(),
    highlights: z.array(z.string().trim().min(1).max(80, 'is too long')).max(10, 'can have at most 10 lines'),
    isFeatured: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(1000),
  }).partial().strict(),

  login: z.object({
    email: z.string().email('must be a valid email'),
    password: z.string().min(1, 'is required'),
  }),

  memberCreate: z.object({
    name: personName,
    phone,
    email: z.string().email('must be a valid email').max(120).optional().or(z.literal('')),
    branchId: objectId,
    membershipPlanId: optionalObjectId,
    membershipStart: nearDate,
    assignedTrainerId: optionalObjectId,
    gender: z.enum(['male', 'female', 'other', 'prefer_not_say']).optional().or(z.literal('')),
    dob: pastDate,
  }).passthrough(),

  memberUpdate: z.object({
    name: personName.optional(),
    phone: phone.optional(),
    email: z.string().email('must be a valid email').max(120).optional().or(z.literal('')),
    dob: pastDate,
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
    amount: positiveMoney,
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
    name: personName,
    email: z.string().email('must be a valid email').max(120),
    phone,
    password: z.string().min(8, 'must be at least 8 characters').max(72, 'is too long'),
    role: z.enum(['branch-manager', 'trainer']).optional(),
    branchId: optionalObjectId,
    salary: z.coerce.number().min(0).optional().nullable(),
  }).passthrough(),

  equipmentCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    status: z.enum(['operational', 'under_maintenance', 'retired']).optional(),
  }).passthrough(),

  // A malformed UPI ID makes every payment QR useless, so refuse it here rather than at the counter.
  tenantSettingsUpdate: z.object({
    upiId: z.string().trim().regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, 'must look like name@bank').optional().or(z.literal('')),
    upiPaymentLink: z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>]+$/i, 'must be an https:// link').optional().or(z.literal('')),
  }).passthrough(),

  staffUpdate: z.object({
    salary: z.coerce.number().min(0, 'cannot be negative').max(MAX_MONEY, 'is too large').optional().nullable(),
  }).passthrough(),

  classTypeCreate: z.object({
    name: z.string().trim().min(1, 'is required'),
    description: optionalString,
    durationMinutes: z.coerce.number().int().min(1, 'must be at least 1 minute'),
    defaultCapacity: z.coerce.number().int().min(1, 'must be at least 1'),
    branchId: optionalObjectId,
  }).passthrough(),

  classSessionCreate: z.object({
    classTypeId: objectId,
    trainerId: optionalObjectId,
    startAt: z.union([z.string(), z.date()]),
    endAt: z.union([z.string(), z.date()]),
    capacity: z.coerce.number().int().min(1).optional().nullable(),
    notes: optionalString,
  }).passthrough(),

  classSessionUpdate: z.object({
    trainerId: optionalObjectId,
    startAt: z.union([z.string(), z.date()]).optional(),
    endAt: z.union([z.string(), z.date()]).optional(),
    capacity: z.coerce.number().int().min(1).optional().nullable(),
    notes: optionalString,
    status: z.enum(CLASS_SESSION_STATUSES).optional(),
  }).passthrough(),

  classSessionBatch: z.object({
    classTypeId: objectId,
    trainerId: optionalObjectId,
    startDate: z.string().min(1, 'is required'),
    endDate: z.string().min(1, 'is required'),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'select at least one day'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm'),
    durationMinutes: z.coerce.number().int().min(1).optional(),
    capacity: z.coerce.number().int().min(1).optional().nullable(),
  }).passthrough(),

  bookingCreate: z.object({
    classSessionId: objectId,
    memberId: objectId,
  }).passthrough(),
};

module.exports = { validate, schemas, z, MAX_MONEY };
