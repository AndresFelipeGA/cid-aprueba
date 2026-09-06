/**
 * Migration 002 — Seed Default Users
 *
 * Inserts the 7 default users required for the approval workflow.
 * Only seeds if the users table is empty (guard clause).
 *
 * @module migrations/002_seed_users
 */

const bcrypt = require('bcryptjs');

module.exports = {
  version: 2,
  name: 'seed_users',

  /**
   * Apply the migration — insert default users if none exist.
   * @param {object} db - Raw sql.js Database instance
   */
  up(db) {
    // Guard clause: only seed if users table is empty
    const result = db.exec('SELECT COUNT(*) as count FROM users');
    const userCount = result.length > 0 ? result[0].values[0][0] : 0;

    if (userCount > 0) {
      return;
    }

    const passwordHash = bcrypt.hashSync('cid2024', 10);

    const defaultUsers = [
      { username: 'coord.territorio', email: 'coord.territorio@cid.org.co', full_name: 'Coordinador/a de Territorio', role_level: 1, territory: 'Chocó' },
      { username: 'coord.territorio2', email: 'coord.territorio2@cid.org.co', full_name: 'Coordinador/a de Territorio', role_level: 1, territory: 'Santander' },
      { username: 'dir.programatica', email: 'dir.programatica@cid.org.co', full_name: 'Director/a Programática', role_level: 2, territory: null },
      { username: 'rep.legal', email: 'rep.legal@cid.org.co', full_name: 'Representante Legal', role_level: 3, territory: null },
      { username: 'enc.compras', email: 'enc.compras@cid.org.co', full_name: 'Encargado/a de Compras', role_level: 4, territory: null },
      { username: 'analista', email: 'analista@cid.org.co', full_name: 'Área Financiera', role_level: 5, territory: null },
      { username: 'revisor', email: 'revisor@cid.org.co', full_name: 'Área de Compras', role_level: 6, territory: null },
    ];

    for (const user of defaultUsers) {
      db.run(
        'INSERT INTO users (username, email, password_hash, full_name, role_level, territory) VALUES (?, ?, ?, ?, ?, ?)',
        [user.username, user.email, passwordHash, user.full_name, user.role_level, user.territory],
      );
    }
  },
};
