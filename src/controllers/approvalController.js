const db = require('../config/database');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const Quotation = require('../models/Quotation');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { toCsv, sendCsv } = require('../utils/csv');
const {
  STEP_TO_ROLE_MAP, MAX_STEP_LEVEL, FIRST_APPROVAL_LEVEL, STEP_LABELS, LOG_ACTIONS, ROLE_NAMES,
} = require('../config/workflow');
const { loadVisibleRequisition } = require('./requisitionController');

const QUOTATION_STEP = 4;
const SELECTION_STEP = 5;

/**
 * Load a requisition that is open and whose current step belongs to the acting
 * user. Shared precondition for approve / return / reject.
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

  const requiredRoleLevel = STEP_TO_ROLE_MAP[requisition.current_approval_level];
  if (!requiredRoleLevel || user.role_level !== requiredRoleLevel) {
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

    if (level === QUOTATION_STEP && !Quotation.hasCompleteQuotation(requisitionId)) {
      throw new AppError('Debe adjuntar al menos una cotización completa con todos los documentos del proveedor (RUT, Cámara de Comercio, Cédula y Certificado Bancario) antes de aprobar', 400, 'INCOMPLETE_QUOTATION');
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
