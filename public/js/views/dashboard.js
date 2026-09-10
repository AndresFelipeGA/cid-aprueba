/* ============================================
   CID Aprueba — Dashboard view
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatDateShort } from '../utils/format.js';
import { statusBadge, statusLabel, actionLabel, stepLabel, maxStep } from '../meta.js';
import { hrefFor } from '../router.js';
import { showToast } from '../ui/toast.js';
import { setButtonBusy } from '../ui/feedback.js';

export const title = 'Panel de Control';

const ADMIN_ROLE = 3; // Representante Legal

/** Donut order and colours; labels come from meta.status_labels. */
const STATUS_COLORS = [
  { key: 'pending', color: '#C85A2A' },
  { key: 'in_review', color: '#6B8E23' },
  { key: 'returned', color: '#E6A817' },
  { key: 'approved', color: '#3D5A1E' },
  { key: 'rejected', color: '#B22222' },
];

// --- Animated counter ---

function animateCounter(element, targetValue, duration = 1500) {
  if (!element) return;
  if (targetValue === 0) {
    element.textContent = '0';
    return;
  }
  let startTime = null;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const update = (now) => {
    if (startTime === null) startTime = now;
    const progress = Math.min((now - startTime) / duration, 1);
    element.textContent = Math.round(easeOut(progress) * targetValue);
    if (progress < 1) requestAnimationFrame(update);
  };
  element.textContent = '0';
  requestAnimationFrame(update);
}

// --- SVG donut chart ---

function buildDonutChart(byStatus) {
  const data = STATUS_COLORS.map(({ key, color }) => ({
    key,
    color,
    label: statusLabel(key),
    value: byStatus[key] || 0,
  }));

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  let segments = '';
  let offset = 0;

  if (total === 0) {
    segments = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#E0D8CC" stroke-width="${strokeWidth}" />`;
  } else {
    data.forEach((d, i) => {
      if (d.value === 0) return;
      const segmentLength = (d.value / total) * circumference;
      const gapLength = circumference - segmentLength;
      const animDelay = (i * 0.15).toFixed(2);
      segments += `
        <circle
          cx="${cx}" cy="${cy}" r="${radius}"
          fill="none"
          stroke="${d.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${segmentLength} ${gapLength}"
          stroke-dashoffset="${-offset}"
          stroke-linecap="butt"
          transform="rotate(-90 ${cx} ${cy})"
          class="donut-segment"
          style="animation-delay: ${animDelay}s"
        />
      `;
      offset += segmentLength;
    });
  }

  const legend = data
    .map(
      (d) => `
      <div class="chart-legend__item">
        <span class="chart-legend__dot" style="background-color: ${d.color}"></span>
        <span class="chart-legend__label">${escapeHtml(d.label)}</span>
        <span class="chart-legend__value">${d.value}</span>
      </div>`,
    )
    .join('');

  return `
    <div class="chart-donut">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-svg" role="img" aria-label="Distribución por estado: ${total} requisiciones">
        ${segments}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" class="donut-center-text">
          <tspan x="${cx}" dy="-6" class="donut-center-number">${total}</tspan>
          <tspan x="${cx}" dy="18" class="donut-center-label">Total</tspan>
        </text>
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>
  `;
}

// --- Horizontal bar chart (requisitions per step) ---

function buildBarChart(byStep) {
  const maxCount = Math.max(1, ...Object.values(byStep));
  let rows = '';
  for (let step = 1; step <= maxStep(); step++) {
    const count = byStep[String(step)] || 0;
    const pct = (count / maxCount) * 100;
    const isZero = count === 0;
    rows += `
      <div class="bar-row${isZero ? ' bar-row--zero' : ''}" title="${escapeHtml(stepLabel(step))}">
        <span class="bar-label">Paso ${step}</span>
        <div class="bar-track">
          <div class="bar-fill" data-target-pct="${pct}" style="width: 0%"></div>
        </div>
        <span class="bar-count${isZero ? ' bar-count--zero' : ''}">${count}</span>
      </div>
    `;
  }
  return `<div class="chart-bars">${rows}</div>`;
}

function animateBarChart(container) {
  const fills = container.querySelectorAll('.bar-fill');
  requestAnimationFrame(() => {
    fills.forEach((fill, i) => {
      const targetPct = parseFloat(fill.getAttribute('data-target-pct')) || 0;
      setTimeout(() => {
        fill.style.width = `${targetPct}%`;
      }, i * 60);
    });
  });
}

// --- Pending list ---

function pendingTag(requisition) {
  if (requisition.status !== 'returned') return '';
  const user = state.user;
  const text = user && user.role_level === 1 ? 'Requiere nueva versión' : statusLabel('returned');
  return `<span class="tag tag--warning pending-item__tag">${escapeHtml(text)}</span>`;
}

function renderPendingItem(requisition) {
  const number = requisition.number ? `<span class="req-number">${escapeHtml(requisition.number)}</span> ` : '';
  return `
    <div class="pending-item" role="button" tabindex="0" data-action="view-requisition" data-id="${requisition.id}" aria-label="Ver requisición ${escapeHtml(requisition.number || '')} ${escapeHtml(requisition.title)}">
      <div>
        <div class="pending-item__title">${number}${escapeHtml(requisition.title)} ${pendingTag(requisition)}</div>
        <div class="pending-item__meta">Radicada por ${escapeHtml(requisition.uploader_name)} — ${formatDateShort(requisition.created_at)} — ${escapeHtml(stepLabel(requisition.current_approval_level))}</div>
      </div>
      ${statusBadge(requisition.status)}
    </div>
  `;
}

// --- Recent activity ---

function renderActivityItem(log) {
  const isReturn = log.action === 'returned';
  const target = isReturn && log.to_level
    ? ` <span class="activity-item__target">→ paso ${log.to_level} (${escapeHtml(stepLabel(log.to_level))})</span>`
    : '';
  const number = log.requisition_number ? `<span class="req-number">${escapeHtml(log.requisition_number)}</span> — ` : '';
  return `
    <div class="activity-item${isReturn ? ' activity-item--returned' : ''}">
      <div class="activity-item__text">
        <strong>${escapeHtml(log.user_name)}</strong>
        ${escapeHtml(actionLabel(log.action))}
        <a href="${hrefFor('requisition-detail', { id: log.requisition_id })}">${number}${escapeHtml(log.requisition_title)}</a>${target}
        ${log.comments ? `<br><em>"${escapeHtml(log.comments)}"</em>` : ''}
      </div>
      <div class="activity-item__time">${formatDateShort(log.created_at)}</div>
    </div>
  `;
}

// --- Render ---

export async function render(container, _params, ctx) {
  const [statsResult, pendingResult] = await Promise.all([API.getDashboardStats(), API.getPending()]);
  if (ctx.isStale()) return;

  const stats = statsResult.data.summary || {};
  const byStatus = statsResult.data.by_status || {};
  const byStep = statsResult.data.by_step || {};
  const recentActivity = statsResult.data.recent_activity || [];
  const pendingRequisitions = pendingResult.data.items || [];
  const openTotal = (stats.pending || 0) + (stats.in_review || 0) + (stats.returned || 0);
  const isAdmin = Boolean(state.user && state.user.role_level === ADMIN_ROLE);

  let html = `
    <div class="stats">
      <div class="stat-card stat-card--total">
        <div class="stat-card__label">Total Requisiciones</div>
        <div class="stat-card__value stat-counter" data-target="${stats.total || 0}">0</div>
      </div>
      <div class="stat-card stat-card--pending">
        <div class="stat-card__label">En proceso</div>
        <div class="stat-card__value stat-counter" data-target="${openTotal}">0</div>
      </div>
      <div class="stat-card stat-card--approved">
        <div class="stat-card__label">${escapeHtml(statusLabel('approved'))}s</div>
        <div class="stat-card__value stat-counter" data-target="${stats.approved || 0}">0</div>
      </div>
      <div class="stat-card stat-card--rejected">
        <div class="stat-card__label">${escapeHtml(statusLabel('rejected'))}s</div>
        <div class="stat-card__value stat-counter" data-target="${stats.rejected || 0}">0</div>
      </div>
    </div>

    <div class="dashboard-charts">
      <div class="chart-card">
        <h3 class="chart-card__title">Distribución por Estado</h3>
        ${buildDonutChart(byStatus)}
      </div>
      <div class="chart-card">
        <h3 class="chart-card__title">Requisiciones por Etapa</h3>
        ${buildBarChart(byStep)}
      </div>
    </div>
  `;

  // Pending for current user
  html += '<div class="section"><h3 class="section__title">Pendientes para ti</h3>';
  if (pendingRequisitions.length === 0) {
    html += '<div class="empty">No tienes requisiciones pendientes por revisar</div>';
  } else {
    html += `<div class="pending-list">${pendingRequisitions.map(renderPendingItem).join('')}</div>`;
  }
  html += '</div>';

  // Recent activity
  html += `
    <div class="section">
      <div class="section__header">
        <h3 class="section__title">Actividad Reciente</h3>
        ${isAdmin ? '<button class="btn btn--outline btn--sm" id="btn-export-approvals" data-action="export-approvals">Exportar historial</button>' : ''}
      </div>
  `;
  if (recentActivity.length === 0) {
    html += '<div class="empty">No hay actividad reciente</div>';
  } else {
    html += `<div class="activity-list">${recentActivity.map(renderActivityItem).join('')}</div>`;
  }
  html += '</div>';

  container.innerHTML = html;

  requestAnimationFrame(() => {
    container.querySelectorAll('.stat-counter').forEach((el) => {
      animateCounter(el, parseInt(el.getAttribute('data-target'), 10) || 0, 1500);
    });
    animateBarChart(container);
  });
}

async function exportHistory(btn) {
  const restore = setButtonBusy(btn, 'Exportando...');
  try {
    await API.exportApprovalsCsv();
  } catch (err) {
    showToast(err.message || 'No se pudo exportar el historial', 'error');
  } finally {
    restore();
  }
}

export const actions = {
  'export-approvals': (t) => exportHistory(t),
};
