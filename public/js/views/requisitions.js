/* ============================================
   CID Aprueba — Requisitions list view
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatDateShort } from '../utils/format.js';
import { statusBadge, statusLabel, statusOptions, stepOptions, maxStep } from '../meta.js';
import { renderFilterableTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';
import { setButtonBusy } from '../ui/feedback.js';

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
    labelText = statusLabel('approved');
  } else if (req.status === 'rejected') {
    if (percent < 5) percent = 5; // at least a sliver when rejected early
    fillClass = 'req-progress__fill--rejected';
    labelClass = 'req-progress__label--rejected';
    labelText = `${statusLabel('rejected')} — Paso ${level} de ${totalSteps}`;
  } else if (req.status === 'returned') {
    if (percent < 5) percent = 5;
    fillClass = 'req-progress__fill--returned';
    labelClass = 'req-progress__label--returned';
    labelText = `${statusLabel('returned')} — Paso ${level} de ${totalSteps}`;
  }

  return `
    <div class="req-progress">
      <div class="req-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}" aria-label="${escapeHtml(labelText)}">
        <div class="req-progress__fill ${fillClass}" data-width="${percent}%"></div>
      </div>
      <span class="req-progress__label ${labelClass}">${escapeHtml(labelText)}</span>
    </div>
  `;
}

/** Distinct {id, name} projects among the loaded requisitions, as <option> HTML. */
function projectOptionsFrom(requisitions) {
  const seen = new Map();
  for (const req of requisitions) {
    if (req.project_id && !seen.has(req.project_id)) seen.set(req.project_id, req.project_name);
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`)
    .join('');
}

// Row ids currently visible after filtering — export respects exactly what's on screen.
let filteredIds = [];

export async function render(container, _params, ctx) {
  const result = await API.getAllRequisitions();
  if (ctx.isStale()) return;
  const requisitions = result.data.items || [];
  filteredIds = requisitions.map((r) => r.id);

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
    onFilterChange: (visibleRows) => { filteredIds = visibleRows.map((r) => r.id); },
    filters: {
      search: {
        id: 'req-search',
        placeholder: '🔍 Buscar por número, título o responsable...',
        label: 'Buscar requisición',
        fields: (req) => [req.number, req.title, req.description, req.uploader_name],
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
        {
          id: 'req-filter-project',
          label: 'Filtrar por proyecto',
          allLabel: 'Proyecto: Todos',
          options: projectOptionsFrom(requisitions),
          matches: (req, value) => String(req.project_id) === value,
        },
      ],
      dateRange: {
        fromId: 'req-filter-from',
        toId: 'req-filter-to',
        fromLabel: 'Desde',
        toLabel: 'Hasta',
        field: (req) => req.created_at,
      },
    },
    columns: [
      {
        header: 'Número',
        render: (req) =>
          `<span class="req-number">${escapeHtml(req.number || `#${req.id}`)}</span>${req.version > 1 ? ` <span class="version-badge">v${req.version}</span>` : ''}`,
      },
      { header: 'Título', render: (req) => escapeHtml(req.title) },
      {
        header: 'Proyecto',
        render: (req) => (req.project_name ? escapeHtml(req.project_name) : '<span style="color:var(--color-text-light)">—</span>'),
      },
      { header: 'Estado', render: (req) => statusBadge(req.status) },
      { header: 'Progreso', render: buildProgressBar },
      { header: 'Radicada por', render: (req) => escapeHtml(req.uploader_name) },
      { header: 'Fecha', render: (req) => `<span class="nowrap">${formatDateShort(req.created_at)}</span>` },
    ],
    rowAttrs: (req) =>
      `class="table__row--clickable" role="button" tabindex="0" data-action="view-requisition" data-id="${req.id}" aria-label="Ver requisición ${escapeHtml(req.number || '')} ${escapeHtml(req.title)}"`,
    afterRender: (tableContainer) => {
      requestAnimationFrame(() => {
        tableContainer.querySelectorAll('.req-progress__fill').forEach((fill) => {
          const target = fill.getAttribute('data-width');
          if (target) fill.style.width = target;
        });
      });
    },
  });

  // Export buttons sit in the same row as the filters, and always reflect the filtered set on screen
  const filterBar = container.querySelector('#req-filters .search-filters');
  if (filterBar) {
    filterBar.insertAdjacentHTML(
      'beforeend',
      `<div class="search-filters__export-group">
        <button class="btn btn--outline" id="btn-export-csv" data-action="export-requisitions-csv" title="Datos en bruto para Excel">Exportar CSV</button>
        <button class="btn btn--secondary" id="btn-export-pdf" data-action="export-requisitions-pdf" title="Reporte con el mismo formato del acta">📄 Exportar PDF</button>
      </div>`,
    );
  }
}

async function exportAs(btn, fn, busyLabel) {
  const restore = setButtonBusy(btn, busyLabel);
  try {
    await fn(filteredIds);
  } catch (err) {
    showToast(err.message || 'No se pudo exportar el archivo', 'error');
  } finally {
    restore();
  }
}

export const actions = {
  'export-requisitions-csv': (t) => exportAs(t, API.exportRequisitionsCsv, 'Exportando...'),
  'export-requisitions-pdf': (t) => exportAs(t, API.exportRequisitionsPdf, 'Generando...'),
};
