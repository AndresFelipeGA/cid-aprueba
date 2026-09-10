const db = require('../config/database');

// Step→role mapping lives in config/workflow.js (shared with the frontend via /api/meta)
const { STEP_TO_ROLE_MAP, MAX_STEP_LEVEL } = require('../config/workflow');

const ApprovalStep = {
  findByRequisition(requisitionId) {
    return db.prepare(`
      SELECT * FROM approval_steps
      WHERE requisition_id = ?
      ORDER BY step_level ASC
    `).all(requisitionId);
  },

  findByRequisitionAndLevel(requisitionId, stepLevel) {
    return db.prepare(`
      SELECT * FROM approval_steps
      WHERE requisition_id = ? AND step_level = ?
    `).get(requisitionId, stepLevel);
  },

  /**
   * Create all 7 approval steps for a requisition using the step→role mapping.
   * @param {number} requisitionId - The requisition ID
   * @returns {Array} The created approval steps
   */
  createAll(requisitionId) {
    const insertStmt = db.prepare(`
      INSERT INTO approval_steps (requisition_id, step_level, status, assigned_role_level)
      VALUES (?, ?, 'pending', ?)
    `);

    const createSteps = db.transaction(() => {
      for (let step = 1; step <= MAX_STEP_LEVEL; step++) {
        insertStmt.run(requisitionId, step, STEP_TO_ROLE_MAP[step]);
      }
    });

    createSteps();
    return ApprovalStep.findByRequisition(requisitionId);
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
module.exports.STEP_TO_ROLE_MAP = STEP_TO_ROLE_MAP;
module.exports.MAX_STEP_LEVEL = MAX_STEP_LEVEL;
