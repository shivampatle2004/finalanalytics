import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Activity, Loader2, AlertCircle, CheckCircle, Copy, Check } from 'lucide-react';
import { api } from '../services/etlService';
import './nodes/NodeLogPanel.css';

const StatusPill = ({ status }) => {
  const map = {
    success: { color: '#10b981', label: 'Success' },
    failed:  { color: '#ef4444', label: 'Failed'  },
    running: { color: '#3b82f6', label: 'Running' },
    pending: { color: '#f59e0b', label: 'Pending' },
  };
  const s = map[status] || { color: 'var(--text-muted)', label: status || '—' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 7px', borderRadius: '100px',
      background: s.color + '18', color: s.color,
      fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase'
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
};

export function PipelineLogPanel({ pipelineId, nodes = [], isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [nodeFilter, setNodeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [copied, setCopied] = useState(false);
  const terminalRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);
    try {
      const jobsRes = await api.getJobs(pipelineId);
      const jobs = Array.isArray(jobsRes) ? jobsRes : (jobsRes.jobs || []);
      if (jobs.length === 0) {
        setJob(null);
        setLogs([]);
        setLoading(false);
        return;
      }
      const latest = jobs.sort((a, b) =>
        new Date(b.started_at || 0) - new Date(a.started_at || 0)
      )[0];
      setJob(latest);

      const rawLogs = await api.getJobLogs(latest.id).catch(() => []);
      const logsArray = Array.isArray(rawLogs) ? rawLogs : (rawLogs.logs || []);
      setLogs(logsArray.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)));
    } catch (err) {
      setError('Failed to load logs: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    if (isOpen) fetchLogs();
  }, [isOpen, fetchLogs]);

  // Build node options from logs + DAG nodes
  const nodeOptions = React.useMemo(() => {
    const ids = [...new Set(logs.map(l => l.node_id).filter(Boolean))];
    return ids.map(id => {
      const dagNode = nodes.find(n => n.id === id);
      return { id, label: dagNode?.data?.label || id.substring(0, 8) };
    });
  }, [logs, nodes]);

  // Apply filters
  const visibleLogs = React.useMemo(() => {
    return logs.filter(log => {
      const nodeMatch = nodeFilter === 'all' || log.node_id === nodeFilter;
      const levelMatch = levelFilter === 'ALL' || (log.level || 'INFO').toUpperCase() === levelFilter;
      return nodeMatch && levelMatch;
    });
  }, [logs, nodeFilter, levelFilter]);

  // Duration
  const duration = job?.started_at && job?.finished_at
    ? `${((new Date(job.finished_at) - new Date(job.started_at)) / 1000).toFixed(2)}s`
    : job?.status === 'running' ? 'Running…' : '—';

  const startTs = job?.started_at
    ? new Date(job.started_at).toISOString().replace('T', ' ').substring(0, 19)
    : '—';

  const handleCopy = async () => {
    if (visibleLogs.length === 0) return;
    const text = visibleLogs.map(log => {
      const ts = log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '—';
      const level = (log.level || 'INFO').toUpperCase();
      const nodeTag = log.node_id ? `[${log.node_id.substring(0, 8)}]` : '';
      return `${ts} [${level}] ${nodeTag} ${log.message || ''}`.trim();
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const LEVELS = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          style={{
            position: 'fixed', right: 0, top: 50, bottom: 0,
            width: 560, zIndex: 9998,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-surface, #ffffff)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
          }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        >
          {/* Header */}
          <div className="nlp-header">
            <div className="nlp-header-left">
              <div className="nlp-icon-wrap"><FileText size={15} /></div>
              <div>
                <div className="nlp-title">Pipeline Execution Log</div>
                {pipelineId && (
                  <div className="nlp-subtitle">ID: {pipelineId.substring(0, 8)}…</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="nlp-close"
                onClick={handleCopy}
                disabled={visibleLogs.length === 0}
                title="Copy visible logs"
                style={{ opacity: visibleLogs.length === 0 ? 0.4 : 1 }}
              >
                {copied ? <Check size={15} style={{ color: '#10b981' }} /> : <Copy size={15} />}
              </button>
              <button className="nlp-close" onClick={onClose}><X size={18} /></button>
            </div>
          </div>

          {/* Body */}
          <div className="nlp-body">
            {loading ? (
              <div className="nlp-loading">
                <Loader2 size={24} className="nlp-spin" />
                <span>Loading pipeline logs…</span>
              </div>
            ) : error ? (
              <div className="nlp-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            ) : !job ? (
              <div className="nlp-empty-logs">
                <CheckCircle size={18} style={{ color: 'var(--accent)' }} />
                <span>No pipeline executions yet. Run the pipeline to generate logs.</span>
              </div>
            ) : (
              <>
                {/* Pipeline Summary */}
                <section className="nlp-section">
                  <div className="nlp-section-title">
                    <Activity size={13} /> Pipeline Summary
                  </div>
                  <div className="nlp-stats-grid">
                    <div className="nlp-stat">
                      <span>Status</span>
                      <StatusPill status={job.status} />
                    </div>
                    <div className="nlp-stat">
                      <span>Duration</span>
                      <strong className="nlp-mono">{duration}</strong>
                    </div>
                    <div className="nlp-stat">
                      <span>Rows Loaded</span>
                      <strong>{(job.total_rows_loaded || 0).toLocaleString()}</strong>
                    </div>
                    <div className="nlp-stat">
                      <span>Nodes Run</span>
                      <strong>{job.runs?.length ?? '—'}</strong>
                    </div>
                    <div className="nlp-stat">
                      <span>Trigger</span>
                      <strong>{job.trigger_type || 'manual'}</strong>
                    </div>
                    <div className="nlp-stat">
                      <span>Started</span>
                      <strong className="nlp-mono" style={{ fontSize: '0.72rem' }}>{startTs}</strong>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="nlp-error-block">
                      <AlertCircle size={13} />
                      <pre>{job.error_message}</pre>
                    </div>
                  )}
                </section>

                {/* Filters */}
                <section className="nlp-section">
                  {/* Node filter */}
                  {nodeOptions.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Node</span>
                      <select
                        value={nodeFilter}
                        onChange={e => setNodeFilter(e.target.value)}
                        style={{
                          flex: 1, fontSize: '0.72rem', padding: '4px 8px',
                          borderRadius: 6, border: '1px solid var(--border)',
                          background: 'var(--bg-hover)', color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">All Nodes</option>
                        {nodeOptions.map(n => (
                          <option key={n.id} value={n.id}>{n.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Level filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Level</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {LEVELS.map(lvl => (
                        <button
                          key={lvl}
                          onClick={() => setLevelFilter(levelFilter === lvl && lvl !== 'ALL' ? 'ALL' : lvl)}
                          style={{
                            fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px',
                            borderRadius: 100, border: '1px solid var(--border)',
                            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                            background: levelFilter === lvl ? 'var(--accent)' : 'var(--bg-hover)',
                            color: levelFilter === lvl ? '#fff' : 'var(--text-muted)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Log Terminal */}
                <section className="nlp-section" style={{ flex: 1, minHeight: 0 }}>
                  <div className="nlp-section-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={13} /> Log Entries
                    </span>
                    <span className="nlp-log-count">{visibleLogs.length} entries</span>
                  </div>

                  {visibleLogs.length === 0 ? (
                    <div className="nlp-empty-logs">
                      <CheckCircle size={18} style={{ color: 'var(--accent)' }} />
                      <span>
                        {logs.length === 0
                          ? 'No log entries recorded yet. Run the pipeline to generate logs.'
                          : 'No entries match the current filters.'}
                      </span>
                    </div>
                  ) : (
                    <div className="nlp-terminal" ref={terminalRef} style={{ maxHeight: 'none', flex: 1 }}>
                      {visibleLogs.map((log, i) => {
                        const level = (log.level || 'INFO').toUpperCase();
                        const ts = log.timestamp
                          ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)
                          : '—';
                        return (
                          <div key={log.id || i} className={`nlp-log-line nlp-level-${level.toLowerCase()}`}>
                            <span className="nlp-ts">{ts}</span>
                            <span className="nlp-level">[{level}]</span>
                            {log.node_id && (
                              <span className="nlp-node-tag">[{log.node_id.substring(0, 8)}]</span>
                            )}
                            <span className="nlp-msg">{log.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
