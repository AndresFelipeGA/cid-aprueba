/* ============================================
   CID Aprueba — User management view (role 3)
   ============================================ */

import * as API from '../api.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/format.js';
import { roleName, roleOptions, genderOptions } from '../meta.js';
import { navigate } from '../router.js';
import { showToast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { setFeedback, setButtonBusy } from '../ui/feedback.js';
import { renderFilterableTable } from '../ui/table.js';

export const title = 'Gestión de Usuarios';

const $ = (sel) => document.querySelector(sel);
const PANELS = ['create-user-panel', 'edit-user-panel', 'reset-password-panel'];

// --- Render ---

export async function render(container, _params, ctx) {
  if (!state.user || state.user.role_level !== 3) {
    container.innerHTML = '<div class="alert alert--error">No tiene permisos para acceder a la gestión de usuarios.</div>';
    setTimeout(() => {
      if (!ctx.isStale()) navigate('dashboard');
    }, 2000);
    return;
  }

  const result = await API.getUsers();
  if (ctx.isStale()) return;
  const users = result.data.users || [];

  container.innerHTML = `
    <div class="main__header">
      <h2 class="main__title">Gestión de Usuarios</h2>
      <button class="btn btn--primary" data-action="show-create-user">+ Crear Usuario</button>
    </div>

    <div id="user-filters"></div>

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
              ${roleOptions()}
            </select>
          </div>
          <div class="form__group">
            <label class="form__label" for="create-territory">Territorio</label>
            <input class="form__input" type="text" id="create-territory" placeholder="Opcional">
          </div>
          <div class="form__group">
            <label class="form__label" for="create-gender">Género</label>
            <select class="form__input" id="create-gender">
              ${genderOptions('')}
            </select>
          </div>
        </div>
        <div class="user-form-actions">
          <button class="btn btn--primary" type="submit" id="create-user-btn">Crear Usuario</button>
          <button class="btn btn--outline" type="button" data-action="cancel-create-user">Cancelar</button>
        </div>
      </form>
    </div>

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
              ${roleOptions()}
            </select>
          </div>
          <div class="form__group">
            <label class="form__label" for="edit-territory">Territorio</label>
            <input class="form__input" type="text" id="edit-territory" placeholder="Opcional">
          </div>
          <div class="form__group">
            <label class="form__label" for="edit-gender">Género</label>
            <select class="form__input" id="edit-gender">
              ${genderOptions('')}
            </select>
          </div>
        </div>
        <div class="user-form-actions">
          <button class="btn btn--primary" type="submit" id="edit-user-btn">Guardar Cambios</button>
          <button class="btn btn--outline" type="button" data-action="cancel-edit-user">Cancelar</button>
        </div>
      </form>
    </div>

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

    <div id="user-table-container"></div>
  `;

  renderFilterableTable({
    filtersContainer: container.querySelector('#user-filters'),
    tableContainer: container.querySelector('#user-table-container'),
    rows: users,
    emptyText: 'No se encontraron usuarios',
    filters: {
      search: {
        id: 'user-search',
        placeholder: '🔍 Buscar usuario...',
        label: 'Buscar usuario',
        fields: (user) => [user.full_name, user.username, user.email],
      },
      selects: [
        {
          id: 'user-filter-role',
          label: 'Filtrar por rol',
          allLabel: 'Rol: Todos',
          options: roleOptions(),
          matches: (user, value) => user.role_level === parseInt(value, 10),
        },
        {
          id: 'user-filter-status',
          label: 'Filtrar por estado',
          allLabel: 'Estado: Todos',
          options: '<option value="1">Activo</option><option value="0">Inactivo</option>',
          matches: (user, value) => String(user.is_active) === value,
        },
      ],
    },
    columns: [
      { header: 'Nombre', render: (u) => escapeHtml(u.full_name) },
      { header: 'Usuario', render: (u) => escapeHtml(u.username) },
      { header: 'Email', render: (u) => escapeHtml(u.email || '—') },
      { header: 'Rol', render: (u) => escapeHtml(roleName(u.role_level, u.gender)) },
      { header: 'Territorio', render: (u) => escapeHtml(u.territory || '—') },
      {
        header: 'Estado',
        render: (u) => `<span class="badge ${u.is_active ? 'badge--user-active' : 'badge--user-inactive'}">${u.is_active ? 'Activo' : 'Inactivo'}</span>`,
      },
      {
        header: 'Acciones',
        render: (u) => `
          <div class="user-actions">
            <button class="btn btn--outline btn--sm" data-action="edit-user" data-user='${escapeHtml(JSON.stringify(u))}' aria-label="Editar ${escapeHtml(u.username)}">✏️ Editar</button>
            <button class="btn btn--outline btn--sm" data-action="reset-user-password" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" aria-label="Restablecer contraseña de ${escapeHtml(u.username)}">🔑 Contraseña</button>
            <button class="btn btn--sm ${u.is_active ? 'btn--warning' : 'btn--secondary'}" data-action="toggle-user-active" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" data-active="${u.is_active ? '1' : '0'}" aria-label="${u.is_active ? 'Desactivar' : 'Activar'} ${escapeHtml(u.username)}">${u.is_active ? '🚫 Desactivar' : '✅ Activar'}</button>
          </div>`,
      },
    ],
  });

  $('#create-user-form').addEventListener('submit', handleCreateUser);
  $('#edit-user-form').addEventListener('submit', handleEditUser);
  $('#reset-password-form').addEventListener('submit', handleResetPassword);
}

// --- Panels ---

/** Show one form panel (hiding the others) and return it. */
function showPanel(id) {
  for (const panelId of PANELS) {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.toggle('hidden', panelId !== id);
  }
  return document.getElementById(id);
}

function hidePanel(id, feedbackId, resetForm) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.add('hidden');
  if (resetForm) {
    const form = panel.querySelector('form');
    if (form) form.reset();
  }
  setFeedback(document.getElementById(feedbackId), 'error', '');
}

function showCreateUserPanel() {
  const panel = showPanel('create-user-panel');
  if (panel) $('#create-username').focus();
}

function showEditUserPanel(user) {
  const panel = showPanel('edit-user-panel');
  if (!panel) return;
  $('#edit-user-id').value = user.id;
  $('#edit-username').value = user.username;
  $('#edit-email').value = user.email || '';
  $('#edit-fullname').value = user.full_name || '';
  $('#edit-role').value = user.role_level;
  $('#edit-territory').value = user.territory || '';
  $('#edit-gender').value = user.gender || '';
  setFeedback($('#edit-user-feedback'), 'error', '');
  panel.scrollIntoView({ behavior: 'smooth' });
}

function showResetPasswordPanel(userId, username) {
  const panel = showPanel('reset-password-panel');
  if (!panel) return;
  $('#reset-password-user-id').value = userId;
  $('#reset-password-username').textContent = `Usuario: ${username}`;
  $('#reset-password-input').value = '';
  setFeedback($('#reset-password-feedback'), 'error', '');
  panel.scrollIntoView({ behavior: 'smooth' });
}

// --- Handlers ---

async function handleCreateUser(e) {
  e.preventDefault();

  const username = $('#create-username').value.trim();
  const email = $('#create-email').value.trim();
  const password = $('#create-password').value;
  const fullName = $('#create-fullname').value.trim();
  const roleLevel = parseInt($('#create-role').value, 10);
  const territory = $('#create-territory').value.trim();
  const gender = $('#create-gender').value;
  const feedback = $('#create-user-feedback');

  if (!username || !email || !password || !fullName || !roleLevel) {
    setFeedback(feedback, 'error', 'Todos los campos obligatorios deben ser completados');
    return;
  }
  if (password.length < 6) {
    setFeedback(feedback, 'error', 'La contraseña debe tener al menos 6 caracteres');
    return;
  }

  const restore = setButtonBusy($('#create-user-btn'), 'Creando...');
  setFeedback(feedback, 'error', '');

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
    setFeedback(feedback, 'success', 'Usuario creado exitosamente');
    setTimeout(() => navigate('users'), 1000);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al crear el usuario');
  } finally {
    restore();
  }
}

async function handleEditUser(e) {
  e.preventDefault();

  const userId = $('#edit-user-id').value;
  const email = $('#edit-email').value.trim();
  const fullName = $('#edit-fullname').value.trim();
  const roleLevel = parseInt($('#edit-role').value, 10);
  const territory = $('#edit-territory').value.trim();
  const gender = $('#edit-gender').value;
  const feedback = $('#edit-user-feedback');

  const restore = setButtonBusy($('#edit-user-btn'), 'Guardando...');
  setFeedback(feedback, 'error', '');

  try {
    await API.updateUser(userId, {
      email,
      full_name: fullName,
      role_level: roleLevel,
      territory: territory || null,
      gender: gender || null,
    });
    setFeedback(feedback, 'success', 'Usuario actualizado exitosamente');
    setTimeout(() => navigate('users'), 1000);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al actualizar el usuario');
  } finally {
    restore();
  }
}

async function handleResetPassword(e) {
  e.preventDefault();

  const userId = $('#reset-password-user-id').value;
  const password = $('#reset-password-input').value;
  const feedback = $('#reset-password-feedback');

  if (!password || password.length < 6) {
    setFeedback(feedback, 'error', 'La contraseña debe tener al menos 6 caracteres');
    return;
  }

  const restore = setButtonBusy($('#reset-password-btn'), 'Restableciendo...');
  setFeedback(feedback, 'error', '');

  try {
    await API.resetUserPassword(userId, password);
    setFeedback(feedback, 'success', 'Contraseña restablecida exitosamente');
    setTimeout(() => hidePanel('reset-password-panel', 'reset-password-feedback', false), 1500);
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al restablecer la contraseña');
  } finally {
    restore();
  }
}

async function handleToggleUserActive(userId, username, isActive) {
  const action = isActive ? 'desactivar' : 'activar';
  if (!(await confirmDialog(`¿Está seguro de ${action} al usuario "${username}"?`))) return;

  try {
    await API.toggleUserActive(userId);
    navigate('users');
  } catch (err) {
    showToast(err.message || `Error al ${action} el usuario`, 'error');
  }
}

// --- data-action handlers ---

export const actions = {
  'show-create-user': () => showCreateUserPanel(),
  'cancel-create-user': () => hidePanel('create-user-panel', 'create-user-feedback', true),
  'cancel-edit-user': () => hidePanel('edit-user-panel', 'edit-user-feedback', false),
  'cancel-reset-password': () => hidePanel('reset-password-panel', 'reset-password-feedback', false),
  'edit-user': (t) => {
    try {
      showEditUserPanel(JSON.parse(t.dataset.user));
    } catch (_err) {
      // ignore malformed data
    }
  },
  'reset-user-password': (t) => showResetPasswordPanel(t.dataset.userId, t.dataset.username),
  'toggle-user-active': (t) => handleToggleUserActive(t.dataset.userId, t.dataset.username, t.dataset.active === '1'),
};
