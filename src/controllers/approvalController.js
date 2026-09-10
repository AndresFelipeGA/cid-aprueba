const db = require('../config/database');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const Quotation = require('../models/Quotation');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const { STEP_TO_ROLE_MAP, MAX_STEP_LEVEL } = require('../models/ApprovalStep');
const { loadVisibleRequisition } = require('./requisitionController');

const approvalController = {
  approve(req, res) {
    const { requisitionId } = req.params;
    const { comments } = req.body;
    const user = req.user;

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.status === 'approved') {
      throw new AppError('La requisición ya fue aprobada completamente', 400, 'ALREADY_APPROVED');
    }

    if (requisition.status === 'rejected') {
      throw new AppError('La requisición fue rechazada y no puede ser aprobada', 400, 'ALREADY_REJECTED');
    }

    // Authorization: check that user's role matches the required role for this step
    const requiredRoleLevel = STEP_TO_ROLE_MAP[requisition.current_approval_level];
    if (!requiredRoleLevel || user.role_level !== requiredRoleLevel) {
      throw new AppError(
        'No autorizado para aprobar en este nivel',
        403,
        'FORBIDDEN',
      );
    }

    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, requisition.current_approval_level);
    if (!step) {
      throw new AppError('Paso de aprobación no encontrado', 404, 'STEP_NOT_FOUND');
    }

    // At level 4, require at least one complete quotation before approving
    if (requisition.current_approval_level === 4) {
      const hasComplete = Quotation.hasCompleteQuotation(requisitionId);
      if (!hasComplete) {
        throw new AppError('Debe adjuntar al menos una cotización completa con todos los documentos del proveedor (RUT, Cámara de Comercio, Cédula y Certificado Bancario) antes de aprobar', 400, 'INCOMPLETE_QUOTATION');
      }
    }

    // At level 5, require quotation selection before approving
    // If only 1 quotation exists, auto-select it
    if (requisition.current_approval_level === 5) {
      let { selected_quotation_id } = req.body;
      const quotationCount = Quotation.countByRequisition(parseInt(requisitionId, 10));

      if (!selected_quotation_id && quotationCount === 1) {
        // Auto-select the only quotation
        const quotations = Quotation.findByRequisition(parseInt(requisitionId, 10));
        selected_quotation_id = quotations[0].id;
        req.body.selected_quotation_id = selected_quotation_id;
      }

      if (!selected_quotation_id) {
        throw new AppError('Debe seleccionar una cotización antes de aprobar', 400, 'QUOTATION_SELECTION_REQUIRED');
      }
      const selectedQ = Quotation.findById(selected_quotation_id);
      if (!selectedQ || selectedQ.requisition_id !== parseInt(requisitionId, 10)) {
        throw new AppError('Cotización seleccionada no válida', 400, 'INVALID_QUOTATION_SELECTION');
      }
    }

    // Use a transaction for atomicity
    const performApproval = db.transaction(() => {
      // At step 5, select the quotation before updating the step
      if (requisition.current_approval_level === 5) {
        Quotation.selectQuotation(
          parseInt(req.body.selected_quotation_id, 10),
          parseInt(requisitionId, 10),
        );
      }

      // Update the approval step
      ApprovalStep.updateStatus(step.id, 'approved');

      // Log the action
      ApprovalLog.create({
        requisitionId: parseInt(requisitionId, 10),
        approvalStepId: step.id,
        userId: user.id,
        action: 'approved',
        comments: comments || null,
      });

      // Determine next state
      const nextLevel = requisition.current_approval_level + 1;

      if (nextLevel > MAX_STEP_LEVEL) {
        // All levels approved — requisition is fully approved
        Requisition.updateStatus(requisitionId, {
          status: 'approved',
          currentApprovalLevel: nextLevel,
        });
      } else {
        // Move to next level
        Requisition.updateStatus(requisitionId, {
          status: 'in_review',
          currentApprovalLevel: nextLevel,
        });
      }
    });

    performApproval();

    logger.info(
      `Requisition approved: reqId=${requisitionId}, level=${requisition.current_approval_level}, userId=${user.id}`,
    );

    const updatedRequisition = Requisition.getWithApprovals(requisitionId);

    res.json({
      success: true,
      data: { requisition: updatedRequisition },
      message: `Requisición aprobada en el nivel ${requisition.current_approval_level}`,
    });
  },

  reject(req, res) {
    const { requisitionId } = req.params;
    const { comments } = req.body;
    const user = req.user;

    if (!comments || comments.trim().length === 0) {
      throw new AppError('Los comentarios son requeridos al rechazar una requisición', 400, 'COMMENTS_REQUIRED');
    }

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    if (requisition.status === 'approved') {
      throw new AppError('La requisición ya fue aprobada completamente', 400, 'ALREADY_APPROVED');
    }

    if (requisition.status === 'rejected') {
      throw new AppError('La requisición ya fue rechazada', 400, 'ALREADY_REJECTED');
    }

    // Authorization: check that user's role matches the required role for this step
    const requiredRoleLevel = STEP_TO_ROLE_MAP[requisition.current_approval_level];
    if (!requiredRoleLevel || user.role_level !== requiredRoleLevel) {
      throw new AppError(
        'No autorizado para rechazar en este nivel',
        403,
        'FORBIDDEN',
      );
    }

    const step = ApprovalStep.findByRequisitionAndLevel(requisitionId, requisition.current_approval_level);
    if (!step) {
      throw new AppError('Paso de aprobación no encontrado', 404, 'STEP_NOT_FOUND');
    }

    // Use a transaction for atomicity
    const performRejection = db.transaction(() => {
      // Update the approval step
      ApprovalStep.updateStatus(step.id, 'rejected');

      // Log the action
      ApprovalLog.create({
        requisitionId: parseInt(requisitionId, 10),
        approvalStepId: step.id,
        userId: user.id,
        action: 'rejected',
        comments: comments.trim(),
      });

      // Mark requisition as rejected (terminal state)
      Requisition.updateStatus(requisitionId, {
        status: 'rejected',
      });
    });

    performRejection();

    logger.info(
      `Requisition rejected: reqId=${requisitionId}, level=${requisition.current_approval_level}, userId=${user.id}`,
    );

    const updatedRequisition = Requisition.getWithApprovals(requisitionId);

    res.json({
      success: true,
      data: { requisition: updatedRequisition },
      message: `Requisición rechazada en el nivel ${requisition.current_approval_level}`,
    });
  },

  history(req, res) {
    const { requisitionId } = req.params;
    loadVisibleRequisition(requisitionId, req.user);

    const logs = ApprovalLog.findByRequisition(requisitionId);

    res.json({
      success: true,
      data: { logs },
      message: null,
    });
  },
};

module.exports = approvalController;
