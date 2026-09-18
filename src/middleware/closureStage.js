/**
 * Guard for the Coordinador/a de Territorio's closing documents (Listados,
 * Actas) at CLOSURE_STEP: the requisition must sit there, that half of the
 * joint approval must not already be recorded, and the step itself must
 * still be pending (both halves resolved would have already advanced past
 * it). Unlike quotationStage/paymentStage, this doesn't rewrite quotationId —
 * the closing documents live on the requisition itself, not a quotation.
 *
 * @module middleware/closureStage
 */

const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const AppError = require('../utils/AppError');
const { CLOSURE_STEP } = require('../config/workflow');

const requireClosureStage = (req, _res, next) => {
  const { requisitionId } = req.params;

  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.current_approval_level !== CLOSURE_STEP) {
    throw new AppError('Estos documentos solo se pueden adjuntar en la etapa de cierre de la requisición', 400, 'INVALID_LEVEL');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, CLOSURE_STEP);
  if (!step || step.status !== 'pending') {
    throw new AppError('El paso de aprobación ya fue procesado', 400, 'STEP_ALREADY_PROCESSED');
  }
  if (requisition.final_coordinador_approved_at) {
    throw new AppError('Ya registró su aprobación de cierre; no se pueden modificar los documentos', 400, 'ALREADY_APPROVED_THIS_STEP');
  }

  req.requisition = requisition;
  next();
};

module.exports = { requireClosureStage };
