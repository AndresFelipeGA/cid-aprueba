const express = require('express');
const { body } = require('express-validator');
const approvalController = require('../controllers/approvalController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { idParam } = require('../middleware/validators');
const { RETURN_TARGETS } = require('../config/workflow');

const router = express.Router();

router.use(authenticate);

const optionalComments = body('comments').optional({ values: 'falsy' }).trim()
  .isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres');
const requiredComments = body('comments').trim()
  .notEmpty().withMessage('Los comentarios son obligatorios para devolver o rechazar una requisición')
  .isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres');

// GET /api/approvals/export.csv — audit trail (declared before /:requisitionId routes)
router.get('/export.csv', asyncHandler(approvalController.exportCsv));

// POST /api/approvals/:requisitionId/approve
router.post(
  '/:requisitionId/approve',
  [
    idParam('requisitionId'),
    optionalComments,
    body('selected_quotation_id').optional({ values: 'falsy' }).isInt({ min: 1 })
      .withMessage('El ID de cotización seleccionada debe ser un número válido').toInt(),
  ],
  validate,
  asyncHandler(approvalController.approve),
);

// POST /api/approvals/:requisitionId/return  { to: 'previous' | 'start', comments }
router.post(
  '/:requisitionId/return',
  [
    idParam('requisitionId'),
    body('to').default('previous').isIn(RETURN_TARGETS)
      .withMessage(`El destino debe ser uno de: ${RETURN_TARGETS.join(', ')}`),
    requiredComments,
  ],
  validate,
  asyncHandler(approvalController.returnRequisition),
);

// POST /api/approvals/:requisitionId/reject — terminal
router.post(
  '/:requisitionId/reject',
  [idParam('requisitionId'), requiredComments],
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
