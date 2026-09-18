/**
 * Migration 010 — Comparative quotation document
 *
 * Adds `comparison_file_path` / `comparison_original_filename` to
 * requisitions: a single PDF (or similar) that compares all the quotations
 * attached at step 4, as opposed to the per-quotation documents which each
 * belong to one provider. Nullable — required only when a requisition ends
 * up with more than one quotation (enforced in approvalController, not here).
 *
 * @module migrations/010_comparison_document
 */

module.exports = {
  version: 10,
  name: 'comparison_document',

  up(db) {
    db.run('ALTER TABLE requisitions ADD COLUMN comparison_file_path TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN comparison_original_filename TEXT');
  },
};
