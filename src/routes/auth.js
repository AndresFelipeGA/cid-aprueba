const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(authController.login),
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(authController.me),
);

// PUT /api/auth/profile
router.put(
  '/profile',
  authenticate,
  [
    body('email').optional().isEmail().withMessage('Invalid email format').normalizeEmail(),
    body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  ],
  validate,
  asyncHandler(authController.updateProfile),
);

module.exports = router;
