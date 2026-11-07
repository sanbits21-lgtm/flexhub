const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { login, getMe } = require('../controllers/memberAuthController');
const { refreshHandler, logoutHandler, logoutAllHandler } = require('../utils/sessions');

router.post('/login', login);
router.post('/refresh', refreshHandler('member'));
router.post('/logout', logoutHandler('member'));
router.post('/logout-all', protect, logoutAllHandler('member'));
router.get('/me', protect, getMe);

module.exports = router;
