const db = require('../config/database');
const Quotation = require('./Quotation');

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
      const { STEP_TO_ROLE_MAP } = require('./ApprovalStep');
      const minStep = Math.min(
        ...Object.entries(STEP_TO_ROLE_MAP)
          .filter(([_, role]) => role === userRoleLevel)
          .map(([step]) => parseInt(step, 10)),
      );
      query += ' WHERE r.current_approval_level >= ? OR r.status IN (\'approved\', \'rejected\')';
      params.push(minStep);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = db.prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as total FROM requisitions';
    const countParams = [];
    if (userRoleLevel) {
      const { STEP_TO_ROLE_MAP } = require('./ApprovalStep');
      const minStep = Math.min(
        ...Object.entries(STEP_TO_ROLE_MAP)
          .filter(([_, role]) => role === userRoleLevel)
          .map(([step]) => parseInt(step, 10)),
      );
      countQuery += ' WHERE current_approval_level >= ? OR status IN (\'approved\', \'rejected\')';
      countParams.push(minStep);
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
      'SELECT COUNT(*) as total FROM requisitions WHERE status = ?',
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
      SELECT al.*, u.full_name AS user_name, u.username, u.gender AS user_gender, u.role_level AS user_role_level
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.requisition_id = ?
      ORDER BY al.created_at DESC
    `).all(id);

    // Add quotations with their documents
    const quotations = Quotation.findByRequisition(id);

    return {
      ...requisition,
      approval_steps: approvalSteps,
      approval_logs: approvalLogs,
      quotations,
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

  /**
   * Find requisitions pending approval for a given role level.
   * Handles the case where role_level 3 appears at both step 3 and step 5
   * by looking up all step_levels that map to the given role_level.
   * @param {number} roleLevel - The user's role_level
   * @param {object} [options] - Pagination options
   * @param {number} [options.limit=20] - Max items to return
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {{ items: Array, total: number }}
   */
  findPendingForRole(roleLevel, { limit = 20, offset = 0 } = {}) {
    const { STEP_TO_ROLE_MAP } = require('./ApprovalStep');
    const matchingSteps = Object.entries(STEP_TO_ROLE_MAP)
      .filter(([_, role]) => role === roleLevel)
      .map(([step]) => parseInt(step, 10));
    const placeholders = matchingSteps.map(() => '?').join(',');

    const items = db.prepare(`
      SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username
      FROM requisitions r JOIN users u ON r.uploaded_by = u.id
      WHERE r.current_approval_level IN (${placeholders})
        AND r.status IN ('pending', 'in_review')
      ORDER BY r.created_at ASC LIMIT ? OFFSET ?
    `).all(...matchingSteps, limit, offset);

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM requisitions
      WHERE current_approval_level IN (${placeholders})
        AND status IN ('pending', 'in_review')
    `).get(...matchingSteps);

    return { items, total };
  },

  /**
   * @deprecated Use findPendingForRole() instead — kept for backward compatibility
   */
  findPendingForLevel(roleLevel, { limit = 20, offset = 0 } = {}) {
    return Requisition.findPendingForRole(roleLevel, { limit, offset });
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
