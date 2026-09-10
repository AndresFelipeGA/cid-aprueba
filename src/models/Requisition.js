const db = require('../config/database');
const Quotation = require('./Quotation');
const { STEP_TO_ROLE_MAP, FIRST_APPROVAL_LEVEL } = require('../config/workflow');

const FINAL_STATUSES = ['approved', 'rejected'];
const OPEN_STATUSES = ['pending', 'in_review', 'returned'];

const SELECT_WITH_JOINS = `
  SELECT r.*, u.full_name AS uploader_name, u.username AS uploader_username, u.territory AS uploader_territory,
         p.name AS project_name, p.code AS project_code,
         sq.provider_name AS selected_provider_name, sq.amount AS selected_amount
  FROM requisitions r
  JOIN users u ON r.uploaded_by = u.id
  LEFT JOIN projects p ON r.project_id = p.id
  LEFT JOIN quotations sq ON r.selected_quotation_id = sq.id
`;

/**
 * Lowest workflow step a role participates in. A user may see a requisition
 * once it has reached that step, once the workflow has finished, or if they
 * have acted on it (e.g. returned it to an earlier step).
 */
const minStepForRole = (roleLevel) => {
  const steps = Object.entries(STEP_TO_ROLE_MAP)
    .filter(([, role]) => role === roleLevel)
    .map(([step]) => parseInt(step, 10));
  return steps.length ? Math.min(...steps) : Infinity;
};

/** SQL fragment + params implementing the visibility rule for a user. `alias` is the requisitions alias. */
const visibilityClause = (user, alias = 'r') => ({
  sql: `(${alias}.current_approval_level >= ? OR ${alias}.status IN ('approved', 'rejected')
         OR EXISTS (SELECT 1 FROM approval_logs vl WHERE vl.requisition_id = ${alias}.id AND vl.user_id = ?))`,
  params: [minStepForRole(user.role_level), user.id],
});

const hasActedOn = (requisitionId, userId) => !!db.prepare(
  'SELECT 1 FROM approval_logs WHERE requisition_id = ? AND user_id = ? LIMIT 1',
).get(requisitionId, userId);

const Requisition = {
  FINAL_STATUSES,
  OPEN_STATUSES,
  visibilityClause,

  /**
   * Whether a user may view a requisition (same rule as list filtering).
   * @param {object} requisition
   * @param {{ id: number, role_level: number }} user
   */
  isVisibleTo(requisition, user) {
    return FINAL_STATUSES.includes(requisition.status)
      || requisition.current_approval_level >= minStepForRole(user.role_level)
      || hasActedOn(requisition.id, user.id);
  },

  findById(id) {
    return db.prepare(`${SELECT_WITH_JOINS} WHERE r.id = ?`).get(id);
  },

  /**
   * Paginated list. Pass `user` to apply the visibility rule, `status` to filter.
   */
  findAll({ limit = 20, offset = 0, user, status } = {}) {
    const where = [];
    const params = [];

    if (status) {
      where.push('r.status = ?');
      params.push(status);
    }
    if (user) {
      const vis = visibilityClause(user);
      where.push(vis.sql);
      params.push(...vis.params);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const items = db.prepare(`
      ${SELECT_WITH_JOINS} ${whereSql}
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const { total } = db.prepare(
      `SELECT COUNT(*) as total FROM requisitions r ${whereSql}`,
    ).get(...params);

    return { items, total };
  },

  findByStatus(status, { limit = 20, offset = 0, user } = {}) {
    return Requisition.findAll({ limit, offset, user, status });
  },

  /** All visible requisitions (no pagination) for exports. */
  findAllForExport(user) {
    const vis = visibilityClause(user);
    return db.prepare(`${SELECT_WITH_JOINS} WHERE ${vis.sql} ORDER BY r.created_at DESC`).all(...vis.params);
  },

  /** Next readable number, REQ-<year>-<4-digit sequence within the year>. Call inside a transaction. */
  nextNumber(date = new Date()) {
    const year = String(date.getFullYear());
    const { count } = db.prepare("SELECT COUNT(*) as count FROM requisitions WHERE number LIKE ?").get(`REQ-${year}-%`);
    return `REQ-${year}-${String(count + 1).padStart(4, '0')}`;
  },

  /**
   * Create a requisition. Uploading completes step 1, so it starts in review at FIRST_APPROVAL_LEVEL.
   */
  create({ title, description, filePath, originalFilename, uploadedBy, projectId }) {
    const number = Requisition.nextNumber();
    const result = db.prepare(`
      INSERT INTO requisitions (number, title, description, file_path, original_filename, uploaded_by, project_id, status, current_approval_level, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'in_review', ?, 1)
    `).run(number, title, description || null, filePath, originalFilename, uploadedBy, projectId || null, FIRST_APPROVAL_LEVEL);

    const id = result.lastInsertRowid;
    Requisition.addVersion({ requisitionId: id, version: 1, title, description, filePath, originalFilename, createdBy: uploadedBy });

    return Requisition.findById(id);
  },

  /** Partial update of workflow fields. Pass `null` to clear return_reason / returned_from_level / selected_quotation_id. */
  updateStatus(id, { status, currentApprovalLevel, returnReason, returnedFromLevel, selectedQuotationId }) {
    const map = {
      status,
      current_approval_level: currentApprovalLevel,
      return_reason: returnReason,
      returned_from_level: returnedFromLevel,
      selected_quotation_id: selectedQuotationId,
    };
    const fields = [];
    const values = [];
    for (const [column, value] of Object.entries(map)) {
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value);
      }
    }
    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE requisitions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return Requisition.findById(id);
  },

  // ── Versions ──────────────────────────────────────────────────────────

  addVersion({ requisitionId, version, title, description, filePath, originalFilename, comments, createdBy }) {
    const result = db.prepare(`
      INSERT INTO requisition_versions (requisition_id, version, title, description, file_path, original_filename, comments, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requisitionId, version, title, description || null, filePath, originalFilename, comments || null, createdBy);
    return db.prepare('SELECT * FROM requisition_versions WHERE id = ?').get(result.lastInsertRowid);
  },

  findVersions(requisitionId) {
    return db.prepare(`
      SELECT v.*, u.full_name AS created_by_name
      FROM requisition_versions v
      JOIN users u ON v.created_by = u.id
      WHERE v.requisition_id = ?
      ORDER BY v.version ASC
    `).all(requisitionId);
  },

  findVersion(requisitionId, versionId) {
    return db.prepare(
      'SELECT * FROM requisition_versions WHERE requisition_id = ? AND id = ?',
    ).get(requisitionId, versionId);
  },

  /**
   * Replace the current document with a new version (after a return to step 1).
   * Caller is responsible for resetting steps and logging; wrap in a transaction.
   */
  resubmit(id, { title, description, filePath, originalFilename, comments, userId }) {
    const current = Requisition.findById(id);
    const version = current.version + 1;

    db.prepare(`
      UPDATE requisitions
      SET title = ?, description = ?, file_path = ?, original_filename = ?, version = ?,
          status = 'in_review', current_approval_level = ?, return_reason = NULL, returned_from_level = NULL,
          selected_quotation_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(title, description || null, filePath, originalFilename, version, FIRST_APPROVAL_LEVEL, id);

    Requisition.addVersion({ requisitionId: id, version, title, description, filePath, originalFilename, comments, createdBy: userId });
    return Requisition.findById(id);
  },

  // ── Detail ────────────────────────────────────────────────────────────

  getWithApprovals(id) {
    const requisition = Requisition.findById(id);
    if (!requisition) return null;

    const approvalSteps = db.prepare(`
      SELECT * FROM approval_steps WHERE requisition_id = ? ORDER BY step_level ASC
    `).all(id);

    const approvalLogs = db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.username, u.gender AS user_gender, u.role_level AS user_role_level
      FROM approval_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.requisition_id = ?
      ORDER BY al.created_at DESC, al.id DESC
    `).all(id);

    return {
      ...requisition,
      approval_steps: approvalSteps,
      approval_logs: approvalLogs,
      quotations: Quotation.findByRequisition(id),
      versions: Requisition.findVersions(id),
    };
  },

  // ── Dashboard ─────────────────────────────────────────────────────────

  countByStatus() {
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM requisitions
    `).get();
  },

  countByLevel() {
    return db.prepare(`
      SELECT current_approval_level as level, COUNT(*) as count
      FROM requisitions
      WHERE status IN ('pending', 'in_review', 'returned')
      GROUP BY current_approval_level
      ORDER BY current_approval_level ASC
    `).all();
  },

  /**
   * Requisitions waiting on a role: open ones sitting at any step that role owns.
   * For role 1 this means requisitions returned to step 1 awaiting a new version.
   */
  findPendingForRole(roleLevel, { limit = 20, offset = 0 } = {}) {
    const steps = Object.entries(STEP_TO_ROLE_MAP)
      .filter(([, role]) => role === roleLevel)
      .map(([step]) => parseInt(step, 10));
    const placeholders = steps.map(() => '?').join(',');
    const where = `r.current_approval_level IN (${placeholders}) AND r.status IN ('pending', 'in_review', 'returned')`;

    const items = db.prepare(`
      ${SELECT_WITH_JOINS} WHERE ${where}
      ORDER BY r.updated_at ASC LIMIT ? OFFSET ?
    `).all(...steps, limit, offset);

    const { total } = db.prepare(
      `SELECT COUNT(*) as total FROM requisitions r WHERE ${where}`,
    ).get(...steps);

    return { items, total };
  },

  findRecent({ limit = 10 } = {}) {
    return db.prepare(`${SELECT_WITH_JOINS} ORDER BY r.updated_at DESC LIMIT ?`).all(limit);
  },
};

module.exports = Requisition;
