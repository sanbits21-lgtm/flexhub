const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { login, getMe, changePassword } = require('../controllers/authController');
const { refreshHandler, logoutHandler, logoutAllHandler } = require('../utils/sessions');
const { forgotStaff, resetStaff } = require('../controllers/passwordResetController');

router.post('/login', validate(schemas.login), login);
// Forgot password: an emailed, single-use link. Public, and answers the same for any address.
router.post('/forgot-password', validate(schemas.forgotPassword), forgotStaff);
router.post('/reset-password', validate(schemas.resetPassword), resetStaff);
// Renew the short-lived access token; no access token needed (it has usually expired).
router.post('/refresh', refreshHandler('user'));
router.post('/logout', logoutHandler('user'));
router.post('/logout-all', protect, logoutAllHandler('user'));
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

module.exports = router;
