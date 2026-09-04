const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const requisitionController = require('../controllers/requisitionController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const AppError = require('../utils/AppError');
const config = require('../config/env');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.resolve(__dirname, '../../', config.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
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

// GET /api/requisitions
router.get(
  '/',
  authenticate,
  asyncHandler(requisitionController.list),
);

// GET /api/requisitions/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(requisitionController.getById),
);

// POST /api/requisitions
router.post(
  '/',
  authenticate,
  upload.single('file'),
  [
    body('title').trim().notEmpty().withMessage('El título es requerido').isLength({ max: 255 }).withMessage('El título debe tener máximo 255 caracteres'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('La descripción debe tener máximo 1000 caracteres'),
  ],
  validate,
  asyncHandler(requisitionController.create),
);

// GET /api/requisitions/:id/download
router.get(
  '/:id/download',
  authenticate,
  asyncHandler(requisitionController.download),
);

// GET /api/requisitions/status/:status
router.get(
  '/status/:status',
  authenticate,
  asyncHandler(requisitionController.getByStatus),
);

module.exports = router;
