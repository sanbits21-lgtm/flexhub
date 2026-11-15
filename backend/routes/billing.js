const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/billingController');

// The gym owner buying or renewing a plan. Open to an owner whose trial or plan has ended (the write lock lets
// /api/billing through, otherwise they could never pay to get out of it).
router.use(protect, scopeContext, requireRole('tenant-admin'));
router.get('/', c.overview);
router.post('/orders', validate(schemas.billingOrder), c.createOrder);
router.get('/orders/:id', c.getOrder);
router.post('/orders/:id/submit', validate(schemas.billingSubmit), c.submit);
router.post('/orders/:id/cancel', c.cancelOrder);
router.get('/orders/:id/proof', c.getProof);

module.exports = router;
