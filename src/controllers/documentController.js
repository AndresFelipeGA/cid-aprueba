const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const documentController = {
  list(req, res) {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const userRoleLevel = req.user.role_level;

    const { items, total } = Document.findAll({ limit, offset, userRoleLevel });

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
    const document = Document.getWithApprovals(id);

    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { document },
      message: null,
    });
  },

  create(req, res) {
    const { title, description } = req.body;

    if (!req.file) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }

    const document = Document.create({
      title,
      description: description || null,
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.id,
    });

    // Create all 6 approval steps
    ApprovalStep.createAll(document.id);

    // Log the upload action
    ApprovalLog.create({
      documentId: document.id,
      approvalStepId: null,
      userId: req.user.id,
      action: 'uploaded',
      comments: null,
    });

    logger.info(`Document uploaded: docId=${document.id}, userId=${req.user.id}, title="${title}"`);

    const fullDocument = Document.getWithApprovals(document.id);

    res.status(201).json({
      success: true,
      data: { document: fullDocument },
      message: 'Document uploaded successfully',
    });
  },

  getByStatus(req, res) {
    const { status } = req.params;
    const validStatuses = ['pending', 'in_review', 'approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400,
        'INVALID_STATUS',
      );
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const { items, total } = Document.findByStatus(status, { limit, offset });

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
    const document = Document.findById(id);

    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const filePath = path.resolve(document.file_path);

    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found on server', 404, 'FILE_NOT_FOUND');
    }

    res.download(filePath, document.original_filename);
  },
};

module.exports = documentController;
