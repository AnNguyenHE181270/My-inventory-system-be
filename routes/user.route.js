const express = require('express');
const { check } = require('express-validator');

const usersController = require('../controllers/user.controller');

const router = express.Router();

router.post(
  '/signup',
  [
    check('name').trim().notEmpty().withMessage('Name is required.'),
    check('email').normalizeEmail().isEmail().withMessage('Email is invalid.'),
    check('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters.'),
    check('role')
      .isIn(['admin', 'manager', 'staff'])
      .withMessage('Role is invalid.')
  ],
  usersController.signup
);

router.post(
  '/login',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email is invalid.'),
    check('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters.')
  ],
  usersController.login
);

router.post(
  '/verify-email',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email is invalid.'),
    check('otp').trim().notEmpty().withMessage('OTP is required.')
  ],
  usersController.verifyEmail
);

router.post(
  '/forgot-password',
  [check('email').normalizeEmail().isEmail().withMessage('Email is invalid.')],
  usersController.forgotPassword
);

router.post(
  '/reset-password',
  [
    check('email').normalizeEmail().isEmail().withMessage('Email is invalid.'),
    check('otp').trim().notEmpty().withMessage('OTP is required.'),
    check('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters.')
  ],
  usersController.resetPassword
);

module.exports = router;


const checkAuth = require('../middleware/check-auth');
const checkRole = require('../middleware/check-role');

// Protected routes - CRUD User (chỉ admin)
router.get(
  '/',
  checkAuth,
  checkRole('admin'),
  usersController.getAllUsers
);

router.get(
  '/:id',
  checkAuth,
  checkRole('admin'),
  usersController.getUserById
);

router.patch(
  '/:id',
  checkAuth,
  checkRole('admin'),
  [
    check('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
    check('email').optional().normalizeEmail().isEmail().withMessage('Email is invalid.'),
    check('role').optional().isIn(['admin', 'manager', 'staff']).withMessage('Role is invalid.'),
    check('status').optional().isIn(['pending', 'active', 'blocked']).withMessage('Status is invalid.')
  ],
  usersController.updateUser
);

router.delete(
  '/:id',
  checkAuth,
  checkRole('admin'),
  usersController.deleteUser
);

// Thay đổi mật khẩu (user tự thay đổi)
router.post(
  '/change-password',
  checkAuth,
  [
    check('currentPassword').trim().notEmpty().withMessage('Current password is required.'),
    check('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters.')
  ],
  usersController.changePassword
);
