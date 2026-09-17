const express = require('express');
const { body } = require('express-validator');
const quotationController = require('../controllers/quotationController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { idParam } = require('../middleware/validators');
const { createUploader, fixUploadFilename } = require('../middleware/upload');
const { requireQuotationStage, loadQuotation, loadDocument } = require('../middleware/quotationStage');
const { requirePaymentStage } = require('../middleware/paymentStage');
const { QUOTATION_DOC_TYPES } = require('../config/workflow');

const router = express.Router();
const upload = createUploader('quotations');

const DOC_TYPES = Object.keys(QUOTATION_DOC_TYPES);
const PURCHASING = 4; // Encargado/a de Compras
const FINANCE = 5; // Área Financiera

router.use(authenticate);

// GET /api/requisitions/:requisitionId/quotations
router.get(
  '/:requisitionId/quotations',
  [idParam('requisitionId')],
  validate,
  asyncHandler(quotationController.listQuotations),
);

// POST /api/requisitions/:requisitionId/quotations
router.post(
  '/:requisitionId/quotations',
  authorize(PURCHASING),
  upload.single('file'),
  fixUploadFilename,
  [
    idParam('requisitionId'),
    body('provider_name').trim().isLength({ min: 2, max: 255 })
      .withMessage('El nombre del proveedor debe tener entre 2 y 255 caracteres'),
    body('amount').isFloat({ min: 1 }).withMessage('El monto de la cotización es requerido y debe ser mayor a cero').toFloat(),
    body('advance_percent').isFloat({ min: 0, max: 100 }).withMessage('El anticipo debe ser un porcentaje entre 0 y 100').toFloat(),
    body('quotation_date')
      .notEmpty().withMessage('La fecha de la cotización es requerida')
      .isISO8601().withMessage('La fecha de la cotización no es válida')
      .custom((value) => value.slice(0, 10) <= new Date().toISOString().slice(0, 10))
      .withMessage('La fecha de la cotización no puede ser una fecha futura'),
    body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Las notas deben tener máximo 500 caracteres'),
  ],
  validate,
  requireQuotationStage,
  asyncHandler(quotationController.createQuotation),
);

// DELETE /api/requisitions/:requisitionId/quotations/:quotationId
router.delete(
  '/:requisitionId/quotations/:quotationId',
  authorize(PURCHASING),
  [idParam('requisitionId'), idParam('quotationId')],
  validate,
  requireQuotationStage,
  loadQuotation,
  asyncHandler(quotationController.deleteQuotation),
);

// POST /api/requisitions/:requisitionId/quotations/:quotationId/documents
router.post(
  '/:requisitionId/quotations/:quotationId/documents',
  authorize(PURCHASING),
  upload.single('file'),
  fixUploadFilename,
  [
    idParam('requisitionId'),
    idParam('quotationId'),
    body('doc_type').trim().isIn(DOC_TYPES)
      .withMessage(`Tipo de documento inválido. Debe ser uno de: ${DOC_TYPES.join(', ')}`),
  ],
  validate,
  requireQuotationStage,
  loadQuotation,
  asyncHandler(quotationController.uploadDocument),
);

// DELETE /api/requisitions/:requisitionId/quotations/:quotationId/documents/:documentId
router.delete(
  '/:requisitionId/quotations/:quotationId/documents/:documentId',
  authorize(PURCHASING),
  [idParam('requisitionId'), idParam('quotationId'), idParam('documentId')],
  validate,
  requireQuotationStage,
  loadQuotation,
  loadDocument,
  asyncHandler(quotationController.deleteDocument),
);

// POST /api/requisitions/:requisitionId/comparison-document — Encargado/a de Compras adjunta el cuadro comparativo de cotizaciones
router.post(
  '/:requisitionId/comparison-document',
  authorize(PURCHASING),
  upload.single('file'),
  fixUploadFilename,
  [idParam('requisitionId')],
  validate,
  requireQuotationStage,
  asyncHandler(quotationController.uploadComparisonDocument),
);

// DELETE /api/requisitions/:requisitionId/comparison-document
router.delete(
  '/:requisitionId/comparison-document',
  authorize(PURCHASING),
  [idParam('requisitionId')],
  validate,
  requireQuotationStage,
  asyncHandler(quotationController.deleteComparisonDocument),
);

// POST /api/requisitions/:requisitionId/payment-document — Área Financiera adjunta el comprobante de pago
router.post(
  '/:requisitionId/payment-document',
  authorize(FINANCE),
  upload.single('file'),
  fixUploadFilename,
  [idParam('requisitionId')],
  validate,
  requirePaymentStage,
  loadQuotation,
  asyncHandler(quotationController.uploadPaymentDocument),
);

// DELETE /api/requisitions/:requisitionId/payment-document/:documentId
router.delete(
  '/:requisitionId/payment-document/:documentId',
  authorize(FINANCE),
  [idParam('requisitionId'), idParam('documentId')],
  validate,
  requirePaymentStage,
  loadQuotation,
  loadDocument,
  asyncHandler(quotationController.deleteDocument),
);

// GET /api/requisitions/:requisitionId/quotations/:quotationId/download
router.get(
  '/:requisitionId/quotations/:quotationId/download',
  [idParam('requisitionId'), idParam('quotationId')],
  validate,
  loadQuotation,
  asyncHandler(quotationController.downloadQuotationFile),
);

// GET /api/requisitions/:requisitionId/quotations/:quotationId/documents/:documentId/download
router.get(
  '/:requisitionId/quotations/:quotationId/documents/:documentId/download',
  [idParam('requisitionId'), idParam('quotationId'), idParam('documentId')],
  validate,
  loadQuotation,
  loadDocument,
  asyncHandler(quotationController.downloadDocumentFile),
);

module.exports = router;
