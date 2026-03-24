const express = require('express');
const { check } = require('express-validator');
const usersController = require('../controllers/user.controller');
const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

const router = express.Router();

router.post('/signup', usersController.signup);

router.post(
  '/login',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email không hợp lệ.'),
    check('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự.')
  ],
  usersController.login
);

router.post(
  '/verify-email',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email không hợp lệ.'),
    check('otp').trim().notEmpty().withMessage('OTP là bắt buộc.')
  ],
  usersController.verifyEmail
);

router.post(
  '/forgot-password',
  [check('email').normalizeEmail().isEmail().withMessage('Email không hợp lệ.')],
  usersController.forgotPassword
);

router.post(
  '/reset-password',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email không hợp lệ.'),
    check('otp').trim().notEmpty().withMessage('OTP là bắt buộc.'),
    check('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.')
  ],
  usersController.resetPassword
);

router.get('/profile', checkAuth, usersController.getProfile);

router.get('/', checkAuth, checkRole('admin'), usersController.getAllUsers);

router.post(
  '/internal-create',
  checkAuth,
  checkRole('admin'),
  [
    check('name').trim().notEmpty().withMessage('Tên là bắt buộc.'),
    check('email').normalizeEmail().isEmail().withMessage('Email không hợp lệ.'),
    check('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự.'),
    check('role').isIn(['manager', 'staff']).withMessage('Chỉ được tạo tài khoản manager hoặc staff.')
  ],
  usersController.createInternalUser
);

router.get('/:id', checkAuth, checkRole('admin'), usersController.getUserById);

router.patch(
  '/:id',
  checkAuth,
  checkRole('admin'),
  [
    check('name').optional().trim().notEmpty().withMessage('Tên không được để trống.'),
    check('email').optional().normalizeEmail().isEmail().withMessage('Email không hợp lệ.'),
    check('role').optional().isIn(['admin', 'manager', 'staff']).withMessage('Vai trò không hợp lệ.'),
    check('status').optional().isIn(['pending', 'active', 'blocked']).withMessage('Trạng thái không hợp lệ.')
  ],
  usersController.updateUser
);

router.delete('/:id', checkAuth, checkRole('admin'), usersController.deleteUser);

router.post(
  '/change-password',
  checkAuth,
  [
    check('currentPassword').trim().notEmpty().withMessage('Mật khẩu hiện tại là bắt buộc.'),
    check('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự.')
  ],
  usersController.changePassword
);

module.exports = router;
