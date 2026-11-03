const express = require('express');
const router = express.Router();
const { protect, requireRole, allowActors, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const {
  list, getForMember, checkIn, checkOut, scan,
} = require('../controllers/attendanceController');

// Members are legitimate actors here (self check-in via QR, own history), so these
// routes use allowActors rather than requireRole — but they are still gated: previously
// any authenticated actor, including a platform-admin with no branch context, could
// reach them.
const staffWithBranchContext = ['tenant-admin', 'branch-manager', 'trainer'];

// Router-level: if a tenant has attendance tracking off, both staff and member
// self-check-in are blocked — there's no useful "half enabled" state here.
router.use(protect, scopeContext, attachFeatures, requireFeature('pages:attendance'));
router.get('/', requireRole(...staffWithBranchContext), list);
router.get('/member/:id', allowActors({ member: true, roles: staffWithBranchContext }), getForMember);
// Staff only: a member checking themselves in from their own phone proves nothing about being
// at the gym. Members check in by showing their pass (see /scan).
router.post('/check-in', requireRole(...staffWithBranchContext), checkIn);
router.post('/check-out', requireRole(...staffWithBranchContext), checkOut);
router.post('/scan', requireRole('tenant-admin', 'branch-manager'), requireFeature('features:qrCheckIn'), scan);

module.exports = router;
