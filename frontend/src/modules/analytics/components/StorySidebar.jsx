import React from 'react';
import { BookOpen, Plus } from 'lucide-react';
import StoryPointCard from './StoryPointCard';

export default function StorySidebar({
  points,
  activePointId,
  onSelectPoint,
  onAddPoint,
  onDeletePoint,
  onDuplicatePoint,
  onDragStart,
  onDragOver,
  onDrop
}) {
  return (
    <div className="sb-sidebar">
      <div className="sb-sidebar-header">
        <BookOpen size={14} />
        <span>Story Points</span>
        <span className="sb-sidebar-count">{points.length}</span>
      </div>

      {points.length === 0 && (
        <div className="sb-sidebar-empty">
          <p>No points yet.</p>
          <button type="button" className="sb-btn-add-first" onClick={onAddPoint}>
            <Plus size={13} /> Add First Point
          </button>
        </div>
      )}

      <div className="sb-points-list">
        {points.map((p, idx) => (
          <StoryPointCard
            key={p.id}
            point={p}
            index={idx}
            isActive={p.id === activePointId}
            onSelect={() => onSelectPoint(p.id)}
            onDelete={() => onDeletePoint(p.id)}
            onDuplicate={() => onDuplicatePoint(p.id)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))}
      </div>

      <button type="button" className="sb-sidebar-add" onClick={onAddPoint}>
        <Plus size={14} /> Add Story Point
      </button>
    </div>
  );
}
