const express = require('express');
const { check } = require('express-validator');

const productController = require('../controllers/product.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

// Public routes - Lấy danh sách sản phẩm
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Protected routes - Chỉ admin (chủ quán)
router.use(checkAuth); // Kiểm tra authentication

router.post(
  '/',
  checkRole('admin'), // Chỉ admin
  [
    check('name').trim().notEmpty().withMessage('Name is required.'),
    check('price').isNumeric().withMessage('Price must be a number.'),
    check('unit').trim().notEmpty().withMessage('Unit is required.')
  ],
  productController.createProduct
);

router.patch(
  '/:id',
  checkRole('admin'), // Chỉ admin
  [
    check('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    check('price').optional().isNumeric().withMessage('Price must be a number.'),
    check('unit').optional().trim().notEmpty().withMessage('Unit cannot be empty.')
  ],
  productController.updateProduct
);

router.delete(
  '/:id',
  checkRole('admin'), // Chỉ admin
  productController.deleteProduct
);

module.exports = router;
