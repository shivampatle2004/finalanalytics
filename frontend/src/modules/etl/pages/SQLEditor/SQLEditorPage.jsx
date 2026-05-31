import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Code2, Play, CheckCircle, AlertTriangle, Database, FastForward,
  Clock, BookOpen, Table2, Trash2, RefreshCw, Search, X
} from 'lucide-react';
import { api } from '../../services/api';
import { Tooltip } from '../../components/ui/Tooltip';
import './SQLEditorPage.css';

/* ─── Predefined query library ─────────────────────────────── */
const PREDEFINED = [
  {
    category: 'Exploration',
    queries: [
      { label: 'List all tables',         sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" },
      { label: 'Show table sizes',         sql: "SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;" },
      { label: 'Count rows per table',    sql: "SELECT schemaname, relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC;" },
      { label: 'List all columns',        sql: "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;" },
    ]
  },
  {
    category: 'Data Quality',
    queries: [
      { label: 'Find duplicate rows',     sql: '-- Replace "my_table" and "col"\nSELECT col, COUNT(*) AS cnt FROM "my_table" GROUP BY col HAVING COUNT(*) > 1 ORDER BY cnt DESC;' },
      { label: 'Count NULLs per column',  sql: '-- Replace "my_table"\nSELECT\n  COUNT(*) FILTER (WHERE col IS NULL) AS null_count,\n  COUNT(*) AS total\nFROM "my_table";' },
      { label: 'Recent records (top 100)',sql: '-- Replace "my_table" and "created_at"\nSELECT * FROM "my_table" ORDER BY created_at DESC LIMIT 100;' },
    ]
  },
  {
    category: 'Schema',
    queries: [
      { label: 'Show indexes',            sql: "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;" },
      { label: 'Show foreign keys',       sql: "SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY';" },
      { label: 'Column details',          sql: "SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'my_table' ORDER BY ordinal_position;" },
    ]
  },
  {
    category: 'Performance',
    queries: [
      { label: 'Long-running queries',    sql: "SELECT pid, now() - query_start AS duration, query, state FROM pg_stat_activity WHERE (now() - query_start) > interval '5 minutes';" },
      { label: 'Table statistics',        sql: "SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables ORDER BY seq_scan DESC;" },
    ]
  }
];

/* ─── Draggable Results Table ──────────────────────────────── */
function DraggableTableWrapper({ children }) {
  const ref = useRef(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const down  = (e) => { setIsDown(true); ref.current?.classList.add('dragging'); setStartX(e.pageX - ref.current.offsetLeft); setScrollLeft(ref.current.scrollLeft); };
  const leave = ()  => { setIsDown(false); ref.current?.classList.remove('dragging'); };
  const up    = ()  => { setIsDown(false); ref.current?.classList.remove('dragging'); };
  const move  = (e) => { if (!isDown || !ref.current) return; e.preventDefault(); ref.current.scrollLeft = scrollLeft - (e.pageX - ref.current.offsetLeft - startX) * 1.5; };
  return <div className="sqleditor-table-wrapper" ref={ref} onMouseDown={down} onMouseLeave={leave} onMouseUp={up} onMouseMove={move}>{children}</div>;
}

/* ─── Main Page ────────────────────────────────────────────── */
export function SQLEditorPage() {
  const [tables, setTables]             = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [tableSearch, setTableSearch]   = useState('');
  const [activeTable, setActiveTable]   = useState(null);
  const [activeTab, setActiveTab]       = useState('tables'); // 'tables' | 'predefined' | 'history'

  const [sql, setSql]       = useState('-- Write your SQL here...\n');
  const [running, setRunning] = useState(false);
  const [result, setResult]  = useState(null);
  const [error, setError]    = useState(null);

  /* History persisted in localStorage */
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sqleditor_history') || '[]'); }
    catch { return []; }
  });

  const saveHistory = (entry) => setHistory(prev => {
    const next = [entry, ...prev.filter(h => h.sql !== entry.sql)].slice(0, 50);
    localStorage.setItem('sqleditor_history', JSON.stringify(next));
    return next;
  });

  const clearHistory = () => { setHistory([]); localStorage.removeItem('sqleditor_history'); };

  /* Load tables */
  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try { setTables(await api.getDatabaseTables()); }
    catch (e) { console.error(e); }
    finally { setLoadingTables(false); }
  }, []);
  useEffect(() => { loadTables(); }, [loadTables]);

  /* Click table → always replace with fresh SELECT */
  const handleTableClick = (name) => {
    setActiveTable(name);
    setSql(`SELECT * FROM "${name}" LIMIT 50;`);
    setResult(null); setError(null);
  };

  /* Load predefined/history */
  const loadQuery = (q) => { setSql(q); setResult(null); setError(null); };

  /* Run */
  const runSQL = async () => {
    if (!sql.trim()) return;
    setRunning(true); setError(null); setResult(null);
    const t0 = new Date();
    try {
      const res = await api.executeSQL(sql);
      setResult(res);
      saveHistory({ sql: sql.trim(), ran_at: t0.toISOString(), rows: res.row_count ?? res.rows_affected ?? 0, ok: true });
      const up = sql.trim().toUpperCase();
      if (up.startsWith('CREATE') || up.startsWith('DROP') || up.startsWith('ALTER')) loadTables();
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setError(msg);
      saveHistory({ sql: sql.trim(), ran_at: t0.toISOString(), rows: 0, ok: false });
    } finally { setRunning(false); }
  };

  const filteredTables = tables.filter(t => t.toLowerCase().includes(tableSearch.toLowerCase()));

  /* ── Sidebar tab definitions ── */
  const TABS = [
    { id: 'tables',    icon: <Table2 size={13} />,   label: 'Tables',    badge: tables.length },
    { id: 'predefined',icon: <BookOpen size={13} />, label: 'Queries',   badge: null },
    { id: 'history',   icon: <Clock size={13} />,    label: 'History',   badge: history.length || null },
  ];

  return (
    <div className="sqleditor-container">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Global SQL Editor</h1>
          <p>Execute multi-connector queries and manage raw data directly.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadTables}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="sqleditor-body">
        {/* ── Left Sidebar ── */}
        <div className="sqleditor-sidebar">
          {/* TOP TAB TOGGLE */}
          <div className="sqle-tab-bar">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`sqle-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.badge != null && t.badge > 0 && (
                  <span className="sqle-tab-badge">{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div className="sqle-tab-content">
            {/* ── Tables ── */}
            {activeTab === 'tables' && (
              <>
                <div className="sqle-search-wrap">
                  <Search size={12} className="sqle-search-icon" />
                  <input
                    className="sqle-search"
                    placeholder="Filter tables…"
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                  />
                  {tableSearch && (
                    <button className="sqle-search-clear" onClick={() => setTableSearch('')}>
                      <X size={11} />
                    </button>
                  )}
                </div>
                {loadingTables ? (
                  <div className="sqle-empty">Loading…</div>
                ) : filteredTables.length === 0 ? (
                  <div className="sqle-empty">No tables found.</div>
                ) : (
                  <ul className="sqle-item-list">
                    {filteredTables.map(name => (
                      <Tooltip key={name} content={`SELECT * FROM "${name}" LIMIT 50`}>
                        <li
                          className={`sqle-item ${activeTable === name ? 'active' : ''}`}
                          onClick={() => handleTableClick(name)}
                        >
                          <Database size={11} className="sqle-item-icon" />
                          <span className="sqle-item-label">{name}</span>
                        </li>
                      </Tooltip>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ── Predefined ── */}
            {activeTab === 'predefined' && (
              <div className="sqle-predefined">
                {PREDEFINED.map(cat => (
                  <div key={cat.category} className="sqle-query-cat">
                    <div className="sqle-query-cat-label">{cat.category}</div>
                    {cat.queries.map(q => (
                      <Tooltip key={q.label} content={q.sql}>
                        <button
                          className="sqle-query-item"
                          onClick={() => loadQuery(q.sql)}
                        >
                          <Code2 size={11} className="sqle-item-icon" />
                          <span>{q.label}</span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── History ── */}
            {activeTab === 'history' && (
              <>
                {history.length === 0 ? (
                  <div className="sqle-empty">No queries yet.</div>
                ) : (
                  <>
                    <button className="sqle-clear-btn" onClick={clearHistory}>
                      <Trash2 size={11} /> Clear history
                    </button>
                    <ul className="sqle-item-list sqle-history-list">
                      {history.map((h, i) => (
                        <li
                          key={i}
                          className={`sqle-item sqle-history-item ${h.ok ? '' : 'sqle-hist-err'}`}
                          onClick={() => loadQuery(h.sql)}
                          title={h.sql}
                        >
                          <span className={`sqle-hist-dot ${h.ok ? 'ok' : 'err'}`} />
                          <div className="sqle-hist-content">
                            <span className="sqle-hist-sql">{h.sql.slice(0, 55)}{h.sql.length > 55 ? '…' : ''}</span>
                            <span className="sqle-hist-meta">
                              {new Date(h.ran_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {h.ok ? ` · ${h.rows} rows` : ' · failed'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Main: Editor + Results ── */}
        <div className="sqleditor-main">
          {/* Editor */}
          <div className="sqleditor-top">
            <div className="sqleditor-toolbar">
              <span className="sqleditor-label"><Code2 size={16} /> Query Window</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="sqleditor-btn secondary"
                  onClick={() => { setSql(''); setResult(null); setError(null); setActiveTable(null); }}
                >
                  Clear
                </button>
                <button
                  className="sqleditor-btn primary"
                  onClick={runSQL}
                  disabled={running || !sql.trim()}
                >
                  {running ? 'Running…' : <><Play size={14} fill="currentColor" /> Run Query</>}
                </button>
              </div>
            </div>
            <textarea
              className="sqleditor-textarea"
              value={sql}
              onChange={e => setSql(e.target.value)}
              placeholder="SELECT * FROM my_table LIMIT 10;"
              spellCheck={false}
              autoFocus
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSQL(); }
                if (e.key === 'Tab') { e.preventDefault(); setSql(p => p + '  '); }
              }}
            />
            <div className="sqleditor-hint">
              Ctrl+Enter to run · Click a table to load SELECT · Click a predefined/history query to load it
            </div>
          </div>

          {/* Results */}
          <div className="sqleditor-bottom">
            {error && (
              <div className="sqleditor-error">
                <AlertTriangle size={16} /> {error}
              </div>
            )}
            {!error && !result && !running && (
              <div className="sqle-ready-state">
                <FastForward size={32} opacity={0.2} />
                <div>
                  <b>Ready for query.</b><br />
                  Use the sidebar tabs or type your own SQL.
                </div>
              </div>
            )}
            {running && (
              <div className="sqle-ready-state">
                <div className="sqle-spinner" />
                <div style={{ fontSize: '0.88rem' }}>Executing query…</div>
              </div>
            )}
            {result && (
              <>
                {result.type === 'select' ? (
                  <>
                    <div className="sqleditor-result-meta">
                      <CheckCircle size={14} />
                      {result.row_count} row{result.row_count !== 1 ? 's' : ''} returned
                    </div>
                    {result.rows.length > 0 ? (
                      <DraggableTableWrapper>
                        <table className="sqleditor-data-table">
                          <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                          <tbody>
                            {result.rows.map((row, i) => (
                              <tr key={i}>
                                {result.columns.map(c => (
                                  <td key={c}>{row[c] === null ? <em className="null-val">null</em> : String(row[c])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </DraggableTableWrapper>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No rows returned.</div>
                    )}
                  </>
                ) : (
                  <div className="sqleditor-result-meta">
                    <CheckCircle size={14} /> Success — {result.rows_affected ?? 0} rows affected
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SQLEditorPage;
