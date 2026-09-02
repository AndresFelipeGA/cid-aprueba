const db = require('../config/database');

const ApprovalLog = {
  create({ documentId, approvalStepId, userId, action, comments }) {
    const result = db.prepare(`
      INSERT INTO approval_logs (document_id, approval_step_id, user_id, action, comments)
      VALUES (?, ?, ?, ?, ?)
    `).run(documentId, approvalStepId || null, userId, action, comments || null);

    return db.prepare('SELECT * FROM approval_logs WHERE id = ?').get(result.lastInsertRowid);
  },

  findByDocument(documentId) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.document_id = ?
      ORDER BY al.created_at DESC
    `).all(documentId);
  },

  findRecent({ limit = 20 } = {}) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username,
             d.title AS document_title
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      JOIN documents d ON al.document_id = d.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
  },
};

module.exports = ApprovalLog;
