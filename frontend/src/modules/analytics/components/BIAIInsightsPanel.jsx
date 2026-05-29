import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  Copy,
  CheckCheck,
  Download,
  Send,
  TrendingUp,
  AlertTriangle,
  Target,
  Compass,
  Lightbulb,
  Activity,
  MessageSquare,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import './BIAIInsightsPanel.css';

/** Personas — ids must match backend services/ai_insights.py MODES keys */
const MODE_LIST = [
  { id: 'ceo', label: 'Executive Summary', description: 'Strategic, concise, business impact' },
  { id: 'technical', label: 'Explain Technically', description: 'Statistical and analytical depth' },
  { id: 'simple', label: 'Explain Simply', description: 'Plain language, no jargon' },
  { id: 'financial', label: 'Financial View', description: 'Revenue, cost, and margin lens' },
  { id: 'sales', label: 'Sales View', description: 'Pipeline, conversion, and regions' },
];

const TASK_META = {
  explain: { label: 'Explain', icon: Sparkles },
  trend: { label: 'Trend', icon: TrendingUp },
  anomalies: { label: 'Anomalies', icon: AlertTriangle },
  rootCause: { label: 'Root cause', icon: Target },
  summary: { label: 'Summary', icon: Compass },
  nextSteps: { label: 'Next steps', icon: Lightbulb },
  story: { label: 'Story', icon: Activity },
  ask: { label: 'Ask', icon: MessageSquare },
};

function renderInlineMD(text) {
  if (!text) return null;
  const tokens = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t)) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(t)) return <code key={i}>{t.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{t}</React.Fragment>;
  });
}

function MarkdownBlock({ text }) {
  if (!text) return null;
  const lines = String(text).split('\n');
  return (
    <div className="bi-ai-md">
      {lines.map((ln, i) => {
        const trimmed = ln.trim();
        if (!trimmed) return <div key={i} className="bi-ai-md-spacer" />;
        if (/^[-•]\s+/.test(trimmed)) {
          return (
            <div key={i} className="bi-ai-md-bullet">
              <span className="bi-ai-md-dot" />
              <span>{renderInlineMD(trimmed.replace(/^[-•]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} className="bi-ai-md-bullet bi-ai-md-bullet--numbered">
              <span className="bi-ai-md-num">{num}</span>
              <span>{renderInlineMD(trimmed.replace(/^\d+\.\s+/, ''))}</span>
            </div>
          );
        }
        return <p key={i} className="bi-ai-md-p">{renderInlineMD(trimmed)}</p>;
      })}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="bi-ai-stat">
      <span className="bi-ai-stat-label">{label}</span>
      <span className="bi-ai-stat-value">{value}</span>
    </div>
  );
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  const a = Math.abs(x);
  if (a >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${(x / 1_000).toFixed(1)}K`;
  if (a === 0 || a >= 100) return Math.round(x).toLocaleString();
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function textsSimilar(a, b) {
  if (!a || !b) return false;
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Which blocks to show per tab — avoids duplicate Summary + Narrative on Explain */
function getSectionPlan(task, result) {
  const hasTrends = Array.isArray(result?.trends) && result.trends.length > 0;
  const hasAnomalies = Array.isArray(result?.anomalies) && result.anomalies.length > 0;
  const hasDrivers = Array.isArray(result?.rootCauseDrivers) && result.rootCauseDrivers.length > 0;
  const hasRecs = Array.isArray(result?.recommendations) && result.recommendations.length > 0;
  const hasRoot = Boolean(result?.rootCause);
  const hasStats = Boolean(result?.stats);

  const headline = Boolean(result?.headline);
  const narrative = Boolean(result?.narrative);
  const summary = Boolean(result?.summary);

  const plan = {
    headline: false,
    body: false,
    trends: false,
    anomalies: false,
    rootCause: false,
    recommendations: false,
    stats: false,
  };

  switch (task) {
    case 'trend':
      plan.headline = headline;
      plan.trends = hasTrends;
      plan.stats = hasStats;
      if (!hasTrends && summary) plan.body = true;
      break;
    case 'anomalies':
      plan.headline = headline;
      plan.anomalies = hasAnomalies;
      if (!hasAnomalies && summary) plan.body = true;
      break;
    case 'rootCause':
      plan.headline = headline;
      plan.rootCause = hasRoot || hasDrivers;
      if (!hasRoot && summary) plan.body = true;
      break;
    case 'summary':
      plan.headline = headline;
      plan.body = summary && !textsSimilar(result.summary, result.headline);
      break;
    case 'nextSteps':
      plan.recommendations = hasRecs;
      plan.body = !hasRecs && summary;
      break;
    case 'story':
      plan.headline = false;
      plan.body = narrative || summary;
      plan.trends = hasTrends;
      plan.anomalies = hasAnomalies;
      break;
    case 'explain':
    default:
      plan.headline = headline;
      plan.body = narrative || (summary && !textsSimilar(result.summary, result.headline));
      plan.trends = hasTrends;
      plan.anomalies = hasAnomalies;
      plan.rootCause = hasRoot || hasDrivers;
      plan.recommendations = hasRecs;
      plan.stats = hasStats;
      break;
  }

  return plan;
}

function buildExportText(result, modeLabel, task) {
  if (!result) return '';
  const lines = [];
  lines.push(`AI Insights — ${TASK_META[task]?.label || 'Report'}`);
  lines.push(`Mode: ${modeLabel}`);
  if (result.title) lines.push(`Chart: ${result.title}`);
  if (result.chartType) lines.push(`Type: ${result.chartType}`);
  lines.push('');
  if (result.headline) { lines.push('## Headline'); lines.push(result.headline); lines.push(''); }
  if (result.narrative) { lines.push('## Narrative'); lines.push(result.narrative); lines.push(''); }
  else if (result.summary) { lines.push('## Summary'); lines.push(result.summary); lines.push(''); }
  if (Array.isArray(result.trends) && result.trends.length) {
    lines.push('## Trends');
    result.trends.forEach((t) => lines.push(`- ${t.summary}`));
    lines.push('');
  }
  if (Array.isArray(result.anomalies) && result.anomalies.length) {
    lines.push('## Anomalies');
    result.anomalies.forEach((a) => lines.push(`- ${a.summary}`));
    lines.push('');
  }
  if (result.rootCause) { lines.push('## Root Cause'); lines.push(result.rootCause); lines.push(''); }
  if (Array.isArray(result.recommendations) && result.recommendations.length) {
    lines.push('## Recommendations');
    result.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');
  }
  return lines.join('\n');
}

export default function BIAIInsightsPanel({
  open,
  onClose,
  task,
  setTask,
  mode,
  setMode,
  loading,
  result,
  error,
  selectedVisualTitle,
  hasSelectedVisual,
  onRunTask,
  onAsk,
  chatHistory,
  onClearChat,
}) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [askInput, setAskInput] = useState('');
  const bodyRef = useRef(null);
  const modeWrapRef = useRef(null);

  const meta = TASK_META[task] || TASK_META.explain;
  const modeMeta = useMemo(() => MODE_LIST.find((m) => m.id === mode) || MODE_LIST[0], [mode]);
  const activeModeLabel = result?.mode || modeMeta.label;

  const sectionPlan = useMemo(
    () => (result ? getSectionPlan(task, result) : null),
    [task, result],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [result, task, mode]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const onDoc = (e) => {
      if (modeWrapRef.current && !modeWrapRef.current.contains(e.target)) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [modeMenuOpen]);

  const handleCopy = useCallback(async () => {
    const text = buildExportText(result, activeModeLabel, task);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [result, activeModeLabel, task]);

  const handleExport = useCallback(() => {
    const text = buildExportText(result, activeModeLabel, task);
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (result?.title || 'ai-insights').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    a.download = `${safeTitle}-${task}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, activeModeLabel, task]);

  const handleAskSubmit = useCallback(
    (e) => {
      e?.preventDefault?.();
      const q = askInput.trim();
      if (!q || loading) return;
      onAsk?.(q);
      setAskInput('');
    },
    [askInput, loading, onAsk],
  );

  const handleModeSelect = (modeId) => {
    setMode(modeId);
    setModeMenuOpen(false);
  };

  if (!open) return null;

  const showChat = task === 'ask' || task === 'chat';
  const TaskIcon = meta.icon;
  const bodyText = result?.narrative || result?.summary;

  return (
    <>
      <div className="bi-ai-backdrop" onMouseDown={onClose} role="presentation" />
      <aside
        className="bi-ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bi-ai-panel-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bi-ai-header">
          <div className="bi-ai-header-left">
            <div className="bi-ai-header-glyph" aria-hidden>
              <Sparkles size={15} />
            </div>
            <div className="bi-ai-header-text">
              <h2 id="bi-ai-panel-title" className="bi-ai-header-title">AI Insights</h2>
              <p className="bi-ai-header-sub">
                {selectedVisualTitle
                  ? <>Analyzing <strong>{selectedVisualTitle}</strong></>
                  : 'Select a visual on the canvas'}
              </p>
            </div>
          </div>
          <div className="bi-ai-header-actions">
            <div className="bi-ai-mode-wrap" ref={modeWrapRef}>
              <button
                type="button"
                className="bi-ai-mode-btn"
                onClick={() => setModeMenuOpen((v) => !v)}
                aria-expanded={modeMenuOpen}
                aria-haspopup="listbox"
                title="Analysis perspective"
              >
                <span className="bi-ai-mode-label">{modeMeta.label}</span>
                <ChevronDown size={14} className={modeMenuOpen ? 'bi-ai-chevron-open' : ''} />
              </button>
              {modeMenuOpen && (
                <ul className="bi-ai-mode-menu" role="listbox" aria-label="Analysis perspective">
                  {MODE_LIST.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={mode === m.id}
                        className={`bi-ai-mode-item ${mode === m.id ? 'bi-ai-mode-item--on' : ''}`}
                        onClick={() => handleModeSelect(m.id)}
                      >
                        <span className="bi-ai-mode-item-label">{m.label}</span>
                        <span className="bi-ai-mode-item-desc">{m.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="bi-ai-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
              <X size={17} />
            </button>
          </div>
        </header>

        <nav className="bi-ai-tabs" aria-label="Insight task">
          {Object.entries(TASK_META).map(([id, t]) => (
            <button
              key={id}
              type="button"
              className={`bi-ai-tab ${task === id ? 'bi-ai-tab--on' : ''}`}
              onClick={() => setTask?.(id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="bi-ai-body" ref={bodyRef}>
          {!hasSelectedVisual && (
            <div className="bi-ai-empty">
              <Sparkles size={26} strokeWidth={1.5} />
              <h3>Select a chart</h3>
              <p>Click a visual on the canvas, then pick a tab above. Insights use the selected perspective from the dropdown.</p>
            </div>
          )}

          {hasSelectedVisual && loading && (
            <div className="bi-ai-loading">
              <Loader2 size={18} className="bi-ai-spin" />
              <span>Analyzing as <strong>{modeMeta.label}</strong>…</span>
            </div>
          )}

          {hasSelectedVisual && !loading && error && (
            <div className="bi-ai-error">
              <AlertTriangle size={16} />
              <div>
                <strong>Could not load insights</strong>
                <p>{error}</p>
                <button type="button" className="bi-ai-retry" onClick={() => onRunTask?.(task)}>
                  <RefreshCw size={13} /> Try again
                </button>
              </div>
            </div>
          )}

          {hasSelectedVisual && !loading && !error && !result && !showChat && (
            <div className="bi-ai-empty">
              <TaskIcon size={24} strokeWidth={1.5} />
              <h3>{meta.label}</h3>
              <p>Run analysis for <strong>{modeMeta.label}</strong> on the selected visual.</p>
              <button type="button" className="bi-ai-primary" onClick={() => onRunTask?.(task)}>
                Run {meta.label}
              </button>
            </div>
          )}

          {hasSelectedVisual && !loading && !error && result && !showChat && sectionPlan && (
            <div className="bi-ai-result">
              <div className="bi-ai-result-meta">
                <span className="bi-ai-result-task">
                  <TaskIcon size={13} />
                  {meta.label}
                  {result.title ? ` · ${result.title}` : ''}
                </span>
                <span className="bi-ai-mode-chip">{activeModeLabel}</span>
              </div>

              {sectionPlan.headline && result.headline && (
                <section className="bi-ai-hero">
                  <MarkdownBlock text={result.headline} />
                </section>
              )}

              {sectionPlan.body && bodyText && (
                <section className="bi-ai-block">
                  <h4 className="bi-ai-block-title">
                    {task === 'story' ? 'Story' : task === 'summary' ? 'Summary' : 'Insight'}
                  </h4>
                  <MarkdownBlock text={bodyText} />
                </section>
              )}

              {sectionPlan.trends && (
                <section className="bi-ai-block">
                  <h4 className="bi-ai-block-title"><TrendingUp size={12} /> Trends</h4>
                  <ul className="bi-ai-trend-list">
                    {result.trends.map((t, i) => (
                      <li key={i} className={`bi-ai-trend-item bi-ai-trend-item--${t.direction || 'flat'}`}>
                        <span className="bi-ai-trend-pct">
                          {t.pct_change != null ? `${t.pct_change > 0 ? '+' : ''}${t.pct_change}%` : '—'}
                        </span>
                        <div>
                          <div className="bi-ai-trend-label">{t.label}</div>
                          <div className="bi-ai-trend-sum">{t.summary}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sectionPlan.anomalies && (
                <section className="bi-ai-block">
                  <h4 className="bi-ai-block-title"><AlertTriangle size={12} /> Anomalies</h4>
                  <ul className="bi-ai-anom-list">
                    {result.anomalies.map((a, i) => (
                      <li key={i} className={`bi-ai-anom-item bi-ai-anom-item--${a.direction || 'spike'}`}>
                        <span className="bi-ai-anom-z">{a.z_score > 0 ? '+' : ''}{a.z_score}σ</span>
                        <div>
                          <strong>{a.label}</strong>
                          {a.deviation_pct != null && (
                            <span className="bi-ai-anom-pct">
                              {' '}{a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct}% vs avg
                            </span>
                          )}
                          <p>{a.summary}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sectionPlan.rootCause && (
                <section className="bi-ai-block">
                  <h4 className="bi-ai-block-title"><Target size={12} /> Root cause</h4>
                  {result.rootCause && <MarkdownBlock text={result.rootCause} />}
                  {result.rootCauseDrivers?.length > 0 && (
                    <ul className="bi-ai-driver-list">
                      {result.rootCauseDrivers.map((d, i) => (
                        <li key={i}>
                          <div className="bi-ai-driver-label">
                            <span className="bi-ai-driver-rank">{i + 1}</span>
                            <strong>{d.label}</strong>
                            <span className="bi-ai-driver-val">
                              {fmt(d.value)}
                              {d.share_pct != null ? ` · ${d.share_pct}%` : ''}
                            </span>
                          </div>
                          <div className="bi-ai-driver-bar">
                            <div
                              className="bi-ai-driver-fill"
                              style={{ width: `${Math.max(2, Math.min(100, d.share_pct || 0))}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {sectionPlan.recommendations && (
                <section className="bi-ai-block">
                  <h4 className="bi-ai-block-title"><Lightbulb size={12} /> Recommendations</h4>
                  <ol className="bi-ai-recs">
                    {result.recommendations.map((r, i) => (
                      <li key={i}><MarkdownBlock text={r} /></li>
                    ))}
                  </ol>
                </section>
              )}

              {sectionPlan.stats && result.stats && (
                <section className="bi-ai-block bi-ai-block--stats">
                  <h4 className="bi-ai-block-title">At a glance</h4>
                  <div className="bi-ai-stat-grid">
                    <StatPill label="Total" value={fmt(result.stats.total)} />
                    <StatPill label="Average" value={fmt(result.stats.avg)} />
                    <StatPill label="Min" value={fmt(result.stats.min)} />
                    <StatPill label="Max" value={fmt(result.stats.max)} />
                    <StatPill label="Median" value={fmt(result.stats.median)} />
                    <StatPill label="Points" value={result.stats.count ?? '—'} />
                  </div>
                </section>
              )}
            </div>
          )}

          {hasSelectedVisual && showChat && (
            <div className="bi-ai-chat">
              <p className="bi-ai-chat-mode-hint">
                Answers use <strong>{modeMeta.label}</strong> tone.
              </p>
              {(!chatHistory || chatHistory.length === 0) && !loading && (
                <div className="bi-ai-chat-empty">
                  <MessageSquare size={22} strokeWidth={1.5} />
                  <h3>Ask this visual</h3>
                  <div className="bi-ai-chat-suggests">
                    {['What is the headline?', 'Why is it trending?', 'Any anomalies?', 'What should we do next?'].map((s) => (
                      <button key={s} type="button" onClick={() => onAsk?.(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {(chatHistory || []).map((m, i) => (
                <div key={i} className={`bi-ai-chat-msg bi-ai-chat-msg--${m.role}`}>
                  {m.role === 'assistant' ? <MarkdownBlock text={m.content} /> : <span>{m.content}</span>}
                </div>
              ))}
              {loading && (
                <div className="bi-ai-chat-msg bi-ai-chat-msg--assistant">
                  <span className="bi-ai-typing"><i /><i /><i /></span>
                </div>
              )}
              <form className="bi-ai-chat-form" onSubmit={handleAskSubmit}>
                <input
                  type="text"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  placeholder="Ask about this visual…"
                  aria-label="Question"
                />
                <button type="submit" disabled={!askInput.trim() || loading} title="Send">
                  <Send size={15} />
                </button>
              </form>
              {chatHistory && chatHistory.length > 0 && (
                <button type="button" className="bi-ai-chat-clear" onClick={onClearChat}>
                  Clear conversation
                </button>
              )}
            </div>
          )}
        </div>

        {hasSelectedVisual && result && !showChat && (
          <footer className="bi-ai-footer">
            <button type="button" className="bi-ai-foot-btn" onClick={handleCopy}>
              {copied ? <><CheckCheck size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
            <button type="button" className="bi-ai-foot-btn" onClick={handleExport}>
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              className="bi-ai-foot-btn bi-ai-foot-btn--primary"
              onClick={() => onRunTask?.(task)}
              disabled={loading}
            >
              <RefreshCw size={14} /> Regenerate
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
