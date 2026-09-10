/* ============================================
   CID Aprueba — Workflow metadata (from /api/meta)
   Roles, steps, statuses and document types come from the backend so
   they are never duplicated here.
   ============================================ */

import * as API from './api.js';
import { state, setMeta } from './state.js';
import { escapeHtml } from './utils/format.js';

let metaPromise = null; // cached request (loaded once per page)

/** Load /api/meta once; the resolved data is also kept in state.meta. */
export function getMeta() {
  if (!metaPromise) {
    metaPromise = API.getMeta()
      .then((result) => {
        setMeta(result.data);
        return result.data;
      })
      .catch((err) => {
        metaPromise = null;
        throw err;
      });
  }
  return metaPromise;
}

const meta = () => state.meta || {};

// --- Roles & steps ---

export function roleName(level, gender) {
  const entry = (meta().role_names || {})[level];
  if (!entry) return `Nivel ${level}`;
  if (gender && entry[gender]) return entry[gender];
  return entry.default;
}

export function stepLabel(step) {
  return (meta().step_labels || {})[step] || `Paso ${step}`;
}

/** Role level required to act on a given workflow step. */
export function stepRole(step) {
  const map = meta().step_to_role || {};
  return map[step] !== undefined ? map[step] : null;
}

export function roleNameForStep(step, gender) {
  return roleName(stepRole(step), gender);
}

export function maxStep() {
  return meta().max_step || 7;
}

/** Quotation document types as [{ key, label }]. */
export function docTypes() {
  return Object.entries(meta().doc_types || {}).map(([key, label]) => ({ key, label }));
}

/** Comma-separated extension list for <input type="file" accept>. */
export function acceptAttr() {
  const exts = meta().allowed_extensions || ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];
  return exts.join(',');
}

// --- Statuses & actions (UI vocabulary) ---

const STATUS_LABELS = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  uploaded: 'Subido',
};

const ACTION_LABELS = {
  approved: 'Aprobó',
  rejected: 'Rechazó',
  uploaded: 'Subió',
};

const GENDERS = [
  ['', 'Prefiero no decir'],
  ['M', 'Masculino'],
  ['F', 'Femenino'],
];

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function statusBadge(status) {
  return `<span class="badge badge--${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

// --- <option> generators ---

function optionsHtml(entries, selected) {
  return entries
    .map(([value, label]) => {
      const sel = selected !== undefined && String(value) === String(selected) ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${sel}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

export function roleOptions(selected) {
  const entries = Object.keys(meta().role_names || {}).map((level) => [level, roleName(level)]);
  return optionsHtml(entries, selected);
}

export function stepOptions(selected) {
  const entries = Object.keys(meta().step_labels || {}).map((step) => [step, stepLabel(step)]);
  return optionsHtml(entries, selected);
}

export function statusOptions(selected) {
  const entries = (meta().statuses || Object.keys(STATUS_LABELS).filter((s) => s !== 'uploaded'))
    .map((status) => [status, statusLabel(status)]);
  return optionsHtml(entries, selected);
}

export function genderOptions(selected) {
  return optionsHtml(GENDERS, selected === undefined ? '' : selected);
}
