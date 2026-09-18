/**
 * Guard for Encargado/a de Compras' delivery-documents step (DELIVERY_STEP):
 * the requisition must sit there with the step still pending. Attaches
 * req.requisition and rewrites req.params.quotationId to the selected
 * quotation, mirroring middleware/finalPurchaseStage.js.
 *
 * @module middleware/deliveryStage
 */

const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const AppError = require('../utils/AppError');
const { DELIVERY_STEP } = require('../config/workflow');

const requireDeliveryStage = (req, _res, next) => {
  const { requisitionId } = req.params;

  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.current_approval_level !== DELIVERY_STEP) {
    throw new AppError('Estos documentos solo se pueden adjuntar en la etapa de entrega de Compras', 400, 'INVALID_LEVEL');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, DELIVERY_STEP);
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

module.exports = { requireDeliveryStage };
