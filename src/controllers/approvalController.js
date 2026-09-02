const db = require('../config/database');
const Document = require('../models/Document');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const MAX_APPROVAL_LEVEL = 6;

const approvalController = {
  approve(req, res) {
    const { documentId } = req.params;
    const { comments } = req.body;
    const user = req.user;

    const document = Document.findById(documentId);
    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.status === 'approved') {
      throw new AppError('Document is already fully approved', 400, 'ALREADY_APPROVED');
    }

    if (document.status === 'rejected') {
      throw new AppError('Document has been rejected and cannot be approved', 400, 'ALREADY_REJECTED');
    }

    if (user.role_level !== document.current_approval_level) {
      throw new AppError(
        'Not authorized to approve at this level',
        403,
        'FORBIDDEN',
      );
    }

    const step = ApprovalStep.findByDocumentAndLevel(documentId, document.current_approval_level);
    if (!step) {
      throw new AppError('Approval step not found', 404, 'STEP_NOT_FOUND');
    }

    // Use a transaction for atomicity
    const performApproval = db.transaction(() => {
      // Update the approval step
      ApprovalStep.updateStatus(step.id, 'approved');

      // Log the action
      ApprovalLog.create({
        documentId: parseInt(documentId, 10),
        approvalStepId: step.id,
        userId: user.id,
        action: 'approved',
        comments: comments || null,
      });

      // Determine next state
      const nextLevel = document.current_approval_level + 1;

      if (nextLevel > MAX_APPROVAL_LEVEL) {
        // All levels approved — document is fully approved
        Document.updateStatus(documentId, {
          status: 'approved',
          currentApprovalLevel: nextLevel,
        });
      } else {
        // Move to next level
        Document.updateStatus(documentId, {
          status: 'in_review',
          currentApprovalLevel: nextLevel,
        });
      }
    });

    performApproval();

    logger.info(
      `Document approved: docId=${documentId}, level=${document.current_approval_level}, userId=${user.id}`,
    );

    const updatedDocument = Document.getWithApprovals(documentId);

    res.json({
      success: true,
      data: { document: updatedDocument },
      message: `Document approved at level ${document.current_approval_level}`,
    });
  },

  reject(req, res) {
    const { documentId } = req.params;
    const { comments } = req.body;
    const user = req.user;

    if (!comments || comments.trim().length === 0) {
      throw new AppError('Comments are required when rejecting a document', 400, 'COMMENTS_REQUIRED');
    }

    const document = Document.findById(documentId);
    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.status === 'approved') {
      throw new AppError('Document is already fully approved', 400, 'ALREADY_APPROVED');
    }

    if (document.status === 'rejected') {
      throw new AppError('Document has already been rejected', 400, 'ALREADY_REJECTED');
    }

    if (user.role_level !== document.current_approval_level) {
      throw new AppError(
        'Not authorized to reject at this level',
        403,
        'FORBIDDEN',
      );
    }

    const step = ApprovalStep.findByDocumentAndLevel(documentId, document.current_approval_level);
    if (!step) {
      throw new AppError('Approval step not found', 404, 'STEP_NOT_FOUND');
    }

    // Use a transaction for atomicity
    const performRejection = db.transaction(() => {
      // Update the approval step
      ApprovalStep.updateStatus(step.id, 'rejected');

      // Log the action
      ApprovalLog.create({
        documentId: parseInt(documentId, 10),
        approvalStepId: step.id,
        userId: user.id,
        action: 'rejected',
        comments: comments.trim(),
      });

      // Mark document as rejected (terminal state)
      Document.updateStatus(documentId, {
        status: 'rejected',
      });
    });

    performRejection();

    logger.info(
      `Document rejected: docId=${documentId}, level=${document.current_approval_level}, userId=${user.id}`,
    );

    const updatedDocument = Document.getWithApprovals(documentId);

    res.json({
      success: true,
      data: { document: updatedDocument },
      message: `Document rejected at level ${document.current_approval_level}`,
    });
  },

  history(req, res) {
    const { documentId } = req.params;

    const document = Document.findById(documentId);
    if (!document) {
      throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const logs = ApprovalLog.findByDocument(documentId);

    res.json({
      success: true,
      data: { logs },
      message: null,
    });
  },
};

module.exports = approvalController;
