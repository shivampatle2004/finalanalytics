const BASE = '/analytics/api/queries';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
  return data;
}

export const queriesApi = {
  list: (reportId) => request(`/report/${reportId}`),
  ensure: (reportId) => request(`/report/${reportId}/ensure`, { method: 'POST' }),
  create: (reportId, payload) =>
    request(`/report/${reportId}`, { method: 'POST', body: JSON.stringify(payload) }),
  rename: (queryId, query_name) =>
    request(`/${queryId}/rename`, { method: 'PUT', body: JSON.stringify({ query_name }) }),
  duplicate: (queryId) => request(`/${queryId}/duplicate`, { method: 'POST' }),
  delete: (queryId) => request(`/${queryId}`, { method: 'DELETE' }),
  getSteps: (queryId) => request(`/${queryId}/steps`),
  addStep: (queryId, operation_type, operation_config) =>
    request(`/${queryId}/steps`, { method: 'POST', body: JSON.stringify({ operation_type, operation_config }) }),
  deleteStep: (queryId, stepId) => request(`/${queryId}/steps/${stepId}`, { method: 'DELETE' }),
  toggleStep: (queryId, stepId, enabled) =>
    request(`/${queryId}/steps/${stepId}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  reorderSteps: (queryId, step_ids) =>
    request(`/${queryId}/steps/reorder`, { method: 'PUT', body: JSON.stringify({ step_ids }) }),
  preview: (queryId, offset = 0, limit = 100, upToStep) => {
    const params = new URLSearchParams({ offset, limit });
    if (upToStep != null) params.set('up_to_step', upToStep);
    return request(`/${queryId}/preview?${params}`);
  },
  refreshPreview: (queryId) => request(`/${queryId}/refresh-preview`, { method: 'POST' }),
  undo: (queryId) => request(`/${queryId}/undo`, { method: 'POST' }),
  redo: (queryId) => request(`/${queryId}/redo`, { method: 'POST' }),
  executeAll: (reportId) => request(`/report/${reportId}/execute`, { method: 'POST' }),
};

export default queriesApi;
