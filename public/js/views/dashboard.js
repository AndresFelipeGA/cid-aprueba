/* ============================================
   CID Aprueba — Dashboard view
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatDateShort, formatRelativeTime } from '../utils/format.js';
import { statusBadge, statusLabel, actionLabel, stepLabel, maxStep } from '../meta.js';
import { hrefFor, navigate } from '../router.js';
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
  // Proportional to the total open requisitions, not to the busiest step —
  // otherwise a single requisition fills its bar to 100% and looks like everything is done.
  const total = Object.values(byStep).reduce((sum, c) => sum + c, 0);
  let rows = '';
  for (let step = 1; step <= maxStep(); step++) {
    const count = byStep[String(step)] || 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    const isZero = count === 0;
    const label = stepLabel(step);
    rows += `
      <div class="bar-row${isZero ? ' bar-row--zero' : ''}">
        <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
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
  const user = state.user;
  const needsResubmit = requisition.status === 'returned' && user && user.role_level === 1;
  const buttonLabel = needsResubmit ? 'Radicar nueva versión' : 'Revisar';
  const actionParams = needsResubmit ? {} : { focus: 'approve' };
  return `
    <div class="pending-item" role="button" tabindex="0" data-action="view-requisition" data-id="${requisition.id}" aria-label="Ver requisición ${escapeHtml(requisition.number || '')} ${escapeHtml(requisition.title)}">
      <div class="pending-item__body">
        <div class="pending-item__title">${number}${escapeHtml(requisition.title)} ${pendingTag(requisition)}</div>
        <div class="pending-item__meta">Radicada por ${escapeHtml(requisition.uploader_name)} — ${formatDateShort(requisition.created_at)} — ${escapeHtml(stepLabel(requisition.current_approval_level))}</div>
      </div>
      <div class="pending-item__right">
        ${statusBadge(requisition.status)}
        <button class="btn btn--primary btn--sm" data-action="review-requisition" data-id="${requisition.id}" data-params='${escapeHtml(JSON.stringify(actionParams))}'>${escapeHtml(buttonLabel)}</button>
      </div>
    </div>
  `;
}

// --- Recent activity (grouped by requisition, relative time, collapsed detail) ---

function renderActivityItem(log, { compact = false } = {}) {
  const isReturn = log.action === 'returned';
  const target = isReturn && log.to_level
    ? ` <span class="activity-item__target">→ paso ${log.to_level} (${escapeHtml(stepLabel(log.to_level))})</span>`
    : '';
  const number = !compact && log.requisition_number ? `<span class="req-number">${escapeHtml(log.requisition_number)}</span> — ` : '';
  const link = compact ? '' : `<a href="${hrefFor('requisition-detail', { id: log.requisition_id })}">${number}${escapeHtml(log.requisition_title)}</a>`;
  return `
    <div class="activity-item${isReturn ? ' activity-item--returned' : ''}${compact ? ' activity-item--compact' : ''}">
      <div class="activity-item__text">
        <strong>${escapeHtml(log.user_name)}</strong>
        ${escapeHtml(actionLabel(log.action))}
        ${link}${target}
        ${log.comments ? `<br><em>"${escapeHtml(log.comments)}"</em>` : ''}
      </div>
      <div class="activity-item__time" title="${escapeHtml(formatDateShort(log.created_at))}">${escapeHtml(formatRelativeTime(log.created_at))}</div>
    </div>
  `;
}

/** Group consecutive-or-not logs by requisition, preserving overall (most-recent-first) order. */
function groupActivityByRequisition(logs) {
  const order = [];
  const groups = new Map();
  for (const log of logs) {
    if (!groups.has(log.requisition_id)) {
      groups.set(log.requisition_id, []);
      order.push(log.requisition_id);
    }
    groups.get(log.requisition_id).push(log);
  }
  return order.map((id) => groups.get(id));
}

function renderActivityGroup(group) {
  const [head, ...rest] = group;
  let html = `<div class="activity-group">${renderActivityItem(head)}`;
  if (rest.length > 0) {
    html += `
      <details class="activity-group__more">
        <summary>${rest.length} acción${rest.length > 1 ? 'es' : ''} anterior${rest.length > 1 ? 'es' : ''} en esta requisición</summary>
        ${rest.map((log) => renderActivityItem(log, { compact: true })).join('')}
      </details>
    `;
  }
  html += '</div>';
  return html;
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
    const groups = groupActivityByRequisition(recentActivity);
    html += `<div class="activity-list">${groups.map(renderActivityGroup).join('')}</div>`;
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

function reviewRequisition(t) {
  let extra = {};
  try {
    extra = JSON.parse(t.dataset.params || '{}');
  } catch (_err) {
    // ignore malformed data
  }
  navigate('requisition-detail', { id: t.dataset.id, ...extra });
}

export const actions = {
  'export-approvals': (t) => exportHistory(t),
  'review-requisition': (t) => reviewRequisition(t),
};
