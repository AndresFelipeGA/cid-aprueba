const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { body, param } = require('express-validator');
const quotationController = require('../controllers/quotationController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const AppError = require('../utils/AppError');
const config = require('../config/env');

const router = express.Router();

// Ensure quotations upload directory exists
const quotationsUploadDir = path.resolve(__dirname, '../../uploads/quotations');
if (!fs.existsSync(quotationsUploadDir)) {
  fs.mkdirSync(quotationsUploadDir, { recursive: true });
}

// Allowed file extensions (same as requisitions)
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, quotationsUploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError(
      `Tipo de archivo no permitido. Tipos aceptados: ${ALLOWED_EXTENSIONS.join(', ')}`,
      400,
      'INVALID_FILE_TYPE',
    ));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize,
  },
});

// GET /api/requisitions/:requisitionId/quotations
router.get(
  '/:requisitionId/quotations',
  authenticate,
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
  ],
  validate,
  asyncHandler(quotationController.listQuotations),
);

// POST /api/requisitions/:requisitionId/quotations
router.post(
  '/:requisitionId/quotations',
  authenticate,
  upload.single('file'),
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    body('provider_name').trim().notEmpty().withMessage('El nombre del proveedor es requerido').isLength({ min: 2 }).withMessage('El nombre del proveedor debe tener al menos 2 caracteres'),
  ],
  validate,
  asyncHandler(quotationController.createQuotation),
);

// DELETE /api/requisitions/:requisitionId/quotations/:quotationId
router.delete(
  '/:requisitionId/quotations/:quotationId',
  authenticate,
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    param('quotationId').isInt().withMessage('El ID de cotización debe ser un número entero'),
  ],
  validate,
  asyncHandler(quotationController.deleteQuotation),
);

// POST /api/requisitions/:requisitionId/quotations/:quotationId/documents
router.post(
  '/:requisitionId/quotations/:quotationId/documents',
  authenticate,
  upload.single('file'),
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    param('quotationId').isInt().withMessage('El ID de cotización debe ser un número entero'),
    body('doc_type').trim().notEmpty().withMessage('El tipo de documento es requerido').isIn(['rut', 'camara_comercio', 'cedula', 'certificado_bancario']).withMessage('Tipo de documento inválido. Debe ser: rut, camara_comercio, cedula o certificado_bancario'),
  ],
  validate,
  asyncHandler(quotationController.uploadDocument),
);

// DELETE /api/requisitions/:requisitionId/quotations/:quotationId/documents/:documentId
router.delete(
  '/:requisitionId/quotations/:quotationId/documents/:documentId',
  authenticate,
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    param('quotationId').isInt().withMessage('El ID de cotización debe ser un número entero'),
    param('documentId').isInt().withMessage('El ID de documento debe ser un número entero'),
  ],
  validate,
  asyncHandler(quotationController.deleteDocument),
);

// GET /api/requisitions/:requisitionId/quotations/:quotationId/download
router.get(
  '/:requisitionId/quotations/:quotationId/download',
  authenticate,
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    param('quotationId').isInt().withMessage('El ID de cotización debe ser un número entero'),
  ],
  validate,
  asyncHandler(quotationController.downloadQuotationFile),
);

// GET /api/requisitions/:requisitionId/quotations/:quotationId/documents/:documentId/download
router.get(
  '/:requisitionId/quotations/:quotationId/documents/:documentId/download',
  authenticate,
  [
    param('requisitionId').isInt().withMessage('El ID de requisición debe ser un número entero'),
    param('quotationId').isInt().withMessage('El ID de cotización debe ser un número entero'),
    param('documentId').isInt().withMessage('El ID de documento debe ser un número entero'),
  ],
  validate,
  asyncHandler(quotationController.downloadDocumentFile),
);

module.exports = router;
