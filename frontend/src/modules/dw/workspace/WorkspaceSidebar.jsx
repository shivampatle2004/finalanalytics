import React, { useState, useEffect } from 'react';
import {
  FiUsers, FiStar, FiTrash2, FiShare2, FiHome,
  FiChevronRight, FiChevronDown
} from 'react-icons/fi';

/*
  Icon colour strategy:
  - Burgundy icons  → var(--df-icon-accent)
      Light mode: #7A1E3A  (dark burgundy — visible on white)
      Dark mode:  #B8385D  (bright rose   — visible on dark bg)
  - Cyan icons      → #38BDF8  (always bright, works on both)
  - Neutral (Trash) → var(--df-text-muted)
      Light: #555555   Dark: #A0A0A0
*/
const C_ICON_ACCENT = 'var(--df-icon-accent)';
const C_CYAN        = '#38BDF8';
const C_NEUTRAL     = 'var(--df-text-muted)';

/* ─────────────────────────────────────────
   Single nav row
───────────────────────────────────────── */
const NavItem = ({
  icon: Icon,
  label,
  isActive,
  onClick,
  depth = 0,
  iconColor,
  hasChevron = false,
  isExpanded = false,
  onChevronClick,
}) => {
  const [hovered, setHovered] = useState(false);

  const paddingLeft = depth === 0 ? 16 : 36;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        paddingLeft,
        paddingRight: 12,
        paddingTop: 9,
        paddingBottom: 9,
        cursor: 'pointer',
        /* Use theme-aware active/hover backgrounds */
        backgroundColor: isActive
          ? 'var(--df-sidebar-active)'
          : hovered
          ? 'var(--df-sidebar-hover)'
          : 'transparent',
        userSelect: 'none',
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* Left accent bar */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            borderRadius: '0 2px 2px 0',
            backgroundColor: 'var(--df-icon-accent)',
          }}
        />
      )}

      {/* Chevron slot — fixed 20px so icons stay aligned */}
      <div
        style={{
          width: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginRight: 6,
        }}
      >
        {hasChevron && (
          <button
            onClick={(e) => { e.stopPropagation(); onChevronClick?.(); }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--df-text-muted)',
            }}
          >
            {isExpanded
              ? <FiChevronDown size={14} strokeWidth={2.5} />
              : <FiChevronRight size={14} strokeWidth={2.5} />}
          </button>
        )}
      </div>

      {/* Icon */}
      {Icon && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginRight: 10 }}>
          <Icon
            size={20}
            strokeWidth={1.75}
            style={{ color: iconColor || C_ICON_ACCENT }}
          />
        </div>
      )}

      {/* Label */}
      <span
        style={{
          fontSize: 15,
          fontWeight: isActive ? 600 : 400,
          color: 'var(--df-text)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
};

/* ─────────────────────────────────────────
   Sidebar
───────────────────────────────────────── */
const WorkspaceSidebar = ({ activeSection, onNavigate, items = [] }) => {
  const [sidebarWidth, setSidebarWidth]   = useState(240);
  const [isDragging, setIsDragging]       = useState(false);

  /* Drag-to-resize */
  const handleMouseDown = (e) => { e.preventDefault(); setIsDragging(true); };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging) return;
      setSidebarWidth(Math.min(Math.max(e.clientX, 180), 500));
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const isHome = activeSection === null || activeSection === undefined;

  return (
    <div
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: 'var(--df-sidebar-bg)',
        borderRight: '1px solid var(--df-border-light)',
        fontFamily: 'var(--font-sans)',
      }}
      className="df-scrollbar"
    >
      {/* Drag handle */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 4,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseDown={handleMouseDown}
      />

      {/* ── "Workspace" title ── */}
      <div style={{ padding: '22px 20px 14px 20px' }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color: 'var(--df-strong)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          Workspace
        </span>
      </div>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>

        {/* Home */}
        <NavItem
          icon={FiHome}
          label="Home"
          isActive={isHome}
          onClick={() => onNavigate(null)}
          iconColor={C_ICON_ACCENT}
        />

        {/* Shared with me */}
        <NavItem
          icon={FiShare2}
          label="Shared with me"
          isActive={activeSection === '__shared__'}
          onClick={() => onNavigate('__shared__')}
          iconColor={C_ICON_ACCENT}
        />

        {/* Gap before Favorites / Trash */}
        <div style={{ height: 6 }} />

        {/* Favorites */}
        <NavItem
          icon={FiStar}
          label="Favorites"
          isActive={activeSection === '__favorites__'}
          onClick={() => onNavigate('__favorites__')}
          iconColor={C_ICON_ACCENT}
        />

        {/* Trash */}
        <NavItem
          icon={FiTrash2}
          label="Trash"
          isActive={activeSection === '__trash__'}
          onClick={() => onNavigate('__trash__')}
          iconColor={C_NEUTRAL}
        />
      </nav>
    </div>
  );
};

export default WorkspaceSidebar;
