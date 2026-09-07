/**
 * Project Controller
 *
 * Handles HTTP requests for project CRUD operations.
 *
 * @module controllers/projectController
 */

const Project = require('../models/Project');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const projectController = {
  /**
   * List all active projects. Any authenticated user can access.
   * @param {Object} _req - Express request
   * @param {Object} res - Express response
   */
  listProjects(_req, res) {
    const projects = Project.findAll();

    res.json({
      success: true,
      data: { projects },
      message: null,
    });
  },

  /**
   * Create a new project. Any authenticated user can create.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  createProject(req, res) {
    const { name, code, location, description, start_date, end_date } = req.body;

    // Check for duplicate code if provided
    if (code) {
      const existing = Project.findByCode(code);
      if (existing) {
        throw new AppError('Ya existe un proyecto con ese código', 409, 'PROJECT_CODE_TAKEN');
      }
    }

    const project = Project.create({
      name,
      code: code || null,
      location: location || null,
      description: description || null,
      start_date: start_date || null,
      end_date: end_date || null,
      created_by: req.user.id,
    });

    logger.info(`Project created: projectId=${project.id}, name="${name}", userId=${req.user.id}`);

    res.status(201).json({
      success: true,
      data: { project },
      message: 'Proyecto creado exitosamente',
    });
  },

  /**
   * Get a single project by ID.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getProject(req, res) {
    const { id } = req.params;
    const project = Project.findById(id);

    if (!project) {
      throw new AppError('Proyecto no encontrado', 404, 'PROJECT_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { project },
      message: null,
    });
  },
};

module.exports = projectController;
