/* ============================================
   CID Aprueba — Formatting helpers
   ============================================ */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for safe use in HTML content AND quoted attributes. */
export function escapeHtml(str) {
  if (str === null || str === undefined || str === '') return '';
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const DATE_LONG = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_SHORT = new Intl.DateTimeFormat('es-CO', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatWith(formatter, dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  return formatter.format(date);
}

export function formatDate(dateStr) {
  return formatWith(DATE_LONG, dateStr);
}

export function formatDateShort(dateStr) {
  return formatWith(DATE_SHORT, dateStr);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Lower-cased extension without the dot ('' when none). */
export function getFileExtension(filename) {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}
