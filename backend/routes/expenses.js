const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext, enforceWriteScope } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/expenseController');

// The owner and branch managers record and read expenses; a manager is held to their own branch and never sees salaries
// (see the controller). Trainers have no access.
router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin', 'branch-manager'), requireFeature('pages:expenses'));
router.get('/', c.list);
router.get('/summary', c.summary);
router.post('/', enforceWriteScope, validate(schemas.expenseCreate), c.create);
router.put('/:id', validate(schemas.expenseUpdate), c.update);
router.post('/:id/void', c.void);
router.put('/:id/receipt', c.putReceipt);
router.get('/:id/receipt', c.getReceipt);

module.exports = router;
