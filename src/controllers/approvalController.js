const db = require('../config/database');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const MAX_APPROVAL_LEVEL = 6;

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

    if (user.role_level !== requisition.current_approval_level) {
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

    // Use a transaction for atomicity
    const performApproval = db.transaction(() => {
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

      if (nextLevel > MAX_APPROVAL_LEVEL) {
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

    if (user.role_level !== requisition.current_approval_level) {
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

    const requisition = Requisition.findById(requisitionId);
    if (!requisition) {
      throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
    }

    const logs = ApprovalLog.findByRequisition(requisitionId);

    res.json({
      success: true,
      data: { logs },
      message: null,
    });
  },
};

module.exports = approvalController;
