/**
 * Migration 009 — Payment terms per quotation
 *
 * Adds `advance_percent` to quotations: the percentage paid upfront (anticipo);
 * the remainder (contra entrega) is always `100 - advance_percent`, derived on
 * the fly rather than stored twice. Nullable so quotations created before this
 * field existed are simply treated as "not specified".
 *
 * @module migrations/009_quotation_payment_terms
 */

module.exports = {
  version: 9,
  name: 'quotation_payment_terms',

  up(db) {
    db.run('ALTER TABLE quotations ADD COLUMN advance_percent REAL');
  },
};
