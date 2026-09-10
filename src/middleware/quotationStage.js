/**
 * Guards for quotation mutations: the requisition must exist, sit at step 4
 * (Encargado/a de Compras) with that step still pending, and any referenced
 * quotation/document must belong to the chain. Attaches the loaded records to
 * req.requisition / req.quotation / req.document.
 *
 * @module middleware/quotationStage
 */

const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const Quotation = require('../models/Quotation');
const QuotationDocument = require('../models/QuotationDocument');
const AppError = require('../utils/AppError');

const QUOTATION_STEP = 4;

const requireQuotationStage = (req, _res, next) => {
  const { requisitionId } = req.params;

  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.current_approval_level !== QUOTATION_STEP) {
    throw new AppError('Las cotizaciones solo se pueden modificar en la etapa de Encargad@ de Compras', 400, 'INVALID_LEVEL');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, QUOTATION_STEP);
  if (!step || step.status !== 'pending') {
    throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
  }

  req.requisition = requisition;
  next();
};

/** Loads req.quotation and checks it belongs to req.params.requisitionId. */
const loadQuotation = (req, _res, next) => {
  const { requisitionId, quotationId } = req.params;

  const quotation = Quotation.findById(quotationId);
  if (!quotation) {
    throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
  }
  if (quotation.requisition_id !== Number(requisitionId)) {
    throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
  }

  req.quotation = quotation;
  next();
};

/** Loads req.document and checks it belongs to req.params.quotationId. */
const loadDocument = (req, _res, next) => {
  const { quotationId, documentId } = req.params;

  const document = QuotationDocument.findById(documentId);
  if (!document) {
    throw new AppError('Documento no encontrado', 404, 'DOCUMENT_NOT_FOUND');
  }
  if (document.quotation_id !== Number(quotationId)) {
    throw new AppError('El documento no pertenece a esta cotización', 400, 'DOCUMENT_MISMATCH');
  }

  req.document = document;
  next();
};

module.exports = { requireQuotationStage, loadQuotation, loadDocument, QUOTATION_STEP };
