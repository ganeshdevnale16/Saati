import { API_URL } from './config';
import { getToken } from './session';

export async function api(path, { method = 'GET', body, auth = true, timeoutMs = 15000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('No response from server. Check your internet.');
    throw e;
  } finally { clearTimeout(timer); }
}
