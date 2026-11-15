const express = require('express');
const router = express.Router();
const { protect, requireRole, scopeContext } = require('../middleware/auth');
const { attachFeatures, requireFeature } = require('../middleware/features');
const { validate, schemas } = require('../middleware/validate');
const c = require('../controllers/payrollController');

// Salaries: the gym owner only.
router.use(protect, scopeContext, attachFeatures, requireRole('tenant-admin'), requireFeature('pages:expenses'));
router.get('/', c.preview);
router.post('/', validate(schemas.payrollRun), c.run);

router.get('/payees', c.listPayees);
router.post('/payees', validate(schemas.payeeWrite), c.createPayee);
router.put('/payees/:id', validate(schemas.payeeWrite), c.updatePayee);
router.delete('/payees/:id', c.removePayee);

module.exports = router;
