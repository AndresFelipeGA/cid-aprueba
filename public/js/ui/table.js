/* ============================================
   CID Aprueba — Filterable table
   Renders a search + select filter bar and a table; re-renders the table
   client-side as the filters change.
   ============================================ */

import { escapeHtml } from '../utils/format.js';

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.filtersContainer  Where the filter bar is rendered
 * @param {HTMLElement} opts.tableContainer    Where the table is rendered
 * @param {Array<{header: string, render: (row: Object) => string}>} opts.columns
 * @param {Object[]} opts.rows
 * @param {Object} [opts.filters]
 * @param {{id: string, placeholder: string, label: string, fields: (row: Object) => string[]}} [opts.filters.search]
 * @param {Array<{id: string, label: string, allLabel: string, options: string, matches: (row: Object, value: string) => boolean}>} [opts.filters.selects]
 * @param {{fromId: string, toId: string, fromLabel: string, toLabel: string, field: (row: Object) => string}} [opts.filters.dateRange]  Filters by a ISO date/datetime field
 * @param {string} opts.emptyText
 * @param {(row: Object) => string} [opts.rowAttrs]  Extra attributes for each <tr>
 * @param {(tableContainer: HTMLElement) => void} [opts.afterRender]
 * @param {(visibleRows: Object[]) => void} [opts.onFilterChange]  Called with the currently-visible rows whenever filters change
 */
export function renderFilterableTable(opts) {
  const {
    filtersContainer, tableContainer, columns, rows, filters = {}, emptyText, rowAttrs, afterRender, onFilterChange,
  } = opts;
  const selects = filters.selects || [];
  const dateRange = filters.dateRange || null;

  // --- Filter bar ---
  if (filtersContainer) {
    let bar = '<div class="search-filters">';
    if (filters.search) {
      bar += `<input type="text" class="search-filters__input" id="${filters.search.id}" placeholder="${escapeHtml(filters.search.placeholder)}" aria-label="${escapeHtml(filters.search.label)}">`;
    }
    for (const sel of selects) {
      bar += `
        <select class="search-filters__select" id="${sel.id}" aria-label="${escapeHtml(sel.label)}">
          <option value="">${escapeHtml(sel.allLabel)}</option>
          ${sel.options}
        </select>`;
    }
    if (dateRange) {
      bar += `
        <div class="search-filters__date-range">
          <label class="search-filters__date-label" for="${dateRange.fromId}">${escapeHtml(dateRange.fromLabel || 'Desde')}</label>
          <input type="date" class="search-filters__date" id="${dateRange.fromId}" aria-label="${escapeHtml(dateRange.fromLabel || 'Desde')}">
          <label class="search-filters__date-label" for="${dateRange.toId}">${escapeHtml(dateRange.toLabel || 'Hasta')}</label>
          <input type="date" class="search-filters__date" id="${dateRange.toId}" aria-label="${escapeHtml(dateRange.toLabel || 'Hasta')}">
        </div>`;
    }
    bar += '</div>';
    filtersContainer.innerHTML = bar;
  }

  // --- Table ---
  const renderTable = (visibleRows) => {
    if (!tableContainer) return;
    if (visibleRows.length === 0) {
      tableContainer.innerHTML = `<div class="empty empty--neutral">${escapeHtml(emptyText)}</div>`;
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>${columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
    `;
    for (const row of visibleRows) {
      html += `<tr${rowAttrs ? ` ${rowAttrs(row)}` : ''}>`;
      html += columns.map((c) => `<td>${c.render(row)}</td>`).join('');
      html += '</tr>';
    }
    html += `
          </tbody>
        </table>
      </div>
    `;
    tableContainer.innerHTML = html;
    if (afterRender) afterRender(tableContainer);
  };

  // --- Filtering ---
  const searchEl = filters.search && filtersContainer ? filtersContainer.querySelector(`#${filters.search.id}`) : null;
  const selectEls = selects.map((sel) => ({
    sel,
    el: filtersContainer ? filtersContainer.querySelector(`#${sel.id}`) : null,
  }));
  const fromEl = dateRange && filtersContainer ? filtersContainer.querySelector(`#${dateRange.fromId}`) : null;
  const toEl = dateRange && filtersContainer ? filtersContainer.querySelector(`#${dateRange.toId}`) : null;

  const apply = () => {
    const term = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const from = fromEl && fromEl.value ? fromEl.value : null;
    const to = toEl && toEl.value ? toEl.value : null;
    const filtered = rows.filter((row) => {
      if (term) {
        const haystack = filters.search.fields(row).map((v) => (v || '').toLowerCase());
        if (!haystack.some((v) => v.includes(term))) return false;
      }
      for (const { sel, el } of selectEls) {
        const value = el ? el.value : '';
        if (value !== '' && !sel.matches(row, value)) return false;
      }
      if (dateRange && (from || to)) {
        const raw = dateRange.field(row);
        const rowDate = raw ? String(raw).slice(0, 10) : null;
        if (!rowDate) return false;
        if (from && rowDate < from) return false;
        if (to && rowDate > to) return false;
      }
      return true;
    });
    renderTable(filtered);
    if (onFilterChange) onFilterChange(filtered);
  };

  if (searchEl) searchEl.addEventListener('input', apply);
  for (const { el } of selectEls) {
    if (el) el.addEventListener('change', apply);
  }
  if (fromEl) fromEl.addEventListener('change', apply);
  if (toEl) toEl.addEventListener('change', apply);

  renderTable(rows);
  if (onFilterChange) onFilterChange(rows);
}
