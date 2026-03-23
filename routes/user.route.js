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
