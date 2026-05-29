 
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
 
const SIDEBAR_COLLAPSED_WIDTH = 28;
const SIDEBAR_EXPANDED_WIDTH = 220;
 
/* ─── Existing Icons ─── */
const IconWorkspace = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
    <line x1="12" y1="22" x2="12" y2="12" />
    <line x1="22" y1="8.5" x2="12" y2="12" />
    <line x1="2" y1="8.5" x2="12" y2="12" />
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
  </svg>
);
 
const IconSqlEditor = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <polyline points="9 11 6 14 9 17" />
    <polyline points="15 11 18 14 15 17" />
  </svg>
);
 
const IconCatalog = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
    <path d="M7 7l4 4M17 7l-4 4M7 17l4-4M17 17l-4-4" opacity="0.5" />
  </svg>
);
 
const IconPipeline = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c4 0 6-6 10-6s6 6 10 6" />
    <path d="M2 12c4 0 6 6 10 6s6-6 10-6" opacity="0.4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="2" cy="12" r="1.5" fill="currentColor" />
    <circle cx="22" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
 
/* ─── NEW Icons ─── */
const IconConnector = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/>
    <path d="M17 21v-2"/>
    <path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/>
    <path d="M21 21v-2"/>
    <path d="M3 5V3"/>
    <path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/>
    <path d="M7 5V3"/>
  </svg>
);
 
const IconAnalytics = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 21H4.6c-.56 0-.84 0-1.05-.11a1 1 0 0 1-.44-.44C3 20.24 3 19.96 3 19.4V3"/>
    <path d="M7 14l4-4 4 4 6-6"/>
    <path d="M17 8h4v4"/>
  </svg>
);
 
const IconDashboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);
 
const IconTransform = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m8 17 4 4 4-4" />
  </svg>
);
 
const IconLogs = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
 
const IconPipelineEditor = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
    <path d="M9 12h1.5" />
    <path d="M13.5 12H15" />
    <path d="M12 9v1.5" />
    <path d="M12 13.5V15" />
  </svg>
);
 
/* ─── Updated Sections ─── */
const SECTIONS = [
  {
    id: 'dashboard',
    items: [
      // { id: 'dashboard-home', label: 'Dashboard', icon: IconDashboard, to: '/dashboard' },
    ],
  },
  {
    id: 'etl',
    items: [
      // { id: 'pipelines', label: 'Pipelines', icon: IconPipeline, to: '/etl/pipelines' },
      // { id: 'etl-logs', label: 'Logs', icon: IconLogs, to: '/etl/logs' },
      // { id: 'etl-transform', label: 'Transform', icon: IconTransform, to: '/etl/transform' },
    ],
  },
  {
    id: 'dw',
    items: [
      { id: 'dw-workspace', label: 'Warehouse', icon: IconWorkspace, to: '/dw/workspace' },
      { id: 'dw-sql-editor', label: 'SQL Editor', icon: IconSqlEditor, to: '/dw/sql-editor' },
      { id: 'dw-catalog', label: 'Catalog', icon: IconCatalog, to: '/dw/catalog' },
      { id: 'dw-jobs', label: 'Jobs & Pipelines', icon: IconPipelineEditor, to: '/dw/jobs' },
    ],
  },
  {
    id: 'integrations',
    items: [
      { id: 'etl-connectors', label: 'Connectors', icon: IconConnector, to: '/etl/connectors' },
    ],
  },
  {
    id: 'analytics',
    items: [
      {
        id: 'analytics-dashboard',
        label: 'Analytics',
        icon: IconAnalytics,
        to: '/analytics',
        openInNewTab: false,
      },
    ],
  },
];
 
const NavItemContent = ({ label, icon: Icon, isActive, isExpanded }) => (
  <>
    <span
      className="flex-shrink-0 flex items-center justify-center transition-all duration-300 ease-out group-hover:scale-110"
      style={{
        width: 24,
        height: 24,
        opacity: isExpanded ? 1 : 0,
        transform: isExpanded ? 'scale(1)' : 'scale(0.75)',
        color: isActive ? 'var(--df-strong)' : 'var(--df-text-soft)',
        pointerEvents: isExpanded ? 'auto' : 'none',
      }}
    >
      <Icon />
    </span>
    <span
      className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-out"
      style={{
        color: isActive ? 'var(--df-strong)' : 'var(--df-text-soft)',
        opacity: isExpanded ? 1 : 0,
        maxWidth: isExpanded ? 160 : 0,
        pointerEvents: isExpanded ? 'auto' : 'none',
      }}
      aria-hidden={!isExpanded}
    >
      {label}
    </span>
  </>
);
 
const Sidebar = () => {
  const [isExpanded, setIsExpanded] = useState(false);
 
  const sidebarWidth = isExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
 
  useEffect(() => {
    document.documentElement.style.setProperty('--df-sidebar-width', `${sidebarWidth}px`);
  }, [sidebarWidth]);
 
  const itemClasses = (isActive) =>
    `relative flex items-center rounded-2xl transition-all duration-300 ease-out group cursor-pointer overflow-hidden ${
      isExpanded
        ? 'h-12 w-full gap-3 px-3 justify-start opacity-100'
        : 'h-0 w-0 opacity-0 overflow-hidden pointer-events-none'
    } ${
      isActive ? 'bg-[var(--df-sidebar-active)]' : 'hover:bg-[var(--df-sidebar-hover)]'
    }`;
 
  const visibleSections = SECTIONS.filter(({ items }) => items.length > 0);
 
  return (
    <aside
      style={{
        width: `${sidebarWidth}px`,
        position: 'fixed',
        top: '64px',
        left: 0,
        bottom: 0,
        backgroundColor: 'var(--df-sidebar-bg)',
        borderRight: '1px solid var(--df-border)',
        zIndex: 40,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease',
        boxShadow: isExpanded ? '4px 0 24px rgba(0, 0, 0, 0.08)' : 'none',
        overflow: 'hidden',
      }}
      className={`flex flex-col transition-all duration-300 ${isExpanded ? 'pt-6' : 'pt-0'}`}
    >
      <button
        type="button"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="absolute top-4 z-50 flex items-center justify-center text-[var(--df-text-soft)] hover:text-[var(--df-strong)] transition-all duration-300"
        style={{
          width: '14px',
          height: '14px',
          right: isExpanded ? '10px' : '7px',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <nav
        className={`flex-1 overflow-y-auto overflow-x-hidden df-scrollbar transition-all duration-300 ease-out ${
          isExpanded ? 'px-3 space-y-6 opacity-100 visible' : 'px-0 space-y-0 opacity-0 invisible'
        }`}
        style={{
          paddingRight: isExpanded ? '12px' : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
          transform: isExpanded ? 'translateX(0)' : 'translateX(-12px)',
        }}
        aria-hidden={!isExpanded}
      >
        {visibleSections.map(({ id, items }) => (
          <div
            key={id}
            className={`transition-all duration-300 ${isExpanded ? 'space-y-2' : 'space-y-0'}`}
          >
            {items.map(({ id: itemId, label, icon, to, openInNewTab }) => {
              if (openInNewTab) {
                return (
                  <a
                    key={itemId}
                    href={to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${itemClasses(false)} hover:bg-[var(--df-sidebar-hover)]`}
                  >
                    <NavItemContent label={label} icon={icon} isActive={false} isExpanded={isExpanded} />
                  </a>
                );
              }
 
              return (
                <NavLink
                  key={itemId}
                  to={to}
                  className={({ isActive }) => itemClasses(isActive)}
                >
                  {({ isActive }) => (
                    <NavItemContent label={label} icon={icon} isActive={isActive} isExpanded={isExpanded} />
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};
 
export default Sidebar;
 
 