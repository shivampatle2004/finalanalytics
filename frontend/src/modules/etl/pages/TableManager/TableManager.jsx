import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Plus, RefreshCw, Trash2, Eye, Code2,
  ChevronRight, AlertTriangle, CheckCircle, X, Play, Table,
  Layers, HardDrive, Search, Cable, Hash, BarChart3, PieChart,
  Shield, Clock, Activity
} from 'lucide-react';
import { api } from '../../services/api';
import './TableManager.css';

// ── Draggable Table Wrapper ───────────────────────────────────────────────────
function DraggableTableWrapper({ children }) {
  const scrollRef = useRef(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const handleMouseDown = (e) => { setIsDown(true); if (!scrollRef.current) return; setStartX(e.pageX - scrollRef.current.offsetLeft); setScrollLeft(scrollRef.current.scrollLeft); };
  const handleMouseLeave = () => setIsDown(false);
  const handleMouseUp = () => setIsDown(false);
  const handleMouseMove = (e) => { if (!isDown || !scrollRef.current) return; e.preventDefault(); const x = e.pageX - scrollRef.current.offsetLeft; scrollRef.current.scrollLeft = scrollLeft - (x - startX) * 1.5; };
  return (
    <div className="table-responsive-wrapper" ref={scrollRef}
      onMouseDown={handleMouseDown} onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
      {children}
    </div>
  );
}

// ── Schema View ──
function SchemaView({ tableName }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!tableName) return;
    const load = async () => {
      setLoading(true); setError(null);
      try { setSchema(await api.getTableSchema(tableName)); }
      catch (e) { setError(e.response?.data?.detail || e.message); }
      finally { setLoading(false); }
    };
    load();
  }, [tableName]);
  if (loading) return <div className="tm-status"><div className="catalog-spinner" /> Loading schema...</div>;
  if (error) return <div className="tm-status error">Error: {error}</div>;
  if (!schema) return null;
  return (
    <div className="schema-view">
      <div className="schema-header"><Table size={16} /><span>{tableName}</span><span className="col-count">{schema.columns.length} columns</span></div>
      <DraggableTableWrapper>
        <table className="schema-table">
          <thead><tr><th>Column</th><th>Type</th><th>Nullable</th><th>Default</th></tr></thead>
          <tbody>{schema.columns.map(col => (
            <tr key={col.column_name}>
              <td className="col-name">{col.column_name}</td>
              <td className="col-type">{col.data_type}</td>
              <td><span className={`nullable-badge ${col.is_nullable === 'YES' ? 'yes' : 'no'}`}>{col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'}</span></td>
              <td className="col-default">{col.column_default || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

// ── Statistics View ──
function StatisticsView({ tableName }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tableName) return;
    const load = async () => {
      setLoading(true); setError(null);
      try { setStats(await api.getTableStatistics(tableName)); }
      catch (e) { setError(e.response?.data?.detail || e.message); }
      finally { setLoading(false); }
    };
    load();
  }, [tableName]);

  if (loading) return <div className="tm-status"><div className="catalog-spinner" /> Analyzing data quality...</div>;
  if (error) return <div className="tm-status error">Error: {error}</div>;
  if (!stats) return null;

  const completenessColor = stats.completeness_score >= 90 ? 'var(--success)' : stats.completeness_score >= 70 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="stats-view">
      {/* Summary Cards */}
      <div className="stats-summary">
        <div className="stats-card">
          <span className="stats-card-label">Total Rows</span>
          <span className="stats-card-value">{stats.total_rows.toLocaleString()}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-label">Columns</span>
          <span className="stats-card-value">{stats.total_columns}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-label">Duplicate Groups</span>
          <span className="stats-card-value" style={{ color: stats.duplicate_groups > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {stats.duplicate_groups}
          </span>
        </div>
        <div className="stats-card highlight">
          <span className="stats-card-label">Completeness</span>
          <span className="stats-card-value" style={{ color: completenessColor }}>
            {stats.completeness_score}%
          </span>
        </div>
      </div>

      {/* Per-Column Quality */}
      <div className="stats-section-title">
        <BarChart3 size={15} /> Column Quality
      </div>
      <DraggableTableWrapper>
        <table className="schema-table stats-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nulls</th>
              <th>Null %</th>
              <th>Fill Rate</th>
              <th>Distinct</th>
            </tr>
          </thead>
          <tbody>
            {stats.column_stats.map(col => (
              <tr key={col.column}>
                <td className="col-name">{col.column}</td>
                <td className="col-type">{col.type}</td>
                <td style={{ color: col.null_count > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {col.null_count.toLocaleString()}
                </td>
                <td>
                  <span className={`pct-badge ${col.null_percent > 20 ? 'danger' : col.null_percent > 0 ? 'warn' : 'ok'}`}>
                    {col.null_percent}%
                  </span>
                </td>
                <td>
                  <div className="fill-bar-wrapper">
                    <div 
                      className={`fill-bar ${col.fill_rate >= 90 ? 'success' : col.fill_rate >= 70 ? 'warning' : 'danger'}`} 
                      style={{ width: `${col.fill_rate}%` }} 
                    />
                    <span className="fill-text">{col.fill_rate}%</span>
                  </div>
                </td>
                <td className="col-default">{col.distinct_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

// ── Preview View ──
function PreviewView({ tableName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!tableName) return;
    const load = async () => {
      setLoading(true);
      try { setData(await api.previewTable(tableName, 50)); }
      catch (e) { setError(e.response?.data?.detail || e.message); }
      finally { setLoading(false); }
    };
    load();
  }, [tableName]);
  if (loading) return <div className="tm-status"><div className="catalog-spinner" /> Loading preview...</div>;
  if (error) return <div className="tm-status error">Error: {error}</div>;
  if (!data || data.rows.length === 0) return <div className="tm-status">No data in table.</div>;
  return (
    <div className="preview-view">
      <div className="preview-header"><span>Showing {data.row_count} rows</span></div>
      <DraggableTableWrapper>
        <table className="data-table">
          <thead><tr>{data.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, i) => (
            <tr key={i}>{data.columns.map(c => (
              <td key={c}>{row[c] === null || row[c] === undefined ? <em className="null-val">null</em> : String(row[c])}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </DraggableTableWrapper>
    </div>
  );
}

// ── Quality Rules View ──
function QualityRulesView({ tableName }) {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [colName, setColName] = useState('');
  const [ruleType, setRuleType] = useState('not_null');
  const [severity, setSeverity] = useState('warning');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState({});

  // Schema columns for dropdown
  const [schemaColumns, setSchemaColumns] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, historyRes, schemaRes] = await Promise.all([
        api.getQualityRules(tableName),
        api.getValidationHistory(tableName),
        api.getTableSchema(tableName).catch(() => null)
      ]);
      setRules(rulesRes || []);
      setHistory(historyRes || []);
      if (schemaRes && schemaRes.columns) {
        setSchemaColumns(schemaRes.columns.map(c => c.column_name));
      }
    } catch (e) {
      console.error('Failed to load quality rules data', e);
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      await api.createQualityRule({
        table_name: tableName,
        column_name: colName || null,
        rule_type: ruleType,
        config: config,
        severity: severity,
        description: description || null
      });
      setShowAddModal(false);
      // Reset form
      setColName('');
      setRuleType('not_null');
      setSeverity('warning');
      setDescription('');
      setConfig({});
      loadData();
    } catch (err) {
      alert('Failed to create rule: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await api.deleteQualityRule(id);
      loadData();
    } catch (err) {
      alert('Failed to delete rule: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRunValidation = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateTableQuality(tableName);
      setValidationResult(res);
      loadData();
    } catch (err) {
      alert('Validation run failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <div className="tm-status"><div className="catalog-spinner" /> Loading quality framework...</div>;

  return (
    <div className="quality-rules-view">
      <div className="quality-actions-header">
        <div className="quality-header-title">
          <Shield size={15} style={{ color: 'var(--accent)' }} />
          <span>Active Quality Rules ({rules.length})</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="tm-btn secondary small" onClick={handleRunValidation} disabled={validating || rules.length === 0} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
            {validating ? 'Validating...' : <><Play size={12} /> Run Validation</>}
          </button>
          <button className="tm-btn primary small" onClick={() => setShowAddModal(true)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
            <Plus size={12} /> Add Rule
          </button>
        </div>
      </div>

      {validationResult && (
        <div className={`validation-summary-card ${validationResult.failed > 0 ? 'failed' : 'passed'}`}>
          <div className="summary-card-header">
            {validationResult.failed > 0 ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span>Validation Summary: <strong>{validationResult.score}% Passed</strong></span>
            <button className="summary-close-btn" onClick={() => setValidationResult(null)}><X size={12} /></button>
          </div>
          <div className="summary-card-body">
            <span>Rules Evaluated: {validationResult.total_rules}</span>
            <span>Passed: {validationResult.passed}</span>
            <span>Failed: {validationResult.failed}</span>
            {validationResult.errors > 0 && <span className="error-pill">{validationResult.errors} Errors</span>}
            {validationResult.warnings > 0 && <span className="warning-pill">{validationResult.warnings} Warnings</span>}
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="quality-empty-state">
          <Shield size={32} style={{ opacity: 0.15, marginBottom: '8px' }} />
          <p>No quality rules configured for <strong>{tableName}</strong> yet.</p>
          <button className="tm-btn secondary small" style={{ marginTop: '8px', padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setShowAddModal(true)}>
            <Plus size={12} /> Configure First Rule
          </button>
        </div>
      ) : (
        <div className="rules-grid">
          {rules.map(rule => (
            <div key={rule.id} className={`rule-card severity-${rule.severity}`}>
              <div className="rule-card-header">
                <div className="rule-type-badge">{rule.rule_type.replace('_', ' ')}</div>
                <span className={`severity-badge ${rule.severity}`}>{rule.severity}</span>
                <button className="rule-delete-btn" onClick={() => handleDeleteRule(rule.id)}><Trash2 size={12} /></button>
              </div>
              <div className="rule-card-body">
                <div className="rule-target">
                  <strong>Target:</strong> {rule.column_name ? <code>{rule.column_name}</code> : <em className="global-target">Table level</em>}
                </div>
                {rule.description && <div className="rule-desc">{rule.description}</div>}
                {Object.keys(rule.config || {}).length > 0 && (
                  <div className="rule-config-preview">
                    <strong>Config:</strong> <code>{JSON.stringify(rule.config)}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Runs History */}
      <div className="quality-history-section">
        <div className="section-title-light"><RefreshCw size={12} /> Validation Run History</div>
        {history.length === 0 ? (
          <div className="quality-history-empty">No validation history found. Run checks to populate history.</div>
        ) : (
          <DraggableTableWrapper>
            <table className="schema-table stats-table quality-history-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Actual</th>
                  <th>Expected</th>
                  <th>Details</th>
                  <th>Executed At</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => (
                  <tr key={item.id} className={item.passed ? 'row-passed' : 'row-failed'}>
                    <td>
                      <span className={`status-pill ${item.passed ? 'pass' : 'fail'}`}>
                        {item.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    <td><span className={`severity-badge ${item.severity}`}>{item.severity}</span></td>
                    <td><code>{item.actual_value || '—'}</code></td>
                    <td><code>{item.expected_value || '—'}</code></td>
                    <td className="detail-cell">{item.detail || '—'}</td>
                    <td>{new Date(item.executed_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DraggableTableWrapper>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3><Plus size={16} /> Add Quality Rule</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateRule}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                <div className="form-group-dq">
                  <label>Rule Scope / Column</label>
                  <select value={colName} onChange={e => setColName(e.target.value)} className="dq-input">
                    <option value="">Table-level (All Columns)</option>
                    {schemaColumns.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group-dq">
                  <label>Validation Rule Type</label>
                  <select value={ruleType} onChange={e => {
                    setRuleType(e.target.value);
                    setConfig({}); // Clear config on type change
                  }} className="dq-input">
                    <option value="not_null">Not Null (No empty values)</option>
                    <option value="unique">Unique Constraint (No duplicates)</option>
                    <option value="in_range">Value In Range (Numeric limits)</option>
                    <option value="regex">Pattern Match (Regular expression)</option>
                    <option value="row_count_min">Minimum Row Count</option>
                    <option value="custom_sql">Custom SQL Validation</option>
                  </select>
                </div>

                {/* Conditional Configuration Fields */}
                {ruleType === 'in_range' && (
                  <div className="dq-config-subgroup">
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Min Value</label>
                        <input type="number" step="any" placeholder="None" onChange={e => setConfig(prev => ({ ...prev, min: e.target.value !== '' ? Number(e.target.value) : undefined }))} className="dq-input" style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Max Value</label>
                        <input type="number" step="any" placeholder="None" onChange={e => setConfig(prev => ({ ...prev, max: e.target.value !== '' ? Number(e.target.value) : undefined }))} className="dq-input" style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                      </div>
                    </div>
                  </div>
                )}

                {ruleType === 'regex' && (
                  <div className="dq-config-subgroup">
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Regex Pattern</label>
                    <input type="text" placeholder="e.g. ^[0-9]{5}$" required onChange={e => setConfig({ pattern: e.target.value })} className="dq-input" style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                  </div>
                )}

                {ruleType === 'row_count_min' && (
                  <div className="dq-config-subgroup">
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Minimum Row Count Threshold</label>
                    <input type="number" min="1" placeholder="e.g. 1" required onChange={e => setConfig({ min_rows: Number(e.target.value) })} className="dq-input" style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                  </div>
                )}

                {ruleType === 'custom_sql' && (
                  <div className="dq-config-subgroup" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SQL Validation Query</label>
                    <textarea placeholder={`SELECT COUNT(*) FROM "${tableName}" WHERE val < 0`} style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '0.75rem', padding: '6px' }} required onChange={e => setConfig(prev => ({ ...prev, sql: e.target.value }))} className="dq-input" />
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Failure Threshold (SQL result &gt; this is failure)</label>
                    <input type="number" placeholder="e.g. 0" defaultValue="0" onChange={e => setConfig(prev => ({ ...prev, threshold: Number(e.target.value) }))} className="dq-input" style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                  </div>
                )}

                <div className="form-group-dq">
                  <label>Severity Level</label>
                  <select value={severity} onChange={e => setSeverity(e.target.value)} className="dq-input">
                    <option value="warning">Warning (Logs failure but job succeeds)</option>
                    <option value="error">Error (Fails job and stops pipeline execution)</option>
                  </select>
                </div>

                <div className="form-group-dq">
                  <label>Description / Notes</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Why is this rule needed?" className="dq-input" />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '10px 16px' }}>
                <button type="button" className="tm-btn secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="tm-btn primary">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SQL Editor ──
function SQLEditor({ initialSQL = '', onRefresh }) {
  const [sql, setSql] = useState(initialSQL);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setSql(initialSQL); }, [initialSQL]);
  const runSQL = async () => {
    if (!sql.trim()) return; setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.executeSQL(sql); setResult(res);
      if (onRefresh && (sql.trim().toUpperCase().startsWith('CREATE') || sql.trim().toUpperCase().startsWith('DROP') || sql.trim().toUpperCase().startsWith('ALTER'))) onRefresh();
    } catch (e) { setError(e.response?.data?.detail || e.message); } finally { setRunning(false); }
  };
  return (
    <div className="sql-editor">
      <div className="sql-toolbar">
        <span className="sql-label"><Code2 size={14} /> SQL Editor</span>
        <button className="run-btn" onClick={runSQL} disabled={running || !sql.trim()}>
          {running ? 'Running...' : <><Play size={14} /> Run</>}
        </button>
      </div>
      <textarea className="sql-textarea" value={sql} onChange={e => setSql(e.target.value)}
        placeholder={`SELECT * FROM my_table LIMIT 10;`} spellCheck={false}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSQL(); } if (e.key === 'Tab') { e.preventDefault(); setSql(prev => prev + '  '); } }}
      />
      <div className="sql-hint">Ctrl+Enter to run · Tab for indent</div>
      {error && <div className="sql-error"><AlertTriangle size={14} /> {error}</div>}
      {result && (
        <div className="sql-result">
          {result.type === 'select' ? (
            <><div className="result-meta"><CheckCircle size={14} /> {result.row_count} row{result.row_count !== 1 ? 's' : ''} returned</div>
            {result.rows.length > 0 && (<DraggableTableWrapper><table className="data-table">
              <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, i) => (<tr key={i}>{result.columns.map(c => (<td key={c}>{row[c] === null ? <em className="null-val">null</em> : String(row[c])}</td>))}</tr>))}</tbody>
            </table></DraggableTableWrapper>)}</>
          ) : (<div className="result-meta"><CheckCircle size={14} /> Success — {result.rows_affected ?? 0} rows affected</div>)}
        </div>
      )}
    </div>
  );
}

// ── Create Table Modal ──
function CreateTableModal({ onClose, onCreated }) {
  const [sql, setSql] = useState(`CREATE TABLE my_table (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleCreate = async () => { setLoading(true); setError(null); try { await api.createTable(sql); onCreated(); onClose(); } catch (e) { setError(e.response?.data?.detail || e.message); } finally { setLoading(false); } };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header"><h3><Plus size={16} /> Create New Table</h3><button className="modal-close" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body">
          <p className="modal-hint">Write a CREATE TABLE SQL statement below:</p>
          <textarea className="sql-textarea" value={sql} onChange={e => setSql(e.target.value)} style={{ minHeight: '180px' }} spellCheck={false} />
          {error && <div className="sql-error"><AlertTriangle size={14} /> {error}</div>}
        </div>
        <div className="modal-footer">
          <button className="tm-btn secondary" onClick={onClose}>Cancel</button>
          <button className="tm-btn primary" onClick={handleCreate} disabled={loading}>{loading ? 'Creating...' : <><CheckCircle size={14} /> Create Table</>}</button>
        </div>
      </div>
    </div>
  );
}

// ── Drop Confirm ──
function DropModal({ tableName, onClose, onDropped }) {
  const [loading, setLoading] = useState(false);
  const handleDrop = async () => { setLoading(true); try { await api.dropTable(tableName); onDropped(); onClose(); } catch (e) { alert(e.response?.data?.detail || e.message); } finally { setLoading(false); } };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header"><h3><AlertTriangle size={16} /> Drop Table</h3><button className="modal-close" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body"><p>Are you sure you want to drop <strong>{tableName}</strong>? This action is <strong>irreversible</strong>.</p></div>
        <div className="modal-footer">
          <button className="tm-btn secondary" onClick={onClose}>Cancel</button>
          <button className="tm-btn danger" onClick={handleDrop} disabled={loading}>{loading ? 'Dropping...' : <><Trash2 size={14} /> Drop Table</>}</button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN DATA CATALOG ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function TableManager() {
  const [catalog, setCatalog] = useState({});
  const [totalTables, setTotalTables] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('schema');
  const [showCreate, setShowCreate] = useState(false);
  const [showDrop, setShowDrop] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [search, setSearch] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCatalog();
      setCatalog(data.catalog || {});
      setTotalTables(data.total_tables || 0);
      // Auto-expand all groups and schemas
      const groups = {}, schemas = {};
      Object.entries(data.catalog || {}).forEach(([g, gData]) => {
        groups[g] = true;
        Object.keys(gData.schemas || {}).forEach(s => { schemas[`${g}::${s}`] = true; });
      });
      setExpandedGroups(groups);
      setExpandedSchemas(schemas);
    } catch (e) {
      console.error('Failed to load catalog', e);
      try {
        const tables = await api.getDatabaseTables();
        setCatalog({ 'Local / Manual': { engine: null, schemas: { default: tables.map(t => ({ name: t, row_count: 0, column_count: 0 })) } } });
        setTotalTables(tables.length);
        setExpandedGroups({ 'Local / Manual': true });
        setExpandedSchemas({ 'Local / Manual::default': true });
      } catch (e2) { console.error('Fallback failed', e2); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const handleSelectTable = async (name) => {
    setSelectedTable(name);
    setActiveTab('schema');
    setMetaLoading(true);
    try { const meta = await api.getTableMetadata(name); setSelectedMeta(meta); }
    catch { setSelectedMeta(null); }
    finally { setMetaLoading(false); }
  };

  const handleDropped = () => {
    if (selectedTable === showDrop) { setSelectedTable(null); setSelectedMeta(null); }
    loadCatalog();
  };

  const toggleGroup = (g) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));
  const toggleSchema = (key) => setExpandedSchemas(prev => ({ ...prev, [key]: !prev[key] }));

  // Filter
  const getFilteredCatalog = () => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    const filtered = {};
    Object.entries(catalog).forEach(([group, data]) => {
      const filteredSchemas = {};
      Object.entries(data.schemas || {}).forEach(([schema, tables]) => {
        const matchingTables = tables.filter(t => t.name.toLowerCase().includes(q));
        if (matchingTables.length > 0) filteredSchemas[schema] = matchingTables;
      });
      if (Object.keys(filteredSchemas).length > 0 || group.toLowerCase().includes(q)) {
        filtered[group] = { ...data, schemas: Object.keys(filteredSchemas).length > 0 ? filteredSchemas : data.schemas };
      }
    });
    return filtered;
  };

  const filteredCatalog = getFilteredCatalog();

  // Count total tables across all schemas in a connector group
  const countGroupTables = (groupData) => {
    return Object.values(groupData.schemas || {}).reduce((sum, tables) => sum + tables.length, 0);
  };

  return (
    <div className="tm-container">
      {showCreate && <CreateTableModal onClose={() => setShowCreate(false)} onCreated={loadCatalog} />}
      {showDrop && <DropModal tableName={showDrop} onClose={() => setShowDrop(null)} onDropped={handleDropped} />}

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Data Catalog <span className="count-badge">{totalTables}</span></h1>
          <p>Browse schemas, inspect data quality, and run multi-connector queries.</p>
        </div>
        <div className="page-header-actions">
          <button className="tm-btn secondary" onClick={loadCatalog}><RefreshCw size={15} /> Refresh</button>
          <button className="tm-btn secondary" onClick={() => { setSelectedTable(null); setActiveTab('sql'); }}><Code2 size={15} /> SQL Editor</button>
          <button className="tm-btn primary" onClick={() => setShowCreate(true)}><Plus size={15} /> New Table</button>
        </div>
      </div>

      <div className="tm-body">
        {/* ── Left: Catalog Tree ── */}
        <div className="tm-sidebar">
          <div className="catalog-search">
            <Search size={14} />
            <input type="text" placeholder="Search tables..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="tm-status"><div className="catalog-spinner" /> Loading catalog...</div>
          ) : Object.keys(filteredCatalog).length === 0 ? (
            <div className="tm-status muted">No tables found</div>
          ) : (
            <div className="catalog-tree">
              {Object.entries(filteredCatalog).map(([connectorName, connectorData]) => (
                <div key={connectorName} className="catalog-group">
                  {/* Connector Level */}
                  <button className="catalog-group-header" onClick={() => toggleGroup(connectorName)}>
                    <motion.div animate={{ rotate: expandedGroups[connectorName] ? 90 : 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                      <ChevronRight size={14} />
                    </motion.div>
                    <Cable size={14} className="catalog-group-icon" />
                    <span className="catalog-group-name">{connectorName}</span>
                    <span className="catalog-group-count">{countGroupTables(connectorData)}</span>
                  </button>

                  <AnimatePresence>
                    {expandedGroups[connectorName] && (
                      <motion.div className="catalog-group-tables"
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>

                        {/* Schema Level */}
                        {Object.entries(connectorData.schemas || {}).map(([schemaName, tables]) => {
                          const schemaKey = `${connectorName}::${schemaName}`;
                          return (
                            <div key={schemaKey} className="catalog-schema-level">
                              <button className="catalog-schema-header" onClick={() => toggleSchema(schemaKey)}>
                                <motion.div animate={{ rotate: expandedSchemas[schemaKey] ? 90 : 0 }} transition={{ duration: 0.12 }} style={{ display: 'flex' }}>
                                  <ChevronRight size={11} />
                                </motion.div>
                                <Layers size={12} />
                                <span>{schemaName}</span>
                                <span className="catalog-schema-count">{tables.length}</span>
                              </button>

                              <AnimatePresence>
                                {expandedSchemas[schemaKey] && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                                    {/* Table Level */}
                                    {tables.map(table => (
                                      <button key={table.name}
                                        className={`catalog-table-item ${selectedTable === table.name ? 'active' : ''}`}
                                        onClick={() => handleSelectTable(table.name)}>
                                        <Table size={13} className="catalog-table-icon" />
                                        <span className="catalog-table-name">{table.name}</span>
                                        <span className="catalog-table-rows">
                                          {table.row_count > 0 ? `${table.row_count.toLocaleString()}` : ''}
                                        </span>
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail Panel ── */}
        <div className="tm-main">
          {!selectedTable && activeTab !== 'sql' ? (
            <div className="tm-empty">
              <Database size={48} />
              <h3>Select a table</h3>
              <p>Choose a table from the catalog to view its schema, data quality, or run SQL queries.</p>
              <button className="tm-btn primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Create First Table</button>
            </div>
          ) : !selectedTable && activeTab === 'sql' ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="catalog-meta-strip">
                <div className="catalog-meta-title">
                  <Code2 size={18} />
                  <h2>Global SQL Editor</h2>
                </div>
              </div>
              <div className="tm-tab-content">
                <SQLEditor initialSQL={`-- Write your SQL queries here\nSELECT * FROM information_schema.tables WHERE table_schema = 'public' LIMIT 20;`} onRefresh={loadCatalog} />
              </div>
            </div>
          ) : (
            <>
              {/* Metadata Strip */}
              <div className="catalog-meta-strip">
                <div className="catalog-meta-title">
                  <Table size={18} />
                  <h2>{selectedTable}</h2>
                  <button className="catalog-drop-btn" onClick={() => setShowDrop(selectedTable)} title="Drop table"><Trash2 size={14} /></button>
                </div>
                {selectedMeta && !metaLoading && (
                  <div className="catalog-meta-badges">
                    <span className="meta-badge"><Hash size={12} />{selectedMeta.row_count?.toLocaleString()} rows</span>
                    <span className="meta-badge"><Layers size={12} />{selectedMeta.column_count} columns</span>
                    {selectedMeta.size_bytes && <span className="meta-badge"><HardDrive size={12} />{formatBytes(selectedMeta.size_bytes)}</span>}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="tm-tabs">
                <button className={`tm-tab ${activeTab === 'schema' ? 'active' : ''}`} onClick={() => setActiveTab('schema')}><Table size={14} /> Schema</button>
                <button className={`tm-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}><Eye size={14} /> Preview</button>
                <button className={`tm-tab ${activeTab === 'statistics' ? 'active' : ''}`} onClick={() => setActiveTab('statistics')}><BarChart3 size={14} /> Statistics</button>
                <button className={`tm-tab ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}><Shield size={14} /> Quality Rules</button>
                <button className={`tm-tab ${activeTab === 'sql' ? 'active' : ''}`} onClick={() => setActiveTab('sql')}><Code2 size={14} /> SQL</button>
              </div>

              <div className="tm-tab-content">
                {activeTab === 'schema' && <SchemaView key={selectedTable} tableName={selectedTable} />}
                {activeTab === 'preview' && <PreviewView key={selectedTable} tableName={selectedTable} />}
                {activeTab === 'statistics' && <StatisticsView key={selectedTable} tableName={selectedTable} />}
                {activeTab === 'quality' && <QualityRulesView key={selectedTable} tableName={selectedTable} />}
                {activeTab === 'sql' && <SQLEditor key={`sql-${selectedTable}`} initialSQL={`SELECT * FROM "${selectedTable}" LIMIT 50;`} onRefresh={loadCatalog} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default TableManager;
