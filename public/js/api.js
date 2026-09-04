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

  // --- Requisitions ---

  async function getRequisitions(page = 1, limit = 50) {
    return request('GET', `/requisitions?page=${page}&limit=${limit}`);
  }

  async function getRequisition(id) {
    return request('GET', `/requisitions/${id}`);
  }

  async function createRequisition(formData) {
    return request('POST', '/requisitions', formData, true);
  }

  async function downloadRequisition(id) {
    return request('GET', `/requisitions/${id}/download`);
  }

  // --- Approvals ---

  async function approveRequisition(requisitionId, comments) {
    return request('POST', `/approvals/${requisitionId}/approve`, { comments: comments || '' });
  }

  async function rejectRequisition(requisitionId, comments) {
    return request('POST', `/approvals/${requisitionId}/reject`, { comments });
  }

  // --- Quotations ---

  async function getQuotations(requisitionId) {
    return request('GET', `/requisitions/${requisitionId}/quotations`);
  }

  async function createQuotation(requisitionId, formData) {
    return request('POST', `/requisitions/${requisitionId}/quotations`, formData, true);
  }

  async function deleteQuotation(requisitionId, quotationId) {
    return request('DELETE', `/requisitions/${requisitionId}/quotations/${quotationId}`);
  }

  async function uploadQuotationDocument(requisitionId, quotationId, formData) {
    return request('POST', `/requisitions/${requisitionId}/quotations/${quotationId}/documents`, formData, true);
  }

  async function deleteQuotationDocument(requisitionId, quotationId, documentId) {
    return request('DELETE', `/requisitions/${requisitionId}/quotations/${quotationId}/documents/${documentId}`);
  }

  async function downloadQuotationFile(requisitionId, quotationId) {
    return request('GET', `/requisitions/${requisitionId}/quotations/${quotationId}/download`);
  }

  async function downloadQuotationDocument(requisitionId, quotationId, documentId) {
    return request('GET', `/requisitions/${requisitionId}/quotations/${quotationId}/documents/${documentId}/download`);
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

  // --- Profile ---

  async function updateProfile(data) {
    return request('PUT', '/auth/profile', data);
  }

  // --- Public API ---

  return {
    getToken,
    setToken,
    removeToken,
    login,
    getMe,
    updateProfile,
    getRequisitions,
    getRequisition,
    createRequisition,
    downloadRequisition,
    approveRequisition,
    rejectRequisition,
    getQuotations,
    createQuotation,
    deleteQuotation,
    uploadQuotationDocument,
    deleteQuotationDocument,
    downloadQuotationFile,
    downloadQuotationDocument,
    getDashboardStats,
    getPending,
    getRecent,
  };
})();
