import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Workflow,
  Activity,
  Wand2,
  Cable,
  Database,
  FolderOpen,
  TerminalSquare,
  Briefcase,
  BarChart2,
} from 'lucide-react';

/* ─────────────────────────────────────────
   Navigation data
───────────────────────────────────────── */
const SECTIONS = [
  {
    id: 'etl',
    label: 'ETL',
    items: [
      { id: 'etl-dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/etl/dashboard' },
      { id: 'etl-pipelines', label: 'Pipelines', icon: Workflow, to: '/etl/pipelines' },
      { id: 'etl-logs', label: 'Logs', icon: Activity, to: '/etl/logs' },
      { id: 'etl-transform', label: 'Transform', icon: Wand2, to: '/etl/transform' },
      { id: 'etl-connectors', label: 'Connectors', icon: Cable, to: '/etl/connectors' },
      { id: 'etl-catalog', label: 'Catalog', icon: Database, to: '/etl/catalog' },
      { id: 'etl-files', label: 'Files', icon: FolderOpen, to: '/etl/files' },
    ],
  },
  {
    id: 'dw',
    label: 'Warehouse',
    items: [
      { id: 'dw-workspace', label: 'Workspace', icon: Briefcase, to: '/dw/workspace' },
      { id: 'dw-sql', label: 'SQL Editor', icon: TerminalSquare, to: '/dw/sql-editor' },
      { id: 'dw-catalog', label: 'Catalog', icon: Database, to: '/dw/catalog' },
      { id: 'dw-jobs', label: 'Jobs & Pipelines', icon: Workflow, to: '/dw/jobs' },
    ],
  },
];

const ANALYTICS_ITEM = {
  id: 'analytics-dashboard',
  label: 'Analytics',
  icon: BarChart2,
  to: '/analytics',
};

/* ─────────────────────────────────────────
   Single nav item
───────────────────────────────────────── */
const SidebarItem = ({ item }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      data-tour={item.id}
      className={({ isActive }) =>
        `sidebar-item${isActive ? ' sidebar-item--active' : ''}`
      }
    >
      <Icon size={14} className="sidebar-item__icon" />
      <span className="sidebar-item__label">{item.label}</span>
    </NavLink>
  );
};

/* ─────────────────────────────────────────
   Section (label + child items, always open)
───────────────────────────────────────── */
const SidebarSection = ({ section }) => (
  <div className="sidebar-section">
    <div className="sidebar-section__heading">{section.label}</div>
    <div className="sidebar-section__items">
      {section.items.map(item => (
        <SidebarItem key={item.id} item={item} />
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────
   Root Sidebar
───────────────────────────────────────── */
const Sidebar = ({ isExpanded, setIsExpanded }) => {
  // Keep layout system happy — sidebar is always "expanded"
  useEffect(() => {
    setIsExpanded(true);
  }, [setIsExpanded]);

  return (
    <>
      <style>{`
        .df-sidebar {
          position: fixed;
          top: var(--df-navbar-height);
          left: 0;
          bottom: 0;
          width: 192px;
          background: var(--df-sidebar-bg);
          display: flex;
          flex-direction: column;
          z-index: 100;
          overflow-y: auto;
          overflow-x: hidden;
        }

        /* hide scrollbar visually but keep scrollable */
        .df-sidebar::-webkit-scrollbar { width: 0; }

        .df-sidebar__nav {
          flex: 1;
          padding: 20px 10px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* ── Section ── */
        .sidebar-section {
          margin-bottom: 6px;
        }

        .sidebar-section__heading {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--df-text-muted);
          opacity: 0.55;
          padding: 0 8px;
          margin-bottom: 4px;
          margin-top: 6px;
        }

        .sidebar-section__items {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        /* ── Nav Item ── */
        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          text-decoration: none;
          color: var(--df-text-soft);
          font-size: 13px;
          font-weight: 500;
          transition: background 0.15s, color 0.15s;
          cursor: pointer;
        }

        .sidebar-item:hover {
          background: var(--df-sidebar-hover);
          color: var(--df-strong);
        }

        .sidebar-item--active {
          background: var(--df-accent-soft);
          color: var(--df-accent);
          font-weight: 600;
        }

        /* ── Dark mode: active item ── */
        [data-theme="dark"] .sidebar-item--active {
          background: var(--df-sidebar-active);
          color: var(--df-accent-alt);
        }

        .sidebar-item__icon {
          flex-shrink: 0;
          opacity: 0.65;
          transition: opacity 0.15s;
        }

        .sidebar-item:hover .sidebar-item__icon {
          opacity: 0.85;
        }

        .sidebar-item--active .sidebar-item__icon {
          opacity: 1;
        }

        .sidebar-item__label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Analytics standalone button ── */
        .sidebar-analytics-divider {
          height: 1px;
          background: var(--df-border);
          margin: 12px 8px;
        }

        .sidebar-analytics-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          text-decoration: none;
          color: var(--df-text-soft);
          font-size: 13px;
          font-weight: 600;
          transition: background 0.15s, color 0.15s;
        }

        .sidebar-analytics-btn:hover {
          background: var(--df-sidebar-hover);
          color: var(--df-strong);
        }

        .sidebar-analytics-btn.active,
        .sidebar-analytics-btn[aria-current="page"] {
          background: var(--df-accent-soft);
          color: var(--df-accent);
        }

        [data-theme="dark"] .sidebar-analytics-btn.active,
        [data-theme="dark"] .sidebar-analytics-btn[aria-current="page"] {
          background: var(--df-sidebar-active);
          color: var(--df-accent-alt);
        }
      `}</style>

      <aside className="df-sidebar">
        <nav className="df-sidebar__nav">
          {/* ETL + Warehouse sections */}
          {SECTIONS.map(section => (
            <SidebarSection key={section.id} section={section} />
          ))}

          {/* Divider before Analytics */}
          <div className="sidebar-analytics-divider" />

          {/* Analytics — single link */}
          <NavLink
            to={ANALYTICS_ITEM.to}
            data-tour={ANALYTICS_ITEM.id}
            className={({ isActive }) =>
              `sidebar-analytics-btn${isActive ? ' active' : ''}`
            }
          >
            <BarChart2 size={14} style={{ opacity: 0.75, flexShrink: 0 }} />
            <span>Analytics</span>
          </NavLink>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;