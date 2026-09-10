/* ============================================
   CID Aprueba — Acta de aprobación (printable)
   #/requisitions/:id/acta
   ============================================ */

import * as API from '../api.js';
import { escapeHtml, formatDate, formatCurrency } from '../utils/format.js';
import { stepLabel, roleNameForStep, roleName, maxStep, docTypes, statusLabel } from '../meta.js';
import { navigate, hrefFor } from '../router.js';

export const title = 'Acta de aprobación';

const LOGO = 'assets/logo-LA-CID.svg';
const COMPLETION_ACTIONS = new Set(['approved', 'uploaded', 'resubmitted']);

/** Latest log that completed a given step (approval, or the upload/resubmission for step 1). */
function completionLog(step, logs) {
  return logs.find((l) => l.approval_step_id === step.id && COMPLETION_ACTIONS.has(l.action)) || null;
}

function renderStepsTable(steps, logs) {
  const rows = [];
  for (let level = 1; level <= maxStep(); level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step, logs) : null;
    rows.push(`
      <tr>
        <td class="acta__step-no">${level}</td>
        <td>${escapeHtml(stepLabel(level))}</td>
        <td>${escapeHtml(roleNameForStep(level, log ? log.user_gender : null))}</td>
        <td>${log ? escapeHtml(log.user_name) : '—'}</td>
        <td>${log ? formatDate(log.created_at) : '—'}</td>
        <td class="acta__comments">${log && log.comments ? escapeHtml(log.comments) : ''}</td>
      </tr>
    `);
  }
  return `
    <table class="acta__table">
      <thead>
        <tr><th>#</th><th>Paso</th><th>Rol</th><th>Aprobado por</th><th>Fecha</th><th>Comentarios</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
}

function renderReturns(steps, logs) {
  const returns = logs.filter((l) => l.action === 'returned');
  if (returns.length === 0) return '';
  const rows = [...returns]
    .reverse() // chronological
    .map((log) => {
      const step = steps.find((s) => s.id === log.approval_step_id);
      const from = step ? stepLabel(step.step_level) : '—';
      return `
        <tr>
          <td>${formatDate(log.created_at)}</td>
          <td>${escapeHtml(from)}</td>
          <td>${log.to_level ? `Paso ${log.to_level} — ${escapeHtml(stepLabel(log.to_level))}` : '—'}</td>
          <td>${escapeHtml(log.user_name)}</td>
          <td class="acta__comments">${escapeHtml(log.comments || '')}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <section class="acta__section">
      <h3 class="acta__section-title">Devoluciones</h3>
      <table class="acta__table">
        <thead><tr><th>Fecha</th><th>Devuelta desde</th><th>Hacia</th><th>Por</th><th>Motivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function renderQuotations(requisition, quotations) {
  if (quotations.length === 0) return '';
  const rows = [...quotations]
    .sort((a, b) => Number(a.amount) - Number(b.amount))
    .map((q) => {
      const selected = q.status === 'selected' || q.id === requisition.selected_quotation_id;
      const docs = q.documents || [];
      const complete = docTypes().every((dt) => docs.some((d) => d.doc_type === dt.key));
      return `
        <tr class="${selected ? 'acta__row--selected' : ''}">
          <td>${escapeHtml(q.provider_name)}${selected ? ' <span class="acta__selected-tag">Seleccionada</span>' : ''}</td>
          <td class="acta__amount">${formatCurrency(q.amount)}</td>
          <td>${complete ? 'Completa' : 'Incompleta'}</td>
          <td class="acta__comments">${escapeHtml(q.notes || '')}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <section class="acta__section">
      <h3 class="acta__section-title">Cotizaciones evaluadas</h3>
      <table class="acta__table">
        <thead><tr><th>Proveedor</th><th>Monto</th><th>Documentación</th><th>Notas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function renderSignatures(steps, logs) {
  const seen = new Set();
  const signers = [];
  for (let level = 1; level <= maxStep(); level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step, logs) : null;
    if (!log || seen.has(log.user_id)) continue;
    seen.add(log.user_id);
    signers.push({ name: log.user_name, role: roleName(log.user_role_level, log.user_gender) });
  }
  if (signers.length === 0) return '';
  const blocks = signers
    .map(
      (s) => `
      <div class="acta__signature">
        <div class="acta__signature-line"></div>
        <div class="acta__signature-name">${escapeHtml(s.name)}</div>
        <div class="acta__signature-role">${escapeHtml(s.role)}</div>
      </div>`,
    )
    .join('');
  return `
    <section class="acta__section acta__section--signatures">
      <h3 class="acta__section-title">Firmas</h3>
      <div class="acta__signatures">${blocks}</div>
    </section>
  `;
}

export async function render(container, params, ctx) {
  const result = await API.getRequisition(params.id);
  if (ctx.isStale()) return;

  const requisition = result.data.requisition;
  const backHref = hrefFor('requisition-detail', { id: requisition.id });
  const number = escapeHtml(requisition.number || `#${requisition.id}`);

  if (requisition.status !== 'approved') {
    container.innerHTML = `
      <a href="${backHref}" class="back-link">&larr; Volver a la requisición</a>
      <div class="alert alert--warning acta-notice">
        El acta de aprobación solo está disponible para requisiciones aprobadas.
        La requisición <strong>${number}</strong> se encuentra en estado <strong>${escapeHtml(statusLabel(requisition.status))}</strong>.
      </div>
    `;
    return;
  }

  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const finalLog = logs.find((l) => l.action === 'approved') || null; // logs are newest-first
  const approvedAt = finalLog ? finalLog.created_at : requisition.updated_at;
  const projectText = requisition.project_name
    ? `${requisition.project_name}${requisition.project_code ? ` (${requisition.project_code})` : ''}`
    : 'Sin proyecto';

  container.innerHTML = `
    <div class="acta-toolbar">
      <a href="${backHref}" class="back-link">&larr; Volver a la requisición</a>
      <div class="acta-toolbar__actions">
        <button class="btn btn--outline" data-action="back-to-detail" data-id="${requisition.id}">Volver</button>
        <button class="btn btn--primary" id="btn-print-acta" data-action="print-acta">Imprimir / Guardar como PDF</button>
      </div>
    </div>

    <article class="acta" id="acta">
      <header class="acta__header">
        <img src="${LOGO}" alt="CID - Corporación Infancia y Desarrollo" class="acta__logo">
        <div class="acta__heading">
          <h2 class="acta__title">Acta de aprobación</h2>
          <div class="acta__number">${number}</div>
        </div>
      </header>

      <section class="acta__section">
        <dl class="acta__facts">
          <div><dt>Requisición</dt><dd>${escapeHtml(requisition.title)}</dd></div>
          <div><dt>Proyecto</dt><dd>${escapeHtml(projectText)}</dd></div>
          <div><dt>Versión del documento</dt><dd>v${requisition.version || 1} — ${escapeHtml(requisition.original_filename)}</dd></div>
          <div><dt>Radicada por</dt><dd>${escapeHtml(requisition.uploader_name)}${requisition.uploader_territory ? ` (${escapeHtml(requisition.uploader_territory)})` : ''}</dd></div>
          <div><dt>Fecha de radicación</dt><dd>${formatDate(requisition.created_at)}</dd></div>
          <div><dt>Fecha de aprobación final</dt><dd>${formatDate(approvedAt)}</dd></div>
          ${requisition.selected_provider_name ? `<div><dt>Proveedor seleccionado</dt><dd>${escapeHtml(requisition.selected_provider_name)} — ${formatCurrency(requisition.selected_amount)}</dd></div>` : ''}
          <div><dt>Estado</dt><dd>${escapeHtml(statusLabel(requisition.status))}</dd></div>
        </dl>
        ${requisition.description ? `<p class="acta__description">${escapeHtml(requisition.description)}</p>` : ''}
      </section>

      <section class="acta__section">
        <h3 class="acta__section-title">Ruta de aprobación</h3>
        ${renderStepsTable(steps, logs)}
      </section>

      ${renderReturns(steps, logs)}
      ${renderQuotations(requisition, quotations)}
      ${renderSignatures(steps, logs)}

      <footer class="acta__footer">
        Documento generado por CID Aprueba el ${formatDate(new Date().toISOString())}.
      </footer>
    </article>
  `;
}

export const actions = {
  'print-acta': () => window.print(),
  'back-to-detail': (t) => navigate('requisition-detail', { id: t.dataset.id }),
};
