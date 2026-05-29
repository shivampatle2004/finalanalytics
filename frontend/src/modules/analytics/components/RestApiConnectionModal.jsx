import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import './RestApiConnectionModal.css';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const AUTH_TYPES = ['none', 'api_key', 'bearer', 'basic'];

function KeyValueRows({ title, rows, onChange, onAdd, onRemove }) {
  return (
    <div className="restapi-section">
      <div className="restapi-section-header">
        <h4>{title}</h4>
        <button type="button" className="restapi-mini-btn" onClick={onAdd}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="restapi-kv-list">
        {rows.map((row, idx) => (
          <div key={`${title}-${idx}`} className="restapi-kv-row">
            <input
              value={row.key}
              onChange={(e) => onChange(idx, 'key', e.target.value)}
              placeholder="Key"
            />
            <input
              value={row.value}
              onChange={(e) => onChange(idx, 'value', e.target.value)}
              placeholder="Value"
            />
            <button type="button" className="restapi-icon-btn" onClick={() => onRemove(idx)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RestApiConnectionModal({ isOpen, onClose, onSaved, userId }) {
  const [form, setForm] = useState({
    name: '',
    base_url: '',
    endpoint: '',
    http_method: 'GET',
    auth_type: 'none',
    request_body: '{}',
    refresh_interval: 'manual',
  });
  const [headers, setHeaders] = useState([{ key: '', value: '' }]);
  const [queryParams, setQueryParams] = useState([{ key: '', value: '' }]);
  const [authConfig, setAuthConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const payload = useMemo(() => {
    const toObj = (rows) =>
      rows.reduce((acc, row) => {
        const k = String(row.key || '').trim();
        if (!k) return acc;
        acc[k] = row.value;
        return acc;
      }, {});
    let requestBody = null;
    if (String(form.request_body || '').trim()) {
      try {
        requestBody = JSON.parse(form.request_body);
      } catch {
        requestBody = null;
      }
    }
    return {
      ...form,
      headers: toObj(headers),
      query_params: toObj(queryParams),
      request_body: requestBody,
      auth_config: authConfig,
      created_by: userId ? String(userId) : null,
    };
  }, [form, headers, queryParams, authConfig, userId]);

  const runAction = async (kind) => {
    setLoading(true);
    setError('');
    try {
      const endpoint =
        kind === 'test'
          ? '/api/rest/connections/test'
          : kind === 'preview'
          ? '/api/rest/connections/preview'
          : '/api/rest/connections/save';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      if (kind === 'test') setTestResult(data);
      if (kind === 'preview') setPreview(data);
      if (kind === 'save') {
        onSaved?.(data);
        onClose?.();
      }
    } catch (e) {
      setError(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="restapi-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="restapi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="restapi-header">
          <h3>REST API Connection</h3>
          <button type="button" className="restapi-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="restapi-help">
          Paste full API URL directly (including query string if needed). Endpoint is optional.
        </p>

        <div className="restapi-grid">
          <input placeholder="Connection Name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <input placeholder="API URL * (full URL supported)" value={form.base_url} onChange={(e) => setForm((p) => ({ ...p, base_url: e.target.value }))} />
          <input placeholder="Endpoint (optional if API URL already complete)" value={form.endpoint} onChange={(e) => setForm((p) => ({ ...p, endpoint: e.target.value }))} />
          <select value={form.http_method} onChange={(e) => setForm((p) => ({ ...p, http_method: e.target.value }))}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <KeyValueRows
          title="Headers"
          rows={headers}
          onAdd={() => setHeaders((p) => [...p, { key: '', value: '' }])}
          onRemove={(idx) => setHeaders((p) => p.filter((_, i) => i !== idx))}
          onChange={(idx, key, value) => setHeaders((p) => p.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))}
        />
        <KeyValueRows
          title="Query Params"
          rows={queryParams}
          onAdd={() => setQueryParams((p) => [...p, { key: '', value: '' }])}
          onRemove={(idx) => setQueryParams((p) => p.filter((_, i) => i !== idx))}
          onChange={(idx, key, value) => setQueryParams((p) => p.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))}
        />

        <div className="restapi-grid">
          <select value={form.auth_type} onChange={(e) => setForm((p) => ({ ...p, auth_type: e.target.value }))}>
            {AUTH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.refresh_interval} onChange={(e) => setForm((p) => ({ ...p, refresh_interval: e.target.value }))}>
            <option value="manual">Manual</option>
            <option value="1 min">1 min</option>
            <option value="5 mins">5 mins</option>
            <option value="15 mins">15 mins</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        {form.auth_type === 'api_key' && (
          <div className="restapi-grid">
            <input placeholder="Key Name" onChange={(e) => setAuthConfig((p) => ({ ...p, api_key_name: e.target.value }))} />
            <input placeholder="Key Value" onChange={(e) => setAuthConfig((p) => ({ ...p, api_key_value: e.target.value }))} />
          </div>
        )}
        {form.auth_type === 'bearer' && (
          <input className="restapi-full" placeholder="Bearer Token" onChange={(e) => setAuthConfig((p) => ({ ...p, token: e.target.value }))} />
        )}
        {form.auth_type === 'basic' && (
          <div className="restapi-grid">
            <input placeholder="Username" onChange={(e) => setAuthConfig((p) => ({ ...p, username: e.target.value }))} />
            <input type="password" placeholder="Password" onChange={(e) => setAuthConfig((p) => ({ ...p, password: e.target.value }))} />
          </div>
        )}

        <textarea
          className="restapi-full"
          rows={5}
          placeholder="Request Body JSON (optional)"
          value={form.request_body}
          onChange={(e) => setForm((p) => ({ ...p, request_body: e.target.value }))}
        />

        {error && <div className="restapi-error">{error}</div>}
        {testResult?.success && (
          <div className="restapi-info">
            Test OK - {testResult.status_code} - {testResult.response_time}ms
          </div>
        )}
        {preview?.rows && (
          <div className="restapi-preview-wrap">
            <div className="restapi-preview-title">Preview (first 20 rows)</div>
            <div className="restapi-preview-scroll">
              <table>
                <thead>
                  <tr>{(preview.columns || []).map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, idx) => (
                    <tr key={idx}>
                      {(preview.columns || []).map((c) => <td key={`${idx}-${c}`}>{String(row[c] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="restapi-actions">
          <button type="button" onClick={() => runAction('test')} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : null} Test Connection
          </button>
          <button type="button" onClick={() => runAction('preview')} disabled={loading}>Preview Data</button>
          <button type="button" className="primary" onClick={() => runAction('save')} disabled={loading}>Save Connection</button>
          <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

