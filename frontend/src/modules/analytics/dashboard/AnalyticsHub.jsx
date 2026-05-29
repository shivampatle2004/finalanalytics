import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, ExternalLink, FileBarChart, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getGlobalUserId } from '../config/auth';
import { analyticsApiUrl, analyticsFetchJson } from '../config/api';
import './AnalyticsHub.css';

function formatLastViewed(uploadDateTime) {
    if (!uploadDateTime) return '—';
    const parsed = new Date(uploadDateTime.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return uploadDateTime;
    const diffMs = Date.now() - parsed.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return uploadDateTime;
}

const PAGE_SIZE = 10;

function reportDescription(report) {
    const rows = report.recordCount != null ? `${report.recordCount} rows` : null;
    const cols = report.columnCount != null ? `${report.columnCount} cols` : null;
    return [rows, cols].filter(Boolean).join(' · ') || '—';
}

export default function AnalyticsHub() {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);

    const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));

    const paginatedReports = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return reports.slice(start, start + PAGE_SIZE);
    }, [reports, page]);

    useEffect(() => {
        setPage((p) => Math.min(Math.max(1, p), totalPages));
    }, [reports.length, totalPages]);

    const openStudio = useCallback(
        (fileId) => {
            if (fileId) {
                navigate(`/analytics/workspace/${encodeURIComponent(fileId)}`);
                return;
            }
            navigate('/analytics/workspace?view=connections');
        },
        [navigate]
    );

    const userQuery = () => `?user_id=${encodeURIComponent(getGlobalUserId())}`;

    const handleRenameReport = async (report) => {
        const display = (report.fileName || 'Untitled').replace(/\.osa$/i, '');
        const next = window.prompt('Rename report', display);
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed) return;

        try {
            const res = await fetch(analyticsApiUrl(`/files/${encodeURIComponent(report.id)}${userQuery()}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: trimmed }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || err.message || `Rename failed (${res.status})`);
            }
            const data = await res.json();
            setReports((prev) =>
                prev.map((r) => (r.id === report.id ? { ...r, fileName: data.fileName } : r))
            );
        } catch (e) {
            window.alert(e.message || 'Could not rename report');
        }
    };

    const handleDeleteReport = async (report) => {
        const label = (report.fileName || 'Untitled').replace(/\.osa$/i, '');
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

        try {
            const res = await fetch(analyticsApiUrl(`/files/${encodeURIComponent(report.id)}${userQuery()}`), {
                method: 'DELETE',
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || err.message || `Delete failed (${res.status})`);
            }
            setReports((prev) => prev.filter((r) => r.id !== report.id));
        } catch (e) {
            window.alert(e.message || 'Could not delete report');
        }
    };

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const userId = getGlobalUserId();
                const data = await analyticsFetchJson(`/files/user/${userId}`);
                if (cancelled) return;
                setReports(Array.isArray(data) ? data : []);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Failed to load reports');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="analytics-hub-root">
            <header className="ah-header">
                <h1 className="ah-title">
                    <BarChart2 size={22} strokeWidth={2} aria-hidden />
                    All My Reports
                </h1>
                <button type="button" className="ah-btn-open-studio" onClick={() => openStudio()}>
                    <ExternalLink size={16} strokeWidth={2} aria-hidden />
                    Open Studio
                </button>
            </header>

            {error && (
                <p className="ah-error" role="alert">
                    {error}
                </p>
            )}

            <div className="ah-content">
                <div className="ah-reports-table" role="table" aria-label="All my reports">
                    <div className="ah-reports-head" role="row">
                        <span className="ah-col-name" role="columnheader">Report name</span>
                        <span className="ah-col-desc" role="columnheader">Description</span>
                        <span className="ah-col-viewed" role="columnheader">Last viewed</span>
                        <span className="ah-col-action" role="columnheader" aria-hidden />
                    </div>

                    <div className="ah-reports-body" role="rowgroup">
                        {loading && (
                            <p className="ah-loading">Loading reports…</p>
                        )}
                        {!loading && reports.length === 0 && !error && (
                            <p className="ah-empty">No saved reports yet. Open Studio to create one.</p>
                        )}
                        {!loading &&
                            paginatedReports.map((report) => {
                                const name = (report.fileName || 'Untitled').replace(/\.osa$/i, '');
                                return (
                                    <div key={report.id} className="ah-report-row" role="row">
                                        <div className="ah-col-name" role="cell">
                                            <span className="ah-report-icon" aria-hidden>
                                                <FileBarChart size={18} strokeWidth={1.75} />
                                            </span>
                                            <span className="ah-report-name">{name}</span>
                                        </div>
                                        <span className="ah-col-desc ah-report-desc" role="cell">
                                            {reportDescription(report)}
                                        </span>
                                        <span className="ah-col-viewed ah-report-viewed" role="cell">
                                            {formatLastViewed(report.uploadDateTime || report.uploadDate)}
                                        </span>
                                        <div className="ah-col-action" role="cell">
                                            <div className="ah-action-group">
                                                <button
                                                    type="button"
                                                    className="ah-btn-visualize"
                                                    onClick={() => openStudio(report.id)}
                                                >
                                                    <BarChart2 size={14} strokeWidth={2} aria-hidden />
                                                    Visualize
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ah-btn-icon"
                                                    aria-label={`Rename ${name}`}
                                                    title="Rename"
                                                    onClick={() => handleRenameReport(report)}
                                                >
                                                    <Pencil size={15} strokeWidth={2} aria-hidden />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ah-btn-icon ah-btn-icon--danger"
                                                    aria-label={`Delete ${name}`}
                                                    title="Delete"
                                                    onClick={() => handleDeleteReport(report)}
                                                >
                                                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {!loading && reports.length > PAGE_SIZE && (
                    <nav className="ah-pagination" aria-label="Report list pages">
                        <button
                            type="button"
                            className="ah-pagination-btn"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            aria-label="Previous page"
                        >
                            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                        </button>
                        <span className="ah-pagination-meta">
                            Page {page} of {totalPages}
                            <span className="ah-pagination-range">
                                ({(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, reports.length)} of {reports.length})
                            </span>
                        </span>
                        <button
                            type="button"
                            className="ah-pagination-btn"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            aria-label="Next page"
                        >
                            <ChevronRight size={18} strokeWidth={2} aria-hidden />
                        </button>
                    </nav>
                )}
            </div>
        </div>
    );
}

