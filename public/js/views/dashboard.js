/* ============================================
   CID Aprueba — Dashboard view
   ============================================ */

import * as API from '../api.js';
import { escapeHtml, formatDateShort } from '../utils/format.js';
import { statusBadge, actionLabel, maxStep } from '../meta.js';
import { hrefFor } from '../router.js';

export const title = 'Panel de Control';

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
  const data = [
    { key: 'pending', label: 'Pendiente', value: byStatus.pending || 0, color: '#C85A2A' },
    { key: 'in_review', label: 'En revisión', value: byStatus.in_review || 0, color: '#6B8E23' },
    { key: 'approved', label: 'Aprobado', value: byStatus.approved || 0, color: '#3D5A1E' },
    { key: 'rejected', label: 'Rechazado', value: byStatus.rejected || 0, color: '#B22222' },
  ];

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
        <span class="chart-legend__label">${d.label}</span>
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
      <div class="bar-row${isZero ? ' bar-row--zero' : ''}">
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

// --- Render ---

export async function render(container, _params, ctx) {
  const [statsResult, pendingResult] = await Promise.all([API.getDashboardStats(), API.getPending()]);
  if (ctx.isStale()) return;

  const stats = statsResult.data.summary;
  const byStatus = statsResult.data.by_status || { pending: 0, in_review: 0, approved: 0, rejected: 0 };
  const byStep = statsResult.data.by_step || {};
  const recentActivity = statsResult.data.recent_activity || [];
  const pendingRequisitions = pendingResult.data.items || [];
  const pendingTotal = (stats.pending || 0) + (stats.in_review || 0);

  let html = `
    <div class="stats">
      <div class="stat-card stat-card--total">
        <div class="stat-card__label">Total Requisiciones</div>
        <div class="stat-card__value stat-counter" data-target="${stats.total}">0</div>
      </div>
      <div class="stat-card stat-card--pending">
        <div class="stat-card__label">Pendientes</div>
        <div class="stat-card__value stat-counter" data-target="${pendingTotal}">0</div>
      </div>
      <div class="stat-card stat-card--approved">
        <div class="stat-card__label">Aprobados</div>
        <div class="stat-card__value stat-counter" data-target="${stats.approved || 0}">0</div>
      </div>
      <div class="stat-card stat-card--rejected">
        <div class="stat-card__label">Rechazados</div>
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
    html += '<div class="pending-list">';
    for (const requisition of pendingRequisitions) {
      html += `
        <div class="pending-item" role="button" tabindex="0" data-action="view-requisition" data-id="${requisition.id}" aria-label="Ver requisición ${escapeHtml(requisition.title)}">
          <div>
            <div class="pending-item__title">${escapeHtml(requisition.title)}</div>
            <div class="pending-item__meta">Subido por ${escapeHtml(requisition.uploader_name)} — ${formatDateShort(requisition.created_at)}</div>
          </div>
          ${statusBadge(requisition.status)}
        </div>
      `;
    }
    html += '</div>';
  }
  html += '</div>';

  // Recent activity
  html += '<div class="section"><h3 class="section__title">Actividad Reciente</h3>';
  if (recentActivity.length === 0) {
    html += '<div class="empty">No hay actividad reciente</div>';
  } else {
    html += '<div class="activity-list">';
    for (const log of recentActivity) {
      html += `
        <div class="activity-item">
          <div class="activity-item__text">
            <strong>${escapeHtml(log.user_name)}</strong>
            ${escapeHtml(actionLabel(log.action))}
            <a href="${hrefFor('requisition-detail', { id: log.requisition_id })}">${escapeHtml(log.requisition_title)}</a>
            ${log.comments ? `<br><em>"${escapeHtml(log.comments)}"</em>` : ''}
          </div>
          <div class="activity-item__time">${formatDateShort(log.created_at)}</div>
        </div>
      `;
    }
    html += '</div>';
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
