/* ============================================
   CID Aprueba — API Client Module
   ============================================ */

const BASE_URL = '/api';
const TOKEN_KEY = 'cid_token';

// --- Token Management ---

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// --- Generic Request ---

async function request(method, path, body, isFormData = false) {
  const url = `${BASE_URL}${path}`;
  const headers = {};
  const token = getToken();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };

  if (body) {
    if (isFormData) {
      // Let browser set Content-Type with boundary for FormData
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, options);

  // Handle file download (non-JSON response)
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw { success: false, message: 'Error al descargar el archivo', status: response.status };
    }
    return response;
  }

  const data = await response.json();

  if (!response.ok) {
    // A 401 on an authenticated request means the session is no longer valid.
    // (A 401 without a token is just a failed login attempt.)
    if (response.status === 401 && token) {
      removeToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw data;
  }

  return data;
}

// --- File download (authenticated) ---

/** Filename from a Content-Disposition header, or the fallback. */
function filenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
    } catch (_err) {
      // fall through to the plain filename
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : fallback;
}

/**
 * Download an API resource that needs the Authorization header (e.g. CSV exports):
 * fetch → blob → object URL → temporary <a download>.
 * @param {string} path  API path (e.g. '/requisitions/export.csv')
 * @param {string} [fallbackName]
 */
export async function downloadFile(path, fallbackName = 'archivo') {
  const response = await request('GET', path);
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'), fallbackName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// --- Auth ---

export async function login(username, password) {
  const result = await request('POST', '/auth/login', { username, password });
  if (result.success && result.data.token) {
    setToken(result.data.token);
  }
  return result;
}

export function getMe() {
  return request('GET', '/auth/me');
}

export function updateProfile(data) {
  return request('PUT', '/auth/profile', data);
}

// --- Meta ---

export function getMeta() {
  return request('GET', '/meta');
}

// --- Requisitions ---

export function getRequisitions(page = 1, limit = 50) {
  return request('GET', `/requisitions?page=${page}&limit=${limit}`);
}

export function getRequisition(id) {
  return request('GET', `/requisitions/${id}`);
}

export function createRequisition(formData) {
  return request('POST', '/requisitions', formData, true);
}

export function downloadRequisition(id) {
  return request('GET', `/requisitions/${id}/download`);
}

/** Radicar nueva versión (role 1, only when returned to step 1). */
export function resubmitRequisition(id, formData) {
  return request('POST', `/requisitions/${id}/resubmit`, formData, true);
}

export function downloadRequisitionVersion(id, versionId) {
  return request('GET', `/requisitions/${id}/versions/${versionId}/download`);
}

export function exportRequisitionsCsv() {
  return downloadFile('/requisitions/export.csv', 'requisiciones.csv');
}

// --- Approvals ---

export function approveRequisition(requisitionId, comments, selectedQuotationId) {
  const body = { comments: comments || '' };
  if (selectedQuotationId) {
    body.selected_quotation_id = selectedQuotationId;
  }
  return request('POST', `/approvals/${requisitionId}/approve`, body);
}

/** Send back one step ('previous') or to the start ('start'); comments are required. */
export function returnRequisition(requisitionId, to, comments) {
  return request('POST', `/approvals/${requisitionId}/return`, { to, comments });
}

/** Terminal rejection; comments are required. */
export function rejectRequisition(requisitionId, comments) {
  return request('POST', `/approvals/${requisitionId}/reject`, { comments });
}

export function exportApprovalsCsv() {
  return downloadFile('/approvals/export.csv', 'historial-aprobaciones.csv');
}

// --- Quotations ---

export function createQuotation(requisitionId, formData) {
  return request('POST', `/requisitions/${requisitionId}/quotations`, formData, true);
}

export function deleteQuotation(requisitionId, quotationId) {
  return request('DELETE', `/requisitions/${requisitionId}/quotations/${quotationId}`);
}

export function uploadQuotationDocument(requisitionId, quotationId, formData) {
  return request('POST', `/requisitions/${requisitionId}/quotations/${quotationId}/documents`, formData, true);
}

export function deleteQuotationDocument(requisitionId, quotationId, documentId) {
  return request('DELETE', `/requisitions/${requisitionId}/quotations/${quotationId}/documents/${documentId}`);
}

export function downloadQuotationFile(requisitionId, quotationId) {
  return request('GET', `/requisitions/${requisitionId}/quotations/${quotationId}/download`);
}

export function downloadQuotationDocument(requisitionId, quotationId, documentId) {
  return request('GET', `/requisitions/${requisitionId}/quotations/${quotationId}/documents/${documentId}/download`);
}

// --- Projects ---

export function getProjects() {
  return request('GET', '/projects');
}

export function createProject(projectData) {
  return request('POST', '/projects', projectData);
}

// --- Dashboard ---

export function getDashboardStats() {
  return request('GET', '/dashboard/stats');
}

export function getPending(page = 1, limit = 20) {
  return request('GET', `/dashboard/pending?page=${page}&limit=${limit}`);
}

// --- User Management (admin only) ---

export function getUsers() {
  return request('GET', '/users');
}

export function createUser(userData) {
  return request('POST', '/users', userData);
}

export function updateUser(id, userData) {
  return request('PUT', `/users/${id}`, userData);
}

export function resetUserPassword(id, password) {
  return request('PUT', `/users/${id}/password`, { password });
}

export function toggleUserActive(id) {
  return request('PUT', `/users/${id}/toggle`);
}
