/* ============================================
   CID Aprueba — Requisitions list view
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatDateShort } from '../utils/format.js';
import { statusBadge, statusOptions, stepOptions, maxStep } from '../meta.js';
import { renderFilterableTable } from '../ui/table.js';

export const title = 'Requisiciones';

/** Progress bar HTML for a requisition (status + current step). */
export function buildProgressBar(req) {
  const totalSteps = maxStep();
  const level = req.current_approval_level || 1;
  let percent = ((level - 1) / totalSteps) * 100;
  let fillClass = '';
  let labelClass = '';
  let labelText = `Paso ${level} de ${totalSteps}`;

  if (req.status === 'approved') {
    percent = 100;
    fillClass = 'req-progress__fill--approved';
    labelClass = 'req-progress__label--approved';
    labelText = 'Aprobado';
  } else if (req.status === 'rejected') {
    if (percent < 5) percent = 5; // at least a sliver when rejected at step 1
    fillClass = 'req-progress__fill--rejected';
    labelClass = 'req-progress__label--rejected';
    labelText = `Rechazado — Paso ${level} de ${totalSteps}`;
  }

  return `
    <div class="req-progress">
      <div class="req-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}" aria-label="${escapeHtml(labelText)}">
        <div class="req-progress__fill ${fillClass}" data-width="${percent}%"></div>
      </div>
      <span class="req-progress__label ${labelClass}">${labelText}</span>
    </div>
  `;
}

export async function render(container, _params, ctx) {
  const result = await API.getRequisitions();
  if (ctx.isStale()) return;
  const requisitions = result.data.items || [];

  let html = `
    <div class="main__header">
      <h2 class="main__title">Requisiciones</h2>
  `;
  if (state.user && state.user.role_level === 1) {
    html += '<button class="btn btn--primary" data-action="navigate" data-view="create-requisition">Crear Requisición</button>';
  }
  html += `
    </div>
    <div id="req-filters"></div>
    <div id="req-table-container"></div>
  `;
  container.innerHTML = html;

  renderFilterableTable({
    filtersContainer: container.querySelector('#req-filters'),
    tableContainer: container.querySelector('#req-table-container'),
    rows: requisitions,
    emptyText: 'No se encontraron requisiciones',
    filters: {
      search: {
        id: 'req-search',
        placeholder: '🔍 Buscar requisición...',
        label: 'Buscar requisición',
        fields: (req) => [req.title, req.description, req.uploader_name],
      },
      selects: [
        {
          id: 'req-filter-status',
          label: 'Filtrar por estado',
          allLabel: 'Estado: Todos',
          options: statusOptions(),
          matches: (req, value) => req.status === value,
        },
        {
          id: 'req-filter-level',
          label: 'Filtrar por nivel',
          allLabel: 'Nivel: Todos',
          options: stepOptions(),
          matches: (req, value) => req.current_approval_level === parseInt(value, 10),
        },
      ],
    },
    columns: [
      { header: 'Título', render: (req) => escapeHtml(req.title) },
      {
        header: 'Proyecto',
        render: (req) => (req.project_name ? escapeHtml(req.project_name) : '<span style="color:var(--color-text-light)">—</span>'),
      },
      { header: 'Estado', render: (req) => statusBadge(req.status) },
      { header: 'Progreso', render: buildProgressBar },
      { header: 'Subido por', render: (req) => escapeHtml(req.uploader_name) },
      { header: 'Fecha', render: (req) => formatDateShort(req.created_at) },
    ],
    rowAttrs: (req) =>
      `class="table__row--clickable" role="button" tabindex="0" data-action="view-requisition" data-id="${req.id}" aria-label="Ver requisición ${escapeHtml(req.title)}"`,
    afterRender: (tableContainer) => {
      requestAnimationFrame(() => {
        tableContainer.querySelectorAll('.req-progress__fill').forEach((fill) => {
          const target = fill.getAttribute('data-width');
          if (target) fill.style.width = target;
        });
      });
    },
  });
}
