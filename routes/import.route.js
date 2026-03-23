const express = require('express');
const { check } = require('express-validator');

const importController = require('../controllers/import.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

router.use(checkAuth);

router.get('/', checkRole('admin', 'manager'), importController.getAllImports);
router.get('/:id', checkRole('admin', 'manager'), importController.getImportById);
router.get('/product/:productId', checkRole('admin', 'manager'), importController.getImportsByProduct);

router.post(
  '/',
  checkRole('manager'),
  [
    check('importCode').trim().notEmpty().withMessage('Import code is required.'),
    check('items').isArray({ min: 1 }).withMessage('Items must not be empty.')
  ],
  importController.createImport
);

router.patch(
  '/:id',
  checkRole('manager'),
  [
    check('importCode').trim().notEmpty().withMessage('Import code is required.'),
    check('items').isArray({ min: 1 }).withMessage('Items must not be empty.')
  ],
  importController.updateImport
);

router.patch('/:id/approve', checkRole('admin'), importController.approveImport);
router.patch('/:id/reject', checkRole('admin'), importController.rejectImport);
router.patch('/:id/cancel', checkRole('admin', 'manager'), importController.cancelImport);

router.delete('/:id', checkRole('admin'), importController.deleteImport);

module.exports = router;
