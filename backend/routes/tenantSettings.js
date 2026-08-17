const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const { getMine, updateMine } = require('../controllers/tenantSettingsController');

router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'));
// GET is intentionally NOT gated by pages.paymentSettings: it's also how the Add
// Member/Renewal flow fetches the UPI ID to render the QR (gated separately by
// features.upiPayments, inline in memberPaymentController.js). Only editing the
// settings page itself is gated here.
router.get('/', getMine);
router.put('/', requireRole('tenant-admin'), requireFeature('pages:paymentSettings'), validate(schemas.tenantSettingsUpdate), updateMine);

module.exports = router;

