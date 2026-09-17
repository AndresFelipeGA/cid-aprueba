/**
 * Migration 011 — Actual quotation date
 *
 * Adds `quotation_date` to quotations: the date the provider actually issued
 * the quotation, as opposed to `created_at` (when it was uploaded to the
 * platform — often a day or more later). Nullable so quotations created
 * before this field existed are simply treated as "not specified".
 *
 * @module migrations/011_quotation_date
 */

module.exports = {
  version: 11,
  name: 'quotation_date',

  up(db) {
    db.run('ALTER TABLE quotations ADD COLUMN quotation_date TEXT');
  },
};
