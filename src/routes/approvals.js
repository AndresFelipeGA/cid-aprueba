const express = require('express');
const { body } = require('express-validator');
const approvalController = require('../controllers/approvalController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// POST /api/approvals/:requisitionId/approve
router.post(
  '/:requisitionId/approve',
  authenticate,
  [
    body('comments').optional().trim().isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres'),
  ],
  validate,
  asyncHandler(approvalController.approve),
);

// POST /api/approvals/:requisitionId/reject
router.post(
  '/:requisitionId/reject',
  authenticate,
  [
    body('comments').trim().notEmpty().withMessage('Los comentarios son requeridos al rechazar una requisición')
      .isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres'),
  ],
  validate,
  asyncHandler(approvalController.reject),
);

// GET /api/approvals/:requisitionId/history
router.get(
  '/:requisitionId/history',
  authenticate,
  asyncHandler(approvalController.history),
);

module.exports = router;
