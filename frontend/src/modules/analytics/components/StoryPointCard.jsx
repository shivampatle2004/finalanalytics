import React from 'react';
import { GripVertical, Copy, Trash2 } from 'lucide-react';

export default function StoryPointCard({
  point,
  index,
  isActive,
  onSelect,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop
}) {
  return (
    <div
      className={`sb-point-card${isActive ? ' active' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={(e) => onDrop(e, index)}
      onClick={onSelect}
    >
      <div className="sb-point-drag" title="Drag to reorder">
        <GripVertical size={13} />
      </div>
      <div className="sb-point-num">{index + 1}</div>
      <div className="sb-point-info">
        <span className="sb-point-title">{point.title || 'Untitled'}</span>
        {point.narrative && (
          <span className="sb-point-preview">
            {point.narrative.slice(0, 55)}{point.narrative.length > 55 ? '…' : ''}
          </span>
        )}
        <div className="sb-point-badges">
          {(point.filters || []).length > 0 && (
            <span className="sb-badge sb-badge-filter">
              {point.filters.length} filter{point.filters.length !== 1 ? 's' : ''}
            </span>
          )}
          {(point.active_visuals || []).length > 0 && (
            <span className="sb-badge sb-badge-visual">
              {point.active_visuals.length} visual{point.active_visuals.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="sb-point-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          title="Duplicate"
          className="sb-icon-btn"
          onClick={onDuplicate}
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          title="Delete"
          className="sb-icon-btn sb-icon-btn-danger"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
