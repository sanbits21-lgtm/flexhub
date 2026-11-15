const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/billingAdminController');

// Platform staff confirming gyms' payments. A platform admin with managed gyms only sees those (scopeContext).
router.use(protect, scopeContext, requireRole('super-admin', 'platform-admin'));
router.get('/orders', c.list);
router.get('/orders/:id/proof', c.getProof);
router.post('/orders/:id/approve', validate(schemas.billingApprove), c.approve);
router.post('/orders/:id/reject', validate(schemas.billingReject), c.reject);

module.exports = router;
