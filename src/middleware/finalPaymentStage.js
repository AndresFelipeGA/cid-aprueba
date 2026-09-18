/**
 * Guard for the final (balance) payment-proof upload: the requisition must
 * sit at FINAL_PAYMENT_STEP (Tesorería, second time) with that step still
 * pending, and must already have a selected quotation. Mirrors
 * middleware/paymentStage.js.
 *
 * @module middleware/finalPaymentStage
 */

const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const AppError = require('../utils/AppError');
const { FINAL_PAYMENT_STEP } = require('../config/workflow');

const requireFinalPaymentStage = (req, _res, next) => {
  const { requisitionId } = req.params;

  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.current_approval_level !== FINAL_PAYMENT_STEP) {
    throw new AppError('El comprobante de pago del saldo final solo se puede adjuntar en esa etapa de Tesorería', 400, 'INVALID_LEVEL');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, FINAL_PAYMENT_STEP);
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

module.exports = { requireFinalPaymentStage };
