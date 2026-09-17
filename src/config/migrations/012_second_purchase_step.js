/**
 * Migration 012 — Second Encargado/a de Compras approval step (7 → 8 steps)
 *
 * Inserts a new step between "Selección de Cotización" (5) and "Aprobación
 * Financiera" (old 6): Encargado/a de Compras approves a second time and may
 * attach final purchase documents (orden de compra, póliza, contrato,
 * factura, cuenta de cobro, certificado bancario — all optional). The old
 * steps 6 and 7 (Financiera, Compras final) shift to 7 and 8.
 *
 * Any requisition that had already moved past the old step 5 before this
 * migration ran (i.e. its shifted level lands at 7 or above) is grandfathered
 * through the new step 6 with it auto-approved — it never existed for them.
 * Everything at or before step 5 simply gets it as a normal pending step,
 * same as new radicaciones will from now on.
 *
 * @module migrations/012_second_purchase_step
 */

module.exports = {
  version: 12,
  name: 'second_purchase_step',

  up(db) {
    // ── Make room: shift existing levels ≥6 by +1 ──────────────────────
    db.run('UPDATE requisitions SET current_approval_level = current_approval_level + 1 WHERE current_approval_level >= 6');
    db.run('UPDATE requisitions SET returned_from_level = returned_from_level + 1 WHERE returned_from_level >= 6');
    db.run('UPDATE approval_logs SET to_level = to_level + 1 WHERE to_level >= 6');

    // approval_steps.step_level has a CHECK (1-7); SQLite can't alter a CHECK
    // constraint, so rebuild the table with CHECK (1-8) while shifting rows.
    db.run(`
      CREATE TABLE approval_steps_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        step_level INTEGER NOT NULL CHECK (step_level >= 1 AND step_level <= 8),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        assigned_role_level INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
      )
    `);
    db.run(`
      INSERT INTO approval_steps_new (id, requisition_id, step_level, status, assigned_role_level, created_at, updated_at)
      SELECT id, requisition_id, CASE WHEN step_level >= 6 THEN step_level + 1 ELSE step_level END,
             status, assigned_role_level, created_at, updated_at
      FROM approval_steps
    `);
    db.run('DROP TABLE approval_steps');
    db.run('ALTER TABLE approval_steps_new RENAME TO approval_steps');

    // ── Insert the new step 6 for every requisition that doesn't have one ──
    // Post-shift, current_approval_level is never exactly 6 (only ≤5 or ≥7),
    // so "≥7" unambiguously means "was already past the old step 5".
    db.run(`
      INSERT INTO approval_steps (requisition_id, step_level, status, assigned_role_level)
      SELECT r.id, 6, CASE WHEN r.current_approval_level >= 7 THEN 'approved' ELSE 'pending' END, 4
      FROM requisitions r
      WHERE NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.requisition_id = r.id AND s.step_level = 6)
    `);
  },
};
