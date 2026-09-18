const express = require('express');
const workflow = require('../config/workflow');

const router = express.Router();

// GET /api/meta — public, static workflow metadata consumed by the frontend
router.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    success: true,
    data: {
      step_to_role: workflow.STEP_TO_ROLE_MAP,
      max_step: workflow.MAX_STEP_LEVEL,
      first_approval_level: workflow.FIRST_APPROVAL_LEVEL,
      step_labels: workflow.STEP_LABELS,
      role_names: workflow.ROLE_NAMES,
      statuses: workflow.REQUISITION_STATUSES,
      status_labels: workflow.STATUS_LABELS,
      log_actions: workflow.LOG_ACTIONS,
      return_targets: workflow.RETURN_TARGETS,
      currency: workflow.CURRENCY,
      doc_types: workflow.QUOTATION_DOC_TYPES,
      optional_doc_types: workflow.OPTIONAL_QUOTATION_DOC_TYPES,
      final_purchase_step: workflow.FINAL_PURCHASE_STEP,
      final_purchase_doc_types: workflow.FINAL_PURCHASE_DOC_TYPES,
      allowed_extensions: workflow.ALLOWED_UPLOAD_EXTENSIONS,
      payment_step: workflow.PAYMENT_STEP,
      payment_doc_type: workflow.PAYMENT_DOC_TYPE,
      payment_doc_label: workflow.PAYMENT_DOC_LABEL,
      delivery_step: workflow.DELIVERY_STEP,
      delivery_doc_types: workflow.DELIVERY_DOC_TYPES,
      final_payment_step: workflow.FINAL_PAYMENT_STEP,
      final_payment_doc_type: workflow.FINAL_PAYMENT_DOC_TYPE,
      final_payment_doc_label: workflow.FINAL_PAYMENT_DOC_LABEL,
      closure_step: workflow.CLOSURE_STEP,
      closure_roles: workflow.CLOSURE_ROLES,
      closure_doc_labels: workflow.CLOSURE_DOC_LABELS,
    },
    message: null,
  });
});

module.exports = router;
