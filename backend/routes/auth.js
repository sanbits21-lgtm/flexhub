const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { login, getMe, changePassword } = require('../controllers/authController');

router.post('/login', validate(schemas.login), login);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

module.exports = router;

