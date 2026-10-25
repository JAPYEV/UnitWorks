// REST client for the UnitWorks Express API. Every function returns the response's `data`
// (and `meta` where relevant) or throws an ApiError with the server's message.
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || null;
  }
}

// Set by the AuthProvider: where to get the current access token, and what to do when the API
// says the session is no longer valid (401).
let auth = { getToken: async () => null, onUnauthorized: () => {} };
export function configureApiAuth(handlers) { auth = { ...auth, ...handlers }; }

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = await auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the UnitWorks server. Check that the backend is running.', { code: 'network_error' });
  }
  if (res.status === 204) return { data: null };
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = json && json.error;
    const err = new ApiError(res.status, (e && e.message) || `Request failed (${res.status}).`, { code: e && e.code, details: e && e.details });
    if (res.status === 401) auth.onUnauthorized(err.code);
    throw err;
  }
  return json || { data: null };
}

const qs = params => {
  const p = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all');
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
};
const data = p => p.then(r => r.data);

export const inventoryApi = {
  list: params => request('GET', '/inventory' + qs(params)),            // → { data, meta }
  all: () => data(request('GET', '/inventory')),
  get: id => data(request('GET', `/inventory/${encodeURIComponent(id)}`)),
  create: item => data(request('POST', '/inventory', item)),
  update: (id, patch) => data(request('PATCH', `/inventory/${encodeURIComponent(id)}`, patch)),
  archive: id => data(request('DELETE', `/inventory/${encodeURIComponent(id)}`)),
  adjust: (id, body) => data(request('POST', `/inventory/${encodeURIComponent(id)}/adjustments`, body)),
  movements: params => data(request('GET', '/inventory/movements' + qs(params)))
};

export const buildsApi = {
  validate: selection => data(request('POST', '/builds/validate', { selection })),
  search: body => data(request('POST', '/builds/search', body)),
  list: () => data(request('GET', '/builds')),
  save: body => data(request('POST', '/builds', body)),
  remove: id => data(request('DELETE', `/builds/${id}`))
};

export const optimizerApi = {
  recommend: body => data(request('POST', '/optimizer/recommendations', body)),
  saveRun: body => data(request('POST', '/optimizer/runs', body)),
  runs: () => data(request('GET', '/optimizer/runs'))
};

export const restockApi = {
  recommend: body => data(request('POST', '/restock/recommendations', body)),
  savePlan: body => data(request('POST', '/restock/plans', body)),
  plans: () => data(request('GET', '/restock/plans')),
  receive: id => data(request('POST', `/restock/plans/${id}/receive`))
};

export const dashboardApi = { summary: () => data(request('GET', '/dashboard')) };

export const authApi = { me: () => data(request('GET', '/me')) };
