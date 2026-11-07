const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/packageController');

// Same split as platform settings: both platform roles read (the approval screen lists the
// packages); only the super-admin changes what is on offer.
router.use(protect);
router.get('/', requireRole('super-admin', 'platform-admin'), c.list);
router.post('/', requireRole('super-admin'), validate(schemas.packageSave), c.create);
router.put('/:id', requireRole('super-admin'), validate(schemas.packageSave), c.update);
router.delete('/:id', requireRole('super-admin'), c.remove);

module.exports = router;
