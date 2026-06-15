import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, TestTube, Trash2, CheckCircle, XCircle, AlertCircle,
  Loader2, Database, Link2,
} from 'lucide-react';
import dataManagementApi from '../services/dataManagementApi';
import './BIDataSourceSettings.css';

const SOURCE_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'rest_api', label: 'REST API' },
  { value: 'csv', label: 'CSV' },
  { value: 'excel', label: 'Excel' },
  { value: 'google_sheets', label: 'Google Sheets' },
];

const HEALTH_ICONS = {
  connected: <CheckCircle size={14} className="health-connected" />,
  disconnected: <XCircle size={14} className="health-disconnected" />,
  auth_failed: <AlertCircle size={14} className="health-auth" />,
  timeout: <AlertCircle size={14} className="health-timeout" />,
  permission_error: <AlertCircle size={14} className="health-permission" />,
};

const Field = ({ label, children, className = '' }) => (
  <label className={`bi-ds-field ${className}`}>
    <span>{label}</span>
    {children}
  </label>
);

const BIDataSourceSettings = ({ isOpen, onClose, fileId }) => {
  const [datasources, setDatasources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [tables, setTables] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const data = await dataManagementApi.listDatasources(fileId);
      setDatasources(data.datasources || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isOpen, fileId]);

  useEffect(() => { load(); }, [load]);

  const selectDs = async (ds) => {
    setShowAdd(false);
    setSelected(ds);
    setTestResult(null);
    setTables([]);
    setError('');
    try {
      const full = await fetch(`/analytics/api/data/datasources/${ds.id}`).then((r) => r.json());
      setForm({
        name: full.name,
        source_type: full.source_type,
        ssl_enabled: full.ssl_enabled,
        ...(full.connection_config || {}),
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const startAdd = () => {
    setShowAdd(true);
    setSelected(null);
    setTestResult(null);
    setTables([]);
    setError('');
    setForm({ source_type: 'postgresql', ssl_enabled: true });
  };

  const handleTest = async () => {
    if (!selected) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await dataManagementApi.testDatasource(selected.id);
      setTestResult(result);
      setTables(result.tables || []);
      load();
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await dataManagementApi.updateDatasource(selected.id, {
        name: form.name,
        connection_config: {
          host: form.host,
          port: form.port,
          database: form.database,
          username: form.username,
          schema: form.schema,
          base_url: form.base_url,
        },
        password: form.password || undefined,
        ssl_enabled: form.ssl_enabled,
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreate = async () => {
    try {
      await dataManagementApi.createDatasource({
        file_id: fileId,
        name: form.name || 'New Datasource',
        source_type: form.source_type || 'postgresql',
        connection_config: {
          host: form.host || 'localhost',
          port: form.port || 5432,
          database: form.database || '',
          username: form.username || '',
          schema: form.schema || 'public',
          base_url: form.base_url || '',
        },
        password: form.password,
        ssl_enabled: form.ssl_enabled !== false,
      });
      setShowAdd(false);
      setForm({});
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this datasource?')) return;
    await dataManagementApi.deleteDatasource(id);
    setSelected(null);
    load();
  };

  const isDbType = !['csv', 'excel', 'rest_api'].includes(form.source_type);

  if (!isOpen) return null;

  return (
    <div className="bi-ds-overlay" role="dialog" aria-modal="true">
      <div className="bi-ds-panel">
        <header className="bi-ds-header">
          <Database size={18} />
          <h2>Data Source Settings</h2>
          <button type="button" className="bi-ds-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {error && <div className="bi-ds-error">{error}</div>}

        <div className="bi-ds-body">
          <aside className="bi-ds-list">
            <button type="button" className="bi-ds-add-btn" onClick={startAdd}>
              <Plus size={14} /> Add connection
            </button>
            {loading ? (
              <div className="bi-ds-loading"><Loader2 size={20} className="spin" /></div>
            ) : (
              datasources.map((ds) => (
                <button
                  key={ds.id}
                  type="button"
                  className={`bi-ds-item ${selected?.id === ds.id ? 'active' : ''}`}
                  onClick={() => selectDs(ds)}
                >
                  {HEALTH_ICONS[ds.health_status] || HEALTH_ICONS.disconnected}
                  <div>
                    <div className="bi-ds-item-name">{ds.name}</div>
                    <div className="bi-ds-item-type">{ds.source_type}</div>
                  </div>
                </button>
              ))
            )}
          </aside>

          <main className="bi-ds-detail">
            {showAdd || selected ? (
              <>
                <p className="bi-ds-section-label">
                  {showAdd ? 'New connection' : 'Connection details'}
                </p>

                <div className="bi-ds-form-grid">
                  <Field label="Name">
                    <input
                      value={form.name || ''}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="My database"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={form.source_type || 'postgresql'}
                      onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                    >
                      {SOURCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </Field>

                  {isDbType && (
                    <>
                      <Field label="Host">
                        <input
                          value={form.host || ''}
                          onChange={(e) => setForm({ ...form, host: e.target.value })}
                          placeholder="localhost"
                        />
                      </Field>
                      <Field label="Port">
                        <input
                          type="number"
                          value={form.port || ''}
                          onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                          placeholder="5432"
                        />
                      </Field>
                      <Field label="Database">
                        <input
                          value={form.database || ''}
                          onChange={(e) => setForm({ ...form, database: e.target.value })}
                        />
                      </Field>
                      <Field label="Schema">
                        <input
                          value={form.schema || ''}
                          onChange={(e) => setForm({ ...form, schema: e.target.value })}
                          placeholder="public"
                        />
                      </Field>
                      <Field label="Username">
                        <input
                          value={form.username || ''}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                        />
                      </Field>
                      <Field label="Password">
                        <input
                          type="password"
                          value={form.password || ''}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          placeholder="••••••••"
                        />
                      </Field>
                    </>
                  )}

                  {form.source_type === 'rest_api' && (
                    <Field label="Base URL" className="bi-ds-full">
                      <input
                        value={form.base_url || ''}
                        onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                        placeholder="https://api.example.com"
                      />
                    </Field>
                  )}

                  {isDbType && (
                    <div className="bi-ds-toggle-row">
                      <input
                        type="checkbox"
                        id="ds-ssl"
                        checked={form.ssl_enabled !== false}
                        onChange={(e) => setForm({ ...form, ssl_enabled: e.target.checked })}
                      />
                      <span>Enable SSL</span>
                    </div>
                  )}
                </div>

                <div className="bi-ds-actions">
                  {selected && (
                    <>
                      <button type="button" onClick={handleTest} disabled={testing}>
                        {testing ? <Loader2 size={14} className="spin" /> : <TestTube size={14} />}
                        Test connection
                      </button>
                      <button type="button" onClick={handleSave}>Save</button>
                      <button type="button" className="bi-ds-danger" onClick={() => handleDelete(selected.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                  {showAdd && (
                    <button type="button" className="bi-ds-primary" onClick={handleCreate}>
                      Create connection
                    </button>
                  )}
                </div>

                {testResult && (
                  <div className={`bi-ds-test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {testResult.message}
                  </div>
                )}

                {tables.length > 0 && (
                  <div className="bi-ds-tables">
                    <h4>Tables & views · {tables.length}</h4>
                    <ul>
                      {tables.slice(0, 30).map((t) => (
                        <li key={t.name}>
                          <span>{t.name}</span>
                          <span className="bi-ds-table-type">{t.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="bi-ds-empty">
                <Link2 size={32} />
                <span>Select a connection or add a new one</span>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default BIDataSourceSettings;
