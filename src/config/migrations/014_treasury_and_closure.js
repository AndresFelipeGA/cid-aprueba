/**
 * Migration 014 — Tesorería role + delivery/closure steps (8 → 12 steps)
 *
 * 1. Renames role_level 6 from "Área de Compras" to "Tesorería" (the account
 *    'area.compras' becomes 'tesoreria' — same row, same password).
 * 2. Área Financiera (step 7) keeps its position but loses upload rights —
 *    no schema change needed for that, just app-level routing.
 * 3. Old step 8 (Área de Compras' final approval) is replaced by four new
 *    steps (8–11: Tesorería advance payment, Compras confirmation, Compras
 *    delivery documents, Tesorería final payment) plus a new joint closure
 *    step 12 (Coordinador/a de Territorio AND Encargado/a de Compras both
 *    approve independently). Everything at old level ≥8 shifts by +4;
 *    level 7 (Financiera) is untouched since its position didn't move.
 * 4. Adds the closure columns to `requisitions`: two nullable approval
 *    timestamps for the joint step, and two nullable file slots for the
 *    coordinator's closing documents (at least one required to approve).
 *
 * Any requisition already at or past the old final step (shifted level ≥12)
 * is grandfathered through the four new steps with them auto-approved —
 * they never existed for it. The new joint step 12 itself is left pending
 * with no prior approvals, since there's no old equivalent of "both Compras
 * and the Coordinador approved" to grandfather from.
 *
 * @module migrations/014_treasury_and_closure
 */

module.exports = {
  version: 14,
  name: 'treasury_and_closure',
  disableForeignKeys: true,

  up(db) {
    // ── 1. Rename the role-6 account ───────────────────────────────────
    db.run(`
      UPDATE users
      SET username = 'tesoreria',
          email = 'tesoreria@cid.org.co',
          full_name = 'Tesorería',
          updated_at = datetime('now')
      WHERE username = 'area.compras'
    `);

    // ── 2. Make room: shift existing levels ≥8 by +4 ───────────────────
    db.run('UPDATE requisitions SET current_approval_level = current_approval_level + 4 WHERE current_approval_level >= 8');
    db.run('UPDATE requisitions SET returned_from_level = returned_from_level + 4 WHERE returned_from_level >= 8');
    db.run('UPDATE approval_logs SET to_level = to_level + 4 WHERE to_level >= 8');

    // New requisitions columns for the joint closure step.
    db.run('ALTER TABLE requisitions ADD COLUMN final_compras_approved_at TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN final_coordinador_approved_at TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN closure_listing_file_path TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN closure_listing_original_filename TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN closure_minutes_file_path TEXT');
    db.run('ALTER TABLE requisitions ADD COLUMN closure_minutes_original_filename TEXT');

    // approval_steps.step_level has a CHECK (1-8); rebuild with CHECK (1-12).
    // Old step 8 (Área de Compras' sole final approval) becomes the new joint
    // step 12 — its assigned_role_level is rewritten to 1 (Coordinador), the
    // primary role stored for that step; the real authorization check uses
    // CLOSURE_ROLES ([1, 4]) in application code, not this column.
    db.run(`
      CREATE TABLE approval_steps_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        step_level INTEGER NOT NULL CHECK (step_level >= 1 AND step_level <= 12),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        assigned_role_level INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
      )
    `);
    db.run(`
      INSERT INTO approval_steps_new (id, requisition_id, step_level, status, assigned_role_level, created_at, updated_at)
      SELECT id, requisition_id,
             CASE WHEN step_level >= 8 THEN step_level + 4 ELSE step_level END,
             status,
             CASE WHEN step_level >= 8 THEN 1 ELSE assigned_role_level END,
             created_at, updated_at
      FROM approval_steps
    `);
    db.run('DROP TABLE approval_steps');
    db.run('ALTER TABLE approval_steps_new RENAME TO approval_steps');

    // ── 3. Insert the four brand-new steps (8–11) for every requisition ──
    // Post-shift, current_approval_level is never 8–11 (only ≤7, or 12/13),
    // so "≥12" unambiguously means "was already past the old final step".
    const newSteps = [
      [8, 6], // Tesorería — anticipo
      [9, 4], // Encargado/a de Compras — confirma anticipo
      [10, 4], // Encargado/a de Compras — documentos de entrega
      [11, 6], // Tesorería — pago final
    ];
    for (const [stepLevel, roleLevel] of newSteps) {
      db.run(`
        INSERT INTO approval_steps (requisition_id, step_level, status, assigned_role_level)
        SELECT r.id, ${stepLevel}, CASE WHEN r.current_approval_level >= 12 THEN 'approved' ELSE 'pending' END, ${roleLevel}
        FROM requisitions r
        WHERE NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.requisition_id = r.id AND s.step_level = ${stepLevel})
      `);
    }
  },
};
