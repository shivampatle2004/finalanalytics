import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, CheckCircle, XCircle, History } from 'lucide-react';
import './ReportRefreshSettingsModal.css';

const REFRESH_OPTIONS = [
  { value: 'every_5_minutes', label: 'Every 5 Minutes' },
  { value: 'every_15_minutes', label: 'Every 15 Minutes' },
  { value: 'every_30_minutes', label: 'Every 30 Minutes' },
  { value: 'every_1_hour', label: 'Every 1 Hour' },
  { value: 'every_6_hours', label: 'Every 6 Hours' },
  { value: 'every_12_hours', label: 'Every 12 Hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom_cron', label: 'Custom Cron (Advanced)' },
];

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const ReportRefreshSettingsModal = ({
  isOpen,
  onClose,
  reportId,
  resourceType = 'paginated_report',
  userId,
  onRefreshComplete,
}) => {
  const [enabled, setEnabled] = useState(false);
  const [refreshType, setRefreshType] = useState('every_30_minutes');
  const [cronExpression, setCronExpression] = useState('0 */30 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [startAt, setStartAt] = useState('');
  const [timezones, setTimezones] = useState(['UTC']);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('settings');

  const loadData = useCallback(async () => {
    if (!reportId || !isOpen) return;
    setLoading(true);
    setError('');
    try {
      const [schedRes, histRes, tzRes] = await Promise.all([
        fetch(`/analytics/api/refresh/${reportId}/schedule?resource_type=${resourceType}`),
        fetch(`/analytics/api/refresh/${reportId}/history?limit=10`),
        fetch('/analytics/api/refresh/timezones'),
      ]);
      const schedData = await schedRes.json();
      const histData = await histRes.json();
      const tzData = await tzRes.json();

      if (schedData.schedule) {
        const s = schedData.schedule;
        setEnabled(s.enabled);
        setRefreshType(s.refresh_type || 'every_30_minutes');
        setCronExpression(s.cron_expression || '0 */30 * * *');
        setTimezone(s.timezone || 'UTC');
        if (s.start_at) {
          const d = new Date(s.start_at);
          const pad = (n) => String(n).padStart(2, '0');
          setStartAt(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          );
        } else {
          setStartAt('');
        }
      }
      setStats(schedData.stats || histData.stats);
      setHistory(histData.history || []);
      if (tzData.timezones) setTimezones(tzData.timezones);
    } catch (err) {
      setError('Failed to load refresh settings.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [reportId, resourceType, isOpen]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!reportId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        enabled,
        refresh_type: refreshType,
        cron_expression: refreshType === 'custom_cron' ? cronExpression : null,
        timezone,
        start_at: startAt ? new Date(startAt).toISOString() : null,
        resource_type: resourceType,
        created_by: userId ? String(userId) : null,
      };
      const res = await fetch(`/analytics/api/refresh/${reportId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      setStats(data.stats);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!reportId) return;
    setRefreshing(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/analytics/api/refresh/${reportId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: resourceType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Refresh failed');

      const parts = [];
      if (data.live_api_called && data.api_rows_refreshed > 0) {
        parts.push(`${data.api_rows_refreshed} live API rows fetched`);
      } else if (data.api_connection_id) {
        parts.push('WARNING: API was not re-fetched — restart the backend server (uvicorn) and try again');
      }
      if (data.graphs_updated > 0) {
        parts.push(`${data.graphs_updated} chart(s) recomputed`);
      }
      if (data.sample_values) {
        const key = Object.keys(data.sample_values)[0];
        parts.push(`sample ${key}: ${data.sample_values[key].join(', ')}`);
      }
      if (!parts.length && data.records_processed > 0) {
        parts.push(`${data.records_processed} record(s) processed`);
      }
      setSuccessMsg(parts.length ? `Refresh complete: ${parts.join(' · ')}.` : 'Refresh complete.');

      if (typeof onRefreshComplete === 'function') {
        await onRefreshComplete(data);
      }
      await loadData();
    } catch (err) {
      setError(err.message || 'Manual refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="rrs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rrs-modal">
        <div className="rrs-header">
          <div className="rrs-title">
            <RefreshCw size={18} strokeWidth={2.25} className="rrs-title-icon" />
            <div>
              <h2>Refresh Settings</h2>
              <p className="rrs-title-sub">Schedule live API data and chart updates</p>
            </div>
          </div>
          <button type="button" className="rrs-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="rrs-toolbar">
          <div className="rrs-tabs">
            <button
              type="button"
              className={activeTab === 'settings' ? 'active' : ''}
              onClick={() => setActiveTab('settings')}
            >
              Schedule
            </button>
            <button
              type="button"
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => setActiveTab('history')}
            >
              <History size={14} /> History
            </button>
          </div>
          <div className="rrs-enable-row">
            <label className="rrs-switch">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="rrs-switch-track" aria-hidden="true" />
            </label>
            <span className="rrs-enable-label">Auto refresh</span>
          </div>
        </div>

        {loading ? (
          <div className="rrs-loading">Loading...</div>
        ) : (
          <>
            {activeTab === 'settings' && (
              <div className="rrs-body">
                <div className={`rrs-form-section${enabled ? '' : ' is-disabled'}`}>
                  <div className="rrs-form-grid">
                    <div className="rrs-field rrs-field--full">
                      <label>Refresh frequency</label>
                      <select
                        value={refreshType}
                        onChange={(e) => setRefreshType(e.target.value)}
                        disabled={!enabled}
                      >
                        {REFRESH_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {refreshType === 'custom_cron' && (
                      <div className="rrs-field rrs-field--full">
                        <label>Cron expression</label>
                        <input
                          type="text"
                          value={cronExpression}
                          onChange={(e) => setCronExpression(e.target.value)}
                          placeholder="0 */30 * * *"
                          disabled={!enabled}
                        />
                        <span className="rrs-hint">5-field cron: minute hour day month day-of-week</span>
                      </div>
                    )}

                    <div className="rrs-field">
                      <label>Timezone</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        disabled={!enabled}
                      >
                        {timezones.map((tz) => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>

                    <div className="rrs-field">
                      <label>Start (optional)</label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        disabled={!enabled}
                      />
                    </div>
                  </div>
                </div>

                {stats && (
                  <div className="rrs-stats-line">
                    <span className="rrs-stat">
                      <Clock size={12} />
                      Last <em>{formatDateTime(stats.last_refresh_at)}</em>
                    </span>
                    <span className="rrs-stat-sep" aria-hidden="true" />
                    <span className="rrs-stat">
                      <Clock size={12} />
                      Next <em>{formatDateTime(stats.next_refresh_at)}</em>
                    </span>
                    <span className="rrs-stat-sep" aria-hidden="true" />
                    <span className="rrs-stat rrs-stat--ok">
                      <CheckCircle size={12} />
                      {stats.success_count ?? 0} ok
                    </span>
                    <span className="rrs-stat-sep" aria-hidden="true" />
                    <span className="rrs-stat rrs-stat--fail">
                      <XCircle size={12} />
                      {stats.failure_count ?? 0} failed
                    </span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="rrs-body rrs-history">
                {history.length === 0 ? (
                  <p className="rrs-empty">No refresh history yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Status</th>
                        <th>API Rows</th>
                        <th>Charts</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td>{formatDateTime(h.refresh_started_at)}</td>
                          <td>
                            <span className={`rrs-badge rrs-badge-${h.status}`}>{h.status}</span>
                            {h.possibly_stale && (
                              <span className="rrs-stale-hint" title="Too fast — API likely not called. Restart backend."> ⚠</span>
                            )}
                          </td>
                          <td>{h.live_api_called ? (h.api_rows_refreshed ?? h.records_processed ?? '—') : '—'}</td>
                          <td>{h.graphs_updated ?? '—'}</td>
                          <td>
                            {h.duration_sec != null ? `${h.duration_sec.toFixed(1)}s` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {(successMsg || error) && (
          <div className="rrs-alerts">
            {successMsg && <div className="rrs-success">{successMsg}</div>}
            {error && <div className="rrs-error">{error}</div>}
          </div>
        )}

        <div className="rrs-footer">
          <button
            type="button"
            className="rrs-btn-secondary rrs-btn-refresh"
            onClick={handleManualRefresh}
            disabled={refreshing || !reportId}
          >
            <RefreshCw size={14} className={refreshing ? 'rrs-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
          <div className="rrs-footer-right">
            <button type="button" className="rrs-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="rrs-btn-primary"
              onClick={handleSave}
              disabled={saving || !reportId}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportRefreshSettingsModal;
