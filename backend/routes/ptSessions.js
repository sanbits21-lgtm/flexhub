const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const c = require('../controllers/ptSessionController');

router.use(protect, scopeContext, attachFeatures, requireFeature('features:personalTraining'));
const staff = requireRole('tenant-admin', 'branch-manager', 'trainer');
router.get('/', staff, c.list);
router.post('/', staff, c.create);
router.put('/:id', staff, c.update);
router.post('/:id/cancel', staff, c.cancel);
router.post('/:id/complete', staff, c.complete);
router.post('/:id/no-show', staff, c.noShow);

module.exports = router;
