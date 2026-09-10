const path = require('path');
const fs = require('fs');
const Quotation = require('../models/Quotation');
const QuotationDocument = require('../models/QuotationDocument');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const config = require('../config/env');
const { loadVisibleRequisition } = require('./requisitionController');

/**
 * Move a multer temp upload into uploads/quotations/<requisitionId>/ with a
 * unique, prefix-tagged filename. Returns the final absolute path.
 */
const storeQuotationFile = (file, requisitionId, prefix) => {
  const uploadDir = path.resolve(__dirname, '../../', config.uploadDir, 'quotations', String(requisitionId));
  fs.mkdirSync(uploadDir, { recursive: true });

  const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(file.originalname).toLowerCase();
  const finalPath = path.join(uploadDir, `${prefix}_${uniquePrefix}${ext}`);
  fs.renameSync(file.path, finalPath);
  return finalPath;
};

const sendFile = (res, record) => {
  const filePath = path.resolve(record.file_path);
  if (!fs.existsSync(filePath)) {
    throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
  }
  res.download(filePath, record.original_filename);
};

/**
 * Quotation controller. Stage/ownership guards live in middleware/quotationStage.js
 * and role checks in the routes (authorize(4)), so handlers only hold business logic.
 */
const quotationController = {
  listQuotations(req, res) {
    const { requisitionId } = req.params;
    loadVisibleRequisition(requisitionId, req.user);

    res.json({ success: true, data: { quotations: Quotation.findByRequisition(requisitionId) }, message: null });
  },

  createQuotation(req, res) {
    if (!req.file) {
      throw new AppError('El archivo de cotización es requerido', 400, 'FILE_REQUIRED');
    }
    const requisitionId = req.requisition.id;
    const providerName = req.body.provider_name.trim();

    const quotation = Quotation.create({
      requisitionId,
      providerName,
      filePath: storeQuotationFile(req.file, requisitionId, 'cotizacion'),
      originalFilename: req.file.originalname,
      createdBy: req.user.id,
    });

    logger.info(`Quotation created: quotationId=${quotation.id}, reqId=${requisitionId}, provider="${providerName}", userId=${req.user.id}`);

    res.status(201).json({ success: true, data: { quotation }, message: 'Cotización creada exitosamente' });
  },

  deleteQuotation(req, res) {
    Quotation.delete(req.quotation.id);

    logger.info(`Quotation deleted: quotationId=${req.quotation.id}, reqId=${req.requisition.id}, userId=${req.user.id}`);

    res.json({ success: true, data: null, message: 'Cotización eliminada exitosamente' });
  },

  uploadDocument(req, res) {
    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }
    const docType = req.body.doc_type;

    const document = QuotationDocument.create({
      quotationId: req.quotation.id,
      docType,
      filePath: storeQuotationFile(req.file, req.requisition.id, docType),
      originalFilename: req.file.originalname,
    });

    logger.info(`Quotation document uploaded: docId=${document.id}, quotationId=${req.quotation.id}, type=${docType}, userId=${req.user.id}`);

    res.status(201).json({ success: true, data: { document }, message: 'Documento subido exitosamente' });
  },

  deleteDocument(req, res) {
    QuotationDocument.delete(req.document.id);

    logger.info(`Quotation document deleted: docId=${req.document.id}, quotationId=${req.quotation.id}, userId=${req.user.id}`);

    res.json({ success: true, data: null, message: 'Documento eliminado exitosamente' });
  },

  downloadQuotationFile(req, res) {
    loadVisibleRequisition(req.params.requisitionId, req.user);
    sendFile(res, req.quotation);
  },

  downloadDocumentFile(req, res) {
    loadVisibleRequisition(req.params.requisitionId, req.user);
    sendFile(res, req.document);
  },
};

module.exports = quotationController;
