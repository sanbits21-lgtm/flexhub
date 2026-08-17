const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { login, getMe } = require('../controllers/memberAuthController');

router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
