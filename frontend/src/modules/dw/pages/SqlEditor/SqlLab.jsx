import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useJobs } from '../../context/JobsContext';
import { useQueryTabs } from '../../hooks/useQueryTabs';
import QueryTabs from '../../components/QueryTabs';
import SqlEditor from '../../components/SqlEditor';
import ResultsPanel from '../../components/ResultsPanel';
import SchemaBrowser from '../../components/SchemaBrowser';
import SaveQueryModal from '../../components/SaveQueryModal';
import { FiDatabase, FiCommand, FiSave, FiSidebar, FiShare2, FiMoreVertical, FiCheckCircle, FiMaximize2, FiMinimize2, FiGrid, FiPlay, FiSend, FiTrash2, FiDownload, FiClock, FiGitCommit, FiCopy, FiEdit2, FiMove, FiRefreshCcw, FiLink, FiTable, FiPlusSquare, FiPieChart, FiBell } from 'react-icons/fi';

const SqlLab = () => {
  const { tabs, activeTabId, setActiveTabId, addTab, removeTab, updateTabContent, updateTabResults, renameTab } = useQueryTabs();
  const { executeQuery, saveQuery, sharedQuery, setSharedQuery, catalogs } = useData();
  const { addJob } = useJobs();
  const navigate = useNavigate();
  const [saveMsg, setSaveMsg] = useState('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const defaultCat = catalogs && Object.keys(catalogs)[0] ? Object.keys(catalogs)[0] : 'workspace';
  const defaultSch = catalogs && catalogs[defaultCat] ? Object.keys(catalogs[defaultCat])[0] : 'default';
  const [selectedContext, setSelectedContext] = useState({ catalog: defaultCat, schema: defaultSch });

  useEffect(() => {
    if (catalogs && selectedContext.catalog === 'workspace') {
      const firstCat = Object.keys(catalogs)[0];
      const firstSch = Object.keys(catalogs[firstCat] || {})[0];
      if (firstCat && firstSch) setSelectedContext({ catalog: firstCat, schema: firstSch });
    }
  }, [catalogs, selectedContext.catalog]);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [editorHeightPercent, setEditorHeightPercent] = useState(50);
  const [isAutoHeight, setIsAutoHeight] = useState(true);
  const [isResizingV, setIsResizingV] = useState(false);
  const editorRef = useRef(null);
  const activeTab = tabs.find(t => t.id === activeTabId);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingV) return;
      setIsAutoHeight(false);
      const container = document.getElementById('editor-results-container');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top;
      const newPercent = (relativeY / containerRect.height) * 100;
      if (newPercent > 15 && newPercent < 85) setEditorHeightPercent(newPercent);
    };
    const handleMouseUp = () => setIsResizingV(false);
    if (isResizingV) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingV]);

  useEffect(() => {
    if (sharedQuery && activeTabId) { updateTabContent(activeTabId, sharedQuery); setSharedQuery(null); }
  }, [sharedQuery, activeTabId, updateTabContent, setSharedQuery]);

  // Smart SQL statement splitter
  const splitStatements = (sql) => {
    const stmtKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|EXPLAIN|TRUNCATE)\b/i;
    const lines = sql.split('\n');
    const statements = [];
    let current = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (stmtKeywords.test(line) && current.length > 0) {
        const stmt = current.join('\n').replace(/;\s*$/g, '').trim();
        if (stmt) statements.push(stmt);
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) {
      const stmt = current.join('\n').replace(/;\s*$/g, '').trim();
      if (stmt) statements.push(stmt);
    }
    return statements;
  };

  const runQueryOnTab = async (tabId, sqlContent, page = 1) => {
    if (!sqlContent) return;
    updateTabResults(tabId, { results: null, status: 'running', executionTime: null });
    const start = performance.now();
    try {
      await new Promise(r => setTimeout(r, 300));
      const statements = splitStatements(sqlContent);
      if (statements.length === 0) return;

      const allResults = [];
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        let pageSize = 50;
        try {
          const schemaNode = catalogs?.[selectedContext.catalog]?.[selectedContext.schema];
          const physicalSchema = schemaNode?.__meta__?.physical_schema_name || selectedContext.schema;
          const result = await executeQuery(stmt, physicalSchema, page, pageSize);
          if (result.success === false) {
            allResults.push({ type: 'error', statement: stmt, index: i + 1, error: result.message || 'Error executing query' });
          } else {
            allResults.push({ type: 'success', statement: stmt, index: i + 1, data: result });
          }
        } catch (e) {
          allResults.push({ type: 'error', statement: stmt, index: i + 1, error: e.message });
        }
      }

      const end = performance.now();
      const timeSec = ((end - start) / 1000).toFixed(2) + 's';

      if (allResults.length === 1) {
        const r = allResults[0];
        if (r.type === 'error') {
          updateTabResults(tabId, { results: { error: r.error }, status: 'error', executionTime: timeSec });
        } else {
          updateTabResults(tabId, { results: r.data, status: 'success', executionTime: timeSec });
        }
      } else {
        const hasError = allResults.some(r => r.type === 'error');
        const hasSuccess = allResults.some(r => r.type === 'success');
        updateTabResults(tabId, {
          results: { multiResults: allResults },
          status: hasError && !hasSuccess ? 'error' : hasError ? 'partial' : 'success',
          executionTime: timeSec
        });
      }
    } catch (e) {
      updateTabResults(tabId, { results: { error: e.message }, status: 'error', executionTime: '0.00s' });
    }
  };

  const handleExecute = () => {
    if (!editorRef.current) {
      if (activeTab?.content) runQueryOnTab(activeTabId, activeTab.content);
      return;
    }
    const selectedText = editorRef.current.getSelectedText();
    if (selectedText && selectedText.trim()) {
      runQueryOnTab(activeTabId, selectedText.trim());
    } else {
      if (activeTab?.content) runQueryOnTab(activeTabId, activeTab.content);
    }
  };

  const handleDownloadResults = () => {
    if (!activeTab?.results?.results) return;
    const res = activeTab.results.results;
    let columns, rows;
    if (res.multiResults) {
      const last = [...res.multiResults].reverse().find(r => r.type === 'success');
      if (!last) return;
      columns = last.data.columns;
      rows = last.data.rows;
    } else {
      columns = res.columns;
      rows = res.rows;
    }
    if (!columns || !rows || rows.length === 0) return;
    const csvHeader = columns.join(',');
    const csvRows = rows.map(row => row.map(cell => {
      const str = String(cell == null ? '' : cell);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(','));
    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_results_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveMsg('Downloaded!'); setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleRunAsJob = (query) => {
    if (!query || !query.trim()) return;
    navigate('/jobs/create-job', { state: { initialQuery: query.trim() } });
  };

  const handleTablePreview = async (tableName) => {
    const sql = `SELECT * \nFROM ${tableName}\nLIMIT 10`;
    const newId = addTab(sql);
    if (newId) runQueryOnTab(newId, sql);
  };

  const handleSave = () => { if (!activeTab?.content) return; setIsSaveModalOpen(true); };
  const onConfirmSave = (name, description) => { saveQuery(name, activeTab.content); renameTab(activeTabId, name); setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 2000); };
  const handleShare = () => { if (!activeTab?.content) return; navigator.clipboard.writeText(activeTab.content); setSaveMsg('Copied to clipboard!'); setTimeout(() => setSaveMsg(''), 2000); };
  const handleLoadQuery = (name, content) => { updateTabContent(activeTabId, content); renameTab(activeTabId, name); setSaveMsg('Query loaded!'); setTimeout(() => setSaveMsg(''), 1500); };

  const handleFormat = () => {
    if (!activeTab?.content) return;
    let sql = activeTab.content;
    const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INNER JOIN', 'LEFT JOIN', 'OUTER JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'AS', 'COUNT', 'SUM', 'DISTINCT', 'HAVING', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM'];
    keywords.forEach(kw => { const reg = new RegExp(`\\b${kw}\\b`, 'gi'); sql = sql.replace(reg, kw.toUpperCase()); });
    const majorClauses = ['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INNER JOIN', 'LEFT JOIN', 'OUTER JOIN', 'RIGHT JOIN', 'HAVING', 'VALUES', 'SET'];
    majorClauses.forEach(cl => { const reg = new RegExp(`\\s*\\b${cl}\\b`, 'g'); sql = sql.replace(reg, `\n${cl}`); });
    sql = sql.replace(/\n\s*\n/g, '\n').trim();
    updateTabContent(activeTabId, sql); setSaveMsg('Formatted!'); setTimeout(() => setSaveMsg(''), 1500);
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn font-sans" style={{ backgroundColor: 'var(--df-bg)', color: 'var(--df-text)' }}>
      {/* ── Row 1: Page Heading ── */}
      {!isFocusMode && (
        <div style={{ padding: '20px 24px 14px 20px', borderBottom: '1px solid var(--df-border-light)', backgroundColor: 'var(--df-bg)', flexShrink: 0 }}>
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>
                SQL Lab
              </h1>
              <p className="text-[14px] mt-1" style={{ color: 'var(--df-text-muted)', opacity: 0.8, margin: 0 }}>
                Run queries, explore schemas, and analyze your data
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Workspace Container (Sleek unified desktop workbench) ── */}
      <div className={`flex-1 flex overflow-hidden min-h-0 relative ${isFocusMode ? 'p-0' : 'p-6'}`} style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
        <div className={`flex-1 flex h-full min-w-0 overflow-hidden ${isFocusMode ? '' : 'rounded-xl shadow-sm'}`} style={{ backgroundColor: 'var(--df-bg)', border: isFocusMode ? 'none' : '1px solid var(--df-border-light)' }}>
          {/* Sidebar Panel */}
          <div
            style={{
              width: (isSidebarOpen && !isFocusMode) ? 260 : 0,
              opacity: (isSidebarOpen && !isFocusMode) ? 1 : 0,
              borderRight: (isSidebarOpen && !isFocusMode) ? '1px solid var(--df-border-light)' : 'none',
              backgroundColor: 'var(--df-sidebar-bg)'
            }}
            className="transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] h-full overflow-hidden shrink-0 flex flex-col"
          >
            <div className="w-[260px] h-full flex flex-col overflow-hidden">
              <div className="px-4 py-3.5 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--df-border-light)' }}>
                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--df-text-muted)' }}>SCHEMA BROWSER</span>
              </div>
              <SchemaBrowser onTablePreview={handleTablePreview} hideHeader={true} />
            </div>
          </div>

          {/* Right Workspace Column */}
          <div className="flex-1 flex flex-col h-full min-w-0" style={{ backgroundColor: 'var(--df-bg)' }}>
            {/* Header Row 1: Integrated Tab Bar */}
            <div className="flex items-center justify-between border-b h-[40px] shrink-0 pl-2 pr-4" style={{ borderColor: 'var(--df-border-light)' }}>
              <div className="flex-1 h-full overflow-hidden">
                <QueryTabs tabs={tabs} activeTabId={activeTabId} onTabChange={setActiveTabId} onTabAdd={() => addTab()} onTabClose={removeTab} onTabRename={renameTab} />
              </div>
            </div>

            {/* Header Row 2: Action Toolbar */}
            <div className="flex items-center justify-between border-b h-[48px] px-4 shrink-0" style={{ borderColor: 'var(--df-border-light)' }}>
              {/* Left Side consolidations */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="dw-btn-secondary flex items-center justify-center !w-[34px] !p-0"
                  title="Toggle Sidebar"
                >
                  <FiSidebar size={16} />
                </button>

                <div className="h-5 w-px mx-1" style={{ backgroundColor: 'var(--df-border)' }}></div>

                {/* Highly Polished Separate Action Buttons */}
                <button
                  onClick={handleExecute}
                  className="dw-btn-primary"
                >
                  <FiPlay size={13} className="fill-current" />
                  <span>Run</span>
                </button>

                <button
                  onClick={handleSave}
                  className="dw-btn-secondary flex items-center gap-1.5"
                >
                  <FiSave size={13} />
                  <span>Save</span>
                </button>
              </div>

              {/* Right Side toolbar tools */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleFormat}
                  className="dw-btn-secondary flex items-center gap-1.5"
                >
                  <FiCommand size={14} />
                  <span>Format</span>
                </button>

                <button
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className="dw-btn-secondary flex items-center gap-1.5"
                >
                  {isFocusMode ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
                  <span>Focus</span>
                </button>

                <div className="h-5 w-px mx-1" style={{ backgroundColor: 'var(--df-border)' }}></div>

                <button
                  onClick={handleShare}
                  className="dw-btn-secondary flex items-center gap-1.5"
                >
                  <FiShare2 size={14} />
                  <span>Share</span>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                    className="dw-btn-secondary flex items-center justify-center !w-[34px] !p-0"
                  >
                    <FiMoreVertical size={16} />
                  </button>

                  {isMoreMenuOpen && (
                    <div className="dw-dropdown-menu absolute right-0 top-full mt-2 w-[220px]" style={{ zIndex: 1000 }}>
                      <div className="flex flex-col">
                        <button className="dw-dropdown-item"><FiShare2 size={13} /> Share...</button>
                        <button className="dw-dropdown-item"><FiClock size={13} /> Schedule...</button>
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--df-border-light)' }}></div>
                        <button className="dw-dropdown-item"><FiEdit2 size={13} /> Rename...</button>
                        <button className="dw-dropdown-item"><FiMove size={13} /> Move...</button>
                        <button className="dw-dropdown-item" style={{ color: 'var(--df-danger)' }}><FiTrash2 size={13} /> Move to trash</button>
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--df-border-light)' }}></div>
                        <button className="dw-dropdown-item"><FiRefreshCcw size={13} /> Revert changes</button>
                        <button className="dw-dropdown-item"><FiCopy size={13} /> Copy legacy query ID</button>
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--df-border-light)' }}></div>
                        <button className="dw-dropdown-item"><FiTable size={13} /> Create or modify table...</button>
                        <button className="dw-dropdown-item justify-between">
                          <span className="flex items-center gap-3"><FiPlusSquare size={13} /> Add data</span>
                          <FiShare2 size={12} className="opacity-40" />
                        </button>
                        <button className="dw-dropdown-item"><FiPieChart size={13} /> Add to dashboard</button>
                        <button className="dw-dropdown-item justify-between">
                          <span className="flex items-center gap-3"><FiBell size={13} /> Create alert</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-capitalize" style={{ border: '1px solid var(--df-border)', backgroundColor: 'var(--df-sidebar-hover)', color: 'var(--df-text-muted)' }}>Preview</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Editor & Results Workspace (SaaS Dock Style) ── */}
            <div id="editor-results-container" className="flex-1 flex flex-col overflow-hidden min-h-0 bg-transparent">
              <div className="flex flex-col h-full overflow-hidden min-h-0">

                {/* Editor Container Panel */}
                <div
                  style={{
                    height: activeTab ? `${editorHeightPercent}%` : '50%',
                    padding: '0px',
                    flexShrink: 0,
                    minHeight: '200px'
                  }}
                  className="flex flex-col min-h-0 bg-transparent"
                >
                  <div className="flex-1 flex flex-col overflow-hidden bg-transparent min-h-0">
                    {activeTab ? (
                      <SqlEditor
                        ref={editorRef}
                        value={activeTab.content}
                        onChange={(v) => updateTabContent(activeTab.id, v)}
                        onExecute={handleExecute}
                        onFormat={handleFormat}
                        onSave={handleSave}
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center relative group overflow-hidden bg-transparent">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--df-accent-soft)', color: 'var(--df-accent)' }}><FiDatabase size={20} /></div>
                        <h3 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--df-strong)' }}>New Query</h3>
                        <button onClick={() => addTab()} className="dw-btn-primary mt-4">+ Create Query</button>
                      </div>
                    )}

                    {/* ── READY Status Bar ── */}
                    <div className="h-[38px] flex items-center justify-between px-5 flex-shrink-0 border-t select-none" style={{ borderColor: 'var(--df-border-light)', backgroundColor: 'var(--df-bg)' }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border" style={{ borderColor: 'var(--df-success)', backgroundColor: 'var(--df-success-soft)', color: 'var(--df-success)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--df-success)' }}></span>
                          <span className="text-[10px] font-bold tracking-wider uppercase">READY</span>
                        </div>
                        <div className="h-3 w-px" style={{ backgroundColor: 'var(--df-border-light)' }}></div>
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border" style={{ borderColor: 'var(--df-border-light)', backgroundColor: 'var(--df-bg-secondary)', color: 'var(--df-text-muted)' }}>
                          <span className="text-[10px] font-semibold tracking-wider opacity-60">CONTEXT:</span>
                          <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--df-strong)' }}>
                            {selectedContext.catalog.toUpperCase()}.{selectedContext.schema.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[9.5px] font-semibold tracking-widest uppercase opacity-70" style={{ color: 'var(--df-text-muted)' }}>
                        <span>CTRL+ENTER: RUN</span>
                        <span>CTRL+S: SAVE</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Drag & Resize Handle (Supabase Splitter) ── */}
                {!isFocusMode && (
                  <div
                    className="cursor-ns-resize select-none flex-shrink-0 relative group"
                    style={{
                      height: '5px',
                      margin: '-2px 0',
                      zIndex: 20,
                      backgroundColor: 'transparent'
                    }}
                    onMouseDown={() => setIsResizingV(true)}
                  >
                    <div
                      style={{
                        height: '1px',
                        width: '100%',
                        position: 'absolute',
                        top: '2px',
                        left: 0,
                        backgroundColor: 'var(--df-border-strong)',
                        transition: 'background-color 0.15s ease, height 0.15s ease, top 0.15s ease'
                      }}
                      className="group-hover:bg-[var(--df-accent)] group-hover:h-[2.5px] group-hover:top-[1.25px]"
                    />
                  </div>
                )}

                {/* Results Container Panel */}
                <div
                  style={{
                    padding: '0px',
                    flex: 1,
                    overflow: 'hidden',
                    minHeight: '200px'
                  }}
                  className="flex flex-col bg-transparent"
                >
                  <div className="flex flex-col h-full bg-transparent">
                    {activeTab ? <ResultsPanel activeTab={activeTab} onPageChange={(page) => runQueryOnTab(activeTab.id, activeTab.content, page)} /> : (
                      <div className="h-full flex flex-col items-center justify-center text-sm space-y-2 opacity-40 bg-transparent" style={{ color: 'var(--df-text-muted)' }}>
                        <FiTable size={32} />
                        <span className="font-bold tracking-widest uppercase text-[10px]">Results Table</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
      <SaveQueryModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={onConfirmSave} initialName={activeTab?.name?.startsWith('Query') ? '' : activeTab?.name} />

      {/* ── Success Toast Alert ── */}
      {saveMsg && (
        <div
          className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl"
          style={{
            borderColor: 'var(--df-border-light)',
            backgroundColor: 'var(--df-bg)',
            animation: 'osa-toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)'
          }}
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: 'var(--df-success-soft)', color: 'var(--df-success)' }}>
            <FiCheckCircle size={13} className="stroke-[2.5]" />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--df-strong)' }}>{saveMsg}</span>
          <style>{`
            @keyframes osa-toast-slide-in {
              from { transform: translateY(16px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default SqlLab;