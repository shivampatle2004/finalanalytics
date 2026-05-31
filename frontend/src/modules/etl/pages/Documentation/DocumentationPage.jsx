import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen, Database, Globe, FileSpreadsheet, Cloud, Server,
  ChevronDown, ChevronRight, Terminal, Key, Link, Copy, CheckCircle2,
  Workflow, Wand2, Activity, Settings, Cable, FolderOpen,
  Search, ShieldCheck, Zap, Bell, HelpCircle, ExternalLink,
  ChevronLeft, Layout, Cpu, Boxes, Info, Sparkles, TerminalSquare,
  Shield, AlertTriangle, Table as TableIcon, History, Container,
  Code2, Share2, Rocket, BarChart3, Binary, Eye, FileSearch,
  Network, MousePointer2
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONNECTOR_GUIDES } from '../Connectors/connectorGuides';
import './DocumentationPage.css';

// ── User-Centric Sidebar Categories ──
const DOC_NAVIGATION = [
  {
    group: 'Getting Started',
    items: [
      { id: 'overview', label: 'Platform Overview', icon: BookOpen },
      { id: 'quickstart', label: 'Quick Start Guide', icon: Zap },
      { id: 'architecture', label: 'Platform Architecture', icon: Network },
    ]
  },
  {
    group: 'Data Discovery',
    items: [
      { id: 'catalog', label: 'Data Catalog', icon: FileSearch },
      { id: 'lineage', label: 'Data Lineage', icon: Network },
      { id: 'filehub', label: 'File Explorer', icon: FolderOpen },
    ]
  },
  {
    group: 'Building Pipelines',
    items: [
      { id: 'designer', label: 'Visual Designer', icon: MousePointer2 },
      { id: 'transform', label: 'AI & SQL Transform', icon: Wand2 },
      { id: 'quality', label: 'Quality Control', icon: Shield },
    ]
  },
  {
    group: 'Enterprise Core',
    items: [
      { id: 'engine', label: 'Execution Engine', icon: Cpu },
      { id: 'vault', label: 'Security Vault', icon: ShieldCheck },
      { id: 'monitoring', label: 'Job Monitoring', icon: Activity },
      { id: 'alerting', label: 'Alerting Hub', icon: Bell },
    ]
  },
  {
    group: 'Infrastructure',
    items: [
      { id: 'deployment', label: 'Cloud Deployment', icon: Container },
      { id: 'api_cli', label: 'API & Remote CLI', icon: Code2 },
    ]
  }
];

const CONNECTOR_CATEGORIES = [
  { id: 'files', label: 'Files & Storage', icon: Cloud, engines: ['csv', 'excel', 'parquet', 'json', 's3', 'azure_blob', 'google_drive'] },
  { id: 'db', label: 'Databases', icon: Database, engines: ['postgres', 'mysql', 'sqlite', 'mongodb', 'snowflake', 'sql_server', 'oracle', 'redshift', 'bigquery', 'redisflow'] },
  { id: 'crm', label: 'CRM & ERP', icon: Layout, engines: ['hubspot', 'salesforce', 'zoho', 'd365', 'tally', 'pipedrive', 'zendesk', 'workday', 'sap_hana'] },
  { id: 'marketing', label: 'Marketing & AdTech', icon: Sparkles, engines: ['mailchimp', 'sendgrid', 'marketo', 'intercom', 'meta_ads', 'google_ads'] },
  { id: 'ecommerce', label: 'E-Commerce', icon: Boxes, engines: ['shopify', 'stripe', 'paypal', 'woo_commerce'] },
  { id: 'productivity', label: 'Productivity', icon: FileSpreadsheet, engines: ['notion', 'airtable', 'google_sheets', 'slack', 'discord', 'microsoft_teams'] },
  { id: 'dev', label: 'Developer Tools', icon: TerminalSquare, engines: ['github', 'gitlab', 'bitbucket', 'datadog', 'sentry', 'postman'] },
];

function CodeBlock({ children, label, language = 'bash' }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(children);
        setCopied(true);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (err) {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = children;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
      } catch (f) {
        console.error('Fallback copy failed', f);
      }
      document.body.removeChild(textArea);
    }
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="premium-code-container">
      <div className="code-header">
        <div className="header-left">
          <TerminalSquare size={13} className="terminal-icon" />
          <span className="lang-tag">{label || language}</span>
        </div>
        <button className="copy-action" onClick={handleCopy}>
          {copied ? <><CheckCircle2 size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <div className="code-content">
        <pre><code>{children}</code></pre>
      </div>
    </div>
  );
}

export function DocumentationPage({ subPath, onNavigate }) {
  const navigate = useNavigate();
  const params = useParams();
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState('overview');
  const [activeTOC, setActiveTOC] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (params.id) {
      const parts = params.id.split('/');
      if (parts[0] === 'connector' && parts[1]) {
        setActiveId(parts[1]);
      } else {
        setActiveId(params.id);
      }
    } else if (subPath) {
      const parts = subPath.split('/');
      if (parts[0] === 'connector' && parts[1]) {
        setActiveId(parts[1]);
      } else {
        setActiveId(subPath);
      }
    }
  }, [subPath, params.id]);

  const filteredConnectors = useMemo(() => {
    const s = search.toLowerCase();
    return Object.keys(CONNECTOR_GUIDES).filter(key => 
      key.toLowerCase().includes(s) || 
      CONNECTOR_GUIDES[key].summary?.toLowerCase().includes(s)
    );
  }, [search]);

  const setPage = (id) => {
    setActiveId(id);
    navigate(`/etl/docs/${id}`);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (id) => {
    setActiveTOC(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderSection = () => {
    const guide = CONNECTOR_GUIDES[activeId];
    
    if (guide) {
      return (
        <div className="docs-article animate-in">
          <header className="article-header">
            <h1>{activeId.replace('_', ' ').toUpperCase()}</h1>
            <p className="lead">{guide.summary}</p>
          </header>

          <section className="article-section" id="setup">
            <h2>User Guide</h2>
            <div className="step-grid-high-grade">
              {guide.steps.map((step, i) => (
                <div key={i} className="step-card-premium">
                  <div className="step-marker">
                    <div className="marker-dot">{i + 1}</div>
                    {i < guide.steps.length - 1 && <div className="marker-line" />}
                  </div>
                  <div className="step-body">
                    <p>{step}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {guide.tip && (
            <section className="article-section" id="optimization">
              <h2>Pro Tips</h2>
              <div className="status-callout callout-info">
                <Sparkles className="callout-icon" />
                <div className="callout-body">
                  <strong>User Insight</strong>
                  <p>{guide.tip}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      );
    }

    switch (activeId) {
      case 'quickstart':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Quick Start Guide</h1>
              <p className="lead">Go from Zero to a running Pipeline in under 2 minutes.</p>
            </header>
            <section className="article-section">
              <div className="step-grid-high-grade">
                <div className="step-card-premium">
                  <div className="step-marker"><div className="marker-dot">1</div><div className="marker-line" /></div>
                  <div className="step-body">
                    <h3>Connect a Source</h3>
                    <p>Navigate to the <strong>Connectors</strong> hub. Click "Add Connector" and choose from 40+ native integrations including PostgreSQL, S3, Shopify, or HubSpot. Enter your credentials and test the connection.</p>
                  </div>
                </div>
                <div className="step-card-premium">
                  <div className="step-marker"><div className="marker-dot">2</div><div className="marker-line" /></div>
                  <div className="step-body">
                    <h3>Design your Data Flow</h3>
                    <p>Open the <strong>Visual Designer</strong>. Drag your connector onto the canvas. Connect it to a <strong>Transform Node</strong> where you can use SQL or AI to clean your data. Finally, link it to a <strong>Destination Sink</strong>.</p>
                  </div>
                </div>
                <div className="step-card-premium">
                  <div className="step-marker"><div className="marker-dot">3</div><div className="marker-line" /></div>
                  <div className="step-body">
                    <h3>Deploy & Automate</h3>
                    <p>Hit the <strong>Run</strong> button to execute your pipeline manually, or set up a <strong>Cron Schedule</strong> in the pipeline settings for automated hourly or daily synchronization.</p>
                  </div>
                </div>
                <div className="step-card-premium">
                  <div className="step-marker"><div className="marker-dot">4</div></div>
                  <div className="step-body">
                    <h3>Monitor in Real-Time</h3>
                    <p>Head over to the <strong>Job Monitor</strong> to track row throughput, execution duration, and log outputs. Set up <strong>Slack Notifications</strong> to stay informed of any failures.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        );

      case 'overview':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1 id="welcome">Welcome to OneStopAnalytics</h1>
              <p className="lead">The unified workspace for data engineers, analysts, and architects.</p>
            </header>

            <section className="article-section">
              <p>
                OneStopAnalytics is an enterprise-grade unified data ecosystem designed to bridge the gap between complex engineering, warehousing, and analytics. It seamlessly integrates ETL Studios, Data Warehouses, and BI Analytics into a single, high-performance portal.
              </p>

              <div className="modern-feature-grid">
                <div className="modern-feat-card">
                  <div className="feat-icon-blue"><BarChart3 size={20} /></div>
                  <h3>Operational Dashboard</h3>
                  <p>Track throughput, pipeline health, and resource utilization in a centralized command center.</p>
                </div>
                <div className="modern-feat-card">
                  <div className="feat-icon-purple"><Wand2 size={20} /></div>
                  <h3>AI-Powered ETL</h3>
                  <p>Leverage LLMs to generate complex Polars and SQL logic using natural language instructions.</p>
                </div>
                <div className="modern-feat-card">
                  <div className="feat-icon-green"><Network size={20} /></div>
                  <h3>Active Lineage</h3>
                  <p>Automatically map data dependencies from source to destination with sub-second updates.</p>
                </div>
                <div className="modern-feat-card">
                  <div className="feat-icon-blue"><ShieldCheck size={20} /></div>
                  <h3>Security Vault</h3>
                  <p>AES-256-GCM encrypted secret management ensures your API keys and passwords never leak.</p>
                </div>
              </div>
            </section>

            <section className="article-section" id="stack">
              <h2>The OneStopAnalytics Advantage</h2>
              <p>Built for performance and scalability, our architecture is optimized for the modern data stack:</p>
              <ul>
                <li><strong>Arrow-Powered Execution</strong>: We use Apache Arrow as our memory backbone for zero-copy data transfers.</li>
                <li><strong>Hybrid Compute</strong>: Seamlessly switch between local memory processing and persistent-buffered streaming.</li>
                <li><strong>Unified Catalog</strong>: A single source of truth for all your schemas, metadata, and data quality scores.</li>
                <li><strong>Pluggable Connectors</strong>: Over 40+ native integrations and a developer SDK for custom sources.</li>
              </ul>
            </section>
          </div>
        );

      case 'catalog':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <div className="mini-badge">Discovery</div>
              <h1 id="search">The Data Catalog</h1>
              <p className="lead">Search and explore your entire data universe in seconds.</p>
            </header>
            <section className="article-section">
              <p>The Catalog (found in <strong>Tables</strong>) is your central repository for data discovery. It automatically indexes your connectors to provide a searchable map of your data.</p>
              <h2 id="metadata">Metadata & Previews</h2>
              <p>Click any table to view its schema, sample rows, and quality stats without running a single query.</p>
            </section>
          </div>
        );

      case 'lineage':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Visual Data Lineage</h1>
              <p className="lead">Understand the impact of every change with end-to-end lineage.</p>
            </header>
            <section className="article-section" id="impact">
              <h2>Upstream & Downstream</h2>
              <p>The <strong>Data Lineage</strong> view tracks the movement of data across your pipelines. If a source file changes, you can instantly see which reports or databases are affected.</p>
            </section>
          </div>
        );

      case 'designer':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>The Pipeline Designer</h1>
              <p className="lead">A drag-and-drop workspace for building industrial automation.</p>
            </header>
            <section className="article-section" id="nodes">
              <h2>Working with Nodes</h2>
              <p>Every pipeline is built using nodes. There are three types:</p>
              <div className="modern-feature-grid">
                <div className="modern-feat-card"><strong>Source</strong><span>Connects to your databases or files.</span></div>
                <div className="modern-feat-card"><strong>Transform</strong><span>Applies logic (SQL/AI) to your data.</span></div>
                <div className="modern-feat-card"><strong>Sink</strong><span>Sends the final data to its destination.</span></div>
              </div>
              <h2 id="edges">Connecting Data</h2>
              <p>Simply click a node's output port and drag a line to another node's input. ArithFlow handles the data hand-off and typing automatically.</p>
            </section>
          </div>
        );

      case 'transform':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>AI & SQL Transformation</h1>
              <p className="lead">Professional data cleaning at the speed of thought.</p>
            </header>
            <section className="article-section" id="copilot">
              <h2>Using the AI Copilot</h2>
              <p>Inside a transformation node, click the AI icon. Type a prompt like: <em>"Clean the column 'User_Email' by lowercase and remove duplicates"</em>. The AI will generate the optimized Polars code for you.</p>
              <h2 id="sql">Advanced SQL Editor</h2>
              <p>For experts, the built-in SQL Editor provides full syntax highlighting and on-demand validation against your catalog.</p>
            </section>
          </div>
        );

      case 'quality':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Data Quality Control</h1>
              <p className="lead">Stop bad data before it pollutes your production warehouse.</p>
            </header>
            <section className="article-section" id="rules">
              <h2>Defining Guards</h2>
              <p>Add <strong>Quality Nodes</strong> to your pipelines to verify data integrity. Common rules include <code>not_null</code>, <code>unique</code>, and <code>regex_validate</code>.</p>
            </section>
          </div>
        );

      case 'monitoring':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Job Monitoring</h1>
              <p className="lead">Real-time oversight for every byte processed.</p>
            </header>
            <section className="article-section" id="jobs">
              <h2>The Job History</h2>
              <p>The <strong>Monitor</strong> view shows every execution of your pipelines. You can see the exact row count processed, duration, and any errors encountered.</p>
              <h2 id="logs">Deep Logs</h2>
              <p>Click "View Logs" on any job to see a detailed, per-node breakdown of what happened during execution.</p>
            </section>
          </div>
        );

      case 'filehub':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>File Hub & Explorer</h1>
              <p className="lead">Centralize your local and cloud file storage.</p>
            </header>
            <section className="article-section" id="s3">
              <h2>S3 & Cloud Browsing</h2>
              <p>Connect your AWS S3 buckets to browse files directly within ArithFlow. You can preview CSV, JSON, and Excel files without downloading them.</p>
            </section>
          </div>
        );

      case 'vault':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Enterprise Security (Vault)</h1>
              <p className="lead">Bank-grade protection for your connection secrets.</p>
            </header>
            <section className="article-section" id="vault">
              <p>OneStopAnalytics uses a specialized <strong>Security Vault</strong> to store all sensitive connection parameters (passwords, API keys).</p>
              <h2>How it works</h2>
              <ul>
                <li><strong>Encryption</strong>: All secrets are encrypted with AES-256-GCM.</li>
                <li><strong>Tokenization</strong>: We replace your real passwords with safe "tokens" in your pipeline configs.</li>
              </ul>
            </section>
          </div>
        );

      case 'engine':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>The Execution Engine</h1>
              <p className="lead">High-performance data orchestration powered by Polars.</p>
            </header>
            <section className="article-section">
              <p>OneStopAnalytics uses a specialized streaming engine that leverages <strong>Apache Arrow</strong> memory formatting. This allows for sub-second processing even on datasets with millions of rows.</p>
              <h2>Memory Guard</h2>
              <p>Our engine automatically monitors memory usage. If a job exceeds the threshold (configurable in Settings), it will automatically switch to a persistence-buffered mode to prevent crashes.</p>
            </section>
          </div>
        );

      case 'api_cli':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>API & Remote CLI</h1>
              <p className="lead">Integrate OneStopAnalytics into your existing CI/CD or automation scripts.</p>
            </header>
            <section className="article-section">
              <p>Every pipeline in OneStopAnalytics is accessible via a RESTful API. You can trigger jobs, fetch logs, or update configurations programmatically.</p>
              <CodeBlock label="Trigger Pipeline">
                curl -X POST http://localhost:8000/api/v1/jobs/trigger/PIPELINE_ID
              </CodeBlock>
            </section>
          </div>
        );

      case 'deployment':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Infrastructure & Cloud Deployment</h1>
              <p className="lead">Scale and productionize OneStopAnalytics with modern DevOps patterns.</p>
            </header>
            <section className="article-section" id="docker">
              <h2>Docker Compose</h2>
              <p>The easiest way to deploy OneStopAnalytics is using Docker Compose. This starts the FastAPI backend, React frontend, and the SQLite/PostgreSQL database in isolated containers.</p>
              <CodeBlock label="One-Click Deploy">
                docker-compose up -d
              </CodeBlock>
              <h2>Production Run Setup</h2>
              <p>The recommended deployment for small to medium teams is via Docker Compose with build options:</p>
              <CodeBlock label="Production Run">
                docker-compose up -d --build
              </CodeBlock>
              <h2>High Availability (HA)</h2>
              <p>For zero-downtime environments, deploy the OneStopAnalytics API behind an Nginx load balancer and use a managed PostgreSQL instance for state persistence.</p>
            </section>
          </div>
        );


      case 'alerting':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <h1>Alerting & Notifications</h1>
              <p className="lead">Get notified exactly when your data flow needs attention.</p>
            </header>
            <section className="article-section" id="channels">
              <h2>Integration Channels</h2>
              <p>Connect OneStopAnalytics to <strong>Slack</strong> or <strong>Telegram</strong> in the System Settings. Receive daily health summaries and instant failure alerts.</p>
            </section>
          </div>
        );

      case 'architecture':
        return (
          <div className="docs-article animate-in">
            <header className="article-header">
              <div className="mini-badge">Advanced</div>
              <h1>Platform Architecture</h1>
              <p className="lead">Deep dive into the 2026 OneStopAnalytics Distributed Engine.</p>
            </header>
            <section className="article-section">
              <h2>Overview</h2>
              <p>OneStopAnalytics is built on a **Modular Micro-Kernel** architecture. This ensures that the core execution engine remains extremely lightweight, while all connectors and transformations are loaded dynamically as required by the pipeline.</p>
              
              <div className="modern-feature-grid">
                <div className="modern-feat-card">
                  <h3>Arrow-Native Kernels</h3>
                  <p>Our transformation engine operates directly on **Apache Arrow** memory buffers. This eliminates costly serialization overhead when moving data between nodes.</p>
                </div>
                <div className="modern-feat-card">
                  <h3>Event-Driven Orchestration</h3>
                  <p>Pipelines are not just linear scripts; they are event-driven flows. Nodes emit status events that the Orchestrator uses to manage parallel execution and back-pressure.</p>
                </div>
              </div>

              <h2>Scaling Patterns</h2>
              <p>For production workloads, OneStopAnalytics supports three distinct scaling patterns:</p>
              <ul>
                <li><strong>Local Streaming</strong>: For datasets up to 50GB, data is streamed through memory with minimal disk spill.</li>
                <li><strong>Distributed Worker Groups</strong>: For massive ETL jobs, the Orchestrator shards data across multiple worker nodes.</li>
                <li><strong>Serverless Execution</strong>: Trigger pipelines as individual ephemeral tasks on AWS Lambda or Google Cloud Functions.</li>
              </ul>
            </section>
          </div>
        );


      default:
        return (
          <div className="docs-empty-state-pro animate-in">
            <div className="empty-hero">
              <Sparkles size={48} className="hero-sparkle" />
              <h2>Academy Knowledge Base</h2>
              <p>Search over 40+ guides or select a topic from the sidebar to begin your journey.</p>
            </div>
            
            <div className="quick-access-grid">
              <div className="qa-card" onClick={() => setPage('quickstart')}>
                <Zap size={24} />
                <h3>Quick Start</h3>
                <p>Get up and running in 2 minutes.</p>
              </div>
              <div className="qa-card" onClick={() => setPage('architecture')}>
                <Network size={24} />
                <h3>Architecture</h3>
                <p>Understand the 2026 engine core.</p>
              </div>
              <div className="qa-card" onClick={() => setPage('api_cli')}>
                <Terminal size={24} />
                <h3>API Reference</h3>
                <p>Programmatic access & CLI tools.</p>
              </div>
            </div>

            <div className="academy-footer-info">
              <Info size={16} />
              <span>Can't find what you're looking for? Try searching in the top bar.</span>
            </div>
          </div>
        );
    }
  };

  const renderTOCLinks = () => {
    if (CONNECTOR_GUIDES[activeId]) {
      return (
        <>
          <button onClick={() => scrollToSection('setup')} className={`toc-link ${activeTOC === 'setup' ? 'active' : ''}`}>Implementation</button>
          <button onClick={() => scrollToSection('optimization')} className={`toc-link ${activeTOC === 'optimization' ? 'active' : ''}`}>Optimization</button>
        </>
      );
    }
    const tocMap = {
      overview: [{ id: 'welcome', label: 'Welcome' }, { id: 'stack', label: 'OneStopAnalytics Values' }],
      quickstart: [{ id: 'connect', label: 'Connect' }, { id: 'model', label: 'Model' }, { id: 'run', label: 'Run' }],
      architecture: [{ id: 'overview', label: 'Core Engine' }, { id: 'scaling', label: 'Scaling' }],
      catalog: [{ id: 'search', label: 'Search' }, { id: 'metadata', label: 'Metadata' }],
      lineage: [{ id: 'impact', label: 'Impact' }],
      designer: [{ id: 'nodes', label: 'Nodes' }, { id: 'edges', label: 'Connections' }],
      transform: [{ id: 'copilot', label: 'AI Copilot' }, { id: 'sql', label: 'SQL Editor' }],
      quality: [{ id: 'rules', label: 'Guards' }],
      engine: [{ id: 'streaming', label: 'Streaming' }, { id: 'memory', label: 'Memory Guard' }],
      vault: [{ id: 'vault', label: 'Encryption' }],
      monitoring: [{ id: 'jobs', label: 'Job History' }, { id: 'logs', label: 'Deep Logs' }],
      alerting: [{ id: 'channels', label: 'Channels' }],
      deployment: [{ id: 'docker', label: 'Docker' }],
      api_cli: [{ id: 'api', label: 'REST API' }],
    };
    return (tocMap[activeId] || []).map(link => (
      <button 
        key={link.id} 
        onClick={() => scrollToSection(link.id)} 
        className={`toc-link ${activeTOC === link.id ? 'active' : ''}`}
      >
        {link.label}
      </button>
    ));
  };

  return (
    <div className="documentation-portal">
      <header className="academy-header">
        <div className="header-brand">
          <div className="brand-logo">
            <Sparkles size={20} className="logo-icon" />
          </div>
          <div className="brand-text">
            <h1>OneStopAnalytics Academy</h1>
            <p>Documentation & Training Portal</p>
          </div>
        </div>
        
        <div className="header-center">
          <div className="academy-search">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search across 40+ connectors and guides..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="header-actions">
          <button className="back-btn" onClick={() => navigate('/etl/dashboard')}>
            <ChevronLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </header>

      <div className="docs-layout">
        {/* ── Left Sidebar: Navigation ── */}
        <aside className="docs-sidebar-left">
          <div className="sidebar-scrollable">
            {DOC_NAVIGATION.map(group => (
              <div key={group.group} className="sidebar-section">
                <label>{group.group}</label>
                {group.items.map(s => (
                  <button 
                    key={s.id} 
                    className={`side-link-pro ${activeId === s.id ? 'active' : ''}`}
                    onClick={() => setPage(s.id)}
                  >
                    <s.icon size={14} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            ))}

            <div className="sidebar-section">
              <label>Connectors</label>
              {CONNECTOR_CATEGORIES.map(cat => {
                const visible = cat.engines.filter(e => filteredConnectors.includes(e));
                if (visible.length === 0 && search) return null;
                return (
                  <div key={cat.id} className="cat-group">
                    <div className="cat-title">
                      <cat.icon size={12} />
                      {cat.label}
                    </div>
                    {visible.map(e => (
                      <button 
                        key={e} 
                        className={`engine-link ${activeId === e ? 'active' : ''}`}
                        onClick={() => setPage(e)}
                      >
                        {e.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Center: Main Content ── */}
        <main className="docs-viewer" ref={scrollRef}>
          <div className="docs-view-container">
            <div className="docs-main-article">
              {renderSection()}
            </div>
          </div>
        </main>

        {/* ── Right Sidebar: TOC ── */}
        <aside className="docs-sidebar-right">
          <div className="toc-wrapper">
            <label>On This Page</label>
            <div className="toc-nav">
              {renderTOCLinks()}
            </div>
            
            <div className="toc-divider" />
            
            <div className="help-card">
              <HelpCircle size={16} className="help-icon" />
              <h4>Need help?</h4>
              <p>Contact our solution architects for custom integration support.</p>
              <button className="help-btn">Contact Support</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
