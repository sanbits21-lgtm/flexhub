const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, create, cancel, markAttended, markNoShow,
} = require('../controllers/bookingController');

router.use(protect, scopeContext, attachFeatures, requireFeature('pages:classes'));
router.get('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), list);
router.post('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), enforceWriteScope, validate(schemas.bookingCreate), create);
router.post('/:id/cancel', requireRole('tenant-admin', 'branch-manager', 'trainer'), cancel);
router.post('/:id/attended', requireRole('tenant-admin', 'branch-manager', 'trainer'), markAttended);
router.post('/:id/no-show', requireRole('tenant-admin', 'branch-manager', 'trainer'), markNoShow);

module.exports = router;
