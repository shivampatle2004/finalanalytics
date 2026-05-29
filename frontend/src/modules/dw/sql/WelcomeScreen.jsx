import React, { useState } from 'react';
import { FiClock, FiStar, FiFileText } from 'react-icons/fi';
import { useWorkspace } from '../context/WorkspaceContext';

const WelcomeScreen = ({ onCreateNew, onLoadQuery }) => {
  const [activeTab, setActiveTab] = useState('recents');
  const { items } = useWorkspace();

  const createOptions = [
    {
      id: 'sql',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
        </svg>
      ),
      label: 'SQL Query',
    },
    {
      id: 'notebook',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        </svg>
      ),
      label: 'Notebook',
    },
  ];

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Workspace items that are sql or notebook type, not deleted
  const workspaceFiles = (items || []).filter(i => !i.isDeleted && (i.type === 'sql' || i.type === 'notebook'));

  const recents = [...workspaceFiles]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10);

  const favorites = workspaceFiles.filter(q => q.isFavorite);

  const listItems = activeTab === 'recents' ? recents : favorites;

  const handleOpen = (item) => {
    if (!onLoadQuery) return;
    const content = item.content || (item.cells ? item.cells.map(c => c.content).join('\n\n') : '');
    onLoadQuery(content, item.name);
  };

  return (
    <div className="h-full overflow-y-auto df-scrollbar" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
      <div className="max-w-3xl mx-auto px-8 py-10">

        {/* Create new */}
        <h2 className="text-[22px] font-bold mb-5" style={{ color: 'var(--df-strong)' }}>Create new</h2>
        <div className="flex gap-3 mb-10">
          {createOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onCreateNew(opt.id)}
              className="flex items-center gap-3 px-5 py-3.5 rounded-xl border text-left transition-all duration-150 min-w-[180px]"
              style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)', color: 'var(--df-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--df-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--df-border)'; e.currentTarget.style.backgroundColor = 'var(--df-card-bg)'; }}
            >
              <span style={{ color: 'var(--df-text-muted)' }}>{opt.icon}</span>
              <span className="text-[14px] font-medium" style={{ color: 'var(--df-text)' }}>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Quick access */}
        <h2 className="text-[22px] font-bold mb-4" style={{ color: 'var(--df-strong)' }}>Quick access</h2>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { id: 'recents', icon: <FiClock size={13} />, label: 'Recents' },
            { id: 'favorites', icon: <FiStar size={13} />, label: 'Favorites' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all"
              style={{
                backgroundColor: activeTab === tab.id ? 'var(--df-accent-soft)' : 'transparent',
                borderColor: activeTab === tab.id ? 'var(--df-accent)' : 'var(--df-border)',
                color: activeTab === tab.id ? 'var(--df-accent)' : 'var(--df-text-muted)',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {listItems.length === 0 ? (
          <div className="py-12 text-center" style={{ color: 'var(--df-text-muted)' }}>
            <FiFileText size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-[13px]">{activeTab === 'recents' ? 'No files yet — create one above' : 'No favorites yet'}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {listItems.map((item, i) => (
              <button
                key={item.id || i}
                onClick={() => handleOpen(item)}
                className="flex items-center gap-4 px-3 py-3 border-b text-left transition-colors"
                style={{ borderColor: 'var(--df-border)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--df-bg-primary)' }}>
                  <FiFileText size={15} style={{ color: 'var(--df-text-muted)' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--df-text)' }}>{item.name}</p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--df-text-muted)' }}>
                    /Workspace{item.parentId ? `/${item.parentId}` : '/Home'}
                  </p>
                </div>

                <span className="text-[12px] flex-shrink-0 w-32 text-right" style={{ color: 'var(--df-text-muted)' }}>
                  {formatRelativeTime(item.createdAt)}
                </span>

                <span className="text-[11px] flex-shrink-0 w-16 text-right font-medium capitalize" style={{ color: 'var(--df-text-soft)' }}>
                  {item.type === 'sql' ? 'Query' : 'Notebook'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeScreen;
