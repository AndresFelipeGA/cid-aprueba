const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { start, cleanup, USERS, SEED_PASSWORD } = require('./helpers');

let app;

describe('Authentication', () => {
  before(async () => { app = await start(); });
  after(cleanup);

  it('logs in a seeded user and never exposes the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: USERS.coord, password: SEED_PASSWORD });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role_level, 1);
    assert.equal(res.body.data.user.password_hash, undefined);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: USERS.coord, password: 'nope' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'INVALID_CREDENTIALS');
  });

  it('rejects protected routes without a token or with a bad token', async () => {
    const noToken = await request(app).get('/api/auth/me');
    assert.equal(noToken.status, 401);

    const badToken = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    assert.equal(badToken.status, 401);
    assert.equal(badToken.body.error, 'INVALID_TOKEN');
  });

  it('rate-limits repeated failed logins with 429', async () => {
    let limited = null;
    for (let i = 0; i < 12 && !limited; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: USERS.coord, password: 'nope' });
      if (res.status === 429) limited = res;
    }

    assert.ok(limited, 'expected a 429 within 12 failed attempts');
    assert.equal(limited.body.error, 'TOO_MANY_ATTEMPTS');
  });
});
