const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { getSummary } = require('../controllers/reportsController');

router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin'), requireFeature('pages:reports'));
router.get('/summary', getSummary);

module.exports = router;
