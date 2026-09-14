/**
 * Migration 008 — Budget cap per requisition
 *
 * Adds `budget_cap` to requisitions: the maximum amount a provider quotation
 * may reach for that requisition. Nullable so existing requisitions (created
 * before this field existed) are simply treated as having no cap.
 *
 * @module migrations/008_budget_cap
 */

module.exports = {
  version: 8,
  name: 'budget_cap',

  up(db) {
    db.run('ALTER TABLE requisitions ADD COLUMN budget_cap REAL');
  },
};
