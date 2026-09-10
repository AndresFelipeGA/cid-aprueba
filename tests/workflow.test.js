const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, login, as, cleanup, USERS, PDF } = require('./helpers');

const DOC_TYPES = ['rut', 'camara_comercio', 'cedula', 'certificado_bancario'];
const YEAR = new Date().getFullYear();

const tokens = {};

/** Radicar a requisition as the territory coordinator and return it. */
async function createRequisition(title) {
  const res = await as(tokens.coord)
    .post('/api/requisitions')
    .field('title', title)
    .attach('file', PDF, 'solicitud.pdf');
  assert.equal(res.status, 201, res.body.message);
  return res.body.data.requisition;
}

const approve = (who, reqId, body = {}) => as(tokens[who]).post(`/api/approvals/${reqId}/approve`).send(body);
const returnTo = (who, reqId, to, comments = 'Ajustar cantidades') => as(tokens[who])
  .post(`/api/approvals/${reqId}/return`).send({ to, comments });
const detail = (who, reqId) => as(tokens[who]).get(`/api/requisitions/${reqId}`);

async function addCompleteQuotation(reqId, provider, amount) {
  const quotation = await as(tokens.compras)
    .post(`/api/requisitions/${reqId}/quotations`)
    .field('provider_name', provider)
    .field('amount', String(amount))
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
  return quotationId;
}

describe('Approval workflow', () => {
  before(async () => {
    await start();
    for (const [key, username] of Object.entries(USERS)) {
      tokens[key] = await login(username);
    }
  });
  after(cleanup);

  it('uploading completes step 1: the requisition starts in review at step 2 with a readable number', async () => {
    const req = await createRequisition('Radicación');
    assert.match(req.number, new RegExp(`^REQ-${YEAR}-\\d{4}$`));
    assert.equal(req.status, 'in_review');
    assert.equal(req.current_approval_level, 2);
    assert.equal(req.version, 1);
    assert.equal(req.approval_steps[0].status, 'approved');
    assert.equal(req.versions.length, 1);

    // The coordinator cannot approve anything (step 1 is not an approval)
    const res = await approve('coord', req.id);
    assert.equal(res.status, 403);
  });

  it('hides a requisition from later-stage roles until it reaches their step', async () => {
    const { id } = await createRequisition('Visibilidad');

    assert.equal((await detail('revisor', id)).status, 403);
    const revisorList = await as(tokens.revisor).get('/api/requisitions/status/in_review');
    assert.ok(!revisorList.body.data.items.some((r) => r.id === id));
    assert.equal((await as(tokens.revisor).get(`/api/approvals/${id}/history`)).status, 403);

    assert.equal((await detail('coord', id)).status, 200);
    assert.equal((await detail('director', id)).status, 200);
  });

  it('refuses approval from a role that does not own the current step', async () => {
    const { id } = await createRequisition('Rol incorrecto');
    const res = await approve('financiera', id);
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'FORBIDDEN');
  });

  it('runs the full chain, requiring a priced, complete quotation at step 4', async () => {
    const { id } = await createRequisition('Flujo completo');

    assert.equal((await approve('director', id)).status, 200);   // step 2
    assert.equal((await approve('legal', id)).status, 200);      // step 3

    const early = await approve('compras', id);
    assert.equal(early.body.error, 'INCOMPLETE_QUOTATION');

    // Amount is mandatory
    const noAmount = await as(tokens.compras).post(`/api/requisitions/${id}/quotations`)
      .field('provider_name', 'Sin monto').attach('file', PDF, 'c.pdf');
    assert.equal(noAmount.status, 400);

    const quotationId = await addCompleteQuotation(id, 'Proveedor S.A.S.', 1250000);

    assert.equal((await approve('compras', id)).status, 200);    // step 4
    const step5 = await approve('legal', id);                    // step 5 auto-selects the only quotation
    assert.equal(step5.status, 200, step5.body.message);
    assert.equal(step5.body.data.requisition.selected_quotation_id, quotationId);
    assert.equal(step5.body.data.requisition.selected_amount, 1250000);
    assert.equal((await approve('financiera', id)).status, 200); // step 6

    const final = await approve('revisor', id);                  // step 7
    assert.equal(final.body.data.requisition.status, 'approved');

    assert.equal((await detail('revisor', id)).status, 200);     // finished → visible to all
    assert.equal((await approve('revisor', id)).body.error, 'ALREADY_APPROVED');
  });

  it('returns a requisition one step back; the previous approver re-approves', async () => {
    const { id } = await createRequisition('Devolver un paso');
    await approve('director', id);                               // now at step 3 (legal)

    const noComments = await as(tokens.legal).post(`/api/approvals/${id}/return`).send({ to: 'previous' });
    assert.equal(noComments.status, 400);

    const returned = await returnTo('legal', id, 'previous', 'Falta el aval del área');
    assert.equal(returned.status, 200, returned.body.message);
    const r = returned.body.data.requisition;
    assert.equal(r.status, 'returned');
    assert.equal(r.current_approval_level, 2);
    assert.equal(r.return_reason, 'Falta el aval del área');
    assert.equal(r.returned_from_level, 3);
    assert.equal(r.approval_steps.find((s) => s.step_level === 2).status, 'pending');
    assert.equal(r.approval_logs[0].action, 'returned');
    assert.equal(r.approval_logs[0].to_level, 2);

    // Legal acted on it, so they still see it even though it is now below their step
    assert.equal((await detail('legal', id)).status, 200);

    const again = await approve('director', id);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.requisition.status, 'in_review');
    assert.equal(again.body.data.requisition.return_reason, null);
  });

  it('returns to the start; the coordinator must upload a new version, quotations selection is cleared', async () => {
    const { id } = await createRequisition('Devolver al inicio');
    await approve('director', id);
    await approve('legal', id);
    await addCompleteQuotation(id, 'Proveedor A', 900000);
    await approve('compras', id);                                // now at step 5

    const returned = await returnTo('legal', id, 'start', 'Reformular la requisición completa');
    assert.equal(returned.status, 200, returned.body.message);
    assert.equal(returned.body.data.requisition.current_approval_level, 1);
    assert.equal(returned.body.data.requisition.selected_quotation_id, null);

    // Nobody can approve while it waits for a new version
    assert.equal((await approve('director', id)).body.error, 'RESUBMISSION_REQUIRED');

    // It shows up as pending work for the coordinator
    const pending = await as(tokens.coord).get('/api/dashboard/pending');
    assert.ok(pending.body.data.items.some((item) => item.id === id));

    // Another role cannot resubmit
    const wrongRole = await as(tokens.director).post(`/api/requisitions/${id}/resubmit`).attach('file', PDF, 'v2.pdf');
    assert.equal(wrongRole.status, 403);

    const resubmitted = await as(tokens.coord).post(`/api/requisitions/${id}/resubmit`)
      .field('title', 'Devolver al inicio (v2)')
      .field('comments', 'Se ajustaron las cantidades')
      .attach('file', PDF, 'v2.pdf');
    assert.equal(resubmitted.status, 200, resubmitted.body.message);
    const r = resubmitted.body.data.requisition;
    assert.equal(r.version, 2);
    assert.equal(r.status, 'in_review');
    assert.equal(r.current_approval_level, 2);
    assert.equal(r.title, 'Devolver al inicio (v2)');
    assert.equal(r.versions.length, 2);
    assert.equal(r.approval_logs[0].action, 'resubmitted');

    // Old version stays downloadable
    const oldVersion = await as(tokens.coord).get(`/api/requisitions/${id}/versions/${r.versions[0].id}/download`);
    assert.equal(oldVersion.status, 200);

    // Cannot resubmit twice
    const twice = await as(tokens.coord).post(`/api/requisitions/${id}/resubmit`).attach('file', PDF, 'v3.pdf');
    assert.equal(twice.body.error, 'NOT_RETURNED_TO_START');
  });

  it('keeps a terminal rejection available', async () => {
    const { id } = await createRequisition('Rechazo definitivo');
    const rejected = await as(tokens.director).post(`/api/approvals/${id}/reject`).send({ comments: 'No viable' });
    assert.equal(rejected.body.data.requisition.status, 'rejected');
    assert.equal((await approve('director', id)).body.error, 'ALREADY_REJECTED');
  });

  it('exports requisitions and the audit trail as CSV', async () => {
    // Export respects visibility: legal (step 3) does not see requisitions still at step 2
    const legalRows = (await as(tokens.legal).get('/api/requisitions/export.csv')).text;
    assert.doesNotMatch(legalRows, new RegExp(`REQ-${YEAR}-0001;`));

    const reqs = await as(tokens.coord).get('/api/requisitions/export.csv');
    assert.equal(reqs.status, 200);
    assert.match(reqs.headers['content-type'], /text\/csv/);
    assert.ok(reqs.text.startsWith('﻿Número;Título;'));
    assert.match(reqs.text, new RegExp(`REQ-${YEAR}-0001;`));

    const logs = await as(tokens.legal).get('/api/approvals/export.csv');
    assert.equal(logs.status, 200);
    assert.match(logs.text, /Devolvió/);
  });
});
