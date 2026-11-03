const express = require('express');
const router = express.Router();
const { publicBrand } = require('../utils/subdomain');
const { validate, schemas } = require('../middleware/validate');
const signup = require('../controllers/signupController');

// No authentication: the login page needs the gym's name and look before anyone signs in.
// Only fields meant for display are returned.
router.get('/tenant', (req, res) => {
  if (req.hostTenant && req.hostTenant.isActive) return res.json(publicBrand(req.hostTenant));
  if (req.unknownHost || req.hostTenant) return res.status(404).json({ message: 'No gym at this address.' });
  res.json(null); // the main/platform address: nothing gym-specific to show
});

router.get('/signup-config', signup.config);
router.post('/signup', validate(schemas.signup), signup.signup);
router.post('/verify-email', validate(schemas.verifyEmail), signup.verifyEmail);
router.post('/resend-verification', validate(schemas.resendVerification), signup.resend);

module.exports = router;
