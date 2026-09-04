const db = require('../config/database');

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

  createAll(requisitionId) {
    const insertStmt = db.prepare(`
      INSERT INTO approval_steps (requisition_id, step_level, status, assigned_role_level)
      VALUES (?, ?, 'pending', ?)
    `);

    const createSteps = db.transaction(() => {
      for (let level = 1; level <= 6; level++) {
        insertStmt.run(requisitionId, level, level);
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
