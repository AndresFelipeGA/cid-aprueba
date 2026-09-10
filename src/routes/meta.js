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
      allowed_extensions: workflow.ALLOWED_UPLOAD_EXTENSIONS,
    },
    message: null,
  });
});

module.exports = router;
