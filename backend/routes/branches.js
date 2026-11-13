const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const {
  list, getOne, create, update, remove, createManager,
} = require('../controllers/branchController');

router.use(protect, scopeContext);
// Spelled out so that a member or a trainer is refused by the rule, not by their scope happening to match nothing.
const canSeeBranches = requireRole('super-admin', 'platform-admin', 'tenant-admin', 'branch-manager');
router.get('/', canSeeBranches, list);
router.get('/:id', canSeeBranches, getOne);
router.post('/', requireRole('tenant-admin'), enforceWriteScope, create);
router.put('/:id', requireRole('tenant-admin'), enforceWriteScope, update);
router.delete('/:id', requireRole('tenant-admin'), remove);
router.post('/:id/managers', requireRole('tenant-admin'), createManager);

module.exports = router;
