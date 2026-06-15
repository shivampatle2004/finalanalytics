import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Save, Lock, Variable, Loader2 } from 'lucide-react';
import dataManagementApi from '../services/dataManagementApi';
import './BIVariableManager.css';

const Field = ({ label, children }) => (
  <label className="bi-var-field">
    <span>{label}</span>
    {children}
  </label>
);

const BIVariableManager = ({ isOpen, onClose, fileId }) => {
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    if (!isOpen || !fileId) return;
    setLoading(true);
    try {
      const data = await dataManagementApi.listVariables(fileId);
      setVariables(data.variables || []);
    } finally {
      setLoading(false);
    }
  }, [isOpen, fileId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    await dataManagementApi.createVariable(fileId, {
      name: form.name,
      display_name: form.display_name || form.name,
      variable_type: 'custom',
      scope: 'report',
      expression: form.expression,
      current_value: form.current_value,
    });
    setShowAdd(false);
    setForm({});
    load();
  };

  const handleUpdate = async (v) => {
    await dataManagementApi.updateVariable(v.id, { current_value: v.current_value });
    load();
  };

  const startNew = () => {
    setShowAdd(true);
    setForm({});
  };

  if (!isOpen) return null;

  return (
    <div className="bi-var-overlay" role="dialog" aria-modal="true">
      <div className="bi-var-panel">
        <header className="bi-var-header">
          <Variable size={18} className="bi-var-icon" />
          <h2>Edit Variables</h2>
          <button type="button" className="bi-var-add-btn" onClick={startNew}>
            <Plus size={14} /> New variable
          </button>
          <button type="button" className="bi-var-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="bi-var-body">
          {showAdd && (
            <div className="bi-var-form">
              <Field label="Name">
                <input
                  placeholder="Variable name"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Expression">
                <input
                  placeholder="Optional"
                  value={form.expression || ''}
                  onChange={(e) => setForm({ ...form, expression: e.target.value })}
                />
              </Field>
              <Field label="Value">
                <input
                  placeholder="Initial value"
                  value={form.current_value || ''}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                />
              </Field>
              <button type="button" className="bi-var-create" onClick={handleCreate}>
                Create
              </button>
            </div>
          )}

          {loading ? (
            <div className="bi-var-loading">
              <Loader2 size={22} className="bi-var-spin" />
            </div>
          ) : variables.length === 0 ? (
            <div className="bi-var-empty">
              <Variable size={28} />
              <span>No variables yet — add one to get started</span>
            </div>
          ) : (
            <>
              <div className="bi-var-list-header">
                <span>Name</span>
                <span>Type</span>
                <span>Scope</span>
                <span>Expression</span>
                <span>Value</span>
                <span />
              </div>
              {variables.map((v) => (
                <div key={v.id} className={`bi-var-row${v.is_system ? ' system' : ''}`}>
                  <span className="bi-var-name">
                    {v.display_name || v.name}
                    {v.is_system && (
                      <Lock size={12} className="bi-var-lock" title="System variable" />
                    )}
                  </span>
                  <span className="bi-var-meta">{v.variable_type}</span>
                  <span className="bi-var-meta">{v.scope}</span>
                  <span className="bi-var-expr" title={v.expression || undefined}>
                    {v.expression || '—'}
                  </span>
                  <div>
                    {v.is_editable ? (
                      <input
                        value={v.current_value ?? ''}
                        onChange={(e) => setVariables((prev) => prev.map((x) => (
                          x.id === v.id ? { ...x, current_value: e.target.value } : x
                        )))}
                      />
                    ) : (
                      <span className="bi-var-readonly">{v.current_value ?? '(auto)'}</span>
                    )}
                  </div>
                  <div className="bi-var-actions">
                    {v.is_editable && (
                      <button type="button" onClick={() => handleUpdate(v)} title="Save">
                        <Save size={14} />
                      </button>
                    )}
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

export default BIVariableManager;
