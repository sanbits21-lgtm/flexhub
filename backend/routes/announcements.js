const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/announcementController');

// Notices for members. The owner can publish to any branch or the whole gym; a branch manager only to their own branch
// (the controller enforces it). Trainers have no access.
router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'), requireFeature('features:announcements'));
router.get('/', c.list);
router.post('/', validate(schemas.announcementCreate), c.create);
router.post('/preview', validate(schemas.audiencePreview), c.preview);
router.get('/reminders', requireRole('tenant-admin'), c.getReminders);
router.put('/reminders', requireRole('tenant-admin'), validate(schemas.reminderSettings), c.putReminders);
router.put('/:id', validate(schemas.announcementUpdate), c.update);
router.post('/:id/withdraw', c.withdraw);

module.exports = router;
