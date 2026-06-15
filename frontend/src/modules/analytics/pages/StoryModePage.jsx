/**
 * StoryModePage.jsx
 * Top-level Story Mode page — lists all stories for the current file,
 * and provides entry points to create / open / delete stories.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, Play, Edit2, FileDown, MoreHorizontal, Clock } from 'lucide-react';
import {
  listStories, createStory, deleteStory,
  exportStoryPdf, exportStoryPptx, downloadBlob,
} from '../services/storiesApi';
import StoryBuilder from '../components/StoryBuilder';
import './StoryModePage.css';

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StoryModePage({ fileId, userId, onClose, currentDashboardState }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openStoryId, setOpenStoryId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStories(fileId, userId);
      setStories(data.stories || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fileId, userId]);

  useEffect(() => { load(); }, [load]);

  // Close context menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const story = await createStory({ name, file_id: fileId, user_id: userId });
      setStories((prev) => [story, ...prev]);
      setNewName('');
      setCreating(false);
      setOpenStoryId(story.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this story? This cannot be undone.')) return;
    try {
      await deleteStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
      setMenuOpenId(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExportPdf = async (id, name) => {
    try {
      const blob = await exportStoryPdf(id, { orientation: 'landscape' });
      downloadBlob(blob, `${name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      alert('PDF export failed: ' + err.message);
    }
    setMenuOpenId(null);
  };

  const handleExportPptx = async (id, name) => {
    try {
      const blob = await exportStoryPptx(id);
      downloadBlob(blob, `${name.replace(/\s+/g, '_')}.pptx`);
    } catch (err) {
      alert('PPTX export failed: ' + err.message);
    }
    setMenuOpenId(null);
  };

  // If a story is open, show the builder
  if (openStoryId) {
    return (
      <StoryBuilder
        storyId={openStoryId}
        fileId={fileId}
        userId={userId}
        currentDashboardState={currentDashboardState}
        onClose={() => { setOpenStoryId(null); load(); }}
      />
    );
  }

  return (
    <div className="smp-root">
      {/* Header */}
      <div className="smp-header">
        <div className="smp-header-left">
          <BookOpen size={20} className="smp-header-icon" />
          <div>
            <h2 className="smp-title">Story Mode</h2>
            <p className="smp-subtitle">Create guided analytical narratives from your dashboard</p>
          </div>
        </div>
        <div className="smp-header-actions">
          <button
            type="button"
            className="smp-btn smp-btn-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={15} /> New Story
          </button>
          {onClose && (
            <button type="button" className="smp-btn smp-btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Create inline form */}
      {creating && (
        <form className="smp-create-form" onSubmit={handleCreate}>
          <input
            autoFocus
            type="text"
            className="smp-create-input"
            placeholder="Story name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="smp-btn smp-btn-primary" disabled={!newName.trim()}>
            Create
          </button>
          <button
            type="button"
            className="smp-btn smp-btn-ghost"
            onClick={() => { setCreating(false); setNewName(''); }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Body */}
      <div className="smp-body">
        {loading && <p className="smp-loading">Loading stories…</p>}
        {error && <p className="smp-error">{error}</p>}
        {!loading && !error && stories.length === 0 && (
          <div className="smp-empty">
            <BookOpen size={40} className="smp-empty-icon" />
            <p>No stories yet.</p>
            <p className="smp-empty-sub">Click <strong>New Story</strong> to create your first analytical narrative.</p>
          </div>
        )}

        <div className="smp-grid">
          {stories.map((story) => (
            <div key={story.id} className="smp-card">
              <div className="smp-card-body" onClick={() => setOpenStoryId(story.id)}>
                <div className="smp-card-icon">
                  <BookOpen size={22} />
                </div>
                <div className="smp-card-info">
                  <span className="smp-card-name">{story.name}</span>
                  {story.description && (
                    <span className="smp-card-desc">{story.description}</span>
                  )}
                  <div className="smp-card-meta">
                    <span className="smp-card-count">
                      {story.point_count ?? 0} point{story.point_count !== 1 ? 's' : ''}
                    </span>
                    <span className="smp-card-dot">·</span>
                    <Clock size={11} />
                    <span>{timeAgo(story.updated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="smp-card-actions">
                <button
                  type="button"
                  className="smp-card-btn smp-present-btn"
                  title="Present story"
                  onClick={(e) => { e.stopPropagation(); setOpenStoryId(story.id); }}
                >
                  <Play size={14} />
                </button>

                {/* Context menu */}
                <div
                  className="smp-menu-wrapper"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="smp-card-btn"
                    title="More options"
                    onClick={() => setMenuOpenId(menuOpenId === story.id ? null : story.id)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuOpenId === story.id && (
                    <div className="smp-context-menu">
                      <button type="button" onClick={() => { setOpenStoryId(story.id); setMenuOpenId(null); }}>
                        <Edit2 size={13} /> Edit
                      </button>
                      <button type="button" onClick={() => handleExportPdf(story.id, story.name)}>
                        <FileDown size={13} /> Export PDF
                      </button>
                      <button type="button" onClick={() => handleExportPptx(story.id, story.name)}>
                        <FileDown size={13} /> Export PPTX
                      </button>
                      <div className="smp-menu-divider" />
                      <button type="button" className="smp-menu-danger" onClick={() => handleDelete(story.id)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
