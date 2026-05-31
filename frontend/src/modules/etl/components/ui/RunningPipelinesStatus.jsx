import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, StopCircle, CheckCircle, Clock, Zap, X } from 'lucide-react';
import './RunningPipelinesStatus.css';

/* ── Elapsed timer hook ─────────────────────────────────── */
function useElapsed(startedAt) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = elapsed % 60;
  const m = Math.floor(elapsed / 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ── Single running pipeline row ───────────────────────── */
function RunningRow({ pipeline, job, pct, onCancel }) {
  const elapsed = useElapsed(job?.started_at);
  const isRunning = ['running', 'pending'].includes(String(job?.status).toLowerCase());

  return (
    <div className="rps-row">
      {/* Pulsing activity dot */}
      <span className="rps-dot" />

      {/* Pipeline name */}
      <span className="rps-name">{pipeline.name}</span>

      {/* Progress bar */}
      <div className="rps-bar-wrap">
        <motion.div
          className="rps-bar-fill"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="rps-bar-shimmer" />
      </div>

      {/* Pct label */}
      <span className="rps-pct">{pct}%</span>

      {/* Elapsed time */}
      <span className="rps-elapsed">
        <Clock size={11} /> {elapsed}
      </span>

      {/* Status chip */}
      <span className={`rps-status-chip ${String(job?.status).toLowerCase()}`}>
        {String(job?.status).toLowerCase() === 'pending' ? 'Queued' : 'Running'}
      </span>

      {/* Cancel button */}
      {isRunning && (
        <button
          className="rps-cancel-btn"
          onClick={() => onCancel(job)}
          title="Cancel this pipeline run"
        >
          <StopCircle size={13} />
          Cancel
        </button>
      )}
    </div>
  );
}

/* ── Main export ────────────────────────────────────────── */
export function RunningPipelinesStatus({ runningPipelines, lastJobMap, pctMap, onCancel }) {
  const hasAny = runningPipelines.length > 0;
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal when new pipelines start running
  const prevCount = useRef(0);
  useEffect(() => {
    if (runningPipelines.length > prevCount.current) {
      setDismissed(false);
    }
    prevCount.current = runningPipelines.length;
  }, [runningPipelines.length]);

  return (
    <AnimatePresence>
      {hasAny && !dismissed && (
        <motion.div
          className="rps-banner"
          initial={{ opacity: 0, y: -18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        >
          {/* Header */}
          <div className="rps-header">
            <div className="rps-header-left">
              <span className="rps-live-badge">
                <Zap size={11} />
                LIVE
              </span>
              <span className="rps-title">
                <Activity size={14} />
                {runningPipelines.length === 1
                  ? '1 Pipeline Running'
                  : `${runningPipelines.length} Pipelines Running`}
              </span>
            </div>
            <button
              className="rps-dismiss-btn"
              onClick={() => setDismissed(true)}
              title="Dismiss (pipelines still running)"
            >
              <X size={13} />
            </button>
          </div>

          {/* Rows */}
          <div className="rps-rows">
            {runningPipelines.map(pipeline => {
              const job = lastJobMap[pipeline.id];
              const pct = pctMap[pipeline.id] ?? 2;
              return (
                <RunningRow
                  key={pipeline.id}
                  pipeline={pipeline}
                  job={job}
                  pct={pct}
                  onCancel={onCancel}
                />
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
