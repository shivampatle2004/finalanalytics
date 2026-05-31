import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Shield, Settings, Mail, Lock, 
  Eye, EyeOff, Save, CheckCircle,
  Camera, BadgeCheck, Activity, Key, Bell,
  Laptop, ShieldAlert
} from 'lucide-react';
import './ProfilePage.css';

export function ProfilePage() {
  const [activeTab, setActiveTab] = useState('general');
  const [showPassword, setShowPassword] = useState({ current: false, new: false });
  const [isSaved, setIsSaved] = useState(false);
  const [profile, setProfile] = useState({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@onestopanalytics.com',
    role: 'Platform Architect',
    organization: 'OneStopAnalytics Hub',
    avatarInitials: 'AU',
    memberSince: 'Oct 2023'
  });

  const [preferences, setPreferences] = useState({
    darkMode: (localStorage.getItem('onestopanalytics_theme') || localStorage.getItem('arithflow_theme')) === 'dark',
    compactMode: (localStorage.getItem('onestopanalytics_compact') || localStorage.getItem('arithflow_compact')) === 'true',
    notifications: (localStorage.getItem('onestopanalytics_notifications') || localStorage.getItem('arithflow_notifications')) === 'true',
    weeklyDigest: (localStorage.getItem('onestopanalytics_weekly_digest') || localStorage.getItem('arithflow_weekly_digest')) === 'true'
  });

  const handleSave = (e) => {
    if (e) e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const togglePasswordVisibility = (field) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const togglePref = async (key) => {
    const newVal = !preferences[key];
    setPreferences(prev => ({ ...prev, [key]: newVal }));

    // Persist and Sync
    if (key === 'darkMode') {
      localStorage.setItem('onestopanalytics_theme', newVal ? 'dark' : 'light');
      localStorage.setItem('arithflow_theme', newVal ? 'dark' : 'light');
    } else if (key === 'compactMode') {
      localStorage.setItem('onestopanalytics_compact', newVal ? 'true' : 'false');
      localStorage.setItem('arithflow_compact', newVal ? 'true' : 'false');
    } else if (key === 'notifications') {
      localStorage.setItem('onestopanalytics_notifications', newVal ? 'true' : 'false');
      localStorage.setItem('arithflow_notifications', newVal ? 'true' : 'false');
      if (newVal && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
    } else if (key === 'weeklyDigest') {
      localStorage.setItem('onestopanalytics_weekly_digest', newVal ? 'true' : 'false');
      localStorage.setItem('arithflow_weekly_digest', newVal ? 'true' : 'false');
    }

    window.dispatchEvent(new CustomEvent('onestopanalytics-settings-changed'));
    window.dispatchEvent(new CustomEvent('arithflow-settings-changed'));
    handleSave();
  };

  return (
    <div className="profile-container">
      {/* ── Premium Profile Header ── */}
      <div className="profile-header-section">
        <div className="profile-header-info">
          <div className="profile-avatar-container">
            <div className="profile-avatar-main">{profile.avatarInitials}</div>
            <button className="avatar-edit-overlay" title="Upload Photo">
              <Camera size={13} />
            </button>
          </div>
          <div className="profile-title-area">
            <h1>{profile.firstName} {profile.lastName}</h1>
            <div className="profile-title-badges">
              <span className="badge-pill admin">
                <BadgeCheck size={12} /> {profile.role}
              </span>
              <span className="badge-pill status">Active Node Admin</span>
            </div>
          </div>
        </div>
        <div className="profile-header-meta">
          <div className="meta-org-label">Organization</div>
          <div className="meta-org-val">{profile.organization}</div>
        </div>
      </div>

      {/* ── Grid Layout ── */}
      <div className="profile-main-grid">
        {/* ── Sidebar Nav ── */}
        <aside className="profile-sidebar-card">
          <div className="sidebar-category-title">Manage Account</div>
          <button 
            className={`profile-sidebar-btn ${activeTab === 'general' ? 'active' : ''}`} 
            onClick={() => setActiveTab('general')}
          >
            <User size={16} /> Account Details
          </button>
          <button 
            className={`profile-sidebar-btn ${activeTab === 'security' ? 'active' : ''}`} 
            onClick={() => setActiveTab('security')}
          >
            <Shield size={16} /> Security &amp; Access
          </button>
          <button 
            className={`profile-sidebar-btn ${activeTab === 'preferences' ? 'active' : ''}`} 
            onClick={() => setActiveTab('preferences')}
          >
            <Settings size={16} /> Preferences
          </button>
          
          <div className="sidebar-category-title">System Links</div>
          <button 
            className="profile-sidebar-btn" 
            onClick={() => window.open('/docs', '_blank')}
          >
            <Activity size={16} /> API Documentation
          </button>
        </aside>

        {/* ── Forms Area ── */}
        <main className="profile-form-container">
          <AnimatePresence mode="wait">
            {activeTab === 'general' && (
              <motion.div 
                key="general" 
                initial={{ opacity: 0, x: 8 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="profile-section-header">
                  <h2>Account Details</h2>
                  <p>Manage your basic user identity information and organization mapping.</p>
                </div>
                <form onSubmit={handleSave} className="modern-profile-form">
                  <div className="form-row-dual">
                    <div className="profile-form-group">
                      <label>First Name</label>
                      <input className="profile-form-input" defaultValue={profile.firstName} />
                    </div>
                    <div className="profile-form-group">
                      <label>Last Name</label>
                      <input className="profile-form-input" defaultValue={profile.lastName} />
                    </div>
                  </div>
                  
                  <div className="profile-form-group">
                    <label>Email Address</label>
                    <div className="profile-input-wrapper">
                      <Mail size={14} className="profile-input-icon" />
                      <input 
                        className="profile-form-input profile-input-with-icon" 
                        value={profile.email} 
                        readOnly 
                      />
                    </div>
                  </div>

                  <div className="profile-form-group">
                    <label>Professional Bio</label>
                    <textarea 
                      className="profile-form-input" 
                      style={{ minHeight: '100px', resize: 'vertical' }}
                      placeholder="Describe your role or department within the organization..."
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button type="submit" className="profile-btn profile-btn-primary">
                      <Save size={14} /> Save Profile Details
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {activeTab === 'security' && (
              <motion.div 
                key="security" 
                initial={{ opacity: 0, x: 8 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="profile-section-header">
                  <h2>Security &amp; Password</h2>
                  <p>Ensure your credentials remain secure. Update passwords or inspect active logins.</p>
                </div>
                <form onSubmit={handleSave} className="modern-profile-form">
                  <div className="profile-form-group">
                    <label>Current Password</label>
                    <div className="profile-input-wrapper">
                      <Lock size={14} className="profile-input-icon" />
                      <input 
                        type={showPassword.current ? 'text' : 'password'} 
                        className="profile-form-input profile-input-with-icon input-password-field" 
                        placeholder="••••••••••••"
                      />
                      <button 
                        type="button" 
                        className="input-eye-trigger" 
                        onClick={() => togglePasswordVisibility('current')}
                      >
                        {showPassword.current ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="profile-form-group">
                    <label>New Password</label>
                    <div className="profile-input-wrapper">
                      <Lock size={14} className="profile-input-icon" />
                      <input 
                        type={showPassword.new ? 'text' : 'password'} 
                        className="profile-form-input profile-input-with-icon input-password-field" 
                        placeholder="Enter secure password (min. 12 chars)"
                      />
                      <button 
                        type="button" 
                        className="input-eye-trigger" 
                        onClick={() => togglePasswordVisibility('new')}
                      >
                        {showPassword.new ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button type="submit" className="profile-btn profile-btn-primary">
                      Update Password
                    </button>
                  </div>
                </form>

                <div className="profile-section-header" style={{ marginTop: '40px', marginBottom: '16px' }}>
                  <h2>Authorized Active Sessions</h2>
                  <p>The devices currently authenticated to access this administrative account.</p>
                </div>
                <div className="sessions-table-wrapper">
                  <table className="sessions-table">
                    <thead>
                      <tr>
                        <th>Device/Location</th>
                        <th>IP Address</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Laptop size={14} style={{ color: 'var(--accent)' }} />
                            <div>
                              <strong>Chrome on Windows 11</strong>
                              <div style={{ fontSize: '11px', color: 'var(--df-text-muted)' }}>Vite Development Environment</div>
                            </div>
                          </div>
                        </td>
                        <td>127.0.0.1 (Localhost)</td>
                        <td>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center' }}>
                            <span className="status-indicator-dot" /> Active Now
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Laptop size={14} style={{ color: 'var(--df-text-muted)' }} />
                            <div>
                              <strong>Safari on macOS</strong>
                              <div style={{ fontSize: '11px', color: 'var(--df-text-muted)' }}>Apple Silicon Workstation</div>
                            </div>
                          </div>
                        </td>
                        <td>192.168.1.45</td>
                        <td style={{ color: 'var(--df-text-muted)', fontSize: '12px' }}>2 hours ago</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'preferences' && (
              <motion.div 
                key="preferences" 
                initial={{ opacity: 0, x: 8 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="profile-section-header">
                  <h2>System Preferences</h2>
                  <p>Tailor your workspace layout, styling presets, and communication alerts.</p>
                </div>
                <div className="pref-grid-container">
                  <div className="pref-tile">
                    <div className="pref-tile-text">
                      <h4>Dark Theme Interface</h4>
                      <p>Switch to high-contrast dark palette to minimize eye fatigue.</p>
                    </div>
                    <div 
                      className={`custom-switch ${preferences.darkMode ? 'active' : ''}`}
                      onClick={() => togglePref('darkMode')}
                    >
                      <div className="custom-switch-handle" />
                    </div>
                  </div>

                  <div className="pref-tile">
                    <div className="pref-tile-text">
                      <h4>Compact Mode Density</h4>
                      <p>Decrease screen margins and layouts to view more metrics at once.</p>
                    </div>
                    <div 
                      className={`custom-switch ${preferences.compactMode ? 'active' : ''}`}
                      onClick={() => togglePref('compactMode')}
                    >
                      <div className="custom-switch-handle" />
                    </div>
                  </div>

                  <div className="pref-tile">
                    <div className="pref-tile-text">
                      <h4>Real-time Notifications</h4>
                      <p>Get push pop-ups inside your browser whenever a data pipeline encounters a delay.</p>
                    </div>
                    <div 
                      className={`custom-switch ${preferences.notifications ? 'active' : ''}`}
                      onClick={() => togglePref('notifications')}
                    >
                      <div className="custom-switch-handle" />
                    </div>
                  </div>

                  <div className="pref-tile">
                    <div className="pref-tile-text">
                      <h4>Weekly Workspace Digest</h4>
                      <p>Receive aggregated diagnostic reports of job health via system logs every Monday.</p>
                    </div>
                    <div 
                      className={`custom-switch ${preferences.weeklyDigest ? 'active' : ''}`}
                      onClick={() => togglePref('weeklyDigest')}
                    >
                      <div className="custom-switch-handle" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Premium Toast Notification ── */}
      <AnimatePresence>
        {isSaved && (
          <motion.div 
            className="profile-save-toast"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
          >
            <CheckCircle size={15} /> Preferences synchronized successfully
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
