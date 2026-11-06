// LedgerLine API Client
// All requests go through the Vite dev server proxy (/api → http://localhost:5000/api)
// Never store raw passwords or secrets in this module.

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? 'https://ledgerline-api-5tvi.onrender.com/api'
    : '/api');

/**
 * Retrieve JWT from localStorage.
 * Returns null if no token is stored.
 */
function getToken() {
  return localStorage.getItem('ll_token');
}

/**
 * Build standard authorization headers.
 */
function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Core fetch wrapper.
 * Throws a structured error object: { status, message, data }
 */
async function request(method, path, body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: authHeaders(extraHeaders),
  };
  if (body !== null) {
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, opts);
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const err = new Error(data?.error || `Request failed with status ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password });
  // Store token in localStorage
  if (data.token) {
    localStorage.setItem('ll_token', data.token);
    localStorage.setItem('ll_user', JSON.stringify(data.user));
  }
  return data;
}

export function logout() {
  localStorage.removeItem('ll_token');
  localStorage.removeItem('ll_user');
}

export async function getMe() {
  return request('GET', '/auth/me');
}

// ---------------------------------------------------------------------------
// Admin — Users
// ---------------------------------------------------------------------------

export async function listUsers() {
  return request('GET', '/admin/users');
}

export async function createUser(payload) {
  return request('POST', '/admin/users', payload);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts() {
  return request('GET', '/accounts');
}

export async function getAccount(id) {
  return request('GET', `/accounts/${id}`);
}

export async function createAccount(payload) {
  return request('POST', '/accounts', payload);
}

export async function reconcileAccount(id) {
  return request('GET', `/accounts/${id}/reconcile`);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 idempotency key for financial requests.
 * Keeping it here avoids importing uuid in every component.
 */
export function newIdempotencyKey() {
  // Simple RFC4122 v4 UUID without external dependency:
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function deposit(payload, idempotencyKey) {
  return request('POST', '/transactions/deposit', payload, {
    'Idempotency-Key': idempotencyKey,
  });
}

export async function withdraw(payload, idempotencyKey) {
  return request('POST', '/transactions/withdraw', payload, {
    'Idempotency-Key': idempotencyKey,
  });
}

export async function transfer(payload, idempotencyKey) {
  return request('POST', '/transactions/transfer', payload, {
    'Idempotency-Key': idempotencyKey,
  });
}
