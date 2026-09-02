/* ============================================
   CID Aprueba — Main Application Logic
   ============================================ */

const App = (() => {
  'use strict';

  // --- State ---
  let currentUser = null;
  let currentView = 'dashboard';
  let currentParams = {};

  // --- DOM References ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- Helpers ---

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusLabel(status) {
    const labels = {
      pending: 'Pendiente',
      in_review: 'En revision',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      uploaded: 'Subido',
    };
    return labels[status] || status;
  }

  function statusBadge(status) {
    return `<span class="badge badge--${status}">${statusLabel(status)}</span>`;
  }

  function actionLabel(action) {
    const labels = {
      approved: 'Aprobo',
      rejected: 'Rechazo',
      uploaded: 'Subio',
    };
    return labels[action] || action;
  }

  function levelLabel(level) {
    return `Nivel ${level}`;
  }

  function showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="loading__spinner"></div>
        Cargando...
      </div>
    `;
  }

  function showError(container, message) {
    container.innerHTML = `
      <div class="alert alert--error">${escapeHtml(message)}</div>
    `;
  }

  function showEmpty(container, message) {
    container.innerHTML = `
      <div class="empty">${escapeHtml(message)}</div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Router ---

  function navigate(view, params = {}) {
    currentView = view;
    currentParams = params;

    // Update sidebar active state
    $$('.sidebar__link').forEach((link) => {
      link.classList.toggle('sidebar__link--active', link.dataset.view === view);
    });

    // Update header title
    const titles = {
      dashboard: 'Panel de Control',
      documents: 'Documentos',
      'document-detail': 'Detalle del Documento',
      upload: 'Subir Documento',
    };
    $('#header-title').textContent = titles[view] || '';

    // Close mobile sidebar
    closeMobileSidebar();

    // Render view
    const main = $('#main-content');
    switch (view) {
    case 'dashboard':
      renderDashboard(main);
      break;
    case 'documents':
      renderDocuments(main);
      break;
    case 'document-detail':
      renderDocumentDetail(main, params.id);
      break;
    case 'upload':
      renderUploadForm(main);
      break;
    default:
      renderDashboard(main);
    }
  }

  // --- Auth ---

  async function init() {
    const token = API.getToken();
    if (!token) {
      showLogin();
      return;
    }

    try {
      const result = await API.getMe();
      currentUser = result.data.user;
      showApp();
    } catch (_err) {
      API.removeToken();
      showLogin();
    }
  }

  function showLogin() {
    currentUser = null;
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
    $('#login-error').classList.add('hidden');
    $('#login-username').value = '';
    $('#login-password').value = '';
    $('#login-username').focus();
  }

  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');

    // Set user info in header
    if (currentUser) {
      $('#user-name').textContent = currentUser.full_name;
      $('#user-role').textContent = `Nivel ${currentUser.role_level}`;
    }

    navigate('dashboard');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const btn = $('#login-btn');
    const errorEl = $('#login-error');

    if (!username || !password) {
      errorEl.textContent = 'Ingrese usuario y contrasena';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Ingresando...';
    errorEl.classList.add('hidden');

    try {
      const result = await API.login(username, password);
      currentUser = result.data.user;
      showApp();
    } catch (err) {
      errorEl.textContent = err.message || 'Error al iniciar sesion';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  }

  function handleLogout() {
    API.removeToken();
    currentUser = null;
    showLogin();
  }

  // --- Dashboard View ---

  async function renderDashboard(container) {
    showLoading(container);

    try {
      const [statsResult, pendingResult] = await Promise.all([
        API.getDashboardStats(),
        API.getPending(),
      ]);

      const stats = statsResult.data.summary;
      const recentActivity = statsResult.data.recent_activity || [];
      const pendingDocs = pendingResult.data.items || [];

      let html = `
        <div class="stats">
          <div class="stat-card stat-card--total">
            <div class="stat-card__label">Total Documentos</div>
            <div class="stat-card__value">${stats.total}</div>
          </div>
          <div class="stat-card stat-card--pending">
            <div class="stat-card__label">Pendientes</div>
            <div class="stat-card__value">${(stats.pending || 0) + (stats.in_review || 0)}</div>
          </div>
          <div class="stat-card stat-card--approved">
            <div class="stat-card__label">Aprobados</div>
            <div class="stat-card__value">${stats.approved || 0}</div>
          </div>
          <div class="stat-card stat-card--rejected">
            <div class="stat-card__label">Rechazados</div>
            <div class="stat-card__value">${stats.rejected || 0}</div>
          </div>
        </div>
      `;

      // Pending for current user
      html += `<div class="section">`;
      html += `<h3 class="section__title">Pendientes para ti</h3>`;
      if (pendingDocs.length === 0) {
        html += `<div class="empty">No tienes documentos pendientes por revisar</div>`;
      } else {
        html += `<div class="pending-list">`;
        for (const doc of pendingDocs) {
          html += `
            <div class="pending-item" data-action="view-doc" data-id="${doc.id}">
              <div>
                <div class="pending-item__title">${escapeHtml(doc.title)}</div>
                <div class="pending-item__meta">Subido por ${escapeHtml(doc.uploader_name)} — ${formatDateShort(doc.created_at)}</div>
              </div>
              ${statusBadge(doc.status)}
            </div>
          `;
        }
        html += `</div>`;
      }
      html += `</div>`;

      // Recent activity
      html += `<div class="section">`;
      html += `<h3 class="section__title">Actividad Reciente</h3>`;
      if (recentActivity.length === 0) {
        html += `<div class="empty">No hay actividad reciente</div>`;
      } else {
        html += `<div class="activity-list">`;
        for (const log of recentActivity) {
          html += `
            <div class="activity-item">
              <div class="activity-item__text">
                <strong>${escapeHtml(log.user_name)}</strong>
                ${escapeHtml(actionLabel(log.action))}
                <a href="#" data-action="view-doc" data-id="${log.document_id}">${escapeHtml(log.document_title)}</a>
                ${log.comments ? `<br><em>"${escapeHtml(log.comments)}"</em>` : ''}
              </div>
              <div class="activity-item__time">${formatDateShort(log.created_at)}</div>
            </div>
          `;
        }
        html += `</div>`;
      }
      html += `</div>`;

      container.innerHTML = html;
    } catch (err) {
      showError(container, err.message || 'Error al cargar el panel de control');
    }
  }

  // --- Documents List View ---

  async function renderDocuments(container) {
    showLoading(container);

    try {
      const result = await API.getDocuments();
      const documents = result.data.items || [];

      let html = `
        <div class="main__header">
          <h2 class="main__title">Documentos</h2>
          <button class="btn btn--primary" data-action="navigate" data-view="upload">Subir Documento</button>
        </div>
      `;

      if (documents.length === 0) {
        html += `<div class="empty">No hay documentos registrados</div>`;
      } else {
        html += `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Estado</th>
                  <th>Nivel</th>
                  <th>Subido por</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
        `;

        for (const doc of documents) {
          html += `
            <tr class="table__row--clickable" data-action="view-doc" data-id="${doc.id}">
              <td>${escapeHtml(doc.title)}</td>
              <td>${statusBadge(doc.status)}</td>
              <td>${levelLabel(doc.current_approval_level)}</td>
              <td>${escapeHtml(doc.uploader_name)}</td>
              <td>${formatDateShort(doc.created_at)}</td>
            </tr>
          `;
        }

        html += `
              </tbody>
            </table>
          </div>
        `;
      }

      container.innerHTML = html;
    } catch (err) {
      showError(container, err.message || 'Error al cargar los documentos');
    }
  }

  // --- Document Detail View ---

  async function renderDocumentDetail(container, id) {
    if (!id) {
      navigate('documents');
      return;
    }

    showLoading(container);

    try {
      const result = await API.getDocument(id);
      const doc = result.data.document;
      const steps = doc.approval_steps || [];
      const logs = doc.approval_logs || [];

      const canAct = currentUser &&
        currentUser.role_level === doc.current_approval_level &&
        (doc.status === 'pending' || doc.status === 'in_review');

      let html = `
        <a href="#" class="back-link" data-action="navigate" data-view="documents">&larr; Volver a documentos</a>

        <div class="doc-detail">
          <div>
            <div class="doc-detail__info">
              <h2 class="doc-detail__title">${escapeHtml(doc.title)}</h2>
              <ul class="doc-detail__meta">
                <li>
                  <span class="doc-detail__meta-label">Estado</span>
                  <span class="doc-detail__meta-value">${statusBadge(doc.status)}</span>
                </li>
                <li>
                  <span class="doc-detail__meta-label">Nivel actual</span>
                  <span class="doc-detail__meta-value">${levelLabel(doc.current_approval_level)}</span>
                </li>
                <li>
                  <span class="doc-detail__meta-label">Subido por</span>
                  <span class="doc-detail__meta-value">${escapeHtml(doc.uploader_name)}</span>
                </li>
                <li>
                  <span class="doc-detail__meta-label">Archivo</span>
                  <span class="doc-detail__meta-value">${escapeHtml(doc.original_filename)}</span>
                </li>
                <li>
                  <span class="doc-detail__meta-label">Fecha de subida</span>
                  <span class="doc-detail__meta-value">${formatDate(doc.created_at)}</span>
                </li>
                <li>
                  <span class="doc-detail__meta-label">Ultima actualizacion</span>
                  <span class="doc-detail__meta-value">${formatDate(doc.updated_at)}</span>
                </li>
              </ul>
              ${doc.description ? `<div class="doc-detail__description">${escapeHtml(doc.description)}</div>` : ''}
              <div class="doc-detail__actions">
                <button class="btn btn--outline btn--sm" data-action="download" data-id="${doc.id}" data-filename="${escapeHtml(doc.original_filename)}">Descargar archivo</button>
              </div>
            </div>
      `;

      // Approval action panel
      if (canAct) {
        html += `
            <div class="approval-panel" id="approval-panel">
              <h3 class="approval-panel__title">Accion de aprobacion — ${levelLabel(doc.current_approval_level)}</h3>
              <div class="form__group">
                <label class="form__label" for="approval-comments">Comentarios</label>
                <textarea class="form__input" id="approval-comments" rows="3" placeholder="Comentarios opcionales para aprobacion, obligatorios para rechazo..."></textarea>
              </div>
              <div id="approval-feedback"></div>
              <div class="approval-panel__actions">
                <button class="btn btn--secondary" id="btn-approve" data-action="approve" data-id="${doc.id}">Aprobar</button>
                <button class="btn btn--danger" id="btn-reject" data-action="reject" data-id="${doc.id}">Rechazar</button>
              </div>
            </div>
        `;
      }

      html += `</div>`; // close left column

      // Timeline column
      html += `<div>`;
      html += `
        <div class="timeline">
          <h3 class="timeline__title">Linea de aprobacion</h3>
          <ul class="timeline__list">
      `;

      for (const step of steps) {
        // Find log for this step
        const stepLog = logs.find((l) => l.approval_step_id === step.id);
        let itemClass = 'timeline__item--pending';

        if (step.status === 'approved') {
          itemClass = 'timeline__item--approved';
        } else if (step.status === 'rejected') {
          itemClass = 'timeline__item--rejected';
        } else if (step.step_level === doc.current_approval_level &&
                   (doc.status === 'pending' || doc.status === 'in_review')) {
          itemClass = 'timeline__item--current';
        }

        html += `
          <li class="timeline__item ${itemClass}">
            <div class="timeline__dot"></div>
            <div class="timeline__level">${levelLabel(step.step_level)}</div>
            <div class="timeline__status">${statusLabel(step.status)}${stepLog ? ` — ${escapeHtml(stepLog.user_name)}` : ''}</div>
            ${stepLog && stepLog.comments ? `<div class="timeline__comment">"${escapeHtml(stepLog.comments)}"</div>` : ''}
            ${stepLog ? `<div class="timeline__status">${formatDateShort(stepLog.created_at)}</div>` : ''}
          </li>
        `;
      }

      html += `
          </ul>
        </div>
      `;

      // Approval logs history
      if (logs.length > 0) {
        html += `
          <div class="timeline" style="margin-top: 24px;">
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
        html += `</div></div>`;
      }

      html += `</div>`; // close right column
      html += `</div>`; // close doc-detail grid

      container.innerHTML = html;
    } catch (err) {
      showError(container, err.message || 'Error al cargar el documento');
    }
  }

  // --- Upload Form View ---

  function renderUploadForm(container) {
    let html = `
      <a href="#" class="back-link" data-action="navigate" data-view="documents">&larr; Volver a documentos</a>

      <div class="upload-form">
        <h2 class="main__title" style="margin-bottom: 24px;">Subir Documento</h2>
        <div id="upload-feedback"></div>
        <form id="upload-form">
          <div class="form__group">
            <label class="form__label" for="upload-title">Titulo</label>
            <input class="form__input" type="text" id="upload-title" required maxlength="255" placeholder="Titulo del documento">
          </div>
          <div class="form__group">
            <label class="form__label" for="upload-description">Descripcion</label>
            <textarea class="form__input" id="upload-description" rows="3" maxlength="1000" placeholder="Descripcion opcional del documento"></textarea>
          </div>
          <div class="form__group">
            <label class="form__label">Archivo</label>
            <div class="upload-form__file-area" id="file-drop-area">
              <div class="upload-form__file-text">Haz clic o arrastra un archivo aqui</div>
              <input type="file" id="upload-file" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png">
              <div class="upload-form__file-name" id="file-name"></div>
            </div>
          </div>
          <button class="btn btn--primary btn--block" type="submit" id="upload-btn">Subir Documento</button>
        </form>
      </div>
    `;

    container.innerHTML = html;

    // File drop area behavior
    const dropArea = $('#file-drop-area');
    const fileInput = $('#upload-file');
    const fileNameEl = $('#file-name');

    dropArea.addEventListener('click', () => fileInput.click());

    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('upload-form__file-area--active');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('upload-form__file-area--active');
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('upload-form__file-area--active');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileNameEl.textContent = e.dataTransfer.files[0].name;
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileNameEl.textContent = fileInput.files[0].name;
      }
    });

    // Form submit
    $('#upload-form').addEventListener('submit', handleUpload);
  }

  async function handleUpload(e) {
    e.preventDefault();

    const title = $('#upload-title').value.trim();
    const description = $('#upload-description').value.trim();
    const fileInput = $('#upload-file');
    const btn = $('#upload-btn');
    const feedback = $('#upload-feedback');

    if (!title) {
      feedback.innerHTML = '<div class="alert alert--error">El titulo es obligatorio</div>';
      return;
    }

    if (!fileInput.files || fileInput.files.length === 0) {
      feedback.innerHTML = '<div class="alert alert--error">Debe seleccionar un archivo</div>';
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('file', fileInput.files[0]);

    btn.disabled = true;
    btn.textContent = 'Subiendo...';
    feedback.innerHTML = '';

    try {
      const result = await API.uploadDocument(formData);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Documento subido exitosamente')}</div>`;
      // Navigate to the new document after a brief delay
      const docId = result.data.document.id;
      setTimeout(() => navigate('document-detail', { id: docId }), 1500);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al subir el documento')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Subir Documento';
    }
  }

  // --- Approval Actions ---

  async function handleApprove(docId) {
    const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
    const btn = $('#btn-approve');
    const feedback = $('#approval-feedback');

    btn.disabled = true;
    btn.textContent = 'Aprobando...';
    if ($('#btn-reject')) $('#btn-reject').disabled = true;

    try {
      const result = await API.approveDocument(docId, comments);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Documento aprobado')}</div>`;
      setTimeout(() => navigate('document-detail', { id: docId }), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al aprobar')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Aprobar';
      if ($('#btn-reject')) $('#btn-reject').disabled = false;
    }
  }

  async function handleReject(docId) {
    const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
    const feedback = $('#approval-feedback');

    if (!comments) {
      feedback.innerHTML = '<div class="alert alert--error">Los comentarios son obligatorios para rechazar un documento</div>';
      return;
    }

    const btn = $('#btn-reject');
    btn.disabled = true;
    btn.textContent = 'Rechazando...';
    if ($('#btn-approve')) $('#btn-approve').disabled = true;

    try {
      const result = await API.rejectDocument(docId, comments);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Documento rechazado')}</div>`;
      setTimeout(() => navigate('document-detail', { id: docId }), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al rechazar')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Rechazar';
      if ($('#btn-approve')) $('#btn-approve').disabled = false;
    }
  }

  // --- Download Handler ---

  async function handleDownload(docId, filename) {
    try {
      const response = await API.downloadDocument(docId);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      // Silently fail or show a brief message
    }
  }

  // --- Mobile Sidebar ---

  function toggleMobileSidebar() {
    const sidebar = $('.sidebar');
    const overlay = $('.overlay');
    sidebar.classList.toggle('sidebar--open');
    overlay.classList.toggle('overlay--visible');
  }

  function closeMobileSidebar() {
    const sidebar = $('.sidebar');
    const overlay = $('.overlay');
    if (sidebar) sidebar.classList.remove('sidebar--open');
    if (overlay) overlay.classList.remove('overlay--visible');
  }

  // --- Event Delegation ---

  function setupEventListeners() {
    // Login form
    $('#login-form').addEventListener('submit', handleLogin);

    // Logout
    $('#btn-logout').addEventListener('click', handleLogout);

    // Mobile toggle
    $('#mobile-toggle').addEventListener('click', toggleMobileSidebar);

    // Overlay click closes sidebar
    $('.overlay').addEventListener('click', closeMobileSidebar);

    // Sidebar navigation
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;

      if (action === 'navigate') {
        e.preventDefault();
        const view = target.dataset.view;
        navigate(view);
      }

      if (action === 'view-doc') {
        e.preventDefault();
        const id = target.dataset.id;
        navigate('document-detail', { id });
      }

      if (action === 'approve') {
        e.preventDefault();
        const id = target.dataset.id;
        handleApprove(id);
      }

      if (action === 'reject') {
        e.preventDefault();
        const id = target.dataset.id;
        handleReject(id);
      }

      if (action === 'download') {
        e.preventDefault();
        const id = target.dataset.id;
        const filename = target.dataset.filename;
        handleDownload(id, filename);
      }
    });
  }

  // --- Bootstrap ---

  function boot() {
    setupEventListeners();
    init();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    navigate,
    init,
  };
})();
