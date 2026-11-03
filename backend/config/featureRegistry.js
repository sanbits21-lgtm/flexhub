// Single source of truth for what a platform-admin can toggle per tenant, via the
// Workspace pages (frontend/src/pages/platform/Workspace.jsx). Adding a new toggle is
// one entry here plus one gate point (see backend/middleware/features.js and
// backend/utils/features.js) — never a schema migration, since Tenant.features is a
// sparse Map keyed by these names.
//
// `default: true` means every existing tenant behaves exactly as it does today until a
// platform-admin explicitly flips something off.
const FEATURE_REGISTRY = {
  'features:branding': {
    label: 'Gym branding',
    description: "Lets the tenant admin set their gym's logo, accent colour and tagline (shown on their login page and website).",
    category: 'feature',
    default: true,
  },
  'features:customSubdomain': {
    label: 'Choose own subdomain',
    description: "Lets the tenant admin change their gym's web address (name.yourdomain.com). Platform admins can always change it.",
    category: 'feature',
    default: false,
  },
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
  'pages:classes': {
    label: 'Class Scheduling & Booking',
    description: 'Class timetable, recurring session scheduling, and staff-driven member booking/attendance (/classes, /schedule).',
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
  'features:personalTraining': {
    label: 'Personal Training Sessions',
    description: 'Trainers and managers scheduling one-to-one sessions with members (staff app and member app).',
    category: 'feature',
    default: true,
  },
  'features:aiPlans': {
    label: 'AI Workout & Diet Suggestions',
    description: 'Member app plans written by an external AI model from the member profile (no name or contact details are sent). Off = built-in rule-based plans only; nothing leaves the server.',
    category: 'feature',
    default: true,
  },
  // New, opt-in capabilities: off until a platform admin switches them on for a gym
  // (Workspace page), because each one changes what members or staff see.
  'features:qrCheckIn': {
    label: 'QR member pass & desk scanner',
    description: 'Members show a short-lived QR pass in the app; the front desk scans it to check them in or out. Self check-in from a phone is always off, with or without this.',
    category: 'feature',
    default: false,
  },
  'features:whatsappReminders': {
    label: 'WhatsApp renewal reminders',
    description: 'A one-tap "remind on WhatsApp" button for expiring and expired members in the staff app. Opens WhatsApp with a ready-made message; nothing is sent automatically.',
    category: 'feature',
    default: false,
  },
  'features:memberPayments': {
    label: 'Payment history in the member app',
    description: 'Members can see their own payments and receipts in the app.',
    category: 'feature',
    default: false,
  },
  'rules:blockExpiredCheckIn': {
    label: 'Block check-in for expired memberships',
    description: 'On: members with an expired, frozen, cancelled or missing plan cannot be checked in. Off: for gyms that allow a grace period, any active member can check in. Deactivated members are always blocked.',
    category: 'rule',
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
