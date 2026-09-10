/* ============================================
   CID Aprueba — Application State Store
   The single place for mutable UI state.
   ============================================ */

export const state = {
  /** Authenticated user object (or null when logged out). */
  user: null,
  /** Name of the view currently rendered. */
  view: null,
  /** Route params of the current view (e.g. { id }). */
  params: {},
  /** Workflow metadata loaded from GET /api/meta. */
  meta: null,
  /** Incrementing render generation used to discard stale renders. */
  renderGen: 0,
  /** Interval id for sidebar badge polling. */
  badgeTimer: null,
};

export function setUser(user) {
  state.user = user;
}

export function setRoute(view, params = {}) {
  state.view = view;
  state.params = params;
}

export function setMeta(meta) {
  state.meta = meta;
}

export function setBadgeTimer(id) {
  state.badgeTimer = id;
}

/** Start a new render generation and return its token. */
export function nextRenderGeneration() {
  state.renderGen += 1;
  return state.renderGen;
}

export function isCurrentGeneration(gen) {
  return gen === state.renderGen;
}
