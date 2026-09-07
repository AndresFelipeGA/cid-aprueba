/**
 * Project Model
 *
 * Handles all database operations for the projects table.
 *
 * @module models/Project
 */

const db = require('../config/database');

const Project = {
  /**
   * Find all active projects, ordered by name.
   * @returns {Array<Object>} Array of active project objects
   */
  findAll() {
    return db.prepare(`
      SELECT p.*, u.full_name AS creator_name
      FROM projects p
      JOIN users u ON p.created_by = u.id
      WHERE p.is_active = 1
      ORDER BY p.name ASC
    `).all();
  },

  /**
   * Find a single project by ID.
   * @param {number} id - Project ID
   * @returns {Object|undefined} Project object or undefined
   */
  findById(id) {
    return db.prepare(`
      SELECT p.*, u.full_name AS creator_name
      FROM projects p
      JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id);
  },

  /**
   * Find a project by its unique code.
   * @param {string} code - Project code
   * @returns {Object|undefined} Project object or undefined
   */
  findByCode(code) {
    return db.prepare(`
      SELECT p.*, u.full_name AS creator_name
      FROM projects p
      JOIN users u ON p.created_by = u.id
      WHERE p.code = ?
    `).get(code);
  },

  /**
   * Create a new project.
   * @param {Object} data - Project data
   * @param {string} data.name - Project name (required)
   * @param {string} [data.code] - Project code (optional, unique)
   * @param {string} [data.location] - Project location
   * @param {string} [data.description] - Project description
   * @param {string} [data.start_date] - Start date (ISO 8601)
   * @param {string} [data.end_date] - End date (ISO 8601)
   * @param {number} data.created_by - ID of the user creating the project
   * @returns {Object} The created project
   */
  create({ name, code, location, description, start_date, end_date, created_by }) {
    const result = db.prepare(`
      INSERT INTO projects (name, code, location, description, start_date, end_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      code || null,
      location || null,
      description || null,
      start_date || null,
      end_date || null,
      created_by,
    );

    return Project.findById(result.lastInsertRowid);
  },

  /**
   * Update an existing project.
   * @param {number} id - Project ID
   * @param {Object} data - Fields to update
   * @returns {Object|undefined} The updated project or undefined
   */
  update(id, data) {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.code !== undefined) {
      fields.push('code = ?');
      values.push(data.code || null);
    }
    if (data.location !== undefined) {
      fields.push('location = ?');
      values.push(data.location || null);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description || null);
    }
    if (data.start_date !== undefined) {
      fields.push('start_date = ?');
      values.push(data.start_date || null);
    }
    if (data.end_date !== undefined) {
      fields.push('end_date = ?');
      values.push(data.end_date || null);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }

    if (fields.length === 0) return Project.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return Project.findById(id);
  },
};

module.exports = Project;
