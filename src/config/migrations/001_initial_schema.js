/**
 * Migration 001 — Initial Schema
 *
 * Creates the 6 core tables: users, requisitions, approval_steps,
 * approval_logs, quotations, quotation_documents.
 *
 * @module migrations/001_initial_schema
 */

module.exports = {
  version: 1,
  name: 'initial_schema',

  /**
   * Apply the migration — create all tables if they don't exist.
   * @param {object} db - Raw sql.js Database instance
   */
  up(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role_level INTEGER NOT NULL CHECK (role_level >= 1 AND role_level <= 6),
        territory TEXT,
        gender TEXT DEFAULT NULL CHECK(gender IN ('M', 'F')),
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS requisitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'rejected')),
        current_approval_level INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS approval_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        step_level INTEGER NOT NULL CHECK (step_level >= 1 AND step_level <= 6),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        assigned_role_level INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS approval_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        approval_step_id INTEGER,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        comments TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
        FOREIGN KEY (approval_step_id) REFERENCES approval_steps(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisition_id INTEGER NOT NULL,
        provider_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quotation_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('rut', 'camara_comercio', 'cedula', 'certificado_bancario')),
        file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id),
        UNIQUE(quotation_id, doc_type)
      )
    `);
  },
};
