/* ============================================
   CID Aprueba — Profile view
   ============================================ */

import * as API from '../api.js';
import { state, setUser } from '../state.js';
import { escapeHtml } from '../utils/format.js';
import { roleName, genderOptions } from '../meta.js';
import { refresh } from '../router.js';
import { updateHeaderUser } from '../ui/header.js';
import { setFeedback, setButtonBusy } from '../ui/feedback.js';

export const title = 'Mi Perfil';

const $ = (sel) => document.querySelector(sel);

export function render(container) {
  const user = state.user;
  if (!user) {
    setFeedback(container, 'error', 'No se pudo cargar la información del usuario');
    return;
  }

  container.innerHTML = `
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
              ${genderOptions(user.gender || '')}
            </select>
          </div>
          <div class="form__group">
            <label class="form__label" for="profile-role">Rol</label>
            <input class="form__input" type="text" id="profile-role" value="${escapeHtml(roleName(user.role_level, user.gender))}" disabled>
          </div>
          ${user.territory ? `
          <div class="form__group">
            <label class="form__label" for="profile-territory">Territorio</label>
            <input class="form__input" type="text" id="profile-territory" value="${escapeHtml(user.territory)}" disabled>
          </div>` : ''}
          <button class="btn btn--primary btn--block" type="submit" id="profile-save-btn">Guardar cambios</button>
        </form>
      </div>
    </div>
  `;

  $('#profile-form').addEventListener('submit', handleProfileSave);
}

async function handleProfileSave(e) {
  e.preventDefault();

  const fullName = $('#profile-fullname').value.trim();
  const email = $('#profile-email').value.trim();
  const genderSelect = $('#profile-gender');
  const gender = genderSelect ? genderSelect.value : '';
  const feedback = $('#profile-feedback');

  if (!fullName || fullName.length < 2) {
    setFeedback(feedback, 'error', 'El nombre debe tener al menos 2 caracteres');
    return;
  }
  if (!email) {
    setFeedback(feedback, 'error', 'Ingrese un correo electrónico válido');
    return;
  }

  const restore = setButtonBusy($('#profile-save-btn'), 'Guardando...');
  setFeedback(feedback, 'error', '');

  try {
    const result = await API.updateProfile({ email, full_name: fullName, gender: gender || null });
    setUser(result.data.user);
    updateHeaderUser(state.user);
    // Re-render so the role field reflects the (possibly gendered) role name
    await refresh();
    setFeedback($('#profile-feedback'), 'success', 'Perfil actualizado exitosamente');
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al actualizar el perfil');
    restore();
  }
}
