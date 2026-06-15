const BASE = '/analytics/api/calculated-tables';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
  return data;
}

export const calculatedTablesApi = {
  list: (reportId) => request(`/report/${reportId}`),
  get: (id) => request(`/${id}`),
  sources: (reportId) => request(`/report/${reportId}/sources`),
  autocomplete: (reportId) => request(`/report/${reportId}/autocomplete`),
  functions: () => request('/functions'),
  preview: (payload) => request('/preview', { method: 'POST', body: JSON.stringify(payload) }),
  create: (payload) => request('', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  refresh: (id) => request(`/${id}/refresh`, { method: 'POST' }),
  delete: (id) => request(`/${id}`, { method: 'DELETE' }),
};

export default calculatedTablesApi;
