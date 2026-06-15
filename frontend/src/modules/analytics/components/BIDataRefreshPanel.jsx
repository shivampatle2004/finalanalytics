import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Clock, CheckCircle, XCircle, History, Loader2 } from 'lucide-react';
import dataManagementApi from '../services/dataManagementApi';
import './BIDataRefreshPanel.css';

const REFRESH_OPTIONS = [
  { value: 'every_15_minutes', label: 'Every 15 Minutes' },
  { value: 'every_30_minutes', label: 'Every 30 Minutes' },
  { value: 'every_1_hour', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom_cron', label: 'Custom Cron Expression' },
];

const formatDt = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const BIDataRefreshPanel = ({ isOpen, onClose, fileId, onRefreshComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [refreshType, setRefreshType] = useState('every_30_minutes');
  const [cronExpression, setCronExpression] = useState('0 */30 * * *');
  const [incremental, setIncremental] = useState(false);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState('settings');

  const load = useCallback(async () => {
    if (!isOpen || !fileId) return;
    setLoading(true);
    try {
      const [sched, status, logData] = await Promise.all([
        dataManagementApi.getRefreshSchedule(fileId),
        dataManagementApi.getRefreshStatus(fileId),
        dataManagementApi.getRefreshLogs(fileId, 15),
      ]);
      if (sched.schedule) {
        setEnabled(sched.schedule.enabled);
        setRefreshType(sched.schedule.refresh_type || 'every_30_minutes');
        setCronExpression(sched.schedule.cron_expression || '0 */30 * * *');
        setIncremental(sched.schedule.incremental_enabled || false);
      }
      setStats(status.stats || sched.stats);
      setLogs(logData.logs || status.recent_logs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isOpen, fileId]);

  useEffect(() => { load(); }, [load]);

  const handleRefreshNow = async () => {
    setRefreshing(true);
    setError('');
    try {
      await dataManagementApi.refreshNow(fileId);
      setSuccess('Refresh started in background');
      setTimeout(async () => {
        await load();
        onRefreshComplete?.();
      }, 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await dataManagementApi.saveRefreshSchedule(fileId, {
        enabled,
        refresh_type: refreshType,
        cron_expression: refreshType === 'custom_cron' ? cronExpression : null,
        timezone: 'UTC',
        incremental_enabled: incremental,
      });
      setSuccess('Schedule saved');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bi-refresh-overlay">
      <div className="bi-refresh-panel">
        <header className="bi-refresh-header">
          <RefreshCw size={18} />
          <h2>Refresh Data</h2>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </header>

        {error && <div className="bi-refresh-alert error">{error}</div>}
        {success && <div className="bi-refresh-alert success">{success}</div>}

        <div className="bi-refresh-stats">
          <div className="bi-refresh-stat">
            <Clock size={14} />
            <span>Last: {formatDt(stats?.last_refresh_at)}</span>
          </div>
          <div className="bi-refresh-stat">
            <Clock size={14} />
            <span>Next: {formatDt(stats?.next_refresh_at)}</span>
          </div>
          <div className={`bi-refresh-stat status-${stats?.status || 'never'}`}>
            {stats?.status === 'success' ? <CheckCircle size={14} /> : stats?.status === 'failed' ? <XCircle size={14} /> : <Clock size={14} />}
            <span>Status: {stats?.status || 'never'}</span>
          </div>
        </div>

        <div className="bi-refresh-tabs">
          <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Schedule</button>
          <button type="button" className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>
            <History size={14} /> Logs
          </button>
        </div>

        <div className="bi-refresh-body">
          {loading ? <div className="bi-refresh-loading"><Loader2 size={20} className="spin" /> Loading...</div> : (
            tab === 'settings' ? (
              <>
                <button type="button" className="bi-refresh-now" onClick={handleRefreshNow} disabled={refreshing}>
                  {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                  Refresh Now
                </button>

                <label className="bi-refresh-check">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  Enable scheduled refresh
                </label>

                <label className="bi-refresh-field">
                  Frequency
                  <select value={refreshType} onChange={(e) => setRefreshType(e.target.value)} disabled={!enabled}>
                    {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>

                {refreshType === 'custom_cron' && (
                  <label className="bi-refresh-field">
                    Cron Expression
                    <input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} disabled={!enabled} placeholder="0 */30 * * *" />
                  </label>
                )}

                <label className="bi-refresh-check">
                  <input type="checkbox" checked={incremental} onChange={(e) => setIncremental(e.target.checked)} disabled={!enabled} />
                  Incremental refresh (fetch only new records)
                </label>

                <button type="button" className="bi-refresh-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Schedule'}
                </button>
              </>
            ) : (
              <div className="bi-refresh-logs">
                {logs.length === 0 ? <p>No refresh logs yet.</p> : (
                  <table>
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Records</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id} className={`log-${l.status}`}>
                          <td>{formatDt(l.started_at)}</td>
                          <td>{l.status}</td>
                          <td>{l.refresh_type}</td>
                          <td>{l.records_processed ?? 0}</td>
                          <td className="log-error">{l.error_message || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default BIDataRefreshPanel;
