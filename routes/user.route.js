const express = require('express');
const { check } = require('express-validator');

const usersController = require('../controllers/user.controller');

const router = express.Router();

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

module.exports = router;
