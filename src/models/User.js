const db = require('../config/database');

const User = {
  findById(id) {
    return db.prepare(
      'SELECT id, username, email, full_name, role_level, territory, is_active, created_at, updated_at FROM users WHERE id = ?'
    ).get(id);
  },

  findByIdWithPassword(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  findAll() {
    return db.prepare(
      'SELECT id, username, email, full_name, role_level, territory, is_active, created_at, updated_at FROM users WHERE is_active = 1 ORDER BY role_level ASC'
    ).all();
  },

  findByRoleLevel(roleLevel) {
    return db.prepare(
      'SELECT id, username, email, full_name, role_level, territory, is_active, created_at, updated_at FROM users WHERE role_level = ? AND is_active = 1'
    ).all(roleLevel);
  },

  findByTerritory(territory) {
    return db.prepare(
      'SELECT id, username, email, full_name, role_level, territory, is_active, created_at, updated_at FROM users WHERE territory = ? AND is_active = 1'
    ).all(territory);
  },

  create({ username, email, passwordHash, fullName, roleLevel, territory }) {
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role_level, territory)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, email, passwordHash, fullName, roleLevel, territory || null);

    return User.findById(result.lastInsertRowid);
  },

  update(id, { fullName, email, roleLevel, isActive, territory }) {
    const fields = [];
    const values = [];

    if (fullName !== undefined) {
      fields.push('full_name = ?');
      values.push(fullName);
    }
    if (email !== undefined) {
      fields.push('email = ?');
      values.push(email);
    }
    if (roleLevel !== undefined) {
      fields.push('role_level = ?');
      values.push(roleLevel);
    }
    if (isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(isActive);
    }
    if (territory !== undefined) {
      fields.push('territory = ?');
      values.push(territory);
    }

    if (fields.length === 0) return User.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return User.findById(id);
  },

  updatePassword(id, passwordHash) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);
    return User.findById(id);
  },
};

module.exports = User;
