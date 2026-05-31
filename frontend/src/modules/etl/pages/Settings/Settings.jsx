import React, { useState, useEffect } from 'react';
import {
  Shield, Database, Activity,
  Trash2, Edit, Plus, RefreshCw, CheckCircle, Clock,
  Save, AlertTriangle, Zap, Info, X, Cloud,
  Bell, Lock, Eye, EyeOff, Send, MessageSquare,
  Terminal, ChevronDown, ChevronUp, Check, Copy, Cpu, Smartphone, Sparkles,
  Sliders, Layout, Globe, Palette, SlidersHorizontal
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Spinner } from '../../components/ui/Spinner';
import { Tooltip } from '../../components/ui/Tooltip';
import { useTheme } from '../../../../shared/context/ThemeContext';
import './Settings.css';

export function Settings() {
  const [activeTab, setActiveTab] = useState('preferences');
  const [saveStatus, setSaveStatus] = useState(null);
  const [showSensitive, setShowSensitive] = useState({});
  const [testPending, setTestPending] = useState({});

  // ── 1. Workspace Preferences & Theme States (Stored locally / context) ──
  const { isDark, toggleTheme } = useTheme();
  const theme = isDark ? 'dark' : 'light';
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('osa_accent') || 'indigo');
  const [language, setLanguage] = useState(() => localStorage.getItem('osa_lang') || 'en');
  const [timezone, setTimezone] = useState(() => localStorage.getItem('osa_tz') || 'browser');

  // ── 2. AI Copilot Personalization States (Stored locally for secure BYOK) ──
  const [copilotProvider, setCopilotProvider] = useState(() => localStorage.getItem('osa_copilot_provider') || 'groq');
  const [copilotKey, setCopilotKey] = useState(() => localStorage.getItem('osa_copilot_key') || '');
  const [copilotStyle, setCopilotStyle] = useState(() => localStorage.getItem('osa_copilot_style') || 'detailed');
  const [proactiveSuggestions, setProactiveSuggestions] = useState(() => localStorage.getItem('osa_copilot_proactive') !== 'false');
  const [copilotTone, setCopilotTone] = useState(() => localStorage.getItem('osa_copilot_tone') || 'professional');

  // ── 3. Data Fetching (System Settings & Credentials Vault) ──
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['system_settings'],
    queryFn: () => api.getSettings()
  });

  const { data: vaultItems, refetch: refetchVault } = useQuery({
    queryKey: ['vault_all'],
    queryFn: () => api.getVaultCredentials(),
    enabled: activeTab === 'credentials'
  });

  // ── 4. Mutations ──
  const updateSettingsMutation = useMutation({
    mutationFn: (data) => api.updateSettings(data),
    onSuccess: () => {
      setSaveStatus({ success: true, message: 'All changes synced and saved successfully!' });
      refetchSettings();
      setTimeout(() => setSaveStatus(null), 3000);
    },
    onError: (err) => {
      setSaveStatus({ success: false, message: err.response?.data?.detail || 'Failed to update settings.' });
      setTimeout(() => setSaveStatus(null), 5000);
    }
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id) => api.deleteVaultCredential(id),
    onSuccess: () => refetchVault()
  });

  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [editingVaultItem, setEditingVaultItem] = useState(null);
  const [vaultConfig, setVaultConfig] = useState('');
  const [revealedIds, setRevealedIds] = useState({});

  const saveVaultMutation = useMutation({
    mutationFn: (data) => {
      if (editingVaultItem) return api.updateVaultCredential(editingVaultItem.id, data);
      return api.createVaultCredential(data);
    },
    onSuccess: () => {
      refetchVault();
      closeVaultModal();
    }
  });

  const revealMutation = useMutation({
    mutationFn: (id) => api.getVaultCredential(id),
    onSuccess: (data) => {
      setRevealedIds(prev => ({ ...prev, [data.id]: JSON.stringify(data.config, null, 2) }));
    }
  });

  // Visual style accents applied to root element
  useEffect(() => {
    const accents = {
      indigo: '#6366f1',
      teal: '#0d9488',
      emerald: '#10b981',
      coral: '#f43f5e',
      amethyst: '#a855f7'
    };
    const activeColor = accents[accentColor] || '#6366f1';
    document.documentElement.style.setProperty('--accent', activeColor);
    document.documentElement.style.setProperty('--accent-subtle', `${activeColor}15`);
  }, [accentColor]);

  const openVaultModal = (item = null) => {
    setEditingVaultItem(item);
    if (item) {
      revealMutation.mutate(item.id);
    } else {
      setVaultConfig('{\n  "key": "value"\n}');
    }
    setIsVaultModalOpen(true);
  };

  const closeVaultModal = () => {
    setIsVaultModalOpen(false);
    setEditingVaultItem(null);
    setVaultConfig('');
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  };

  const handleCopyId = async (id) => {
    const success = await copyToClipboard(`vault:${id}`);
    if (success) {
      setSaveStatus({ success: true, message: 'Vault token reference copied to clipboard.' });
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  const toggleMask = (key) => {
    setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Dispatch Alert Channel Test ──
  const handleTestNotification = async (channel) => {
    const formData = new FormData(document.getElementById('preferences-form'));
    const config = Object.fromEntries(formData);
    
    setTestPending(prev => ({ ...prev, [channel]: true }));
    try {
      const resp = await api.testNotification(channel, config);
      setSaveStatus({ success: resp.success, message: resp.message });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus({ success: false, message: 'Test dispatch failed. Check bot parameters or webhook URI.' });
      setTimeout(() => setSaveStatus(null), 5000);
    } finally {
      setTestPending(prev => ({ ...prev, [channel]: false }));
    }
  };

  // ── Unified Preferences Saving (Form Submission) ──
  const handleSavePreferences = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // Collect database-mapped parameters
    const dbPayload = {};
    const dbKeys = [
      'MAX_CONCURRENT_JOBS', 'MEMORY_LIMIT_MB', 'PIPELINE_TIMEOUT', 'default_output_format',
      'dlt_chunk_size', 'LOG_RETENTION_DAYS', 'SCRATCH_CLEANUP_CRON',
      'SLACK_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
      'ANALYTICS_CACHE_SEC', 'ANALYTICS_MAX_EXPORT_ROWS',
      'DB_POOL_SIZE', 'DB_MAX_OVERFLOW', 'LOG_LEVEL',
      'S3_ENDPOINT_URL', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET_NAME',
      'VAULT_SECRET_KEY', 'GCP_SERVICE_ACCOUNT_JSON'
    ];

    dbKeys.forEach(key => {
      const val = formData.get(key);
      if (val !== null && val !== '') {
        dbPayload[key] = val;
      }
    });

    // Checkboxes and toggles mapped to string 'true' / 'false' expected by backend
    dbPayload['notify_on_failure'] = formData.get('notify_on_failure') === 'on' ? 'true' : 'false';
    dbPayload['RLS_ENABLED'] = formData.get('RLS_ENABLED') === 'true' ? 'true' : 'false';
    dbPayload['ANALYTICS_PUBLIC_SHARING'] = formData.get('ANALYTICS_PUBLIC_SHARING') === 'true' ? 'true' : 'false';

    // Persist visual settings locally inside localStorage
    localStorage.setItem('osa_theme', theme);
    localStorage.setItem('osa_accent', accentColor);
    localStorage.setItem('osa_lang', language);
    localStorage.setItem('osa_tz', timezone);

    localStorage.setItem('osa_copilot_provider', copilotProvider);
    localStorage.setItem('osa_copilot_key', copilotKey);
    localStorage.setItem('osa_copilot_style', copilotStyle);
    localStorage.setItem('osa_copilot_proactive', String(proactiveSuggestions));
    localStorage.setItem('osa_copilot_tone', copilotTone);

    // Save database fields to backend server
    updateSettingsMutation.mutate(dbPayload);
  };

  const renderMaskedInput = (name, label, helper, defaultValue) => {
    const isVisible = showSensitive[name];
    const encrypted = !!defaultValue?.startsWith('vault:');
    
    return (
      <div className="form-item full-width">
        <label>{label}</label>
        <div className="masked-input-wrapper">
          <input 
            type={isVisible ? "text" : "password"}
            name={name}
            defaultValue={defaultValue}
            placeholder={encrypted ? "Encrypted (Locked)" : "Enter secret key..."}
            readOnly={encrypted && !isVisible}
          />
          <button 
            type="button" 
            className="mask-toggle"
            onClick={() => toggleMask(name)}
          >
            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <span className="helper">{helper}</span>
      </div>
    );
  };

  const TABS = [
    { id: 'preferences', label: 'Theme & Styling',       icon: Palette },
    { id: 'engine',      label: 'Engine & BI Performance', icon: Activity },
    { id: 'credentials', label: 'Credentials & Vault',   icon: Shield   },
  ];

  return (
    <div className="settings-page">
      {/* ── Fixed Header ── */}
      <div className="settings-header">
        <div className="settings-header-left">
          <div className="settings-title-group">
            <h1 className="settings-title">Workspace Settings</h1>
            <p className="settings-subtitle">Manage system preferences and keys</p>
          </div>
          
          <div className="settings-header-divider" />
          
          <div className="settings-header-tabs">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        
        {true && (
          <button 
            type="submit" 
            form="preferences-form" 
            className="btn btn-primary"
            disabled={updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? <Spinner size={14} color="white" /> : <Save size={14} />}
            Save Configuration
          </button>
        )}
      </div>

      {/* ── Toast ── */}
      {saveStatus && (
        <div className={`save-status-toast ${saveStatus.success ? 'success' : 'error'}`}>
          {saveStatus.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* ── Scrollable Content Area ── */}
      <div className="settings-content">
        <form id="preferences-form" onSubmit={handleSavePreferences}>

          {/* 1. Theme & Styling */}
          {activeTab === 'preferences' && (
            <div className="settings-card fade-in">
              <div className="settings-sections-grid">
                
                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>Color Palette Theme</h2>
                    <p>Customize the interface mode and visual accents of the platform.</p>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-item">
                      <label>Interface Mode</label>
                      <select value={theme} onChange={(e) => {
                        const selected = e.target.value;
                        if ((selected === 'dark' && !isDark) || (selected === 'light' && isDark)) {
                          toggleTheme();
                        }
                      }}>
                        <option value="dark">Sleek Obsidian (Dark Mode)</option>
                        <option value="light">Crisp Quartz (Light Mode)</option>
                      </select>
                    </div>
                    
                    <div className="form-item">
                      <label>Color Accent Highlight</label>
                      <select value={accentColor} onChange={(e) => setAccentColor(e.target.value)}>
                        <option value="indigo">Classic Indigo Fusion</option>
                        <option value="teal">Deep Ocean Teal</option>
                        <option value="emerald">Vibrant Sleek Emerald</option>
                        <option value="coral">Energetic Sunset Coral</option>
                        <option value="amethyst">Royal Mystic Amethyst</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>Localization &amp; Region</h2>
                    <p>Configure interface translations and standard data timestamp rules.</p>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-item">
                      <label>Language Preference</label>
                      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option value="en">English (United States)</option>
                        <option value="es">Español (Castellano)</option>
                        <option value="fr">Français (Standard)</option>
                        <option value="de">Deutsch (Deutschland)</option>
                      </select>
                    </div>

                    <div className="form-item">
                      <label>Time Zone Representation</label>
                      <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                        <option value="browser">Follow Local System Time</option>
                        <option value="utc">Coordinated Universal Time (UTC)</option>
                        <option value="est">Eastern Standard Time (EST)</option>
                        <option value="pst">Pacific Standard Time (PST)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 2. Engine & BI Performance */}
          {activeTab === 'engine' && (
            <div className="settings-card fade-in">
              <div className="settings-sections-grid">
                
                {/* Engine Limits & VM Tuning */}
                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>Pipeline Engine Limits</h2>
                    <p>Fine-tune resource utilization limits for your pipeline runners (Polars VM).</p>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-item">
                      <label>Max Concurrent Pipelines</label>
                      <input type="number" name="MAX_CONCURRENT_JOBS" defaultValue={settings?.MAX_CONCURRENT_JOBS || 2} />
                    </div>
                    
                    <div className="form-item">
                      <label>Memory Guard Limit (MB)</label>
                      <input type="number" name="MEMORY_LIMIT_MB" defaultValue={settings?.MEMORY_LIMIT_MB || 512} />
                    </div>

                    <div className="form-item">
                      <label>Pipeline Timeout (Seconds)</label>
                      <input type="number" name="PIPELINE_TIMEOUT" defaultValue={settings?.PIPELINE_TIMEOUT || 3600} />
                    </div>

                    <div className="form-item">
                      <label>Default Output Format</label>
                      <select name="default_output_format" defaultValue={settings?.default_output_format || 'parquet'}>
                        <option value="parquet">Parquet (Optimized, Default)</option>
                        <option value="csv">CSV (Legacy Compatibility)</option>
                        <option value="json">JSON Lines (Streaming)</option>
                      </select>
                    </div>

                    <div className="form-item">
                      <label>Database Connection Pool Size</label>
                      <input type="number" name="DB_POOL_SIZE" defaultValue={settings?.DB_POOL_SIZE || 10} />
                    </div>

                    <div className="form-item">
                      <label>Allowed Connection Overflow</label>
                      <input type="number" name="DB_MAX_OVERFLOW" defaultValue={settings?.DB_MAX_OVERFLOW || 20} />
                    </div>

                    <div className="form-item">
                      <label>System Log Verbosity Level</label>
                      <select name="LOG_LEVEL" defaultValue={settings?.LOG_LEVEL || 'INFO'}>
                        <option value="DEBUG">DEBUG (Detailed Telemetry)</option>
                        <option value="INFO">INFO (Standard Progress)</option>
                        <option value="WARNING">WARNING (Priority Only)</option>
                        <option value="ERROR">ERROR (Errors Only)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Data Lifecycle, BI & Access Controls */}
                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>Data Lifecycle &amp; BI Performance</h2>
                    <p>Configure dashboard latencies, query caching, and row-level security isolates.</p>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-item">
                      <label>Streaming Chunk Size (Rows)</label>
                      <input type="number" name="dlt_chunk_size" defaultValue={settings?.dlt_chunk_size || 5000} />
                    </div>

                    <div className="form-item">
                      <label>Log Retention (Days)</label>
                      <input type="number" name="LOG_RETENTION_DAYS" defaultValue={settings?.LOG_RETENTION_DAYS || 30} />
                    </div>

                    <div className="form-item">
                      <label>Scratch Context Cleanup</label>
                      <select name="SCRATCH_CLEANUP_CRON" defaultValue={settings?.SCRATCH_CLEANUP_CRON || 'daily'}>
                        <option value="daily">Daily at Midnight (00:00)</option>
                        <option value="weekly">Weekly (Sunday 00:00)</option>
                        <option value="never">Manual Purge Only</option>
                      </select>
                    </div>

                    <div className="form-item">
                      <label>Query Cache Duration (Seconds)</label>
                      <input type="number" name="ANALYTICS_CACHE_SEC" defaultValue={settings?.ANALYTICS_CACHE_SEC || 300} />
                    </div>
                    
                    <div className="form-item">
                      <label>Maximum Rows per Export</label>
                      <input type="number" name="ANALYTICS_MAX_EXPORT_ROWS" defaultValue={settings?.ANALYTICS_MAX_EXPORT_ROWS || 50000} />
                    </div>

                    <div className="form-item">
                      <label>Row-Level Security (RLS)</label>
                      <select name="RLS_ENABLED" defaultValue={settings?.RLS_ENABLED || 'true'}>
                        <option value="true">Enforced (Apply row filters by user role)</option>
                        <option value="false">Permissive (No row filter isolation)</option>
                      </select>
                    </div>

                    <div className="form-item">
                      <label>Public Dashboard Sharing</label>
                      <select name="ANALYTICS_PUBLIC_SHARING" defaultValue={settings?.ANALYTICS_PUBLIC_SHARING || 'false'}>
                        <option value="false">Restricted (Authenticated Workspace Users Only)</option>
                        <option value="true">Public (Anonymous Access Allowed)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. Credentials & Integrations */}
          {activeTab === 'credentials' && (
            <div className="settings-card fade-in">
              <div className="settings-sections-grid">
                
                {/* AI Copilot Keys */}
                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>AI Copilot Personalization</h2>
                    <p>Bring Your Own Key — Securely store your credentials locally in this browser.</p>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-item">
                      <label>LLM Engine Provider</label>
                      <select value={copilotProvider} onChange={(e) => setCopilotProvider(e.target.value)}>
                        <option value="groq">Groq Inference Engine (Lightning Fast)</option>
                        <option value="openai">OpenAI Platform (High Intelligence GPT-4o)</option>
                      </select>
                    </div>
                    
                    <div className="form-item">
                      <label>Personal API Authorization Key</label>
                      <input 
                        type="password"
                        placeholder="gsk_... or sk-proj-..."
                        value={copilotKey}
                        onChange={(e) => setCopilotKey(e.target.value)}
                      />
                    </div>

                    <div className="form-item">
                      <label>Interaction Output Style</label>
                      <select value={copilotStyle} onChange={(e) => setCopilotStyle(e.target.value)}>
                        <option value="detailed">Step-by-Step Tutorial &amp; Interactive guidance</option>
                        <option value="snippets">Code-Only (Direct SQL and pipeline snippet focus)</option>
                        <option value="brief">Brief summaries with bulleted highlights</option>
                      </select>
                    </div>

                    <div className="form-item">
                      <label>Assistant Conversation Tone</label>
                      <select value={copilotTone} onChange={(e) => setCopilotTone(e.target.value)}>
                        <option value="professional">Clear &amp; Professional (Standard)</option>
                        <option value="concise">Concise &amp; Tech-Savvy</option>
                        <option value="casual">Casual &amp; Proactive Coach</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Alerting Channels */}
                <div className="settings-grid-cell">
                  <div className="section-header">
                    <h2>Ingestion Alerting Channels</h2>
                    <p>Configure Slack or Telegram to broadcast automated pipeline failure warnings.</p>
                  </div>
                  
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '16px' }}>
                    <div className="toggle-item-switch" style={{ marginBottom: '10px' }}>
                      <label className="custom-toggle">
                        <input type="checkbox" id="notify_on_failure" name="notify_on_failure" defaultChecked={settings?.notify_on_failure !== 'false'} />
                        <span className="toggle-slider"></span>
                      </label>
                      <div className="toggle-label">
                        <strong>Enable Global Ingestion Alerts</strong>
                      </div>
                    </div>

                    <div className="notification-card slack" style={{ padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div className="card-top" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <MessageSquare size={16} style={{ color: '#4A154B' }} />
                        <strong style={{ fontSize: '13px' }}>Slack Integration</strong>
                      </div>
                      {renderMaskedInput("SLACK_WEBHOOK_URL", "Incoming Webhook URL", "Failures target webhook channel endpoint.", settings?.SLACK_WEBHOOK_URL)}
                      <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: '8px' }} onClick={() => handleTestNotification('slack')} disabled={testPending['slack']}>
                        {testPending['slack'] ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                        Test Slack
                      </button>
                    </div>

                    <div className="notification-card telegram" style={{ padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div className="card-top" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Smartphone size={16} style={{ color: '#0088cc' }} />
                        <strong style={{ fontSize: '13px' }}>Telegram Bot</strong>
                      </div>
                      {renderMaskedInput("TELEGRAM_BOT_TOKEN", "Bot API Token", "Configure from Telegram @BotFather token.", settings?.TELEGRAM_BOT_TOKEN)}
                      <div className="form-item" style={{ marginTop: '8px' }}>
                        <label>Receiver Chat ID</label>
                        <input name="TELEGRAM_CHAT_ID" defaultValue={settings?.TELEGRAM_CHAT_ID} placeholder="Ex: 123456789" />
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: '8px' }} onClick={() => handleTestNotification('telegram')} disabled={testPending['telegram']}>
                        {testPending['telegram'] ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                        Test Telegram
                      </button>
                    </div>
                  </div>
                </div>

                {/* Master System Keys & GCP (wide span-full) */}
                <div className="settings-grid-cell span-full" style={{ borderBottom: 'none' }}>
                  <div className="section-header">
                    <h2>Master Integration Keys &amp; GCP</h2>
                    <p>Register the system's global master encryption keys and cloud platform accounts.</p>
                  </div>
                  <div className="form-grid">
                    <div className="form-item full-width">
                      <label>Vault Secret Key (Master Encryption Key)</label>
                      <input name="VAULT_SECRET_KEY" defaultValue={settings?.VAULT_SECRET_KEY} placeholder="Hex key..." type="password" />
                      <span className="helper">Master key to securely seal credentials on disk.</span>
                    </div>
                    
                    <div className="form-item full-width">
                      <label>GCP Service Account JSON</label>
                      <textarea 
                        name="GCP_SERVICE_ACCOUNT_JSON" 
                        defaultValue={settings?.GCP_SERVICE_ACCOUNT_JSON} 
                        placeholder='{"type": "service_account", ...}' 
                        rows={5}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1.5px solid var(--border-strong)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '8px'
                        }}
                      />
                      <span className="helper">Google Cloud Platform credentials file content.</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </form>

        {/* 6. Security Vault (Outside the general preferences form) */}
        {activeTab === 'credentials' && (
          <div className="settings-card fade-in">
            <div className="section-header vault-header">
              <div>
                <h2>Security Credentials Vault</h2>
                <p>Isolated, AES-256 encrypted credential records store. Safe and locked dynamic parameters reference.</p>
              </div>
              <button className="btn btn-accent" onClick={() => openVaultModal()}>
                <Plus size={16} /> Inject Secret
              </button>
            </div>
            
            <div className="vault-table-container">
              <table className="vault-table">
                <thead>
                  <tr>
                    <th>Identifier / Reference</th>
                    <th>Target Engine</th>
                    <th>Raw Content (Decrypt)</th>
                    <th className="text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {!Array.isArray(vaultItems) || vaultItems.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-state">Secure credentials vault is currently empty.</td>
                    </tr>
                  ) : (
                    vaultItems.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="vault-id-cell">
                            <span className="v-name">{item.name}</span>
                            <code className="v-code">vault:{item.id.substring(0, 8)}...</code>
                            <button className="copy-btn" onClick={() => handleCopyId(item.id)}><Copy size={12} /></button>
                          </div>
                        </td>
                        <td><span className="badge-engine">{item.engine}</span></td>
                        <td>
                          {revealedIds[item.id] ? (
                            <pre className="revealed-secret">{revealedIds[item.id]}</pre>
                          ) : (
                            <span className="masked-secret">••••••••••••••••</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="vault-item-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <Tooltip content="Decrypt">
                              <button type="button" className="icon-btn" onClick={() => revealMutation.mutate(item.id)}>
                                <Eye size={14} />
                              </button>
                            </Tooltip>
                            <Tooltip content="Edit">
                              <button type="button" className="icon-btn" onClick={() => openVaultModal(item)}>
                                <Edit size={14} />
                              </button>
                            </Tooltip>
                            <Tooltip content="Delete">
                              <button type="button" className="icon-btn delete" onClick={() => deleteCredMutation.mutate(item.id)}>
                                <Trash2 size={14} />
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Vault Modal */}
            {isVaultModalOpen && (
              <div className="modal-overlay">
                <div className="modal-glass">
                  <div className="modal-header">
                    <h3>{editingVaultItem ? 'Rotate Secret Key' : 'Inject Secure Credentials'}</h3>
                    <button className="close-btn" onClick={closeVaultModal}><X size={20} /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    try {
                      const configToParse = editingVaultItem ? (revealedIds[editingVaultItem.id] || vaultConfig) : vaultConfig;
                      const configObj = JSON.parse(configToParse);
                      
                      saveVaultMutation.mutate({
                        name: formData.get('name'),
                        engine: formData.get('engine'),
                        config: configObj
                      });
                    } catch (err) {
                      alert("Configuration error: Please ensure the block is valid JSON format.");
                    }
                  }}>
                    <div className="modal-body">
                      <div className="form-grid">
                        <div className="form-item">
                          <label>Reference Name</label>
                          <input name="name" defaultValue={editingVaultItem?.name} placeholder="e.g. SNOWFLAKE_PROD" required />
                        </div>
                        <div className="form-item">
                          <label>Service Engine Name</label>
                          <input name="engine" defaultValue={editingVaultItem?.engine} placeholder="e.g. snowflake" required />
                        </div>
                        <div className="form-item full-width">
                          <label>JSON Configuration Block</label>
                          <textarea 
                            className="json-textarea-vault"
                            value={revealedIds[editingVaultItem?.id] || vaultConfig}
                            onChange={(e) => {
                              if (editingVaultItem) {
                                setRevealedIds(prev => ({ ...prev, [editingVaultItem.id]: e.target.value }));
                              } else {
                                setVaultConfig(e.target.value);
                              }
                            }}
                            placeholder='{"key": "value"}'
                            rows={8}
                          />
                          <span className="helper">Will be symmetrically encrypted on disk.</span>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline" onClick={closeVaultModal}>Dismiss</button>
                      <button type="submit" className="btn btn-accent" disabled={saveVaultMutation.isLoading}>
                        {saveVaultMutation.isLoading ? 'Committing...' : (editingVaultItem ? 'Save Rotation' : 'Seal Credentials')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
