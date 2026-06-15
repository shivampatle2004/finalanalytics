import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Undo2, Redo2, Save, Play, History, ChevronRight, ChevronUp, ChevronDown,
  Filter, ArrowUpDown, Copy, Trash2, Merge, Split, Replace, RefreshCw,
  Calculator, Group, Columns, Database, Loader2, Plus, Files, Eye, EyeOff,
} from 'lucide-react';
import queriesApi from '../services/queriesApi';
import './BIQueryEditor.css';

const TRANSFORM_ACTIONS = [
  { type: 'rename_column', label: 'Rename', icon: <Columns size={14} /> },
  { type: 'change_type', label: 'Change Type', icon: <Database size={14} /> },
  { type: 'remove_column', label: 'Remove', icon: <Trash2 size={14} /> },
  { type: 'duplicate_column', label: 'Duplicate', icon: <Copy size={14} /> },
  { type: 'merge_columns', label: 'Merge Columns', icon: <Merge size={14} /> },
  { type: 'split_column', label: 'Split Column', icon: <Split size={14} /> },
  { type: 'replace_values', label: 'Replace', icon: <Replace size={14} /> },
  { type: 'filter_rows', label: 'Filter', icon: <Filter size={14} /> },
  { type: 'sort_rows', label: 'Sort', icon: <ArrowUpDown size={14} /> },
  { type: 'remove_duplicates', label: 'Remove Duplicates', icon: <Copy size={14} /> },
  { type: 'remove_null_values', label: 'Remove Nulls', icon: <Trash2 size={14} /> },
  { type: 'group_by', label: 'Group By', icon: <Group size={14} /> },
  { type: 'calculated_column', label: 'Calculated Column', icon: <Calculator size={14} /> },
  { type: 'merge_join', label: 'Merge Queries', icon: <Merge size={14} /> },
  { type: 'append', label: 'Append Queries', icon: <Files size={14} /> },
];

const STEP_FORMS = {
  rename_column: ['column', 'new_name'],
  change_type: ['column', 'data_type'],
  remove_column: ['column'],
  duplicate_column: ['column', 'new_name'],
  filter_rows: ['column', 'operator', 'value'],
  sort_rows: ['column', 'ascending'],
  replace_values: ['column', 'old_value', 'new_value'],
  calculated_column: ['name', 'formula'],
  remove_duplicates: [],
  remove_null_values: ['column_optional'],
  merge_columns: ['columns_csv', 'separator', 'new_name'],
  split_column: ['column', 'separator', 'new_columns_csv'],
  group_by: ['group_columns_csv', 'aggregations_json'],
  merge_join: ['query_id', 'on', 'how'],
  append: ['query_id'],
};

const FIELD_LABELS = {
  query_id: 'Second query',
  on: 'Join column',
  how: 'Join type',
  column: 'Column',
  column_optional: 'Column (optional)',
  new_name: 'New name',
  data_type: 'Data type',
  operator: 'Operator',
  value: 'Value',
  ascending: 'Order',
  old_value: 'Find',
  new_value: 'Replace with',
  name: 'Name',
  formula: 'Formula',
  columns_csv: 'Columns',
  separator: 'Separator',
  new_columns_csv: 'New columns',
  group_columns_csv: 'Group columns',
  aggregations_json: 'Aggregations',
};

const BIQueryEditor = ({ isOpen, onClose, fileId, onApplied, mode = 'edit' }) => {
  const isEditMode = mode === 'edit';
  const [queries, setQueries] = useState([]);
  const [activeQueryId, setActiveQueryId] = useState(null);
  const [steps, setSteps] = useState([]);
  const [preview, setPreview] = useState({ columns: [], rows: [], total_rows: 0 });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeAction, setActiveAction] = useState(null);
  const [form, setForm] = useState({});
  const [offset, setOffset] = useState(0);
  const [selectedStep, setSelectedStep] = useState(-1);
  const [autoSaved, setAutoSaved] = useState(false);
  const [otherQueryColumns, setOtherQueryColumns] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const limit = 50;

  const activeQuery = queries.find((q) => q.id === activeQueryId);

  const loadPreview = useCallback(async (queryId, stepIdx = null) => {
    if (!queryId) return;
    const data = await queriesApi.preview(queryId, offset, limit, stepIdx != null && stepIdx >= 0 ? stepIdx : undefined);
    setPreview(data);
  }, [offset, limit]);

  const applyHistoryMeta = (data) => {
    const stepList = data?.steps || [];
    setSteps(stepList);
    setCanUndo(data?.can_undo ?? stepList.length > 0);
    setCanRedo(!!data?.can_redo);
    return stepList;
  };

  const loadQueryData = useCallback(async (queryId) => {
    if (!queryId) return;
    const stepsData = await queriesApi.getSteps(queryId);
    const stepList = applyHistoryMeta(stepsData);
    const idx = stepList.length > 0 ? stepList.length - 1 : -1;
    setSelectedStep(idx);
    await loadPreview(queryId, idx >= 0 ? idx : null);
  }, [loadPreview]);

  const loadAll = useCallback(async () => {
    if (!fileId || !isOpen) return;
    setLoading(true);
    setError('');
    try {
      await queriesApi.ensure(fileId);
      const data = await queriesApi.list(fileId);
      const list = data.queries || [];
      setQueries(list);
      const qid = list[0]?.id;
      setActiveQueryId(qid);
      if (qid) await loadQueryData(qid);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fileId, isOpen, loadQueryData]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (activeQueryId && isOpen) {
      loadPreview(activeQueryId, selectedStep >= 0 ? selectedStep : null);
    }
  }, [offset, activeQueryId, isOpen, selectedStep, loadPreview]);

  useEffect(() => {
    if (!form.query_id) {
      setOtherQueryColumns([]);
      return;
    }
    let cancelled = false;
    queriesApi.preview(form.query_id, 0, 1)
      .then((data) => {
        if (!cancelled) {
          setOtherQueryColumns((data.columns || []).map((c) => c.name));
        }
      })
      .catch(() => {
        if (!cancelled) setOtherQueryColumns([]);
      });
    return () => { cancelled = true; };
  }, [form.query_id]);

  const flashAutoSave = () => {
    setAutoSaved(true);
    setTimeout(() => setAutoSaved(false), 2000);
  };

  const syncAfterStepChange = async (result) => {
    const newSteps = applyHistoryMeta(result);
    const stepIdx = newSteps.length > 0 ? newSteps.length - 1 : -1;
    setSelectedStep(stepIdx);
    if (activeQueryId) await loadPreview(activeQueryId, stepIdx >= 0 ? stepIdx : null);
    flashAutoSave();
  };

  const toggleAction = (type) => {
    if (activeAction === type) {
      setActiveAction(null);
      setForm({});
    } else {
      setActiveAction(type);
      setForm({});
    }
  };

  const closeFlyout = () => {
    setActiveAction(null);
    setForm({});
  };

  const buildConfig = () => {
    const config = { ...form };
    if (activeAction === 'sort_rows') config.ascending = form.ascending !== 'false';
    if (activeAction === 'merge_columns' && form.columns_csv) {
      config.columns = form.columns_csv.split(',').map((s) => s.trim()).filter(Boolean);
      delete config.columns_csv;
    }
    if (activeAction === 'split_column' && form.new_columns_csv) {
      config.new_columns = form.new_columns_csv.split(',').map((s) => s.trim()).filter(Boolean);
      delete config.new_columns_csv;
    }
    if (activeAction === 'group_by' && form.group_columns_csv) {
      config.group_columns = form.group_columns_csv.split(',').map((s) => s.trim()).filter(Boolean);
      delete config.group_columns_csv;
    }
    if (activeAction === 'group_by' && form.aggregations_json) {
      try { config.aggregations = JSON.parse(form.aggregations_json); } catch { config.aggregations = {}; }
      delete config.aggregations_json;
    }
    if (activeAction === 'remove_null_values') {
      if (form.column_optional) config.columns = [form.column_optional];
      delete config.column_optional;
    }
    if (activeAction === 'merge_join' || activeAction === 'append') {
      config.query_id = form.query_id;
    }
    return config;
  };

  const handleAddStep = async () => {
    if (!activeAction || !activeQueryId) return;
    if (activeAction === 'merge_join') {
      if (!form.query_id) {
        setError('Select a second query to merge with (use Duplicate query if you only have one).');
        return;
      }
      if (!form.on) {
        setError('Select a join column that exists in both queries.');
        return;
      }
    }
    if (activeAction === 'append' && !form.query_id) {
      setError('Select a query to append.');
      return;
    }
    setActionLoading('add');
    setError('');
    try {
      const result = await queriesApi.addStep(activeQueryId, activeAction, buildConfig());
      await syncAfterStepChange(result);
      closeFlyout();
      setSuccess('Step added');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleUndo = async () => {
    if (!activeQueryId || !canUndo) return;
    setActionLoading('undo');
    setError('');
    try {
      const result = await queriesApi.undo(activeQueryId);
      await syncAfterStepChange(result);
      if (result.changed === false) return;
      setSuccess(result.removed_step ? `Undone: ${result.removed_step}` : 'Step undone');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleRedo = async () => {
    if (!activeQueryId || !canRedo) return;
    setActionLoading('redo');
    setError('');
    try {
      const result = await queriesApi.redo(activeQueryId);
      await syncAfterStepChange(result);
      if (result.changed === false) return;
      setSuccess('Step restored');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleApply = async () => {
    if (!fileId) return;
    setActionLoading('apply');
    try {
      await queriesApi.executeAll(fileId);
      setSuccess('Query pipeline applied');
      onApplied?.();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleRefreshPreview = async () => {
    if (!activeQueryId) return;
    setActionLoading('refresh');
    try {
      await queriesApi.refreshPreview(activeQueryId);
      await loadQueryData(activeQueryId);
      setSuccess('Preview refreshed');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateQuery = async () => {
    const name = prompt('New query name:', 'Query');
    if (!name) return;
    try {
      const q = await queriesApi.create(fileId, { query_name: name.trim() });
      setQueries((prev) => [...prev, q]);
      setActiveQueryId(q.id);
      await loadQueryData(q.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDuplicateQuery = async (selectForMerge = false) => {
    if (!activeQueryId) return null;
    try {
      const q = await queriesApi.duplicate(activeQueryId);
      setQueries((prev) => [...prev, q]);
      if (selectForMerge) {
        setForm((prev) => ({ ...prev, query_id: q.id }));
      } else {
        setActiveQueryId(q.id);
        await loadQueryData(q.id);
      }
      setSuccess(`Created "${q.query_name}" — select it as the second query`);
      setTimeout(() => setSuccess(''), 3000);
      return q;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  const handleRenameQuery = async () => {
    if (!activeQueryId || !activeQuery) return;
    const name = prompt('Rename query:', activeQuery.query_name);
    if (!name) return;
    try {
      const q = await queriesApi.rename(activeQueryId, name.trim());
      setQueries((prev) => prev.map((x) => (x.id === q.id ? { ...x, ...q } : x)));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteQuery = async () => {
    if (!activeQueryId) return;
    if (!window.confirm('Delete this query?')) return;
    try {
      await queriesApi.delete(activeQueryId);
      const data = await queriesApi.list(fileId);
      const list = data.queries || [];
      setQueries(list);
      setActiveQueryId(list[0]?.id || null);
      if (list[0]) await loadQueryData(list[0].id);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!activeQueryId) return;
    try {
      const result = await queriesApi.deleteStep(activeQueryId, stepId);
      await syncAfterStepChange(result);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleStep = async (stepId, enabled) => {
    if (!activeQueryId) return;
    try {
      const result = await queriesApi.toggleStep(activeQueryId, stepId, !enabled);
      setSteps(result.steps || []);
      await loadPreview(activeQueryId, selectedStep >= 0 ? selectedStep : null);
      flashAutoSave();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleMoveStep = async (index, direction) => {
    if (!activeQueryId) return;
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const ids = steps.map((s) => s.id);
    [ids[index], ids[newIdx]] = [ids[newIdx], ids[index]];
    try {
      const result = await queriesApi.reorderSteps(activeQueryId, ids);
      setSteps(result.steps || []);
      flashAutoSave();
    } catch (e) {
      setError(e.message);
    }
  };

  const previewStep = async (idx) => {
    setSelectedStep(idx);
    if (activeQueryId) {
      try {
        await loadPreview(activeQueryId, idx >= 0 ? idx : null);
        setOffset(0);
      } catch (e) {
        setError(e.message);
      }
    }
  };

  const selectQuery = async (queryId) => {
    setActiveQueryId(queryId);
    setOffset(0);
    await loadQueryData(queryId);
  };

  const renderStepForm = () => {
    if (!activeAction) return null;
    const actionLabel = TRANSFORM_ACTIONS.find((a) => a.type === activeAction)?.label;
    const columns = preview.columns?.map((c) => c.name) || [];
    const otherQueries = queries.filter((q) => q.id !== activeQueryId);
    const joinColumns = form.query_id
      ? columns.filter((c) => otherQueryColumns.includes(c))
      : columns;
    const needsSecondQuery = ['merge_join', 'append'].includes(activeAction);
    const canSubmit = !needsSecondQuery || (form.query_id && (activeAction !== 'merge_join' || form.on));

    return (
      <div className="bi-qe-transform-flyout">
        <div className="bi-qe-flyout-header">
          <span>{actionLabel}</span>
          <button type="button" className="bi-qe-flyout-close" onClick={closeFlyout} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="bi-qe-flyout-body">
          {needsSecondQuery && otherQueries.length === 0 && (
            <div className="bi-qe-merge-help">
              <p className="bi-qe-hint">
                Merge needs a second query. Duplicate the current query to create one, then pick it below.
              </p>
              <button
                type="button"
                className="bi-qe-merge-dup-btn"
                onClick={() => handleDuplicateQuery(true)}
                disabled={!activeQueryId || !!actionLoading}
              >
                <Copy size={14} /> Duplicate current query
              </button>
            </div>
          )}
          {(STEP_FORMS[activeAction] || []).map((field) => (
            <label key={field} className="bi-qe-field">
              <span>{FIELD_LABELS[field] || field.replace(/_/g, ' ')}</span>
              {field === 'column' || field === 'column_optional' ? (
                <select value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })}>
                  <option value="">{field === 'column_optional' ? 'All columns' : 'Select column'}</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : field === 'on' ? (
                <select value={form.on || ''} onChange={(e) => setForm({ ...form, on: e.target.value })} disabled={!form.query_id}>
                  <option value="">{form.query_id ? 'Select join column' : 'Select second query first'}</option>
                  {joinColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : field === 'query_id' ? (
                <select value={form.query_id || ''} onChange={(e) => setForm({ ...form, query_id: e.target.value, on: '' })}>
                  <option value="">Select query</option>
                  {otherQueries.map((q) => <option key={q.id} value={q.id}>{q.query_name}</option>)}
                </select>
              ) : field === 'how' ? (
                <select value={form.how || 'inner'} onChange={(e) => setForm({ ...form, how: e.target.value })}>
                  <option value="inner">Inner Join</option>
                  <option value="left">Left Join</option>
                  <option value="right">Right Join</option>
                  <option value="outer">Full Outer Join</option>
                </select>
              ) : field === 'data_type' ? (
                <select value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Boolean</option>
                </select>
              ) : field === 'operator' ? (
                <select value={form[field] || '=='} onChange={(e) => setForm({ ...form, [field]: e.target.value })}>
                  <option value="==">Equals</option>
                  <option value="!=">Not equals</option>
                  <option value=">">Greater than</option>
                  <option value="<">Less than</option>
                  <option value="contains">Contains</option>
                  <option value="is_null">Is null</option>
                  <option value="is_not_null">Is not null</option>
                </select>
              ) : field === 'ascending' ? (
                <select value={form[field] ?? 'true'} onChange={(e) => setForm({ ...form, [field]: e.target.value })}>
                  <option value="true">Ascending</option>
                  <option value="false">Descending</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={form[field] || ''}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={
                    field === 'columns_csv' ? 'Col1, Col2' :
                    field === 'aggregations_json' ? '{"Col": "sum"}' :
                    field === 'on' ? 'Column name or key' : ''
                  }
                />
              )}
            </label>
          ))}
          {activeAction === 'merge_join' && form.query_id && joinColumns.length === 0 && (
            <p className="bi-qe-hint bi-qe-hint--warn">
              No shared columns found between these queries. Both queries need a column with the same name to join on.
            </p>
          )}
          {['remove_duplicates', 'remove_null_values'].includes(activeAction) && (
            <p className="bi-qe-hint">
              {activeAction === 'remove_duplicates' ? 'Removes duplicate rows.' : 'Removes rows with null values.'}
            </p>
          )}
          <button
            type="button"
            className="bi-qe-primary bi-qe-form-submit"
            onClick={handleAddStep}
            disabled={!!actionLoading || !canSubmit}
          >
            {actionLoading === 'add' ? <Loader2 size={14} className="spin" /> : null}
            Add Step
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="bi-query-editor-overlay" role="dialog" aria-modal="true">
      <div className="bi-query-editor">
        <header className="bi-qe-header">
          <div className="bi-qe-title">
            <Database size={18} />
            <span>{isEditMode ? 'Edit Queries' : 'Power Query'}</span>
            {autoSaved && <span className="bi-qe-autosave">Saved</span>}
          </div>
          <div className="bi-qe-toolbar">
            <button type="button" className="bi-qe-btn-ghost" onClick={handleUndo} disabled={!!actionLoading || !canUndo} title={canUndo ? 'Undo last step' : 'Nothing to undo'}>
              <Undo2 size={15} /><span>Undo</span>
            </button>
            <button type="button" className="bi-qe-btn-ghost" onClick={handleRedo} disabled={!!actionLoading || !canRedo} title={canRedo ? 'Redo' : 'Nothing to redo'}>
              <Redo2 size={15} /><span>Redo</span>
            </button>
            <button type="button" className="bi-qe-btn-ghost" onClick={handleRefreshPreview} disabled={!!actionLoading}>
              <RefreshCw size={15} /><span>Refresh</span>
            </button>
            <span className="bi-qe-divider" />
            <button type="button" onClick={handleApply} disabled={!!actionLoading} className="bi-qe-primary">
              {actionLoading === 'apply' ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
              <span>Apply</span>
            </button>
            <button type="button" className="bi-qe-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </header>

        {error && <div className="bi-qe-alert bi-qe-alert--error">{error}</div>}
        {success && <div className="bi-qe-alert bi-qe-alert--success">{success}</div>}

        <div className="bi-qe-body">
          <div className={`bi-qe-left-panel ${activeAction ? 'bi-qe-left-panel--flyout-open' : ''}`}>
            <aside className="bi-qe-sidebar">
              <div className="bi-qe-section-title">Queries</div>
              <div className="bi-qe-query-actions">
                <button type="button" onClick={handleCreateQuery} title="New query"><Plus size={14} /></button>
                <button type="button" onClick={() => handleDuplicateQuery(false)} title="Duplicate query" disabled={!activeQueryId}><Copy size={14} /></button>
                {isEditMode && (
                  <>
                    <button type="button" onClick={handleRenameQuery} title="Rename" disabled={!activeQueryId}>Rename</button>
                    <button type="button" onClick={handleDeleteQuery} title="Delete" disabled={queries.length <= 1}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
              <div className="bi-qe-query-list">
                {queries.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className={`bi-qe-query-item ${q.id === activeQueryId ? 'active' : ''}`}
                    onClick={() => selectQuery(q.id)}
                    title={q.query_name}
                  >
                    <ChevronRight size={12} aria-hidden />
                    <span className="bi-qe-query-name">{q.query_name}</span>
                    {q.step_count > 0 && <span className="bi-qe-query-badge">{q.step_count}</span>}
                  </button>
                ))}
              </div>

              <div className="bi-qe-section-title">Transform</div>
              <div className="bi-qe-transform-grid">
                {TRANSFORM_ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    className={`bi-qe-transform-btn ${activeAction === a.type ? 'active' : ''}`}
                    onClick={() => toggleAction(a.type)}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </div>
            </aside>
            {renderStepForm()}
          </div>

          <main className="bi-qe-main">
            {loading ? (
              <div className="bi-qe-loading"><Loader2 size={24} className="spin" /> Loading preview...</div>
            ) : (
              <>
                <div className="bi-qe-preview-info">
                  <span>{activeQuery?.query_name || 'Query'}</span>
                  <span className="bi-qe-preview-dot">·</span>
                  <span>{preview.total_rows?.toLocaleString()} rows</span>
                  <span className="bi-qe-preview-dot">·</span>
                  <span>{preview.columns?.length || 0} columns</span>
                </div>
                <div className="bi-qe-table-wrap">
                  <table className="bi-qe-table">
                    <thead>
                      <tr>
                        {(preview.columns || []).map((c) => (
                          <th key={c.name}>{c.name}<span className="bi-qe-col-type">{c.type}</span></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.rows || []).map((row, i) => (
                        <tr key={i}>
                          {(preview.columns || []).map((c) => (
                            <td key={c.name}>{row[c.name] == null ? '' : String(row[c.name])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bi-qe-pagination">
                  <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button>
                  <span>Rows {offset + 1}–{Math.min(offset + limit, preview.total_rows)} of {preview.total_rows}</span>
                  <button type="button" disabled={offset + limit >= preview.total_rows} onClick={() => setOffset(offset + limit)}>Next</button>
                </div>
              </>
            )}
          </main>

          <aside className="bi-qe-steps">
            <div className="bi-qe-section-title">Applied Steps</div>
            <div className="bi-qe-steps-list">
              <button type="button" className={`bi-qe-step ${selectedStep === -1 ? 'active' : ''}`} onClick={() => previewStep(-1)}>
                Source
              </button>
              {steps.map((step, i) => (
                <div key={step.id} className={`bi-qe-step-row ${selectedStep === i ? 'active' : ''} ${!step.enabled ? 'disabled' : ''}`}>
                  <button type="button" className="bi-qe-step" onClick={() => previewStep(i)}>
                    <span className="bi-qe-step-num">{i + 1}</span>
                    <span className="bi-qe-step-label">{step.description || step.operation_type}</span>
                  </button>
                  {isEditMode && (
                    <div className="bi-qe-step-controls">
                      <button type="button" title={step.enabled ? 'Disable' : 'Enable'} onClick={() => handleToggleStep(step.id, step.enabled)}>
                        {step.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button type="button" title="Move up" disabled={i === 0} onClick={() => handleMoveStep(i, -1)}><ChevronUp size={12} /></button>
                      <button type="button" title="Move down" disabled={i === steps.length - 1} onClick={() => handleMoveStep(i, 1)}><ChevronDown size={12} /></button>
                      <button type="button" title="Delete step" onClick={() => handleDeleteStep(step.id)}><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default BIQueryEditor;
