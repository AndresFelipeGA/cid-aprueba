const db = require('../config/database');

const Requisition = {
  findById(id) {
    return db.prepare(`
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r
      JOIN users u ON r.uploaded_by = u.id
      WHERE r.id = ?
    `).get(id);
  },

  findAll({ limit = 20, offset = 0, userRoleLevel } = {}) {
    let query = `
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r
      JOIN users u ON r.uploaded_by = u.id
    `;
    const params = [];

    if (userRoleLevel) {
      query += ' WHERE r.current_approval_level >= ? OR r.status IN (\'approved\', \'rejected\')';
      params.push(userRoleLevel);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = db.prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as total FROM requisitions';
    const countParams = [];
    if (userRoleLevel) {
      countQuery += ' WHERE current_approval_level >= ? OR status IN (\'approved\', \'rejected\')';
      countParams.push(userRoleLevel);
    }
    const { total } = db.prepare(countQuery).get(...countParams);

    return { items, total };
  },

  findByStatus(status, { limit = 20, offset = 0 } = {}) {
    const items = db.prepare(`
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r
      JOIN users u ON r.uploaded_by = u.id
      WHERE r.status = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(status, limit, offset);

    const { total } = db.prepare(
      'SELECT COUNT(*) as total FROM requisitions WHERE status = ?'
    ).get(status);

    return { items, total };
  },

  create({ title, description, filePath, originalFilename, uploadedBy }) {
    const result = db.prepare(`
      INSERT INTO requisitions (title, description, file_path, original_filename, uploaded_by, status, current_approval_level)
      VALUES (?, ?, ?, ?, ?, 'pending', 1)
    `).run(title, description || null, filePath, originalFilename, uploadedBy);

    return Requisition.findById(result.lastInsertRowid);
  },

  updateStatus(id, { status, currentApprovalLevel }) {
    const fields = [];
    const values = [];

    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }
    if (currentApprovalLevel !== undefined) {
      fields.push('current_approval_level = ?');
      values.push(currentApprovalLevel);
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE requisitions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return Requisition.findById(id);
  },

  getWithApprovals(id) {
    const requisition = Requisition.findById(id);
    if (!requisition) return null;

    const approvalSteps = db.prepare(`
      SELECT * FROM approval_steps
      WHERE requisition_id = ?
      ORDER BY step_level ASC
    `).all(id);

    const approvalLogs = db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.requisition_id = ?
      ORDER BY al.created_at DESC
    `).all(id);

    return {
      ...requisition,
      approval_steps: approvalSteps,
      approval_logs: approvalLogs,
    };
  },

  countByStatus() {
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM requisitions
    `).get();
  },

  countByLevel() {
    return db.prepare(`
      SELECT current_approval_level as level, COUNT(*) as count
      FROM requisitions
      WHERE status IN ('pending', 'in_review')
      GROUP BY current_approval_level
      ORDER BY current_approval_level ASC
    `).all();
  },

  findPendingForLevel(roleLevel, { limit = 20, offset = 0 } = {}) {
    const items = db.prepare(`
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r
      JOIN users u ON r.uploaded_by = u.id
      WHERE r.current_approval_level = ? AND r.status IN ('pending', 'in_review')
      ORDER BY r.created_at ASC
      LIMIT ? OFFSET ?
    `).all(roleLevel, limit, offset);

    const { total } = db.prepare(
      'SELECT COUNT(*) as total FROM requisitions WHERE current_approval_level = ? AND status IN (\'pending\', \'in_review\')'
    ).get(roleLevel);

    return { items, total };
  },

  findRecent({ limit = 10 } = {}) {
    return db.prepare(`
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r
      JOIN users u ON r.uploaded_by = u.id
      ORDER BY r.updated_at DESC
      LIMIT ?
    `).all(limit);
  },
};

module.exports = Requisition;
