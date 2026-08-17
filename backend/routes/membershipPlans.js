const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const {
  list, create, update, remove,
} = require('../controllers/membershipPlanController');

router.use(protect, scopeContext, requireRole('tenant-admin', 'branch-manager'));
router.get('/', list);
router.post('/', requireRole('tenant-admin'), validate(schemas.planCreate), create);
router.put('/:id', requireRole('tenant-admin'), update);
router.delete('/:id', requireRole('tenant-admin'), remove);

module.exports = router;

