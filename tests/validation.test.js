const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { start, login, as, cleanup, USERS, PDF } = require('./helpers');

const tokens = {};

describe('Validation, authorization wiring and upload hygiene', () => {
  before(async () => {
    await start();
    tokens.coord = await login(USERS.coord);
    tokens.legal = await login(USERS.legal);
    tokens.revisor = await login(USERS.revisor);
  });
  after(cleanup);

  it('rejects non-integer ids and out-of-range pagination with 400', async () => {
    assert.equal((await as(tokens.coord).get('/api/requisitions/abc')).status, 400);
    assert.equal((await as(tokens.coord).get('/api/approvals/0/history')).status, 400);
    assert.equal((await as(tokens.coord).get('/api/requisitions?limit=-1')).status, 400);
    assert.equal((await as(tokens.coord).get('/api/requisitions?page=0')).status, 400);
    assert.equal((await as(tokens.coord).get('/api/requisitions/status/bogus')).status, 400);
    assert.equal((await as(tokens.coord).get('/api/requisitions?limit=5&page=1')).status, 200);
  });

  it('exposes shared workflow metadata publicly', async () => {
    const res = await as('').get('/api/meta');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.step_to_role['5'], 3);
    assert.equal(res.body.data.max_step, 7);
    assert.ok(res.body.data.doc_types.rut);
  });

  it('enforces roles through authorize(): users API, requisition upload, project creation', async () => {
    assert.equal((await as(tokens.coord).get('/api/users')).status, 403);
    assert.equal((await as(tokens.legal).get('/api/users')).status, 200);

    const upload = await as(tokens.revisor).post('/api/requisitions')
      .field('title', 'No permitido').attach('file', PDF, 'x.pdf');
    assert.equal(upload.status, 403);

    const project = await as(tokens.revisor).post('/api/projects').send({ name: 'P' });
    assert.equal(project.status, 403);
  });

  it('does not let an admin change their own role or deactivate themselves', async () => {
    const me = (await as(tokens.legal).get('/api/auth/me')).body.data.user;

    const role = await as(tokens.legal).put(`/api/users/${me.id}`).send({ role_level: 1 });
    assert.equal(role.body.error, 'SELF_ROLE_CHANGE');

    const active = await as(tokens.legal).put(`/api/users/${me.id}`).send({ is_active: 0 });
    assert.equal(active.body.error, 'SELF_DEACTIVATION');
  });

  it('removes the uploaded file when the request is rejected after multer stored it', async () => {
    const uploadDir = path.resolve(process.env.UPLOAD_DIR);
    const before = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0;

    // Missing title → validation error after multer already wrote the file
    const res = await as(tokens.coord).post('/api/requisitions').attach('file', PDF, 'orphan.pdf');
    assert.equal(res.status, 400);

    await new Promise((r) => setTimeout(r, 50)); // unlink is async
    const after = fs.readdirSync(uploadDir).length;
    assert.equal(after, before, 'orphaned upload should have been deleted');
  });

  it('maps multer size errors to a 400 with a stable code', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1); // > 10 MB default limit
    const res = await as(tokens.coord).post('/api/requisitions')
      .field('title', 'Grande').attach('file', big, 'big.pdf');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'FILE_TOO_LARGE');
  });
});
