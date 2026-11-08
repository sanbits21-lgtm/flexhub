const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/platformSettingsController');

// Both platform roles may read the terms (the approval screen pre-fills from them);
// only the super-admin changes them.
router.use(protect);
router.get('/', requireRole('super-admin', 'platform-admin'), c.get);
router.put('/', requireRole('super-admin'), c.update);
// Is email working? (Sign-up depends on it.)
router.get('/email-status', requireRole('super-admin'), c.emailStatus);
router.post('/test-email', requireRole('super-admin'), c.sendTestEmail);

module.exports = router;
