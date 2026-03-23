const express = require('express');
const { check } = require('express-validator');

const importController = require('../controllers/import.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

// Protected routes - Chỉ manager và admin
router.use(checkAuth); // Kiểm tra authentication

// Lấy danh sách phiếu nhập
router.get('/', checkRole('admin', 'manager'), importController.getAllImports);
router.get('/:id', checkRole('admin', 'manager'), importController.getImportById);
router.get('/product/:productId', checkRole('admin', 'manager'), importController.getImportsByProduct);

// Tạo phiếu nhập - Chỉ manager
router.post(
  '/',
  checkRole('manager'), // Chỉ manager
  [
    check('product').trim().notEmpty().withMessage('Product is required.'),
    check('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),
    check('importPrice').isNumeric().withMessage('Import price must be a number.'),
    check('expiryDate').isISO8601().withMessage('Expiry date must be a valid date.')
  ],
  importController.createImport
);

// Cập nhật phiếu nhập - Chỉ manager
router.patch(
  '/:id',
  checkRole('manager'), // Chỉ manager
  [
    check('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),
    check('importPrice').optional().isNumeric().withMessage('Import price must be a number.'),
    check('expiryDate').optional().isISO8601().withMessage('Expiry date must be a valid date.')
  ],
  importController.updateImport
);

module.exports = router;
