const db = require('../config/database');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const Quotation = require('../models/Quotation');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { toCsv, sendCsv } = require('../utils/csv');
const {
  rolesForStep, MAX_STEP_LEVEL, FIRST_APPROVAL_LEVEL, STEP_LABELS, LOG_ACTIONS, ROLE_NAMES,
  PAYMENT_STEP, FINAL_PAYMENT_STEP, CLOSURE_STEP,
} = require('../config/workflow');
const { loadVisibleRequisition } = require('./requisitionController');

const QUOTATION_STEP = 4;
const SELECTION_STEP = 5;
const COMPRAS_ROLE = 4;

/**
 * Load a requisition that is open and whose current step belongs to the acting
 * user. Shared precondition for approve / return / reject. Most steps have one
 * owner; the joint closure step allows either of CLOSURE_ROLES to act.
 */
const loadActionable = (requisitionId, user) => {
  const requisition = Requisition.findById(requisitionId);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (requisition.status === 'approved') {
    throw new AppError('La requisición ya fue aprobada completamente', 400, 'ALREADY_APPROVED');
  }
  if (requisition.status === 'rejected') {
    throw new AppError('La requisición fue rechazada definitivamente', 400, 'ALREADY_REJECTED');
  }
  if (requisition.current_approval_level < FIRST_APPROVAL_LEVEL) {
    throw new AppError('La requisición está devuelta al inicio: el/la coordinador/a debe radicar una nueva versión', 400, 'RESUBMISSION_REQUIRED');
  }

  const allowedRoles = rolesForStep(requisition.current_approval_level);
  if (allowedRoles.length === 0 || !allowedRoles.includes(user.role_level)) {
    throw new AppError('No autorizado para actuar en este nivel', 403, 'FORBIDDEN');
  }

  const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, requisition.current_approval_level);
  if (!step) {
    throw new AppError('Paso de aprobación no encontrado', 404, 'STEP_NOT_FOUND');
  }

  return { requisition, step };
};

const respondWithRequisition = (res, requisitionId, message) => {
  res.json({
    success: true,
    data: { requisition: Requisition.getWithApprovals(requisitionId) },
    message,
  });
};

const approvalController = {
  approve(req, res) {
    const { requisitionId } = req.params;
    const { comments } = req.body;
    const user = req.user;
    const { requisition, step } = loadActionable(requisitionId, user);
    const level = requisition.current_approval_level;

    if (level === CLOSURE_STEP) {
      return approvalController.approveClosure(req, res, requisition, step, user, comments);
    }

    if (level === QUOTATION_STEP) {
      if (!Quotation.hasCompleteQuotation(requisitionId)) {
        throw new AppError('Debe adjuntar al menos una cotización completa con todos los documentos del proveedor (RUT, Cámara de Comercio y Cédula) antes de aprobar', 400, 'INCOMPLETE_QUOTATION');
      }
      // The comparative table is only required once there's actually something to compare.
      if (Quotation.countByRequisition(requisitionId) > 1 && !requisition.comparison_file_path) {
        throw new AppError('Debe adjuntar el cuadro comparativo de cotizaciones antes de aprobar (obligatorio al haber más de una cotización)', 400, 'COMPARISON_DOCUMENT_REQUIRED');
      }
    }
    if (level === PAYMENT_STEP && !Quotation.hasPaymentDocument(requisitionId)) {
      throw new AppError('Debe adjuntar el comprobante de pago del anticipo antes de aprobar', 400, 'PAYMENT_DOCUMENT_REQUIRED');
    }
    if (level === FINAL_PAYMENT_STEP && !Quotation.hasFinalPaymentDocument(requisitionId)) {
      throw new AppError('Debe adjuntar el comprobante de pago del saldo final antes de aprobar', 400, 'FINAL_PAYMENT_DOCUMENT_REQUIRED');
    }

    let selectedQuotationId = null;
    if (level === SELECTION_STEP) {
      selectedQuotationId = req.body.selected_quotation_id;
      const quotations = Quotation.findByRequisition(requisitionId);
      if (!selectedQuotationId && quotations.length === 1) {
        selectedQuotationId = quotations[0].id; // auto-select the only option
      }
      if (!selectedQuotationId) {
        throw new AppError('Debe seleccionar una cotización antes de aprobar', 400, 'QUOTATION_SELECTION_REQUIRED');
      }
      if (!quotations.some((q) => q.id === Number(selectedQuotationId))) {
        throw new AppError('Cotización seleccionada no válida', 400, 'INVALID_QUOTATION_SELECTION');
      }
    }

    db.transaction(() => {
      if (level === SELECTION_STEP) {
        Quotation.selectQuotation(Number(selectedQuotationId), requisitionId);
      }
      ApprovalStep.updateStatus(step.id, 'approved');
      ApprovalLog.create({ requisitionId, approvalStepId: step.id, userId: user.id, action: 'approved', comments });

      const nextLevel = level + 1;
      Requisition.updateStatus(requisitionId, {
        status: nextLevel > MAX_STEP_LEVEL ? 'approved' : 'in_review',
        currentApprovalLevel: nextLevel,
        returnReason: null,
        returnedFromLevel: null,
      });
    })();

    logger.info(`Requisition approved: reqId=${requisitionId}, level=${level}, userId=${user.id}`);
    respondWithRequisition(res, requisitionId, `Requisición aprobada en el nivel ${level}`);
  },

  /**
   * Step 12: Coordinador/a de Territorio and Encargado/a de Compras each approve
   * independently, in either order. The step (and the requisition) only completes
   * once both halves are recorded; until then it stays at level 12, `in_review`.
   */
  approveClosure(req, res, requisition, step, user, comments) {
    const { requisitionId } = req.params;
    const who = user.role_level === COMPRAS_ROLE ? 'compras' : 'coordinador';
    const alreadyApproved = who === 'compras' ? requisition.final_compras_approved_at : requisition.final_coordinador_approved_at;

    if (alreadyApproved) {
      throw new AppError('Ya registró su aprobación de cierre; falta la del otro rol', 400, 'ALREADY_APPROVED_THIS_STEP');
    }
    if (who === 'coordinador' && !requisition.closure_listing_file_path && !requisition.closure_minutes_file_path) {
      throw new AppError('Debe adjuntar al menos uno de los documentos de cierre (Listados o Actas) antes de aprobar', 400, 'CLOSURE_DOCUMENT_REQUIRED');
    }

    let bothApproved = false;
    db.transaction(() => {
      Requisition.setFinalApproval(requisitionId, who);
      ApprovalLog.create({ requisitionId, approvalStepId: step.id, userId: user.id, action: 'approved', comments });

      const updated = Requisition.findById(requisitionId);
      bothApproved = Boolean(updated.final_compras_approved_at && updated.final_coordinador_approved_at);
      if (bothApproved) {
        ApprovalStep.updateStatus(step.id, 'approved');
        Requisition.updateStatus(requisitionId, {
          status: 'approved',
          currentApprovalLevel: CLOSURE_STEP + 1,
          returnReason: null,
          returnedFromLevel: null,
        });
      }
    })();

    logger.info(`Requisition closure half-approved: reqId=${requisitionId}, role=${who}, complete=${bothApproved}, userId=${user.id}`);
    const message = bothApproved
      ? 'Requisición aprobada y cerrada'
      : 'Su aprobación de cierre fue registrada; falta la del otro rol para cerrar la requisición';
    respondWithRequisition(res, requisitionId, message);
  },

  /**
   * Send a requisition back. `to`: 'previous' (one step back) or 'start' (step 1,
   * the coordinator must upload a new version). Going back from step 2 always
   * lands on step 1.
   */
  returnRequisition(req, res) {
    const { requisitionId } = req.params;
    const { comments, to } = req.body;
    const user = req.user;
    const { requisition, step } = loadActionable(requisitionId, user);
    const fromLevel = requisition.current_approval_level;

    const toLevel = to === 'start' ? 1 : Math.max(1, fromLevel - 1);
    const needsResubmission = toLevel < FIRST_APPROVAL_LEVEL;

    db.transaction(() => {
      ApprovalStep.resetFromLevel(requisitionId, toLevel);
      if (toLevel <= SELECTION_STEP) {
        Quotation.resetSelection(requisitionId);
      }
      // Either party returning from the joint closure step voids whatever partial approval existed.
      if (fromLevel === CLOSURE_STEP) {
        Requisition.clearFinalApprovals(requisitionId);
      }
      ApprovalLog.create({
        requisitionId, approvalStepId: step.id, userId: user.id, action: 'returned', comments, toLevel,
      });
      Requisition.updateStatus(requisitionId, {
        status: 'returned',
        currentApprovalLevel: toLevel,
        returnReason: comments,
        returnedFromLevel: fromLevel,
        ...(toLevel <= SELECTION_STEP ? { selectedQuotationId: null } : {}),
      });
    })();

    logger.info(`Requisition returned: reqId=${requisitionId}, from=${fromLevel}, to=${toLevel}, userId=${user.id}`);
    const target = needsResubmission ? 'al inicio para una nueva versión' : `al paso ${toLevel} (${STEP_LABELS[toLevel]})`;
    respondWithRequisition(res, requisitionId, `Requisición devuelta ${target}`);
  },

  /** Terminal rejection: the requisition is closed and cannot be resubmitted. */
  reject(req, res) {
    const { requisitionId } = req.params;
    const { comments } = req.body;
    const user = req.user;
    const { requisition, step } = loadActionable(requisitionId, user);

    db.transaction(() => {
      ApprovalStep.updateStatus(step.id, 'rejected');
      ApprovalLog.create({ requisitionId, approvalStepId: step.id, userId: user.id, action: 'rejected', comments });
      Requisition.updateStatus(requisitionId, { status: 'rejected' });
    })();

    logger.info(`Requisition rejected: reqId=${requisitionId}, level=${requisition.current_approval_level}, userId=${user.id}`);
    respondWithRequisition(res, requisitionId, 'Requisición rechazada definitivamente');
  },

  history(req, res) {
    const { requisitionId } = req.params;
    loadVisibleRequisition(requisitionId, req.user);

    res.json({ success: true, data: { logs: ApprovalLog.findByRequisition(requisitionId) }, message: null });
  },

  /** GET /api/approvals/export.csv — audit trail of every requisition visible to the user. */
  exportCsv(req, res) {
    const rows = ApprovalLog.findAllForExport(Requisition.visibilityClause(req.user));
    const csv = toCsv([
      { key: 'created_at', header: 'Fecha' },
      { key: 'requisition_number', header: 'Requisición' },
      { key: 'requisition_title', header: 'Título' },
      { key: 'user_name', header: 'Usuario' },
      { header: 'Rol', format: (r) => (ROLE_NAMES[r.user_role_level] || {}).default || r.user_role_level },
      { header: 'Acción', format: (r) => LOG_ACTIONS[r.action] || r.action },
      { header: 'Paso', format: (r) => (r.step_level ? `${r.step_level} - ${STEP_LABELS[r.step_level]}` : '') },
      { header: 'Devuelta al paso', format: (r) => (r.to_level ? `${r.to_level} - ${STEP_LABELS[r.to_level]}` : '') },
      { key: 'comments', header: 'Comentarios' },
    ], rows);

    sendCsv(res, `historial-aprobaciones-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  },
};

module.exports = approvalController;
