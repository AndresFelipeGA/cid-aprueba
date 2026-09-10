const express = require('express');
const { body } = require('express-validator');
const requisitionController = require('../controllers/requisitionController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { idParam, pagination, statusParam } = require('../middleware/validators');
const { createUploader, fixUploadFilename } = require('../middleware/upload');

const router = express.Router();
const upload = createUploader();

const COORDINATOR = 1; // Coordinador/a de Territorio

router.use(authenticate);

// GET /api/requisitions
router.get('/', pagination, validate, asyncHandler(requisitionController.list));

// GET /api/requisitions/status/:status  (declared before /:id so "status" is not parsed as an id)
router.get(
  '/status/:status',
  [statusParam, ...pagination],
  validate,
  asyncHandler(requisitionController.getByStatus),
);

// GET /api/requisitions/:id
router.get('/:id', [idParam()], validate, asyncHandler(requisitionController.getById));

// POST /api/requisitions
router.post(
  '/',
  authorize(COORDINATOR),
  upload.single('file'),
  fixUploadFilename,
  [
    body('title').trim().notEmpty().withMessage('El título es requerido')
      .isLength({ max: 255 }).withMessage('El título debe tener máximo 255 caracteres'),
    body('description').optional().trim().isLength({ max: 1000 })
      .withMessage('La descripción debe tener máximo 1000 caracteres'),
    body('project_id').optional().isInt({ min: 1 }).withMessage('El ID del proyecto debe ser un número entero válido'),
  ],
  validate,
  asyncHandler(requisitionController.create),
);

// GET /api/requisitions/:id/download
router.get('/:id/download', [idParam()], validate, asyncHandler(requisitionController.download));

module.exports = router;
