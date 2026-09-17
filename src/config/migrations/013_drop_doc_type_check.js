/**
 * Migration 013 — Drop the doc_type CHECK constraint on quotation_documents
 *
 * That CHECK hardcoded a fixed list of doc types and had to be rebuilt via a
 * new migration every time a type was added (007 already did this once to
 * add 'comprobante_pago'). Valid doc types are already validated at the
 * application layer against config/workflow.js (the single source of truth,
 * per ARCHITECTURE.md's "step→role mapping is configurable, not hardcoded"
 * principle) — the DB-level CHECK was redundant and had drifted out of sync
 * with OPTIONAL_QUOTATION_DOC_TYPES / FINAL_PURCHASE_DOC_TYPES.
 *
 * @module migrations/013_drop_doc_type_check
 */

module.exports = {
  version: 13,
  name: 'drop_doc_type_check',
  disableForeignKeys: true,

  up(db) {
    db.run(`
      CREATE TABLE quotation_documents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id),
        UNIQUE(quotation_id, doc_type)
      )
    `);

    db.run(`
      INSERT INTO quotation_documents_new (id, quotation_id, doc_type, file_path, original_filename, created_at)
      SELECT id, quotation_id, doc_type, file_path, original_filename, created_at FROM quotation_documents
    `);

    db.run('DROP TABLE quotation_documents');
    db.run('ALTER TABLE quotation_documents_new RENAME TO quotation_documents');
  },
};
