const express = require('express');
const { body, param } = require('express-validator');
const userController = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/users — List all users
router.get(
  '/',
  asyncHandler(userController.listUsers),
);

// POST /api/users — Create a new user
router.post(
  '/',
  [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .matches(/^[a-zA-Z0-9.]+$/).withMessage('Username must be alphanumeric (dots allowed)'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name')
      .trim()
      .notEmpty().withMessage('Full name is required'),
    body('role_level')
      .notEmpty().withMessage('Role level is required')
      .isInt({ min: 1, max: 6 }).withMessage('Role level must be between 1 and 6'),
    body('territory')
      .optional({ nullable: true })
      .trim(),
    body('gender')
      .optional({ nullable: true })
      .isIn(['M', 'F', '', null]).withMessage('Gender must be M, F, or empty'),
  ],
  validate,
  asyncHandler(userController.createUser),
);

// PUT /api/users/:id — Update user details
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('email')
      .optional()
      .trim()
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    body('full_name')
      .optional()
      .trim()
      .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('role_level')
      .optional()
      .isInt({ min: 1, max: 6 }).withMessage('Role level must be between 1 and 6'),
    body('territory')
      .optional({ nullable: true })
      .trim(),
    body('gender')
      .optional({ nullable: true })
      .isIn(['M', 'F', '', null]).withMessage('Gender must be M, F, or empty'),
    body('is_active')
      .optional()
      .isInt({ min: 0, max: 1 }).withMessage('is_active must be 0 or 1'),
  ],
  validate,
  asyncHandler(userController.updateUser),
);

// PUT /api/users/:id/password — Reset user password
router.put(
  '/:id/password',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  asyncHandler(userController.resetPassword),
);

// PUT /api/users/:id/toggle — Toggle user active status
router.put(
  '/:id/toggle',
  [
    param('id').isInt().withMessage('Invalid user ID'),
  ],
  validate,
  asyncHandler(userController.toggleActive),
);

module.exports = router;
