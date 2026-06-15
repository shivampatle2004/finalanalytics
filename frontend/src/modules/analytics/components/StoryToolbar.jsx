import React from 'react';
import {
  ArrowLeft, Plus, Play, FileDown, Save, Settings, Loader2,
  CheckCircle, AlertCircle, Edit2
} from 'lucide-react';

export default function StoryToolbar({
  onClose,
  storyName,
  setStoryName,
  handleSaveStory,
  handleAddPoint,
  setShowPresent,
  pointsCount,
  handleExportPdf,
  exportingPdf,
  handleExportPptx,
  exportingPptx,
  saving,
  saveStatus,
  setShowSettings
}) {
  return (
    <div className="sb-toolbar">
      <button
        type="button"
        className="sb-toolbar-back"
        onClick={onClose}
        title="Back to Stories"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Story name editable */}
      <div className="sb-toolbar-name-wrap">
        <input
          className="sb-toolbar-name"
          value={storyName}
          onChange={(e) => setStoryName(e.target.value)}
          onBlur={handleSaveStory}
          placeholder="Story name…"
        />
        <Edit2 size={12} className="sb-toolbar-name-edit" />
      </div>

      <div className="sb-toolbar-sep" />

      <button
        type="button"
        className="sb-tb-btn"
        onClick={handleAddPoint}
        title="Add Story Point"
      >
        <Plus size={15} /> Add Point
      </button>

      <button
        type="button"
        className="sb-tb-btn sb-tb-btn-present"
        onClick={() => setShowPresent(true)}
        disabled={pointsCount === 0}
        title="Present Story"
      >
        <Play size={15} /> Present
      </button>

      <div className="sb-toolbar-sep" />

      <button
        type="button"
        className="sb-tb-btn"
        onClick={handleExportPdf}
        disabled={exportingPdf || pointsCount === 0}
        title="Export PDF"
      >
        {exportingPdf ? <Loader2 size={14} className="sb-spin" /> : <FileDown size={14} />}
        {exportingPdf ? 'Exporting…' : 'PDF'}
      </button>

      <button
        type="button"
        className="sb-tb-btn"
        onClick={handleExportPptx}
        disabled={exportingPptx || pointsCount === 0}
        title="Export PowerPoint"
      >
        {exportingPptx ? <Loader2 size={14} className="sb-spin" /> : <FileDown size={14} />}
        {exportingPptx ? 'Exporting…' : 'PPTX'}
      </button>

      <div className="sb-toolbar-sep" />

      <button
        type="button"
        className="sb-tb-btn"
        onClick={handleSaveStory}
        disabled={saving}
        title="Save Story"
      >
        {saving ? <Loader2 size={14} className="sb-spin" /> : <Save size={14} />}
        {saving ? 'Saving…' : 'Save'}
      </button>

      {saveStatus === 'saved' && (
        <span className="sb-save-status saved">
          <CheckCircle size={13} /> Saved
        </span>
      )}
      {saveStatus === 'error' && (
        <span className="sb-save-status error">
          <AlertCircle size={13} /> Error
        </span>
      )}

      <button
        type="button"
        className="sb-tb-btn sb-tb-icon"
        onClick={() => setShowSettings((s) => !s)}
        title="Story Settings"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
