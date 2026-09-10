/* ============================================
   CID Aprueba — Hash router
   #/dashboard · #/requisitions · #/requisitions/:id · #/create · #/profile · #/users
   ============================================ */

import { state, setRoute, nextRenderGeneration, isCurrentGeneration } from './state.js';
import { setHeaderTitle, setActiveNav, closeMobileSidebar } from './ui/header.js';
import { showLoading, showError } from './ui/feedback.js';

const DEFAULT_HASH = '#/dashboard';

const ROUTES = [
  { pattern: /^\/dashboard\/?$/, view: 'dashboard' },
  { pattern: /^\/requisitions\/?$/, view: 'requisitions' },
  { pattern: /^\/requisitions\/(\d+)\/?$/, view: 'requisition-detail', params: (m) => ({ id: m[1] }) },
  { pattern: /^\/create\/?$/, view: 'create-requisition' },
  { pattern: /^\/profile\/?$/, view: 'profile' },
  { pattern: /^\/users\/?$/, view: 'users' },
];

const PATHS = {
  dashboard: () => '/dashboard',
  requisitions: () => '/requisitions',
  'requisition-detail': (p) => `/requisitions/${p.id}`,
  'create-requisition': () => '/create',
  profile: () => '/profile',
  users: () => '/users',
};

/** Registered views: name -> { title, render(container, params, ctx), actions?, changeActions? } */
const views = new Map();

export function registerView(name, definition) {
  views.set(name, definition);
}

export function currentViewDefinition() {
  return views.get(state.view);
}

/** Parse a location hash into { view, params } or null when unknown. */
export function parseHash(hash = location.hash) {
  const path = hash.replace(/^#/, '');
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      return { view: route.view, params: route.params ? route.params(match) : {} };
    }
  }
  return null;
}

export function hrefFor(view, params = {}) {
  const build = PATHS[view];
  return build ? `#${build(params)}` : DEFAULT_HASH;
}

/**
 * Navigate to a view. Changing the hash triggers rendering via `hashchange`;
 * navigating to the current hash re-renders in place.
 */
export function navigate(view, params = {}) {
  const target = hrefFor(view, params);
  if (location.hash === target) {
    return handleRoute();
  }
  location.hash = target;
  return Promise.resolve();
}

/** Re-render the current route. */
export function refresh() {
  return handleRoute();
}

/** Render whatever the current hash points to (called on hashchange, login and F5). */
export async function handleRoute() {
  if (!state.user) return;

  let route = parseHash();
  if (!route) {
    history.replaceState(null, '', DEFAULT_HASH);
    route = { view: 'dashboard', params: {} };
  }

  const definition = views.get(route.view);
  if (!definition) return;

  const gen = nextRenderGeneration();
  const ctx = { gen, isStale: () => !isCurrentGeneration(gen) };

  setRoute(route.view, route.params);
  setActiveNav(route.view);
  setHeaderTitle(definition.title);
  closeMobileSidebar();

  const main = document.getElementById('main-content');
  if (!main) return;

  main.setAttribute('aria-busy', 'true');
  showLoading(main);

  try {
    await definition.render(main, route.params, ctx);
  } catch (err) {
    if (!ctx.isStale()) showError(main, (err && err.message) || 'Error al cargar la vista');
  } finally {
    if (!ctx.isStale()) main.removeAttribute('aria-busy');
  }
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
}
