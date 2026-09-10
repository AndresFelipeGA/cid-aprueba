/* ============================================
   CID Aprueba — Requisition detail view
   (approval actions, quotations panel, timeline)
   ============================================ */

import * as API from '../api.js';
import { state, setPendingPreview, takePendingPreview } from '../state.js';
import { escapeHtml, formatDate, formatDateShort } from '../utils/format.js';
import { statusBadge, statusLabel, actionLabel, stepLabel, stepRole, roleNameForStep, docTypes, acceptAttr } from '../meta.js';
import { navigate, hrefFor } from '../router.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog, openDocumentModal } from '../ui/modal.js';
import { setFeedback, setButtonBusy } from '../ui/feedback.js';
import { updateBadges } from '../badges.js';

export const title = 'Detalle de la Requisición';

const $ = (sel) => document.querySelector(sel);
const isOpen = (req) => req.status === 'pending' || req.status === 'in_review';
const hasAllDocs = (quotation) => {
  const docs = quotation.documents || [];
  return docTypes().every((dt) => docs.some((d) => d.doc_type === dt.key));
};

// --- Quotations panel ---

function renderQuotationCard(requisition, quotation, canEdit) {
  const docs = quotation.documents || [];
  const reqId = requisition.id;
  const qId = quotation.id;
  const filename = escapeHtml(quotation.original_filename);

  let html = `
    <div class="quotation-card">
      <div class="quotation-card__header">
        <span class="quotation-card__provider">Cotización: ${escapeHtml(quotation.provider_name)}</span>
      </div>
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
  const isAtLevel4 = requisition.current_approval_level === 4 && isOpen(requisition);
  const canEdit = Boolean(user && user.role_level === 4 && isAtLevel4);
  const canAdd = canEdit && quotations.length < 3;

  if (!isAtLevel4 && quotations.length === 0) return '';

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

  if (isAtLevel4 && !quotations.some(hasAllDocs)) {
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

// --- Approval panel ---

function renderApprovalPanel(requisition, quotations) {
  const user = state.user;
  const level = requisition.current_approval_level;
  const isStep5 = level === 5;

  let html = `
    <div class="approval-panel" id="approval-panel">
      <h3 class="approval-panel__title">Acción de aprobación — ${stepLabel(level)} (${roleNameForStep(level, user.gender)})</h3>
  `;

  if (isStep5 && quotations.length > 1) {
    html += `
      <div class="quotation-selection" id="quotation-selection">
        <label class="form__label">Seleccione la cotización ganadora</label>
        <div class="quotation-selection__list">
    `;
    for (const quotation of quotations) {
      const isComplete = hasAllDocs(quotation);
      html += `
        <label class="quotation-selection__option${isComplete ? '' : ' quotation-selection__option--incomplete'}">
          <input type="radio" name="selected_quotation" value="${quotation.id}" class="quotation-selection__radio" ${isComplete ? '' : 'disabled'}>
          <div class="quotation-selection__info">
            <span class="quotation-selection__provider">${escapeHtml(quotation.provider_name)}</span>
            <span class="quotation-selection__file">📄 ${escapeHtml(quotation.original_filename)}</span>
            ${isComplete ? '<span class="quotation-selection__complete">✅ Documentación completa</span>' : '<span class="quotation-selection__warning">⚠️ Documentación incompleta</span>'}
          </div>
        </label>
      `;
    }
    html += '</div></div>';
  } else if (isStep5 && quotations.length === 1) {
    html += `
      <div class="alert alert--info" style="margin-bottom: 12px;">
        Se aprobará automáticamente la única cotización: <strong>${escapeHtml(quotations[0].provider_name)}</strong>
      </div>
    `;
  } else if (isStep5) {
    html += '<div class="alert alert--error">No hay cotizaciones disponibles para seleccionar. El paso anterior debe agregar cotizaciones.</div>';
  }

  html += `
      <div class="form__group">
        <label class="form__label" for="approval-comments">Comentarios</label>
        <textarea class="form__input" id="approval-comments" rows="3" placeholder="Comentarios opcionales para aprobación, obligatorios para rechazo..."></textarea>
      </div>
      <div id="approval-feedback"></div>
      <div class="approval-panel__actions">
        <button class="btn btn--secondary" id="btn-approve" data-action="approve" data-id="${requisition.id}">Aprobar</button>
        <button class="btn btn--danger" id="btn-reject" data-action="reject" data-id="${requisition.id}">Rechazar</button>
      </div>
    </div>
  `;
  return html;
}

// --- Timeline ---

function renderTimeline(requisition, steps, logs) {
  const user = state.user;
  let html = `
    <div class="timeline">
      <h3 class="timeline__title">Línea de aprobación</h3>
      <ul class="timeline__list">
  `;

  for (const step of steps) {
    const stepLog = logs.find((l) => l.approval_step_id === step.id);
    let itemClass = 'timeline__item--pending';
    if (step.status === 'approved') {
      itemClass = 'timeline__item--approved';
    } else if (step.status === 'rejected') {
      itemClass = 'timeline__item--rejected';
    } else if (step.step_level === requisition.current_approval_level && isOpen(requisition)) {
      itemClass = 'timeline__item--current';
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

    html += `
      <li class="timeline__item ${itemClass}">
        <div class="timeline__dot"></div>
        <div class="timeline__level">${stepLabel(step.step_level)}</div>
        <div class="timeline__step-role">${roleNameForStep(step.step_level, stepGender)}</div>
        <div class="timeline__status">${statusLabel(step.status)}${stepLog ? ` — ${escapeHtml(stepLog.user_name)}` : ''}</div>
        ${stepLog && stepLog.comments ? `<div class="timeline__comment">"${escapeHtml(stepLog.comments)}"</div>` : ''}
        ${stepLog ? `<div class="timeline__status">${formatDateShort(stepLog.created_at)}</div>` : ''}
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
      html += `
        <div class="activity-item">
          <div class="activity-item__text">
            <strong>${escapeHtml(log.user_name)}</strong> ${escapeHtml(actionLabel(log.action))}
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

// --- Render ---

export async function render(container, params, ctx) {
  const result = await API.getRequisition(params.id);
  if (ctx.isStale()) return;

  const requisition = result.data.requisition;
  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const user = state.user;
  const level = requisition.current_approval_level;
  const canAct = Boolean(user && user.role_level === stepRole(level) && isOpen(requisition));
  const filename = escapeHtml(requisition.original_filename);

  const projectHtml = requisition.project_name
    ? escapeHtml(requisition.project_name) + (requisition.project_code ? ` (${escapeHtml(requisition.project_code)})` : '')
    : '<span style="color:var(--color-text-light)">Sin proyecto</span>';

  let html = `
    <a href="${hrefFor('requisitions')}" class="back-link">&larr; Volver a requisiciones</a>

    <div class="req-detail">
      <div class="req-detail__left">
        <div class="req-detail__info">
          <h2 class="req-detail__title">${escapeHtml(requisition.title)}</h2>
          <ul class="req-detail__meta">
            <li>
              <span class="req-detail__meta-label">Estado</span>
              <span class="req-detail__meta-value">${statusBadge(requisition.status)}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Nivel actual</span>
              <span class="req-detail__meta-value">${stepLabel(level)} (${roleNameForStep(level)})</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Proyecto</span>
              <span class="req-detail__meta-value">${projectHtml}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Subido por</span>
              <span class="req-detail__meta-value">${escapeHtml(requisition.uploader_name)}</span>
            </li>
            <li>
              <span class="req-detail__meta-label">Archivo</span>
              <span class="req-detail__meta-value req-detail__file-link" role="button" tabindex="0" data-action="preview-requisition-file" data-id="${requisition.id}" data-filename="${filename}" title="Clic para vista previa">${filename}</span>
            </li>
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
          </div>
        </div>
  `;

  html += renderQuotationsPanel(requisition, quotations);
  if (canAct) html += renderApprovalPanel(requisition, quotations);

  html += '</div>'; // left column
  html += `<div class="req-detail__right">${renderTimeline(requisition, steps, logs)}</div>`;
  html += '</div>'; // req-detail grid

  container.innerHTML = html;

  // Auto-preview a file that was just uploaded
  const pending = takePendingPreview();
  if (pending) {
    setTimeout(() => {
      if (!ctx.isStale()) openDocumentModal(pending.fetchFn, pending.filename);
    }, 400);
  }
}

// --- Approval handlers ---

async function handleApprove(requisitionId) {
  const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
  const feedback = $('#approval-feedback');
  const approveBtn = $('#btn-approve');
  const rejectBtn = $('#btn-reject');

  let selectedQuotationId = null;
  if ($('#quotation-selection')) {
    const selectedRadio = document.querySelector('input[name="selected_quotation"]:checked');
    if (!selectedRadio) {
      setFeedback(feedback, 'error', 'Debe seleccionar una cotización antes de aprobar.');
      return;
    }
    selectedQuotationId = selectedRadio.value;
  }

  const restore = setButtonBusy(approveBtn, 'Aprobando...');
  if (rejectBtn) rejectBtn.disabled = true;

  try {
    const result = await API.approveRequisition(requisitionId, comments, selectedQuotationId);
    setFeedback(feedback, 'success', result.message || 'Requisición aprobada');
    updateBadges();
    setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1000);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al aprobar');
    restore();
    if (rejectBtn) rejectBtn.disabled = false;
  }
}

async function handleReject(requisitionId) {
  const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
  const feedback = $('#approval-feedback');
  const approveBtn = $('#btn-approve');
  const rejectBtn = $('#btn-reject');

  if (!comments) {
    setFeedback(feedback, 'error', 'Los comentarios son obligatorios para rechazar una requisición');
    return;
  }

  const restore = setButtonBusy(rejectBtn, 'Rechazando...');
  if (approveBtn) approveBtn.disabled = true;

  try {
    const result = await API.rejectRequisition(requisitionId, comments);
    setFeedback(feedback, 'success', result.message || 'Requisición rechazada');
    updateBadges();
    setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1000);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al rechazar');
    restore();
    if (approveBtn) approveBtn.disabled = false;
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
  const provider = $('#quotation-provider');
  const file = $('#quotation-file');
  if (provider) provider.value = '';
  if (file) file.value = '';
  setFeedback($('#quotation-form-feedback'), 'error', '');
}

async function submitQuotation(requisitionId) {
  const providerInput = $('#quotation-provider');
  const fileInput = $('#quotation-file');
  const feedback = $('#quotation-form-feedback');
  const btn = $('#btn-submit-quotation');

  const providerName = providerInput ? providerInput.value.trim() : '';
  if (!providerName) {
    setFeedback(feedback, 'error', 'El nombre del proveedor es obligatorio');
    return;
  }
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    setFeedback(feedback, 'error', 'Debe seleccionar un archivo de cotización');
    return;
  }

  const formData = new FormData();
  formData.append('provider_name', providerName);
  formData.append('file', fileInput.files[0]);

  const restore = setButtonBusy(btn, 'Subiendo...');
  setFeedback(feedback, 'error', '');

  try {
    const result = await API.createQuotation(requisitionId, formData);
    const created = result && result.data && result.data.quotation;
    if (created) {
      setPendingPreview({
        fetchFn: () => API.downloadQuotationFile(requisitionId, created.id),
        filename: created.original_filename || fileInput.files[0].name,
      });
    }
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
    const result = await API.uploadQuotationDocument(requisitionId, quotationId, formData);
    const created = result && result.data && result.data.document;
    if (created) {
      setPendingPreview({
        fetchFn: () => API.downloadQuotationDocument(requisitionId, quotationId, created.id),
        filename: created.original_filename || fileInput.files[0].name,
      });
    }
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
  approve: (t) => handleApprove(t.dataset.id),
  reject: (t) => handleReject(t.dataset.id),
  'preview-requisition-file': (t) => openDocumentModal(() => API.downloadRequisition(t.dataset.id), t.dataset.filename),
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
};
