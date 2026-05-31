import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../../assets/logo.png';
import './PlatformSelect.css';

/* ─── Icons ─── */
const ETLIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
);
const DWIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" />
    </svg>
);
const AnalyticsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M21 21H4.6c-.56 0-.84 0-1.05-.11a1 1 0 01-.44-.44C3 20.24 3 19.96 3 19.4V3" /><path d="M7 14l4-4 4 4 6-6" /><path d="M17 8h4v4" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);
const ArrowRight = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
);
const DocIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
);

/* ─── Typing SQL Animation ─── */
function TypingSQL() {
    const [text, setText] = useState('');
    const fullText = 'SELECT * FROM main.warehouse LIMIT 100;';

    useEffect(() => {
        let index = 0;
        const interval = setInterval(() => {
            setText(fullText.substring(0, index));
            index = (index + 1) % (fullText.length + 15);
        }, 120);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="ps-typing-sql">
            <span className="ps-sql-kw">SELECT</span> * <span className="ps-sql-kw">FROM</span>
            <span style={{ color: '#fff', marginLeft: '5px' }}>{text.split('FROM ')[1] || '...'}</span>
            <span className="ps-sql-cur" />
        </div>
    );
}

/* ─── Animated Counter Hook ─── */
function useCount(end, dur = 2000) {
    const [v, setV] = useState(0);
    useEffect(() => {
        let s = null;
        const step = ts => {
            if (!s) s = ts;
            const p = Math.min((ts - s) / dur, 1);
            setV((p === 1 ? 1 : 1 - Math.pow(2, -10 * p)) * end);
            if (p < 1) requestAnimationFrame(step); else setV(end);
        };
        requestAnimationFrame(step);
    }, [end, dur]);
    return v;
}

const Feat = ({ text }) => (
    <div className="ps-feat"><CheckIcon /> {text}</div>
);

export default function ProjectSelector() {
    const navigate = useNavigate();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const [targetLabel, setTargetLabel] = useState("");
    const userMenuRef = useRef(null);

    const rows = useCount(1.2, 2000);
    const queries = useCount(84, 2500);
    const uptime = useCount(99.99, 3000);

    // Close user menu on outside click
    useEffect(() => {
        const handler = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const launchDW = useCallback(() => {
        setTargetLabel("Data Warehouse Hub");
        setTransitioning(true);

        setTimeout(() => {
            window.open(`${window.location.origin}/#/sql-editor`, '_blank');
        }, 800);

        setTimeout(() => {
            setTransitioning(false);
        }, 1000);
    }, []);


    const launchETL = useCallback(() => {
        setTargetLabel("ArithFlow ETL Engine");
        setTransitioning(true);
        setTimeout(() => window.open('http://etl.onestopanalytics.com/', '_blank'), 800);
        setTimeout(() => setTransitioning(false), 1000);
    }, []);

    const launchAnalytics = useCallback(() => {
        setTargetLabel("Analytics Platform");
        setTransitioning(true);
        setTimeout(() => window.open('http://analytics.onestopanalytics.com/', '_blank'), 800);
        setTimeout(() => setTransitioning(false), 1000);
    }, []);

    return (
        <div className="ps-page">
            {/* ── Background Blobs ── */}
            <div className="ps-bg-blobs">
                <div className="ps-blob ps-blob-1" />
                <div className="ps-blob ps-blob-2" />
                <div className="ps-blob ps-blob-3" />
            </div>

            {/* ── Prominent Nav ── */}
            <nav className="ps-nav ps-nav--prominent">
                <div className="ps-nav-logo">
                    <img src={logo} alt="QueryForge" className="ps-logo-large" />
                </div>

                <div className="ps-nav-links">
                    <Link to="/" className="ps-nav-link">Overview</Link>
                    <a href="#workflow" className="ps-nav-link ps-nav-link--highlight">
                        <DocIcon /> <span>Platform Documentation</span>
                    </a>
                    <Link to="/workspace" className="ps-nav-link">Active Workspace</Link>
                </div>

                <div className="ps-nav-right">
                    <div className="ps-nav-status">
                        <span className="ps-nav-dot" /> <span className="hidden md:inline">All Systems Operational</span>
                    </div>

                    <div className="ps-nav-user-container">
                        <div className="ps-nav-user" onClick={() => setShowUserMenu(!showUserMenu)} ref={userMenuRef}>
                            <div className="ps-nav-avatar">HN</div>
                            <div className="ps-nav-info">
                                <span className="ps-nav-uname text-sm">Hitesh Nagpure</span>
                                <span className="ps-nav-urole">Platform Administrator</span>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </div>

                        {/* Dropdown with clear Sign Out */}
                        <div className={`ps-user-menu ${showUserMenu ? 'active' : ''}`}>
                            <div className="ps-menu-header">User Account</div>
                            <div className="ps-menu-item">👤 Profile Details</div>
                            <div className="ps-menu-item">⚙️ Global Settings</div>
                            <div className="ps-menu-item">🔑 API Security Tokens</div>
                            <div className="ps-menu-divider" />
                            <div className="ps-menu-item ps-menu-item--signout" onClick={() => navigate('/login')}>
                                <span>🚪 Sign Out from Console</span>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="ps-content">
                {/* ── Grid ── */}
                <section className="ps-grid">

                    {/* ETL */}
                    <div className="ps-mod ps-mod--etl" onClick={launchETL} style={{ cursor: 'pointer' }}>
                        <div className="ps-mod-header">
                            <div className="ps-mod-icon"><ETLIcon /></div>
                            <h3 className="ps-mod-title">ETL & Ingestion</h3>
                        </div>
                        <p className="ps-mod-desc">Visual pipeline designer for automated data orchestration.</p>
                        <div className="ps-viz ps-viz--etl">
                            <div className="ps-etl-node">📥</div>
                            <div className="ps-etl-line"><div className="ps-etl-pulse" /></div>
                            <div className="ps-etl-node">⚙️</div>
                            <div className="ps-etl-line"><div className="ps-etl-pulse" /></div>
                            <div className="ps-etl-node">📦</div>
                        </div>
                        <div className="ps-feats">
                            <Feat text="Visual Pipeline Builder" />
                            <Feat text="200+ Multi-Source Connectors" />
                            <Feat text="Real-time CDC Sync & Streaming" />
                        </div>
                        <div className="ps-mod-footer">
                            <button className="ps-btn ps-btn--pri">Launch ETL Workspace <ArrowRight /></button>
                        </div>
                    </div>

                    {/* Data Warehousing (Launch Section) */}
                    <div className="ps-mod ps-mod--dw" onClick={launchDW} style={{ cursor: 'pointer' }}>
                        <div className="ps-mod-glow" />
                        <div className="ps-mod-header">
                            <div className="ps-mod-icon"><DWIcon /></div>
                            <h3 className="ps-mod-title">Data Warehousing</h3>
                        </div>
                        <p className="ps-mod-desc">Core SQL analytic engine with sub-second query performance.</p>
                        <div className="ps-viz ps-viz--dw">
                            <div className="ps-dw-catalog">
                                <div className="ps-dw-row"><span>TBL</span> inventory_logs</div>
                                <div className="ps-dw-row ps-dw-row--act"><span>TBL</span> user_revenue_2026</div>
                                <div className="ps-dw-row"><span>TBL</span> shipping_events</div>
                            </div>
                            <TypingSQL />
                        </div>
                        <div className="ps-feats">
                            <Feat text="Cloud SQL Studio & Workspace" />
                            <Feat text="Metadata Explorer & Catalog" />
                            <Feat text="Live Query Insights & History" />
                            <Feat text="Scalable ACID storage layers" />
                        </div>
                        <div className="ps-mod-footer">
                            <button className="ps-btn ps-btn--pri">
                                Launch Platform Hub <ArrowRight />
                            </button>
                        </div>
                    </div>

                    {/* Analytics */}
                    <div className="ps-mod ps-mod--analytics" onClick={launchAnalytics} style={{ cursor: 'pointer' }}>
                        <div className="ps-mod-header">
                            <div className="ps-mod-icon"><AnalyticsIcon /></div>
                            <h3 className="ps-mod-title">Reporting and Analytics</h3>
                        </div>
                        <p className="ps-mod-desc">AI-powered dashboards for deep business intelligence.</p>
                        <div className="ps-viz ps-viz--analytics">
                            <div className="ps-a-chart">
                                <div className="ps-a-bar ps-a-bar-1" />
                                <div className="ps-a-bar ps-a-bar-2" />
                                <div className="ps-a-bar ps-a-bar-3" />
                                <div className="ps-a-bar ps-a-bar-4" />
                                <div className="ps-a-bar ps-a-bar-5" />
                            </div>
                        </div>
                        <div className="ps-feats">
                            <Feat text="Self-Service BI Dashboards" />
                            <Feat text="AI Predictive Performance" />
                            <Feat text="Extensive Custom Chart Library" />
                        </div>
                        <div className="ps-mod-footer">
                            <button className="ps-btn ps-btn--pri">Launch Analytics Platform <ArrowRight /></button>
                        </div>
                    </div>
                </section>

                {/* ── Workflow Documentation Bar ── */}
                {/* <section id="workflow" className="ps-workflow-v10">
                    <div className="ps-wf-head">
                        <h4>Platform Workflow & Manuals</h4>
                        <div className="ps-wf-stats">
                            <span>{rows.toFixed(1)}M Rows/Sec</span>
                            <span>{queries.toFixed(0)}k Q/Min</span>
                            <span>{uptime.toFixed(2)}% SLA</span>
                        </div>
                    </div>
                    <div className="ps-wf-steps">
                        <div className="ps-wf-step">
                            <div className="ps-wf-num">01</div>
                            <div className="ps-wf-txt"><strong>Ingest Data</strong> — Configure ETL pipelines to source your data.</div>
                        </div>
                        <div className="ps-wf-arrow">→</div>
                        <div className="ps-wf-step">
                            <div className="ps-wf-num">02</div>
                            <div className="ps-wf-txt"><strong>Store & Process</strong> — High-speed SQL storage in the cloud warehouse.</div>
                        </div>
                        <div className="ps-wf-arrow">→</div>
                        <div className="ps-wf-step">
                            <div className="ps-wf-num">03</div>
                            <div className="ps-wf-txt"><strong>Insight & Share</strong> — Build AI Dashboards and report on findings.</div>
                        </div>
                    </div>
                </section> */}

                {/* <footer className="ps-footer-v10">
                    <div className="ps-foot-inner">
                        <span>QUERYFORGE CONSOLE V2.1 RADIANT</span>
                        <span>·</span>
                        <span>SECURE USER SESSION: {new Date().toLocaleDateString()}</span>
                        <span>·</span>
                        <span>© 2026 QUERYFORGE INC.</span>
                    </div>
                </footer> */}
            </div>

            {/* ── Transition ── */}
            {transitioning && (
                <div className="ps-overlay" style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    color: '#fff', textAlign: 'center'
                }}>
                    <div className="ps-ov-spin" style={{
                        width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E2799A',
                        borderRadius: '50%', animation: 'ps-spin 0.8s linear infinite', marginBottom: '20px'
                    }} />
                    <style>{`@keyframes ps-spin { to { transform: rotate(360deg); } }`}</style>
                    <div className="ps-ov-txt" style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Switching Module</div>
                    <div className="ps-ov-sub" style={{ fontSize: '0.9rem', opacity: 0.6 }}>Connecting to {targetLabel}...</div>
                </div>
            )}
        </div>
    );
}

