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

// --- Approvals ---

export function approveRequisition(requisitionId, comments, selectedQuotationId) {
  const body = { comments: comments || '' };
  if (selectedQuotationId) {
    body.selected_quotation_id = selectedQuotationId;
  }
  return request('POST', `/approvals/${requisitionId}/approve`, body);
}

export function rejectRequisition(requisitionId, comments) {
  return request('POST', `/approvals/${requisitionId}/reject`, { comments });
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
