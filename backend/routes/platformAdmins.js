const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { list, create, update, remove } = require('../controllers/platformAdminController');

router.use(protect, requireRole('super-admin'));
router.get('/', list);
router.post('/', validate(schemas.platformAdminCreate), create);
router.put('/:id', validate(schemas.platformAdminUpdate), update);
router.delete('/:id', remove);

module.exports = router;
