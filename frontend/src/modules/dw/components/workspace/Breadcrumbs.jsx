
import React from 'react';
import { FiChevronRight, FiHome, FiStar, FiTrash2, FiShare2 } from 'react-icons/fi';

const VIRTUAL_LABELS = {
  '__favorites__': { label: 'Favorites', icon: FiStar, color: '#fbbf24' },
  '__trash__': { label: 'Trash', icon: FiTrash2, color: '#f87171' },
  '__shared__': { label: 'Shared', icon: FiShare2, color: '#34d399' },
};

const Breadcrumbs = ({ currentFolderId, items, onNavigate }) => {
  const breadcrumbColor = '#3B82F6'; // Professional Blue

  // Check for virtual views
  const virtualView = VIRTUAL_LABELS[currentFolderId];
  if (virtualView) {
    return (
      <div className="flex items-center space-x-1 text-[13px] font-medium">
        <button
          onClick={() => onNavigate(null)}
          className="dw-breadcrumb-link"
        >
          Workspace
        </button>
        <FiChevronRight size={14} className="text-[var(--df-text-muted)] opacity-30" />
        <span className="font-bold text-[var(--df-strong)]">
          {virtualView.label}
        </span>
      </div>
    );
  }

  // Standard folder breadcrumbs
  const path = [];
  let curr = items.find(i => i.id === currentFolderId);
  while (curr) {
    path.unshift(curr);
    curr = items.find(i => i.id === curr.parentId);
  }

  return (
    <div className="flex items-center space-x-1 text-[13px] font-medium">
      <button
        onClick={() => onNavigate(null)}
        className="dw-breadcrumb-link"
      >
        Workspace
      </button>
      <FiChevronRight size={14} className="text-[var(--df-text-muted)] opacity-30" />
      {path.map((folder, idx) => (
        <React.Fragment key={folder.id}>
          <button
            onClick={() => onNavigate(folder.id)}
            className="dw-breadcrumb-link"
          >
            {folder.name}
          </button>
          <FiChevronRight size={14} className="text-[var(--df-text-muted)] opacity-30" />
        </React.Fragment>
      ))}
    </div>
  );
};

export default Breadcrumbs;
