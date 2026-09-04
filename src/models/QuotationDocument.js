const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const AppError = require('../utils/AppError');

const QuotationDocument = {
  findByQuotation(quotationId) {
    return db.prepare(`
      SELECT * FROM quotation_documents
      WHERE quotation_id = ?
      ORDER BY created_at ASC
    `).all(quotationId);
  },

  findById(id) {
    return db.prepare(`
      SELECT * FROM quotation_documents WHERE id = ?
    `).get(id);
  },

  create({ quotationId, docType, filePath, originalFilename }) {
    // Check if this quotation already has a document of this type
    const existing = QuotationDocument.findByQuotationAndType(quotationId, docType);
    if (existing) {
      throw new AppError('Este tipo de documento ya fue adjuntado para esta cotización', 400);
    }

    const result = db.prepare(`
      INSERT INTO quotation_documents (quotation_id, doc_type, file_path, original_filename)
      VALUES (?, ?, ?, ?)
    `).run(quotationId, docType, filePath, originalFilename);

    return QuotationDocument.findById(result.lastInsertRowid);
  },

  delete(id) {
    const document = QuotationDocument.findById(id);
    if (!document) return;

    // Delete from DB
    db.prepare('DELETE FROM quotation_documents WHERE id = ?').run(id);

    // Delete physical file
    const fullPath = path.resolve(document.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  },

  findByQuotationAndType(quotationId, docType) {
    return db.prepare(`
      SELECT * FROM quotation_documents
      WHERE quotation_id = ? AND doc_type = ?
    `).get(quotationId, docType);
  },
};

module.exports = QuotationDocument;
