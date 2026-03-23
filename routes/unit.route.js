const express = require('express');
const { check } = require('express-validator');

const unitController = require('../controllers/unit.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

// Public routes - Lấy danh sách đơn vị
router.get('/', unitController.getAllUnits);
router.get('/:id', unitController.getUnitById);

// Protected routes - Chỉ admin (chủ quán)
router.use(checkAuth); // Kiểm tra authentication

router.post(
  '/',
  checkRole('admin'), // Chỉ admin
  [
    check('name').trim().notEmpty().withMessage('Name is required.'),
    check('symbol').trim().notEmpty().withMessage('Symbol is required.')
  ],
  unitController.createUnit
);

router.patch(
  '/:id',
  checkRole('admin'), // Chỉ admin
  [
    check('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    check('symbol').optional().trim().notEmpty().withMessage('Symbol cannot be empty.')
  ],
  unitController.updateUnit
);

router.delete(
  '/:id',
  checkRole('admin'), // Chỉ admin
  unitController.deleteUnit
);

module.exports = router;
