/**
 * Migration 007 — Allow a payment-proof document on quotations
 *
 * SQLite cannot ALTER a CHECK constraint, so quotation_documents is rebuilt
 * with 'comprobante_pago' added to the allowed doc_type values (Área
 * Financiera attaches it to the selected quotation at step 6).
 *
 * @module migrations/007_payment_document
 */

module.exports = {
  version: 7,
  name: 'payment_document',
  disableForeignKeys: true,

  up(db) {
    db.run(`
      CREATE TABLE quotation_documents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('rut', 'camara_comercio', 'cedula', 'certificado_bancario', 'comprobante_pago')),
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
