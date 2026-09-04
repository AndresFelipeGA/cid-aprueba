const path = require('path');
const fs = require('fs');
const Requisition = require('../models/Requisition');
const Quotation = require('../models/Quotation');
const QuotationDocument = require('../models/QuotationDocument');
const ApprovalStep = require('../models/ApprovalStep');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const VALID_DOC_TYPES = ['rut', 'camara_comercio', 'cedula', 'certificado_bancario'];

const quotationController = {
  listQuotations(req, res) {
    const { requisitionId } = req.params;

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    const quotations = Quotation.findByRequisition(requisitionId);

    res.json({
      success: true,
      data: { quotations },
      message: null,
    });
  },

  createQuotation(req, res) {
    if (req.user.role_level !== 4) {
      throw new AppError('Solo el Encargad@ de Compras puede agregar cotizaciones', 403, 'FORBIDDEN');
    }

    const { requisitionId } = req.params;

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.current_approval_level !== 4) {
      throw new AppError('Las cotizaciones solo se pueden agregar en la etapa de Encargad@ de Compras', 400, 'INVALID_LEVEL');
    }

    // Verify step 4 is still pending
    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, 4);
    if (!step || step.status !== 'pending') {
      throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
    }

    const providerName = req.body.provider_name;
    if (!providerName || providerName.trim().length < 2) {
      throw new AppError('El nombre del proveedor es requerido (mínimo 2 caracteres)', 400, 'VALIDATION_ERROR');
    }

    if (!req.file) {
      throw new AppError('El archivo de cotización es requerido', 400, 'FILE_REQUIRED');
    }

    // Ensure upload directory exists
    const uploadDir = path.resolve(__dirname, '../../uploads/quotations', String(requisitionId));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Move file to quotation-specific directory
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const newFilename = `cotizacion_${uniquePrefix}${ext}`;
    const newFilePath = path.join(uploadDir, newFilename);

    fs.renameSync(req.file.path, newFilePath);

    const quotation = Quotation.create({
      requisitionId: parseInt(requisitionId, 10),
      providerName: providerName.trim(),
      filePath: newFilePath,
      originalFilename: req.file.originalname,
      createdBy: req.user.id,
    });

    logger.info(`Quotation created: quotationId=${quotation.id}, reqId=${requisitionId}, provider="${providerName.trim()}", userId=${req.user.id}`);

    res.status(201).json({
      success: true,
      data: { quotation },
      message: 'Cotización creada exitosamente',
    });
  },

  deleteQuotation(req, res) {
    if (req.user.role_level !== 4) {
      throw new AppError('Solo el Encargad@ de Compras puede eliminar cotizaciones', 403, 'FORBIDDEN');
    }

    const { requisitionId, quotationId } = req.params;

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.current_approval_level !== 4) {
      throw new AppError('Las cotizaciones solo se pueden eliminar en la etapa de Encargad@ de Compras', 400, 'INVALID_LEVEL');
    }

    // Verify step 4 is still pending
    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, 4);
    if (!step || step.status !== 'pending') {
      throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
    }

    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }

    if (quotation.requisition_id !== parseInt(requisitionId, 10)) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    Quotation.delete(parseInt(quotationId, 10));

    logger.info(`Quotation deleted: quotationId=${quotationId}, reqId=${requisitionId}, userId=${req.user.id}`);

    res.json({
      success: true,
      data: null,
      message: 'Cotización eliminada exitosamente',
    });
  },

  uploadDocument(req, res) {
    if (req.user.role_level !== 4) {
      throw new AppError('Solo el Encargad@ de Compras puede subir documentos', 403, 'FORBIDDEN');
    }

    const { requisitionId, quotationId } = req.params;
    const docType = req.body.doc_type;

    if (!docType || !VALID_DOC_TYPES.includes(docType)) {
      throw new AppError(`Tipo de documento inválido. Debe ser uno de: ${VALID_DOC_TYPES.join(', ')}`, 400, 'INVALID_DOC_TYPE');
    }

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.current_approval_level !== 4) {
      throw new AppError('Los documentos solo se pueden subir en la etapa de Encargad@ de Compras', 400, 'INVALID_LEVEL');
    }

    // Verify step 4 is still pending
    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, 4);
    if (!step || step.status !== 'pending') {
      throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
    }

    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }

    if (quotation.requisition_id !== parseInt(requisitionId, 10)) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }

    // Ensure upload directory exists
    const uploadDir = path.resolve(__dirname, '../../uploads/quotations', String(requisitionId));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Move file to quotation-specific directory
    const ext = path.extname(req.file.originalname).toLowerCase();
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const newFilename = `${docType}_${uniquePrefix}${ext}`;
    const newFilePath = path.join(uploadDir, newFilename);

    fs.renameSync(req.file.path, newFilePath);

    const document = QuotationDocument.create({
      quotationId: parseInt(quotationId, 10),
      docType,
      filePath: newFilePath,
      originalFilename: req.file.originalname,
    });

    logger.info(`Quotation document uploaded: docId=${document.id}, quotationId=${quotationId}, type=${docType}, userId=${req.user.id}`);

    res.status(201).json({
      success: true,
      data: { document },
      message: 'Documento subido exitosamente',
    });
  },

  deleteDocument(req, res) {
    if (req.user.role_level !== 4) {
      throw new AppError('Solo el Encargad@ de Compras puede eliminar documentos', 403, 'FORBIDDEN');
    }

    const { requisitionId, quotationId, documentId } = req.params;

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.current_approval_level !== 4) {
      throw new AppError('Los documentos solo se pueden eliminar en la etapa de Encargad@ de Compras', 400, 'INVALID_LEVEL');
    }

    // Verify step 4 is still pending
    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, 4);
    if (!step || step.status !== 'pending') {
      throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
    }

    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }

    if (quotation.requisition_id !== parseInt(requisitionId, 10)) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    const document = QuotationDocument.findById(documentId);
    if (!document) {
      throw new AppError('Documento no encontrado', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.quotation_id !== parseInt(quotationId, 10)) {
      throw new AppError('El documento no pertenece a esta cotización', 400, 'DOCUMENT_MISMATCH');
    }

    QuotationDocument.delete(parseInt(documentId, 10));

    logger.info(`Quotation document deleted: docId=${documentId}, quotationId=${quotationId}, userId=${req.user.id}`);

    res.json({
      success: true,
      data: null,
      message: 'Documento eliminado exitosamente',
    });
  },

  downloadQuotationFile(req, res) {
    const { requisitionId, quotationId } = req.params;

    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }

    if (quotation.requisition_id !== parseInt(requisitionId, 10)) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    const filePath = path.resolve(quotation.file_path);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
    }

    res.download(filePath, quotation.original_filename);
  },

  downloadDocumentFile(req, res) {
    const { requisitionId, quotationId, documentId } = req.params;

    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }

    if (quotation.requisition_id !== parseInt(requisitionId, 10)) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    const document = QuotationDocument.findById(documentId);
    if (!document) {
      throw new AppError('Documento no encontrado', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.quotation_id !== parseInt(quotationId, 10)) {
      throw new AppError('El documento no pertenece a esta cotización', 400, 'DOCUMENT_MISMATCH');
    }

    const filePath = path.resolve(document.file_path);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
    }

    res.download(filePath, document.original_filename);
  },
};

module.exports = quotationController;
