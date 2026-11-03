const express = require('express');
const router = express.Router();
const { protect, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const c = require('../controllers/memberAppController');

// Member-only API for the mobile app. A separate router (rather than loosening
// /api/equipment and /api/staff, which are staff-only on purpose) keeps the member's
// reach to exactly what is listed here, all pinned to their own tenant and branch.
const memberOnly = (req, res, next) => {
  if (req.actorType !== 'member') return res.status(403).json({ message: 'Forbidden' });
  next();
};

router.use(protect, scopeContext, attachFeatures);

// Photos are also readable by staff of the same gym, so this one is not member-only.
router.get('/photo/:memberId', c.getPhoto);

router.use(memberOnly);
router.get('/me', c.getProfile);
router.put('/me', c.updateProfile);
router.put('/me/photo', c.uploadPhoto);
router.put('/me/password', c.changePassword);
router.delete('/me', c.deleteAccount);
router.get('/equipment', requireFeature('pages:equipment'), c.listEquipment);
router.get('/trainers', c.listTrainers);
router.get('/sessions', c.mySessions);
router.post('/sessions/:id/cancel', requireFeature('features:personalTraining'), c.cancelMySession);
router.get('/pass', requireFeature('features:qrCheckIn'), c.pass);
router.get('/payments', requireFeature('features:memberPayments'), c.myPayments);
router.get('/plans', c.getPlans);
router.post('/plans/generate', c.generate);

module.exports = router;
