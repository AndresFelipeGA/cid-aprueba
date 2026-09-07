/**
 * Project Routes
 *
 * Defines API endpoints for project management.
 *
 * @module routes/projects
 */

const express = require('express');
const { body } = require('express-validator');
const projectController = require('../controllers/projectController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/projects — List all active projects
router.get(
  '/',
  authenticate,
  asyncHandler(projectController.listProjects),
);

// POST /api/projects — Create a new project
router.post(
  '/',
  authenticate,
  [
    body('name').trim().notEmpty().withMessage('El nombre del proyecto es requerido'),
    body('code').optional().trim(),
    body('location').optional().trim(),
    body('description').optional().trim(),
    body('start_date').optional().isISO8601().withMessage('La fecha de inicio debe ser una fecha válida'),
    body('end_date').optional().isISO8601().withMessage('La fecha de fin debe ser una fecha válida'),
  ],
  validate,
  asyncHandler(projectController.createProject),
);

// GET /api/projects/:id — Get a single project
router.get(
  '/:id',
  authenticate,
  asyncHandler(projectController.getProject),
);

module.exports = router;
