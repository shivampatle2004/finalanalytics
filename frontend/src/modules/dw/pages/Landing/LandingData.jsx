import React from 'react';
import { Link } from 'react-router-dom';

/* ─── SVG ICONS ─── */
export const IconGlobal = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path className="v2-svg-path-flow" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);
export const IconSchema = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path className="v2-svg-path-pulse" d="M3 9h18M9 21V9" />
    </svg>
);
export const IconQuery = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path className="v2-svg-path-bolt" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
);
export const IconScale = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
        <path className="v2-svg-path-float" d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
);
export const IconSecurity = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path className="v2-svg-path-pulse" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);
export const IconRealtime = () => (
    <svg className="v2-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path className="v2-svg-path-pulse" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="4" />
    </svg>
);

export const DataEngineSVG = ({ activeStep }) => (
    <svg className="v2-engine-svg" viewBox="0 0 400 400" fill="none">
        <circle cx="200" cy="200" r="30" className="v2-engine-core" fill="url(#coreGradient)" />
        <circle cx="200" cy="200" r="50" className="v2-engine-orbit-1" stroke="var(--v2-accent)" strokeOpacity="0.4" strokeWidth="1" />
        <circle cx="200" cy="200" r="80" className="v2-engine-orbit-2" stroke="var(--v2-accent-alt)" strokeOpacity="0.3" strokeWidth="1" />
        {[
            { cx: 200, cy: 120 }, { cx: 275, cy: 164 }, { cx: 248, cy: 262 }, { cx: 152, cy: 262 }, { cx: 125, cy: 164 }
        ].map((node, i) => (
            <g key={i} className={`v2-engine-node ${activeStep === i ? 'active' : ''}`}>
                <circle cx={node.cx} cy={node.cy} r={activeStep === i ? "12" : "8"} fill={activeStep === i ? "var(--v2-accent)" : "#ccc"} fillOpacity={activeStep === i ? "1" : "0.3"} />
                <path d={`M${node.cx} ${node.cy} L200 200`} stroke="currentColor" strokeOpacity="0.1" />
            </g>
        ))}
        <defs>
            <linearGradient id="coreGradient" x1="160" y1="160" x2="240" y2="240">
                <stop offset="0%" stopColor="#0f52ba" />
                <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
        </defs>
    </svg>
);

export const IDEPreview = ({ activeStep }) => {
    const content = [
        { title: "warehouse.config", type: "code", body: "source: snowflake\nauth: radiant_oauth\nregion: us-east-1" },
        { title: "forge_query.sql", type: "code", body: "SELECT * FROM events\nWHERE status = 'LIVE'\nLIMIT 100;" },
        { title: "history_v2.diff", type: "code", body: "- v1: manual_deploy\n+ v2: auto_radiant" },
        { title: "insights_view", type: "ui", body: "Vectorized Output: 40ms" },
        { title: "workspace_share", type: "ui", body: "Active Forgers: 12" }
    ];
    return (
        <div className="v2-ide-window">
            <div className="v2-ide-header">
                <div className="v2-ide-dots"><span></span><span></span><span></span></div>
                <div className="v2-ide-title">{content[activeStep]?.title}</div>
            </div>
            <div className="v2-ide-body">
                {content[activeStep]?.type === "code" ? (
                    <pre><code>{content[activeStep].body}</code></pre>
                ) : (
                    <div className="v2-ide-placeholder">{content[activeStep].body}</div>
                )}
            </div>
        </div>
    );
};

export const CountUp = ({ end, duration = 2000, decimals = 0, suffix = "", prefix = "" }) => {
    const [count, setCount] = React.useState(0);
    const ref = React.useRef(null);
    const [hasAnimated, setHasAnimated] = React.useState(false);

    React.useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasAnimated) {
                    setHasAnimated(true);
                    let startTimestamp = null;
                    const step = (timestamp) => {
                        if (!startTimestamp) startTimestamp = timestamp;
                        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                        setCount(easeProgress * end);
                        if (progress < 1) window.requestAnimationFrame(step);
                        else setCount(end);
                    };
                    window.requestAnimationFrame(step);
                }
            },
            { threshold: 0.1 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [end, duration, hasAnimated]);

    return <span ref={ref}>{prefix}{count.toFixed(decimals)}{suffix}</span>;
};

export const FEATURES = [
    { title: "Global Scale", desc: "Deploy across regions with zero-latency synchronization.", specs: ["99.99% SLO", "Multi-Region", "Auto-Sync"], color: "#0f52ba", icon: <IconGlobal /> },
    { title: "Schema First", desc: "Built-in quality control and automated governance.", specs: ["Type Safety", "Auto-Validation", "Governance"], color: "#6D28D9", icon: <IconSchema /> },
    { title: "Query Forge", desc: "Vectorized SQL engine for extreme throughput.", specs: ["1.2M rows/s", "Sub-10ms", "Vector Engine"], color: "#0f52ba", icon: <IconQuery /> },
    { title: "Auto-Scale", desc: "Dynamically matches your high-performance workload.", specs: ["Zero-Idle", "Cloud-Native", "Instant-UP"], color: "#6D28D9", icon: <IconScale /> },
    { title: "Safe Guard", desc: "Enterprise security with granular access control.", specs: ["RBAC", "Encryption", "Audit Logs"], color: "#0f52ba", icon: <IconSecurity /> },
    { title: "Real-time", desc: "Instant streaming data for real-time decisioning.", specs: ["100ms Ingestion", "WebSocket", "Live-Feed"], color: "#6D28D9", icon: <IconRealtime /> }
];

const IconStep1 = () => <svg className="v2-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 7v10c0 1.1.9 2 2 2h12a2 2 0 002-2V7" /><path d="M4 7a2 2 0 012-2h12a2 2 0 012 2" /><path d="M12 5v14" /><path d="M4 12h16" /></svg>;
const IconStep2 = () => <svg className="v2-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></svg>;
const IconStep3 = () => <svg className="v2-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
const IconStep4 = () => <svg className="v2-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>;
const IconStep5 = () => <svg className="v2-step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>;

export const STEPS = [
    { title: "Warehouse", icon: <IconStep1 />, desc: "Establish a secure, high-throughput bridge to Snowflake or BigQuery with automated schema discovery." },
    { title: "SQL Forge", icon: <IconStep2 />, desc: "Multi-modal AI workspace for complex SQL construction, featuring real-time syntax validation." },
    { title: "History", icon: <IconStep3 />, desc: "Enterprise-grade versioning system that tracks every cell execution for instant rollbacks." },
    { title: "Insights", icon: <IconStep4 />, desc: "Transform massive datasets into interactive, vectorized visualizations with sub-100ms rendering." },
    { title: "Workspace", icon: <IconStep5 />, desc: "Collaborative cloud environment with granular RBAC and real-time multiplayer editing." }
];

export const TICKER_ITEMS = ["LIVE: 1.2M rows/s", "LATENCY: 12ms", "QUERIES: 84k/min", "NODES: 124 Online", "Uptime: 99.999%"];
