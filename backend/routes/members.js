const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, getOne, getProgress, getMe, create, bulkCreate, update, remove, renew, addBodyMetric,
} = require('../controllers/memberController');

router.use(protect, scopeContext, attachFeatures);

// Member's own self-service routes (must precede the ':id' routes below).
router.get('/me', getMe);

router.get('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), list);
router.get('/:id', getOne);
router.get('/:id/progress', getProgress);
// enforceWriteScope runs before validate so the schema sees the server-stamped
// branchId/tenantId, not whatever the client claimed.
router.post('/', requireRole('tenant-admin', 'branch-manager'), enforceWriteScope, validate(schemas.memberCreate), create);
router.post('/bulk', requireRole('tenant-admin', 'branch-manager'), requireFeature('features:bulkUpload'), enforceWriteScope, bulkCreate);
router.put('/:id', requireRole('tenant-admin', 'branch-manager'), enforceWriteScope, validate(schemas.memberUpdate), update);
router.delete('/:id', requireRole('tenant-admin', 'branch-manager'), remove);
router.post('/:id/renew', requireRole('tenant-admin', 'branch-manager'), validate(schemas.memberRenew), renew);
router.post('/:id/body-metrics', requireRole('branch-manager', 'trainer'), addBodyMetric);

module.exports = router;
