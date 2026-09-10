const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, login, as, cleanup, USERS, PDF } = require('./helpers');

const DOC_TYPES = ['rut', 'camara_comercio', 'cedula', 'certificado_bancario'];

const tokens = {};

/** Create a requisition as the territory coordinator and return its id. */
async function createRequisition(title) {
  const res = await as(tokens.coord)
    .post('/api/requisitions')
    .field('title', title)
    .attach('file', PDF, 'solicitud.pdf');
  assert.equal(res.status, 201, res.body.message);
  return res.body.data.requisition.id;
}

async function approve(who, reqId, body = {}) {
  return as(tokens[who]).post(`/api/approvals/${reqId}/approve`).send(body);
}

describe('Approval workflow', () => {
  before(async () => {
    await start();
    for (const [key, username] of Object.entries(USERS)) {
      tokens[key] = await login(username);
    }
  });
  after(cleanup);

  it('hides a requisition from later-stage roles until it reaches their step', async () => {
    const reqId = await createRequisition('Visibilidad');

    const asRevisor = await as(tokens.revisor).get(`/api/requisitions/${reqId}`);
    assert.equal(asRevisor.status, 403);

    const revisorPending = await as(tokens.revisor).get('/api/requisitions/status/pending');
    assert.equal(revisorPending.status, 200);
    assert.ok(!revisorPending.body.data.items.some((r) => r.id === reqId));

    const history = await as(tokens.revisor).get(`/api/approvals/${reqId}/history`);
    assert.equal(history.status, 403);

    const asCoord = await as(tokens.coord).get(`/api/requisitions/${reqId}`);
    assert.equal(asCoord.status, 200);
    assert.equal(asCoord.body.data.requisition.current_approval_level, 1);
  });

  it('refuses approval from a role that does not own the current step', async () => {
    const reqId = await createRequisition('Rol incorrecto');
    const res = await approve('financiera', reqId);
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'FORBIDDEN');
  });

  it('runs the full 7-step chain, requiring a complete quotation at step 4', async () => {
    const reqId = await createRequisition('Flujo completo');

    assert.equal((await approve('coord', reqId)).status, 200);      // step 1
    assert.equal((await approve('director', reqId)).status, 200);   // step 2
    assert.equal((await approve('legal', reqId)).status, 200);      // step 3

    // Step 4 cannot be approved without a complete quotation
    const early = await approve('compras', reqId);
    assert.equal(early.status, 400);
    assert.equal(early.body.error, 'INCOMPLETE_QUOTATION');

    const quotation = await as(tokens.compras)
      .post(`/api/requisitions/${reqId}/quotations`)
      .field('provider_name', 'Proveedor S.A.S.')
      .attach('file', PDF, 'cotizacion.pdf');
    assert.equal(quotation.status, 201, quotation.body.message);
    const quotationId = quotation.body.data.quotation.id;

    for (const docType of DOC_TYPES) {
      const doc = await as(tokens.compras)
        .post(`/api/requisitions/${reqId}/quotations/${quotationId}/documents`)
        .field('doc_type', docType)
        .attach('file', PDF, `${docType}.pdf`);
      assert.equal(doc.status, 201, doc.body.message);
    }

    assert.equal((await approve('compras', reqId)).status, 200);    // step 4
    const step5 = await approve('legal', reqId);                    // step 5 auto-selects the only quotation
    assert.equal(step5.status, 200, step5.body.message);
    assert.equal(step5.body.data.requisition.selected_quotation_id, quotationId);
    assert.equal((await approve('financiera', reqId)).status, 200); // step 6

    const final = await approve('revisor', reqId);                  // step 7
    assert.equal(final.status, 200);
    assert.equal(final.body.data.requisition.status, 'approved');

    // Finished requisitions are visible to everyone
    const asRevisor = await as(tokens.revisor).get(`/api/requisitions/${reqId}`);
    assert.equal(asRevisor.status, 200);

    // No further actions on a terminal state
    const again = await approve('revisor', reqId);
    assert.equal(again.body.error, 'ALREADY_APPROVED');
  });

  it('requires comments to reject and makes rejection terminal', async () => {
    const reqId = await createRequisition('Rechazo');
    assert.equal((await approve('coord', reqId)).status, 200);

    const noComments = await as(tokens.director).post(`/api/approvals/${reqId}/reject`).send({});
    assert.equal(noComments.status, 400);

    const rejected = await as(tokens.director)
      .post(`/api/approvals/${reqId}/reject`)
      .send({ comments: 'Presupuesto insuficiente' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.requisition.status, 'rejected');

    const after = await approve('director', reqId);
    assert.equal(after.body.error, 'ALREADY_REJECTED');

    const history = await as(tokens.coord).get(`/api/approvals/${reqId}/history`);
    assert.equal(history.body.data.logs.at(-1).action, 'rejected');
  });
});
