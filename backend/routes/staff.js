const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, createTrainer, update, remove, getAssignedMembers, trainerReport, resetPassword,
} = require('../controllers/staffController');

router.use(protect, scopeContext, attachFeatures);
router.get('/', requireRole('tenant-admin', 'branch-manager'), list);
router.get('/trainer-report', requireRole('tenant-admin'), requireFeature('pages:trainerReport'), trainerReport);
router.post('/', requireRole('tenant-admin', 'branch-manager'), validate(schemas.staffCreate), createTrainer);
router.post('/:id/reset-password', requireRole('tenant-admin', 'branch-manager'), resetPassword);
router.put('/:id', requireRole('tenant-admin', 'branch-manager'), validate(schemas.staffUpdate), update);
router.delete('/:id', requireRole('tenant-admin', 'branch-manager'), remove);
router.get('/:id/assigned-members', requireRole('tenant-admin', 'branch-manager'), getAssignedMembers);

module.exports = router;

