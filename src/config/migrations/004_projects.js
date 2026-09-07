/**
 * Migration 004 — Projects
 *
 * Creates the projects table and adds project_id column to requisitions.
 *
 * @module migrations/004_projects
 */

module.exports = {
  version: 4,
  name: 'projects',

  /**
   * Apply the migration — create projects table and add project_id to requisitions.
   * @param {object} db - Raw sql.js Database instance
   */
  up(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        location TEXT,
        description TEXT,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      ALTER TABLE requisitions ADD COLUMN project_id INTEGER REFERENCES projects(id)
    `);
  },
};
