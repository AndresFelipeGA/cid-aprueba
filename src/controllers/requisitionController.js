const path = require('path');
const fs = require('fs');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const requisitionController = {
  list(req, res) {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
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
    const requisition = Requisition.getWithApprovals(id);

    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { requisition },
      message: null,
    });
  },

  create(req, res) {
    // Only Coordinadores de Territorio (role_level 1) can create requisitions
    if (req.user.role_level !== 1) {
      throw new AppError('Solo los Coordinadores/as de Territorio pueden crear requisiciones', 403, 'FORBIDDEN');
    }

    const { title, description } = req.body;

    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }

    const requisition = Requisition.create({
      title,
      description: description || null,
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.id,
    });

    // Create all 6 approval steps
    ApprovalStep.createAll(requisition.id);

    // Log the upload action
    ApprovalLog.create({
      requisitionId: requisition.id,
      approvalStepId: null,
      userId: req.user.id,
      action: 'uploaded',
      comments: null,
    });

    logger.info(`Requisition uploaded: reqId=${requisition.id}, userId=${req.user.id}, title="${title}"`);

    const fullRequisition = Requisition.getWithApprovals(requisition.id);

    res.status(201).json({
      success: true,
      data: { requisition: fullRequisition },
      message: 'Requisición creada exitosamente',
    });
  },

  getByStatus(req, res) {
    const { status } = req.params;
    const validStatuses = ['pending', 'in_review', 'approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`,
        400,
        'INVALID_STATUS',
      );
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const { items, total } = Requisition.findByStatus(status, { limit, offset });

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
    const { id } = req.params;
    const requisition = Requisition.findById(id);

    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    const filePath = path.resolve(requisition.file_path);

    if (!fs.existsSync(filePath)) {
      throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
    }

    res.download(filePath, requisition.original_filename);
  },
};

module.exports = requisitionController;
