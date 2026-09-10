/**
 * Project Routes
 * @module routes/projects
 */

const express = require('express');
const { body } = require('express-validator');
const projectController = require('../controllers/projectController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { idParam } = require('../middleware/validators');
const { ADMIN_ROLE } = require('../config/workflow');

const router = express.Router();

const COORDINATOR = 1; // creates requisitions, so may also register the project they belong to

router.use(authenticate);

// GET /api/projects — List all active projects
router.get('/', asyncHandler(projectController.listProjects));

// POST /api/projects — Create a new project
router.post(
  '/',
  authorize(COORDINATOR, ADMIN_ROLE),
  [
    body('name').trim().notEmpty().withMessage('El nombre del proyecto es requerido')
      .isLength({ max: 255 }).withMessage('El nombre debe tener máximo 255 caracteres'),
    body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('El código debe tener máximo 50 caracteres'),
    body('location').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
    body('start_date').optional({ values: 'falsy' }).isISO8601().withMessage('La fecha de inicio debe ser una fecha válida'),
    body('end_date').optional({ values: 'falsy' }).isISO8601().withMessage('La fecha de fin debe ser una fecha válida')
      .custom((end, { req }) => !req.body.start_date || end >= req.body.start_date)
      .withMessage('La fecha de fin debe ser posterior a la fecha de inicio'),
  ],
  validate,
  asyncHandler(projectController.createProject),
);

// GET /api/projects/:id — Get a single project
router.get('/:id', [idParam()], validate, asyncHandler(projectController.getProject));

module.exports = router;
