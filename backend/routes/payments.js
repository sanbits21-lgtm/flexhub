const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, getForMember, create, update,
} = require('../controllers/memberPaymentController');

router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'));
router.get('/', list);
router.get('/member/:id', getForMember);
router.post('/', enforceWriteScope, validate(schemas.paymentCreate), create);
// tenant-admin included: settling a pending payment or issuing a refund is a
// finance action, and a tenant-admin who isn't tied to one branch could previously
// do neither.
router.put('/:id', validate(schemas.paymentUpdate), update);

module.exports = router;
