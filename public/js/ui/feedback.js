/* ============================================
   CID Aprueba — Loading / error / inline feedback helpers
   ============================================ */

import { escapeHtml } from '../utils/format.js';

export function alertHtml(type, message) {
  return `<div class="alert alert--${type}">${escapeHtml(message)}</div>`;
}

export function showLoading(container) {
  container.innerHTML = `
    <div class="loading">
      <div class="loading__spinner"></div>
      Cargando...
    </div>
  `;
}

export function showError(container, message) {
  container.innerHTML = alertHtml('error', message);
}

/** Set (or clear, when message is empty) an inline alert inside a feedback element. */
export function setFeedback(el, type, message) {
  if (!el) return;
  el.innerHTML = message ? alertHtml(type, message) : '';
}

/**
 * Disable a button and swap its label while an async action runs.
 * @returns {() => void} restore function
 */
export function setButtonBusy(btn, busyText) {
  if (!btn) return () => {};
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  return () => {
    btn.disabled = false;
    btn.textContent = original;
  };
}
