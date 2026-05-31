import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';

const QueryTabs = ({ tabs, activeTabId, onTabChange, onTabAdd, onTabClose, onTabRename }) => {
  const [editingTabId, setEditingTabId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingTabId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const startEditing = (e, tab) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditValue(tab.name);
  };

  const commitEdit = () => {
    if (editingTabId !== null && editValue.trim()) {
      onTabRename?.(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex items-center h-full overflow-x-auto select-none scrollbar-hide bg-transparent">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isEditing = editingTabId === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => { if (!isEditing) onTabChange(tab.id); }}
            onDoubleClick={(e) => startEditing(e, tab)}
            className="group flex items-center gap-2 px-4 h-full cursor-pointer transition-all duration-200 relative min-w-[120px] max-w-[200px]"
            style={{
              borderRight: '1px solid var(--df-border-light)',
              color: isActive ? 'var(--df-strong)' : 'var(--df-text-muted)',
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? 'var(--df-bg)' : 'transparent',
            }}
          >
            <div className="flex-1 min-w-0 relative flex items-center">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                    if (e.key === 'Escape') { setEditingTabId(null); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] font-medium w-full outline-none border rounded px-1 -ml-1 shadow-sm"
                  style={{ backgroundColor: 'var(--df-bg)', color: 'var(--df-strong)', borderColor: 'var(--df-accent)' }}
                />
              ) : (
                <span className="text-[13px] truncate block w-full leading-none mt-[1px]" style={{ color: isActive ? 'var(--df-strong)' : 'var(--df-text-muted)' }}>
                  {tab.name}
                </span>
              )}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(e, tab.id); }}
              className={`p-0.5 rounded-sm transition-all duration-150 flex-shrink-0 ${isActive ? 'opacity-60 hover:opacity-100 hover:bg-[var(--df-sidebar-hover)]' : 'opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-[var(--df-sidebar-hover)]'}`}
              style={{ color: 'var(--df-text-muted)' }}
            >
              <FiX size={12} />
            </button>

            {isActive && (
              <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ backgroundColor: 'var(--df-accent)' }}></div>
            )}
          </div>
        );
      })}

      <button
        onClick={onTabAdd}
        className="px-3 h-full flex items-center transition-all opacity-60 hover:opacity-100"
        style={{ color: 'var(--df-text-muted)' }}
      >
        <FiPlus size={16} />
      </button>
    </div>
  );
};

export default QueryTabs;
