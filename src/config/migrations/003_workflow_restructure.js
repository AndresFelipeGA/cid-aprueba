/**
 * Migration 003 — Workflow Restructure (6 → 7 steps)
 *
 * 1. Adds `status` column to quotations table
 * 2. Adds `updated_at` column to quotations table (missing from 001)
 * 3. Adds `selected_quotation_id` column to requisitions table
 * 4. Recreates approval_steps table with step_level CHECK 1-7
 * 5. Updates user roles: removes analista, renames revisor, adds area.compras
 *
 * @module migrations/003_workflow_restructure
 */

const bcrypt = require('bcryptjs');

module.exports = {
  version: 3,
  name: 'workflow_restructure',

  /**
   * Apply the migration.
   * @param {object} db - Raw sql.js Database instance
   */
  up(db) {
    // ── 1. Add `status` column to quotations ──────────────────────────
    const quotationCols = db.exec('PRAGMA table_info(quotations)');
    const hasStatusCol = quotationCols.length > 0 &&
      quotationCols[0].values.some((row) => row[1] === 'status');

    if (!hasStatusCol) {
      db.run(`
        ALTER TABLE quotations
        ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'selected', 'not_selected'))
      `);
    }

    // ── 2. Add `updated_at` column to quotations (missing from 001) ──
    const hasUpdatedAt = quotationCols.length > 0 &&
      quotationCols[0].values.some((row) => row[1] === 'updated_at');

    if (!hasUpdatedAt) {
      db.run(`
        ALTER TABLE quotations
        ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))
      `);
    }

    // ── 3. Add `selected_quotation_id` column to requisitions ─────────
    const reqCols = db.exec('PRAGMA table_info(requisitions)');
    const hasSelectedCol = reqCols.length > 0 &&
      reqCols[0].values.some((row) => row[1] === 'selected_quotation_id');

    if (!hasSelectedCol) {
      db.run(`
        ALTER TABLE requisitions
        ADD COLUMN selected_quotation_id INTEGER DEFAULT NULL
        REFERENCES quotations(id)
      `);
    }

    // ── 4. Recreate approval_steps with step_level CHECK 1-7 ─────────
    db.run(`
      CREATE TABLE IF NOT EXISTS approval_steps_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        step_level INTEGER NOT NULL CHECK (step_level >= 1 AND step_level <= 7),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        assigned_role_level INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
      )
    `);

    // Check if old table has data to copy
    const oldData = db.exec('SELECT COUNT(*) FROM approval_steps');
    const oldCount = oldData.length > 0 ? oldData[0].values[0][0] : 0;

    if (oldCount > 0) {
      db.run('INSERT INTO approval_steps_new SELECT * FROM approval_steps');
    }

    db.run('DROP TABLE approval_steps');
    db.run('ALTER TABLE approval_steps_new RENAME TO approval_steps');

    // ── 5. Update user roles ──────────────────────────────────────────
    db.run("DELETE FROM users WHERE username = 'analista'");

    db.run(`
      UPDATE users
      SET username = 'area.financiera',
          email = 'area.financiera@cid.org.co',
          full_name = 'Área Financiera',
          role_level = 5,
          updated_at = datetime('now')
      WHERE username = 'revisor'
    `);

    const existing = db.exec("SELECT COUNT(*) FROM users WHERE username = 'area.compras'");
    const count = existing.length > 0 ? existing[0].values[0][0] : 0;
    if (count === 0) {
      const passwordHash = bcrypt.hashSync('cid2024', 10);
      db.run(
        'INSERT INTO users (username, email, password_hash, full_name, role_level, territory) VALUES (?, ?, ?, ?, ?, ?)',
        ['area.compras', 'area.compras@cid.org.co', passwordHash, 'Área de Compras', 6, null],
      );
    }
  },
};
