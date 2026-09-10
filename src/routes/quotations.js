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
const { QUOTATION_DOC_TYPES } = require('../config/workflow');

const router = express.Router();
const upload = createUploader('quotations');

const DOC_TYPES = Object.keys(QUOTATION_DOC_TYPES);
const PURCHASING = 4; // Encargado/a de Compras

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
