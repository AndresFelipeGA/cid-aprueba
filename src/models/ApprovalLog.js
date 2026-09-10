const db = require('../config/database');

const ApprovalLog = {
  /**
   * @param {object} entry
   * @param {number} [entry.toLevel] - For 'returned' actions: the step the requisition was sent back to
   */
  create({ requisitionId, approvalStepId, userId, action, comments, toLevel }) {
    const result = db.prepare(`
      INSERT INTO approval_logs (requisition_id, approval_step_id, user_id, action, comments, to_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(requisitionId, approvalStepId || null, userId, action, comments || null, toLevel ?? null);

    return db.prepare('SELECT * FROM approval_logs WHERE id = ?').get(result.lastInsertRowid);
  },

  findByRequisition(requisitionId) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username, u.role_level AS user_role_level
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.requisition_id = ?
      ORDER BY al.created_at DESC, al.id DESC
    `).all(requisitionId);
  },

  findRecent({ limit = 20 } = {}) {
    return db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username,
             r.title AS requisition_title, r.number AS requisition_number
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      JOIN requisitions r ON al.requisition_id = r.id
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ?
    `).all(limit);
  },

  /** Full audit trail for the requisitions visible to a user (for CSV export). */
  findAllForExport(visibility) {
    return db.prepare(`
      SELECT al.created_at, r.number AS requisition_number, r.title AS requisition_title,
             u.full_name AS user_name, u.username, u.role_level AS user_role_level,
             al.action, s.step_level, al.to_level, al.comments
      FROM approval_logs al
      JOIN requisitions r ON al.requisition_id = r.id
      JOIN users u ON al.user_id = u.id
      LEFT JOIN approval_steps s ON al.approval_step_id = s.id
      WHERE ${visibility.sql}
      ORDER BY al.created_at DESC, al.id DESC
    `).all(...visibility.params);
  },
};

module.exports = ApprovalLog;
