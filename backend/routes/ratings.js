const express = require('express');
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { staffOverview } = require('../controllers/ratingController');

// What owners and branch managers see: scores and comments, never who wrote them. The member
// side lives in routes/memberApp.js.
const router = express.Router();
router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'), requireFeature('features:ratings'));
router.get('/', staffOverview);
module.exports = router;
