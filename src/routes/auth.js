const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// Brute-force protection: 10 attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.',
    });
  },
});

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
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
    body('gender').optional({ nullable: true }).isIn(['M', 'F', '', null]).withMessage('Gender must be M, F, or empty'),
  ],
  validate,
  asyncHandler(authController.updateProfile),
);

module.exports = router;
