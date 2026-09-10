const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const AppError = require('../utils/AppError');
const { CURRENCY } = require('../config/workflow');

const MAX_QUOTATIONS = 3;

const Quotation = {
  MAX_QUOTATIONS,

  findByRequisition(requisitionId) {
    const quotations = db.prepare(`
      SELECT * FROM quotations
      WHERE requisition_id = ?
      ORDER BY created_at ASC
    `).all(requisitionId);

    if (quotations.length === 0) return [];

    const quotationIds = quotations.map((q) => q.id);
    const placeholders = quotationIds.map(() => '?').join(',');
    const documents = db.prepare(`
      SELECT * FROM quotation_documents
      WHERE quotation_id IN (${placeholders})
      ORDER BY created_at ASC
    `).all(...quotationIds);

    // Group documents by quotation_id
    const docsByQuotation = {};
    for (const doc of documents) {
      if (!docsByQuotation[doc.quotation_id]) {
        docsByQuotation[doc.quotation_id] = [];
      }
      docsByQuotation[doc.quotation_id].push(doc);
    }

    // Merge documents into quotations
    return quotations.map((q) => ({
      ...q,
      documents: docsByQuotation[q.id] || [],
    }));
  },

  findById(id) {
    const quotation = db.prepare(`
      SELECT * FROM quotations WHERE id = ?
    `).get(id);

    if (!quotation) return undefined;

    const documents = db.prepare(`
      SELECT * FROM quotation_documents
      WHERE quotation_id = ?
      ORDER BY created_at ASC
    `).all(id);

    return {
      ...quotation,
      documents,
    };
  },

  create({ requisitionId, providerName, amount, currency = CURRENCY, notes, filePath, originalFilename, createdBy }) {
    // Check max 3 quotations per requisition
    const count = Quotation.countByRequisition(requisitionId);
    if (count >= MAX_QUOTATIONS) {
      throw new AppError(`La requisición ya tiene el máximo de ${MAX_QUOTATIONS} cotizaciones`, 400, 'MAX_QUOTATIONS_REACHED');
    }

    const result = db.prepare(`
      INSERT INTO quotations (requisition_id, provider_name, amount, currency, notes, file_path, original_filename, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requisitionId, providerName, amount, currency, notes || null, filePath, originalFilename, createdBy);

    return Quotation.findById(result.lastInsertRowid);
  },

  /** Undo any selection (used when a requisition is returned to step 5 or earlier). */
  resetSelection(requisitionId) {
    db.prepare(`
      UPDATE quotations SET status = 'active', updated_at = datetime('now')
      WHERE requisition_id = ?
    `).run(requisitionId);
  },

  delete(id) {
    const quotation = Quotation.findById(id);
    if (!quotation) return;

    const performDelete = db.transaction(() => {
      // Get all document file paths before deleting
      const documents = db.prepare(`
        SELECT file_path FROM quotation_documents WHERE quotation_id = ?
      `).all(id);

      // Delete quotation documents from DB
      db.prepare('DELETE FROM quotation_documents WHERE quotation_id = ?').run(id);

      // Delete quotation from DB
      db.prepare('DELETE FROM quotations WHERE id = ?').run(id);

      // Delete physical files
      for (const doc of documents) {
        const fullPath = path.resolve(doc.file_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }

      // Delete quotation file
      const quotationFilePath = path.resolve(quotation.file_path);
      if (fs.existsSync(quotationFilePath)) {
        fs.unlinkSync(quotationFilePath);
      }
    });

    performDelete();
  },

  countByRequisition(requisitionId) {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM quotations WHERE requisition_id = ?
    `).get(requisitionId);
    return result.count;
  },

  hasCompleteQuotation(requisitionId) {
    const result = db.prepare(`
      SELECT q.id FROM quotations q
      WHERE q.requisition_id = ?
        AND (SELECT COUNT(DISTINCT qd.doc_type) FROM quotation_documents qd WHERE qd.quotation_id = q.id) = 4
      LIMIT 1
    `).get(requisitionId);
    return !!result;
  },

  /**
   * Select a quotation for a requisition. Marks the chosen quotation as
   * 'selected', all others as 'not_selected', and updates the requisition's
   * selected_quotation_id.
   * @param {number} quotationId - The quotation to select
   * @param {number} requisitionId - The requisition that owns the quotation
   * @returns {object} The selected quotation
   */
  selectQuotation(quotationId, requisitionId) {
    const quotation = Quotation.findById(quotationId);
    if (!quotation) {
      throw new AppError('Cotización no encontrada', 404, 'QUOTATION_NOT_FOUND');
    }
    if (quotation.requisition_id !== requisitionId) {
      throw new AppError('La cotización no pertenece a esta requisición', 400, 'QUOTATION_MISMATCH');
    }

    // Three dependent updates: atomic on their own, and they join any outer transaction
    db.transaction(() => {
      db.prepare(`
        UPDATE quotations SET status = 'not_selected', updated_at = datetime('now')
        WHERE requisition_id = ?
      `).run(requisitionId);

      db.prepare(`
        UPDATE quotations SET status = 'selected', updated_at = datetime('now')
        WHERE id = ?
      `).run(quotationId);

      db.prepare(`
        UPDATE requisitions SET selected_quotation_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(quotationId, requisitionId);
    })();

    return Quotation.findById(quotationId);
  },

  /**
   * Check if a requisition has a selected quotation.
   * @param {number} requisitionId - The requisition ID
   * @returns {boolean} True if a quotation with status='selected' exists
   */
  hasSelectedQuotation(requisitionId) {
    const result = db.prepare(`
      SELECT id FROM quotations WHERE requisition_id = ? AND status = 'selected' LIMIT 1
    `).get(requisitionId);
    return !!result;
  },
};

module.exports = Quotation;
