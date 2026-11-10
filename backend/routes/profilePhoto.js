const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/staffPhotoController');

const router = express.Router();
router.use(protect, requireRole('tenant-admin', 'branch-manager', 'trainer'));
router.put('/photo', c.upload);
router.delete('/photo', c.remove);
router.get('/photo/:userId', c.get);
module.exports = router;
