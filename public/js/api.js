/* ============================================
   CID Aprueba — API Client Module
   ============================================ */

const API = (() => {
  'use strict';

  const BASE_URL = '/api';
  const TOKEN_KEY = 'cid_token';

  // --- Token Management ---

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function removeToken() {
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

    const options = {
      method,
      headers,
    };

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
      // On 401, clear token (session expired)
      if (response.status === 401) {
        removeToken();
      }
      throw data;
    }

    return data;
  }

  // --- Auth ---

  async function login(username, password) {
    const result = await request('POST', '/auth/login', { username, password });
    if (result.success && result.data.token) {
      setToken(result.data.token);
    }
    return result;
  }

  async function getMe() {
    return request('GET', '/auth/me');
  }

  // --- Documents ---

  async function getDocuments(page = 1, limit = 50) {
    return request('GET', `/documents?page=${page}&limit=${limit}`);
  }

  async function getDocument(id) {
    return request('GET', `/documents/${id}`);
  }

  async function uploadDocument(formData) {
    return request('POST', '/documents', formData, true);
  }

  async function downloadDocument(id) {
    return request('GET', `/documents/${id}/download`);
  }

  // --- Approvals ---

  async function approveDocument(documentId, comments) {
    return request('POST', `/approvals/${documentId}/approve`, { comments: comments || '' });
  }

  async function rejectDocument(documentId, comments) {
    return request('POST', `/approvals/${documentId}/reject`, { comments });
  }

  // --- Dashboard ---

  async function getDashboardStats() {
    return request('GET', '/dashboard/stats');
  }

  async function getPending(page = 1, limit = 20) {
    return request('GET', `/dashboard/pending?page=${page}&limit=${limit}`);
  }

  async function getRecent(limit = 10) {
    return request('GET', `/dashboard/recent?limit=${limit}`);
  }

  // --- Public API ---

  return {
    getToken,
    setToken,
    removeToken,
    login,
    getMe,
    getDocuments,
    getDocument,
    uploadDocument,
    downloadDocument,
    approveDocument,
    rejectDocument,
    getDashboardStats,
    getPending,
    getRecent,
  };
})();
