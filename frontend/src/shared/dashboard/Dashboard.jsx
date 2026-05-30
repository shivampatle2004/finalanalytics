import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, CheckCircle, Database, Server, TrendingUp, HardDrive,
  PlayCircle, Clock, Layers, Plus, GitBranch, Shield, Cpu,
  RefreshCw, Table2, AlertTriangle, Zap, BarChart2,
  History, Cloud, Globe, PieChart, ArrowRight, Bell,
  CheckSquare, XCircle, Info, TrendingDown, Package,
  ChevronRight, Wifi, Lock, Eye, Workflow, BookOpen, Lightbulb
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, PieChart as RechartsPie, Pie, Cell,
  ComposedChart, Line, Legend, ScatterChart, Scatter, ZAxis
} from 'recharts';
import api from '../services/api';
import './Dashboard.css';

// ─────────────────────────────────────────────
//  FORMATTERS
// ─────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

// ─────────────────────────────────────────────
//  MOCK DATA
// ─────────────────────────────────────────────
const throughputData = [
  { t: '00:00', bronze: 8200, silver: 140, gold: 9100 },
  { t: '02:00', bronze: 7800, silver: 110, gold: 8500 },
  { t: '04:00', bronze: 6900, silver: 95, gold: 7800 },
  { t: '06:00', bronze: 9100, silver: 160, gold: 10200 },
  { t: '08:00', bronze: 12400, silver: 220, gold: 13800 },
  { t: '10:00', bronze: 14800, silver: 298, gold: 16200 },
  { t: '12:00', bronze: 15600, silver: 342, gold: 18400 },
  { t: '14:00', bronze: 14200, silver: 315, gold: 17100 },
  { t: '16:00', bronze: 13800, silver: 288, gold: 15900 },
  { t: '18:00', bronze: 15000, silver: 330, gold: 17800 },
  { t: '20:00', bronze: 13500, silver: 301, gold: 16000 },
  { t: '22:00', bronze: 11200, silver: 245, gold: 13200 },
];

const qualityData = [
  { name: 'Completeness', value: 95, color: '#800020' },
  { name: 'Accuracy', value: 100, color: '#10b981' },
  { name: 'Consistency', value: 88, color: '#b45309' },
  { name: 'Timeliness', value: 92, color: '#f59e0b' },
];

const costData = [
  { day: 'M', cost: 38 },
  { day: 'T', cost: 42 },
  { day: 'W', cost: 35 },
  { day: 'T', cost: 51 },
  { day: 'F', cost: 48 },
  { day: 'S', cost: 29 },
  { day: 'S', cost: 22 },
];

const costSplitData = [
  { name: 'Compute', value: 62, color: '#800020' },
  { name: 'Storage', value: 24, color: '#b45309' },
  { name: 'Network', value: 14, color: '#10b981' },
];

const bronzeChartData = [
  { t: '10', r: 11200 }, { t: '11', r: 12500 }, { t: '12', r: 14800 },
  { t: '13', r: 13100 }, { t: '14', r: 15600 }, { t: '15', r: 15000 },
];
const silverChartData = [
  { t: '10', q: 180 }, { t: '11', q: 220 }, { t: '12', q: 342 },
  { t: '13', q: 260 }, { t: '14', q: 290 }, { t: '15', q: 342 },
];
const goldChartData = [
  { t: '10', r: 11000 }, { t: '11', r: 13500 }, { t: '12', r: 14800 },
  { t: '13', r: 16200 }, { t: '14', r: 18400 }, { t: '15', r: 18000 },
];

const pipelines = [
  { name: 'orders_etl_nightly', src: 'Postgres', tgt: 'Bronze', rows: '1.2M', dur: '45s', status: 'success', pct: 100, rowVal: 1.2, rowMax: 2, rowColor: '#10b981' },
  { name: 'users_sync_stream', src: 'Kafka', tgt: 'Silver', rows: '850K/hr', dur: '12s', status: 'running', pct: 68, rowVal: 850, rowMax: 1000, rowColor: '#a0002a' },
  { name: 'legacy_logs_batch', src: 'S3', tgt: 'Bronze', rows: '4.6M', dur: '3m 12s', status: 'queued', pct: 0, rowVal: 4.6, rowMax: 5, rowColor: '#94a3b8' },
  { name: 'payments_realtime', src: 'REST API', tgt: 'Silver', rows: '98K/hr', dur: '8s', status: 'running', pct: 42, rowVal: 98, rowMax: 200, rowColor: '#a0002a' },
  { name: 'analytics_cube_gold', src: 'Silver', tgt: 'Gold', rows: '320K', dur: '2m 04s', status: 'success', pct: 100, rowVal: 320, rowMax: 500, rowColor: '#10b981' },
];

const alerts = [
  { id: 1, type: 'warn', msg: 'silver_events_log query > 1.8s avg latency', time: '2m ago', pipe: 'legacy_logs_batch' },
  { id: 2, type: 'ok', msg: 'orders_etl_nightly completed successfully', time: '5m ago', pipe: 'orders_etl_nightly' },
  { id: 3, type: 'ok', msg: 'Analytics cube refreshed — 320K rows', time: '12m ago', pipe: 'analytics_cube' },
  { id: 4, type: 'info', msg: 'Z-ORDER optimization started on silver layer', time: '18m ago', pipe: 'silver_users_sync' },
  { id: 5, type: 'warn', msg: 'AWS S3 connector retry — 3 retries left', time: '24m ago', pipe: 'legacy_logs_batch' },
];

const kpiSparkData = {
  pipelines: [8, 10, 9, 12, 11, 12, 12],
  rows: [11200, 12500, 14800, 13100, 15600, 15000, 15200],
  storage: [3.8, 3.9, 4.0, 4.1, 4.1, 4.2, 4.2],
  qps: [180, 220, 342, 260, 290, 342, 335],
  success: [99.1, 99.4, 99.6, 99.8, 99.9, 99.9, 100],
  latency: [3.8, 3.5, 3.3, 3.2, 3.1, 3.1, 3.0],
};

// ─────────────────────────────────────────────
//  CUSTOM TOOLTIP
// ─────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="d-tooltip">
      <div className="d-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="d-tooltip-row">
          <span className="d-tooltip-dot" style={{ background: p.color }} />
          <span className="d-tooltip-name">{p.name}</span>
          <span className="d-tooltip-val">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
//  SPARKLINE (inline SVG)
// ─────────────────────────────────────────────
const Sparkline = ({ data, color, height = 28, width = 80 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padY = 3;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sg-${color.replace('#', '')})`} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle
        cx={parseFloat(points.split(' ').pop().split(',')[0])}
        cy={parseFloat(points.split(' ').pop().split(',')[1])}
        r={2.5} fill={color}
      />
    </svg>
  );
};

// ─────────────────────────────────────────────
//  SVG ARC GAUGE
// ─────────────────────────────────────────────
const ArcGauge = ({ value, max = 100, color, size = 80, label, sub }) => {
  const r = (size / 2) - 8;
  const cx = size / 2, cy = size / 2;
  const circumference = Math.PI * r;
  const filled = (value / max) * circumference;
  const startAngle = Math.PI;
  const sx = cx - r, sy = cy;
  const ex = cx + r, ey = cy;

  const pct = value / max;
  const angle = Math.PI * pct;
  const nx = cx + r * Math.cos(Math.PI - angle);
  const ny = cy - r * Math.sin(angle);

  return (
    <div className="arc-gauge">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} overflow="visible">
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none" stroke="var(--border)" strokeWidth={6} strokeLinecap="round" />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }} />
        <text x={cx} y={sy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">{value}{max === 100 ? '%' : ''}</text>
        <text x={cx} y={sy + 15} textAnchor="middle" fontSize="7.5" fill="var(--text-muted)">{sub}</text>
      </svg>
      <div className="arc-gauge-label">{label}</div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  RADIAL PROGRESS (circle)
// ─────────────────────────────────────────────
const RadialProgress = ({ value, color, size = 44, strokeWidth = 4 }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circ - filled}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--text-primary)">{value}%</text>
    </svg>
  );
};

// ─────────────────────────────────────────────
//  HERO KPI STRIP
// ─────────────────────────────────────────────
const HeroKPIStrip = () => {
  const kpis = [
    { icon: <GitBranch size={13} color="#9ca3af" />, label: 'PIPELINES', val: '12' },
    { icon: <Activity size={13} color="#9ca3af" />, label: 'ACTIVE JOBS', val: <div className="live-val"><span className="pulse-dot green" /> 0</div> },
    { icon: <CheckCircle size={13} color="#9ca3af" />, label: 'SUCCESS RATE', val: '100%' },
    { icon: <Clock size={13} color="#9ca3af" />, label: 'AVG DURATION', val: '3.1s' },
    { icon: <Database size={13} color="#9ca3af" />, label: 'ROWS LOADED', val: '15.0K' },
    { icon: <Zap size={13} color="#9ca3af" />, label: 'TRANSFORMS', val: '45' },
  ];

  return (
    <div className="kpi-banner">
      {kpis.map((k, i) => (
        <React.Fragment key={i}>
          <div className="kpi-banner-item">
            <div className="kpi-label">{k.icon}{k.label}</div>
            <div className="kpi-value">{k.val}</div>
          </div>
          {i < kpis.length - 1 && <div className="kpi-divider"></div>}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
//  24H THROUGHPUT CHART
// ─────────────────────────────────────────────
const ThroughputChart = () => (
  <div className="d-card h-full">
    <div className="d-card-header">
      <div className="d-card-title">
        <TrendingUp size={15} color="#800020" />
        24H Data Throughput
      </div>
      <div className="d-card-badge blue">LIVE</div>
    </div>
    <div className="d-card-body" style={{ flex: 1 }}>
      <ResponsiveContainer width="100%" height={175}>
        <ComposedChart data={throughputData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gBronze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#800020" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#800020" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#b45309" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#b45309" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="bronze" name="Ingest (r/s)" stroke="#800020" strokeWidth={1.5} fill="url(#gBronze)" />
          <Area type="monotone" dataKey="gold" name="BI Queries" stroke="#b45309" strokeWidth={1.5} fill="url(#gGold)" />
          <Line type="monotone" dataKey="silver" name="QPS" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="throughput-legend">
        <span className="tl-item"><span className="tl-dot" style={{ background: '#800020' }} /> Ingest r/s</span>
        <span className="tl-item"><span className="tl-dot" style={{ background: '#b45309' }} /> BI Queries</span>
        <span className="tl-item"><span className="tl-dot tl-dash" style={{ background: '#10b981' }} /> QPS</span>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
//  DATA QUALITY DONUT
// ─────────────────────────────────────────────
const DataQualityDonut = () => {
  const overall = Math.round(qualityData.reduce((s, d) => s + d.value, 0) / qualityData.length);
  return (
    <div className="d-card h-full">
      <div className="d-card-header">
        <div className="d-card-title"><Shield size={15} color="#10b981" /> Data Quality</div>
        <div className="d-card-badge green">SCORE</div>
      </div>
      <div className="d-card-body" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <ResponsiveContainer width={130} height={130}>
            <RechartsPie>
              <Pie data={qualityData} cx="50%" cy="50%" innerRadius={42} outerRadius={58}
                dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270} strokeWidth={0}>
                {qualityData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </RechartsPie>
          </ResponsiveContainer>
          <div className="donut-center">
            <span className="donut-val">{overall}%</span>
            <span className="donut-sub">Overall</span>
          </div>
        </div>
        <div className="quality-legend">
          {qualityData.map((d, i) => (
            <div key={i} className="ql-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="ql-dot" style={{ background: d.color }} />
                <span className="ql-name">{d.name}</span>
              </div>
              <span className="ql-val" style={{ color: d.color }}>{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  SYSTEM HEALTH (arc gauges)
// ─────────────────────────────────────────────
const SystemHealth = () => {
  const services = [
    { label: 'API', latency: '12ms', status: 'ok' },
    { label: 'ENGINE', latency: '4ms', status: 'ok' },
    { label: 'QUEUE', latency: '—', status: 'idle' },
    { label: 'STORAGE', latency: '8ms', status: 'ok' },
  ];
  return (
    <div className="d-card h-full">
      <div className="d-card-header">
        <div className="d-card-title"><Cpu size={15} color="#b45309" /> System Health</div>
        <div className="d-card-badge purple">LIVE</div>
      </div>
      <div className="d-card-body" style={{ gap: 12 }}>
        <div className="gauge-row">
          <ArcGauge value={99.97} color="#10b981" size={90} sub="30-day" label="Uptime" />
          <ArcGauge value={94} color="#800020" size={90} sub="avg score" label="Quality" />
        </div>
        <div className="service-grid">
          {services.map((s, i) => (
            <div key={i} className="service-item">
              <span className={`svc-dot ${s.status}`} />
              <span className="svc-label">{s.label}</span>
              <span className="svc-lat">{s.latency}</span>
            </div>
          ))}
        </div>
        <div className="health-uptime-bar">
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} className={`uptime-cell ${i === 7 ? 'warn' : i === 14 ? 'warn' : 'ok'}`} title={`Day ${30 - i}`} />
          ))}
        </div>
        <div className="uptime-label"><span>30 days</span><span style={{ fontWeight: 600, color: '#10b981' }}>99.97% uptime</span></div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  MINI PROGRESS BAR (Micro-visualization)
// ─────────────────────────────────────────────
const MiniBar = ({ val, max, color, label }) => {
  const pct = Math.min(100, (val / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ minWidth: 42, fontSize: '0.72rem', fontWeight: 600 }}>{label}</span>
      <div style={{ width: 45, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  PIPELINE STATUS TABLE
// ─────────────────────────────────────────────
const PipelineStatusTable = ({ onNavigate }) => {
  const statusMap = {
    success: { label: 'SUCCESS', cls: 'badge-success' },
    running: { label: 'RUNNING', cls: 'badge-running' },
    queued: { label: 'QUEUED', cls: 'badge-queued' },
    failed: { label: 'FAILED', cls: 'badge-failed' },
  };
  return (
    <div className="d-card">
      <div className="d-card-header">
        <div className="d-card-title"><Activity size={15} color="#800020" /> Pipeline Monitor</div>
        <button className="d-link-btn" onClick={() => onNavigate?.('pipelines')}>
          View All <ChevronRight size={12} />
        </button>
      </div>
      <div className="d-card-body" style={{ padding: 0 }}>
        <table className="pipe-table">
          <thead>
            <tr>
              <th>PIPELINE</th>
              <th>SOURCE → TARGET</th>
              <th>ROWS</th>
              <th>DURATION</th>
              <th>PROGRESS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p, i) => (
              <tr key={i}>
                <td>
                  <div className="pipe-name">
                    <span className="pipe-dot" style={{ background: p.status === 'running' ? '#10b981' : p.status === 'failed' ? '#ef4444' : '#94a3b8' }} />
                    {p.name}
                  </div>
                </td>
                <td><span className="pipe-flow">{p.src} <ArrowRight size={10} /> {p.tgt}</span></td>
                <td className="pipe-rows">
                  <MiniBar val={p.rowVal} max={p.rowMax} color={p.rowColor} label={p.rows} />
                </td>
                <td className="pipe-dur">{p.dur}</td>
                <td>
                  <div className="progress-wrap">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${p.pct}%`, background: p.status === 'success' ? '#10b981' : p.status === 'running' ? '#800020' : '#e2e8f0' }} />
                    </div>
                    <span className="progress-pct">{p.pct}%</span>
                  </div>
                </td>
                <td><span className={`p-badge ${statusMap[p.status].cls}`}>{statusMap[p.status].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  ALERT FEED
// ─────────────────────────────────────────────
const AlertFeed = () => {
  const icons = {
    warn: <AlertTriangle size={13} color="#f59e0b" />,
    ok: <CheckCircle size={13} color="#10b981" />,
    info: <Info size={13} color="#800020" />,
    fail: <XCircle size={13} color="#ef4444" />,
  };
  return (
    <div className="d-card h-full">
      <div className="d-card-header">
        <div className="d-card-title"><Bell size={15} color="#f59e0b" /> Alert Feed</div>
        <span className="alert-count">5 events</span>
      </div>
      <div className="alert-list">
        {alerts.map(a => (
          <div key={a.id} className={`alert-item alert-${a.type}`}>
            <div className="alert-icon">{icons[a.type]}</div>
            <div className="alert-body">
              <div className="alert-msg">{a.msg}</div>
              <div className="alert-meta">
                <span className="alert-pipe">{a.pipe}</span>
                <span className="alert-time">{a.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  SYSTEM STATUS BAR (Small Font)
// ─────────────────────────────────────────────
// System Status Bar removed per user request

// ─────────────────────────────────────────────
//  UNIFIED INTELLIGENCE CENTER (Premium Graphs)
// ─────────────────────────────────────────────
const dwhData = [
  { time: '00:00', compute: 120, storage: 45 },
  { time: '04:00', compute: 180, storage: 48 },
  { time: '08:00', compute: 450, storage: 55 },
  { time: '12:00', compute: 600, storage: 62 },
  { time: '16:00', compute: 520, storage: 65 },
  { time: '20:00', compute: 300, storage: 68 },
  { time: '24:00', compute: 150, storage: 70 },
];

const vizData = [
  { day: 'Mon', activeUsers: 1200, reportsGenerated: 400 },
  { day: 'Tue', activeUsers: 1400, reportsGenerated: 450 },
  { day: 'Wed', activeUsers: 1800, reportsGenerated: 600 },
  { day: 'Thu', activeUsers: 1600, reportsGenerated: 550 },
  { day: 'Fri', activeUsers: 1900, reportsGenerated: 700 },
  { day: 'Sat', activeUsers: 600, reportsGenerated: 150 },
  { day: 'Sun', activeUsers: 500, reportsGenerated: 120 },
];

const UnifiedIntelligenceCenter = () => {
  return (
    <div className="dash-grid cols-3-eq">

      {/* LIVE SYSTEM LOGS */}
      <div className="d-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={16} color="#a0002a" />
          </div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Live System Logs
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '11px', lineHeight: '1.5' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>[10:42:15]</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>SUCCESS</span>
            <span style={{ color: 'var(--text-secondary)' }}>Warehouse scaled to 4 nodes.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>[10:39:02]</span>
            <span style={{ color: '#a0002a', fontWeight: 600 }}>INFO   </span>
            <span style={{ color: 'var(--text-secondary)' }}>BI Cache flushed (142 items).</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>[10:15:44]</span>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>WARN   </span>
            <span style={{ color: 'var(--text-secondary)' }}>High memory in ingest node.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>[09:58:20]</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>SUCCESS</span>
            <span style={{ color: 'var(--text-secondary)' }}>Schema validation passed.</span>
          </div>
        </div>

        <div style={{ marginTop: 'auto', background: 'rgba(59,130,246,0.05)', padding: '10px', borderRadius: '8px', fontSize: '0.7rem', color: '#a0002a', fontWeight: 600, border: '1px dashed rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a0002a', boxShadow: '0 0 6px #a0002a', animation: 'pulse 2s infinite' }} />
          Streaming logs (14.2k/s)
        </div>
      </div>

      {/* DATA WAREHOUSE GRAPH */}
      <div className="d-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={16} color="#a0002a" /> Data Warehouse Utilization
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Compute credits vs Storage (24h)</p>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.15)', color: '#a0002a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 600 }}>
            Active Load
          </div>
        </div>

        <div style={{ height: '160px', width: '100%', marginTop: 'auto' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dwhData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCompute" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a0002a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a0002a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle, rgba(128,128,128,0.2))" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #94a3b8)' }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #94a3b8)' }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #94a3b8)' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                cursor={{ stroke: 'rgba(59,130,246,0.2)', strokeWidth: 2, strokeDasharray: '4 4' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: 'var(--text-secondary)' }} />
              <Area yAxisId="left" type="monotone" dataKey="compute" name="Compute" stroke="#a0002a" strokeWidth={2} fillOpacity={1} fill="url(#colorCompute)" />
              <Line yAxisId="right" type="monotone" dataKey="storage" name="Storage" stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DATA VISUALIZATION GRAPH */}
      <div className="d-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PieChart size={16} color="#ec4899" /> BI & Data Visualization
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active Users & Reports (7d)</p>
          </div>
          <div style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 600 }}>
            +14% wow
          </div>
        </div>

        <div style={{ height: '160px', width: '100%', marginTop: 'auto' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vizData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle, rgba(128,128,128,0.2))" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #94a3b8)' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #94a3b8)' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                cursor={{ fill: 'rgba(236,72,153,0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: 'var(--text-secondary)' }} />
              <Bar dataKey="activeUsers" name="Active Viewers" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="reportsGenerated" name="Reports Gen" fill="#f472b6" radius={[4, 4, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};


// ─────────────────────────────────────────────
//  DATA QUALITY COMMAND CENTER
// ─────────────────────────────────────────────
const CloudCostOptimizationCenter = () => {
  return (
    <div className="d-card h-full">
      <div className="d-card-header">
        <div className="d-card-title"><Cloud size={15} color="#a0002a" style={{ marginRight: '6px' }} /> Cloud Compute & Cost Management</div>
        <div style={{ fontSize: '0.65rem', color: '#a0002a', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>FinOps Active</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1.5fr', gap: '16px', padding: '16px' }}>

        {/* Monthly Run Rate */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px dashed var(--border)', paddingRight: '16px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>Est. Monthly Spend</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>$14,250</div>
          <span style={{ fontSize: '0.65rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px', marginTop: '4px', fontWeight: 600 }}><TrendingDown size={10} /> -8.4% vs last mo.</span>
        </div>

        {/* Top Cost Drivers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderRight: '1px dashed var(--border)', paddingRight: '16px' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Cost Drivers (MTD)</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>DW Compute (X-Large)</span>
                <span style={{ color: '#800020', fontWeight: 700 }}>$6,420</span>
              </div>
              <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: '65%', background: '#800020' }} /></div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>S3 Storage (Standard)</span>
                <span style={{ color: '#800020', fontWeight: 700 }}>$2,180</span>
              </div>
              <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: '25%', background: '#a0002a' }} /></div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Data Egress (Cross-Region)</span>
                <span style={{ color: '#800020', fontWeight: 700 }}>$1,050</span>
              </div>
              <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: '10%', background: '#c32b4b' }} /></div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Recommendations</span>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{ padding: '4px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px', color: '#10b981' }}><Zap size={12} /></div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>Scale Down `cluster_B`</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>Off-peak usage is &lt;10%. Save ~$450/mo.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '4px' }}>
            <div style={{ padding: '4px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px', color: '#a0002a' }}><HardDrive size={12} /></div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>Archive Cold Logs</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>Move 2.4TB to Glacier. Save ~$120/mo.</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};


// ─────────────────────────────────────────────
//  QUICK ACTIONS
// ─────────────────────────────────────────────
const QuickActions = ({ onNavigate }) => {
  const [tab, setTab] = useState('etl');
  const tabs = [
    { id: 'etl', label: 'ETL' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'analytics', label: 'Analytics' },
  ];
  const actions = {
    etl: [
      { icon: <Plus size={14} />, label: 'New Pipeline', page: 'pipelines' },
      { icon: <PlayCircle size={14} />, label: 'Run Jobs', page: 'pipelines' },
      { icon: <GitBranch size={14} />, label: 'Data Lineage', page: 'lineage' },
      { icon: <Shield size={14} />, label: 'Connectors', page: 'connectors' },
    ],
    warehouse: [
      { icon: <Table2 size={14} />, label: 'SQL Editor', page: 'sql-editor' },
      { icon: <Database size={14} />, label: 'Data Catalog', page: 'tables' },
      { icon: <Package size={14} />, label: 'Table Manager', page: 'table-manager' },
      { icon: <HardDrive size={14} />, label: 'File Manager', page: 'files' },
    ],
    analytics: [
      { icon: <BarChart2 size={14} />, label: 'Metrics', page: 'dashboard' },
      { icon: <History size={14} />, label: 'Job Logs', page: 'jobs' },
      { icon: <Eye size={14} />, label: 'Transform', page: 'transform' },
      { icon: <Lock size={14} />, label: 'Settings', page: 'settings' },
    ],
  };

  return (
    <div className="d-card">
      <div className="d-card-header">
        <div className="d-card-title"><Zap size={15} color="#f59e0b" /> Quick Actions</div>
      </div>
      <div className="qa-tabs" style={{ margin: '16px 0' }}>
        {tabs.map(t => (
          <button key={t.id} className={`qa-tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="qa-grid">
        {actions[tab].map((a, i) => (
          <button key={i} className="qa-action-btn" onClick={() => onNavigate?.(a.page)}>
            <span className="qa-btn-icon">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};



// ─────────────────────────────────────────────
//  INSIGHTS BANNER (Top Points)
// ─────────────────────────────────────────────
const InsightsBanner = () => {
  return (
    <div className="insights-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px',
      marginBottom: '4px'
    }}>
      {/* Insight 1: Cost */}
      <div className="d-card" style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
        background: 'linear-gradient(145deg, rgba(16,185,129,0.08), rgba(16,185,129,0.01))',
        borderColor: 'rgba(16,185,129,0.2)',
        boxShadow: '0 4px 12px rgba(16,185,129,0.05)'
      }}>
        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
          <TrendingDown size={20} color="#10b981" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#065f46', fontWeight: 700, letterSpacing: '0.06em' }}>Cost Optimization</span>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>Compute costs down <strong style={{ color: '#10b981', fontWeight: 700 }}>12%</strong></span>
        </div>
      </div>

      {/* Insight 2: Health */}
      <div className="d-card" style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
        background: 'linear-gradient(145deg, rgba(15,82,186,0.08), rgba(15,82,186,0.01))',
        borderColor: 'rgba(15,82,186,0.2)',
        boxShadow: '0 4px 12px rgba(15,82,186,0.05)'
      }}>
        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: 'rgba(15,82,186,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
          <CheckCircle size={20} color="#800020" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#5c0017', fontWeight: 700, letterSpacing: '0.06em' }}>Pipeline Health</span>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>Success rate at <strong style={{ color: '#800020', fontWeight: 700 }}>99.98%</strong></span>
        </div>
      </div>

      {/* Insight 3: Engagement */}
      <div className="d-card" style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
        background: 'linear-gradient(145deg, rgba(124,58,237,0.08), rgba(124,58,237,0.01))',
        borderColor: 'rgba(124,58,237,0.2)',
        boxShadow: '0 4px 12px rgba(124,58,237,0.05)'
      }}>
        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
          <TrendingUp size={20} color="#b45309" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#78350f', fontWeight: 700, letterSpacing: '0.06em' }}>BI Engagement</span>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>Viewers hit ATH of <strong style={{ color: '#b45309', fontWeight: 700 }}>1,240</strong></span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  MAIN DASHBOARD
// ─────────────────────────────────────────────
export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const load = () => {
    setLoading(true);
    Promise.all([api.dashboard.stats().catch(() => null)])
      .then(([stats]) => setData(stats))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours();
  const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="dash-root" style={{ paddingBottom: '80px' }}>

      {/* ── HEADER ── */}
      <div className="dash-header">
        <div className="dash-header-left">
          <h1 className="dash-greeting">
            {greeting}, <span className="dash-accent">User</span>
          </h1>
          <p className="dash-sub">Enterprise ETL · Data Warehouse · Analytics Platform</p>
        </div>
        {/* Removed dash-header-center per user request */}
        <div className="dash-header-right">
          <div className="live-clock">{timeStr}</div>
          <button className="d-btn ghost" onClick={load}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="d-btn primary" onClick={() => onNavigate?.('pipelines')}>
            <Plus size={13} /> New Pipeline
          </button>
        </div>
      </div>

      {/* ── INSIGHTS BANNER ── */}


      {/* ── KPI STRIP ── */}
      <HeroKPIStrip />

      {/* ── INSIGHTS ROW ── */}
      <div className="dash-grid cols-5-3-4">
        <ThroughputChart />
        <DataQualityDonut />
        <SystemHealth />
      </div>

      {/* ── PIPELINE + ALERTS ── */}
      <div className="dash-grid cols-8-4">
        <PipelineStatusTable onNavigate={onNavigate} />
        <AlertFeed />
      </div>

      {/* ── UNIFIED INTELLIGENCE CENTER (NEW PREMIUM GRAPHS) ── */}
      <UnifiedIntelligenceCenter />

      {/* ── BOTTOM ROW ── */}
      <div className="dash-grid cols-8-4">
        <CloudCostOptimizationCenter />
        <QuickActions onNavigate={onNavigate} />
      </div>

      {/* ── SYSTEM STATUS BAR (REMOVED) ── */}

    </div>
  );
}
