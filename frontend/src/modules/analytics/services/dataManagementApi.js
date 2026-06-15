const BASE = '/analytics/api/data';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
  return data;
}

export const dataManagementApi = {
  // Transformations
  getTransformation: (fileId) => request(`/transformations/${fileId}`),
  previewData: (fileId, offset = 0, limit = 100, upToStep) => {
    const params = new URLSearchParams({ offset, limit });
    if (upToStep != null) params.set('up_to_step', upToStep);
    return request(`/transformations/${fileId}/preview?${params}`);
  },
  addStep: (fileId, type, config) =>
    request(`/transformations/${fileId}/steps`, { method: 'POST', body: JSON.stringify({ type, config }) }),
  undo: (fileId) => request(`/transformations/${fileId}/undo`, { method: 'POST' }),
  redo: (fileId) => request(`/transformations/${fileId}/redo`, { method: 'POST' }),
  apply: (fileId) => request(`/transformations/${fileId}/apply`, { method: 'POST' }),
  save: (fileId) => request(`/transformations/${fileId}/save`, { method: 'POST' }),
  getHistory: (fileId) => request(`/transformations/${fileId}/history`),

  // Refresh
  refreshNow: (fileId) => request(`/refresh/${fileId}/now`, { method: 'POST' }),
  refreshSync: (fileId) => request(`/refresh/${fileId}/sync`, { method: 'POST' }),
  getRefreshStatus: (fileId) => request(`/refresh/${fileId}/status`),
  getRefreshLogs: (fileId, limit = 20) => request(`/refresh/${fileId}/logs?limit=${limit}`),
  getRefreshSchedule: (fileId) => request(`/refresh/${fileId}/schedule`),
  saveRefreshSchedule: (fileId, payload) =>
    request(`/refresh/${fileId}/schedule`, { method: 'PUT', body: JSON.stringify(payload) }),

  // Datasources
  listDatasources: (fileId) => request(`/datasources${fileId ? `?file_id=${fileId}` : ''}`),
  createDatasource: (payload) => request('/datasources', { method: 'POST', body: JSON.stringify(payload) }),
  updateDatasource: (id, payload) => request(`/datasources/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  testDatasource: (id) => request(`/datasources/${id}/test`, { method: 'POST' }),
  deleteDatasource: (id) => request(`/datasources/${id}`, { method: 'DELETE' }),
  getTableColumns: (id, table) => request(`/datasources/${id}/tables/${table}/columns`),

  // Parameters
  listParameters: (fileId) => request(`/parameters/${fileId}`),
  createParameter: (fileId, payload) =>
    request(`/parameters/${fileId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateParameter: (id, payload) =>
    request(`/parameters/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteParameter: (id) => request(`/parameters/${id}`, { method: 'DELETE' }),

  // Variables
  listVariables: (fileId) => request(`/variables/${fileId}`),
  createVariable: (fileId, payload) =>
    request(`/variables/${fileId}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateVariable: (id, payload) =>
    request(`/variables/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  // Audit
  getAuditLogs: (fileId) => request(`/audit/${fileId}`),
};

export default dataManagementApi;
