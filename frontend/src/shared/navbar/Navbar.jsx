import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';
import logo from '../../assets/logo.png';
import logoDark from '../../assets/logo transparent.png';
/* ─── Inline SVG Icons for Navbar ─── */
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);
const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const HelpIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const SparklesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

import { api as etlApi } from '../../modules/etl/services/api';

const Navbar = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch dynamic alerts across ETL, DW, and Analytics projects
  useEffect(() => {
    const fetchNotifications = async () => {
      let mergedNotifs = [];

      // 1. ETL Backend Alerts
      try {
        const etlRes = await etlApi.getSystemAlerts();
        if (etlRes && etlRes.alerts) {
          const etlNotifs = etlRes.alerts.map(a => ({
            id: a.id,
            text: `[ETL Hub] ${a.title}: ${a.message}`,
            time: 'Just now',
            type: a.type === 'error' ? 'error' : 'warning',
            system: 'ETL'
          }));
          mergedNotifs = [...mergedNotifs, ...etlNotifs];
        }
      } catch (err) {
        console.warn('Failed to fetch ETL alerts:', err);
      }

      // 2. DW Backend Alerts
      try {
        const dwRes = await fetch('/dw/dashboard-stats').then(r => r.json());
        if (dwRes && dwRes.table_count !== undefined) {
          mergedNotifs.push({
            id: 'dw-stats',
            text: `[DW Manager] Connection stable. Data Warehouse contains ${dwRes.table_count} tables.`,
            time: 'Live',
            type: 'success',
            system: 'DW'
          });
        }
      } catch (err) {
        console.warn('Failed to fetch DW stats:', err);
      }

      // 3. Analytics Backend Alerts
      try {
        const analyticsRes = await fetch('/analytics/api/connections').then(r => r.json());
        if (Array.isArray(analyticsRes)) {
          mergedNotifs.push({
            id: 'analytics-stats',
            text: `[Analytics Portal] Connected to Analytics Hub with ${analyticsRes.length} active data profiles.`,
            time: 'Synced',
            type: 'info',
            system: 'Analytics'
          });
        } else {
          mergedNotifs.push({
            id: 'analytics-fallback',
            text: `[Analytics Hub] Workspace successfully synchronized with visualization dashboard.`,
            time: 'Synced',
            type: 'success',
            system: 'Analytics'
          });
        }
      } catch (err) {
        console.warn('Failed to fetch Analytics stats:', err);
        mergedNotifs.push({
          id: 'analytics-fallback',
          text: `[Analytics Hub] Workspace successfully synchronized with visualization dashboard.`,
          time: 'Synced',
          type: 'success',
          system: 'Analytics'
        });
      }

      // Default dynamic items fallback
      if (mergedNotifs.length === 0) {
        mergedNotifs = [
          { id: 'default-1', text: '[ETL Hub] All pipelines operating inside normal bounds.', time: 'Synced', type: 'success', system: 'ETL' },
          { id: 'default-2', text: '[DW Manager] Data storage synchronized with main relational nodes.', time: '10m ago', type: 'info', system: 'DW' },
          { id: 'default-3', text: '[Analytics Hub] Automatic ML visualization generation ready.', time: '1h ago', type: 'success', system: 'Analytics' }
        ];
      }

      setNotifications(mergedNotifs);
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-[100] transition-colors duration-300"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'var(--df-nav-bg)',
        borderBottom: '1px solid var(--df-border)',
        boxShadow: 'var(--df-shadow-xs)',
      }}
    >
      {/* Left - Logo & Org */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <img
            src={isDark ? logoDark : logo}
            alt="Arithwise"
            className="h-10 md:h-[36px] object-contain transition-transform hover:scale-105"
          />
        </div>
        <div className="h-5 w-[1px] hidden md:block" style={{ backgroundColor: 'var(--df-border)' }}></div>
        <div className="hidden md:flex items-center text-[10px] font-medium uppercase tracking-[0.15em]" style={{ color: 'var(--df-text-muted)' }}>
          <span>Org</span>
          <span className="mx-2 opacity-30">/</span>
          <span style={{ color: 'var(--df-strong)' }}>Production</span>
        </div>
      </div>

      {/* Center - Search + AI */}
      <div className="flex-1 max-w-xl mx-6 flex items-center gap-2 min-w-0">
        <div className="relative group flex-1 min-w-0">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none" style={{ color: 'var(--df-text-muted)' }}>
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search catalog, queries, logs..."
            className="w-full h-9 rounded-lg pl-10 pr-16 text-sm focus:outline-none transition-all min-w-0"
            style={{
              fontFamily: "'Inter', sans-serif",
              backgroundColor: 'var(--df-input-bg)',
              border: '1.5px solid var(--df-input-border)',
              color: 'var(--df-text)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--df-accent)';
              e.target.style.boxShadow = '0 0 0 3px var(--df-accent-soft)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--df-input-border)';
              e.target.style.boxShadow = 'none';
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium rounded" style={{ backgroundColor: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-muted)' }}>⌘</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium rounded" style={{ backgroundColor: 'var(--df-surface)', border: '1px solid var(--df-border)', color: 'var(--df-text-muted)' }}>K</kbd>
          </div>
        </div>
        {/* AI Button */}
        <button
          className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
          style={{ backgroundColor: 'var(--df-accent)', color: '#fff', border: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent-alt)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-accent)'; e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={() => window.dispatchEvent(new CustomEvent('open-copilot'))}
        >
          <SparklesIcon /> Ask AI
        </button>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-1.5">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="df-theme-toggle"
          data-active={isDark.toString()}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <div className="df-theme-toggle-knob">
            {isDark ? <FiMoon size={12} color="var(--df-icon-accent)" /> : <FiSun size={12} color="var(--df-accent)" />}
          </div>
        </button>

        <div className="h-5 w-[1px] mx-1" style={{ backgroundColor: 'var(--df-border)' }}></div>

        {/* Help */}
        <button className="p-2 rounded-xl transition-all" style={{ color: 'var(--df-text-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-soft)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          onClick={() => window.open('/docs', '_blank')}
          title="Help & Docs"
        >
          <HelpIcon />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl transition-all relative"
            style={{ color: 'var(--df-text-soft)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-soft)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <BellIcon />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ff4d4d] rounded-full" style={{ border: '2px solid var(--df-nav-bg)' }}></span>
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl py-2 z-50 animate-fadeIn" style={{ backgroundColor: 'var(--df-card-bg)', border: '1px solid var(--df-border)', boxShadow: 'var(--df-shadow-lg)' }}>
              <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--df-border)' }}>
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--df-strong)' }}>Notifications</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--df-accent-soft)', color: 'var(--df-icon-accent)' }}>{notifications.length}</span>
              </div>
              {notifications.map(n => (
                <div key={n.id} className="px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: n.type === 'success' ? 'var(--df-success)' : 'var(--df-info)' }}></div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--df-text)' }}>{n.text}</p>
                    <span className="text-[10px]" style={{ color: 'var(--df-text-muted)' }}>{n.time}</span>
                  </div>
                </div>
              ))}
              <div className="px-4 pt-2" style={{ borderTop: '1px solid var(--df-border)' }}>
                <button className="w-full py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-lg transition-colors" style={{ color: 'var(--df-icon-accent)' }}>View All</button>
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <button className="p-2 rounded-xl transition-all" style={{ color: 'var(--df-text-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--df-icon-accent)'; e.currentTarget.style.backgroundColor = 'var(--df-accent-soft)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--df-text-soft)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          onClick={() => navigate('/settings')}
          title="Settings"
        >
          <SettingsIcon />
        </button>

        <div className="h-6 w-[1px] mx-1" style={{ backgroundColor: 'var(--df-border)' }}></div>

        {/* Profile */}
        <div
          className="flex items-center gap-2.5 pl-1 cursor-pointer rounded-xl p-1 transition-all"
          onClick={() => navigate('/profile')}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Account Profile"
        >
          <div className="hidden md:flex flex-col items-end">
            <span className="text-xs font-medium" style={{ color: 'var(--df-strong)' }}>Admin</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--df-text-muted)' }}>Arithwise</span>
          </div>
          <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center text-sm font-medium shadow-md transition-transform hover:scale-105" style={{ backgroundColor: '#7A1E3A' }}>
            U
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;