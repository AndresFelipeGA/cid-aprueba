const express = require('express');
const { body } = require('express-validator');
const approvalController = require('../controllers/approvalController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { idParam } = require('../middleware/validators');

const router = express.Router();

router.use(authenticate);

// POST /api/approvals/:requisitionId/approve
router.post(
  '/:requisitionId/approve',
  [
    idParam('requisitionId'),
    body('comments').optional().trim().isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres'),
    body('selected_quotation_id').optional().isInt({ min: 1 }).withMessage('El ID de cotización seleccionada debe ser un número válido').toInt(),
  ],
  validate,
  asyncHandler(approvalController.approve),
);

// POST /api/approvals/:requisitionId/reject
router.post(
  '/:requisitionId/reject',
  [
    idParam('requisitionId'),
    body('comments').trim().notEmpty().withMessage('Los comentarios son requeridos al rechazar una requisición')
      .isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres'),
  ],
  validate,
  asyncHandler(approvalController.reject),
);

// GET /api/approvals/:requisitionId/history
router.get(
  '/:requisitionId/history',
  [idParam('requisitionId')],
  validate,
  asyncHandler(approvalController.history),
);

module.exports = router;
