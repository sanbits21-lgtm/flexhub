const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, create, update, remove,
} = require('../controllers/classTypeController');

router.use(protect, scopeContext, attachFeatures, requireFeature('pages:classes'));
router.get('/', requireRole('tenant-admin', 'branch-manager', 'trainer'), list);
router.post('/', requireRole('tenant-admin', 'branch-manager'), enforceWriteScope, validate(schemas.classTypeCreate), create);
router.put('/:id', requireRole('tenant-admin', 'branch-manager'), enforceWriteScope, update);
router.delete('/:id', requireRole('tenant-admin', 'branch-manager'), remove);

module.exports = router;
