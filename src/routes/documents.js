const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const documentController = require('../controllers/documentController');
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
      `File type not allowed. Accepted types: ${ALLOWED_EXTENSIONS.join(', ')}`,
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

// GET /api/documents
router.get(
  '/',
  authenticate,
  asyncHandler(documentController.list),
);

// GET /api/documents/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(documentController.getById),
);

// POST /api/documents
router.post(
  '/',
  authenticate,
  upload.single('file'),
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 255 }).withMessage('Title must be at most 255 characters'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
  ],
  validate,
  asyncHandler(documentController.create),
);

// GET /api/documents/:id/download
router.get(
  '/:id/download',
  authenticate,
  asyncHandler(documentController.download),
);

// GET /api/documents/status/:status
router.get(
  '/status/:status',
  authenticate,
  asyncHandler(documentController.getByStatus),
);

module.exports = router;
