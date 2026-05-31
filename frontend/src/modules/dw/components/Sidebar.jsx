import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FiChevronLeft,
} from 'react-icons/fi';

/* ─── Custom Abstract/Sci-Fi SVG Icons (Out of this World) ─── */
const IconWorkspace = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IconSqlEditor = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
const IconCatalog = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const IconPipeline = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="9" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="15" />
    <circle cx="12" cy="4" r="1" />
    <circle cx="12" cy="20" r="1" />
    <path d="M10 12c-3 0-4 3-6 3" />
    <path d="M14 12c3 0 4-3 6-3" />
    <circle cx="4" cy="15" r="1" />
    <circle cx="20" cy="9" r="1" />
  </svg>
);

const SECTIONS = [
  {
    id: 'workspace',
    label: 'Workspace',
    color: 'var(--df-icon-accent)',
    items: [
      { id: 'workspace-home', label: 'Workspace', icon: IconWorkspace, to: '/workspace' },
    ],
  },
  {
    id: 'sql',
    label: 'SQL',
    color: 'var(--df-icon-accent)',
    items: [
      { id: 'sql-editor', label: 'SQL Editor', icon: IconSqlEditor, to: '/sql-editor' },
      // { id: 'saved-queries', label: 'Saved Queries', icon: IconSavedQueries, to: '/saved-queries' },
      // { id: 'query-history', label: 'Query History', icon: IconHistory, to: '/query-history' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    color: 'var(--df-icon-accent)',
    items: [
      { id: 'catalog-main', label: 'Catalog', icon: IconCatalog, to: '/catalog' },
    ],
  },
  {
    id: 'data-engineering',
    label: 'Data Engineering',
    color: 'var(--df-icon-accent)',
    items: [
      { id: 'jobs-pipelines', label: 'Jobs & Pipelines', icon: IconPipeline, to: '/jobs' },
    ],
  },
];

const Sidebar = ({ isOpen, setIsOpen }) => {
  // We keep it fixed and slim now
  const isExpandedSidebar = false;

  React.useEffect(() => {
    // Lock the sidebar width to slim mode
    document.documentElement.style.setProperty('--df-sidebar-width', '72px');
  }, []);

  const activeStyle = {
    backgroundColor: 'transparent',
    boxShadow: 'none'
  };

  const commonClasses = "relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 group cursor-pointer";

  return (
    <aside
      style={{
        width: 'var(--df-sidebar-width)',
        position: 'fixed',
        top: '64px',
        left: 0,
        bottom: 0,
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--df-sidebar-bg)',
        borderRight: '1px solid var(--df-border)',
        boxShadow: 'none',
        zIndex: 40,
      }}
      className="h-[calc(100vh-64px)] flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-visible"
    >
      <div className="flex-1 flex flex-col min-h-0 pt-6">
        <nav className="flex-1 px-3 overflow-visible space-y-6 df-scrollbar">
          {SECTIONS.map(({ id, label, color, items }) => (
            <div key={id} className="space-y-2">
              {/* Items */}
              <div className="space-y-3">
                {items.map(({ id: itemId, label: itemLabel, icon: ItemIcon, to }) => {
                  const content = (isActive) => (
                    <div className="flex items-center w-full justify-center relative z-10">
                      <span
                        className="flex-shrink-0 transition-all duration-500 transform group-hover:scale-110"
                        style={{
                          color: isActive ? 'var(--df-strong)' : 'var(--df-text-soft)',
                          filter: isActive ? `drop-shadow(0 0 12px ${color}66)` : 'none'
                        }}
                      >
                        <ItemIcon />
                      </span>

                      {/* Proper Pop UI Tooltip */}
                      <div
                        className="absolute left-[64px] px-4 py-2.5 rounded-xl bg-[var(--df-sidebar-bg)] border border-[var(--df-border)] 
                                   text-[13px] font-medium text-[var(--df-strong)] whitespace-nowrap
                                   opacity-0 -translate-x-4 scale-90 pointer-events-none transition-all duration-300 
                                   group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 z-50 shadow-2xl backdrop-blur-xl"
                      >
                        <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-[var(--df-sidebar-bg)] border-l border-b border-[var(--df-border)] rotate-45"></div>
                        <span className="relative z-10 tracking-wide">{itemLabel}</span>
                      </div>
                    </div>
                  );

                  if (to) {
                    return (
                      <NavLink
                        key={itemId}
                        to={to}
                        className={({ isActive }) => `${commonClasses} ${isActive ? 'active-link' : 'hover:bg-[rgba(255,255,255,0.05)] dark:hover:bg-[var(--df-sidebar-hover)]'}`}
                        style={({ isActive }) => isActive ? activeStyle : {}}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <div
                                className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none"
                                style={{
                                  backgroundColor: 'var(--df-accent-soft)',
                                  boxShadow: '0 4px 12px rgba(15, 82, 186, 0.08)',
                                  border: '1.5px solid var(--df-accent-medium)'
                                }}
                              >
                                <div className="absolute top-[10px] bottom-[10px] left-[-3px] w-[6px] rounded-full shadow-lg" style={{ backgroundColor: color, boxShadow: `0 0 15px ${color}` }} />
                              </div>
                            )}
                            {content(isActive)}
                          </>
                        )}
                      </NavLink>
                    );
                  }

                  return (
                    <div
                      key={itemId}
                      className={`${commonClasses} hover:bg-[var(--df-sidebar-hover)]`}
                    >
                      {content(false)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;