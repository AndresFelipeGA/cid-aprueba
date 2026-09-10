/* ============================================
   CID Aprueba — Sidebar activity badges
   ============================================ */

import * as API from './api.js';
import { state, setBadgeTimer } from './state.js';

const POLL_INTERVAL = 60000;

function setBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', `${count} ${count === 1 ? 'requisición pendiente' : 'requisiciones pendientes'}`);
    badge.classList.remove('sidebar__badge--hidden');
  } else {
    badge.removeAttribute('aria-label');
    badge.classList.add('sidebar__badge--hidden');
  }
}

export async function updateBadges() {
  if (!state.user || !API.getToken()) return;

  try {
    const result = await API.getPending(1, 100);
    const count = (result.data.items || []).length;
    setBadge('badge-requisitions', count);
    setBadge('badge-dashboard', count);
  } catch (_err) {
    // Badges are non-critical; fail silently
  }
}

export function startBadgePolling() {
  stopBadgePolling();
  setBadgeTimer(setInterval(updateBadges, POLL_INTERVAL));
}

export function stopBadgePolling() {
  if (state.badgeTimer) {
    clearInterval(state.badgeTimer);
    setBadgeTimer(null);
  }
}
