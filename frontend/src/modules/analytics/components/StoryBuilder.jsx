/**
 * StoryBuilder.jsx
 * Main story editing workspace.
 * Layout: Left sidebar (story points list) | Center (point editor) | Right (narrative editor)
 * Toolbar at top: Save · Present · Export · Add Point · Settings
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Plus, Play, FileDown, Save, Trash2, Copy, Settings,
  GripVertical, ChevronDown, ChevronUp, BookOpen, AlertCircle,
  CheckCircle, Loader2, X, Edit2
} from 'lucide-react';
import {
  getStory, updateStory, addStoryPoint, updateStoryPoint,
  deleteStoryPoint, duplicateStoryPoint, reorderStoryPoints,
  exportStoryPdf, exportStoryPptx, downloadBlob,
} from '../services/storiesApi';
import StoryPresentation from './StoryPresentation';
import StorySidebar from './StorySidebar';
import StoryToolbar from './StoryToolbar';
import StoryPointEditor from './StoryPointEditor';
import './StoryBuilder.css';

// ── Drag-and-drop order helper ────────────────────────────────────────────────
function reorder(list, from, to) {
  const result = [...list];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StoryBuilder({ storyId, fileId, userId, onClose, currentDashboardState }) {
  const [story, setStory] = useState(null);
  const [points, setPoints] = useState([]);
  const [activePointId, setActivePointId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error' | null
  const [showPresent, setShowPresent] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [storyName, setStoryName] = useState('');
  const [storyDesc, setStoryDesc] = useState('');

  // Drag state
  const dragFromRef = useRef(null);
  const hasPromptedRef = useRef(false);

  const activePoint = points.find((p) => p.id === activePointId) || null;

  // ── Load story ──────────────────────────────────────────────────────────────
  const loadStory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStory(storyId);
      setStory(data);
      setStoryName(data.name || '');
      setStoryDesc(data.description || '');
      const sorted = [...(data.points || [])].sort((a, b) => a.sort_order - b.sort_order);
      setPoints(sorted);
      if (sorted.length > 0 && !activePointId) {
        setActivePointId(sorted[0].id);
      }
    } catch (e) {
      alert('Failed to load story: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => { loadStory(); }, [loadStory]);

  // ── Pending points ingestion from sessionStorage ─────────────────────────────
  useEffect(() => {
    if (loading || !storyId || hasPromptedRef.current) return;
    const pendingJson = sessionStorage.getItem('osa_story_pending_add');
    if (!pendingJson) return;
    hasPromptedRef.current = true;
    try {
      const pendingPoints = JSON.parse(pendingJson);
      if (Array.isArray(pendingPoints) && pendingPoints.length > 0) {
        const confirmImport = window.confirm(
          `You have ${pendingPoints.length} captured dashboard state(s)/visual(s) pending. Would you like to add them to this story?`
        );
        if (confirmImport) {
          const importPoints = async () => {
            const addedPoints = [];
            let currentSortOrder = points.length;
            for (const pt of pendingPoints) {
              try {
                const sp = await addStoryPoint(storyId, {
                  title: pt.title || `Story Point ${currentSortOrder + 1}`,
                  sort_order: currentSortOrder,
                  dashboard_id: pt.dashboardId || fileId,
                  page_id: pt.page_id || null,
                  bookmark_id: pt.bookmark_id || null,
                  filters: pt.filters || [],
                  slicers: pt.slicers || {},
                  drill_state: pt.drill_state || {},
                  visual_selections: pt.visual_selections || {},
                  active_visuals: pt.active_visuals || [],
                  snapshot_url: pt.snapshot_url || null,
                });
                addedPoints.push(sp);
                currentSortOrder++;
              } catch (err) {
                console.error("Failed to add pending point:", err);
              }
            }
            if (addedPoints.length > 0) {
              setPoints((prev) => [...prev, ...addedPoints]);
              setActivePointId(addedPoints[0].id);
            }
          };
          importPoints();
        }
      }
      sessionStorage.removeItem('osa_story_pending_add');
    } catch (err) {
      console.error("Failed to parse pending story points:", err);
      sessionStorage.removeItem('osa_story_pending_add');
    }
  }, [loading, storyId, points.length, fileId]);

  // ── Save story metadata ─────────────────────────────────────────────────────
  const handleSaveStory = async () => {
    if (!storyName.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateStory(storyId, { name: storyName.trim(), description: storyDesc });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e) {
      setSaveStatus('error');
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Add story point ─────────────────────────────────────────────────────────
  const handleAddPoint = async () => {
    try {
      const sp = await addStoryPoint(storyId, {
        title: `Story Point ${points.length + 1}`,
        sort_order: points.length,
        // Capture current dashboard state if provided
        dashboard_id: currentDashboardState?.fileId || fileId,
        page_id: currentDashboardState?.activePage || null,
        filters: currentDashboardState?.filters || [],
        slicers: currentDashboardState?.slicers || {},
        drill_state: currentDashboardState?.drillState || {},
        visual_selections: currentDashboardState?.visualSelections || {},
        active_visuals: currentDashboardState?.activeVisuals || [],
      });
      setPoints((prev) => [...prev, sp]);
      setActivePointId(sp.id);
    } catch (e) {
      alert('Failed to add point: ' + e.message);
    }
  };

  // ── Update active point field ───────────────────────────────────────────────
  const handleUpdatePoint = useCallback(async (field, value) => {
    if (!activePointId) return;
    // Optimistic update
    setPoints((prev) => prev.map((p) => p.id === activePointId ? { ...p, [field]: value } : p));
    try {
      await updateStoryPoint(storyId, activePointId, { [field]: value });
    } catch (e) {
      // Revert on failure
      await loadStory();
      alert('Failed to save: ' + e.message);
    }
  }, [activePointId, storyId, loadStory]);

  // ── Delete point ────────────────────────────────────────────────────────────
  const handleDeletePoint = async (pointId) => {
    if (!window.confirm('Delete this story point?')) return;
    try {
      await deleteStoryPoint(storyId, pointId);
      const newPoints = points.filter((p) => p.id !== pointId);
      setPoints(newPoints);
      if (activePointId === pointId) {
        setActivePointId(newPoints.length > 0 ? newPoints[0].id : null);
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  // ── Duplicate point ─────────────────────────────────────────────────────────
  const handleDuplicatePoint = async (pointId) => {
    try {
      const copy = await duplicateStoryPoint(storyId, pointId);
      await loadStory(); // Reload to get updated sort_orders
      setActivePointId(copy.id);
    } catch (e) {
      alert('Duplicate failed: ' + e.message);
    }
  };

  // ── Drag-and-drop reorder ───────────────────────────────────────────────────
  const handleDragStart = (e, index) => { dragFromRef.current = index; };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = async (e, toIndex) => {
    e.preventDefault();
    const fromIndex = dragFromRef.current;
    if (fromIndex === null || fromIndex === toIndex) return;
    const reordered = reorder(points, fromIndex, toIndex);
    setPoints(reordered);
    dragFromRef.current = null;
    try {
      await reorderStoryPoints(storyId, reordered.map((p) => p.id));
    } catch (err) {
      await loadStory();
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const blob = await exportStoryPdf(storyId, { orientation: 'landscape' });
      downloadBlob(blob, `${(storyName || 'Story').replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      alert('PDF export failed: ' + e.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportPptx = async () => {
    setExportingPptx(true);
    try {
      const blob = await exportStoryPptx(storyId);
      downloadBlob(blob, `${(storyName || 'Story').replace(/\s+/g, '_')}.pptx`);
    } catch (e) {
      alert('PPTX export failed: ' + e.message);
    } finally {
      setExportingPptx(false);
    }
  };

  // ── Presentation mode ───────────────────────────────────────────────────────
  if (showPresent) {
    return (
      <StoryPresentation
        storyId={storyId}
        storyName={storyName}
        points={points}
        onClose={() => setShowPresent(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="sb-loading">
        <Loader2 size={24} className="sb-spin" />
        <span>Loading story…</span>
      </div>
    );
  }

  return (
    <div className="sb-root">
      {/* ── Toolbar ── */}
      <StoryToolbar
        onClose={onClose}
        storyName={storyName}
        setStoryName={setStoryName}
        handleSaveStory={handleSaveStory}
        handleAddPoint={handleAddPoint}
        setShowPresent={setShowPresent}
        pointsCount={points.length}
        handleExportPdf={handleExportPdf}
        exportingPdf={exportingPdf}
        handleExportPptx={handleExportPptx}
        exportingPptx={exportingPptx}
        saving={saving}
        saveStatus={saveStatus}
        setShowSettings={setShowSettings}
      />

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="sb-settings-bar">
          <label className="sb-settings-field">
            <span>Description</span>
            <input
              type="text"
              value={storyDesc}
              onChange={(e) => setStoryDesc(e.target.value)}
              onBlur={handleSaveStory}
              placeholder="Story description (optional)"
            />
          </label>
          <button type="button" className="sb-icon-btn" onClick={() => setShowSettings(false)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="sb-layout">
        {/* Left panel: story points list */}
        <StorySidebar
          points={points}
          activePointId={activePointId}
          onSelectPoint={setActivePointId}
          onAddPoint={handleAddPoint}
          onDeletePoint={handleDeletePoint}
          onDuplicatePoint={handleDuplicatePoint}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />

        {/* Center: point title + captured state preview */}
        <div className="sb-center">
          {!activePoint ? (
            <div className="sb-center-empty">
              <BookOpen size={40} />
              <p>Select or add a story point to begin editing.</p>
            </div>
          ) : (
            <StoryPointEditor
              key={activePoint.id}
              point={activePoint}
              onUpdate={handleUpdatePoint}
            />
          )}
        </div>

        {/* Right panel: narrative editor */}
        <div className="sb-narrative-panel">
          <div className="sb-narrative-header">
            <Edit2 size={14} />
            <span>Narrative</span>
          </div>
          {activePoint ? (
            <NarrativeEditor
              value={activePoint.narrative || ''}
              onChange={(val) => handleUpdatePoint('narrative', val)}
            />
          ) : (
            <div className="sb-narrative-empty">Select a story point to write its narrative.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Narrative Editor (right panel) ────────────────────────────────────────────
function NarrativeEditor({ value, onChange }) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef(null);

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 600);
  };

  return (
    <textarea
      className="sb-narrative-textarea"
      value={local}
      onChange={handleChange}
      placeholder="Write your analytical narrative for this story point…&#10;&#10;Describe the insight, trend, or finding you want to communicate."
    />
  );
}
