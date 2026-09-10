/* ============================================
   CID Aprueba — Toast notifications
   ============================================ */

import { escapeHtml } from '../utils/format.js';

const TOAST_ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

const RESUME_DELAY = 2000; // ms left after the pointer leaves the toast
const EXIT_ANIMATION_MS = 400; // fallback removal if animationend never fires

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {number} [duration=4000] Auto-dismiss delay in ms
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    <button class="toast__close" aria-label="Cerrar">&times;</button>
    <div class="toast__progress"></div>
  `;
  container.appendChild(toast);

  const progress = toast.querySelector('.toast__progress');
  let timer = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const schedule = (ms) => {
    clear();
    timer = setTimeout(() => dismissToast(toast), ms);
  };

  schedule(duration);

  toast.addEventListener('mouseenter', () => {
    if (progress) progress.style.animationPlayState = 'paused';
    clear();
  });

  toast.addEventListener('mouseleave', () => {
    if (progress) progress.style.animationPlayState = 'running';
    schedule(RESUME_DELAY);
  });

  toast.querySelector('.toast__close').addEventListener('click', () => {
    clear();
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains('toast--dismissing')) return;
  toast.classList.add('toast--dismissing');
  const remove = () => toast.remove();
  toast.addEventListener('animationend', remove, { once: true });
  // Guarantee removal even if the animation is disabled or never ends
  setTimeout(remove, EXIT_ANIMATION_MS);
}
