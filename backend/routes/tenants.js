const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const {
  list, getOne, create, update, suspend, createTenantAdmin, getFeatures, updateFeatures,
} = require('../controllers/tenantController');

router.use(protect, scopeContext, requireRole('super-admin', 'platform-admin'));
router.get('/', list);
router.get('/:id', getOne);
router.post('/', validate(schemas.tenantCreate), create);
router.put('/:id', update);
router.patch('/:id/suspend', suspend);
router.post('/:id/tenant-admins', createTenantAdmin);
// Workspace — no additional role check needed, this whole router is already
// super-admin/platform-admin only.
router.get('/:id/features', getFeatures);
router.put('/:id/features', updateFeatures);

module.exports = router;

