const express = require('express');
const { body } = require('express-validator');
const approvalController = require('../controllers/approvalController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// POST /api/approvals/:documentId/approve
router.post(
  '/:documentId/approve',
  authenticate,
  [
    body('comments').optional().trim().isLength({ max: 1000 }).withMessage('Comments must be at most 1000 characters'),
  ],
  validate,
  asyncHandler(approvalController.approve),
);

// POST /api/approvals/:documentId/reject
router.post(
  '/:documentId/reject',
  authenticate,
  [
    body('comments').trim().notEmpty().withMessage('Comments are required when rejecting a document')
      .isLength({ max: 1000 }).withMessage('Comments must be at most 1000 characters'),
  ],
  validate,
  asyncHandler(approvalController.reject),
);

// GET /api/approvals/:documentId/history
router.get(
  '/:documentId/history',
  authenticate,
  asyncHandler(approvalController.history),
);

module.exports = router;
