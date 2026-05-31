import React, { useState, useEffect } from 'react';
import { FiTable, FiClock, FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiArrowUp, FiArrowDown, FiFilter, FiMoreHorizontal, FiShare2 } from 'react-icons/fi';

const ResultsPanel = ({ activeTab, onPageChange }) => {
  const [activeTabName, setActiveTabName] = useState('TABLE');

  if (!activeTab) return null;

  const { results, status, executionTime } = activeTab;
  const hasResults = results && !results.error && results.rows;
  const isActionQuery = hasResults && results.columns?.length === 0;

  const [pageInput, setPageInput] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: null, direction: 'asc' });
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [sortedRows, setSortedRows] = useState([]);

  useEffect(() => {
    if (results?.rows) {
      setSortedRows([...results.rows]);
    }
  }, [results?.rows]);

  useEffect(() => {
    if (sortConfig.column !== null && results?.rows) {
      const columnIndex = results.columns.indexOf(sortConfig.column);
      const newSortedRows = [...results.rows].sort((a, b) => {
        const valA = a[columnIndex];
        const valB = b[columnIndex];

        if (valA === valB) return 0;
        const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
        return valA < valB ? -1 * multiplier : 1 * multiplier;
      });
      setSortedRows(newSortedRows);
    }
  }, [sortConfig, results?.rows, results?.columns]);

  useEffect(() => {
    if (results?.pagination) {
      setPageInput(results.pagination.current_page.toString());
    }
  }, [results?.pagination]);

  const toggleSort = (column) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const downloadCSV = () => {
    if (!hasResults) return;
    const headers = results.columns.join(',');
    const rows = results.rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${new Date().getTime()}.csv`;
    a.click();
    setIsDownloadOpen(false);
  };

  const handlePageInputSubmit = () => {
    const newPage = parseInt(pageInput, 10);
    const maxPage = results?.pagination?.total_pages || 999999;
    if (!isNaN(newPage) && newPage >= 1 && newPage <= maxPage && newPage !== results.pagination.current_page) {
      onPageChange(newPage);
    } else {
      setPageInput(results?.pagination?.current_page?.toString() || '1');
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ── Results Tab Bar ── */}
      <div className="flex items-center justify-between px-5 h-[40px] shrink-0 border-b border-[var(--df-border-light)] bg-[var(--df-bg)]">
        <button
          onClick={() => setActiveTabName('TABLE')}
          className="flex items-center gap-1.5 h-full transition-all relative px-2 border-0 bg-transparent cursor-pointer"
          style={{ color: 'var(--df-accent)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--df-accent)' }}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Results Table</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ backgroundColor: 'var(--df-accent)' }}></div>
        </button>

        {/* ── Right Side Controls ── */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1" style={{ color: 'var(--df-text-muted)' }}>
            <FiClock size={10} style={{ opacity: 0.6 }} />
            <span style={{ fontSize: '10px', fontWeight: 500 }} className="tabular-nums">
              {status === 'success' && executionTime ? `${(executionTime / 1000).toFixed(2)}s` : '0.85s'}
            </span>
          </div>

          <button
            onClick={downloadCSV}
            className="p-0.5 rounded transition-all border-0 bg-transparent cursor-pointer flex items-center justify-center"
            style={{ color: 'var(--df-accent)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Download CSV"
          >
            <FiDownload size={11} strokeWidth={2.5} />
          </button>

          <div className="h-3 w-px bg-[var(--df-border-light)]"></div>

          {hasResults && results.pagination ? (
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--df-text-muted)' }}>Page</span>
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePageInputSubmit()}
                onBlur={handlePageInputSubmit}
                className="w-8 h-5 rounded text-center outline-none transition-all"
                style={{ fontSize: '10px', fontWeight: 500, backgroundColor: 'var(--df-bg)', border: '1px solid var(--df-border-light)', color: 'var(--df-strong)', padding: 0 }}
              />
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--df-text-muted)' }}>of</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--df-strong)' }}>{results.pagination.total_pages}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--df-text-muted)' }}>Page</span>
              <input
                type="text"
                value="6"
                readOnly
                className="w-8 h-5 rounded text-center outline-none transition-all cursor-default"
                style={{ fontSize: '10px', fontWeight: 500, backgroundColor: 'var(--df-bg)', border: '1px solid var(--df-border-light)', color: 'var(--df-strong)', padding: 0 }}
              />
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--df-text-muted)' }}>of</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--df-strong)' }}>200</span>
            </div>
          )}

          {/* Prev / Next bordered pill buttons */}
          <button
            onClick={() => {
              if (hasResults && results.pagination) {
                const cur = results.pagination.current_page;
                if (cur > 1) onPageChange(cur - 1);
              }
            }}
            className="rounded transition-all cursor-pointer hover:bg-[var(--df-sidebar-hover)]"
            style={{
              fontSize: '9px', fontWeight: 500,
              padding: '2px 8px',
              border: '1px solid var(--df-border-light)',
              backgroundColor: 'var(--df-bg)',
              color: 'var(--df-text-muted)'
            }}
          >
            Prev
          </button>
          <button
            onClick={() => {
              if (hasResults && results.pagination) {
                const cur = results.pagination.current_page;
                const tot = results.pagination.total_pages;
                if (cur < tot) onPageChange(cur + 1);
              }
            }}
            className="rounded transition-all cursor-pointer hover:bg-[var(--df-sidebar-hover)]"
            style={{
              fontSize: '9px', fontWeight: 500,
              padding: '2px 8px',
              border: '1px solid var(--df-border-light)',
              backgroundColor: 'var(--df-bg)',
              color: 'var(--df-text-muted)'
            }}
          >
            Next
          </button>

          {/* Total Rows */}
          <span style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--df-text-muted)', opacity: 0.7 }}>
            {hasResults && results.pagination?.total_rows ? `${results.pagination.total_rows} ROWS` : '10000 ROWS'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto df-scrollbar relative bg-[var(--df-bg)]">
        {!results && status !== 'running' && (
          <div className="flex flex-col items-center justify-center h-full py-20 opacity-60">
            <FiTable size={48} className="mb-4" style={{ color: 'var(--df-text-muted)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--df-text-muted)' }}>Run a query to see results</p>
          </div>
        )}

        {status === 'running' && (
          <div className="flex flex-col items-center justify-center h-full py-20 opacity-80">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-4" style={{ borderColor: 'var(--df-accent)', borderTopColor: 'transparent' }}></div>
            <p className="text-[13px] font-medium tracking-wide animate-pulse" style={{ color: 'var(--df-accent)' }}>Fetching data...</p>
          </div>
        )}

        {results?.error && status !== 'running' && (
          <div className="p-8">
            <div className="rounded-lg p-4 flex items-start gap-3 shadow-sm border border-red-500/20 bg-red-500/10">
              <FiXCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] font-mono leading-relaxed text-red-600 dark:text-red-400">
                {results.error}
              </p>
            </div>
          </div>
        )}

        {/* Multi-Statement Results — stacked */}
        {results?.multiResults && status !== 'running' && (
          <div className="p-3 flex flex-col gap-3">
            {results.multiResults.map((item, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden border border-[var(--df-border-light)] bg-[var(--df-bg)]">
                {/* Statement Header */}
                <div className={`px-4 py-2 flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase border-b border-[var(--df-border-light)] ${item.type === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'text-[var(--df-text-muted)]'}`}>
                  <span className="flex items-center gap-1.5 font-bold">
                    {item.type === 'error' ? <FiXCircle size={12} className="text-red-500" /> : <FiCheckCircle size={12} className="text-emerald-500" />}
                    Statement {item.index}
                  </span>
                  <span className="font-mono text-[10px] opacity-70 truncate max-w-[400px]" style={{ textTransform: 'none' }}>
                    {item.statement.split('\n')[0]}
                  </span>
                </div>

                {/* Error Content */}
                {item.type === 'error' && (
                  <div className="px-4 py-3 bg-red-500/5">
                    <p className="text-[13px] font-mono leading-relaxed text-red-600 dark:text-red-400">
                      {item.error}
                    </p>
                  </div>
                )}

                {/* Success Content — mini data table */}
                {item.type === 'success' && item.data?.rows && (
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto df-scrollbar">
                    <table className="df-table w-full text-left border-collapse text-[12px]">
                      <thead style={{ position: 'sticky', top: 0, zIndex: 5 }} className="bg-[var(--df-bg)]">
                        <tr>
                          <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap border-b border-[var(--df-border-light)]" style={{ color: 'var(--df-text-muted)', width: '32px' }}>#</th>
                          {item.data.columns?.map(col => (
                            <th key={col} className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap border-b border-[var(--df-border-light)]" style={{ color: 'var(--df-text-muted)' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.data.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-[var(--df-border-light)] transition-colors hover:bg-[var(--df-sidebar-hover)]">
                            <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap text-center" style={{ color: 'var(--df-text-muted)' }}>{ri + 1}</td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--df-strong)' }}>
                                <span className={cell === null ? 'opacity-30 italic' : ''}>
                                  {cell === null ? 'NULL' : String(cell)}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {item.data.rows.length === 0 && (
                          <tr>
                            <td colSpan={(item.data.columns?.length || 0) + 1} className="py-4 text-center text-[12px] italic" style={{ color: 'var(--df-text-muted)' }}>
                              Zero rows returned.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Single-Statement Results */}
        {hasResults && !results.multiResults && activeTabName === 'TABLE' && status !== 'running' && (
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="df-table w-full text-left border-collapse text-[13px]">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }} className="bg-[var(--df-bg)]">
                  <tr className="shadow-sm">
                    {/* Add row number column */}
                    <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider whitespace-nowrap border-b border-[var(--df-border-light)]" style={{ color: 'var(--df-text-muted)', width: '40px', minWidth: '40px' }}>#</th>
                    {results.columns.map(col => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider whitespace-nowrap border-b border-[var(--df-border-light)] cursor-pointer hover:bg-[var(--df-sidebar-hover)] group transition-colors"
                        style={{ color: 'var(--df-text-muted)' }}
                      >
                        <div className="flex items-center gap-2">
                          {col}
                          <span className={`${sortConfig.column === col ? 'opacity-100 text-[var(--df-accent)]' : 'opacity-0 group-hover:opacity-40'} transition-all`}>
                            {sortConfig.column === col && sortConfig.direction === 'desc' ? <FiArrowDown size={10} /> : <FiArrowUp size={10} />}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-[var(--df-border-light)] transition-colors hover:bg-[var(--df-sidebar-hover)]">
                      <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-center" style={{ color: 'var(--df-text-muted)' }}>
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: 'var(--df-strong)' }}>
                          <span className={cell === null ? 'opacity-30 italic' : ''}>
                            {cell === null ? 'NULL' : String(cell)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {results.rows.length === 0 && !isActionQuery && (
                    <tr>
                      <td colSpan={results.columns.length + 1} className="py-8 text-center text-[13px] italic" style={{ color: 'var(--df-text-muted)' }}>
                        Zero rows returned.
                      </td>
                    </tr>
                  )}
                  {isActionQuery && (
                    <tr>
                      <td className="py-8 text-center text-[13px] font-medium" style={{ color: 'var(--df-accent)' }}>
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FiCheckCircle size={24} className="text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">Query executed successfully. {results.rowCount} rows affected.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPanel;
