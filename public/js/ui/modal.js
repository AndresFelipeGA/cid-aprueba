/* ============================================
   CID Aprueba — Modals
   - Generic helpers over the `.modal` markup in index.html
   - Native <dialog> confirmation replacing window.confirm()
   - Document preview modal (PDF / image / download fallback)
   ============================================ */

import { escapeHtml, getFileExtension } from '../utils/format.js';

/** Element that had focus when a modal was opened, restored on close. */
const openers = new WeakMap();

function rememberOpener(modal) {
  openers.set(modal, document.activeElement);
}

function restoreOpener(modal) {
  const opener = openers.get(modal);
  openers.delete(modal);
  if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
    opener.focus();
  }
}

// --- Generic .modal helpers ---

export function isModalOpen(id) {
  const modal = document.getElementById(id);
  return Boolean(modal && !modal.classList.contains('hidden'));
}

/**
 * Open a `.modal` by id, optionally focusing an element inside it.
 * @param {string} id
 * @param {string} [focusSelector]
 */
export function openModal(id, focusSelector) {
  const modal = document.getElementById(id);
  if (!modal) return;
  rememberOpener(modal);
  modal.classList.remove('hidden');
  const focusTarget = focusSelector ? modal.querySelector(focusSelector) : null;
  if (focusTarget) focusTarget.focus();
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  restoreOpener(modal);
}

// --- Confirmation dialog ---

/**
 * Ask the user to confirm an action using the native <dialog id="confirm-dialog">.
 * Escape / backdrop / "Cancelar" resolve false; "Aceptar" resolves true.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise((resolve) => {
    const messageEl = dialog.querySelector('#confirm-dialog-message');
    if (messageEl) messageEl.textContent = message;

    const opener = document.activeElement;
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.addEventListener('close', onClose);
    dialog.returnValue = '';
    dialog.showModal();

    const accept = dialog.querySelector('#confirm-dialog-accept');
    if (accept) accept.focus();
  });
}

// --- Document preview modal ---

function resetDownloadButton(btn) {
  if (!btn) return;
  btn.style.display = 'none';
  btn.href = '#';
  btn.removeAttribute('download');
}

function revokeModalBlob(modal) {
  if (modal.dataset.blobUrl) {
    URL.revokeObjectURL(modal.dataset.blobUrl);
    delete modal.dataset.blobUrl;
  }
}

/**
 * Open the preview modal and render the file returned by `fetchFn`.
 * @param {() => Promise<Response>} fetchFn
 * @param {string} filename
 */
export async function openDocumentModal(fetchFn, filename) {
  const modal = document.getElementById('document-modal');
  const body = document.getElementById('document-modal-body');
  const titleEl = document.getElementById('document-modal-title');
  const downloadBtn = document.getElementById('document-modal-download');
  if (!modal || !body) return;

  const ext = getFileExtension(filename);
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
  const isPdf = ext === 'pdf';

  if (titleEl) {
    titleEl.textContent = filename || 'Vista previa';
    titleEl.title = filename || '';
  }
  resetDownloadButton(downloadBtn);
  revokeModalBlob(modal);

  if (modal.style.display === 'none' || !modal.style.display) {
    rememberOpener(modal);
  }
  modal.style.display = 'flex';
  body.innerHTML = `
    <div class="document-modal__loading">
      <div class="loading__spinner"></div>
      <span>Cargando vista previa...</span>
    </div>`;

  try {
    const response = await fetchFn();
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    modal.dataset.blobUrl = blobUrl;

    if (isPdf) {
      body.innerHTML = `<iframe src="${blobUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=63" title="Vista previa PDF"></iframe>`;
    } else if (isImage) {
      body.innerHTML = `<img src="${blobUrl}" alt="${escapeHtml(filename)}">`;
    } else {
      body.innerHTML = `
        <div class="document-modal__error">
          <p>Vista previa no disponible para este tipo de archivo.</p>
          <p style="margin-top:8px;font-weight:500;">${escapeHtml(filename)}</p>
        </div>`;
    }

    if (downloadBtn) {
      downloadBtn.href = blobUrl;
      downloadBtn.download = filename || (isPdf ? 'archivo.pdf' : isImage ? 'imagen' : 'archivo');
      downloadBtn.style.display = '';
    }
  } catch (_err) {
    const what = isPdf ? 'la vista previa del archivo' : isImage ? 'la vista previa de la imagen' : 'el archivo';
    body.innerHTML = `<div class="document-modal__error"><p>Error al cargar ${what}.</p></div>`;
  }
}

export function closeDocumentModal() {
  const modal = document.getElementById('document-modal');
  if (!modal) return;
  const wasOpen = modal.style.display !== 'none';
  modal.style.display = 'none';
  const body = document.getElementById('document-modal-body');
  if (body) body.innerHTML = '';
  resetDownloadButton(document.getElementById('document-modal-download'));
  revokeModalBlob(modal);
  if (wasOpen) restoreOpener(modal);
}

export function isDocumentModalOpen() {
  const modal = document.getElementById('document-modal');
  return Boolean(modal && modal.style.display !== 'none');
}

// --- Wiring ---

/** Bind close buttons, backdrops and the Escape key for all static modals. */
export function initModals() {
  const docClose = document.getElementById('document-modal-close');
  if (docClose) docClose.addEventListener('click', closeDocumentModal);

  const docBackdrop = document.querySelector('#document-modal .document-modal__backdrop');
  if (docBackdrop) docBackdrop.addEventListener('click', closeDocumentModal);

  document.querySelectorAll('.modal .modal__backdrop').forEach((backdrop) => {
    const modal = backdrop.closest('.modal');
    if (modal && modal.id) {
      backdrop.addEventListener('click', () => closeModal(modal.id));
    }
  });

  const confirm = document.getElementById('confirm-dialog');
  if (confirm) {
    // Click on the backdrop (outside the form) cancels
    confirm.addEventListener('click', (e) => {
      if (e.target === confirm) confirm.close('');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isDocumentModalOpen()) {
      closeDocumentModal();
      return;
    }
    const open = document.querySelector('.modal:not(.hidden)');
    if (open && open.id) closeModal(open.id);
  });
}
