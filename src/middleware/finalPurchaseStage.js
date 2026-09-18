/**
 * Guard for Encargado/a de Compras' second approval step (FINAL_PURCHASE_STEP):
 * final purchase documents (orden de compra, póliza, contrato, factura,
 * cuenta de cobro, certificado bancario) attach to the already-selected
 * quotation. Mirrors middleware/paymentStage.js.
 *
 * @module middleware/finalPurchaseStage
 */

const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const AppError = require('../utils/AppError');
const { FINAL_PURCHASE_STEP } = require('../config/workflow');

const requireFinalPurchaseStage = (req, _res, next) => {
  const { requisitionId } = req.params;

  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.current_approval_level !== FINAL_PURCHASE_STEP) {
    throw new AppError('Estos documentos solo se pueden adjuntar en la segunda aprobación de Compras', 400, 'INVALID_LEVEL');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, FINAL_PURCHASE_STEP);
  if (!step || step.status !== 'pending') {
    throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
  }
  if (!requisition.selected_quotation_id) {
    throw new AppError('No hay una cotización seleccionada para esta requisición', 400, 'NO_SELECTED_QUOTATION');
  }

  req.requisition = requisition;
  req.params.quotationId = String(requisition.selected_quotation_id);
  next();
};

module.exports = { requireFinalPurchaseStage };
