import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, Zap, ArrowRightLeft, FileJson, Eye, MessageSquare, ChevronDown } from 'lucide-react';
import './Nodes.css';

// NodeWrapper — shared shell for all node types
const NodeWrapper = ({ id, type, label, icon: Icon, children, status, data }) => {
  const [showComment, setShowComment] = useState(!!data?.comment);

  const handlePreview = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('node-preview', { detail: { id } }));
  };

  const handleCommentChange = (e) => {
    window.dispatchEvent(new CustomEvent('node-data-update', {
      detail: { id, data: { comment: e.target.value } }
    }));
  };

  const handleBlur = () => {
    window.dispatchEvent(new CustomEvent('pipeline-autosave'));
  };

  // Derive border color from status
  const statusBorderColor =
    status === 'success' ? 'var(--node-success)' :
    status === 'failed'  ? 'var(--node-failed)'  :
    status === 'running' ? 'var(--node-running)'  :
    'var(--border)';

  return (
    <>
      <div className="node-wrapper-container">
        <div
          className={`custom-node node-type-${type}`}
          style={{ borderTopColor: statusBorderColor }}
        >
          {/* Status glow dot */}
          {status && <div className={`node-status status-${status}`} />}

          {/* Header */}
          <div className="node-header">
            <div className="node-icon">
              <Icon size={14} />
            </div>
            <div className="node-title">{label}</div>

            {/* Comment Toggle */}
            <button
              className={`node-action-btn ${showComment ? 'active' : ''}`}
              title={showComment ? 'Hide Comment' : 'Show Comment'}
              onClick={(e) => { e.stopPropagation(); setShowComment(v => !v); }}
            >
              <MessageSquare size={12} />
              <ChevronDown
                size={9}
                className="comment-chevron"
                style={{ transform: showComment ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Preview Button */}
            <button
              className="node-action-btn"
              title="Preview Data"
              onClick={handlePreview}
            >
              <Eye size={12} />
            </button>
          </div>

          {/* Node Body */}
          <div className="node-body">
            {children}
          </div>
        </div>

        {/* Comment Section — collapsible */}
        {showComment && (
          <div className="node-comment-external">
            <div className="node-comment-label">
              <MessageSquare size={10} />
              <span>Note</span>
            </div>
            <textarea
              className="node-comment-input nodrag"
              placeholder="Add a note about this node..."
              value={data?.comment || ''}
              onChange={handleCommentChange}
              onBlur={handleBlur}
              onKeyDown={(e) => e.stopPropagation()}
              rows={2}
            />
          </div>
        )}
      </div>
    </>
  );
};

export const ExtractNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="extract"
    label={data.label || 'Extract Data'}
    icon={Database}
    status={data.status}
    data={data}
  >
    <span>{data.connector_engine || 'Choose source…'}</span>
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const TransformNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="transform"
    label={data.label || 'Transform'}
    icon={ArrowRightLeft}
    status={data.status}
    data={data}
  >
    <span>{data.transform_type || 'Configure…'}</span>
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const PandasNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="transform_pandas"
    label={data.label || 'Python Transform'}
    icon={Zap}
    status={data.status}
    data={data}
  >
    <span>{data.transform_type || 'Python logic…'}</span>
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </NodeWrapper>
));

export const LoadNode = memo(({ id, data }) => (
  <NodeWrapper
    id={id}
    type="load"
    label={data.label || 'Load Data'}
    icon={FileJson}
    status={data.status}
    data={data}
  >
    <span>{data.connector_engine || 'Choose destination…'}</span>
    <Handle type="target" position={Position.Left} />
  </NodeWrapper>
));
