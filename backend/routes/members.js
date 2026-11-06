const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const {
  list, getOne, getProgress, getMe, create, bulkCreate, bulkCheck, update, remove, renew, addBodyMetric, issueAppAccess,
} = require('../controllers/memberController');

const plans = require('../controllers/memberPlanController');

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
router.post('/bulk/check', requireRole('tenant-admin', 'branch-manager'), requireFeature('features:bulkUpload'), enforceWriteScope, bulkCheck);
router.put('/:id', requireRole('tenant-admin', 'branch-manager'), enforceWriteScope, validate(schemas.memberUpdate), update);
router.delete('/:id', requireRole('tenant-admin', 'branch-manager'), remove);
router.post('/:id/renew', requireRole('tenant-admin', 'branch-manager'), validate(schemas.memberRenew), renew);
router.post('/:id/app-access', requireRole('tenant-admin', 'branch-manager'), issueAppAccess);
router.post('/:id/body-metrics', requireRole('branch-manager', 'trainer'), addBodyMetric);

// Customised workout / diet plans for a member. A trainer reaches only members assigned
// to them (see buildMemberFilter), so no extra ownership check is needed here.
const planStaff = requireRole('tenant-admin', 'branch-manager', 'trainer');
router.get('/:id/plans', planStaff, plans.list);
router.post('/:id/plans/draft', planStaff, plans.draft);
router.post('/:id/plans', planStaff, plans.create);
router.delete('/:id/plans/:planId', planStaff, plans.withdraw);

module.exports = router;
