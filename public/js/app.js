/* ============================================
   CID Aprueba — Main Application Logic
   ============================================ */

const App = (() => {
  'use strict';

  // --- State ---
  let currentUser = null;
  let currentView = 'dashboard';
  let currentParams = {};
  let _lastUploadedFileInfo = null; // For auto-preview after upload

  // --- DOM References ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- Role Level Mapping (gendered) ---
  const ROLE_NAMES_GENDERED = {
    1: { M: 'Coordinador de Territorio', F: 'Coordinadora de Territorio', default: 'Coordinador/a de Territorio' },
    2: { M: 'Director Programático', F: 'Directora Programática', default: 'Director/a Programática' },
    3: { default: 'Representante Legal' },
    4: { M: 'Encargado de Compras', F: 'Encargada de Compras', default: 'Encargado/a de Compras' },
    5: { default: 'Área Financiera' },
    6: { default: 'Área de Compras' },
  };

  // --- Step-to-Role Mapping (mirrors backend STEP_TO_ROLE_MAP) ---
  const STEP_TO_ROLE = {
    1: 1, // Coordinador/a de Territorio
    2: 2, // Director/a Programática
    3: 3, // Representante Legal
    4: 4, // Encargado/a de Compras
    5: 3, // Representante Legal (selección de cotización)
    6: 5, // Área Financiera
    7: 6, // Área de Compras
  };

  // --- Step Labels for timeline/progress display ---
  const STEP_LABELS = {
    1: 'Aprobación Territorial',
    2: 'Aprobación Programática',
    3: 'Aprobación Legal',
    4: 'Gestión de Cotizaciones',
    5: 'Selección de Cotización',
    6: 'Aprobación Financiera',
    7: 'Aprobación Final',
  };

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
      in_review: 'En revisión',
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
      approved: 'Aprobó',
      rejected: 'Rechazó',
      uploaded: 'Subió',
    };
    return labels[action] || action;
  }

  function roleName(level, gender) {
    const entry = ROLE_NAMES_GENDERED[level];
    if (!entry) return `Nivel ${level}`;
    if (gender && entry[gender]) return entry[gender];
    return entry.default;
  }

  function levelLabel(level, gender) {
    return roleName(level, gender);
  }

  function stepLabel(stepLevel) {
    return STEP_LABELS[stepLevel] || `Paso ${stepLevel}`;
  }

  function roleNameForStep(stepLevel, gender) {
    const roleLevel = STEP_TO_ROLE[stepLevel];
    return roleName(roleLevel, gender);
  }

  function roleDisplay(user) {
    let display = roleName(user.role_level, user.gender);
    if (user.territory) {
      display += ` - ${user.territory}`;
    }
    return display;
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

  function getFileExtension(filename) {
    if (!filename) return '';
    return filename.split('.').pop().toLowerCase();
  }

  // --- Sidebar Visibility ---

  function updateSidebarVisibility() {
    const createLink = $('#nav-create-requisition');
    if (createLink) {
      if (currentUser && currentUser.role_level === 1) {
        createLink.classList.remove('hidden');
      } else {
        createLink.classList.add('hidden');
      }
    }

    const usersLink = $('#nav-users');
    if (usersLink) {
      if (currentUser && currentUser.role_level === 3) {
        usersLink.classList.remove('hidden');
      } else {
        usersLink.classList.add('hidden');
      }
    }
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
      requisitions: 'Requisiciones',
      'requisition-detail': 'Detalle de la Requisición',
      'create-requisition': 'Crear Requisición',
      profile: 'Mi Perfil',
      users: 'Gestión de Usuarios',
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
    case 'requisitions':
      renderRequisitions(main);
      break;
    case 'requisition-detail':
      renderRequisitionDetail(main, params.id);
      break;
    case 'create-requisition':
      renderCreateRequisitionForm(main);
      break;
    case 'profile':
      renderProfile(main);
      break;
    case 'users':
      renderUsers(main);
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
      $('#user-role').textContent = roleDisplay(currentUser);
    }

    // Show/hide sidebar links based on role
    updateSidebarVisibility();

    navigate('dashboard');

    // Check if user has no email and show modal
    checkEmailRegistration();
  }

  function checkEmailRegistration() {
    if (!currentUser) return;
    // If user has no email or email is empty/placeholder
    const email = currentUser.email || '';
    if (!email || email.endsWith('@cid.org.co')) {
      showEmailModal();
    }
  }

  function showEmailModal() {
    const modal = $('#email-modal');
    if (modal) {
      modal.classList.remove('hidden');
      const input = $('#email-modal-input');
      if (input) input.focus();
    }
  }

  function hideEmailModal() {
    const modal = $('#email-modal');
    if (modal) {
      modal.classList.add('hidden');
      const feedback = $('#email-modal-feedback');
      if (feedback) feedback.innerHTML = '';
      const input = $('#email-modal-input');
      if (input) input.value = '';
    }
  }

  async function handleEmailModalSave(e) {
    e.preventDefault();
    const email = $('#email-modal-input').value.trim();
    const feedback = $('#email-modal-feedback');
    const btn = $('#email-modal-save');

    if (!email) {
      feedback.innerHTML = '<div class="alert alert--error">Ingrese un correo electrónico válido</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const result = await API.updateProfile({ email });
      currentUser = result.data.user;
      // Update header user info
      if (currentUser) {
        $('#user-name').textContent = currentUser.full_name;
      }
      hideEmailModal();
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al guardar el correo')}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const btn = $('#login-btn');
    const errorEl = $('#login-error');

    if (!username || !password) {
      errorEl.textContent = 'Ingrese usuario y contraseña';
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
      errorEl.textContent = err.message || 'Error al iniciar sesión';
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
      const pendingRequisitions = pendingResult.data.items || [];

      let html = `
        <div class="stats">
          <div class="stat-card stat-card--total">
            <div class="stat-card__label">Total Requisiciones</div>
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
      if (pendingRequisitions.length === 0) {
        html += `<div class="empty">No tienes requisiciones pendientes por revisar</div>`;
      } else {
        html += `<div class="pending-list">`;
        for (const requisition of pendingRequisitions) {
          html += `
            <div class="pending-item" data-action="view-requisition" data-id="${requisition.id}">
              <div>
                <div class="pending-item__title">${escapeHtml(requisition.title)}</div>
                <div class="pending-item__meta">Subido por ${escapeHtml(requisition.uploader_name)} — ${formatDateShort(requisition.created_at)}</div>
              </div>
              ${statusBadge(requisition.status)}
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
                <a href="#" data-action="view-requisition" data-id="${log.requisition_id}">${escapeHtml(log.requisition_title)}</a>
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

  // --- Requisitions List View ---

  async function renderRequisitions(container) {
    showLoading(container);

    try {
      const result = await API.getRequisitions();
      const requisitions = result.data.items || [];

      let html = `
        <div class="main__header">
          <h2 class="main__title">Requisiciones</h2>
      `;

      // Only show create button for role_level 1
      if (currentUser && currentUser.role_level === 1) {
        html += `<button class="btn btn--primary" data-action="navigate" data-view="create-requisition">Crear Requisición</button>`;
      }

      html += `</div>`;

      if (requisitions.length === 0) {
        html += `<div class="empty">No hay requisiciones registradas</div>`;
      } else {
        html += `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Nivel</th>
                  <th>Subido por</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
        `;

        for (const requisition of requisitions) {
          html += `
            <tr class="table__row--clickable" data-action="view-requisition" data-id="${requisition.id}">
              <td>${escapeHtml(requisition.title)}</td>
              <td>${statusBadge(requisition.status)}</td>
              <td>${stepLabel(requisition.current_approval_level)}</td>
              <td>${escapeHtml(requisition.uploader_name)}</td>
              <td>${formatDateShort(requisition.created_at)}</td>
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
      showError(container, err.message || 'Error al cargar las requisiciones');
    }
  }

  // --- Quotation Panel Constants ---

  const DOC_TYPES = [
    { key: 'rut', label: 'RUT' },
    { key: 'camara_comercio', label: 'Cámara de Comercio' },
    { key: 'cedula', label: 'Cédula' },
    { key: 'certificado_bancario', label: 'Certificado Bancario' },
  ];

  // --- Quotation Panel Renderer ---

  function renderQuotationsPanel(requisition, quotations, currentUser) {
    const isAtLevel4 = requisition.current_approval_level === 4 &&
      (requisition.status === 'pending' || requisition.status === 'in_review');
    const isPastLevel4 = requisition.current_approval_level > 4 ||
      requisition.status === 'approved' || requisition.status === 'rejected';
    const canEdit = currentUser && currentUser.role_level === 4 && isAtLevel4;

    // If not at level 4 and no quotations, don't show the panel
    if (!isAtLevel4 && (!quotations || quotations.length === 0)) {
      return '';
    }

    let html = `
      <div class="quotations-panel" id="quotations-panel">
        <div class="quotations-panel__header">
          <h3 class="quotations-panel__title">Cotizaciones de Proveedores</h3>
    `;

    // Add quotation button (only for role 4 when at level 4, max 3)
    if (canEdit && quotations.length < 3) {
      html += `
          <button class="btn btn--primary btn--sm quotations-panel__add-btn" id="btn-add-quotation" data-action="toggle-quotation-form" data-req-id="${requisition.id}">+ Agregar Cotización</button>
      `;
    }

    html += `</div>`;

    // Add quotation form (hidden by default)
    if (canEdit && quotations.length < 3) {
      html += `
        <div class="quotation-form hidden" id="quotation-form">
          <div class="quotation-form__field">
            <label class="form__label" for="quotation-provider">Nombre del proveedor</label>
            <input class="form__input" type="text" id="quotation-provider" required placeholder="Ej: Proveedor ABC" maxlength="255">
          </div>
          <div class="quotation-form__field">
            <label class="form__label" for="quotation-file">Archivo de cotización</label>
            <input class="form__input form__input--file" type="file" id="quotation-file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png">
          </div>
          <div id="quotation-form-feedback"></div>
          <div class="quotation-form__actions">
            <button class="btn btn--primary btn--sm" id="btn-submit-quotation" data-action="submit-quotation" data-req-id="${requisition.id}">Subir Cotización</button>
            <button class="btn btn--outline btn--sm" data-action="cancel-quotation-form">Cancelar</button>
          </div>
        </div>
      `;
    }

    // Render each quotation card
    if (quotations.length === 0) {
      html += `<div class="empty" style="padding: 24px;">No hay cotizaciones adjuntas aún.</div>`;
    } else {
      for (const quotation of quotations) {
        html += renderQuotationCard(requisition, quotation, canEdit, isPastLevel4);
      }
    }

    // Warning message: show if no quotation is complete (has all 4 docs)
    if (isAtLevel4) {
      const hasComplete = quotations.some((q) => {
        const docs = q.documents || [];
        return DOC_TYPES.every((dt) => docs.some((d) => d.doc_type === dt.key));
      });

      if (!hasComplete) {
        html += `
          <div class="quotation-warning">
            <span>⚠️</span>
            <span>Debe completar al menos una cotización con todos los documentos para poder aprobar.</span>
          </div>
        `;
      }
    }

    html += `</div>`; // close quotations-panel
    return html;
  }

  function renderQuotationCard(requisition, quotation, canEdit, isPastLevel4) {
    const docs = quotation.documents || [];

    let html = `
      <div class="quotation-card">
        <div class="quotation-card__header">
          <span class="quotation-card__provider">Cotización: ${escapeHtml(quotation.provider_name)}</span>
        </div>
        <div class="quotation-card__file">
          <span class="quotation-card__filename" data-action="preview-quotation-file" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-filename="${escapeHtml(quotation.original_filename)}" title="Clic para vista previa">📄 ${escapeHtml(quotation.original_filename)}</span>
          <div class="quotation-card__actions">
            <button class="btn btn--outline btn--sm" data-action="download-quotation" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-filename="${escapeHtml(quotation.original_filename)}">Ver</button>
            ${canEdit ? `<button class="btn btn--danger btn--sm" data-action="delete-quotation" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}">Eliminar</button>` : ''}
          </div>
        </div>
        <div class="quotation-card__documents">
          <div class="quotation-card__documents-title">Documentos del proveedor:</div>
    `;

    for (const docType of DOC_TYPES) {
      const doc = docs.find((d) => d.doc_type === docType.key);
      if (doc) {
        html += `
          <div class="quotation-card__doc-item">
            <span class="quotation-card__doc-status quotation-card__doc-status--complete quotation-card__doc-filename" data-action="preview-quotation-doc" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-doc-id="${doc.id}" data-filename="${escapeHtml(doc.original_filename)}" title="Clic para vista previa">✅ ${docType.label}: ${escapeHtml(doc.original_filename)}</span>
            <div class="quotation-card__actions">
              <button class="btn btn--outline btn--sm" data-action="download-quotation-doc" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-doc-id="${doc.id}" data-filename="${escapeHtml(doc.original_filename)}">Ver</button>
              ${canEdit ? `<button class="btn btn--danger btn--sm" data-action="delete-quotation-doc" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-doc-id="${doc.id}">Eliminar</button>` : ''}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="quotation-card__doc-item">
            <span class="quotation-card__doc-status quotation-card__doc-status--missing">❌ ${docType.label}: (sin adjuntar)</span>
            <div class="quotation-card__actions">
        `;
        if (canEdit) {
          html += `
              <label class="btn btn--outline btn--sm quotation-card__attach-btn">
                Adjuntar
                <input type="file" class="hidden" data-action="attach-quotation-doc" data-req-id="${requisition.id}" data-quotation-id="${quotation.id}" data-doc-type="${docType.key}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
              </label>
          `;
        }
        html += `
            </div>
          </div>
        `;
      }
    }

    html += `
        </div>
      </div>
    `;
    return html;
  }

  // --- Document Preview Modal ---

  let _currentModalBlobUrl = null;

  async function openDocumentModal(fetchFn, filename) {
    const modal = document.querySelector('#document-modal');
    const body = document.querySelector('#document-modal-body');
    const titleEl = document.querySelector('#document-modal-title');
    const downloadBtn = document.querySelector('#document-modal-download');
    if (!modal || !body) return;

    const ext = getFileExtension(filename);
    const imageExts = ['jpg', 'jpeg', 'png'];
    const pdfExts = ['pdf'];

    // Set title
    if (titleEl) {
      titleEl.textContent = filename || 'Vista previa';
      titleEl.title = filename || '';
    }

    // Reset download button
    if (downloadBtn) {
      downloadBtn.style.display = 'none';
      downloadBtn.href = '#';
      downloadBtn.removeAttribute('download');
    }

    // Show modal with loading state
    modal.style.display = 'flex';
    body.innerHTML = `
      <div class="document-modal__loading">
        <div class="loading__spinner"></div>
        <span>Cargando vista previa...</span>
      </div>`;

    // Revoke previous blob URL if any
    if (_currentModalBlobUrl) {
      URL.revokeObjectURL(_currentModalBlobUrl);
      _currentModalBlobUrl = null;
    }

    if (pdfExts.includes(ext)) {
      try {
        const response = await fetchFn();
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        _currentModalBlobUrl = blobUrl;
        body.innerHTML = `<iframe src="${blobUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=63" title="Vista previa PDF"></iframe>`;
        if (downloadBtn) {
          downloadBtn.href = blobUrl;
          downloadBtn.download = filename || 'archivo.pdf';
          downloadBtn.style.display = '';
        }
      } catch (_err) {
        body.innerHTML = '<div class="document-modal__error"><p>Error al cargar la vista previa del archivo.</p></div>';
      }
    } else if (imageExts.includes(ext)) {
      try {
        const response = await fetchFn();
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        _currentModalBlobUrl = blobUrl;
        body.innerHTML = `<img src="${blobUrl}" alt="${escapeHtml(filename)}">`;
        if (downloadBtn) {
          downloadBtn.href = blobUrl;
          downloadBtn.download = filename || 'imagen';
          downloadBtn.style.display = '';
        }
      } catch (_err) {
        body.innerHTML = '<div class="document-modal__error"><p>Error al cargar la vista previa de la imagen.</p></div>';
      }
    } else {
      // Non-previewable file: try to download directly
      try {
        const response = await fetchFn();
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        _currentModalBlobUrl = blobUrl;
        body.innerHTML = `<div class="document-modal__error"><p>Vista previa no disponible para este tipo de archivo.</p><p style="margin-top:8px;font-weight:500;">${escapeHtml(filename)}</p></div>`;
        if (downloadBtn) {
          downloadBtn.href = blobUrl;
          downloadBtn.download = filename || 'archivo';
          downloadBtn.style.display = '';
        }
      } catch (_err) {
        body.innerHTML = '<div class="document-modal__error"><p>Error al cargar el archivo.</p></div>';
      }
    }
  }

  function closeDocumentModal() {
    const modal = document.querySelector('#document-modal');
    if (modal) {
      modal.style.display = 'none';
      const body = document.querySelector('#document-modal-body');
      if (body) body.innerHTML = '';
      const downloadBtn = document.querySelector('#document-modal-download');
      if (downloadBtn) {
        downloadBtn.style.display = 'none';
        downloadBtn.href = '#';
        downloadBtn.removeAttribute('download');
      }
    }
    if (_currentModalBlobUrl) {
      URL.revokeObjectURL(_currentModalBlobUrl);
      _currentModalBlobUrl = null;
    }
  }

  // --- Requisition Detail View ---

  async function renderRequisitionDetail(container, id) {
    if (!id) {
      navigate('requisitions');
      return;
    }

    showLoading(container);

    try {
      const result = await API.getRequisition(id);
      const requisition = result.data.requisition;
      const steps = requisition.approval_steps || [];
      const logs = requisition.approval_logs || [];
      const quotations = requisition.quotations || [];

      const requiredRoleLevel = STEP_TO_ROLE[requisition.current_approval_level];
      const canAct = currentUser &&
        currentUser.role_level === requiredRoleLevel &&
        (requisition.status === 'pending' || requisition.status === 'in_review');
      const isStep5 = requisition.current_approval_level === 5;

      let html = `
        <a href="#" class="back-link" data-action="navigate" data-view="requisitions">&larr; Volver a requisiciones</a>

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
                  <span class="req-detail__meta-value">${stepLabel(requisition.current_approval_level)} (${roleNameForStep(requisition.current_approval_level)})</span>
                </li>
                <li>
                  <span class="req-detail__meta-label">Subido por</span>
                  <span class="req-detail__meta-value">${escapeHtml(requisition.uploader_name)}</span>
                </li>
                <li>
                  <span class="req-detail__meta-label">Archivo</span>
                  <span class="req-detail__meta-value req-detail__file-link" data-action="preview-requisition-file" data-id="${requisition.id}" data-filename="${escapeHtml(requisition.original_filename)}" title="Clic para vista previa">${escapeHtml(requisition.original_filename)}</span>
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
                <button class="btn btn--outline btn--sm" data-action="download" data-id="${requisition.id}" data-filename="${escapeHtml(requisition.original_filename)}">Ver documento</button>
              </div>
            </div>
      `;

      // Quotations panel — between requisition info and approval actions
      html += renderQuotationsPanel(requisition, quotations, currentUser);

      // Approval action panel
      if (canAct) {
        html += `
            <div class="approval-panel" id="approval-panel">
              <h3 class="approval-panel__title">Acción de aprobación — ${stepLabel(requisition.current_approval_level)} (${roleNameForStep(requisition.current_approval_level, currentUser.gender)})</h3>
        `;

        // Quotation selection UI for step 5 (Representante Legal selects a quotation)
        if (isStep5 && quotations.length > 1) {
          // Multiple quotations: show selection UI
          html += `
              <div class="quotation-selection" id="quotation-selection">
                <label class="form__label">Seleccione la cotización ganadora</label>
                <div class="quotation-selection__list">
          `;
          for (const quotation of quotations) {
            const docs = quotation.documents || [];
            const isComplete = DOC_TYPES.every((dt) => docs.some((d) => d.doc_type === dt.key));
            html += `
                  <label class="quotation-selection__option${isComplete ? '' : ' quotation-selection__option--incomplete'}">
                    <input type="radio" name="selected_quotation" value="${quotation.id}" class="quotation-selection__radio" ${!isComplete ? 'disabled' : ''}>
                    <div class="quotation-selection__info">
                      <span class="quotation-selection__provider">${escapeHtml(quotation.provider_name)}</span>
                      <span class="quotation-selection__file">📄 ${escapeHtml(quotation.original_filename)}</span>
                      ${!isComplete ? '<span class="quotation-selection__warning">⚠️ Documentación incompleta</span>' : '<span class="quotation-selection__complete">✅ Documentación completa</span>'}
                    </div>
                  </label>
            `;
          }
          html += `
                </div>
              </div>
          `;
        } else if (isStep5 && quotations.length === 1) {
          // Single quotation: auto-select, no selection UI needed
          html += `
              <div class="alert alert--info" style="margin-bottom: 12px;">
                Se aprobará automáticamente la única cotización: <strong>${escapeHtml(quotations[0].provider_name)}</strong>
              </div>
          `;
        } else if (isStep5 && quotations.length === 0) {
          html += `
              <div class="alert alert--error">No hay cotizaciones disponibles para seleccionar. El paso anterior debe agregar cotizaciones.</div>
          `;
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
      }

      html += `</div>`; // close left column

      // Timeline column (right)
      html += `<div class="req-detail__right">`;
      html += `
        <div class="timeline">
          <h3 class="timeline__title">Línea de aprobación</h3>
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
        } else if (step.step_level === requisition.current_approval_level &&
                   (requisition.status === 'pending' || requisition.status === 'in_review')) {
          itemClass = 'timeline__item--current';
        }

        // Determine gender for this step's role label:
        // - If there's a log entry (completed step), use the acting user's gender
        // - If the current user's role matches this step's required role, use their gender
        // - Otherwise use neutral (no gender)
        const stepRoleLevel = STEP_TO_ROLE[step.step_level] || step.step_level;
        let stepGender = null;
        if (stepLog && stepLog.user_gender) {
          stepGender = stepLog.user_gender;
        } else if (currentUser && stepRoleLevel === currentUser.role_level) {
          stepGender = currentUser.gender;
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

      html += `
          </ul>
        </div>
      `;

      // Approval logs history
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
        html += `</div></div>`;
      }

      html += `</div>`; // close right column
      html += `</div>`; // close req-detail grid

      container.innerHTML = html;

      // Auto-preview if a file was just uploaded
      if (_lastUploadedFileInfo) {
        const info = _lastUploadedFileInfo;
        _lastUploadedFileInfo = null;
        setTimeout(() => {
          openDocumentModal(info.fetchFn, info.filename);
        }, 400);
      }
    } catch (err) {
      showError(container, err.message || 'Error al cargar la requisición');
    }
  }

  // --- Create Requisition Form View ---

  function renderCreateRequisitionForm(container) {
    // Client-side guard: only role_level 1 can create requisitions
    if (!currentUser || currentUser.role_level !== 1) {
      container.innerHTML = `
        <div class="alert alert--error">No tiene permisos para crear requisiciones. Solo los Coordinadores/as de Territorio pueden crear requisiciones.</div>
      `;
      setTimeout(() => navigate('dashboard'), 2000);
      return;
    }

    let html = `
      <a href="#" class="back-link" data-action="navigate" data-view="requisitions">&larr; Volver a requisiciones</a>

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
              <label class="form__label">Archivo</label>
              <div class="upload-form__file-area" id="file-drop-area">
                <div class="upload-form__file-text">Haz clic o arrastra un archivo aquí</div>
                <input type="file" id="upload-file" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.svg,.webp,.bmp">
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <p>Selecciona un archivo para ver la vista previa</p>
            </div>
          </div>
        </div>
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
        showFilePreview(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileNameEl.textContent = fileInput.files[0].name;
        showFilePreview(fileInput.files[0]);
      }
    });

    // Form submit
    $('#upload-form').addEventListener('submit', handleCreateRequisition);
  }

  function showFilePreview(file) {
    const previewBody = $('#preview-body');
    if (!previewBody) return;

    const fileName = file.name;
    const fileSize = formatFileSize(file.size);
    const fileExt = fileName.split('.').pop().toLowerCase();

    // Image types
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
    // PDF
    const pdfExts = ['pdf'];
    // Office docs (no native preview)
    const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

    if (imageExts.includes(fileExt)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewBody.innerHTML = `
          <div class="upload-preview__image-wrap">
            <img src="${e.target.result}" alt="${escapeHtml(fileName)}" class="upload-preview__image">
          </div>
          <div class="upload-preview__info">
            <div class="upload-preview__filename">${escapeHtml(fileName)}</div>
            <div class="upload-preview__filesize">${fileSize}</div>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else if (pdfExts.includes(fileExt)) {
      const url = URL.createObjectURL(file);
      previewBody.innerHTML = `
        <div class="upload-preview__pdf-wrap">
          <iframe src="${url}#toolbar=0&navpanes=0&scrollbar=1&zoom=63" class="upload-preview__pdf" title="Vista previa PDF"></iframe>
        </div>
        <div class="upload-preview__info">
          <div class="upload-preview__filename">${escapeHtml(fileName)}</div>
          <div class="upload-preview__filesize">${fileSize}</div>
        </div>
      `;
    } else {
      // Generic file icon for office docs and other types
      let iconLabel = fileExt.toUpperCase();
      let iconColor = 'var(--color-text-light)';

      if (officeExts.includes(fileExt)) {
        if (fileExt === 'doc' || fileExt === 'docx') {
          iconColor = '#2B579A';
          iconLabel = 'WORD';
        } else if (fileExt === 'xls' || fileExt === 'xlsx') {
          iconColor = '#217346';
          iconLabel = 'EXCEL';
        } else if (fileExt === 'ppt' || fileExt === 'pptx') {
          iconColor = '#D24726';
          iconLabel = 'PPT';
        }
      }

      previewBody.innerHTML = `
        <div class="upload-preview__file-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span class="upload-preview__file-ext" style="color: ${iconColor}">${iconLabel}</span>
        </div>
        <div class="upload-preview__info">
          <div class="upload-preview__filename">${escapeHtml(fileName)}</div>
          <div class="upload-preview__filesize">${fileSize}</div>
        </div>
      `;
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function handleCreateRequisition(e) {
    e.preventDefault();

    const title = $('#upload-title').value.trim();
    const description = $('#upload-description').value.trim();
    const fileInput = $('#upload-file');
    const btn = $('#upload-btn');
    const feedback = $('#upload-feedback');

    if (!title) {
      feedback.innerHTML = '<div class="alert alert--error">El título es obligatorio</div>';
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
    btn.textContent = 'Creando...';
    feedback.innerHTML = '';

    try {
      const result = await API.createRequisition(formData);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Requisición creada exitosamente')}</div>`;
      // Navigate to the new requisition after a brief delay
      const requisitionId = result.data.requisition.id;
      setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1500);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al crear la requisición')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Crear Requisición';
    }
  }

  // --- User Management View ---

  /**
   * Render the user management view with user list table.
   * @param {HTMLElement} container - Main content container
   */
  async function renderUsers(container) {
    // Guard: only role_level 3 can access
    if (!currentUser || currentUser.role_level !== 3) {
      container.innerHTML = `
        <div class="alert alert--error">No tiene permisos para acceder a la gestión de usuarios.</div>
      `;
      setTimeout(() => navigate('dashboard'), 2000);
      return;
    }

    showLoading(container);

    try {
      const result = await API.getUsers();
      const users = result.data.users || [];

      let html = `
        <div class="main__header">
          <h2 class="main__title">Gestión de Usuarios</h2>
          <button class="btn btn--primary" data-action="show-create-user">+ Crear Usuario</button>
        </div>

        <!-- Create User Form (hidden by default) -->
        <div class="user-form-panel hidden" id="create-user-panel">
          <h3 class="user-form-panel__title">Crear Nuevo Usuario</h3>
          <div id="create-user-feedback"></div>
          <form id="create-user-form">
            <div class="user-form-grid">
              <div class="form__group">
                <label class="form__label" for="create-username">Usuario</label>
                <input class="form__input" type="text" id="create-username" required placeholder="usuario.nombre" pattern="[a-zA-Z0-9.]+">
              </div>
              <div class="form__group">
                <label class="form__label" for="create-email">Email</label>
                <input class="form__input" type="email" id="create-email" required placeholder="correo@ejemplo.com">
              </div>
              <div class="form__group">
                <label class="form__label" for="create-password">Contraseña</label>
                <input class="form__input" type="password" id="create-password" required minlength="6" placeholder="Mínimo 6 caracteres">
              </div>
              <div class="form__group">
                <label class="form__label" for="create-fullname">Nombre Completo</label>
                <input class="form__input" type="text" id="create-fullname" required placeholder="Nombre completo">
              </div>
              <div class="form__group">
                <label class="form__label" for="create-role">Rol</label>
                <select class="form__input" id="create-role" required>
                  <option value="">Seleccione un rol</option>
                  <option value="1">Coordinador/a de Territorio</option>
                  <option value="2">Director/a Programática</option>
                  <option value="3">Representante Legal</option>
                  <option value="4">Encargado/a de Compras</option>
                  <option value="5">Área Financiera</option>
                  <option value="6">Área de Compras</option>
                </select>
              </div>
              <div class="form__group">
                <label class="form__label" for="create-territory">Territorio</label>
                <input class="form__input" type="text" id="create-territory" placeholder="Opcional">
              </div>
              <div class="form__group">
                <label class="form__label" for="create-gender">Género</label>
                <select class="form__input" id="create-gender">
                  <option value="">Prefiero no decir</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
            </div>
            <div class="user-form-actions">
              <button class="btn btn--primary" type="submit" id="create-user-btn">Crear Usuario</button>
              <button class="btn btn--outline" type="button" data-action="cancel-create-user">Cancelar</button>
            </div>
          </form>
        </div>

        <!-- Edit User Form (hidden by default) -->
        <div class="user-form-panel hidden" id="edit-user-panel">
          <h3 class="user-form-panel__title">Editar Usuario</h3>
          <div id="edit-user-feedback"></div>
          <form id="edit-user-form">
            <input type="hidden" id="edit-user-id">
            <div class="user-form-grid">
              <div class="form__group">
                <label class="form__label" for="edit-username">Usuario</label>
                <input class="form__input" type="text" id="edit-username" disabled>
              </div>
              <div class="form__group">
                <label class="form__label" for="edit-email">Email</label>
                <input class="form__input" type="email" id="edit-email" required placeholder="correo@ejemplo.com">
              </div>
              <div class="form__group">
                <label class="form__label" for="edit-fullname">Nombre Completo</label>
                <input class="form__input" type="text" id="edit-fullname" required minlength="2" placeholder="Nombre completo">
              </div>
              <div class="form__group">
                <label class="form__label" for="edit-role">Rol</label>
                <select class="form__input" id="edit-role" required>
                  <option value="1">Coordinador/a de Territorio</option>
                  <option value="2">Director/a Programática</option>
                  <option value="3">Representante Legal</option>
                  <option value="4">Encargado/a de Compras</option>
                  <option value="5">Área Financiera</option>
                  <option value="6">Área de Compras</option>
                </select>
              </div>
              <div class="form__group">
                <label class="form__label" for="edit-territory">Territorio</label>
                <input class="form__input" type="text" id="edit-territory" placeholder="Opcional">
              </div>
              <div class="form__group">
                <label class="form__label" for="edit-gender">Género</label>
                <select class="form__input" id="edit-gender">
                  <option value="">Prefiero no decir</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
            </div>
            <div class="user-form-actions">
              <button class="btn btn--primary" type="submit" id="edit-user-btn">Guardar Cambios</button>
              <button class="btn btn--outline" type="button" data-action="cancel-edit-user">Cancelar</button>
            </div>
          </form>
        </div>

        <!-- Reset Password Form (hidden by default) -->
        <div class="user-form-panel hidden" id="reset-password-panel">
          <h3 class="user-form-panel__title">Restablecer Contraseña</h3>
          <p class="user-form-panel__subtitle" id="reset-password-username"></p>
          <div id="reset-password-feedback"></div>
          <form id="reset-password-form">
            <input type="hidden" id="reset-password-user-id">
            <div class="form__group">
              <label class="form__label" for="reset-password-input">Nueva Contraseña</label>
              <input class="form__input" type="password" id="reset-password-input" required minlength="6" placeholder="Mínimo 6 caracteres">
            </div>
            <div class="user-form-actions">
              <button class="btn btn--primary" type="submit" id="reset-password-btn">Restablecer</button>
              <button class="btn btn--outline" type="button" data-action="cancel-reset-password">Cancelar</button>
            </div>
          </form>
        </div>
      `;

      // User table
      if (users.length === 0) {
        html += `<div class="empty">No hay usuarios registrados</div>`;
      } else {
        html += `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Territorio</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
        `;

        for (const user of users) {
          const statusClass = user.is_active ? 'badge--user-active' : 'badge--user-inactive';
          const statusText = user.is_active ? 'Activo' : 'Inactivo';

          html += `
            <tr>
              <td>${escapeHtml(user.full_name)}</td>
              <td>${escapeHtml(user.username)}</td>
              <td>${escapeHtml(user.email || '—')}</td>
              <td>${escapeHtml(roleName(user.role_level, user.gender))}</td>
              <td>${escapeHtml(user.territory || '—')}</td>
              <td><span class="badge ${statusClass}">${statusText}</span></td>
              <td class="user-actions">
                <button class="btn btn--outline btn--sm" data-action="edit-user" data-user='${escapeHtml(JSON.stringify(user))}' title="Editar">✏️</button>
                <button class="btn btn--outline btn--sm" data-action="reset-user-password" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Restablecer contraseña">🔑</button>
                <button class="btn btn--sm ${user.is_active ? 'btn--danger' : 'btn--secondary'}" data-action="toggle-user-active" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}" data-active="${user.is_active}" title="${user.is_active ? 'Desactivar' : 'Activar'}">${user.is_active ? '🚫' : '✅'}</button>
              </td>
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

      // Attach form handlers
      const createForm = $('#create-user-form');
      if (createForm) {
        createForm.addEventListener('submit', handleCreateUser);
      }

      const editForm = $('#edit-user-form');
      if (editForm) {
        editForm.addEventListener('submit', handleEditUser);
      }

      const resetForm = $('#reset-password-form');
      if (resetForm) {
        resetForm.addEventListener('submit', handleResetPassword);
      }
    } catch (err) {
      showError(container, err.message || 'Error al cargar los usuarios');
    }
  }

  /**
   * Show the create user form panel.
   */
  function showCreateUserPanel() {
    const panel = $('#create-user-panel');
    const editPanel = $('#edit-user-panel');
    const resetPanel = $('#reset-password-panel');
    if (editPanel) editPanel.classList.add('hidden');
    if (resetPanel) resetPanel.classList.add('hidden');
    if (panel) {
      panel.classList.remove('hidden');
      const input = $('#create-username');
      if (input) input.focus();
    }
  }

  /**
   * Hide the create user form panel and reset fields.
   */
  function hideCreateUserPanel() {
    const panel = $('#create-user-panel');
    if (panel) {
      panel.classList.add('hidden');
      const form = $('#create-user-form');
      if (form) form.reset();
      const feedback = $('#create-user-feedback');
      if (feedback) feedback.innerHTML = '';
    }
  }

  /**
   * Show the edit user form panel pre-filled with user data.
   * @param {Object} user - User data object
   */
  function showEditUserPanel(user) {
    const panel = $('#edit-user-panel');
    const createPanel = $('#create-user-panel');
    const resetPanel = $('#reset-password-panel');
    if (createPanel) createPanel.classList.add('hidden');
    if (resetPanel) resetPanel.classList.add('hidden');
    if (panel) {
      panel.classList.remove('hidden');
      $('#edit-user-id').value = user.id;
      $('#edit-username').value = user.username;
      $('#edit-email').value = user.email || '';
      $('#edit-fullname').value = user.full_name || '';
      $('#edit-role').value = user.role_level;
      $('#edit-territory').value = user.territory || '';
      $('#edit-gender').value = user.gender || '';
      const feedback = $('#edit-user-feedback');
      if (feedback) feedback.innerHTML = '';
      panel.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Hide the edit user form panel.
   */
  function hideEditUserPanel() {
    const panel = $('#edit-user-panel');
    if (panel) {
      panel.classList.add('hidden');
      const feedback = $('#edit-user-feedback');
      if (feedback) feedback.innerHTML = '';
    }
  }

  /**
   * Show the reset password form panel.
   * @param {number} userId - User ID
   * @param {string} username - Username for display
   */
  function showResetPasswordPanel(userId, username) {
    const panel = $('#reset-password-panel');
    const createPanel = $('#create-user-panel');
    const editPanel = $('#edit-user-panel');
    if (createPanel) createPanel.classList.add('hidden');
    if (editPanel) editPanel.classList.add('hidden');
    if (panel) {
      panel.classList.remove('hidden');
      $('#reset-password-user-id').value = userId;
      $('#reset-password-username').textContent = `Usuario: ${username}`;
      $('#reset-password-input').value = '';
      const feedback = $('#reset-password-feedback');
      if (feedback) feedback.innerHTML = '';
      panel.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Hide the reset password form panel.
   */
  function hideResetPasswordPanel() {
    const panel = $('#reset-password-panel');
    if (panel) {
      panel.classList.add('hidden');
      const feedback = $('#reset-password-feedback');
      if (feedback) feedback.innerHTML = '';
    }
  }

  /**
   * Handle create user form submission.
   * @param {Event} e - Submit event
   */
  async function handleCreateUser(e) {
    e.preventDefault();

    const username = $('#create-username').value.trim();
    const email = $('#create-email').value.trim();
    const password = $('#create-password').value;
    const fullName = $('#create-fullname').value.trim();
    const roleLevel = parseInt($('#create-role').value);
    const territory = $('#create-territory').value.trim();
    const gender = $('#create-gender').value;
    const btn = $('#create-user-btn');
    const feedback = $('#create-user-feedback');

    if (!username || !email || !password || !fullName || !roleLevel) {
      feedback.innerHTML = '<div class="alert alert--error">Todos los campos obligatorios deben ser completados</div>';
      return;
    }

    if (password.length < 6) {
      feedback.innerHTML = '<div class="alert alert--error">La contraseña debe tener al menos 6 caracteres</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creando...';
    feedback.innerHTML = '';

    try {
      await API.createUser({
        username,
        email,
        password,
        full_name: fullName,
        role_level: roleLevel,
        territory: territory || null,
        gender: gender || null,
      });

      feedback.innerHTML = '<div class="alert alert--success">Usuario creado exitosamente</div>';
      setTimeout(() => navigate('users'), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al crear el usuario')}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear Usuario';
    }
  }

  /**
   * Handle edit user form submission.
   * @param {Event} e - Submit event
   */
  async function handleEditUser(e) {
    e.preventDefault();

    const userId = $('#edit-user-id').value;
    const email = $('#edit-email').value.trim();
    const fullName = $('#edit-fullname').value.trim();
    const roleLevel = parseInt($('#edit-role').value);
    const territory = $('#edit-territory').value.trim();
    const gender = $('#edit-gender').value;
    const btn = $('#edit-user-btn');
    const feedback = $('#edit-user-feedback');

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    feedback.innerHTML = '';

    try {
      await API.updateUser(userId, {
        email,
        full_name: fullName,
        role_level: roleLevel,
        territory: territory || null,
        gender: gender || null,
      });

      feedback.innerHTML = '<div class="alert alert--success">Usuario actualizado exitosamente</div>';
      setTimeout(() => navigate('users'), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al actualizar el usuario')}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar Cambios';
    }
  }

  /**
   * Handle reset password form submission.
   * @param {Event} e - Submit event
   */
  async function handleResetPassword(e) {
    e.preventDefault();

    const userId = $('#reset-password-user-id').value;
    const password = $('#reset-password-input').value;
    const btn = $('#reset-password-btn');
    const feedback = $('#reset-password-feedback');

    if (!password || password.length < 6) {
      feedback.innerHTML = '<div class="alert alert--error">La contraseña debe tener al menos 6 caracteres</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Restableciendo...';
    feedback.innerHTML = '';

    try {
      await API.resetUserPassword(userId, password);
      feedback.innerHTML = '<div class="alert alert--success">Contraseña restablecida exitosamente</div>';
      setTimeout(() => hideResetPasswordPanel(), 1500);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al restablecer la contraseña')}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Restablecer';
    }
  }

  /**
   * Handle toggle user active status.
   * @param {number} userId - User ID
   * @param {string} username - Username for confirmation
   * @param {boolean} isActive - Current active status
   */
  async function handleToggleUserActive(userId, username, isActive) {
    const action = isActive ? 'desactivar' : 'activar';
    if (!confirm(`¿Está seguro de ${action} al usuario "${username}"?`)) return;

    try {
      await API.toggleUserActive(userId);
      navigate('users');
    } catch (err) {
      alert(err.message || `Error al ${action} el usuario`);
    }
  }

  // --- Profile View ---

  function renderProfile(container) {
    const user = currentUser;
    if (!user) {
      showError(container, 'No se pudo cargar la información del usuario');
      return;
    }

    const genderValue = user.gender || '';

    let html = `
      <div class="profile">
        <div class="profile__card">
          <h2 class="profile__title">Información del Usuario</h2>
          <div id="profile-feedback"></div>
          <form id="profile-form">
            <div class="form__group">
              <label class="form__label" for="profile-username">Usuario</label>
              <input class="form__input" type="text" id="profile-username" value="${escapeHtml(user.username)}" disabled>
            </div>
            <div class="form__group">
              <label class="form__label" for="profile-fullname">Nombre completo</label>
              <input class="form__input" type="text" id="profile-fullname" value="${escapeHtml(user.full_name)}" required minlength="2" placeholder="Nombre completo">
            </div>
            <div class="form__group">
              <label class="form__label" for="profile-email">Correo electrónico</label>
              <input class="form__input" type="email" id="profile-email" value="${escapeHtml(user.email || '')}" required placeholder="ejemplo@correo.com">
            </div>
            <div class="form__group">
              <label class="form__label" for="profile-gender">Género</label>
              <select class="form__input" id="profile-gender">
                <option value=""${genderValue === '' ? ' selected' : ''}>Prefiero no decir</option>
                <option value="M"${genderValue === 'M' ? ' selected' : ''}>Masculino</option>
                <option value="F"${genderValue === 'F' ? ' selected' : ''}>Femenino</option>
              </select>
            </div>
            <div class="form__group">
              <label class="form__label">Rol</label>
              <input class="form__input" type="text" value="${escapeHtml(roleName(user.role_level, user.gender))}" disabled>
            </div>
            ${user.territory ? `
            <div class="form__group">
              <label class="form__label">Territorio</label>
              <input class="form__input" type="text" value="${escapeHtml(user.territory)}" disabled>
            </div>
            ` : ''}
            <button class="btn btn--primary btn--block" type="submit" id="profile-save-btn">Guardar cambios</button>
          </form>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach form submit handler
    $('#profile-form').addEventListener('submit', handleProfileSave);
  }

  async function handleProfileSave(e) {
    e.preventDefault();

    const fullName = $('#profile-fullname').value.trim();
    const email = $('#profile-email').value.trim();
    const genderSelect = $('#profile-gender');
    const gender = genderSelect ? genderSelect.value : '';
    const btn = $('#profile-save-btn');
    const feedback = $('#profile-feedback');

    if (!fullName || fullName.length < 2) {
      feedback.innerHTML = '<div class="alert alert--error">El nombre debe tener al menos 2 caracteres</div>';
      return;
    }

    if (!email) {
      feedback.innerHTML = '<div class="alert alert--error">Ingrese un correo electrónico válido</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    feedback.innerHTML = '';

    try {
      const result = await API.updateProfile({ email, full_name: fullName, gender: gender || null });
      currentUser = result.data.user;

      // Update header
      if (currentUser) {
        $('#user-name').textContent = currentUser.full_name;
        $('#user-role').textContent = roleDisplay(currentUser);
      }

      feedback.innerHTML = '<div class="alert alert--success">Perfil actualizado exitosamente</div>';

      // Re-render profile to update the role display field
      renderProfile($('#main-content'));
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al actualizar el perfil')}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  }

  // --- Approval Actions ---

  async function handleApprove(requisitionId) {
    const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
    const btn = $('#btn-approve');
    const feedback = $('#approval-feedback');

    // Check if quotation selection is required (step 5)
    let selectedQuotationId = null;
    const quotationSelection = $('#quotation-selection');
    if (quotationSelection) {
      const selectedRadio = document.querySelector('input[name="selected_quotation"]:checked');
      if (!selectedRadio) {
        feedback.innerHTML = '<div class="alert alert--error">Debe seleccionar una cotización antes de aprobar.</div>';
        return;
      }
      selectedQuotationId = selectedRadio.value;
    }

    btn.disabled = true;
    btn.textContent = 'Aprobando...';
    if ($('#btn-reject')) $('#btn-reject').disabled = true;

    try {
      const result = await API.approveRequisition(requisitionId, comments, selectedQuotationId);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Requisición aprobada')}</div>`;
      setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al aprobar')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Aprobar';
      if ($('#btn-reject')) $('#btn-reject').disabled = false;
    }
  }

  async function handleReject(requisitionId) {
    const comments = $('#approval-comments') ? $('#approval-comments').value.trim() : '';
    const feedback = $('#approval-feedback');

    if (!comments) {
      feedback.innerHTML = '<div class="alert alert--error">Los comentarios son obligatorios para rechazar una requisición</div>';
      return;
    }

    const btn = $('#btn-reject');
    btn.disabled = true;
    btn.textContent = 'Rechazando...';
    if ($('#btn-approve')) $('#btn-approve').disabled = true;

    try {
      const result = await API.rejectRequisition(requisitionId, comments);
      feedback.innerHTML = `<div class="alert alert--success">${escapeHtml(result.message || 'Requisición rechazada')}</div>`;
      setTimeout(() => navigate('requisition-detail', { id: requisitionId }), 1000);
    } catch (err) {
      feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al rechazar')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Rechazar';
      if ($('#btn-approve')) $('#btn-approve').disabled = false;
    }
  }

  // --- Quotation Handlers ---

  function handleToggleQuotationForm() {
    const form = $('#quotation-form');
    if (form) {
      form.classList.toggle('hidden');
    }
  }

  function handleCancelQuotationForm() {
    const form = $('#quotation-form');
    if (form) {
      form.classList.add('hidden');
      const provider = $('#quotation-provider');
      const file = $('#quotation-file');
      const feedback = $('#quotation-form-feedback');
      if (provider) provider.value = '';
      if (file) file.value = '';
      if (feedback) feedback.innerHTML = '';
    }
  }

  async function handleSubmitQuotation(requisitionId) {
    const providerInput = $('#quotation-provider');
    const fileInput = $('#quotation-file');
    const feedback = $('#quotation-form-feedback');
    const btn = $('#btn-submit-quotation');

    const providerName = providerInput ? providerInput.value.trim() : '';
    if (!providerName) {
      if (feedback) feedback.innerHTML = '<div class="alert alert--error">El nombre del proveedor es obligatorio</div>';
      return;
    }

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      if (feedback) feedback.innerHTML = '<div class="alert alert--error">Debe seleccionar un archivo de cotización</div>';
      return;
    }

    const formData = new FormData();
    formData.append('provider_name', providerName);
    formData.append('file', fileInput.files[0]);

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Subiendo...';
    }
    if (feedback) feedback.innerHTML = '';

    try {
      const result = await API.createQuotation(requisitionId, formData);
      // Store info for auto-preview after re-render
      const createdQuotation = result && result.data && result.data.quotation;
      if (createdQuotation) {
        _lastUploadedFileInfo = {
          fetchFn: () => API.downloadQuotationFile(requisitionId, createdQuotation.id),
          filename: createdQuotation.original_filename || fileInput.files[0].name,
        };
      }
      navigate('requisition-detail', { id: requisitionId });
    } catch (err) {
      if (feedback) feedback.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Error al crear la cotización')}</div>`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Subir Cotización';
      }
    }
  }

  async function handleDeleteQuotation(requisitionId, quotationId) {
    if (!confirm('¿Está seguro de eliminar esta cotización y todos sus documentos?')) return;

    try {
      await API.deleteQuotation(requisitionId, quotationId);
      navigate('requisition-detail', { id: requisitionId });
    } catch (err) {
      alert(err.message || 'Error al eliminar la cotización');
    }
  }

  async function handleAttachQuotationDoc(requisitionId, quotationId, docType, fileInput) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('doc_type', docType);
    formData.append('file', fileInput.files[0]);

    try {
      const result = await API.uploadQuotationDocument(requisitionId, quotationId, formData);
      // Store info for auto-preview after re-render
      const createdDoc = result && result.data && result.data.document;
      if (createdDoc) {
        _lastUploadedFileInfo = {
          fetchFn: () => API.downloadQuotationDocument(requisitionId, quotationId, createdDoc.id),
          filename: createdDoc.original_filename || fileInput.files[0].name,
        };
      }
      navigate('requisition-detail', { id: requisitionId });
    } catch (err) {
      alert(err.message || 'Error al adjuntar el documento');
    }
  }

  async function handleDeleteQuotationDoc(requisitionId, quotationId, docId) {
    if (!confirm('¿Está seguro de eliminar este documento?')) return;

    try {
      await API.deleteQuotationDocument(requisitionId, quotationId, docId);
      navigate('requisition-detail', { id: requisitionId });
    } catch (err) {
      alert(err.message || 'Error al eliminar el documento');
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

    // Email modal
    const emailForm = $('#email-modal-form');
    if (emailForm) {
      emailForm.addEventListener('submit', handleEmailModalSave);
    }

    const emailSkip = $('#email-modal-skip');
    if (emailSkip) {
      emailSkip.addEventListener('click', hideEmailModal);
    }

    const emailBackdrop = document.querySelector('#email-modal .modal__backdrop');
    if (emailBackdrop) {
      emailBackdrop.addEventListener('click', hideEmailModal);
    }

    // Document preview modal
    const docModalClose = $('#document-modal-close');
    if (docModalClose) {
      docModalClose.addEventListener('click', closeDocumentModal);
    }

    const docModalBackdrop = document.querySelector('#document-modal .document-modal__backdrop');
    if (docModalBackdrop) {
      docModalBackdrop.addEventListener('click', closeDocumentModal);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.querySelector('#document-modal');
        if (modal && modal.style.display !== 'none') {
          closeDocumentModal();
        }
      }
    });

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

      if (action === 'view-requisition') {
        e.preventDefault();
        const id = target.dataset.id;
        navigate('requisition-detail', { id });
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
        openDocumentModal(() => API.downloadRequisition(id), filename);
      }

      // --- Quotation actions ---

      if (action === 'toggle-quotation-form') {
        e.preventDefault();
        handleToggleQuotationForm();
      }

      if (action === 'cancel-quotation-form') {
        e.preventDefault();
        handleCancelQuotationForm();
      }

      if (action === 'submit-quotation') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        handleSubmitQuotation(reqId);
      }

      if (action === 'delete-quotation') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        handleDeleteQuotation(reqId, quotationId);
      }

      if (action === 'delete-quotation-doc') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const docId = target.dataset.docId;
        handleDeleteQuotationDoc(reqId, quotationId, docId);
      }

      if (action === 'download-quotation') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const filename = target.dataset.filename;
        openDocumentModal(() => API.downloadQuotationFile(reqId, quotationId), filename);
      }

      if (action === 'download-quotation-doc') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const docId = target.dataset.docId;
        const filename = target.dataset.filename;
        openDocumentModal(() => API.downloadQuotationDocument(reqId, quotationId, docId), filename);
      }

      // --- Document Modal Preview actions ---

      if (action === 'preview-requisition-file') {
        e.preventDefault();
        const id = target.dataset.id;
        const filename = target.dataset.filename;
        openDocumentModal(() => API.downloadRequisition(id), filename);
      }

      if (action === 'preview-quotation-file') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const filename = target.dataset.filename;
        openDocumentModal(() => API.downloadQuotationFile(reqId, quotationId), filename);
      }

      if (action === 'preview-quotation-doc') {
        e.preventDefault();
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const docId = target.dataset.docId;
        const filename = target.dataset.filename;
        openDocumentModal(() => API.downloadQuotationDocument(reqId, quotationId, docId), filename);
      }

      // --- User Management actions ---

      if (action === 'show-create-user') {
        e.preventDefault();
        showCreateUserPanel();
      }

      if (action === 'cancel-create-user') {
        e.preventDefault();
        hideCreateUserPanel();
      }

      if (action === 'cancel-edit-user') {
        e.preventDefault();
        hideEditUserPanel();
      }

      if (action === 'cancel-reset-password') {
        e.preventDefault();
        hideResetPasswordPanel();
      }

      if (action === 'edit-user') {
        e.preventDefault();
        try {
          const userData = JSON.parse(target.dataset.user);
          showEditUserPanel(userData);
        } catch (_err) {
          // ignore parse errors
        }
      }

      if (action === 'reset-user-password') {
        e.preventDefault();
        const userId = target.dataset.userId;
        const username = target.dataset.username;
        showResetPasswordPanel(userId, username);
      }

      if (action === 'toggle-user-active') {
        e.preventDefault();
        const userId = target.dataset.userId;
        const username = target.dataset.username;
        const isActive = target.dataset.active === '1';
        handleToggleUserActive(userId, username, isActive);
      }
    });

    // File input change handler for quotation document attachments
    document.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset && target.dataset.action === 'attach-quotation-doc') {
        const reqId = target.dataset.reqId;
        const quotationId = target.dataset.quotationId;
        const docType = target.dataset.docType;
        handleAttachQuotationDoc(reqId, quotationId, docType, target);
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
