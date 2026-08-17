const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { list, create, update, remove } = require('../controllers/platformAdminController');

router.use(protect, requireRole('super-admin'));
router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
