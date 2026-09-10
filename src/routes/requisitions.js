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

const documentFields = [
  body('title').trim().notEmpty().withMessage('El título es requerido')
    .isLength({ max: 255 }).withMessage('El título debe tener máximo 255 caracteres'),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 1000 })
    .withMessage('La descripción debe tener máximo 1000 caracteres'),
];

router.use(authenticate);

// GET /api/requisitions
router.get('/', pagination, validate, asyncHandler(requisitionController.list));

// GET /api/requisitions/export.csv  (static paths before /:id)
router.get('/export.csv', asyncHandler(requisitionController.exportCsv));

// GET /api/requisitions/status/:status
router.get('/status/:status', [statusParam, ...pagination], validate, asyncHandler(requisitionController.getByStatus));

// GET /api/requisitions/:id
router.get('/:id', [idParam()], validate, asyncHandler(requisitionController.getById));

// POST /api/requisitions — radicar
router.post(
  '/',
  authorize(COORDINATOR),
  upload.single('file'),
  fixUploadFilename,
  [
    ...documentFields,
    body('project_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('El ID del proyecto debe ser un número entero válido'),
  ],
  validate,
  asyncHandler(requisitionController.create),
);

// POST /api/requisitions/:id/resubmit — radicar nueva versión tras devolución al inicio
router.post(
  '/:id/resubmit',
  authorize(COORDINATOR),
  upload.single('file'),
  fixUploadFilename,
  [
    idParam(),
    body('title').optional({ values: 'falsy' }).trim().isLength({ max: 255 }).withMessage('El título debe tener máximo 255 caracteres'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('La descripción debe tener máximo 1000 caracteres'),
    body('comments').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }).withMessage('Los comentarios deben tener máximo 1000 caracteres'),
  ],
  validate,
  asyncHandler(requisitionController.resubmit),
);

// GET /api/requisitions/:id/download
router.get('/:id/download', [idParam()], validate, asyncHandler(requisitionController.download));

// GET /api/requisitions/:id/versions/:versionId/download
router.get(
  '/:id/versions/:versionId/download',
  [idParam(), idParam('versionId')],
  validate,
  asyncHandler(requisitionController.downloadVersion),
);

module.exports = router;
