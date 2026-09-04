const db = require('../config/database');

const ApprovalLog = {
  create({ requisitionId, approvalStepId, userId, action, comments }) {
    const result = db.prepare(`
      INSERT INTO approval_logs (requisition_id, approval_step_id, user_id, action, comments)
      VALUES (?, ?, ?, ?, ?)
    `).run(requisitionId, approvalStepId || null, userId, action, comments || null);

    return db.prepare('SELECT * FROM approval_logs WHERE id = ?').get(result.lastInsertRowid);
  },

  findByRequisition(requisitionId) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.requisition_id = ?
      ORDER BY al.created_at DESC
    `).all(requisitionId);
  },

  findRecent({ limit = 20 } = {}) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username,
             r.title AS requisition_title
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      JOIN requisitions r ON al.requisition_id = r.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
  },
};

module.exports = ApprovalLog;
