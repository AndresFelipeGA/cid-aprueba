const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { getPagination } = require('../middleware/validators');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const Project = require('../models/Project');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Load a requisition and enforce the visibility rule for the requesting user.
 * @throws {AppError} 404 if missing, 403 if the user may not see it yet
 */
const loadVisibleRequisition = (id, user) => {
  const requisition = Requisition.findById(id);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (!Requisition.isVisibleTo(requisition, user)) {
    throw new AppError('No autorizado para ver esta requisición', 403, 'FORBIDDEN');
  }
  return requisition;
};

const requisitionController = {
  loadVisibleRequisition,

  list(req, res) {
    const { page, limit, offset } = getPagination(req);
    const userRoleLevel = req.user.role_level;

    const { items, total } = Requisition.findAll({ limit, offset, userRoleLevel });

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
      },
      message: null,
    });
  },

  getById(req, res) {
    const { id } = req.params;
    loadVisibleRequisition(id, req.user);
    const requisition = Requisition.getWithApprovals(id);

    res.json({
      success: true,
      data: { requisition },
      message: null,
    });
  },

  create(req, res) {
    const { title, description, project_id } = req.body;

    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }

    // Validate project exists if project_id is provided
    if (project_id) {
      const project = Project.findById(project_id);
      if (!project) {
        throw new AppError('El proyecto seleccionado no existe', 400, 'PROJECT_NOT_FOUND');
      }
    }

    // Requisition + its 7 steps + the upload log entry are one atomic unit
    const requisition = db.transaction(() => {
      const created = Requisition.create({
        title,
        description: description || null,
        filePath: req.file.path,
        originalFilename: req.file.originalname,
        uploadedBy: req.user.id,
        projectId: project_id || null,
      });
      ApprovalStep.createAll(created.id);
      ApprovalLog.create({
        requisitionId: created.id,
        approvalStepId: null,
        userId: req.user.id,
        action: 'uploaded',
        comments: null,
      });
      return created;
    })();

    logger.info(`Requisition uploaded: reqId=${requisition.id}, userId=${req.user.id}, title="${title}"`);

    const fullRequisition = Requisition.getWithApprovals(requisition.id);

    res.status(201).json({
      success: true,
      data: { requisition: fullRequisition },
      message: 'Requisición creada exitosamente',
    });
  },

  getByStatus(req, res) {
    const { status } = req.params; // validated by statusParam
    const { page, limit, offset } = getPagination(req);

    const { items, total } = Requisition.findByStatus(status, {
      limit,
      offset,
      userRoleLevel: req.user.role_level,
    });

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
      },
      message: null,
    });
  },

  download(req, res) {
    const requisition = loadVisibleRequisition(req.params.id, req.user);

    const filePath = path.resolve(requisition.file_path);

    if (!fs.existsSync(filePath)) {
      throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
    }

    res.download(filePath, requisition.original_filename);
  },
};

module.exports = requisitionController;
