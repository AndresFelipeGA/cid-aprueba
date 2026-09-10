const db = require('../config/database');
// Step→role mapping lives in config/workflow.js (shared with the frontend via /api/meta)
const { STEP_TO_ROLE_MAP, MAX_STEP_LEVEL, FIRST_APPROVAL_LEVEL } = require('../config/workflow');

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
   * Create all steps for a requisition. Step 1 (radicación) is completed by the
   * upload itself, so it is created as approved; steps ≥ FIRST_APPROVAL_LEVEL are pending.
   * @returns {Array} The created approval steps
   */
  createAll(requisitionId) {
    const insertStmt = db.prepare(`
      INSERT INTO approval_steps (requisition_id, step_level, status, assigned_role_level)
      VALUES (?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (let step = 1; step <= MAX_STEP_LEVEL; step++) {
        const status = step < FIRST_APPROVAL_LEVEL ? 'approved' : 'pending';
        insertStmt.run(requisitionId, step, status, STEP_TO_ROLE_MAP[step]);
      }
    })();

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

  /**
   * Put every step from `fromLevel` onwards back to pending (used when a
   * requisition is returned). Steps below FIRST_APPROVAL_LEVEL are re-approved
   * automatically when the coordinator resubmits, so they stay approved unless
   * the return goes all the way to step 1.
   */
  resetFromLevel(requisitionId, fromLevel) {
    db.prepare(`
      UPDATE approval_steps
      SET status = 'pending', updated_at = datetime('now')
      WHERE requisition_id = ? AND step_level >= ?
    `).run(requisitionId, fromLevel);
  },

  /** Mark radicación (step 1) approved again after a resubmission. */
  approveRadicacion(requisitionId) {
    db.prepare(`
      UPDATE approval_steps
      SET status = 'approved', updated_at = datetime('now')
      WHERE requisition_id = ? AND step_level < ?
    `).run(requisitionId, FIRST_APPROVAL_LEVEL);
  },
};

module.exports = ApprovalStep;
module.exports.STEP_TO_ROLE_MAP = STEP_TO_ROLE_MAP;
module.exports.MAX_STEP_LEVEL = MAX_STEP_LEVEL;
