const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { list } = require('../controllers/auditController');

router.use(protect, scopeContext, requireRole('super-admin', 'platform-admin'));
router.get('/', list);

module.exports = router;
