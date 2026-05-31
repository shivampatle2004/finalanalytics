import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiArrowLeft, FiPlay, FiPlus, FiCheck, FiCpu, FiDatabase, FiLoader } from 'react-icons/fi';
import { notebook } from '../../../shared/services/api';
import NotebookCell, { LANG_CONFIG } from './NotebookCell';

const ENGINE_OPTIONS = [
  { value: 'postgres', label: 'PostgreSQL', icon: FiDatabase, color: '#60a5fa' },
  { value: 'spark',    label: 'Spark',      icon: FiCpu,      color: '#f59e0b' },
];

/* Autosave debounce — 1.5 s after last change */
const AUTOSAVE_DELAY = 1500;

/* ── Between-cell insert bar — hidden until hover ── */
const BetweenCellBar = ({ onAddCode, onAddText }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '2px 0',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Solid accent line — only on hover */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: '50%',
        height: 2,
        backgroundColor: 'var(--df-accent)',
        borderRadius: 2,
        opacity: hovered ? 0.5 : 0,
        transition: 'opacity 0.15s',
      }} />

      {/* Buttons — only on hover, clearly visible */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'var(--df-bg-secondary)',
        padding: '0 16px',
        zIndex: 1,
        opacity: hovered ? 1 : 0,
        pointerEvents: hovered ? 'auto' : 'none',
        transition: 'opacity 0.15s',
      }}>
        <button
          onClick={onAddCode}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 18px', borderRadius: 7,
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
            backgroundColor: 'var(--df-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4,
            boxShadow: '0 2px 8px rgba(122,30,58,0.25)',
            transition: 'opacity 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <FiPlus size={14} /> Code
        </button>

        <button
          onClick={onAddText}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 18px', borderRadius: 7,
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
            backgroundColor: 'var(--df-surface)',
            color: 'var(--df-text)',
            border: '1.5px solid var(--df-border)',
            cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4,
            transition: 'background 0.12s, border-color 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.borderColor = 'var(--df-accent)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; e.currentTarget.style.borderColor = 'var(--df-border)'; e.currentTarget.style.color = 'var(--df-text)'; }}
        >
          <FiPlus size={14} /> Text
        </button>
      </div>
    </div>
  );
};

const NotebookEditor = ({ notebook: notebookData, onBack, onSave }) => {
  const notebookId = notebookData.id || notebookData._id;

  /* ── State ── */
  const [cells, setCells] = useState(() => {
    if (notebookData.cells?.length > 0) return notebookData.cells;
    return [{ id: `cell-${Date.now()}`, language: notebookData.language || 'sql', content: notebookData.content || '', output: null }];
  });
  const [defaultLanguage, setDefaultLanguage] = useState(notebookData.language || 'sql');
  const [engine, setEngine]                   = useState(notebookData.engine || 'postgres');
  const [runningCells, setRunningCells]       = useState(new Set());
  // 'idle' | 'saving' | 'saved'
  const [saveStatus, setSaveStatus]           = useState('idle');
  // drag state
  const dragIndexRef = useRef(null);

  const autosaveTimer = useRef(null);
  const isFirstRender = useRef(true);

  /* ── Sync when switching notebooks ── */
  useEffect(() => {
    if (notebookData.cells?.length > 0) setCells(notebookData.cells);
    else setCells([{ id: `cell-${Date.now()}`, language: notebookData.language || 'sql', content: notebookData.content || '', output: null }]);
    setDefaultLanguage(notebookData.language || 'sql');
    setEngine(notebookData.engine || 'postgres');
    setSaveStatus('idle');
    isFirstRender.current = true;
  }, [notebookId]);

  /* ── Autosave on cells / engine / language change ── */
  useEffect(() => {
    // Skip the very first render (just loaded)
    if (isFirstRender.current) { isFirstRender.current = false; return; }

    setSaveStatus('saving');
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (notebookData.type === 'sql') {
        onSave(notebookId, { content: cells.map(c => c.content).join('\n\n') });
      } else {
        onSave(notebookId, { cells, language: defaultLanguage, engine });
      }
      setSaveStatus('saved');
      // Reset to idle after 2 s so the indicator fades
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(autosaveTimer.current);
  }, [cells, engine, defaultLanguage]);

  /* ── Drag-to-reorder ── */
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);

  const handleDragStart = useCallback((index) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
  }, []);

  const handleDragOver = useCallback((index) => {
    if (dragIndexRef.current !== index) setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((dropIndex) => {
    const from = dragIndexRef.current;
    if (from == null || from === dropIndex) { setDragOverIndex(null); setDraggingIndex(null); return; }
    setCells(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
  }, []);

  /* ── Cell operations ── */
  const handleUpdateCell = useCallback((cellId, updates) => {
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, ...updates } : c));
  }, []);

  const handleDeleteCell = (cellId) => {
    setCells(prev => {
      if (prev.length <= 1) {
        // Replace with a fresh empty cell instead of leaving zero cells
        return [{ id: `cell-${Date.now()}`, language: defaultLanguage, content: '', output: null }];
      }
      return prev.filter(c => c.id !== cellId);
    });
  };

  const handleAddCodeCell = (afterIndex = null) => {
    const newCell = {
      id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      language: defaultLanguage,
      content: '',
      output: null,
    };
    setCells(prev => {
      if (afterIndex === null) return [...prev, newCell];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newCell);
      return next;
    });
  };

  const handleAddTextCell = (afterIndex = null) => {
    const newCell = {
      id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      language: 'markdown',
      content: '',
      output: null,
    };
    setCells(prev => {
      if (afterIndex === null) return [...prev, newCell];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newCell);
      return next;
    });
  };

  const handleMoveUp = (index) => {
    if (index <= 0) return;
    setCells(prev => { const n = [...prev]; [n[index - 1], n[index]] = [n[index], n[index - 1]]; return n; });
  };

  const handleMoveDown = (index) => {
    setCells(prev => {
      if (index >= prev.length - 1) return prev;
      const n = [...prev]; [n[index], n[index + 1]] = [n[index + 1], n[index]]; return n;
    });
  };

  /* ── Execution ── */
  const handleRunCell = useCallback(async (cell) => {
    if (runningCells.has(cell.id)) return;
    setRunningCells(prev => new Set(prev).add(cell.id));
    const runStartedAt = new Date().toISOString();
    handleUpdateCell(cell.id, { output: null, lastRunAt: runStartedAt });

    try {
      const cellEngine = cell.language === 'python' && engine !== 'spark' ? 'worker' : engine;
      const sessionId  = notebookId;
      const result     = await notebook.executeCell(cell.language, cell.content, cellEngine, 'public', sessionId);

      const output = {};
      if (!result.success) {
        output.error = result.message || 'Execution failed';
      } else {
        output.type         = result.output_type || 'text';
        output.image_base64 = result.image_base64;
        output.html_content = result.html_content;
        if (result.columns?.length > 0 && result.rows?.length > 0) {
          output.columns = result.columns;
          output.rows    = result.rows;
          output.text    = result.message || '';
          if (output.type === 'text') output.type = 'table';
        } else if (result.output) {
          output.text = result.output;
        } else {
          output.text = result.message || '✓ Executed successfully.';
        }
      }
      output.execution_time    = result.execution_time;
      output.execution_time_ms = result.execution_time_ms;
      output.row_count         = result.row_count || 0;
      output.rows_returned     = result.rows_returned || 0;
      output.status            = result.status || 'success';
      handleUpdateCell(cell.id, { output, lastRunAt: new Date().toISOString() });    } catch (err) {
      handleUpdateCell(cell.id, {
        output: {
          error: err.message || 'Failed to connect to backend.',
          execution_time: 0, row_count: 0,
        },
        lastRunAt: new Date().toISOString(),
      });
    } finally {
      setRunningCells(prev => { const n = new Set(prev); n.delete(cell.id); return n; });
    }
  }, [engine, runningCells, handleUpdateCell, notebookId]);

  const handleRunAll = useCallback(async () => {
    for (const cell of cells) {
      if (cell.content.trim()) await handleRunCell(cell);
    }
  }, [cells, handleRunCell]);

  const currentEngine = ENGINE_OPTIONS.find(e => e.value === engine) || ENGINE_OPTIONS[0];
  const isRunning     = runningCells.size > 0;

  /* ── Save status indicator ── */
  const SaveIndicator = () => {
    if (saveStatus === 'idle') return null;
    return (
      <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--df-text-muted)', fontFamily: 'var(--font-sans)' }}>
        {saveStatus === 'saving' && (
          <><span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Saving…</>
        )}
        {saveStatus === 'saved' && (
          <><FiCheck size={13} style={{ color: '#10b981' }} />Saved</>
        )}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border"
      style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between border-b flex-shrink-0"
        style={{
          backgroundColor: 'var(--df-surface)',
          borderColor: 'var(--df-border)',
          padding: '0 20px',
          minHeight: 56,
          gap: 16,
        }}
      >
        {/* LEFT — back + badge + name */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--df-text-soft)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; e.currentTarget.style.color = 'var(--df-icon-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-soft)'; }}
          >
            <FiArrowLeft size={18} />
          </button>

          <span
            className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded font-bold uppercase tracking-widest"
            style={{ backgroundColor: 'var(--df-accent)', color: '#fff' }}
          >
            {notebookData.type === 'sql' ? 'SQL Notebook' : `${LANG_CONFIG[defaultLanguage]?.label || 'Python'} Notebook`}
          </span>

          <h2
            className="text-[17px] font-semibold truncate"
            style={{ color: 'var(--df-strong)', fontFamily: 'var(--font-sans)' }}
          >
            {notebookData.name}
          </h2>
        </div>

        {/* RIGHT — engine + cell count + autosave status + Run All */}
        <div className="flex items-center gap-4 flex-shrink-0">

          {/* Engine toggle */}
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--df-border)' }}>
            {ENGINE_OPTIONS.map((opt) => {
              const Icon    = opt.icon;
              const isActive = engine === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setEngine(opt.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-all"
                  style={{
                    backgroundColor: isActive ? 'var(--df-accent-soft)' : 'transparent',
                    color: isActive ? opt.color : 'var(--df-text-muted)',
                    borderRight: opt.value !== ENGINE_OPTIONS[ENGINE_OPTIONS.length - 1].value ? '1px solid var(--df-border)' : 'none',
                  }}
                  title={`Use ${opt.label} engine`}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Cell count */}
          <span className="text-[13px] font-medium" style={{ color: 'var(--df-text-muted)' }}>
            {cells.length} cell{cells.length !== 1 ? 's' : ''}
          </span>

          {/* Autosave indicator */}
          <SaveIndicator />

          {/* Run All */}
          <button
            onClick={handleRunAll}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[14px] font-semibold transition-all"
            style={{
              backgroundColor: isRunning ? 'var(--df-surface)' : 'var(--df-gradient)',
              color: isRunning ? 'var(--df-text-muted)' : '#fff',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              border: isRunning ? '1px solid var(--df-border)' : 'none',
              minWidth: 110,
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { if (!isRunning) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <FiPlay size={14} />
            {isRunning ? 'Running…' : 'Run All'}
          </button>
        </div>
      </div>

      {/* ── Cells ── */}
      <div
        className="flex-1 overflow-y-auto df-scrollbar p-5"
        style={{ backgroundColor: 'var(--df-bg-secondary)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {cells.map((cell, index) => (
            <div key={cell.id}>
              {/* Drop indicator ABOVE this cell */}
              <div
                style={{
                  height: dragOverIndex === index ? 4 : 0,
                  marginBottom: dragOverIndex === index ? 6 : 0,
                  marginTop: dragOverIndex === index ? 2 : 0,
                  backgroundColor: 'var(--df-accent)',
                  borderRadius: 4,
                  transition: 'height 0.15s ease, margin 0.15s ease',
                  boxShadow: dragOverIndex === index ? '0 0 8px rgba(122,30,58,0.5)' : 'none',
                }}
              />
              <div style={{ marginBottom: 0 }}>
                <NotebookCell
                  cell={cell}
                  index={index}
                  total={cells.length}
                  onUpdate={handleUpdateCell}
                  onDelete={handleDeleteCell}
                  onRun={handleRunCell}
                  isRunning={runningCells.has(cell.id)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingIndex === index}
                  isDragOver={dragOverIndex === index}
                />
              </div>

              {/* ── Between-cell insert bar ── */}
              <BetweenCellBar
                onAddCode={() => handleAddCodeCell(index)}
                onAddText={() => handleAddTextCell(index)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        className="px-5 py-2 flex justify-between items-center border-t flex-shrink-0 text-[12px] font-medium uppercase tracking-wider"
        style={{ backgroundColor: 'var(--df-surface)', borderColor: 'var(--df-border)', color: 'var(--df-text-muted)' }}
      >
        <span className="flex items-center gap-2">
          {LANG_CONFIG[defaultLanguage]?.label || defaultLanguage}
          <span style={{ color: currentEngine.color }}>· {currentEngine.label}</span>
        </span>
        <span>
          {cells.reduce((acc, c) => acc + (c.content ? String(c.content).split('\n').length : 0), 0)} lines
        </span>
      </div>
    </div>
  );
};

export default NotebookEditor;
