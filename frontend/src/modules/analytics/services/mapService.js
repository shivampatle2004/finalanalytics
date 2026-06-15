const BASE = '/analytics/api/maps';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers
  });
  
  if (path.includes('/export')) {
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  }
  
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
  return data;
}

export const mapService = {
  getData: (offset = 0, limit = 100, filters = {}, fileId = '') => {
    const params = new URLSearchParams({ offset, limit });
    if (fileId) params.set('file_id', fileId);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        if (Array.isArray(v)) {
          params.set(k, v.join(','));
        } else {
          params.set(k, v);
        }
      }
    });
    return request(`/data?${params}`);
  },

  getCountries: (fileId = '') => {
    const q = fileId ? `?file_id=${encodeURIComponent(fileId)}` : '';
    return request(`/countries${q}`);
  },

  getStates: (country = '', fileId = '') => {
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (fileId) params.set('file_id', fileId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/states${q}`);
  },

  getCities: (state = '', country = '', fileId = '') => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (country) params.set('country', country);
    if (fileId) params.set('file_id', fileId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/cities${q}`);
  },

  getCategories: (fileId = '') => {
    const q = fileId ? `?file_id=${encodeURIComponent(fileId)}` : '';
    return request(`/categories${q}`);
  },

  getAggregated: (groupBy, measure = 'sales', aggType = 'sum', filters = {}, fileId = '') => {
    return request('/aggregated', {
      method: 'POST',
      body: JSON.stringify({
        group_by: groupBy,
        measure,
        agg_type: aggType,
        filters,
        file_id: fileId
      })
    });
  },

  getHeatmap: (measure = 'sales', aggType = 'sum', filters = {}, fileId = '') => {
    const params = new URLSearchParams({ measure, agg_type: aggType });
    if (fileId) params.set('file_id', fileId);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        if (Array.isArray(v)) {
          params.set(k, v.join(','));
        } else {
          params.set(k, v);
        }
      }
    });
    return request(`/heatmap?${params}`);
  },

  geocode: (query) => {
    return request('/geocode', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  },

  exportData: async (format = 'csv', filters = {}, fileId = '') => {
    const params = new URLSearchParams({ format });
    if (fileId) params.set('file_id', fileId);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        if (Array.isArray(v)) {
          params.set(k, v.join(','));
        } else {
          params.set(k, v);
        }
      }
    });
    const blob = await request(`/export?${params}`);
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_export_${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    return true;
  }
};

export default mapService;
