import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Save, SlidersHorizontal, Loader2 } from 'lucide-react';
import dataManagementApi from '../services/dataManagementApi';
import './BIParameterManager.css';

const PARAM_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi Select' },
];

const Field = ({ label, children, className = '' }) => (
  <label className={`bi-param-field ${className}`}>
    <span>{label}</span>
    {children}
  </label>
);

const BIParameterManager = ({ isOpen, onClose, fileId, onParametersChanged }) => {
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    if (!isOpen || !fileId) return;
    setLoading(true);
    try {
      const data = await dataManagementApi.listParameters(fileId);
      setParameters(data.parameters || []);
    } finally {
      setLoading(false);
    }
  }, [isOpen, fileId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    await dataManagementApi.createParameter(fileId, {
      name: form.name,
      display_name: form.display_name || form.name,
      param_type: form.param_type || 'text',
      default_value: form.default_value,
      current_value: form.current_value ?? form.default_value,
      options: form.options ? form.options.split(',').map((s) => s.trim()) : [],
      is_required: form.is_required || false,
    });
    setEditing(null);
    setForm({});
    load();
    onParametersChanged?.();
  };

  const handleUpdateValue = async (param) => {
    await dataManagementApi.updateParameter(param.id, { current_value: param.current_value });
    onParametersChanged?.();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this parameter?')) return;
    await dataManagementApi.deleteParameter(id);
    load();
    onParametersChanged?.();
  };

  const startNew = () => {
    setEditing('new');
    setForm({ param_type: 'text' });
  };

  const hasOptions = ['dropdown', 'multi_select'].includes(form.param_type);

  if (!isOpen) return null;

  return (
    <div className="bi-param-overlay" role="dialog" aria-modal="true">
      <div className="bi-param-panel">
        <header className="bi-param-header">
          <SlidersHorizontal size={18} className="bi-param-icon" />
          <h2>Edit Parameters</h2>
          <button type="button" className="bi-param-add-btn" onClick={startNew}>
            <Plus size={14} /> New parameter
          </button>
          <button type="button" className="bi-param-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="bi-param-body">
          {editing === 'new' && (
            <div className={`bi-param-form${hasOptions ? ' has-options' : ''}`}>
              <Field label="Name">
                <input
                  placeholder="Parameter name"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Type">
                <select
                  value={form.param_type || 'text'}
                  onChange={(e) => setForm({ ...form, param_type: e.target.value })}
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default value">
                <input
                  placeholder="Optional"
                  value={form.default_value || ''}
                  onChange={(e) => setForm({ ...form, default_value: e.target.value })}
                />
              </Field>
              {hasOptions && (
                <Field label="Options" className="full">
                  <input
                    placeholder="Comma-separated values"
                    value={form.options || ''}
                    onChange={(e) => setForm({ ...form, options: e.target.value })}
                  />
                </Field>
              )}
              <button type="button" className="bi-param-create" onClick={handleCreate}>
                Create
              </button>
            </div>
          )}

          {loading ? (
            <div className="bi-param-loading">
              <Loader2 size={22} className="bi-param-spin" />
            </div>
          ) : parameters.length === 0 ? (
            <div className="bi-param-empty">
              <SlidersHorizontal size={28} />
              <span>No parameters yet — add one to get started</span>
            </div>
          ) : (
            <>
              <div className="bi-param-list-header">
                <span>Name</span>
                <span>Type</span>
                <span>Current value</span>
                <span>Default</span>
                <span />
              </div>
              {parameters.map((p) => (
                <div key={p.id} className="bi-param-row">
                  <span className="bi-param-name">{p.display_name || p.name}</span>
                  <span className="bi-param-type">{p.param_type.replace('_', ' ')}</span>
                  <div>
                    {p.param_type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={!!p.current_value}
                        onChange={(e) => {
                          const updated = { ...p, current_value: e.target.checked };
                          setParameters((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
                        }}
                      />
                    ) : p.param_type === 'dropdown' ? (
                      <select
                        value={p.current_value ?? ''}
                        onChange={(e) => {
                          const updated = { ...p, current_value: e.target.value };
                          setParameters((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
                        }}
                      >
                        {(p.options || []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={p.param_type === 'number' ? 'number' : p.param_type === 'date' ? 'date' : 'text'}
                        value={p.current_value ?? ''}
                        onChange={(e) => {
                          const updated = { ...p, current_value: e.target.value };
                          setParameters((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
                        }}
                      />
                    )}
                  </div>
                  <span className="bi-param-default">{String(p.default_value ?? '—')}</span>
                  <div className="bi-param-actions">
                    <button type="button" title="Save value" onClick={() => handleUpdateValue(p)}>
                      <Save size={14} />
                    </button>
                    <button
                      type="button"
                      className="bi-param-delete"
                      title="Delete"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BIParameterManager;
