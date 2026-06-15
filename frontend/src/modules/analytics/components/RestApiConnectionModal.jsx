import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Loader2, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import './RestApiConnectionModal.css';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const AUTH_TYPES = ['none', 'api_key', 'bearer', 'basic'];

const Field = ({ label, children, className = '', required = false }) => (
  <label className={`restapi-field ${className}`}>
    {label && (
      <span>
        {label}
        {required && <span className="restapi-required" aria-hidden="true">*</span>}
      </span>
    )}
    {children}
  </label>
);

function KeyValueRows({ title, rows, onChange, onAdd, onRemove }) {
  return (
    <div className="restapi-kv-block">
      <div className="restapi-kv-header">
        <h4>{title}</h4>
        <button type="button" className="restapi-mini-btn" onClick={onAdd}>
          <Plus size={12} /> Add
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
            <button type="button" className="restapi-icon-btn" onClick={() => onRemove(idx)} aria-label="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemaEditor({ schemaConfig, onChange }) {
  const [expanded, setExpanded] = useState(true);
  if (!schemaConfig) return null;

  const mappings = schemaConfig.field_mappings || {};
  const excluded = new Set(schemaConfig.excluded_fields || []);
  const apiFields = schemaConfig.included_fields?.length
    ? schemaConfig.included_fields
    : Object.keys(mappings);

  const toggleField = (apiField) => {
    const nextExcluded = new Set(excluded);
    if (nextExcluded.has(apiField)) nextExcluded.delete(apiField);
    else nextExcluded.add(apiField);
    onChange({
      ...schemaConfig,
      excluded_fields: Array.from(nextExcluded),
      included_fields: apiFields.filter((f) => !nextExcluded.has(f)),
      auto_inferred: false,
    });
  };

  const setPrimaryKey = (value) => {
    onChange({ ...schemaConfig, primary_key: value || null, auto_inferred: false });
  };

  const canonicalOptions = [...new Set(Object.values(mappings))];

  return (
    <div className="restapi-schema-panel">
      <button type="button" className="restapi-schema-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>Schema · {apiFields.length - excluded.size} fields</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && (
        <div className="restapi-schema-body">
          <div className="restapi-schema-pk">
            <label>Primary key</label>
            <select value={schemaConfig.primary_key || ''} onChange={(e) => setPrimaryKey(e.target.value)}>
              <option value="">Auto (row index)</option>
              {apiFields.map((f) => (
                <option key={f} value={f}>{f} → {mappings[f] || f}</option>
              ))}
              {canonicalOptions.map((c) => (
                <option key={`canon-${c}`} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="restapi-schema-fields">
            <div className="restapi-schema-fields-header">
              <span>API field</span>
              <span>Column</span>
              <span>On</span>
            </div>
            {apiFields.map((apiField) => (
              <div key={apiField} className="restapi-schema-field-row">
                <span className="restapi-schema-api" title={apiField}>{apiField}</span>
                <span className="restapi-schema-canon">{mappings[apiField] || apiField}</span>
                <input
                  type="checkbox"
                  checked={!excluded.has(apiField)}
                  onChange={() => toggleField(apiField)}
                />
              </div>
            ))}
          </div>
          {schemaConfig.record_count != null && (
            <div className="restapi-schema-meta">
              {schemaConfig.record_count} records
              {schemaConfig.records_path ? ` at "${schemaConfig.records_path}"` : ''}
            </div>
          )}
        </div>
      )}
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
  const [schemaConfig, setSchemaConfig] = useState(null);
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
      try { requestBody = JSON.parse(form.request_body); } catch { requestBody = null; }
    }
    return {
      ...form,
      headers: toObj(headers),
      query_params: toObj(queryParams),
      request_body: requestBody,
      auth_config: authConfig,
      created_by: userId ? String(userId) : null,
      schema_config: schemaConfig,
    };
  }, [form, headers, queryParams, authConfig, userId, schemaConfig]);

  const runAction = async (kind) => {
    setLoading(true);
    setError('');
    try {
      const endpoint = kind === 'test'
        ? '/analytics/api/rest/connections/test'
        : kind === 'preview'
          ? '/analytics/api/rest/connections/preview'
          : '/analytics/api/rest/connections/save';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      if (kind === 'test') setTestResult(data);
      if (kind === 'preview') {
        setPreview(data);
        if (data.schema_config) setSchemaConfig(data.schema_config);
      }
      if (kind === 'save') {
        window.dispatchEvent(new CustomEvent('analytics-api-connection-saved', { detail: data }));
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
      <div className="restapi-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="restapi-header">
          <Globe size={18} className="restapi-header-icon" />
          <h3>REST API Connection</h3>
          <button type="button" className="restapi-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="restapi-body">
          <p className="restapi-help">Paste an API URL — preview builds a chart-ready schema from the response.</p>

          <div className="restapi-grid">
            <Field label="Connection name" required>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="My API" />
            </Field>
            <Field label="API URL" required>
              <input value={form.base_url} onChange={(e) => setForm((p) => ({ ...p, base_url: e.target.value }))} placeholder="https://api.example.com/data" />
            </Field>
          </div>

          <div className="restapi-grid restapi-grid--3">
            <Field label="Endpoint">
              <input value={form.endpoint} onChange={(e) => setForm((p) => ({ ...p, endpoint: e.target.value }))} placeholder="Optional path" />
            </Field>
            <Field label="Method">
              <select value={form.http_method} onChange={(e) => setForm((p) => ({ ...p, http_method: e.target.value }))}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Auth">
              <select value={form.auth_type} onChange={(e) => setForm((p) => ({ ...p, auth_type: e.target.value }))}>
                {AUTH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <KeyValueRows
            title="Headers"
            rows={headers}
            onAdd={() => setHeaders((p) => [...p, { key: '', value: '' }])}
            onRemove={(idx) => setHeaders((p) => p.filter((_, i) => i !== idx))}
            onChange={(idx, key, value) => setHeaders((p) => p.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))}
          />
          <KeyValueRows
            title="Query params"
            rows={queryParams}
            onAdd={() => setQueryParams((p) => [...p, { key: '', value: '' }])}
            onRemove={(idx) => setQueryParams((p) => p.filter((_, i) => i !== idx))}
            onChange={(idx, key, value) => setQueryParams((p) => p.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))}
          />

          <div className="restapi-grid">
            <Field label="Refresh">
              <select value={form.refresh_interval} onChange={(e) => setForm((p) => ({ ...p, refresh_interval: e.target.value }))}>
                <option value="manual">Manual</option>
                <option value="1 min">1 min</option>
                <option value="5 mins">5 mins</option>
                <option value="15 mins">15 mins</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </Field>
            {form.auth_type === 'api_key' && (
              <>
                <Field label="Key name" required>
                  <input placeholder="X-API-Key" onChange={(e) => setAuthConfig((p) => ({ ...p, api_key_name: e.target.value }))} />
                </Field>
                <Field label="Key value" required>
                  <input placeholder="••••••" onChange={(e) => setAuthConfig((p) => ({ ...p, api_key_value: e.target.value }))} />
                </Field>
              </>
            )}
            {form.auth_type === 'bearer' && (
              <Field label="Bearer token" className="restapi-field--full" required>
                <input placeholder="Token" onChange={(e) => setAuthConfig((p) => ({ ...p, token: e.target.value }))} />
              </Field>
            )}
            {form.auth_type === 'basic' && (
              <>
                <Field label="Username" required>
                  <input onChange={(e) => setAuthConfig((p) => ({ ...p, username: e.target.value }))} />
                </Field>
                <Field label="Password" required>
                  <input type="password" onChange={(e) => setAuthConfig((p) => ({ ...p, password: e.target.value }))} />
                </Field>
              </>
            )}
          </div>

          <Field label="Request body (JSON)" className="restapi-field--full">
            <textarea
              rows={3}
              value={form.request_body}
              onChange={(e) => setForm((p) => ({ ...p, request_body: e.target.value }))}
            />
          </Field>

          {error && <div className="restapi-error">{error}</div>}
          {testResult?.success && (
            <div className="restapi-info">Test OK — {testResult.status_code} · {testResult.response_time}ms</div>
          )}

          <SchemaEditor schemaConfig={schemaConfig} onChange={setSchemaConfig} />

          {preview?.rows && (
            <div className="restapi-preview-wrap">
              <div className="restapi-preview-title">Preview · {preview.row_count} rows</div>
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
        </div>

        <footer className="restapi-footer">
          <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="button" onClick={() => runAction('test')} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : null} Test
          </button>
          <button type="button" onClick={() => runAction('preview')} disabled={loading}>Preview</button>
          <button type="button" className="primary" onClick={() => runAction('save')} disabled={loading}>Save</button>
        </footer>
      </div>
    </div>
  );
}
