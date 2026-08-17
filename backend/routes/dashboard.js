const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { getSummary, getPlatform } = require('../controllers/dashboardController');

router.use(protect, scopeContext);
router.get('/summary', getSummary);
router.get('/platform', requireRole('super-admin', 'platform-admin'), getPlatform);

module.exports = router;
