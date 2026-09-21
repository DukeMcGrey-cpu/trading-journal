// Talks to the Apps Script Web app. Requests are sent as text/plain so the browser skips the CORS preflight.

import { API_URL, REQUEST_TIMEOUT_MS } from './config.js';

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function getSession() {
  return {
    apiUrl: API_URL || localStorage.getItem('tj_api_url') || '',
    token: localStorage.getItem('tj_token') || ''
  };
}
export function saveSession(apiUrl, token) {
  if (!API_URL) localStorage.setItem('tj_api_url', apiUrl);
  localStorage.setItem('tj_token', token);
}
export function clearToken() { localStorage.removeItem('tj_token'); }
export function clearSession() {
  localStorage.removeItem('tj_token');
  localStorage.removeItem('tj_api_url');
}

export async function callApi(action, payload = {}, session = null) {
  const { apiUrl, token } = session || getSession();
  if (!apiUrl || !token) throw new ApiError('AUTH', 'Not signed in');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, payload }),
      signal: ctrl.signal
    });
  } catch (err) {
    throw new ApiError('NETWORK', err.name === 'AbortError' ? 'The server took too long to answer.' : 'Cannot reach the server.');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try { json = await res.json(); } catch { throw new ApiError('SERVER', 'The server sent an unexpected reply.'); }
  if (!json.ok) throw new ApiError(json.code || 'SERVER', json.error || 'Request failed.');
  return { data: json.data, serverTime: json.serverTime };
}
