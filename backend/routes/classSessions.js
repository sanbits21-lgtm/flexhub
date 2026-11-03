const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, getOne, create, batchCreate, update,
} = require('../controllers/classSessionController');

router.use(protect, scopeContext, attachFeatures, requireFeature('pages:classes'));
router.get('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), list);
router.get('/:id', requireRole('tenant-admin', 'branch-manager', 'trainer'), getOne);
router.post('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), enforceWriteScope, validate(schemas.classSessionCreate), create);
router.post('/batch', requireRole('tenant-admin', 'branch-manager', 'trainer'), enforceWriteScope, validate(schemas.classSessionBatch), batchCreate);
router.put('/:id', requireRole('tenant-admin', 'branch-manager', 'trainer'), enforceWriteScope, validate(schemas.classSessionUpdate), update);

module.exports = router;
