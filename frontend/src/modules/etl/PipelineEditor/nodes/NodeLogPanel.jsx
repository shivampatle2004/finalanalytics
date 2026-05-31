import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Activity, Clock, CheckCircle, XCircle, Loader2,
  AlertCircle, FileText, Zap, Database
} from 'lucide-react';
import { api } from '../../services/etlService';
import './NodeLogPanel.css';

/* ── Tiny status pill ──────────────────────────────────────── */
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

/* ── Main Panel ─────────────────────────────────────────────── */
export function NodeLogPanel({ pipelineId, nodeId, nodeLabel, onClose }) {
  const [loading, setLoading] = useState(true);
  const [jobLogs, setJobLogs] = useState([]);
  const [nodeRun, setNodeRun] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pipelineId) { setLoading(false); return; }

    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Get all jobs for this pipeline — pick the latest
        const jobsRes = await api.getJobs({ pipeline_id: pipelineId });
        const jobs = (jobsRes.jobs || []).filter(j => j.pipeline_id === pipelineId);

        if (jobs.length === 0) {
          setError('No executions found for this pipeline yet.');
          setLoading(false);
          return;
        }

        // Sort by started_at desc, pick latest
        const latestJob = jobs.sort((a, b) =>
          new Date(b.started_at || 0) - new Date(a.started_at || 0)
        )[0];

        setPipelineStatus(latestJob.status);

        // 2. Get node-level run for this node
        const runs = latestJob.runs || [];
        const run = runs.find(r => r.node_id === nodeId);
        setNodeRun(run || null);

        // 3. Get raw logs filtered to this node
        const rawLogs = await api.getJobLogs(latestJob.id).catch(() => []);
        const logsArray = Array.isArray(rawLogs) ? rawLogs : (rawLogs.logs || []);
        // Show logs for this node, or all if none match
        const nodeFiltered = logsArray.filter(l => !l.node_id || l.node_id === nodeId);
        setJobLogs(nodeFiltered.length > 0 ? nodeFiltered : logsArray);
      } catch (err) {
        setError('Failed to load logs: ' + (err.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [pipelineId, nodeId]);

  const duration = nodeRun?.started_at && nodeRun?.finished_at
    ? `${((new Date(nodeRun.finished_at) - new Date(nodeRun.started_at)) / 1000).toFixed(2)}s`
    : nodeRun?.started_at ? 'Running…' : '—';

  return (
    <AnimatePresence>
      <motion.div
        className="nlp-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="nlp-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="nlp-header">
            <div className="nlp-header-left">
              <div className="nlp-icon-wrap">
                <FileText size={15} />
              </div>
              <div>
                <div className="nlp-title">{nodeLabel || 'Node'} — Execution Log</div>
                <div className="nlp-subtitle">
                  {pipelineId ? `Pipeline: ${pipelineId.substring(0, 12)}…` : 'No pipeline attached'}
                </div>
              </div>
            </div>
            <button className="nlp-close" onClick={onClose}><X size={18} /></button>
          </div>

          {/* ── Body ── */}
          <div className="nlp-body">
            {loading ? (
              <div className="nlp-loading">
                <Loader2 size={24} className="nlp-spin" />
                <span>Loading execution logs…</span>
              </div>
            ) : error ? (
              <div className="nlp-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            ) : (
              <>
                {/* ── Node Run Stats ── */}
                {nodeRun ? (
                  <section className="nlp-section">
                    <div className="nlp-section-title">
                      <Zap size={13} /> Node Run Stats
                    </div>
                    <div className="nlp-stats-grid">
                      <div className="nlp-stat">
                        <span>Status</span>
                        <StatusPill status={nodeRun.status} />
                      </div>
                      <div className="nlp-stat">
                        <span>Rows In</span>
                        <strong>{(nodeRun.rows_in || nodeRun.rows_processed || 0).toLocaleString()}</strong>
                      </div>
                      <div className="nlp-stat">
                        <span>Rows Out</span>
                        <strong>{(nodeRun.rows_out || nodeRun.rows_processed || 0).toLocaleString()}</strong>
                      </div>
                      <div className="nlp-stat">
                        <span>Duration</span>
                        <strong className="nlp-mono">{duration}</strong>
                      </div>
                      <div className="nlp-stat">
                        <span>Node Type</span>
                        <strong>{(nodeRun.node_type || '—').replace('_', ' ')}</strong>
                      </div>
                      <div className="nlp-stat">
                        <span>Pipeline Status</span>
                        <StatusPill status={pipelineStatus} />
                      </div>
                    </div>
                    {nodeRun.error_detail && (
                      <div className="nlp-error-block">
                        <XCircle size={13} />
                        <pre>{nodeRun.error_detail}</pre>
                      </div>
                    )}
                  </section>
                ) : (
                  <div className="nlp-empty-run">
                    <Database size={18} />
                    <span>No run data for this specific node yet.</span>
                  </div>
                )}

                {/* ── Raw Log Terminal ── */}
                <section className="nlp-section">
                  <div className="nlp-section-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={13} /> Raw Execution Log
                    </span>
                    <span className="nlp-log-count">{jobLogs.length} entries</span>
                  </div>

                  {jobLogs.length === 0 ? (
                    <div className="nlp-empty-logs">
                      <CheckCircle size={18} style={{ color: 'var(--accent)' }} />
                      <span>No log entries recorded yet. Run the pipeline to generate logs.</span>
                    </div>
                  ) : (
                    <div className="nlp-terminal">
                      {jobLogs.map((log, i) => {
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
      </motion.div>
    </AnimatePresence>
  );
}
