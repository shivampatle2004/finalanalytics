/**
 * DataVaultPanel.jsx
 * Central dataset storage panel — lists all datasets fetched from any connector,
 * with search, preview, load, and delete actions.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive, Search, RefreshCw, Eye, Download, Trash2,
  FileSpreadsheet, FileText, Database, Code2, Table,
  AlertCircle, LayoutGrid
} from 'lucide-react';
import './DataVaultPanel.css';

// ── Source icon & class helpers ───────────────────────────────────────────────
const SOURCE_ICON = {
  csv:        <FileText size={16} />,
  excel:      <FileSpreadsheet size={16} />,
  json:       <Code2 size={16} />,
  parquet:    <FileText size={16} />,
  mysql:      <Database size={16} />,
  postgresql: <Database size={16} />,
  mssql:      <Database size={16} />,
  sqlite:     <Database size={16} />,
  api:        <LayoutGrid size={16} />,
  sql:        <Database size={16} />,
  entered:    <Table size={16} />,
  file:       <FileText size={16} />,
};

const SOURCE_CLASS = (src) => {
  const s = String(src || '').toLowerCase();
  if (['csv', 'excel', 'json', 'parquet', 'mysql', 'postgresql',
       'mssql', 'sqlite', 'api', 'sql', 'entered'].includes(s)) return `source-${s}`;
  return 'source-file';
};

// ── Timestamp formatter ───────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Preview Modal ─────────────────────────────────────────────────────────────
const PreviewModal = ({ item, onClose }) => {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!item) return;
    setState({ loading: true, error: null, data: null });

    fetch(`/analytics/api/vault/items/${item.id}/preview?limit=200`)
      .then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e?.detail || `HTTP ${r.status}`)));
        return r.json();
      })
      .then(data => setState({ loading: false, error: null, data }))
      .catch(err => setState({ loading: false, error: err.message, data: null }));
  }, [item]);

  if (!item) return null;

  const { loading, error, data } = state;

  return (
    <div className="dv-preview-overlay" onClick={onClose}>
      <div className="dv-preview-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dv-preview-header">
          <h3>
            {item.name}
            <span>{String(item.source_name).toUpperCase()} preview</span>
          </h3>
          <button type="button" className="dv-close-btn" onClick={onClose} title="Close">×</button>
        </div>

        {/* Body */}
        {loading && (
          <div className="dv-preview-loading">
            <div className="dv-spinner" />
            Loading dataset preview…
          </div>
        )}

        {error && (
          <div className="dv-preview-error">
            <AlertCircle size={32} />
            <strong>Preview failed</strong>
            <span>{error}</span>
          </div>
        )}

        {data && !loading && !error && (
          <div className="dv-preview-table-wrap">
            <table className="dv-preview-table">
              <thead>
                <tr>
                  {(data.columns || []).map(col => (
                    <th key={col.name} title={col.type}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((row, ri) => (
                  <tr key={ri}>
                    {(data.columns || []).map(col => (
                      <td key={col.name} title={String(row[col.name] ?? '')}>
                        {row[col.name] === null || row[col.name] === undefined
                          ? <span style={{ color: '#4a4f6a', fontStyle: 'italic' }}>null</span>
                          : String(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Vault Card ────────────────────────────────────────────────────────────────
const VaultCard = ({ item, onLoad, onPreview, onDelete }) => {
  const src = String(item.source_name || 'file').toLowerCase();
  const icon = SOURCE_ICON[src] || SOURCE_ICON.file;
  const cls = SOURCE_CLASS(src);

  const metaParts = [
    item.source_name ? String(item.source_name).toUpperCase() : null,
    item.row_count > 0 ? `${fmtNum(item.row_count)} rows` : null,
    item.column_count > 0 ? `${item.column_count} cols` : null,
    fmtDate(item.created_at) !== '—' ? fmtDate(item.created_at) : null,
  ].filter(Boolean);

  return (
    <div className="dv-row" id={`dv-card-${item.id}`}>
      <div className={`dv-row-icon ${cls}`}>{icon}</div>
      <div className="dv-row-body">
        <div className="dv-row-name" title={item.name}>{item.name}</div>
        <div className="dv-row-meta">{metaParts.join(' · ')}</div>
      </div>
      <div className="dv-row-actions">
        <button
          className="dv-act dv-act--load"
          id={`dv-load-${item.id}`}
          onClick={() => onLoad(item)}
          title="Load into workspace"
        >
          <Download size={14} />
        </button>
        <button
          className="dv-act dv-act--preview"
          id={`dv-preview-${item.id}`}
          onClick={() => onPreview(item)}
          title="Preview"
        >
          <Eye size={14} />
        </button>
        <button
          className="dv-act dv-act--delete"
          id={`dv-delete-${item.id}`}
          onClick={() => onDelete(item)}
          title="Remove from vault"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// ── Main Panel ────────────────────────────────────────────────────────────────
const DataVaultPanel = ({ isOpen, onClose, onLoadDataset }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [previewItem, setPreviewItem] = useState(null);
  const [spinning, setSpinning] = useState(false);

  // ── Fetch vault items ────────────────────────────────────────────────────
  const fetchItems = useCallback(async (showSpinner = true) => {
    if (showSpinner) setSpinning(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/analytics/api/vault/items');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Failed to load DataVault items');
    } finally {
      setLoading(false);
      if (showSpinner) setTimeout(() => setSpinning(false), 500);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchItems();
  }, [isOpen, fetchItems]);

  // ── Filter logic ─────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || item.name.toLowerCase().includes(q)
      || (item.source_name || '').toLowerCase().includes(q);
    const matchSource = sourceFilter === 'all'
      || item.source_name === sourceFilter;
    return matchSearch && matchSource;
  });

  // Collect unique sources for the filter dropdown
  const sources = [...new Set(items.map(i => i.source_name).filter(Boolean))].sort();

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleLoad = useCallback((item) => {
    if (!item.file_id && !item.table_name) {
      alert('This DataVault entry is corrupted (missing both file and table data).');
      return;
    }
    onClose();
    if (onLoadDataset) onLoadDataset(item);
  }, [onClose, onLoadDataset]);

  const handleDelete = useCallback(async (item) => {
    if (!window.confirm(`Remove "${item.name}" from DataVault? The underlying dataset file will NOT be deleted.`)) return;
    try {
      const res = await fetch(`/analytics/api/vault/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.detail || `HTTP ${res.status}`);
      }
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div className="dv-overlay" onClick={onClose} id="datavault-overlay">
        <div className="dv-panel" onClick={e => e.stopPropagation()} id="datavault-panel">

          {/* ── Header: title + search + filter + refresh in one row ── */}
          <div className="dv-header">
            <Archive size={18} className="dv-header-icon" strokeWidth={2.25} />
            <h2 className="dv-header-title">DataVault</h2>
            <div className="dv-header-tools">
              <div className="dv-search-wrapper">
                <Search size={14} />
                <input
                  id="datavault-search"
                  className="dv-search"
                  placeholder="Search datasets…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <span className="dv-tool-sep" aria-hidden="true" />
              <select
                id="datavault-source-filter"
                className="dv-source-filter"
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
              >
                <option value="all">All sources</option>
                {sources.map(s => (
                  <option key={s} value={s}>{s.toUpperCase()}</option>
                ))}
              </select>
              <span className="dv-tool-sep" aria-hidden="true" />
              <button
                type="button"
                id="datavault-refresh"
                className={`dv-refresh-btn ${spinning ? 'spinning' : ''}`}
                onClick={() => fetchItems(true)}
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <button className="dv-close-btn" onClick={onClose} title="Close" id="datavault-close" type="button">
              ×
            </button>
          </div>

          {/* ── List ── */}
          <div className="dv-list">
            {loading && items.length === 0 && (
              <div className="dv-empty">
                <div className="dv-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p>Loading datasets…</p>
              </div>
            )}

            {error && (
              <div className="dv-empty">
                <div className="dv-empty-icon"><AlertCircle size={28} /></div>
                <h3>Could not load DataVault</h3>
                <p>{error}</p>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="dv-empty">
                <div className="dv-empty-icon"><Archive size={28} /></div>
                {items.length === 0 ? (
                  <>
                    <h3>No datasets yet</h3>
                    <p>
                      DataVault is empty. Connect to a data source using{' '}
                      <strong>Get Data</strong> in the Home ribbon — every dataset
                      you import will appear here automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <h3>No matching datasets</h3>
                    <p>Try a different search term or clear the source filter.</p>
                  </>
                )}
              </div>
            )}

            {filtered.map(item => (
              <VaultCard
                key={item.id}
                item={item}
                onLoad={handleLoad}
                onPreview={setPreviewItem}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="dv-footer">
            <span>
              {filtered.length} of {items.length}
              {sourceFilter !== 'all' && ` · ${sourceFilter.toUpperCase()}`}
            </span>
            <span className="dv-footer-hint">Auto-saved when you connect a data source</span>
          </div>

        </div>
      </div>

      {/* Preview modal rendered outside the panel to avoid z-index clipping */}
      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </>
  );
};

export default DataVaultPanel;
