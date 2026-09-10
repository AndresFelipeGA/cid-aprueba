/* ============================================
   CID Aprueba — Requisition detail view
   (approval / return / reject actions, resubmission, versions,
   quotations panel, comparison table, timeline)
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatDate, formatDateShort, formatCurrency, formatPercent } from '../utils/format.js';
import {
  statusBadge, statusLabel, actionLabel, stepLabel, stepRole, roleNameForStep, docTypes, acceptAttr, firstApprovalLevel,
} from '../meta.js';
import { navigate, hrefFor } from '../router.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog, openDocumentModal } from '../ui/modal.js';
import { setFeedback, setButtonBusy } from '../ui/feedback.js';
import { updateBadges } from '../badges.js';

export const title = 'Detalle de la Requisición';

const $ = (sel) => document.querySelector(sel);
const OPEN_STATUSES = new Set(['pending', 'in_review', 'returned']);
const isOpen = (req) => OPEN_STATUSES.has(req.status);
const hasAllDocs = (quotation) => {
  const docs = quotation.documents || [];
  return docTypes().every((dt) => docs.some((d) => d.doc_type === dt.key));
};
const QUOTATION_STEP = 4;
const SELECTION_STEP = 5;

/** Approver actions: label, button colour and confirmation copy. */
const APPROVAL_OPTIONS = {
  approve: {
    label: 'Aprobar',
    btnClass: 'btn--secondary',
    busy: 'Aprobando...',
    placeholder: 'Comentarios opcionales para la aprobación',
  },
  return_previous: {
    label: 'Devolver al paso anterior',
    btnClass: 'btn--warning',
    busy: 'Devolviendo...',
    placeholder: 'Explique el motivo de la devolución (obligatorio)',
    confirm: 'La requisición volverá al paso anterior para que sea revisada nuevamente. ¿Desea continuar?',
  },
  return_start: {
    label: 'Devolver al inicio (nueva versión del documento)',
    shortLabel: 'Devolver al inicio',
    btnClass: 'btn--warning',
    busy: 'Devolviendo...',
    placeholder: 'Explique qué debe corregirse en la nueva versión (obligatorio)',
    confirm: 'La requisición volverá al inicio y el/la coordinador/a deberá radicar una nueva versión del documento. ¿Desea continuar?',
  },
  reject: {
    label: 'Rechazar definitivamente',
    btnClass: 'btn--danger',
    busy: 'Rechazando...',
    placeholder: 'Explique el motivo del rechazo (obligatorio)',
    confirm: 'El rechazo es definitivo: la requisición quedará cerrada y no podrá continuar. ¿Desea continuar?',
  },
};

// --- Quotations panel ---

function renderQuotationCard(requisition, quotation, canEdit) {
  const docs = quotation.documents || [];
  const reqId = requisition.id;
  const qId = quotation.id;
  const filename = escapeHtml(quotation.original_filename);
  const isSelected = quotation.status === 'selected';

  let html = `
    <div class="quotation-card${isSelected ? ' quotation-card--selected' : ''}">
      <div class="quotation-card__header">
        <span class="quotation-card__provider">Cotización: ${escapeHtml(quotation.provider_name)}</span>
        <span class="quotation-card__price">
          <span class="quotation-card__amount">${formatCurrency(quotation.amount)}</span>
          ${isSelected ? '<span class="tag tag--success">Seleccionada</span>' : ''}
        </span>
      </div>
      ${quotation.notes ? `<div class="quotation-card__notes">${escapeHtml(quotation.notes)}</div>` : ''}
      <div class="quotation-card__file">
        <span class="quotation-card__filename" role="button" tabindex="0" data-action="preview-quotation-file" data-req-id="${reqId}" data-quotation-id="${qId}" data-filename="${filename}" title="Clic para vista previa">📄 ${filename}</span>
        <div class="quotation-card__actions">
          <button class="btn btn--outline btn--sm" data-action="preview-quotation-file" data-req-id="${reqId}" data-quotation-id="${qId}" data-filename="${filename}">Ver</button>
          ${canEdit ? `<button class="btn btn--danger btn--sm" data-action="delete-quotation" data-req-id="${reqId}" data-quotation-id="${qId}">Eliminar</button>` : ''}
        </div>
      </div>
      <div class="quotation-card__documents">
        <div class="quotation-card__documents-title">Documentos del proveedor:</div>
  `;

  for (const docType of docTypes()) {
    const doc = docs.find((d) => d.doc_type === docType.key);
    if (doc) {
      const docName = escapeHtml(doc.original_filename);
      html += `
        <div class="quotation-card__doc-item">
          <span class="quotation-card__doc-status quotation-card__doc-status--complete quotation-card__doc-filename" role="button" tabindex="0" data-action="preview-quotation-doc" data-req-id="${reqId}" data-quotation-id="${qId}" data-doc-id="${doc.id}" data-filename="${docName}" title="Clic para vista previa">✅ ${escapeHtml(docType.label)}: ${docName}</span>
          <div class="quotation-card__actions">
            <button class="btn btn--outline btn--sm" data-action="preview-quotation-doc" data-req-id="${reqId}" data-quotation-id="${qId}" data-doc-id="${doc.id}" data-filename="${docName}">Ver</button>
            ${canEdit ? `<button class="btn btn--danger btn--sm" data-action="delete-quotation-doc" data-req-id="${reqId}" data-quotation-id="${qId}" data-doc-id="${doc.id}">Eliminar</button>` : ''}
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="quotation-card__doc-item">
          <span class="quotation-card__doc-status quotation-card__doc-status--missing">❌ ${escapeHtml(docType.label)}: (sin adjuntar)</span>
          <div class="quotation-card__actions">
            ${canEdit ? `
            <label class="btn btn--outline btn--sm quotation-card__attach-btn">
              Adjuntar
              <input type="file" class="hidden" data-action="attach-quotation-doc" data-req-id="${reqId}" data-quotation-id="${qId}" data-doc-type="${docType.key}" accept="${acceptAttr()}">
            </label>` : ''}
          </div>
        </div>
      `;
    }
  }

  html += '</div></div>';
  return html;
}

function renderQuotationsPanel(requisition, quotations) {
  const user = state.user;
  const isAtQuotationStep = requisition.current_approval_level === QUOTATION_STEP && isOpen(requisition);
  const canEdit = Boolean(user && user.role_level === stepRole(QUOTATION_STEP) && isAtQuotationStep);
  const canAdd = canEdit && quotations.length < 3;

  if (!isAtQuotationStep && quotations.length === 0) return '';

  let html = `
    <div class="quotations-panel" id="quotations-panel">
      <div class="quotations-panel__header">
        <h3 class="quotations-panel__title">Cotizaciones de Proveedores</h3>
        ${canAdd ? `<button class="btn btn--primary btn--sm quotations-panel__add-btn" id="btn-add-quotation" data-action="toggle-quotation-form">+ Agregar Cotización</button>` : ''}
      </div>
  `;

  if (canAdd) {
    html += `
      <div class="quotation-form hidden" id="quotation-form">
        <div class="quotation-form__field">
          <label class="form__label" for="quotation-provider">Nombre del proveedor</label>
          <input class="form__input" type="text" id="quotation-provider" required placeholder="Ej: Proveedor ABC" maxlength="255">
        </div>
        <div class="quotation-form__field">
          <label class="form__label" for="quotation-amount">Monto (COP)</label>
          <input class="form__input" type="number" id="quotation-amount" required min="1" step="1" inputmode="numeric" placeholder="Ej: 1250000">
        </div>
        <div class="quotation-form__field">
          <label class="form__label" for="quotation-notes">Notas (opcional)</label>
          <textarea class="form__input" id="quotation-notes" rows="2" maxlength="500" placeholder="Condiciones, tiempos de entrega, garantías..."></textarea>
        </div>
        <div class="quotation-form__field">
          <label class="form__label" for="quotation-file">Archivo de cotización</label>
          <input class="form__input form__input--file" type="file" id="quotation-file" required accept="${acceptAttr()}">
        </div>
        <div id="quotation-form-feedback"></div>
        <div class="quotation-form__actions">
          <button class="btn btn--primary btn--sm" id="btn-submit-quotation" data-action="submit-quotation" data-req-id="${requisition.id}">Subir Cotización</button>
          <button class="btn btn--outline btn--sm" data-action="cancel-quotation-form">Cancelar</button>
        </div>
      </div>
    `;
  }

  if (quotations.length === 0) {
    html += '<div class="empty" style="padding: 24px;">No hay cotizaciones adjuntas aún.</div>';
  } else {
    for (const quotation of quotations) {
      html += renderQuotationCard(requisition, quotation, canEdit);
    }
  }

  if (isAtQuotationStep && !quotations.some(hasAllDocs)) {
    html += `
      <div class="quotation-warning">
        <span>⚠️</span>
        <span>Debe completar al menos una cotización con todos los documentos para poder aprobar.</span>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

// --- Step 5: comparison table ---

/** Quotations sorted by amount (ascending) with the % difference vs. the lowest. */
export function compareQuotations(quotations) {
  const sorted = [...quotations].sort((a, b) => Number(a.amount) - Number(b.amount));
  const lowest = sorted.length ? Number(sorted[0].amount) : 0;
  return sorted.map((q, i) => ({
    quotation: q,
    isLowest: i === 0,
    diffPercent: lowest > 0 ? ((Number(q.amount) - lowest) / lowest) * 100 : 0,
  }));
}

function renderComparisonTable(quotations) {
  const rows = compareQuotations(quotations)
    .map(({ quotation, isLowest, diffPercent }) => {
      const complete = hasAllDocs(quotation);
      return `
        <tr class="quotation-compare__row${isLowest ? ' quotation-compare__row--lowest' : ''}${complete ? '' : ' quotation-compare__row--incomplete'}">
          <td>
            <span class="quotation-compare__provider">${escapeHtml(quotation.provider_name)}</span>
            ${isLowest ? '<span class="tag tag--success">Menor precio</span>' : ''}
            ${quotation.notes ? `<div class="quotation-compare__notes">${escapeHtml(quotation.notes)}</div>` : ''}
          </td>
          <td class="quotation-compare__amount">${formatCurrency(quotation.amount)}</td>
          <td class="quotation-compare__diff">${isLowest ? '—' : formatPercent(diffPercent)}</td>
          <td>${complete
    ? '<span class="quotation-selection__complete">✅ Completa</span>'
    : '<span class="quotation-selection__warning">⚠️ Incompleta</span>'}</td>
          <td class="quotation-compare__select">
            <input type="radio" name="selected_quotation" value="${quotation.id}" class="quotation-selection__radio" aria-label="Seleccionar ${escapeHtml(quotation.provider_name)}" ${complete ? '' : 'disabled'}>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="quotation-selection" id="quotation-selection">
      <label class="form__label">Seleccione la cotización ganadora</label>
      <div class="table-wrap quotation-compare">
        <table class="table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Monto</th>
              <th>Diferencia vs. menor (%)</th>
              <th>Documentación</th>
              <th>Seleccionar</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Approval panel (levels ≥ first_approval_level) ---

function renderApprovalPanel(requisition, quotations) {
  const user = state.user;
  const level = requisition.current_approval_level;
  const isSelectionStep = level === SELECTION_STEP;
  const showPrevious = level > firstApprovalLevel(); // at the first approval step "previous" equals "start"

  let html = `
    <div class="approval-panel" id="approval-panel">
      <h3 class="approval-panel__title">Acción de aprobación — ${stepLabel(level)} (${roleNameForStep(level, user.gender)})</h3>
  `;

  if (isSelectionStep && quotations.length > 1) {
    html += renderComparisonTable(quotations);
  } else if (isSelectionStep && quotations.length === 1) {
    html += `
      <div class="alert alert--info" style="margin-bottom: 12px;">
        Se aprobará automáticamente la única cotización: <strong>${escapeHtml(quotations[0].provider_name)}</strong>
        (${formatCurrency(quotations[0].amount)})
      </div>
    `;
  } else if (isSelectionStep) {
    html += '<div class="alert alert--error">No hay cotizaciones disponibles para seleccionar. El paso anterior debe agregar cotizaciones.</div>';
  }

  const option = (key, checked) => `
    <label class="approval-options__option approval-options__option--${key}">
      <input type="radio" name="approval-action" value="${key}" data-action="approval-option" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(APPROVAL_OPTIONS[key].label)}</span>
    </label>`;

  html += `
      <fieldset class="approval-options" id="approval-options">
        <legend class="form__label">Decisión</legend>
        ${option('approve', true)}
        ${showPrevious ? option('return_previous', false) : ''}
        ${option('return_start', false)}
        ${option('reject', false)}
      </fieldset>
      <div class="form__group">
        <label class="form__label" for="approval-comments">Comentarios <span class="approval-panel__required hidden" id="approval-comments-required">(obligatorios)</span></label>
        <textarea class="form__input" id="approval-comments" rows="3" placeholder="${escapeHtml(APPROVAL_OPTIONS.approve.placeholder)}"></textarea>
        <div class="form__error hidden" id="approval-comments-error">Los comentarios son obligatorios para devolver o rechazar una requisición.</div>
      </div>
      <div id="approval-feedback"></div>
      <div class="approval-panel__actions">
        <button class="btn ${APPROVAL_OPTIONS.approve.btnClass}" id="btn-approval-submit" data-action="submit-approval" data-id="${requisition.id}">${escapeHtml(APPROVAL_OPTIONS.approve.label)}</button>
      </div>
    </div>
  `;
  return html;
}

function selectedApprovalOption() {
  const radio = document.querySelector('input[name="approval-action"]:checked');
  return radio ? radio.value : 'approve';
}

/** Sync the submit button and comments hint with the chosen radio option. */
function updateApprovalControls() {
  const key = selectedApprovalOption();
  const option = APPROVAL_OPTIONS[key] || APPROVAL_OPTIONS.approve;
  const btn = $('#btn-approval-submit');
  if (btn) {
    btn.className = `btn ${option.btnClass}`;
    btn.textContent = option.shortLabel || option.label;
  }
  const comments = $('#approval-comments');
  if (comments) comments.placeholder = option.placeholder;
  const required = $('#approval-comments-required');
  if (required) required.classList.toggle('hidden', key === 'approve');
  const error = $('#approval-comments-error');
  if (error) error.classList.add('hidden');
}

// --- Coordinator: "Radicar nueva versión" ---

function renderResubmitPanel(requisition) {
  return `
    <div class="approval-panel resubmit-panel" id="resubmit-panel">
      <h3 class="approval-panel__title">Radicar nueva versión</h3>
      <p class="resubmit-panel__hint">Corrija el documento según los comentarios de la devolución y radique la nueva versión (v${(requisition.version || 1) + 1}). La requisición volverá a la ${escapeHtml(stepLabel(firstApprovalLevel()))}.</p>
      <div id="resubmit-feedback"></div>
      <form id="resubmit-form" novalidate>
        <div class="form__group">
          <label class="form__label" for="resubmit-title">Título</label>
          <input class="form__input" type="text" id="resubmit-title" required maxlength="255" value="${escapeHtml(requisition.title)}">
        </div>
        <div class="form__group">
          <label class="form__label" for="resubmit-description">Descripción</label>
          <textarea class="form__input" id="resubmit-description" rows="3" maxlength="1000">${escapeHtml(requisition.description || '')}</textarea>
        </div>
        <div class="form__group">
          <label class="form__label" for="resubmit-file">Nuevo archivo</label>
          <div class="upload-form__file-area" id="resubmit-drop-area" role="button" tabindex="0" aria-label="Seleccionar archivo de la nueva versión">
            <div class="upload-form__file-text">Haz clic o arrastra el nuevo archivo aquí</div>
            <input type="file" id="resubmit-file" style="display:none" accept="${acceptAttr()}">
            <div class="upload-form__file-name" id="resubmit-file-name"></div>
          </div>
        </div>
        <div class="form__group">
          <label class="form__label" for="resubmit-comments">Comentarios</label>
          <textarea class="form__input" id="resubmit-comments" rows="2" maxlength="1000" placeholder="Qué cambió en esta versión (opcional)"></textarea>
        </div>
        <button class="btn btn--primary" type="submit" id="btn-resubmit">Radicar nueva versión</button>
      </form>
    </div>
  `;
}

/** Click / keyboard / drag-and-drop wiring for a file drop area. */
function wireDropArea(dropArea, fileInput, fileNameEl) {
  if (!dropArea || !fileInput) return;
  const pickFile = (file) => {
    if (fileNameEl) fileNameEl.textContent = file.name;
  };
  dropArea.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('upload-form__file-area--active');
  });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('upload-form__file-area--active'));
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('upload-form__file-area--active');
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      pickFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) pickFile(fileInput.files[0]);
  });
}

// --- Versions ---

function renderVersions(requisition, versions) {
  if (!versions || versions.length < 2) return '';
  const items = [...versions]
    .sort((a, b) => b.version - a.version)
    .map((v) => {
      const isCurrent = v.version === requisition.version;
      const filename = escapeHtml(v.original_filename);
      return `
        <li class="version-item${isCurrent ? ' version-item--current' : ''}">
          <div class="version-item__main">
            <span class="version-badge">v${v.version}</span>
            <span class="version-item__file">${filename}</span>
            ${isCurrent ? '<span class="tag tag--success">Actual</span>' : ''}
          </div>
          <div class="version-item__meta">${escapeHtml(v.created_by_name)} — ${formatDate(v.created_at)}</div>
          ${v.comments ? `<div class="version-item__comment">"${escapeHtml(v.comments)}"</div>` : ''}
          <div class="version-item__actions">
            <button class="btn btn--outline btn--sm" data-action="preview-version" data-req-id="${requisition.id}" data-version-id="${v.id}" data-filename="${filename}">Ver</button>
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <div class="versions-panel" id="versions-panel">
      <h3 class="versions-panel__title">Versiones del documento</h3>
      <ul class="versions-panel__list">${items}</ul>
    </div>
  `;
}

// --- Timeline ---

function renderTimeline(requisition, steps, logs) {
  const user = state.user;
  let html = `
    <div class="timeline">
      <h3 class="timeline__title">Línea de aprobación</h3>
      <ul class="timeline__list">
  `;

  const isCurrentStep = (step) => step.step_level === requisition.current_approval_level && isOpen(requisition);

  for (const step of steps) {
    const stepLog = logs.find((l) => l.approval_step_id === step.id && l.action !== 'returned');
    let itemClass = 'timeline__item--pending';
    if (step.status === 'approved') {
      itemClass = 'timeline__item--approved';
    } else if (step.status === 'rejected') {
      itemClass = 'timeline__item--rejected';
    } else if (isCurrentStep(step)) {
      itemClass = requisition.status === 'returned' ? 'timeline__item--current timeline__item--returned' : 'timeline__item--current';
    }

    // Gender for the role label: acting user's when the step is done, the
    // current user's when it is their step, neutral otherwise.
    const stepRoleLevel = stepRole(step.step_level) ?? step.step_level;
    let stepGender = null;
    if (stepLog && stepLog.user_gender) {
      stepGender = stepLog.user_gender;
    } else if (user && stepRoleLevel === user.role_level) {
      stepGender = user.gender;
    }

    const statusText = isCurrentStep(step) && requisition.status === 'returned' && step.status !== 'approved'
      ? statusLabel('returned')
      : statusLabel(step.status);

    // Role is shown only while nobody has acted yet (it says who this step is waiting on);
    // once acted, the person's name + when already makes the role obvious from the step title.
    const roleLine = !stepLog
      ? `<div class="timeline__step-role">${escapeHtml(roleNameForStep(step.step_level, stepGender))}</div>`
      : '';
    const statusLine = stepLog
      ? `${escapeHtml(statusText)} — ${escapeHtml(stepLog.user_name)} · ${formatDateShort(stepLog.created_at)}`
      : escapeHtml(statusText);

    html += `
      <li class="timeline__item ${itemClass}" title="${escapeHtml(roleNameForStep(step.step_level, stepGender))}">
        <div class="timeline__dot"></div>
        <div class="timeline__level">${escapeHtml(stepLabel(step.step_level))}</div>
        ${roleLine}
        <div class="timeline__status">${statusLine}</div>
        ${stepLog && stepLog.comments ? `<div class="timeline__comment">"${escapeHtml(stepLog.comments)}"</div>` : ''}
      </li>
    `;
  }

  html += '</ul></div>';

  if (logs.length > 0) {
    html += `
      <div class="timeline">
        <h3 class="timeline__title">Historial de acciones</h3>
        <div class="activity-list" style="border: none; box-shadow: none;">
    `;
    for (const log of logs) {
      const isReturn = log.action === 'returned';
      const target = isReturn && log.to_level
        ? ` <span class="activity-item__target">→ paso ${log.to_level} (${escapeHtml(stepLabel(log.to_level))})</span>`
        : '';
      html += `
        <div class="activity-item${isReturn ? ' activity-item--returned' : ''}">
          <div class="activity-item__text">
            <strong>${escapeHtml(log.user_name)}</strong> ${escapeHtml(actionLabel(log.action))}${target}
            ${log.comments ? `<br><em>"${escapeHtml(log.comments)}"</em>` : ''}
          </div>
          <div class="activity-item__time">${formatDateShort(log.created_at)}</div>
        </div>
      `;
    }
    html += '</div></div>';
  }

  return html;
}

// --- Returned banner ---

function renderReturnedBanner(requisition, logs) {
  const lastReturn = logs.find((l) => l.action === 'returned');
  const fromLevel = requisition.returned_from_level;
  const by = lastReturn ? lastReturn.user_name : null;
  const reason = requisition.return_reason || (lastReturn && lastReturn.comments) || '';
  const needsResubmission = requisition.current_approval_level < firstApprovalLevel();

  return `
    <div class="alert alert--warning returned-banner" role="status">
      <div class="returned-banner__title">
        Devuelta${fromLevel ? ` desde ${escapeHtml(stepLabel(fromLevel))}` : ''}${by ? ` por ${escapeHtml(by)}` : ''}
      </div>
      ${reason ? `<blockquote class="returned-banner__reason">"${escapeHtml(reason)}"</blockquote>` : ''}
      <div class="returned-banner__hint">${needsResubmission
    ? 'El/la coordinador/a debe radicar una nueva versión del documento.'
    : `Debe ser revisada nuevamente en ${escapeHtml(stepLabel(requisition.current_approval_level))}.`}</div>
    </div>
  `;
}

// --- Render ---

export async function render(container, params, ctx) {
  const result = await API.getRequisition(params.id);
  if (ctx.isStale()) return;

  const requisition = result.data.requisition;
  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const versions = requisition.versions || [];
  const user = state.user;
  const level = requisition.current_approval_level;
  const canAct = Boolean(user && user.role_level === stepRole(level) && level >= firstApprovalLevel() && isOpen(requisition));
  const canResubmit = Boolean(
    user && user.role_level === 1 && requisition.status === 'returned' && level < firstApprovalLevel(),
  );
  const filename = escapeHtml(requisition.original_filename);
  const version = requisition.version || 1;

  const projectHtml = requisition.project_name
    ? escapeHtml(requisition.project_name) + (requisition.project_code ? ` (${escapeHtml(requisition.project_code)})` : '')
    : '<span style="color:var(--color-text-light)">Sin proyecto</span>';

  let html = `
    <a href="${hrefFor('requisitions')}" class="back-link">&larr; Volver a requisiciones</a>

    <div class="req-detail">
      <div class="req-detail__left">
        ${requisition.status === 'returned' ? renderReturnedBanner(requisition, logs) : ''}
        <div class="req-detail__info">
          <div class="req-detail__heading">
            <span class="req-detail__number">${escapeHtml(requisition.number || `#${requisition.id}`)}</span>
            ${version > 1 ? `<span class="version-badge" title="Versión ${version} del documento">v${version}</span>` : ''}
            ${statusBadge(requisition.status)}
          </div>
          <h2 class="req-detail__title">${escapeHtml(requisition.title)}</h2>
          <ul class="req-detail__meta">
            <li>
              <span class="req-detail__meta-label">Estado</span>
              <span class="req-detail__meta-value">${statusBadge(requisition.status)}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Nivel actual</span>
              <span class="req-detail__meta-value">${escapeHtml(stepLabel(level))} (${escapeHtml(roleNameForStep(level))})</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Proyecto</span>
              <span class="req-detail__meta-value">${projectHtml}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Radicada por</span>
              <span class="req-detail__meta-value">${escapeHtml(requisition.uploader_name)}${requisition.uploader_territory ? ` — ${escapeHtml(requisition.uploader_territory)}` : ''}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Archivo${version > 1 ? ` (v${version})` : ''}</span>
              <span class="req-detail__meta-value req-detail__file-link" role="button" tabindex="0" data-action="preview-requisition-file" data-id="${requisition.id}" data-filename="${filename}" title="Clic para vista previa">${filename}</span>
            </li>
            ${requisition.selected_provider_name ? `
            <li>
              <span class="req-detail__meta-label">Cotización seleccionada</span>
              <span class="req-detail__meta-value">${escapeHtml(requisition.selected_provider_name)} — ${formatCurrency(requisition.selected_amount)}</span>
            </li>` : ''}
            <li>
              <span class="req-detail__meta-label">Fecha de creación</span>
              <span class="req-detail__meta-value">${formatDate(requisition.created_at)}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Última actualización</span>
              <span class="req-detail__meta-value">${formatDate(requisition.updated_at)}</span>
            </li>
          </ul>
          ${requisition.description ? `<div class="req-detail__description">${escapeHtml(requisition.description)}</div>` : ''}
          <div class="req-detail__actions">
            <button class="btn btn--outline btn--sm" data-action="preview-requisition-file" data-id="${requisition.id}" data-filename="${filename}">Ver documento</button>
            ${requisition.status === 'approved'
    ? `<button class="btn btn--secondary btn--sm" id="btn-generate-acta" data-action="generate-acta" data-id="${requisition.id}">Generar acta</button>`
    : ''}
          </div>
        </div>
  `;

  if (canResubmit) html += renderResubmitPanel(requisition);
  html += renderVersions(requisition, versions);
  html += renderQuotationsPanel(requisition, quotations);
  if (canAct) html += renderApprovalPanel(requisition, quotations);

  html += '</div>'; // left column
  html += `<div class="req-detail__right">${renderTimeline(requisition, steps, logs)}</div>`;
  html += '</div>'; // req-detail grid

  container.innerHTML = html;

  if (canResubmit) {
    wireDropArea($('#resubmit-drop-area'), $('#resubmit-file'), $('#resubmit-file-name'));
    const form = $('#resubmit-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleResubmit(requisition.id);
      });
    }
  }

  // Arrived from a "Revisar" shortcut (e.g. dashboard pending list): jump straight to the action panel
  if (params.focus === 'approve' && canAct) {
    const panel = $('#approval-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const comments = $('#approval-comments');
      if (comments) comments.focus({ preventScroll: true });
    }
  }
}

// --- Approval handlers ---

async function handleApprovalSubmit(requisitionId) {
  const key = selectedApprovalOption();
  const option = APPROVAL_OPTIONS[key] || APPROVAL_OPTIONS.approve;
  const commentsEl = $('#approval-comments');
  const comments = commentsEl ? commentsEl.value.trim() : '';
  const feedback = $('#approval-feedback');
  const submitBtn = $('#btn-approval-submit');
  const commentsError = $('#approval-comments-error');

  setFeedback(feedback, 'error', '');

  if (key !== 'approve' && !comments) {
    if (commentsError) commentsError.classList.remove('hidden');
    if (commentsEl) {
      commentsEl.classList.add('form__input--invalid');
      commentsEl.focus();
    }
    return;
  }
  if (commentsError) commentsError.classList.add('hidden');
  if (commentsEl) commentsEl.classList.remove('form__input--invalid');

  let selectedQuotationId = null;
  if (key === 'approve' && $('#quotation-selection')) {
    const selectedRadio = document.querySelector('input[name="selected_quotation"]:checked');
    if (!selectedRadio) {
      setFeedback(feedback, 'error', 'Debe seleccionar una cotización antes de aprobar.');
      return;
    }
    selectedQuotationId = selectedRadio.value;
  }

  if (option.confirm && !(await confirmDialog(option.confirm))) return;

  const restore = setButtonBusy(submitBtn, option.busy);
  document.querySelectorAll('input[name="approval-action"]').forEach((r) => { r.disabled = true; });

  try {
    let result;
    if (key === 'approve') {
      result = await API.approveRequisition(requisitionId, comments, selectedQuotationId);
    } else if (key === 'reject') {
      result = await API.rejectRequisition(requisitionId, comments);
    } else {
      result = await API.returnRequisition(requisitionId, key === 'return_start' ? 'start' : 'previous', comments);
    }
    const message = result.message || 'Acción registrada';
    setFeedback(feedback, 'success', message);
    showToast(message, key === 'approve' ? 'success' : 'warning');
    updateBadges();
    setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 800);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al registrar la acción');
    restore();
    document.querySelectorAll('input[name="approval-action"]').forEach((r) => { r.disabled = false; });
  }
}

// --- Resubmission handler ---

async function handleResubmit(requisitionId) {
  const titleEl = $('#resubmit-title');
  const descriptionEl = $('#resubmit-description');
  const commentsEl = $('#resubmit-comments');
  const fileInput = $('#resubmit-file');
  const feedback = $('#resubmit-feedback');

  const newTitle = titleEl ? titleEl.value.trim() : '';
  if (!newTitle) {
    setFeedback(feedback, 'error', 'El título es obligatorio');
    return;
  }
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    setFeedback(feedback, 'error', 'Debe seleccionar el archivo de la nueva versión');
    return;
  }

  const formData = new FormData();
  formData.append('title', newTitle);
  formData.append('description', descriptionEl ? descriptionEl.value.trim() : '');
  const comments = commentsEl ? commentsEl.value.trim() : '';
  if (comments) formData.append('comments', comments);
  formData.append('file', fileInput.files[0]);

  const restore = setButtonBusy($('#btn-resubmit'), 'Radicando...');
  setFeedback(feedback, 'error', '');

  try {
    const result = await API.resubmitRequisition(requisitionId, formData);
    const message = result.message || 'Nueva versión radicada exitosamente';
    showToast(message, 'success');
    updateBadges();
    navigate('requisition-detail', { id: requisitionId });
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al radicar la nueva versión');
    restore();
  }
}

// --- Quotation handlers ---

function toggleQuotationForm() {
  const form = $('#quotation-form');
  if (form) form.classList.toggle('hidden');
}

function cancelQuotationForm() {
  const form = $('#quotation-form');
  if (!form) return;
  form.classList.add('hidden');
  ['#quotation-provider', '#quotation-amount', '#quotation-notes', '#quotation-file'].forEach((sel) => {
    const el = $(sel);
    if (el) el.value = '';
  });
  setFeedback($('#quotation-form-feedback'), 'error', '');
}

async function submitQuotation(requisitionId) {
  const providerInput = $('#quotation-provider');
  const amountInput = $('#quotation-amount');
  const notesInput = $('#quotation-notes');
  const fileInput = $('#quotation-file');
  const feedback = $('#quotation-form-feedback');
  const btn = $('#btn-submit-quotation');

  const providerName = providerInput ? providerInput.value.trim() : '';
  if (!providerName) {
    setFeedback(feedback, 'error', 'El nombre del proveedor es obligatorio');
    return;
  }
  const amount = amountInput ? Number(amountInput.value) : NaN;
  if (!amountInput || amountInput.value.trim() === '' || Number.isNaN(amount) || amount <= 0) {
    setFeedback(feedback, 'error', 'El monto de la cotización es obligatorio y debe ser mayor a cero');
    return;
  }
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    setFeedback(feedback, 'error', 'Debe seleccionar un archivo de cotización');
    return;
  }

  const formData = new FormData();
  formData.append('provider_name', providerName);
  formData.append('amount', String(amount));
  const notes = notesInput ? notesInput.value.trim() : '';
  if (notes) formData.append('notes', notes);
  formData.append('file', fileInput.files[0]);

  const restore = setButtonBusy(btn, 'Subiendo...');
  setFeedback(feedback, 'error', '');

  try {
    await API.createQuotation(requisitionId, formData);
    navigate('requisition-detail', { id: requisitionId });
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al crear la cotización');
    restore();
  }
}

async function deleteQuotation(requisitionId, quotationId) {
  if (!(await confirmDialog('¿Está seguro de eliminar esta cotización y todos sus documentos?'))) return;
  try {
    await API.deleteQuotation(requisitionId, quotationId);
    navigate('requisition-detail', { id: requisitionId });
  } catch (err) {
    showToast(err.message || 'Error al eliminar la cotización', 'error');
  }
}

async function attachQuotationDoc(requisitionId, quotationId, docType, fileInput) {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

  const formData = new FormData();
  formData.append('doc_type', docType);
  formData.append('file', fileInput.files[0]);

  try {
    await API.uploadQuotationDocument(requisitionId, quotationId, formData);
    navigate('requisition-detail', { id: requisitionId });
  } catch (err) {
    showToast(err.message || 'Error al adjuntar el documento', 'error');
  }
}

async function deleteQuotationDoc(requisitionId, quotationId, docId) {
  if (!(await confirmDialog('¿Está seguro de eliminar este documento?'))) return;
  try {
    await API.deleteQuotationDocument(requisitionId, quotationId, docId);
    navigate('requisition-detail', { id: requisitionId });
  } catch (err) {
    showToast(err.message || 'Error al eliminar el documento', 'error');
  }
}

// --- data-action handlers (click) ---

export const actions = {
  'submit-approval': (t) => handleApprovalSubmit(t.dataset.id),
  'generate-acta': (t) => navigate('acta', { id: t.dataset.id }),
  'preview-requisition-file': (t) => openDocumentModal(() => API.downloadRequisition(t.dataset.id), t.dataset.filename),
  'preview-version': (t) =>
    openDocumentModal(() => API.downloadRequisitionVersion(t.dataset.reqId, t.dataset.versionId), t.dataset.filename),
  'preview-quotation-file': (t) =>
    openDocumentModal(() => API.downloadQuotationFile(t.dataset.reqId, t.dataset.quotationId), t.dataset.filename),
  'preview-quotation-doc': (t) =>
    openDocumentModal(
      () => API.downloadQuotationDocument(t.dataset.reqId, t.dataset.quotationId, t.dataset.docId),
      t.dataset.filename,
    ),
  'toggle-quotation-form': () => toggleQuotationForm(),
  'cancel-quotation-form': () => cancelQuotationForm(),
  'submit-quotation': (t) => submitQuotation(t.dataset.reqId),
  'delete-quotation': (t) => deleteQuotation(t.dataset.reqId, t.dataset.quotationId),
  'delete-quotation-doc': (t) => deleteQuotationDoc(t.dataset.reqId, t.dataset.quotationId, t.dataset.docId),
};

// --- data-action handlers (change) ---

export const changeActions = {
  'attach-quotation-doc': (t) => attachQuotationDoc(t.dataset.reqId, t.dataset.quotationId, t.dataset.docType, t),
  'approval-option': () => updateApprovalControls(),
};
