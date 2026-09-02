const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const config = require('./env');
const logger = require('../utils/logger');

const dbPath = path.resolve(__dirname, '../../', config.dbPath);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ── sql.js wrapper that mimics the better-sqlite3 API ──────────────────────
// sql.js is pure-JS (no native build), but its init is async.
// We expose a thin synchronous façade so every model file that does
//   const db = require('../config/database');
//   db.prepare('…').get(…)
// keeps working unchanged.

let SQL;   // sql.js module
let rawDb; // the underlying sql.js Database instance

/**
 * Wrap a sql.js Database so callers can use the better-sqlite3 style:
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).all(...params)
 *   db.prepare(sql).run(...params)
 *   db.exec(sql)
 *   db.pragma(str)
 *   db.transaction(fn)
 */
const db = {
  /** Returns a statement-like object */
  prepare(sql) {
    return {
      get(...params) {
        const stmt = rawDb.prepare(sql);
        stmt.bind(params.length ? params : undefined);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },

      all(...params) {
        const rows = [];
        const stmt = rawDb.prepare(sql);
        stmt.bind(params.length ? params : undefined);
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      },

      run(...params) {
        rawDb.run(sql, params);
        // Mimic better-sqlite3 RunResult
        const lastId = rawDb.exec("SELECT last_insert_rowid() as id");
        const changes = rawDb.getRowsModified();
        const lastInsertRowid = lastId.length > 0 && lastId[0].values.length > 0
          ? lastId[0].values[0][0]
          : 0;
        return { changes, lastInsertRowid };
      },
    };
  },

  exec(sql) {
    rawDb.run(sql);
  },

  pragma(_str) {
    // sql.js doesn't support pragma in the same way; silently ignore
  },

  transaction(fn) {
    return (...args) => {
      rawDb.run('BEGIN TRANSACTION');
      try {
        fn(...args);
        rawDb.run('COMMIT');
        // Persist to disk after transaction
        _saveToDisk();
      } catch (err) {
        rawDb.run('ROLLBACK');
        throw err;
      }
    };
  },
};

/** Persist the in-memory database to the file on disk */
function _saveToDisk() {
  try {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    logger.error('Failed to persist database to disk', { stack: err.stack });
  }
}

// ── Initialization (async, called once from server.js) ─────────────────────

const initializeDatabase = async () => {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Load existing DB file if present, otherwise create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }

  logger.info('Initializing database...');

  // Enable foreign keys
  rawDb.run('PRAGMA foreign_keys = ON');

  rawDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_level INTEGER NOT NULL CHECK (role_level >= 1 AND role_level <= 6),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  rawDb.run(`
    CREATE TABLE IF NOT EXISTS documents (
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

  rawDb.run(`
    CREATE TABLE IF NOT EXISTS approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      step_level INTEGER NOT NULL CHECK (step_level >= 1 AND step_level <= 6),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      assigned_role_level INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `);

  rawDb.run(`
    CREATE TABLE IF NOT EXISTS approval_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      approval_step_id INTEGER,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      comments TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (approval_step_id) REFERENCES approval_steps(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  logger.info('Database tables created successfully');

  // Seed default users if none exist
  const result = rawDb.exec('SELECT COUNT(*) as count FROM users');
  const userCount = result.length > 0 ? result[0].values[0][0] : 0;

  if (userCount === 0) {
    seedDefaultUsers();
  }

  // Persist to disk
  _saveToDisk();

  logger.info('Database initialization complete');
};

const seedDefaultUsers = () => {
  logger.info('Seeding default users...');

  const passwordHash = bcrypt.hashSync('cid2024', 10);

  const defaultUsers = [
    { username: 'director', email: 'director@cid.org.co', full_name: 'Director General', role_level: 1 },
    { username: 'subdirector', email: 'subdirector@cid.org.co', full_name: 'Subdirector', role_level: 2 },
    { username: 'coord.financiero', email: 'financiero@cid.org.co', full_name: 'Coordinador Financiero', role_level: 3 },
    { username: 'coord.proyectos', email: 'proyectos@cid.org.co', full_name: 'Coordinador de Proyectos', role_level: 4 },
    { username: 'analista', email: 'analista@cid.org.co', full_name: 'Analista', role_level: 5 },
    { username: 'revisor', email: 'revisor@cid.org.co', full_name: 'Revisor', role_level: 6 },
  ];

  rawDb.run('BEGIN TRANSACTION');
  try {
    for (const user of defaultUsers) {
      rawDb.run(
        'INSERT INTO users (username, email, password_hash, full_name, role_level) VALUES (?, ?, ?, ?, ?)',
        [user.username, user.email, passwordHash, user.full_name, user.role_level],
      );
    }
    rawDb.run('COMMIT');
  } catch (err) {
    rawDb.run('ROLLBACK');
    throw err;
  }

  logger.info(`Seeded ${defaultUsers.length} default users`);
};

// Export the db wrapper (used by models) and the init function (used by server.js)
db.initializeDatabase = initializeDatabase;
module.exports = db;
