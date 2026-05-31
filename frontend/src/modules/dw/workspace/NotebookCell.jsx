import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiPlay, FiTrash2, FiChevronDown, FiCheck, FiCopy,
  FiLoader, FiAlertCircle
} from 'react-icons/fi';

/* ── 6-dot drag handle (like Databricks / Notion) ── */
const DragDots = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
    <circle cx="2" cy="2"  r="1.5" />
    <circle cx="8" cy="2"  r="1.5" />
    <circle cx="2" cy="8"  r="1.5" />
    <circle cx="8" cy="8"  r="1.5" />
    <circle cx="2" cy="14" r="1.5" />
    <circle cx="8" cy="14" r="1.5" />
  </svg>
);

export const LANG_CONFIG = {
  sql:      { label: 'SQL',      color: '#60a5fa', placeholder: '-- Write SQL here...\nSELECT * FROM table_name LIMIT 10;' },
  python:   { label: 'Python',   color: '#34d399', placeholder: '# Write Python here...\nprint("Hello, DataForge!")' },
  markdown: { label: 'Text',     color: '#94a3b8', placeholder: 'Write notes, documentation, or markdown here...' },
};

/* ── Format last-run timestamp ── */
function formatRunTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Format duration ── */
function formatDuration(ms) {
  if (ms == null) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Language dropdown ── */
const CellLanguageDropdown = ({ language, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const config = LANG_CONFIG[language] || LANG_CONFIG.sql;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          backgroundColor: 'var(--df-surface)',
          color: config.color,
          border: '1px solid var(--df-border)',
          cursor: 'pointer',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          width: 'fit-content',
          maxWidth: 90,
          flexShrink: 0,
        }}
      >
        {config.label}
        <FiChevronDown size={10} style={{ flexShrink: 0 }} />
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: 4,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 50,
            padding: '4px 0',
            minWidth: 100,
            backgroundColor: 'var(--df-card-bg)',
            border: '1px solid var(--df-border)',
          }}
        >
          {Object.entries(LANG_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setIsOpen(false); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: cfg.color,
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {key === language && <FiCheck size={10} />}
              {cfg.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── NotebookCell ── */
const NotebookCell = ({
  cell, index, total,
  onUpdate, onDelete, onRun,
  isRunning,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragOver, isDragging,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  const config = LANG_CONFIG[cell.language] || LANG_CONFIG.sql;

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(80, ta.scrollHeight) + 'px'; }
  }, []);

  useEffect(() => { autoResize(); }, [cell.content, autoResize]);

  /* ── Derive last-run info from output ── */
  const lastRunAt  = cell.lastRunAt ?? null;
  const durationMs = cell.output?.execution_time_ms ?? null;
  const runSuccess = cell.output && !cell.output.error;
  const hasOutput  = !!cell.output;

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: isFocused
          ? 'var(--df-accent)'
          : isDragOver
          ? 'var(--df-accent)'
          : isHovered
          ? 'rgba(122,30,58,0.35)'
          : 'var(--df-border)',
        backgroundColor: 'var(--df-card-bg)',
        boxShadow: isFocused
          ? '0 0 0 2px var(--df-accent-soft)'
          : 'none',
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? 'scale(0.99)' : 'scale(1)',
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s, transform 0.15s',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(index); }}
      onDrop={(e) => { e.preventDefault(); onDrop?.(index); }}
    >
      {/* ── Toolbar ── */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)' }}
      >
        {/* LEFT: drag handle + index + language */}
        <div className="flex items-center gap-2.5">

          {/* Drag handle */}
          <div
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(index); }}
            onDragEnd={() => onDragEnd?.()}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1.5 rounded transition-colors"
            style={{ color: 'var(--df-text-muted)', touchAction: 'none', lineHeight: 0 }}
            title="Drag to reorder"
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <DragDots />
          </div>

          {/* Cell index */}
          <span
            className="text-[12px] font-bold tracking-wider select-none"
            style={{ color: 'var(--df-text-muted)', minWidth: 24 }}
          >
            [{index + 1}]
          </span>

          {/* Language dropdown */}
          <CellLanguageDropdown
            language={cell.language}
            onChange={(lang) => onUpdate(cell.id, { language: lang })}
          />

          {/* ── Last run status ── */}
          {hasOutput && (
            <div className="flex items-center gap-1.5 ml-1">
              {runSuccess ? (
                <FiCheck size={13} style={{ color: '#10b981', flexShrink: 0 }} />
              ) : (
                <FiAlertCircle size={13} style={{ color: 'var(--df-danger)', flexShrink: 0 }} />
              )}
              <span
                className="text-[12px] font-medium"
                style={{ color: 'var(--df-text-muted)', fontFamily: 'var(--font-sans)' }}
              >
                {lastRunAt ? formatRunTime(lastRunAt) : '—'}
                {durationMs != null && (
                  <span style={{ color: runSuccess ? '#10b981' : 'var(--df-danger)', marginLeft: 4 }}>
                    ({formatDuration(durationMs)})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* RIGHT: delete + run */}
        <div className="flex items-center gap-2">

          {/* Delete — always visible */}
          <button
              onClick={() => onDelete(cell.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border"
              style={{ color: 'var(--df-danger)', borderColor: 'var(--df-danger)', backgroundColor: 'transparent', opacity: 0.75 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-danger-soft)'; e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.opacity = '0.75'; }}
              title="Delete cell"
            >
              <FiTrash2 size={14} /> Delete
            </button>

          {/* Run — only for code cells */}
          {cell.language !== 'markdown' && (
            <button
              onClick={() => onRun(cell)}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
              style={{
                backgroundColor: isRunning ? 'var(--df-surface)' : 'var(--df-gradient)',
                color: isRunning ? 'var(--df-text-muted)' : '#fff',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                border: isRunning ? '1px solid var(--df-border)' : 'none',
                minWidth: 82,
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => { if (!isRunning) e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {isRunning
                ? <><FiLoader size={13} className="animate-spin" /> Running…</>
                : <><FiPlay size={13} /> Run</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Code area ── */}
      <div style={{ backgroundColor: 'var(--df-code-bg)' }}>
        <textarea
          ref={textareaRef}
          value={cell.content}
          onChange={(e) => { onUpdate(cell.id, { content: e.target.value }); autoResize(); }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full p-4 font-mono text-[13px] leading-relaxed resize-none focus:outline-none df-scrollbar"
          style={{ backgroundColor: 'transparent', color: 'var(--df-text)', minHeight: '80px', border: 'none', caretColor: config.color }}
          placeholder={config.placeholder}
          spellCheck="false"
        />
      </div>

      {/* ── Output area ── */}
      {cell.output && (
        <div className="border-t" style={{ backgroundColor: 'var(--df-bg-secondary)', borderColor: 'var(--df-border)' }}>
          {/* Output header */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status badge */}
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{
                  backgroundColor: cell.output.error ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                  color: cell.output.error ? 'var(--df-danger)' : '#10b981',
                }}
              >
                {cell.output.error ? '✕ Error' : '✓ Success'}
              </span>

              {/* Duration */}
              {durationMs != null && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}
                >
                  {formatDuration(durationMs)}
                </span>
              )}

              {/* Row count */}
              {cell.output.rows_returned > 0 && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}
                >
                  {cell.output.rows_returned} rows
                </span>
              )}

              {/* Output type */}
              {!cell.output.error && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ backgroundColor: 'var(--df-surface)', color: 'var(--df-text-muted)' }}
                >
                  {cell.output.type || 'text'}
                </span>
              )}
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(cell.output.text || cell.output.error || '')}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--df-text-muted)' }}
              title="Copy output"
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-muted)'; }}
            >
              <FiCopy size={13} />
            </button>
          </div>

          {/* Error */}
          {cell.output.error && (
            <div className="px-4 pb-3">
              <pre className="text-[12px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--df-danger)' }}>
                {cell.output.error}
              </pre>
            </div>
          )}

          {/* Text / stdout */}
          {cell.output.text && !cell.output.error && cell.output.type !== 'markdown' && (
            <div className="px-4 pb-3">
              <pre className="text-[12px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--df-text-soft)' }}>
                {cell.output.text}
              </pre>
            </div>
          )}

          {/* Markdown */}
          {cell.output.type === 'markdown' && !cell.output.error && (
            <div className="px-4 pb-3 text-[13px] leading-relaxed" style={{ color: 'var(--df-text-soft)' }}>
              {cell.output.text}
            </div>
          )}

          {/* Image (Matplotlib) */}
          {cell.output.type === 'image' && cell.output.image_base64 && !cell.output.error && (
            <div className="px-4 pb-3">
              <div className="p-2 rounded border bg-white inline-block" style={{ borderColor: 'var(--df-border)' }}>
                <img src={cell.output.image_base64} alt="Chart Output" className="max-w-full h-auto" />
              </div>
            </div>
          )}

          {/* HTML / Plotly */}
          {(cell.output.type === 'html' || cell.output.type === 'plotly') && cell.output.html_content && !cell.output.error && (
            <div className="px-4 pb-3 overflow-x-auto bg-white rounded border p-2" style={{ borderColor: 'var(--df-border)' }}>
              <div dangerouslySetInnerHTML={{ __html: cell.output.html_content }} />
            </div>
          )}

          {/* Table */}
          {cell.output.type === 'table' && cell.output.columns?.length > 0 && cell.output.rows?.length > 0 && (
            <div className="px-4 pb-3 overflow-x-auto df-scrollbar">
              <table className="w-full text-[12px] font-mono border-collapse">
                <thead>
                  <tr>
                    {cell.output.columns.map((col, i) => (
                      <th key={`th-${i}`} className="text-left px-3 py-1.5 font-semibold border-b"
                        style={{ borderColor: 'var(--df-border)', color: 'var(--df-strong)', backgroundColor: 'var(--df-surface)' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cell.output.rows.slice(0, 50).map((row, ri) => (
                    <tr key={`tr-${ri}`} style={{ backgroundColor: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      {cell.output.columns.map((col, ci) => (
                        <td key={`td-${ri}-${ci}`} className="px-3 py-1.5 border-b"
                          style={{ borderColor: 'var(--df-border)', color: 'var(--df-text-soft)' }}>
                          {row[col] != null ? String(row[col]) : <span style={{ color: 'var(--df-text-muted)', fontStyle: 'italic' }}>NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {cell.output.rows.length > 50 && (
                <div className="text-[11px] text-center py-2" style={{ color: 'var(--df-text-muted)' }}>
                  Showing 50 of {cell.output.rows.length} rows
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotebookCell;
