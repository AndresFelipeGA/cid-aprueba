/**
 * Migration Runner
 *
 * Manages database schema migrations for sql.js. Creates a schema_migrations
 * tracking table, discovers migration files, and runs pending migrations
 * in order. Backs up the DB file before applying any pending migrations.
 *
 * @module migrations/index
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

// Load all migration modules in order
const migrations = [
  require('./001_initial_schema'),
  require('./002_seed_users'),
  require('./003_workflow_restructure'),
  require('./004_projects'),
  require('./005_indexes'),
  require('./006_returns_amounts_numbering'),
];

/**
 * Run all pending migrations against the raw sql.js Database instance.
 * @param {object} rawDb - The sql.js Database instance
 * @param {string} dbPath - Path to the database file on disk (for backups)
 */
function runMigrations(rawDb, dbPath) {
  // 1. Create schema_migrations table if it doesn't exist
  rawDb.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 2. Read already-applied migration versions
  const applied = new Set();
  const rows = rawDb.exec('SELECT version FROM schema_migrations');
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      applied.add(row[0]);
    }
  }

  // 3. Filter pending migrations
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    logger.info('Database schema is up to date');
    return;
  }

  // 4. Backup DB file before running migrations (if file exists)
  if (dbPath && fs.existsSync(dbPath)) {
    const backupDir = path.resolve(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `database-backup-${Date.now()}.sqlite`);
    fs.copyFileSync(dbPath, backupPath);
    logger.info(`Database backup created at ${backupPath}`);
  }

  // 5. Run each pending migration in its own transaction
  for (const migration of pending) {
    logger.info(`Running migration ${migration.version}: ${migration.name}...`);

    // Table rebuilds (SQLite cannot ALTER a CHECK constraint) need FK enforcement off.
    // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it outside.
    if (migration.disableForeignKeys) rawDb.run('PRAGMA foreign_keys = OFF');

    rawDb.run('BEGIN TRANSACTION');
    try {
      migration.up(rawDb);

      rawDb.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [migration.version, migration.name],
      );

      rawDb.run('COMMIT');
      logger.info(`Migration ${migration.version} (${migration.name}) applied successfully`);
    } catch (err) {
      rawDb.run('ROLLBACK');
      logger.error(`Migration ${migration.version} (${migration.name}) failed`, { stack: err.stack });
      throw new Error(`Migration ${migration.version} failed: ${err.message}`);
    } finally {
      if (migration.disableForeignKeys) rawDb.run('PRAGMA foreign_keys = ON');
    }
  }

  logger.info(`${pending.length} migration(s) applied successfully`);
}

module.exports = { runMigrations };
