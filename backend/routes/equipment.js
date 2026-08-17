const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, maintenanceDue, create, update, remove,
} = require('../controllers/equipmentController');

router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'), requireFeature('pages:equipment'));
router.get('/', list);
router.get('/maintenance-due', maintenanceDue);
router.post('/', enforceWriteScope, validate(schemas.equipmentCreate), create);
router.put('/:id', enforceWriteScope, update);
router.delete('/:id', remove);

module.exports = router;

