/**
 * Shared test bootstrap.
 *
 * Must be required before any src/ module: it points the app at an isolated
 * temp database and upload directory so tests never touch real data.
 * Each test file runs in its own process (node --test), so each gets a fresh DB.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-aprueba-test-'));

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');

const db = require('../src/config/database');

/** Password shared by all seeded users (migration 002). */
const SEED_PASSWORD = 'cid2024';

/** Seeded usernames by role level. Role 3 acts at steps 3 and 5. */
const USERS = {
  coord: 'coord.territorio',   // role 1
  director: 'dir.programatica', // role 2
  legal: 'rep.legal',           // role 3
  compras: 'enc.compras',       // role 4
  financiera: 'area.financiera', // role 5 (renamed in migration 003)
  revisor: 'area.compras',       // role 6 (created in migration 003)
};

/** Minimal valid PDF payload for multipart uploads. */
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

let app;

/** Initialize the database once and return the Express app. */
async function start() {
  if (!app) {
    await db.initializeDatabase();
    app = require('../src/app');
  }
  return app;
}

/** Log in a seeded user and return a Bearer token. */
async function login(username) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: SEED_PASSWORD });
  if (!res.body.success) {
    throw new Error(`Login failed for ${username}: ${res.body.message}`);
  }
  return res.body.data.token;
}

/** Shorthand: authenticated supertest agent factory. */
const as = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});

/** Remove the temp directory created for this process. */
function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = { start, login, as, cleanup, USERS, SEED_PASSWORD, PDF };
