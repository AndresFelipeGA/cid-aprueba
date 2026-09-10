/* ============================================
   CID Aprueba — Header & sidebar chrome
   ============================================ */

import { roleName } from '../meta.js';

export function roleDisplay(user) {
  let display = roleName(user.role_level, user.gender);
  if (user.territory) {
    display += ` - ${user.territory}`;
  }
  return display;
}

export function updateHeaderUser(user) {
  if (!user) return;
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  if (nameEl) nameEl.textContent = user.full_name;
  if (roleEl) roleEl.textContent = roleDisplay(user);
}

export function setHeaderTitle(title) {
  const el = document.getElementById('header-title');
  if (el) el.textContent = title || '';
}

/** Views that live under the "Requisiciones" nav entry. */
const NAV_PARENT = { 'requisition-detail': 'requisitions', acta: 'requisitions' };

export function setActiveNav(view) {
  const navView = NAV_PARENT[view] || view;
  document.querySelectorAll('.sidebar__link').forEach((link) => {
    link.classList.toggle('sidebar__link--active', link.dataset.view === navView);
  });
}

/** Show/hide role-restricted sidebar links. */
export function updateSidebarVisibility(user) {
  const createLink = document.getElementById('nav-create-requisition');
  if (createLink) {
    createLink.classList.toggle('hidden', !(user && user.role_level === 1));
  }
  const usersLink = document.getElementById('nav-users');
  if (usersLink) {
    usersLink.classList.toggle('hidden', !(user && user.role_level === 3));
  }
}

export function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.overlay');
  if (sidebar) sidebar.classList.toggle('sidebar--open');
  if (overlay) overlay.classList.toggle('overlay--visible');
}

export function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.overlay');
  if (sidebar) sidebar.classList.remove('sidebar--open');
  if (overlay) overlay.classList.remove('overlay--visible');
}
