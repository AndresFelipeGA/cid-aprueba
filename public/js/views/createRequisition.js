/* ============================================
   CID Aprueba — Create requisition view (+ create project modal)
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatBytes, getFileExtension } from '../utils/format.js';
import { acceptAttr } from '../meta.js';
import { navigate, hrefFor } from '../router.js';
import { showToast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modal.js';
import { setFeedback, setButtonBusy } from '../ui/feedback.js';

export const title = 'Crear Requisición';

const $ = (sel) => document.querySelector(sel);

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
const OFFICE_ICONS = {
  doc: { color: '#2B579A', label: 'WORD' },
  docx: { color: '#2B579A', label: 'WORD' },
  xls: { color: '#217346', label: 'EXCEL' },
  xlsx: { color: '#217346', label: 'EXCEL' },
  ppt: { color: '#D24726', label: 'PPT' },
  pptx: { color: '#D24726', label: 'PPT' },
};

const FILE_ICON_SVG = (color, size, withLines) => `
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    ${withLines ? '<line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>' : ''}
  </svg>`;

// --- File preview ---

function previewInfo(file) {
  return `
    <div class="upload-preview__info">
      <div class="upload-preview__filename">${escapeHtml(file.name)}</div>
      <div class="upload-preview__filesize">${formatBytes(file.size)}</div>
    </div>`;
}

function showFilePreview(file) {
  const previewBody = $('#preview-body');
  if (!previewBody) return;

  const ext = getFileExtension(file.name);
  const url = URL.createObjectURL(file);

  if (IMAGE_EXTS.includes(ext)) {
    previewBody.innerHTML = `
      <div class="upload-preview__image-wrap">
        <img src="${url}" alt="${escapeHtml(file.name)}" class="upload-preview__image">
      </div>
      ${previewInfo(file)}
    `;
  } else if (ext === 'pdf') {
    previewBody.innerHTML = `
      <div class="upload-preview__pdf-wrap">
        <iframe src="${url}#toolbar=0&navpanes=0&scrollbar=1&zoom=63" class="upload-preview__pdf" title="Vista previa PDF"></iframe>
      </div>
      ${previewInfo(file)}
    `;
  } else {
    URL.revokeObjectURL(url);
    const icon = OFFICE_ICONS[ext] || { color: 'var(--color-text-light)', label: ext.toUpperCase() };
    previewBody.innerHTML = `
      <div class="upload-preview__file-icon">
        ${FILE_ICON_SVG(icon.color, 64, true)}
        <span class="upload-preview__file-ext" style="color: ${icon.color}">${escapeHtml(icon.label)}</span>
      </div>
      ${previewInfo(file)}
    `;
  }
}

// --- Render ---

export async function render(container, _params, ctx) {
  if (!state.user || state.user.role_level !== 1) {
    container.innerHTML =
      '<div class="alert alert--error">No tiene permisos para crear requisiciones. Solo los Coordinadores/as de Territorio pueden crear requisiciones.</div>';
    setTimeout(() => {
      if (!ctx.isStale()) navigate('dashboard');
    }, 2000);
    return;
  }

  let projects = [];
  try {
    const projectsResult = await API.getProjects();
    projects = projectsResult.data.projects || [];
  } catch (_err) {
    // Continue without projects if they fail to load
  }
  if (ctx.isStale()) return;

  let projectOptions = '<option value="" selected>Seleccione un proyecto...</option>';
  for (const project of projects) {
    const codeLabel = project.code ? ` (${escapeHtml(project.code)})` : '';
    projectOptions += `<option value="${project.id}">${escapeHtml(project.name)}${codeLabel}</option>`;
  }
  projectOptions += '<option value="new" class="project-select__new-option">+ Crear nuevo proyecto</option>';

  container.innerHTML = `
    <a href="${hrefFor('requisitions')}" class="back-link">&larr; Volver a requisiciones</a>

    <div class="upload-layout">
      <div class="upload-form">
        <h2 class="main__title" style="margin-bottom: 24px;">Crear Requisición</h2>
        <div id="upload-feedback"></div>
        <form id="upload-form">
          <div class="form__group">
            <label class="form__label" for="upload-title">Título</label>
            <input class="form__input" type="text" id="upload-title" required maxlength="255" placeholder="Título de la requisición">
          </div>
          <div class="form__group">
            <label class="form__label" for="upload-description">Descripción</label>
            <textarea class="form__input" id="upload-description" rows="3" maxlength="1000" placeholder="Descripción opcional de la requisición"></textarea>
          </div>
          <div class="form__group">
            <label class="form__label" for="upload-project">Proyecto</label>
            <select class="form__input project-select" id="upload-project">
              ${projectOptions}
            </select>
          </div>
          <div class="form__group">
            <label class="form__label" for="upload-file">Archivo</label>
            <div class="upload-form__file-area" id="file-drop-area" role="button" tabindex="0" aria-label="Seleccionar archivo">
              <div class="upload-form__file-text">Haz clic o arrastra un archivo aquí</div>
              <input type="file" id="upload-file" style="display:none" accept="${acceptAttr()}">
              <div class="upload-form__file-name" id="file-name"></div>
            </div>
          </div>
          <button class="btn btn--primary btn--block" type="submit" id="upload-btn">Crear Requisición</button>
        </form>
      </div>

      <div class="upload-preview" id="upload-preview">
        <div class="upload-preview__header">Vista previa</div>
        <div class="upload-preview__body" id="preview-body">
          <div class="upload-preview__empty">
            ${FILE_ICON_SVG('currentColor', 48, false)}
            <p>Selecciona un archivo para ver la vista previa</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // "+ Crear nuevo proyecto" opens the project modal
  const projectSelect = $('#upload-project');
  projectSelect.addEventListener('change', () => {
    if (projectSelect.value === 'new') {
      projectSelect.value = '';
      showCreateProjectModal();
    }
  });

  // File drop area
  const dropArea = $('#file-drop-area');
  const fileInput = $('#upload-file');
  const fileNameEl = $('#file-name');

  const pickFile = (file) => {
    fileNameEl.textContent = file.name;
    showFilePreview(file);
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

  $('#upload-form').addEventListener('submit', handleCreateRequisition);
}

async function handleCreateRequisition(e) {
  e.preventDefault();

  const title_ = $('#upload-title').value.trim();
  const description = $('#upload-description').value.trim();
  const projectSelect = $('#upload-project');
  const projectId = projectSelect ? projectSelect.value : '';
  const fileInput = $('#upload-file');
  const feedback = $('#upload-feedback');

  if (!title_) {
    setFeedback(feedback, 'error', 'El título es obligatorio');
    return;
  }
  if (!fileInput.files || fileInput.files.length === 0) {
    setFeedback(feedback, 'error', 'Debe seleccionar un archivo');
    return;
  }

  const formData = new FormData();
  formData.append('title', title_);
  formData.append('description', description);
  if (projectId && projectId !== 'new') formData.append('project_id', projectId);
  formData.append('file', fileInput.files[0]);

  const restore = setButtonBusy($('#upload-btn'), 'Creando...');
  setFeedback(feedback, 'error', '');

  try {
    const result = await API.createRequisition(formData);
    const created = result.data.requisition;
    const message = result.message || `Requisición ${created.number || ''} radicada exitosamente`.replace('  ', ' ');
    setFeedback(feedback, 'success', message);
    showToast(message, 'success');
    const requisitionId = created.id;
    setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1500);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al crear la requisición');
    restore();
  }
}

// --- Create project modal ---

function resetProjectForm() {
  const form = $('#project-modal-form');
  if (form) form.reset();
  setFeedback($('#project-modal-feedback'), 'error', '');
  const endDateUnknown = $('#project-end-date-unknown');
  const endDateInput = $('#project-modal-end-date');
  if (endDateUnknown) endDateUnknown.checked = true;
  if (endDateInput) {
    endDateInput.disabled = true;
    endDateInput.value = '';
  }
}

function showCreateProjectModal() {
  resetProjectForm();
  openModal('project-modal', '#project-modal-name');
}

function hideCreateProjectModal() {
  closeModal('project-modal');
  resetProjectForm();
}

async function handleCreateProject(e) {
  e.preventDefault();

  const name = $('#project-modal-name').value.trim();
  const code = $('#project-modal-code').value.trim();
  const location_ = $('#project-modal-location').value.trim();
  const description = $('#project-modal-description').value.trim();
  const startDate = $('#project-modal-start-date').value;
  const endDateUnknown = $('#project-end-date-unknown');
  const endDate = endDateUnknown && endDateUnknown.checked ? '' : $('#project-modal-end-date').value;
  const feedback = $('#project-modal-feedback');

  if (!name) {
    setFeedback(feedback, 'error', 'El nombre del proyecto es obligatorio');
    return;
  }

  const restore = setButtonBusy($('#project-modal-save'), 'Creando...');
  setFeedback(feedback, 'error', '');

  try {
    const result = await API.createProject({
      name,
      code: code || undefined,
      location: location_ || undefined,
      description: description || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    });

    const newProject = result.data.project;
    const projectSelect = $('#upload-project');
    if (projectSelect && newProject) {
      const option = document.createElement('option');
      option.value = newProject.id;
      option.textContent = `${newProject.name}${newProject.code ? ` (${newProject.code})` : ''}`;
      const newOption = projectSelect.querySelector('option[value="new"]');
      if (newOption) {
        projectSelect.insertBefore(option, newOption);
      } else {
        projectSelect.appendChild(option);
      }
      projectSelect.value = newProject.id;
    }

    hideCreateProjectModal();
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al crear el proyecto');
  } finally {
    restore();
  }
}

/** Bind the static project modal (called once at boot). */
export function init() {
  const projectForm = $('#project-modal-form');
  if (projectForm) projectForm.addEventListener('submit', handleCreateProject);

  const projectCancel = $('#project-modal-cancel');
  if (projectCancel) projectCancel.addEventListener('click', hideCreateProjectModal);

  const endDateUnknown = $('#project-end-date-unknown');
  if (endDateUnknown) {
    endDateUnknown.addEventListener('change', () => {
      const endDateInput = $('#project-modal-end-date');
      if (!endDateInput) return;
      if (endDateUnknown.checked) {
        endDateInput.disabled = true;
        endDateInput.value = '';
      } else {
        endDateInput.disabled = false;
        endDateInput.focus();
      }
    });
  }
}
