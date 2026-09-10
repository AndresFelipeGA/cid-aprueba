/* ============================================
   CID Aprueba — Application entry point
   ============================================ */

import * as API from './api.js';
import { state, setUser, nextRenderGeneration } from './state.js';
import { getMeta } from './meta.js';
import { registerView, currentViewDefinition, startRouter, handleRoute, navigate, parseHash } from './router.js';
import { showToast } from './ui/toast.js';
import { initModals, openModal, closeModal } from './ui/modal.js';
import { initTheme } from './ui/theme.js';
import { updateHeaderUser, updateSidebarVisibility, toggleMobileSidebar, closeMobileSidebar } from './ui/header.js';
import { setFeedback, setButtonBusy } from './ui/feedback.js';
import { updateBadges, startBadgePolling, stopBadgePolling } from './badges.js';
import * as dashboardView from './views/dashboard.js';
import * as requisitionsView from './views/requisitions.js';
import * as requisitionDetailView from './views/requisitionDetail.js';
import * as actaView from './views/acta.js';
import * as createRequisitionView from './views/createRequisition.js';
import * as profileView from './views/profile.js';
import * as usersView from './views/users.js';

const $ = (sel) => document.querySelector(sel);

// --- Views ---

registerView('dashboard', dashboardView);
registerView('requisitions', requisitionsView);
registerView('requisition-detail', requisitionDetailView);
registerView('acta', actaView);
registerView('create-requisition', createRequisitionView);
registerView('profile', profileView);
registerView('users', usersView);

// --- data-action dispatch (view handlers first, then app-wide ones) ---

const GLOBAL_ACTIONS = {
  navigate: (target) => navigate(target.dataset.view),
  'view-requisition': (target) => navigate('requisition-detail', { id: target.dataset.id }),
};

function findHandler(kind, action) {
  const view = currentViewDefinition();
  const viewHandlers = view && view[kind];
  if (viewHandlers && viewHandlers[action]) return viewHandlers[action];
  return kind === 'actions' ? GLOBAL_ACTIONS[action] : undefined;
}

function runClickAction(target, e) {
  const handler = findHandler('actions', target.dataset.action);
  if (!handler) return;
  e.preventDefault();
  handler(target, e);
}

const NATIVE_INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);

function setupDelegation() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (target) runClickAction(target, e);
  });

  // Keyboard activation for non-native clickable elements (rows, cards, links styled as buttons)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (NATIVE_INTERACTIVE.has(target.tagName)) return;
    if (!target.matches('[data-action][role="button"]')) return;
    runClickAction(target, e);
  });

  document.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.dataset.action) return;
    const handler = findHandler('changeActions', target.dataset.action);
    if (handler) handler(target, e);
  });
}

// --- Auth / shell ---

function showLogin() {
  setUser(null);
  stopBadgePolling();
  nextRenderGeneration(); // discard any in-flight render
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

  updateHeaderUser(state.user);
  updateSidebarVisibility(state.user);

  // Honour a deep link (F5 / bookmark); otherwise land on the dashboard
  if (parseHash()) {
    handleRoute();
  } else {
    navigate('dashboard');
  }

  updateBadges();
  startBadgePolling();
  checkEmailRegistration();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const errorEl = $('#login-error');

  if (!username || !password) {
    errorEl.textContent = 'Ingrese usuario y contraseña';
    errorEl.classList.remove('hidden');
    return;
  }

  const restore = setButtonBusy($('#login-btn'), 'Ingresando...');
  errorEl.classList.add('hidden');

  try {
    const result = await API.login(username, password);
    setUser(result.data.user);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message || 'Error al iniciar sesión';
    errorEl.classList.remove('hidden');
  } finally {
    restore();
  }
}

function handleLogout() {
  API.removeToken();
  // Explicit logout: drop the deep link so the next user lands on the dashboard
  // (session expiry keeps the hash so re-login returns to the same page).
  history.replaceState(null, '', location.pathname + location.search);
  showLogin();
}

// --- Email registration modal ---

function checkEmailRegistration() {
  if (!state.user) return;
  const email = state.user.email || '';
  if (!email || email.endsWith('@cid.org.co')) {
    openModal('email-modal', '#email-modal-input');
  }
}

function hideEmailModal() {
  closeModal('email-modal');
  setFeedback($('#email-modal-feedback'), 'error', '');
  const input = $('#email-modal-input');
  if (input) input.value = '';
}

async function handleEmailModalSave(e) {
  e.preventDefault();
  const email = $('#email-modal-input').value.trim();
  const feedback = $('#email-modal-feedback');

  if (!email) {
    setFeedback(feedback, 'error', 'Ingrese un correo electrónico válido');
    return;
  }

  const restore = setButtonBusy($('#email-modal-save'), 'Guardando...');
  try {
    const result = await API.updateProfile({ email });
    setUser(result.data.user);
    updateHeaderUser(state.user);
    hideEmailModal();
  } catch (err) {
    setFeedback(feedback, 'error', err.message || 'Error al guardar el correo');
  } finally {
    restore();
  }
}

// --- Static event wiring ---

function setupStaticEvents() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#btn-logout').addEventListener('click', handleLogout);
  $('#mobile-toggle').addEventListener('click', toggleMobileSidebar);
  $('.overlay').addEventListener('click', closeMobileSidebar);

  const emailForm = $('#email-modal-form');
  if (emailForm) emailForm.addEventListener('submit', handleEmailModalSave);
  const emailSkip = $('#email-modal-skip');
  if (emailSkip) emailSkip.addEventListener('click', hideEmailModal);

  window.addEventListener('auth:expired', () => {
    if (!state.user) return; // not logged in (e.g. a failed login) — nothing to expire
    showLogin();
    showToast('Sesión expirada', 'warning');
  });
}

// --- Bootstrap ---

async function init() {
  initTheme();
  initModals();
  setupStaticEvents();
  setupDelegation();
  createRequisitionView.init();
  startRouter();

  try {
    await getMeta();
  } catch (_err) {
    showToast('No se pudo cargar la configuración del sistema', 'error');
  }

  const token = API.getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const result = await API.getMe();
    setUser(result.data.user);
    showApp();
  } catch (_err) {
    API.removeToken();
    showLogin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
