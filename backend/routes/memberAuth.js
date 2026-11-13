const express = require('express');
const router = express.Router();
const { protect, requireActor } = require('../middleware/auth');
const { login, getMe } = require('../controllers/memberAuthController');
const { refreshHandler, logoutHandler, logoutAllHandler } = require('../utils/sessions');
const { validate, schemas } = require('../middleware/validate');
const { forgotMember, resetMember } = require('../controllers/passwordResetController');

router.post('/login', login);
router.post('/forgot-password', validate(schemas.forgotMemberPassword), forgotMember);
router.post('/reset-password', validate(schemas.resetPassword), resetMember);
router.post('/refresh', refreshHandler('member'));
router.post('/logout', logoutHandler('member'));
router.post('/logout-all', protect, logoutAllHandler('member'));
router.get('/me', protect, requireActor('member'), getMe);

module.exports = router;
