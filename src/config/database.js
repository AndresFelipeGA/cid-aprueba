/**
 * Database Module — Persistent sql.js wrapper
 *
 * Provides a synchronous façade that mimics the better-sqlite3 API so all
 * model files can use `db.prepare(sql).get(...)` without changes.
 *
 * Key features:
 * - Loads existing DB from disk on startup (data persists across restarts)
 * - Creates a fresh DB only when no file exists
 * - Runs schema migrations automatically
 * - Auto-saves to disk every 30 seconds
 * - Saves on graceful shutdown (SIGINT, SIGTERM)
 * - Atomic writes (temp file + rename) to prevent corruption
 *
 * @module config/database
 */

const path = require('path');
const fs = require('fs');
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
        const lastId = rawDb.exec('SELECT last_insert_rowid() as id');
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

  /**
   * Execute a PRAGMA statement. sql.js does not support all PRAGMAs,
   * so unsupported ones are silently ignored.
   * @param {string} pragmaStr - The PRAGMA string (e.g. 'journal_mode = WAL')
   * @param {object} [_options] - Ignored, kept for API compatibility
   */
  pragma(pragmaStr, _options) {
    try {
      rawDb.run(`PRAGMA ${pragmaStr}`);
    } catch (_err) {
      // sql.js doesn't support all PRAGMAs; silently ignore
    }
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

// ── Persistence helpers ────────────────────────────────────────────────────

let _saving = false;

/**
 * Persist the in-memory database to the file on disk using atomic writes.
 * Writes to a temp file first, then renames to prevent corruption.
 */
function _saveToDisk() {
  if (_saving) return;
  _saving = true;
  try {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    const tmpPath = dbPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    logger.error('Failed to persist database to disk', { stack: err.stack });
  } finally {
    _saving = false;
  }
}

// ── Auto-save ──────────────────────────────────────────────────────────────

let _autoSaveInterval = null;
const AUTO_SAVE_MS = 30_000; // 30 seconds

/**
 * Start the periodic auto-save interval.
 * Uses unref() so the timer doesn't prevent Node.js from exiting.
 */
function _startAutoSave() {
  _autoSaveInterval = setInterval(() => {
    _saveToDisk();
    logger.debug('Auto-save completed');
  }, AUTO_SAVE_MS);
  _autoSaveInterval.unref();
}

// ── Graceful shutdown ──────────────────────────────────────────────────────

let _shutdownRegistered = false;

/**
 * Register process event handlers to save the database before exit.
 */
function _registerShutdownHandlers() {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, saving database...`);
    _saveToDisk();
    if (_autoSaveInterval) clearInterval(_autoSaveInterval);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { stack: err.stack });
    _saveToDisk();
    process.exit(1);
  });
}

// ── Initialization (async, called once from server.js) ─────────────────────

/**
 * Initialize the database: load from disk or create fresh, run migrations,
 * start auto-save, and register shutdown handlers.
 * @returns {Promise<void>}
 */
const initializeDatabase = async () => {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // 1. Load existing DB from disk or create a new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(fileBuffer);
    logger.info('Database loaded from disk');
  } else {
    rawDb = new SQL.Database();
    logger.info('Created new empty database');
  }

  // 2. Enable foreign keys
  rawDb.run('PRAGMA foreign_keys = ON');

  // 3. Run pending migrations
  const { runMigrations } = require('./migrations');
  runMigrations(rawDb, dbPath);

  // 4. Persist to disk
  _saveToDisk();

  // 5. Start auto-save and register shutdown handlers
  _startAutoSave();
  _registerShutdownHandlers();

  logger.info('Database initialization complete');
};

// Export the db wrapper (used by models) and the init function (used by server.js)
db.initializeDatabase = initializeDatabase;
module.exports = db;
