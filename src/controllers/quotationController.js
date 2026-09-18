const path = require('path');
const fs = require('fs');
const Requisition = require('../models/Requisition');
const Quotation = require('../models/Quotation');
const QuotationDocument = require('../models/QuotationDocument');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const config = require('../config/env');
const { PAYMENT_DOC_TYPE, FINAL_PAYMENT_DOC_TYPE } = require('../config/workflow');
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
    const amount = Number(req.body.amount);

    if (req.requisition.budget_cap && amount > req.requisition.budget_cap) {
      throw new AppError(
        `El monto de la cotización (${amount}) supera el presupuesto máximo de la requisición (${req.requisition.budget_cap})`,
        400,
        'AMOUNT_EXCEEDS_BUDGET_CAP',
      );
    }

    const quotation = Quotation.create({
      requisitionId,
      providerName,
      amount,
      notes: req.body.notes,
      advancePercent: req.body.advance_percent,
      quotationDate: req.body.quotation_date,
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

  /** Tesorería attaches proof of the advance payment to the selected quotation (guarded by requirePaymentStage). */
  uploadPaymentDocument(req, res) {
    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }

    const document = QuotationDocument.create({
      quotationId: req.quotation.id,
      docType: PAYMENT_DOC_TYPE,
      filePath: storeQuotationFile(req.file, req.requisition.id, PAYMENT_DOC_TYPE),
      originalFilename: req.file.originalname,
    });

    logger.info(`Payment document uploaded: docId=${document.id}, quotationId=${req.quotation.id}, reqId=${req.requisition.id}, userId=${req.user.id}`);

    res.status(201).json({ success: true, data: { document }, message: 'Comprobante de pago subido exitosamente' });
  },

  /** Tesorería attaches proof of the final (balance) payment (guarded by requireFinalPaymentStage). */
  uploadFinalPaymentDocument(req, res) {
    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }

    const document = QuotationDocument.create({
      quotationId: req.quotation.id,
      docType: FINAL_PAYMENT_DOC_TYPE,
      filePath: storeQuotationFile(req.file, req.requisition.id, FINAL_PAYMENT_DOC_TYPE),
      originalFilename: req.file.originalname,
    });

    logger.info(`Final payment document uploaded: docId=${document.id}, quotationId=${req.quotation.id}, reqId=${req.requisition.id}, userId=${req.user.id}`);

    res.status(201).json({ success: true, data: { document }, message: 'Comprobante de pago del saldo final subido exitosamente' });
  },

  deleteDocument(req, res) {
    QuotationDocument.delete(req.document.id);

    logger.info(`Quotation document deleted: docId=${req.document.id}, quotationId=${req.quotation.id}, userId=${req.user.id}`);

    res.json({ success: true, data: null, message: 'Documento eliminado exitosamente' });
  },

  /**
   * Encargado/a de Compras attaches the comparative table across all quotations
   * (not tied to any single provider). Replaces any previous one. Guarded by
   * requireQuotationStage — step 4, still pending.
   */
  uploadComparisonDocument(req, res) {
    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }
    const previousPath = req.requisition.comparison_file_path;
    if (previousPath && fs.existsSync(path.resolve(previousPath))) {
      fs.unlinkSync(path.resolve(previousPath));
    }

    const requisition = Requisition.setComparisonDocument(req.requisition.id, {
      filePath: storeQuotationFile(req.file, req.requisition.id, 'comparativo'),
      originalFilename: req.file.originalname,
    });

    logger.info(`Comparison document uploaded: reqId=${req.requisition.id}, userId=${req.user.id}`);

    res.status(201).json({ success: true, data: { requisition }, message: 'Cuadro comparativo subido exitosamente' });
  },

  deleteComparisonDocument(req, res) {
    const previousPath = req.requisition.comparison_file_path;
    if (previousPath && fs.existsSync(path.resolve(previousPath))) {
      fs.unlinkSync(path.resolve(previousPath));
    }

    const requisition = Requisition.clearComparisonDocument(req.requisition.id);

    logger.info(`Comparison document deleted: reqId=${req.requisition.id}, userId=${req.user.id}`);

    res.json({ success: true, data: { requisition }, message: 'Cuadro comparativo eliminado exitosamente' });
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
