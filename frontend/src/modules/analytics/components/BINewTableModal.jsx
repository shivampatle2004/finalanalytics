import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Table, Play, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import calculatedTablesApi from '../services/calculatedTablesApi';
import './BINewTableModal.css';

const TABS = [
  { id: 'formula', label: 'Formula' },
  { id: 'query_builder', label: 'Query Builder' },
  { id: 'manual', label: 'Manual' },
];

const OPERATORS = ['==', '!=', '>', '>=', '<', '<='];

const EXAMPLE_EXPRESSIONS = {
  FILTER: 'FILTER(Data, [Price] > 10000)',
  DISTINCT: 'DISTINCT(Data, [Make])',
  SUMMARIZE: 'SUMMARIZE(Data, [Make])',
  SELECTCOLUMNS: 'SELECTCOLUMNS(Data, "Make", [Make], "Price", [Price])',
  CALENDAR: 'CALENDAR(DATE(2024, 1, 1), DATE(2024, 12, 31))',
  GENERATESERIES: 'GENERATESERIES(1, 10, 1)',
};

const Field = ({ label, children }) => (
  <label className="bi-nt-field">
    <span>{label}</span>
    {children}
  </label>
);

const BINewTableModal = ({ isOpen, onClose, fileId, editTable, onSaved }) => {
  const [tab, setTab] = useState('formula');
  const [tableName, setTableName] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [sources, setSources] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [builder, setBuilder] = useState({
    source_table: '',
    columns: [],
    filters: [],
    group_by: [],
    aggregations: {},
    calculated_columns: [],
  });
  const [manualCols, setManualCols] = useState([
    { name: 'Column1', type: 'text' },
    { name: 'Column2', type: 'number' },
  ]);
  const [manualRows, setManualRows] = useState([{ Column1: '', Column2: '' }]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sourceTable = useMemo(
    () => sources.find((s) => s.name === builder.source_table) || sources[0],
    [sources, builder.source_table],
  );

  const loadMeta = useCallback(async () => {
    if (!fileId || !isOpen) return;
    try {
      const [srcData, fnData] = await Promise.all([
        calculatedTablesApi.sources(fileId),
        calculatedTablesApi.functions(),
      ]);
      const list = srcData.sources || [];
      setSources(list);
      setFunctions(fnData.functions || []);
      if (list.length && !builder.source_table) {
        setBuilder((b) => ({ ...b, source_table: list[0].name, columns: list[0].columns.map((c) => c.name) }));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [fileId, isOpen, builder.source_table]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    if (!isOpen) return;
    if (editTable) {
      setTableName(editTable.table_name || '');
      setDescription(editTable.description || '');
      setTab(editTable.method || 'formula');
      setExpression(editTable.expression || '');
      if (editTable.builder_config) setBuilder({ ...builder, ...editTable.builder_config });
      if (editTable.manual_data) {
        setManualCols(editTable.manual_data.columns || manualCols);
        setManualRows(editTable.manual_data.rows || manualRows);
      }
    } else {
      setTableName('');
      setDescription('');
      setTab('formula');
      setExpression('');
      setPreview(null);
      setError('');
    }
  }, [isOpen, editTable]);

  const buildPayload = () => {
    const method = tab;
    const payload = {
      report_id: fileId,
      method,
      table_name: tableName.trim(),
      description: description.trim() || undefined,
    };
    if (method === 'formula') payload.expression = expression.trim();
    if (method === 'query_builder') payload.builder_config = builder;
    if (method === 'manual') {
      payload.manual_data = {
        columns: manualCols,
        rows: manualRows.map((row) => {
          const out = {};
          manualCols.forEach((c) => { out[c.name] = row[c.name] ?? ''; });
          return out;
        }),
      };
    }
    return payload;
  };

  const handlePreview = async () => {
    if (!fileId) return;
    setLoading(true);
    setError('');
    try {
      const data = await calculatedTablesApi.preview(buildPayload());
      setPreview(data);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tableName.trim()) {
      setError('Table name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (editTable?.id) {
        await calculatedTablesApi.update(editTable.id, payload);
      } else {
        await calculatedTablesApi.create(payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const insertFunction = (fn) => {
    const snippet = EXAMPLE_EXPRESSIONS[fn] || `${fn}()`;
    setExpression((prev) => (prev ? `${prev}\n${snippet}` : snippet));
  };

  const toggleColumn = (col) => {
    setBuilder((b) => {
      const cols = b.columns.includes(col)
        ? b.columns.filter((c) => c !== col)
        : [...b.columns, col];
      return { ...b, columns: cols };
    });
  };

  const addFilter = () => {
    const col = sourceTable?.columns?.[0]?.name || '';
    setBuilder((b) => ({
      ...b,
      filters: [...b.filters, { column: col, operator: '==', value: '' }],
    }));
  };

  const addManualRow = () => {
    const row = {};
    manualCols.forEach((c) => { row[c.name] = ''; });
    setManualRows((r) => [...r, row]);
  };

  if (!isOpen) return null;

  return (
    <div className="bi-nt-overlay" role="dialog" aria-modal="true">
      <div className="bi-nt-panel">
        <header className="bi-nt-header">
          <Table size={18} className="bi-nt-icon" />
          <h2>{editTable ? 'Edit Table' : 'New Table'}</h2>
          <button type="button" className="bi-nt-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="bi-nt-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`bi-nt-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => { setTab(t.id); setPreview(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="bi-nt-error">{error}</div>}

        <div className="bi-nt-body">
          <div className="bi-nt-form">
            <Field label="Table name">
              <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="Sales Summary" />
            </Field>
            <Field label="Description (optional)">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this table represents" />
            </Field>

            {tab === 'formula' && (
              <>
                <div className="bi-nt-func-chips">
                  {(functions.length ? functions : Object.keys(EXAMPLE_EXPRESSIONS)).map((fn) => (
                    <button key={fn} type="button" className="bi-nt-func-chip" onClick={() => insertFunction(fn)}>
                      {fn}()
                    </button>
                  ))}
                </div>
                <Field label="Expression">
                  <textarea
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    placeholder={'FILTER(Data, [Price] > 10000)\n\nSupported: FILTER, SUMMARIZE, DISTINCT, UNION, ADDCOLUMNS, SELECTCOLUMNS, CALENDAR, GENERATESERIES'}
                    spellCheck={false}
                  />
                </Field>
              </>
            )}

            {tab === 'query_builder' && (
              <>
                <Field label="Source table">
                  <select
                    value={builder.source_table}
                    onChange={(e) => {
                      const name = e.target.value;
                      const src = sources.find((s) => s.name === name);
                      setBuilder((b) => ({
                        ...b,
                        source_table: name,
                        columns: src ? src.columns.map((c) => c.name) : [],
                      }));
                    }}
                  >
                    {sources.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <div className="bi-nt-builder-section">
                  <h4>Columns</h4>
                  <div className="bi-nt-col-checks">
                    {(sourceTable?.columns || []).map((c) => (
                      <label key={c.name} className="bi-nt-col-check">
                        <input
                          type="checkbox"
                          checked={builder.columns.includes(c.name)}
                          onChange={() => toggleColumn(c.name)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="bi-nt-builder-section">
                  <h4>Filters</h4>
                  {builder.filters.map((f, i) => (
                    <div key={i} className="bi-nt-filter-row">
                      <select
                        value={f.column}
                        onChange={(e) => {
                          const filters = [...builder.filters];
                          filters[i] = { ...f, column: e.target.value };
                          setBuilder((b) => ({ ...b, filters }));
                        }}
                      >
                        {(sourceTable?.columns || []).map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) => {
                          const filters = [...builder.filters];
                          filters[i] = { ...f, operator: e.target.value };
                          setBuilder((b) => ({ ...b, filters }));
                        }}
                      >
                        {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                      </select>
                      <input
                        value={f.value}
                        onChange={(e) => {
                          const filters = [...builder.filters];
                          filters[i] = { ...f, value: e.target.value };
                          setBuilder((b) => ({ ...b, filters }));
                        }}
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        className="bi-nt-btn"
                        onClick={() => setBuilder((b) => ({ ...b, filters: b.filters.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="bi-nt-btn" onClick={addFilter}>
                    <Plus size={14} /> Add filter
                  </button>
                </div>
              </>
            )}

            {tab === 'manual' && (
              <>
                <div className="bi-nt-builder-section">
                  <h4>Columns</h4>
                  {manualCols.map((col, i) => (
                    <div key={i} className="bi-nt-filter-row">
                      <input
                        value={col.name}
                        onChange={(e) => {
                          const old = col.name;
                          const cols = [...manualCols];
                          cols[i] = { ...col, name: e.target.value };
                          setManualCols(cols);
                          setManualRows((rows) => rows.map((r) => {
                            const nr = { ...r, [e.target.value]: r[old] ?? '' };
                            if (old !== e.target.value) delete nr[old];
                            return nr;
                          }));
                        }}
                      />
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const cols = [...manualCols];
                          cols[i] = { ...col, type: e.target.value };
                          setManualCols(cols);
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                      <span />
                      <button
                        type="button"
                        className="bi-nt-btn"
                        onClick={() => {
                          if (manualCols.length <= 1) return;
                          setManualCols((c) => c.filter((_, j) => j !== i));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="bi-nt-btn"
                    onClick={() => setManualCols((c) => [...c, { name: `Column${c.length + 1}`, type: 'text' }])}
                  >
                    <Plus size={14} /> Add column
                  </button>
                </div>
                <div className="bi-nt-manual-grid">
                  <table>
                    <thead>
                      <tr>
                        {manualCols.map((c) => <th key={c.name}>{c.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {manualRows.map((row, ri) => (
                        <tr key={ri}>
                          {manualCols.map((c) => (
                            <td key={c.name}>
                              <input
                                value={row[c.name] ?? ''}
                                onChange={(e) => {
                                  const rows = [...manualRows];
                                  rows[ri] = { ...row, [c.name]: e.target.value };
                                  setManualRows(rows);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="bi-nt-btn" onClick={addManualRow} style={{ marginTop: 8 }}>
                  <Plus size={14} /> Add row
                </button>
              </>
            )}
          </div>

          <div className="bi-nt-preview-pane">
            <div className="bi-nt-preview-stats">
              {preview ? (
                <>
                  <span>{preview.total_rows?.toLocaleString()} rows</span>
                  <span>{preview.total_columns} columns</span>
                </>
              ) : (
                <span>Preview your table before saving</span>
              )}
            </div>
            {loading ? (
              <div className="bi-nt-empty-preview"><Loader2 size={24} className="spin" /></div>
            ) : preview?.rows?.length ? (
              <table className="bi-nt-preview-table">
                <thead>
                  <tr>
                    {(preview.columns || []).map((c) => (
                      <th key={c.column_name}>
                        {c.column_name}
                        <span style={{ display: 'block', fontWeight: 400, opacity: 0.7 }}>{c.data_type}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {(preview.columns || []).map((c) => (
                        <td key={c.column_name}>{row[c.column_name] == null ? '' : String(row[c.column_name])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="bi-nt-empty-preview">
                <Table size={28} style={{ opacity: 0.35 }} />
                Click Preview to see generated data
              </div>
            )}
          </div>
        </div>

        <footer className="bi-nt-footer">
          <button type="button" className="bi-nt-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="bi-nt-btn" onClick={handlePreview} disabled={loading || saving}>
            {loading ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            Preview
          </button>
          <button type="button" className="bi-nt-btn bi-nt-btn-primary" onClick={handleSave} disabled={saving || !tableName.trim()}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {editTable ? 'Update Table' : 'Create Table'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default BINewTableModal;
