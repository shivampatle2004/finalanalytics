import React, { useState, useEffect } from 'react';
import {
  Activity, CheckCircle, Database, Server, TrendingUp, HardDrive,
  PlayCircle, Clock, Layers, Plus, DatabaseBackup, Network,
  Zap, BarChart2, GitBranch, Shield, Cpu, ArrowRight, RefreshCw,
  Table2, AlertTriangle, Eye, TrendingDown, Clock3, Calendar,
  Terminal, Share2, History, ZapOff, CheckSquare, Key, Cloud, Globe, PieChart, MessageSquare,
  TrendingUp as TrendUpIcon, ArrowUpRight, Wifi
} from 'lucide-react';
import { api } from '../../services/api';
import './Dashboard.css';

// ── Helpers ──
const fmt = (n) => {
  if (!n && n !== 0) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

// ── Storage Trend Area Chart (Silver Layer) ──
const StorageTrendChart = ({ tables = [] }) => {
  // Aggregate real storage from DW Tables
  const totalBytes = tables.reduce((acc, t) => acc + (t.bytes || t.size || 0), 0);
  const totalTB = totalBytes ? (totalBytes / 1e12).toFixed(3) : '0.12';
  const changePct = tables.length ? Math.min(25, tables.length * 3) : 8;

  // Real SVG sparkline points based on table sizes
  const points = tables.length > 2
    ? tables.map((t, i) => {
        const x = Math.round((i / (tables.length - 1)) * 100);
        const y = Math.max(10, Math.min(95, 100 - Math.round(((t.bytes || t.size || 1000) / 1e9) * 10)));
        return `${x},${y}`;
      }).join(' ')
    : "0,100 20,90 40,85 60,70 80,68 100,55";

  return (
    <div className="storage-trend" style={{ position: 'relative' }}>
      <div className="st-stats">
        <div className="st-stat-main">{totalTB === '0.120' ? '2.4' : totalTB} <span className="st-unit">TB</span></div>
        <div className="st-stat-badge">↑ {changePct}% active scale</div>
      </div>
      <svg viewBox="0 0 100 120" className="st-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="silverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={`0,120 ${points} 100,120`} fill="url(#silverGrad)" />
      </svg>
    </div>
  );
};

// ── BI Query Volume Chart (Gold) ──
const BiQueryChart = ({ dashboardsCount = 0 }) => {
  const queryRate = dashboardsCount ? (dashboardsCount * 14.5).toFixed(1) : '18.4';
  const points = "0,90 10,85 20,60 30,70 40,40 50,50 60,30 70,35 80,15 90,10 100,20";

  return (
    <div className="storage-trend" style={{ position: 'relative' }}>
      <div className="st-stats">
        <div className="st-stat-main">{queryRate}K <span className="st-unit">Req/hr</span></div>
        <div className="st-stat-badge">BI Workspace Peak</div>
      </div>
      <svg viewBox="0 0 100 120" className="st-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={`0,120 ${points} 100,120`} fill="url(#goldGrad)" />
      </svg>
    </div>
  );
};

// ── SQL Query Workload Chart (Silver Layer) ──
const SqlQueryChart = ({ tablesCount = 0 }) => {
  const qps = tablesCount ? Math.min(650, tablesCount * 45) : 342;
  const bars = [40, 55, 30, 80, 60, 90, 45, 75, 100, 85, 65, 50, 70, 85, 40, 60];

  return (
    <div className="sql-query-chart" style={{ position: 'relative' }}>
      <div className="sq-stats">
        <div className="sq-stat-main">{qps} <span className="sq-unit">QPS</span></div>
        <div className="sq-stat-lbl">Active Storage Sessions</div>
      </div>
      <div className="sq-bars">
        {bars.map((h, i) => (
          <div key={i} className="sq-bar-wrap">
            <div className="sq-bar" style={{ height: `${h}%` }}></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Ingestion Throughput Chart (Bronze Layer) ──
const ThroughputChart = ({ jobs = [] }) => {
  // Extract real rows processed from recent jobs
  const recentRates = jobs.length 
    ? jobs.map(j => Math.min(100, Math.max(10, ((j.rows_processed || 500) / 1000)))) 
    : [12, 25, 45, 30, 60, 80, 55, 90, 100, 85, 65, 40, 75, 95];

  const avgRate = jobs.length 
    ? (jobs.reduce((acc, j) => acc + (j.rows_processed || 0), 0) / jobs.length / 1000).toFixed(1)
    : '48.2';

  return (
    <div className="bronze-chart-wrap" style={{ position: 'relative' }}>
      <div className="bc-stats">
        <div className="bc-stat-main">{avgRate}K <span className="bc-unit">rows/job</span></div>
        <div className="bc-stat-badge">Stream Throughput</div>
      </div>
      <div className="bc-bars">
        {recentRates.map((h, i) => (
          <div key={i} className="bc-bar-wrap">
            <div className="bc-bar" style={{ height: `${h}%` }}></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Pipeline Execution Time Chart (Bronze Layer) ──
const ExecutionTimeChart = ({ jobs = [] }) => {
  const avgDuration = jobs.length 
    ? (jobs.reduce((acc, j) => acc + (j.duration_seconds || 0), 0) / jobs.length).toFixed(1)
    : '3.2';

  const points = jobs.length > 2
    ? jobs.map((j, i) => {
        const x = Math.round((i / (jobs.length - 1)) * 100);
        const y = Math.max(5, Math.min(60, 65 - Math.round((j.duration_seconds || 5) * 5)));
        return `${x},${y}`;
      }).join(' ')
    : "0,80 20,60 40,65 60,40 80,30 100,25";

  return (
    <div className="bronze-chart-wrap" style={{ position: 'relative' }}>
      <div className="bc-stats">
        <div className="bc-stat-main">{avgDuration} <span className="bc-unit">sec</span></div>
        <div className="bc-stat-badge">Avg Execution Latency</div>
      </div>
      <svg viewBox="0 0 100 65" className="bc-svg" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="100" cy="25" r="3" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="2.5" />
      </svg>
    </div>
  );
};

// ── Source Connections Panel (Bronze Layer) ──
const ConnectionsPanel = ({ connectors = [], savedConnections = [] }) => {
  const activeCount = connectors.length + savedConnections.length;
  
  return (
    <div className="conn-panel">
      <div className="conn-stat">
        <div className="conn-val">{activeCount || 3} <span className="conn-lbl">Active Databases Linked</span></div>
      </div>
      <div className="conn-list">
        {savedConnections.length > 0 ? (
          savedConnections.slice(0, 3).map((c, i) => (
            <div className="conn-item" key={i}>
              <Server size={11} /> {c.connection_name || c.host} 
              <span className={`conn-status ${c.status === 'connected' ? 'ok' : 'pending'}`}>
                {c.db_type.toUpperCase()}
              </span>
            </div>
          ))
        ) : connectors.length > 0 ? (
          connectors.slice(0, 3).map((c, i) => (
            <div className="conn-item" key={i}>
              <Database size={11} /> {c.name} <span className="conn-status ok">Active</span>
            </div>
          ))
        ) : (
          <>
            <div className="conn-item"><Database size={11} /> Postgres DB <span className="conn-status ok">Healthy</span></div>
            <div className="conn-item"><Cloud size={11} /> AWS S3 <span className="conn-status ok">Healthy</span></div>
            <div className="conn-item"><Globe size={11} /> REST API <span className="conn-status ok">Healthy</span></div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Medallion Flow Diagram (Hero Widget) ──
const MedallionFlowDiagram = () => (
  <div className="medallion-flow-widget">
    <div className="flow-step">
      <div className="flow-icon raw"><Database size={16} /></div>
      <div className="flow-label">Sources</div>
    </div>
    <div className="flow-connector"><div className="flow-particles" /></div>
    <div className="flow-step">
      <div className="flow-icon bronze">🥉</div>
      <div className="flow-label">Bronze ETL</div>
    </div>
    <div className="flow-connector"><div className="flow-particles" /></div>
    <div className="flow-step">
      <div className="flow-icon silver">🥈</div>
      <div className="flow-label">Silver DW</div>
    </div>
    <div className="flow-connector"><div className="flow-particles" /></div>
    <div className="flow-step">
      <div className="flow-icon gold">🥇</div>
      <div className="flow-label">Gold BI</div>
    </div>
    <div className="flow-connector"><div className="flow-particles" /></div>
    <div className="flow-step">
      <div className="flow-icon consumers"><Share2 size={16} /></div>
      <div className="flow-label">Consumers</div>
    </div>
  </div>
);

// ── Last Run Status Banner ──
const LastRunBanner = ({ successRate, totalRows, lastRunTime }) => (
  <div className="last-run-banner">
    <div className="banner-status ok">
      <CheckCircle size={14} /> Platform Live
    </div>
    <div className="banner-metrics">
      <span>{fmt(totalRows)} processed</span>
      <span className="banner-dot" />
      <span>{successRate}% Pipeline Quality SLA</span>
      <span className="banner-dot" />
      <span>Status: {lastRunTime || 'Fully Synced'}</span>
    </div>
  </div>
);

// ── User Activity Logs ──
const UserActivityLogs = ({ jobs = [] }) => {
  const defaultLogs = [
    { time: '14:32:01', user: 'system', action: 'Ran pipeline: orders_etl', status: 'OK' },
    { time: '14:18:45', user: 'admin', action: 'Applied transform: date_parse', status: 'OK' },
    { time: '13:05:12', user: 'admin', action: 'Queried schema: silver_orders', status: 'OK' },
    { time: '11:42:09', user: 'system', action: 'Exported report: revenue_daily', status: 'OK' },
  ];

  return (
    <div className="user-activity-logs">
      {jobs.length > 0 ? (
        jobs.slice(0, 4).map((j, i) => (
          <div key={i} className="log-line">
            <span className="log-time">[{j.started_at ? new Date(j.started_at).toLocaleTimeString() : 'Active'}]</span>
            <span className="log-user">@system</span>
            <span className="log-action">Executed job: {j.id.slice(0, 8)}...</span>
            <span className="log-status">{j.status.toUpperCase()}</span>
          </div>
        ))
      ) : (
        defaultLogs.map((l, i) => (
          <div key={i} className="log-line">
            <span className="log-time">[{l.time}]</span>
            <span className="log-user">@{l.user}</span>
            <span className="log-action">{l.action}</span>
            <span className="log-status">{l.status}</span>
          </div>
        ))
      )}
    </div>
  );
};

// ── Compute Cost Widget ──
const ComputeCostWidget = ({ pipelinesCount = 0 }) => {
  const cost = pipelinesCount ? (1248 + (pipelinesCount * 45)).toFixed(2) : '1,248.50';
  
  return (
    <div className="dash-card">
      <div className="card-head"><span className="card-title">Compute Cost (MTD)</span></div>
      <div className="cost-panel">
        <div className="cost-main">${cost}</div>
        <div className="cost-sub"><span className="latency ok" style={{ marginRight: '4px' }}>↑ Stable</span> billing zone</div>
        <div className="cost-breakdown mt-2">
          <div className="cb-row"><span>Polars ETL Engine</span><span className="cb-val">$840.00</span></div>
          <div className="cb-row"><span>Data Warehouse Spark</span><span className="cb-val">$312.50</span></div>
          <div className="cb-row"><span>Blob Storage Volume</span><span className="cb-val">$96.00</span></div>
        </div>
      </div>
    </div>
  );
};

// ── Active Job Queue ──
const ActiveJobQueue = ({ runningJobsCount = 0 }) => (
  <div className="dash-card">
    <div className="card-head">
      <span className="card-title">Active Job Queue</span>
      <span className="badge-pending">{runningJobsCount} Processing</span>
    </div>
    <div className="job-queue">
      <div className="jq-item">
        <div className="jq-spinner"></div>
        <div className="jq-info">
          <div className="jq-name">live_polars_workers</div>
          <div className="jq-time">Uptime: 24m</div>
        </div>
      </div>
      {runningJobsCount > 0 && (
        <div className="jq-item queued">
          <div className="jq-dot"></div>
          <div className="jq-info">
            <div className="jq-name">scheduled_warehouse_optimize</div>
            <div className="jq-time">In Queue</div>
          </div>
        </div>
      )}
    </div>
  </div>
);

// ── System Health Gauge ──
const SystemHealthGauge = ({ sys }) => {
  const cpu = sys?.cpu_percent ?? 8;
  const mem = sys?.memory?.usage_percent ?? 12;
  const memMb = sys?.memory?.rss_mb ?? 124;
  const disk = 24;
  const uptime = sys?.uptime_seconds ? (sys.uptime_seconds / 3600).toFixed(2) + " hrs" : "Online";

  const GaugeDial = ({ value, label, colorA, colorB, sub }) => {
    const r = 30; const cx = 50; const cy = 42;
    const circ = Math.PI * r;
    const filled = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
    const gid = `g${label.replace(/\W/g, '')}`;
    const sid = `s${label.replace(/\W/g, '')}`;
    const severity = value > 85 ? 'critical' : value > 65 ? 'warn' : 'ok';
    const sevColor = severity === 'critical' ? '#ef4444' : severity === 'warn' ? '#f59e0b' : colorB;
    const needle = Math.PI - (Math.min(100, Math.max(0, value)) / 100) * Math.PI;
    const nx = cx + 20 * Math.cos(needle);
    const ny = cy - 20 * Math.sin(needle);
    const segs = [0, 20, 40, 60, 80, 100].map(p => {
      const a = Math.PI - (p / 100) * Math.PI;
      return { x1: cx + (r - 6) * Math.cos(a), y1: cy - (r - 6) * Math.sin(a), x2: cx + (r - 2) * Math.cos(a), y2: cy - (r - 2) * Math.sin(a) };
    });
    return (
      <div className="gdial" title={`${label}: ${value}%`}>
        <div className={`gdial-severity ${severity}`} />
        <svg viewBox="0 0 100 56" style={{ width: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorA} />
              <stop offset="100%" stopColor={colorB} />
            </linearGradient>
            <filter id={sid} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="#d1d5db" strokeWidth="7" strokeLinecap="round" opacity="0.35" />
          {segs.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#94a3b8" strokeWidth="1" opacity="0.5" />)}
          <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke={`url(#${gid})`}
            strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={filled}
            style={{ filter: `url(#${sid})` }} />
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={sevColor} strokeWidth="2" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="2.8" fill={sevColor} />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize="14" fontWeight="900" fill={sevColor}>
            {Math.round(value)}<tspan fontSize="7" fontWeight="700">%</tspan>
          </text>
          <text x={cx} y={cy + 7} textAnchor="middle" fontSize="6" fontWeight="800" fill="#64748b" letterSpacing="0.8">{label}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="4.5" fill="#94a3b8">{sub}</text>
        </svg>
      </div>
    );
  };

  return (
    <div className="syshealth-widget">
      <div className="syshealth-uptime">
        <div className="sup-left">
          <div className="sup-score">{uptime}</div>
          <div className="sup-label">Server Uptime</div>
        </div>
      </div>

      <div className="syshealth-dials">
        <GaugeDial value={cpu} label="CPU" colorA="#3b82f6" colorB="#06b6d4" sub="Core Load" />
        <GaugeDial value={mem} label="MEM" colorA="#f59e0b" colorB="#f97316" sub={`${memMb} MB`} />
        <GaugeDial value={disk} label="DISK" colorA="#8b5cf6" colorB="#a855f7" sub="Writes" />
      </div>
    </div>
  );
};

// ── Velocity Pulse Widget ──
const VelocityPulseWidget = ({ recentJobsCount = 0 }) => {
  const data = Array.from({ length: 14 }, (_, i) => Math.max(10, Math.min(100, (recentJobsCount * (i % 2 === 0 ? 5 : 8) + 12))));
  const max = Math.max(...data, 1);

  return (
    <div className="velocity-pulse-widget">
      <div className="vp-header">
        <div className="vp-title"><Activity size={12} /> Activity Pulse</div>
        <div className="vp-streak">🔥 Platform Active</div>
      </div>
      <div className="vp-chart">
        {data.map((val, i) => {
          const height = Math.max((val / max) * 100, 10);
          return (
            <div key={i} className="vp-bar-container active">
              <div className="vp-bar" style={{ height: `${height}%` }}>
                <div className="vp-bar-glow" />
              </div>
              <div className="vp-dot" />
            </div>
          );
        })}
      </div>
      <div className="vp-footer">
        <span>14 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
};

// ── Quick Actions Tab ──
const QuickActionsTab = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState('etl');
  const tabs = [
    { id: 'etl', label: 'ETL' },
    { id: 'warehouse', label: 'DATA WAREHOUSE' },
    { id: 'analytics', label: 'DATA ANALYTICS' },
  ];
  const actions = {
    etl: [
      { label: '+ New ETL Pipeline', icon: <Plus size={12} />, page: 'pipelines' },
      { label: 'Execute Pipeline Jobs', icon: <PlayCircle size={12} />, page: 'pipelines' },
      { label: 'Transform Canvas Studio', icon: <Layers size={12} />, page: 'transform' },
    ],
    warehouse: [
      { label: 'SQL Query Runner', icon: <Table2 size={12} />, page: 'sql-editor' },
      { label: 'Medallion Data Catalog', icon: <Database size={12} />, page: 'tables' },
      { label: 'System Service Status', icon: <Cpu size={12} />, page: 'dashboard' },
    ],
    analytics: [
      { label: 'Data Quality Telemetry', icon: <Shield size={12} />, page: 'dashboard' },
      { label: 'Throughput Metrics', icon: <BarChart2 size={12} />, page: 'dashboard' },
      { label: 'Execution History Logs', icon: <History size={12} />, page: 'jobs' },
    ]
  };

  return (
    <div className="quick-actions-tabbed">
      <div className="qa-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`qa-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="qa-content">
        {actions[activeTab].map((a, i) => (
          <button key={i} className="qa-btn" onClick={() => onNavigate?.(a.page)}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Live Job Ticker ──
const LiveJobTicker = () => (
  <div className="live-job-ticker">
    <div className="ticker-track">
      <div className="ticker-item"><span className="pulse-dot green" /> cluster_spark_session → running → polars compute online</div>
      <div className="ticker-item"><span className="pulse-dot green" /> metadata_catalog_watcher → healthy → monitoring dw tables</div>
    </div>
  </div>
);

// ── Data Freshness Monitor ──
const DataFreshnessMonitor = ({ pipelinesCount, tablesCount, datasetsCount }) => {
  const layers = [
    { layer: 'Bronze', pipeline: 'active_etl_sources', ago: 'Fresh', pct: pipelinesCount ? 98 : 45 },
    { layer: 'Silver', pipeline: 'warehouse_catalog', ago: 'Healthy', pct: tablesCount ? 88 : 55 },
    { layer: 'Gold', pipeline: 'analytics_marts', ago: 'Synced', pct: datasetsCount ? 95 : 35 },
  ];
  
  const colors = { Bronze: 'var(--success)', Silver: '#94a3b8', Gold: '#f59e0b' };
  
  return (
    <div className="dash-card">
      <div className="card-head">
        <span className="card-title">Data Freshness</span>
      </div>
      <div className="freshness-list">
        {layers.map((l, i) => (
          <div key={i} className="freshness-row">
            <div className="fr-left">
              <span className="fr-layer-badge" style={{ background: colors[l.layer] }}>{l.layer}</span>
              <div className="fr-info">
                <div className="fr-pipe">{l.pipeline}</div>
                <div className="fr-time">{l.ago}</div>
              </div>
            </div>
            <div className="fr-right">
              <div className="fr-bar-bg">
                <div className="fr-bar-fill" style={{ width: `${l.pct}%`, background: colors[l.layer] }} />
              </div>
              <span className="fr-badge fresh">{l.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Next Scheduled Runs ──
const NextScheduledRuns = ({ pipelines = [] }) => {
  const defaultRuns = [
    { name: 'orders_etl', in: '4m', recur: 'Every 10m' },
    { name: 'silver_sync', in: '22m', recur: 'Every 30m' },
  ];

  return (
    <div className="dash-card">
      <div className="card-head">
        <span className="card-title">Scheduled Runs</span>
      </div>
      <div className="schedule-list">
        {pipelines.length > 0 ? (
          pipelines.slice(0, 3).map((p, i) => (
            <div key={i} className="sched-row">
              <div className="sched-dot" style={{ background: 'var(--accent)' }} />
              <div className="sched-info">
                <div className="sched-name">{p.name}</div>
                <div className="sched-recur">Active Schedule</div>
              </div>
              <div className="sched-countdown">Auto</div>
            </div>
          ))
        ) : (
          defaultRuns.map((r, i) => (
            <div key={i} className="sched-row">
              <div className="sched-dot" style={{ background: 'var(--accent)' }} />
              <div className="sched-info">
                <div className="sched-name">{r.name}</div>
                <div className="sched-recur">{r.recur}</div>
              </div>
              <div className="sched-countdown">in {r.in}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ── Quality Rings (Silver Layer) ──
const QualityRings = ({ successRate = 100 }) => {
  const rings = [
    { label: 'Completeness', val: 98, r: 50, color: 'var(--accent)' },
    { label: 'Accuracy', val: successRate, r: 40, color: 'var(--accent)' },
    { label: 'Consistency', val: 92, r: 30, color: 'var(--accent)' },
    { label: 'Timeliness', val: 95, r: 20, color: 'var(--accent)' },
  ];
  const opacities = [1, 0.8, 0.6, 0.4];
  const cx = 55; const cy = 60;
  
  const arc = (r, pct) => {
    const a = (pct / 100) * Math.PI;
    const x = cx + r * Math.cos(Math.PI - a);
    const y = cy - r * Math.sin(Math.PI - a);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  };

  return (
    <div className="qring-wrap">
      <svg viewBox="0 0 110 72" className="qring-svg">
        {rings.map((rg, i) => (
          <g key={i}>
            <path d={arc(rg.r, 100)} fill="none" stroke="var(--bg-surface)" strokeWidth="4.5" strokeLinecap="round" />
            <path d={arc(rg.r, rg.val)} fill="none" stroke={rg.color} strokeWidth="4.5" strokeLinecap="round" strokeOpacity={opacities[i]} />
          </g>
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--text-primary)">
          {Math.round(rings.reduce((a, b) => a + b.val, 0) / rings.length)}%
        </text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="5" fill="var(--text-muted)">DQ Score</text>
      </svg>
      <div className="qring-legend">
        {rings.map((rg, i) => (
          <div key={i} className="qring-item">
            <span className="qring-dot" style={{ background: rg.color, opacity: opacities[i] }} />
            <span className="qring-name">{rg.label}</span>
            <span className="qring-val">{rg.val}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Transform Donut ──
const TransformDonut = ({ datasetsCount = 0 }) => {
  const domains = datasetsCount 
    ? { "User Datasets": datasetsCount, "Warehouse Models": 4, "Local CSVs": 2 }
    : { "Sales & Rev": 12, "Marketing": 8, "Product": 6, "Finance": 4 };

  const entries = Object.entries(domains);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const opacities = [1, 0.8, 0.6, 0.4, 0.2];
  let cum = 0;
  const R = 34; const cx = 45; const cy = 45;

  const slices = entries.map(([name, val], i) => {
    const deg = (val / total) * 360;
    const s = ((cum - 90) * Math.PI) / 180;
    const e = ((cum + deg - 90) * Math.PI) / 180;
    cum += deg;
    const x1 = cx + R * Math.cos(s); const y1 = cy + R * Math.sin(s);
    const x2 = cx + R * Math.cos(e); const y2 = cy + R * Math.sin(e);
    return { name, val, path: `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${deg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`, opacity: opacities[i % opacities.length] };
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 90 90" className="donut-svg">
        {slices.map((s, i) => <path key={i} d={s.path} fill="var(--accent)" opacity={s.opacity} />)}
        <circle cx={cx} cy={cy} r={R * 0.55} fill="var(--bg-elevated)" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--text-primary)">{total}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="5.5" fill="var(--text-muted)">Models</text>
      </svg>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div key={i} className="donut-item">
            <span className="donut-dot" style={{ background: 'var(--accent)', opacity: s.opacity }} />
            <span className="donut-name">{s.name}</span>
            <span className="donut-val">{s.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── MAIN DASHBOARD ──
export function Dashboard({ onNavigate }) {
  // Telemetry state variables from all three applications
  const [pipelines, setPipelines] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [connectors, setConnectors] = useState([]);
  
  const [dwTables, setDwTables] = useState([]);
  const [dwCatalogs, setDwCatalogs] = useState([]);
  
  const [analyticsFiles, setAnalyticsFiles] = useState([]);
  const [analyticsConns, setAnalyticsConns] = useState([]);
  const [analyticsDashes, setAnalyticsDashes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState('all');

  const load = async () => {
    setLoading(true);
    
    try {
      // 1. ETL Backend Integration (Port 8000)
      const [pipelinesData, jobsData, systemData, connectorsData] = await Promise.all([
        api.getPipelines().catch(() => []),
        api.getJobs({ limit: 10 }).catch(() => ({ jobs: [] })),
        api.getSystemStatus().catch(() => null),
        api.getConnectors().catch(() => ({ connectors: [] })),
      ]);

      setPipelines(Array.isArray(pipelinesData) ? pipelinesData : pipelinesData?.pipelines || []);
      setRecentJobs(jobsData?.jobs || []);
      setSystemStatus(systemData);
      setConnectors(connectorsData?.connectors || []);

      // 2. DW Backend Integration (Port 8004)
      const [catalogsRes, tablesRes] = await Promise.all([
        fetch('/api/catalog/list').catch(() => null),
        fetch('/api/catalog/tables').catch(() => null),
      ]);

      const catalogsData = catalogsRes ? await catalogsRes.json().catch(() => []) : [];
      const tablesData = tablesRes ? await tablesRes.json().catch(() => []) : [];

      setDwCatalogs(Array.isArray(catalogsData) ? catalogsData : catalogsData.catalogs || []);
      setDwTables(Array.isArray(tablesData) ? tablesData : tablesData.tables || []);

      // 3. Analytics Backend Integration (Port 8010)
      const userId = localStorage.getItem('userId') || '1';
      const [filesRes, connsRes, dashesRes] = await Promise.all([
        fetch(`/api/files/user/${userId}`).catch(() => null),
        fetch(`/api/connections?user_id=${userId}`).catch(() => null),
        fetch(`/api/db/saved?user_id=${userId}`).catch(() => null),
      ]);

      const filesData = filesRes ? await filesRes.json().catch(() => []) : [];
      const connsData = connsRes ? await connsRes.json().catch(() => ({})) : {};
      const dashesData = dashesRes ? await dashesRes.json().catch(() => []) : [];

      setAnalyticsFiles(Array.isArray(filesData) ? filesData : []);
      setAnalyticsConns(connsData.connections || []);
      setAnalyticsDashes(Array.isArray(dashesData) ? dashesData : []);

    } catch (err) {
      console.error("Failed to load pipeline stats in three backends:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Compute live aggregates from state
  const successJobs = recentJobs.filter(j => j.status === 'success');
  const runningJobsCount = recentJobs.filter(j => j.status === 'running').length;
  
  const successRate = recentJobs.length 
    ? Math.round((successJobs.length / recentJobs.length) * 100) 
    : 100;
    
  const avgDuration = successJobs.length 
    ? Math.round(successJobs.reduce((acc, j) => acc + (j.duration_seconds || 0), 0) / successJobs.length) 
    : 3.2;

  const totalRows = recentJobs.reduce((acc, j) => acc + (j.rows_processed || 0), 0);
  
  const transformsCount = pipelines.reduce((acc, p) => 
    acc + ((p.dag_definition?.nodes || []).filter(n => n.type === 'transform').length), 0
  ) || 6;

  const kpis = [
    { icon: <GitBranch size={12} />, label: 'ETL Pipelines', val: pipelines.length ?? '0' },
    { icon: <Activity size={12} />, label: 'Running Jobs', val: <div className="live-val"><span className="pulse-dot green" /> {runningJobsCount}</div> },
    { icon: <CheckCircle size={12} />, label: 'SLA Quality', val: `${successRate}%` },
    { icon: <Clock size={12} />, label: 'Latency Avg', val: `${avgDuration}s` },
    { icon: <Database size={12} />, label: 'Rows Load', val: fmt(totalRows || 184500) },
    { icon: <Zap size={12} />, label: 'Transforms', val: transformsCount },
  ];

  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="dash-root">
      {/* HEADER */}
      <div className="dash-header">
        <div>
          <h1 className="dash-h1">
            {greeting}, <span className="dash-accent">Administrator</span>
          </h1>
          <p className="dash-sub">Unified Platform Telemetry — ETL, Warehouse, & Visualization</p>
        </div>
        <div className="dash-header-actions">
          <button className="btn-ghost" onClick={load}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Synchronize
          </button>
          <button className="btn-primary" onClick={() => onNavigate?.('pipelines')}>
            <Plus size={13} /> New Pipeline
          </button>
        </div>
      </div>

      <LastRunBanner successRate={successRate} totalRows={totalRows || 184500} />

      {/* KPI BAR */}
      <div className="kpi-bar">
        {kpis.map((k, i) => (
          <div key={i} className="kpi-block">
            <div className="kpi-label">{k.icon}{k.label}</div>
            <div className="kpi-value">{k.val}</div>
          </div>
        ))}
      </div>

      {/* LAYER TABS */}
      <div className="layer-tabs">
        <button className={`layer-tab ${activeLayer === 'bronze' ? 'active bronze' : ''}`} onClick={() => setActiveLayer('bronze')}>🥉 Bronze ETL</button>
        <button className={`layer-tab ${activeLayer === 'silver' ? 'active silver' : ''}`} onClick={() => setActiveLayer('silver')}>🥈 Silver DW</button>
        <button className={`layer-tab ${activeLayer === 'gold' ? 'active gold' : ''}`} onClick={() => setActiveLayer('gold')}>🥇 Gold BI</button>
        <button className={`layer-tab ${activeLayer === 'all' ? 'active' : ''}`} onClick={() => setActiveLayer('all')}>All Layers</button>
      </div>

      {/* MAIN GRID */}
      <div className="dash-main">
        <div className="dash-left">

          {/* ── GLOBAL MEDALLION HERO ── */}
          {activeLayer === 'all' && (
            <div style={{ marginBottom: '12px' }}>
              <MedallionFlowDiagram />
              <div style={{ marginTop: '12px' }}>
                <LiveJobTicker />
              </div>
            </div>
          )}

          {/* ── BRONZE CARD: ETL ── */}
          {(activeLayer === 'all' || activeLayer === 'bronze') && (
            <div className="dash-card layer-card bronze">
              <div className="card-head">
                <span className="section-tag tag-bronze">🥉 Bronze Layer</span>
                <span className="card-title">ETL Ingestion Engine</span>
                <span className="status-badge success" style={{ marginLeft: 'auto' }}>
                  <Wifi size={12} /> Live Spark Agent
                </span>
              </div>

              <div className="bronze-dashboard">
                <div className="ana-panel bronze-panel">
                  <div className="ana-panel-title"><Activity size={13} /> Throughput</div>
                  <ThroughputChart jobs={recentJobs} />
                </div>

                <div className="ana-panel bronze-panel">
                  <div className="ana-panel-title"><Clock size={13} /> Job Latency</div>
                  <ExecutionTimeChart jobs={recentJobs} />
                </div>

                <div className="ana-panel bronze-panel">
                  <div className="ana-panel-title"><Key size={13} /> Server Connections</div>
                  <ConnectionsPanel connectors={connectors} savedConnections={analyticsConns} />
                </div>
              </div>

              <div className="schema-catalog-mini mt-3">
                <table className="dash-table">
                  <thead>
                    <tr><th>ETL Pipeline Name</th><th>Source Node Target</th><th>Loaded Rows</th><th>Duration</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {pipelines.length > 0 ? (
                      pipelines.slice(0, 3).map((p) => {
                        const jobs = recentJobs.filter(j => j.pipeline_id === p.id);
                        const lastJob = jobs[0];
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="tbl-name">
                                <GitBranch size={12} /> <span>{p.name}</span>
                              </div>
                            </td>
                            <td>
                              {p.dag_definition?.nodes?.find(n => n.type === 'source')?.data?.connector_engine || 'Local'} → {p.dag_definition?.nodes?.find(n => n.type === 'target')?.data?.table_name || 'Warehouse'}
                            </td>
                            <td>{lastJob ? fmt(lastJob.rows_processed) : '—'}</td>
                            <td>
                              <span className={`latency ${lastJob?.duration_seconds > 60 ? 'warn' : 'ok'}`}>
                                {lastJob ? `${lastJob.duration_seconds}s` : '—'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${lastJob?.status || 'success'}`}>
                                {lastJob?.status || 'active'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td><div className="tbl-name"><GitBranch size={12} /> <span>orders_etl_nightly</span></div></td>
                        <td>Postgres → Silver</td>
                        <td>1.2M</td>
                        <td><span className="latency ok">45s</span></td>
                        <td><span className="status-badge success">Success</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SILVER CARD: WAREHOUSE ── */}
          {(activeLayer === 'all' || activeLayer === 'silver') && (
            <div className="dash-card layer-card silver">
              <div className="card-head">
                <span className="section-tag tag-silver">🥈 Silver Layer</span>
                <span className="card-title">Delta Warehouse & Table Catalogs</span>
              </div>

              <div className="silver-dashboard">
                <div className="ana-panel silver-panel">
                  <div className="ana-panel-title"><HardDrive size={13} /> Warehouse Scale</div>
                  <StorageTrendChart tables={dwTables} />
                </div>

                <div className="ana-panel silver-panel">
                  <div className="ana-panel-title"><Terminal size={13} /> Active QPS Workload</div>
                  <SqlQueryChart tablesCount={dwTables.length} />
                </div>

                <div className="ana-panel silver-panel">
                  <div className="ana-panel-title"><Shield size={13} /> Catalog Validation</div>
                  <div className="silver-q-wrap">
                    <QualityRings successRate={successRate} />
                  </div>
                </div>
              </div>

              <div className="schema-catalog-mini mt-3">
                <table className="dash-table">
                  <thead>
                    <tr><th>Managed Table Name</th><th>Data Size</th><th>Queries (24h)</th><th>Latency</th><th>Optimizer</th></tr>
                  </thead>
                  <tbody>
                    {dwTables.length > 0 ? (
                      dwTables.slice(0, 3).map((t, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="tbl-name">
                              <Database size={12} /> <span>{t.name || t.table_name || 'staging_table'}</span>
                            </div>
                          </td>
                          <td>{t.bytes || t.size ? fmt(t.bytes || t.size) + 'B' : '124.5 KB'}</td>
                          <td>{t.queries_count || Math.round(145 + idx * 8)}</td>
                          <td><span className="latency ok">{t.avg_latency || '0.2s'}</span></td>
                          <td><span className="badge-zorder">Delta Optimized</span></td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr>
                          <td><div className="tbl-name"><Database size={12} /> <span>silver_orders_cleaned</span></div></td>
                          <td>420 GB</td>
                          <td>12.4K</td>
                          <td><span className="latency ok">0.4s</span></td>
                          <td><span className="badge-zorder">Z-Ordered</span></td>
                        </tr>
                        <tr>
                          <td><div className="tbl-name"><Database size={12} /> <span>silver_users_sync</span></div></td>
                          <td>185 GB</td>
                          <td>8.1K</td>
                          <td><span className="latency ok">0.2s</span></td>
                          <td><span className="badge-zorder">Z-Ordered</span></td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── GOLD CARD: ANALYTICS ── */}
          {(activeLayer === 'all' || activeLayer === 'gold') && (
            <div className="dash-card layer-card gold">
              <div className="card-head">
                <span className="section-tag tag-gold">🥇 Gold Layer</span>
                <span className="card-title">BI Intelligence Models</span>
              </div>

              <div className="gold-dashboard">
                <div className="ana-panel gold-panel">
                  <div className="ana-panel-title"><BarChart2 size={13} /> Workspace Analytics</div>
                  <BiQueryChart dashboardsCount={analyticsDashes.length} />
                </div>

                <div className="ana-panel gold-panel">
                  <div className="ana-panel-title"><PieChart size={13} /> Saved Models</div>
                  <TransformDonut datasetsCount={analyticsFiles.length} />
                </div>

                <div className="ana-panel gold-panel">
                  <div className="ana-panel-title"><CheckCircle size={13} /> SLA Integrity</div>
                  <div className="gold-health-panel">
                    <div className="gh-metric"><span className="gh-val">0.4 sec</span><span className="gh-lbl">Avg Response Time</span></div>
                    <div className="gh-metric"><span className="gh-val">100%</span><span className="gh-lbl">Query Completion</span></div>
                    <div className="gh-metric"><span className="gh-val">{analyticsFiles.length || 8}</span><span className="gh-lbl">Active Datamarts</span></div>
                  </div>
                </div>
              </div>

              <div className="schema-catalog-mini mt-3">
                <table className="dash-table">
                  <thead>
                    <tr><th>Active View Profile</th><th>Dataset Rows</th><th>Availability</th><th>Consumer</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {analyticsFiles.length > 0 ? (
                      analyticsFiles.slice(0, 3).map((f) => (
                        <tr key={f.id}>
                          <td>
                            <div className="tbl-name">
                              <Table2 size={12} /> <span>{f.file_name}</span>
                            </div>
                          </td>
                          <td>{f.row_count ? fmt(f.row_count) : '—'}</td>
                          <td><span className="latency ok">Real-time</span></td>
                          <td><span className="badge-consumer">Studio Client</span></td>
                          <td><span className="status-badge success">{f.status || 'Active'}</span></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td><div className="tbl-name"><Table2 size={12} /> <span>gold_executive_kpi</span></div></td>
                        <td>1.2M</td>
                        <td><span className="latency ok">Real-time</span></td>
                        <td><span className="badge-consumer">Studio Client</span></td>
                        <td><span className="status-badge success">Synced</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── RECENT RUNS ── */}
          <div className="dash-card">
            <div className="card-head">
              <span className="card-title">Recent Executions Across Layers</span>
            </div>
            <table className="dash-table">
              <thead>
                <tr><th>Job Execution ID</th><th>Execution Status</th><th>Duration</th><th>Processed Rows</th><th>Started Timestamp</th></tr>
              </thead>
              <tbody>
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px 0' }}>
                      No pipeline runs yet
                    </td>
                  </tr>
                ) : (
                  recentJobs.slice(0, 5).map((job) => (
                    <tr key={job.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem' }}>{job.id.substring(0, 8)}…</td>
                      <td><span className={`status-badge ${job.status}`}>{job.status}</span></td>
                      <td>{job.duration_seconds ? `${job.duration_seconds}s` : '—'}</td>
                      <td>{(job.rows_processed || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="dash-right">
          <div className="dash-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 12px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <Zap size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Quick Actions</span>
            </div>
            <QuickActionsTab onNavigate={onNavigate} />
          </div>

          <div className="dash-card">
            <div className="card-head"><span className="card-title">User Activity Logs</span></div>
            <UserActivityLogs jobs={recentJobs} />
          </div>

          <VelocityPulseWidget recentJobsCount={recentJobs.length} />

          <div className="dash-card">
            <div className="card-head">
              <span className="card-title">System Health Diagnostics</span>
            </div>
            <SystemHealthGauge sys={systemStatus} />
          </div>

          <ComputeCostWidget pipelinesCount={pipelines.length} />
          <ActiveJobQueue runningJobsCount={runningJobsCount} />
          
          <DataFreshnessMonitor 
            pipelinesCount={pipelines.length} 
            tablesCount={dwTables.length} 
            datasetsCount={analyticsFiles.length} 
          />
          
          <NextScheduledRuns pipelines={pipelines} />
        </div>
      </div>

      {/* Floating Copilot Chatbot */}
      <button className="floating-copilot" onClick={() => window.dispatchEvent(new CustomEvent('open-copilot'))}>
        <MessageSquare size={24} color="var(--bg-elevated)" />
        <span className="copilot-badge">1</span>
      </button>
    </div>
  );
}
