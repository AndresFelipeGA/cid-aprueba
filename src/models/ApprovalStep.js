const db = require('../config/database');

const ApprovalStep = {
  findByDocument(documentId) {
    return db.prepare(`
      SELECT * FROM approval_steps
      WHERE document_id = ?
      ORDER BY step_level ASC
    `).all(documentId);
  },

  findByDocumentAndLevel(documentId, stepLevel) {
    return db.prepare(`
      SELECT * FROM approval_steps
      WHERE document_id = ? AND step_level = ?
    `).get(documentId, stepLevel);
  },

  createAll(documentId) {
    const insertStmt = db.prepare(`
      INSERT INTO approval_steps (document_id, step_level, status, assigned_role_level)
      VALUES (?, ?, 'pending', ?)
    `);

    const createSteps = db.transaction(() => {
      for (let level = 1; level <= 6; level++) {
        insertStmt.run(documentId, level, level);
      }
    });

    createSteps();
    return ApprovalStep.findByDocument(documentId);
  },

  updateStatus(id, status) {
    db.prepare(`
      UPDATE approval_steps
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    return db.prepare('SELECT * FROM approval_steps WHERE id = ?').get(id);
  },
};

module.exports = ApprovalStep;
