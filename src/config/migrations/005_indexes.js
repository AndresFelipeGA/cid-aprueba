/**
 * Migration 005 — Indexes
 *
 * Adds indexes on every foreign key and filter column used by the models.
 * Idempotent: uses CREATE INDEX IF NOT EXISTS.
 *
 * @module migrations/005_indexes
 */

const INDEXES = [
  ['idx_requisitions_status', 'requisitions(status)'],
  ['idx_requisitions_level', 'requisitions(current_approval_level)'],
  ['idx_requisitions_uploaded_by', 'requisitions(uploaded_by)'],
  ['idx_requisitions_project', 'requisitions(project_id)'],
  ['idx_approval_steps_requisition', 'approval_steps(requisition_id, step_level)'],
  ['idx_approval_logs_requisition', 'approval_logs(requisition_id)'],
  ['idx_quotations_requisition', 'quotations(requisition_id)'],
  ['idx_quotation_documents_quotation', 'quotation_documents(quotation_id)'],
];

module.exports = {
  version: 5,
  name: 'indexes',

  /**
   * Apply the migration — create all indexes.
   * @param {object} db - Raw sql.js Database instance
   */
  up(db) {
    for (const [name, target] of INDEXES) {
      db.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${target}`);
    }
  },
};
