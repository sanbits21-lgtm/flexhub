const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const { getMine, getMemberAppLink, getPaymentAccounts, updateBranchAccount, updateMine, getBranding, updateBranding, getMemberFields, createMemberField } = require('../controllers/tenantSettingsController');

router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'));
// GET is intentionally NOT gated by pages.paymentSettings: it's also how the Add
// Member/Renewal flow fetches the UPI ID to render the QR (gated separately by
// features.upiPayments, inline in memberPaymentController.js). Only editing the
// settings page itself is gated here.
router.get('/', getMine);
router.get('/member-app-link', getMemberAppLink);
// Per-branch UPI accounts (owner only; editing is behind the Payment Settings page flag).
router.get('/payment-accounts', requireRole('tenant-admin'), getPaymentAccounts);
router.put('/branches/:branchId/payment', requireRole('tenant-admin'), requireFeature('pages:paymentSettings'), validate(schemas.tenantSettingsUpdate), updateBranchAccount);
router.put('/', requireRole('tenant-admin'), requireFeature('pages:paymentSettings'), validate(schemas.tenantSettingsUpdate), updateMine);

// The gym's own member fields: staff read them (to fill and show them), only the owner adds.
router.get('/member-fields', getMemberFields);
router.post('/member-fields', requireRole('tenant-admin'), createMemberField);

// Branding / address: tenant-admin only, branding behind its own feature flag.
router.get('/branding', requireRole('tenant-admin'), requireFeature('features:branding'), getBranding);
router.put('/branding', requireRole('tenant-admin'), requireFeature('features:branding'), updateBranding);

module.exports = router;

