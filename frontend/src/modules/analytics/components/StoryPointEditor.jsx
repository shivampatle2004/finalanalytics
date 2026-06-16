import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Image as ImageIcon } from 'lucide-react';
import html2canvas from 'html2canvas';

function StateSection({ title, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="spe-section">
      <button
        type="button"
        className="spe-section-header"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="spe-section-title">{title}</span>
        {count !== undefined && <span className="spe-section-count">{count}</span>}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && <div className="spe-section-body">{children}</div>}
    </div>
  );
}

export default function StoryPointEditor({ point, onUpdate }) {
  const [title, setTitle] = useState(point.title || '');
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    setTitle(point.title || '');
  }, [point.id]);

  const handleTitleBlur = () => {
    if (title.trim() !== point.title) {
      onUpdate('title', title.trim() || 'Untitled');
    }
  };

  const handleCaptureCurrentWorkspace = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const containerEl = document.querySelector('.bi-report-surface');
      if (containerEl) {
        // Temporarily deselect visual to hide outline in snapshot
        const selectedEl = containerEl.querySelector('.bi-visual-card.selected');
        if (selectedEl) selectedEl.classList.remove('selected');

        const handles = containerEl.querySelectorAll('.bi-resize-handle');
        handles.forEach(h => h.style.display = 'none');

        const headers = containerEl.querySelectorAll('.bi-header-right');
        headers.forEach(h => h.style.display = 'none');

        // Wait a tiny bit for layout adjustment to complete
        await new Promise(resolve => setTimeout(resolve, 80));

        // Find the canvas element inside the container
        const canvasEl = containerEl.querySelector('.bi-canvas');
        
        let originalCanvasStyle = '';
        let originalContainerStyle = '';
        let scrollWidth = containerEl.scrollWidth || containerEl.offsetWidth;
        let scrollHeight = containerEl.scrollHeight || containerEl.offsetHeight;

        if (canvasEl) {
          originalCanvasStyle = canvasEl.getAttribute('style') || '';
          originalContainerStyle = containerEl.getAttribute('style') || '';

          const canvasGrid = canvasEl.querySelector('.bi-visuals-grid');
          const gridWidth = canvasGrid ? (canvasGrid.scrollWidth || canvasGrid.offsetWidth) : canvasEl.scrollWidth;
          const gridHeight = canvasGrid ? (canvasGrid.scrollHeight || canvasGrid.offsetHeight) : canvasEl.scrollHeight;
          const headerHeight = canvasEl.querySelector('.bi-report-header-banner')?.offsetHeight || 60;
          
          scrollWidth = Math.max(canvasEl.scrollWidth, gridWidth, canvasEl.offsetWidth);
          scrollHeight = Math.max(canvasEl.scrollHeight, gridHeight + headerHeight, canvasEl.offsetHeight);

          // Force containerEl and canvasEl to fully expand without scroll clipping
          canvasEl.style.setProperty('width', `${scrollWidth}px`, 'important');
          canvasEl.style.setProperty('height', `${scrollHeight}px`, 'important');
          canvasEl.style.setProperty('overflow', 'visible', 'important');
          canvasEl.style.setProperty('overflow-y', 'visible', 'important');
          canvasEl.style.setProperty('overflow-x', 'visible', 'important');

          containerEl.style.setProperty('width', `${scrollWidth}px`, 'important');
          containerEl.style.setProperty('height', `${scrollHeight}px`, 'important');
          containerEl.style.setProperty('overflow', 'visible', 'important');
        }

        // Wait a tiny bit for layout to settle with full dimensions
        await new Promise(resolve => setTimeout(resolve, 50));

        const canvas = await html2canvas(containerEl, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false,
          useCORS: true,
          scrollX: 0,
          scrollY: 0,
          width: scrollWidth,
          height: scrollHeight,
          windowWidth: scrollWidth,
          windowHeight: scrollHeight
        });

        // Restore styles
        if (canvasEl) {
          canvasEl.setAttribute('style', originalCanvasStyle);
          containerEl.setAttribute('style', originalContainerStyle);
        }

        // Restore layout styles
        if (selectedEl) selectedEl.classList.add('selected');
        handles.forEach(h => h.style.display = '');
        headers.forEach(h => h.style.display = '');

        const snapshotUrl = canvas.toDataURL('image/png');
        onUpdate('snapshot_url', snapshotUrl);
      } else {
        alert('Could not find dashboard container to capture.');
      }
    } catch (err) {
      console.error('Failed to capture dashboard snapshot inside editor:', err);
      alert('Capture failed: ' + err.message);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="spe-root">
      <input
        className="spe-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Story point title…"
      />

      {/* Premium Dashboard Snapshot Preview */}
      <div className="spe-preview-container" style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 4px 12px rgba(122,30,58,0.03)'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          color: '#475569',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <ImageIcon size={13} />
          <span>Dashboard Snapshot Preview</span>
        </div>

        {point.snapshot_url ? (
          <div style={{
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #cbd5e1',
            boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
            maxHeight: '260px',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img
              src={point.snapshot_url}
              alt={point.title}
              style={{
                maxWidth: '100%',
                maxHeight: '260px',
                objectFit: 'contain',
                display: 'block'
              }}
            />
            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10 }}>
              <button
                type="button"
                onClick={handleCaptureCurrentWorkspace}
                disabled={isCapturing}
                style={{
                  background: 'rgba(122,30,58,0.85)',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: isCapturing ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(4px)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => { if (!isCapturing) e.currentTarget.style.background = '#8c2546'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(122,30,58,0.85)'; }}
                title="Update snapshot with current workspace view"
              >
                {isCapturing ? 'Capturing...' : 'Recapture Snap'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            padding: '36px 16px',
            textAlign: 'center',
            border: '1.5px dashed #cbd5e1',
            borderRadius: '8px',
            color: '#64748b',
            fontSize: '13px',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>No dashboard snapshot captured</p>
            <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#94a3b8' }}>
              Add visuals directly from the workspace or capture the entire current view.
            </p>
            <button
              type="button"
              onClick={handleCaptureCurrentWorkspace}
              disabled={isCapturing}
              style={{
                background: '#7a1e3a',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '11px',
                cursor: isCapturing ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                boxShadow: '0 2px 4px rgba(122,30,58,0.1)'
              }}
              onMouseEnter={(e) => { if (!isCapturing) e.currentTarget.style.background = '#8c2546'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#7a1e3a'; }}
            >
              {isCapturing ? 'Capturing Dashboard...' : 'Capture Current Dashboard Snap'}
            </button>
          </div>
        )}
      </div>

      {/* Captured state panels */}
      <div className="spe-sections">
        <StateSection title="Active Filters" count={(point.filters || []).length}>
          {(point.filters || []).length === 0 ? (
            <span className="spe-empty">No filters captured.</span>
          ) : (
            <div className="spe-filter-list">
              {point.filters.map((f, i) => (
                <div key={i} className="spe-filter-item">
                  <span className="spe-filter-col">{f.column}</span>
                  <span className="spe-filter-op">{f.operator || '='}</span>
                  <span className="spe-filter-val">{String(f.value)}</span>
                </div>
              ))}
            </div>
          )}
        </StateSection>

        <StateSection title="Active Visuals" count={(point.active_visuals || []).length}>
          {(point.active_visuals || []).length === 0 ? (
            <span className="spe-empty">No visuals captured.</span>
          ) : (
            <div className="spe-visual-chips">
              {point.active_visuals.map((id, i) => (
                <span key={i} className="spe-chip">{id}</span>
              ))}
            </div>
          )}
        </StateSection>

        <StateSection title="Drill State" count={Object.keys(point.drill_state || {}).length}>
          {Object.keys(point.drill_state || {}).length === 0 ? (
            <span className="spe-empty">No drill state captured.</span>
          ) : (
            <pre className="spe-json">{JSON.stringify(point.drill_state, null, 2)}</pre>
          )}
        </StateSection>

        <StateSection title="Slicer Values" count={Object.keys(point.slicers || {}).length}>
          {Object.keys(point.slicers || {}).length === 0 ? (
            <span className="spe-empty">No slicer state captured.</span>
          ) : (
            <div className="spe-filter-list">
              {Object.entries(point.slicers).map(([col, val]) => (
                <div key={col} className="spe-filter-item">
                  <span className="spe-filter-col">{col}</span>
                  <span className="spe-filter-op">:</span>
                  <span className="spe-filter-val">{String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </StateSection>

        <StateSection title="Presentation Settings">
          <div className="spe-form-row">
            <label>Transition</label>
            <select
              value={point.transition || 'fade'}
              onChange={(e) => onUpdate('transition', e.target.value)}
              className="spe-select"
            >
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="zoom">Zoom</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="spe-form-row">
            <label>Auto-advance (ms)</label>
            <input
              type="number"
              value={point.duration || 3000}
              min={0}
              step={500}
              className="spe-input"
              onChange={(e) => onUpdate('duration', parseInt(e.target.value, 10) || 0)}
            />
            <span className="spe-hint">0 = manual</span>
          </div>
        </StateSection>
      </div>
    </div>
  );
}
