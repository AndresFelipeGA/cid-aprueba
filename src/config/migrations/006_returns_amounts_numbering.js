/**
 * Migration 006 — Returns, quotation amounts, readable numbering, versions
 *
 * 1. Rebuilds `requisitions` so `status` accepts 'returned' and adds
 *    number (REQ-YYYY-NNNN), version, return_reason, returned_from_level.
 * 2. Adds amount / currency / notes to quotations.
 * 3. Adds to_level to approval_logs (target step of a return).
 * 4. Creates requisition_versions and seeds version 1 for every requisition.
 * 5. Coordinators no longer approve step 1: uploading IS step 1. Existing
 *    requisitions still waiting at step 1 are advanced to step 2.
 *
 * @module migrations/006_returns_amounts_numbering
 */

const hasColumn = (db, table, column) => {
  const info = db.exec(`PRAGMA table_info(${table})`);
  return info.length > 0 && info[0].values.some((row) => row[1] === column);
};

module.exports = {
  version: 6,
  name: 'returns_amounts_numbering',
  disableForeignKeys: true,

  up(db) {
    // ── 1. Rebuild requisitions with the new status CHECK and columns ──
    db.run(`
      CREATE TABLE requisitions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'in_review'
          CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'returned')),
        current_approval_level INTEGER NOT NULL DEFAULT 2,
        selected_quotation_id INTEGER DEFAULT NULL REFERENCES quotations(id),
        project_id INTEGER REFERENCES projects(id),
        version INTEGER NOT NULL DEFAULT 1,
        return_reason TEXT,
        returned_from_level INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      INSERT INTO requisitions_new
        (id, title, description, file_path, original_filename, uploaded_by, status,
         current_approval_level, selected_quotation_id, project_id, created_at, updated_at)
      SELECT id, title, description, file_path, original_filename, uploaded_by, status,
             current_approval_level, selected_quotation_id, project_id, created_at, updated_at
      FROM requisitions
    `);

    db.run('DROP TABLE requisitions');
    db.run('ALTER TABLE requisitions_new RENAME TO requisitions');

    // Recreate the indexes migration 005 had on the old table
    db.run('CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_requisitions_level ON requisitions(current_approval_level)');
    db.run('CREATE INDEX IF NOT EXISTS idx_requisitions_uploaded_by ON requisitions(uploaded_by)');
    db.run('CREATE INDEX IF NOT EXISTS idx_requisitions_project ON requisitions(project_id)');

    // Backfill readable numbers: REQ-<year>-<sequence within year>, in id order
    const rows = db.exec("SELECT id, strftime('%Y', created_at) FROM requisitions ORDER BY id");
    const perYear = {};
    if (rows.length > 0) {
      for (const [id, year] of rows[0].values) {
        perYear[year] = (perYear[year] || 0) + 1;
        const number = `REQ-${year}-${String(perYear[year]).padStart(4, '0')}`;
        db.run('UPDATE requisitions SET number = ? WHERE id = ?', [number, id]);
      }
    }

    // ── 2. Quotation amounts ──────────────────────────────────────────
    if (!hasColumn(db, 'quotations', 'amount')) {
      db.run('ALTER TABLE quotations ADD COLUMN amount REAL');
    }
    if (!hasColumn(db, 'quotations', 'currency')) {
      db.run("ALTER TABLE quotations ADD COLUMN currency TEXT NOT NULL DEFAULT 'COP'");
    }
    if (!hasColumn(db, 'quotations', 'notes')) {
      db.run('ALTER TABLE quotations ADD COLUMN notes TEXT');
    }

    // ── 3. Return target on logs ──────────────────────────────────────
    if (!hasColumn(db, 'approval_logs', 'to_level')) {
      db.run('ALTER TABLE approval_logs ADD COLUMN to_level INTEGER');
    }

    // ── 4. Document versions ──────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS requisition_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL REFERENCES requisitions(id),
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        comments TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (requisition_id, version)
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_requisition_versions_req ON requisition_versions(requisition_id)');

    db.run(`
      INSERT INTO requisition_versions
        (requisition_id, version, title, description, file_path, original_filename, created_by, created_at)
      SELECT r.id, 1, r.title, r.description, r.file_path, r.original_filename, r.uploaded_by, r.created_at
      FROM requisitions r
      WHERE NOT EXISTS (SELECT 1 FROM requisition_versions v WHERE v.requisition_id = r.id)
    `);

    // ── 5. Uploading is step 1: advance anything still waiting there ──
    db.run(`
      UPDATE approval_steps SET status = 'approved', updated_at = datetime('now')
      WHERE step_level = 1 AND status = 'pending'
        AND requisition_id IN (SELECT id FROM requisitions WHERE current_approval_level = 1 AND status = 'pending')
    `);
    db.run(`
      UPDATE requisitions SET status = 'in_review', current_approval_level = 2, updated_at = datetime('now')
      WHERE current_approval_level = 1 AND status = 'pending'
    `);
  },
};
