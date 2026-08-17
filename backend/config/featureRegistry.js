// Single source of truth for what a platform-admin can toggle per tenant, via the
// Workspace pages (frontend/src/pages/platform/Workspace.jsx). Adding a new toggle is
// one entry here plus one gate point (see backend/middleware/features.js and
// backend/utils/features.js) — never a schema migration, since Tenant.features is a
// sparse Map keyed by these names.
//
// `default: true` means every existing tenant behaves exactly as it does today until a
// platform-admin explicitly flips something off.
const FEATURE_REGISTRY = {
  'pages:reports': {
    label: 'Reports',
    description: 'Plan mix, attendance trend and equipment health reports (/reports).',
    category: 'page',
    default: true,
  },
  'pages:trainerReport': {
    label: 'Trainer Collections & Salary',
    description: 'Per-trainer collections and salary figures (/trainer-report). Exposes salary — worth gating separately.',
    category: 'page',
    default: true,
  },
  'pages:paymentSettings': {
    label: 'Payment Settings (UPI)',
    description: "Tenant's own UPI ID / payment link configuration (/payment-settings).",
    category: 'page',
    default: true,
  },
  'pages:attendance': {
    label: 'Attendance',
    description: 'Attendance tracking and manual/self check-in and check-out (/attendance).',
    category: 'page',
    default: true,
  },
  'pages:equipment': {
    label: 'Equipment Management',
    description: 'Equipment inventory and maintenance tracking (/equipment).',
    category: 'page',
    default: true,
  },
  'features:bulkUpload': {
    label: 'Bulk Member Upload',
    description: 'CSV/XLSX member import on the Members page.',
    category: 'feature',
    default: true,
  },
  'features:upiPayments': {
    label: 'UPI Payment Collection',
    description: 'QR/deep-link UPI collection in Add Member, Renewal, and manual payment recording.',
    category: 'feature',
    default: true,
  },
  'features:paymentRefunds': {
    label: 'Payment Refunds',
    description: 'Refund action on the Payments page.',
    category: 'feature',
    default: true,
  },
  'features:trainerAssignment': {
    label: 'Trainer Assignment',
    description: 'Assigning a trainer to a member on add/edit.',
    category: 'feature',
    default: true,
  },
  'fields:memberPersonalDetails': {
    label: 'Member Personal & Emergency Details',
    description: 'Date of birth, gender and emergency contact fields on the member form.',
    category: 'field',
    default: true,
  },
};

module.exports = { FEATURE_REGISTRY };
