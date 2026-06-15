import React, { useState, useCallback } from 'react';
import {
    X, BarChart2, LayoutTemplate, Table, TrendingUp, AlertTriangle,
    SlidersHorizontal, ChevronDown, ChevronRight
} from 'lucide-react';
import './ReportVisualConfigPanel.css';

// ─── Default config factory ───────────────────────────────────────────────────
const DEFAULT_REPORT_CONFIG = {
    mode: 'current_state', // current_state | top_n | bottom_n | custom_filter | date_range
    topN: 20,
    bottomN: 10,
    groupRemaining: true,
    sortOrder: 'desc',          // asc | desc
    pageLayout: 'full_page',     // full_page | half_page | chart_table | kpi_chart
    oneChartPerPage: true,
    includeDataTable: false,
    includeSummaryMetrics: false,
    landscapeMode: false,
    categoryThreshold: 20,
};

// ─── Layout thumbnail card ────────────────────────────────────────────────────
function LayoutThumb({ id, label, active, onClick, children }) {
    return (
        <button
            type="button"
            className={`rvc-layout-thumb${active ? ' active' : ''}`}
            onClick={() => onClick(id)}
            title={label}
        >
            <div className="rvc-layout-icon">{children}</div>
            <span className="rvc-layout-label">{label}</span>
        </button>
    );
}

// ─── Section collapsible ──────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rvc-section">
            <button type="button" className="rvc-section-header" onClick={() => setOpen(o => !o)}>
                <span className="rvc-section-icon">{icon}</span>
                <span className="rvc-section-title">{title}</span>
                <span className="rvc-section-chevron">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </button>
            {open && <div className="rvc-section-body">{children}</div>}
        </div>
    );
}

// ─── Category threshold warning ───────────────────────────────────────────────
function CategoryWarning({ categoryCount, threshold }) {
    if (!categoryCount || categoryCount <= threshold) return null;
    return (
        <div className="rvc-warning">
            <AlertTriangle size={14} className="rvc-warning-icon" />
            <div>
                <strong>Too many categories for a printable chart.</strong>
                <br />
                <span>{categoryCount} categories detected — threshold is {threshold}.</span>
                <br />
                <span>Select Top N, Bottom N, or Group Remaining to keep the chart readable.</span>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * ReportVisualConfigPanel
 *
 * A right-side panel that lets the user configure per-visual report settings.
 *
 * Props:
 *   visual        — the report element { id, title, visualType, graphDefinition, reportConfig }
 *   categoryCount — optional: detected category count (for threshold warning)
 *   onSave        — (updatedConfig) → void
 *   onClose       — () → void
 */
const ReportVisualConfigPanel = ({ visual, categoryCount, onSave, onClose }) => {
    const [cfg, setCfg] = useState(() => ({
        ...DEFAULT_REPORT_CONFIG,
        ...(visual?.reportConfig || {}),
    }));

    const set = useCallback((key, val) => setCfg(prev => ({ ...prev, [key]: val })), []);

    const title = visual?.title || 'Untitled Visual';
    const visualType = (visual?.visualType || 'bar').toLowerCase();
    const threshold = cfg.categoryThreshold || 20;

    const handleSave = () => onSave(cfg);

    // ── Mode helper ─────────────────────────────────────────────────────────────
    const renderModeBtn = (id, label) => (
        <button
            key={id}
            type="button"
            className={`rvc-mode-btn${cfg.mode === id ? ' active' : ''}`}
            onClick={() => set('mode', id)}
        >
            {label}
        </button>
    );

    return (
        <div className="rvc-panel">
            {/* ── Header ── */}
            <div className="rvc-header">
                <div className="rvc-header-left">
                    <SlidersHorizontal size={16} />
                    <div>
                        <div className="rvc-header-title">Report Configuration</div>
                        <div className="rvc-header-sub">{title}</div>
                    </div>
                </div>
                <button type="button" className="rvc-close" onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="rvc-body">

                {/* Category warning */}
                <CategoryWarning categoryCount={categoryCount} threshold={threshold} />

                {/* ── 1. View Mode ── */}
                <Section title="Data Mode" icon={<TrendingUp size={14} />}>
                    <p className="rvc-hint">
                        Choose how data is selected for this visual in the report.
                    </p>
                    <div className="rvc-mode-grid">
                        {renderModeBtn('current_state', 'Current State')}
                        {renderModeBtn('top_n', 'Top N')}
                        {renderModeBtn('bottom_n', 'Bottom N')}
                        {renderModeBtn('date_range', 'Date Range')}
                        {renderModeBtn('custom_filter', 'Custom Filter')}
                    </div>

                    {/* Top N settings */}
                    {cfg.mode === 'top_n' && (
                        <div className="rvc-sub-config">
                            <label className="rvc-label">Show Top
                                <input
                                    type="number"
                                    className="rvc-num-input"
                                    value={cfg.topN}
                                    min={1} max={200}
                                    onChange={e => set('topN', parseInt(e.target.value, 10) || 10)}
                                />
                                categories
                            </label>
                            <label className="rvc-checkbox">
                                <input type="checkbox" checked={cfg.groupRemaining}
                                    onChange={e => set('groupRemaining', e.target.checked)} />
                                <span>Group remaining into "Others"</span>
                            </label>
                        </div>
                    )}

                    {/* Bottom N settings */}
                    {cfg.mode === 'bottom_n' && (
                        <div className="rvc-sub-config">
                            <label className="rvc-label">Show Bottom
                                <input
                                    type="number"
                                    className="rvc-num-input"
                                    value={cfg.bottomN}
                                    min={1} max={200}
                                    onChange={e => set('bottomN', parseInt(e.target.value, 10) || 10)}
                                />
                                categories
                            </label>
                        </div>
                    )}

                    {/* Date Range settings */}
                    {cfg.mode === 'date_range' && (
                        <div className="rvc-sub-config">
                            <label className="rvc-label">Date Field</label>
                            <input
                                type="text"
                                className="rvc-text-input"
                                placeholder="e.g. order_date"
                                value={cfg.dateRange?.field || ''}
                                onChange={e => set('dateRange', { ...(cfg.dateRange || {}), field: e.target.value })}
                            />
                            <div className="rvc-date-row">
                                <div>
                                    <label className="rvc-label">From</label>
                                    <input type="date" className="rvc-text-input"
                                        value={cfg.dateRange?.start || ''}
                                        onChange={e => set('dateRange', { ...(cfg.dateRange || {}), start: e.target.value })} />
                                </div>
                                <div>
                                    <label className="rvc-label">To</label>
                                    <input type="date" className="rvc-text-input"
                                        value={cfg.dateRange?.end || ''}
                                        onChange={e => set('dateRange', { ...(cfg.dateRange || {}), end: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sort Order */}
                    {visualType !== 'pie' && visualType !== 'donut' && (
                        <div className="rvc-field">
                            <label className="rvc-label">Sort Order</label>
                            <div className="rvc-mode-grid">
                                <button type="button"
                                    className={`rvc-mode-btn${cfg.sortOrder === 'desc' ? ' active' : ''}`}
                                    onClick={() => set('sortOrder', 'desc')}>
                                    Descending (Z→A)
                                </button>
                                <button type="button"
                                    className={`rvc-mode-btn${cfg.sortOrder === 'asc' ? ' active' : ''}`}
                                    onClick={() => set('sortOrder', 'asc')}>
                                    Ascending (A→Z)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Category threshold */}
                    <div className="rvc-field">
                        <label className="rvc-label" htmlFor="rvc-threshold">
                            Category threshold
                            <span className="rvc-label-hint"> (auto-limit above this count)</span>
                        </label>
                        <input
                            id="rvc-threshold"
                            type="number"
                            className="rvc-num-input"
                            value={cfg.categoryThreshold}
                            min={5} max={500}
                            onChange={e => set('categoryThreshold', parseInt(e.target.value, 10) || 20)}
                        />
                    </div>
                </Section>

                {/* ── 2. Page Layout ── */}
                <Section title="Page Layout" icon={<LayoutTemplate size={14} />}>
                    <div className="rvc-layout-grid">
                        <LayoutThumb id="full_page" label="Full Page" active={cfg.pageLayout === 'full_page'} onClick={v => set('pageLayout', v)}>
                            <div className="rvc-thumb-full" />
                        </LayoutThumb>
                        <LayoutThumb id="half_page" label="Half Page" active={cfg.pageLayout === 'half_page'} onClick={v => set('pageLayout', v)}>
                            <div className="rvc-thumb-half" />
                        </LayoutThumb>
                        <LayoutThumb id="chart_table" label="Chart + Table" active={cfg.pageLayout === 'chart_table'} onClick={v => set('pageLayout', v)}>
                            <div className="rvc-thumb-chart-table" />
                        </LayoutThumb>
                        <LayoutThumb id="kpi_chart" label="KPI + Chart" active={cfg.pageLayout === 'kpi_chart'} onClick={v => set('pageLayout', v)}>
                            <div className="rvc-thumb-kpi" />
                        </LayoutThumb>
                    </div>

                    <div className="rvc-toggles">
                        <label className="rvc-checkbox">
                            <input type="checkbox" checked={cfg.oneChartPerPage}
                                onChange={e => set('oneChartPerPage', e.target.checked)} />
                            <span>One chart per page</span>
                        </label>
                        <label className="rvc-checkbox">
                            <input type="checkbox" checked={cfg.landscapeMode}
                                onChange={e => set('landscapeMode', e.target.checked)} />
                            <span>Landscape mode</span>
                        </label>
                    </div>
                </Section>

                {/* ── 3. Additional Content ── */}
                <Section title="Additional Content" icon={<Table size={14} />} defaultOpen={false}>
                    <div className="rvc-toggles">
                        <label className="rvc-checkbox">
                            <input type="checkbox" checked={cfg.includeDataTable}
                                onChange={e => set('includeDataTable', e.target.checked)} />
                            <span>Include data table below chart</span>
                        </label>
                        <label className="rvc-checkbox">
                            <input type="checkbox" checked={cfg.includeSummaryMetrics}
                                onChange={e => set('includeSummaryMetrics', e.target.checked)} />
                            <span>Include KPI summary metrics</span>
                        </label>
                    </div>
                </Section>

                {/* ── 4. Visual State Preview ── */}
                {visual?.graphDefinition?.options && (
                    <Section title="Captured Visual State" icon={<BarChart2 size={14} />} defaultOpen={false}>
                        <div className="rvc-state-preview">
                            {visual.graphDefinition.options.filters?.length > 0 && (
                                <div className="rvc-state-row">
                                    <span className="rvc-state-key">Filters</span>
                                    <span className="rvc-state-val">
                                        {visual.graphDefinition.options.filters.length} rule(s) active
                                    </span>
                                </div>
                            )}
                            {visual.graphDefinition.options.drillPath?.length > 0 && (
                                <div className="rvc-state-row">
                                    <span className="rvc-state-key">Drill State</span>
                                    <span className="rvc-state-val">
                                        {visual.graphDefinition.options.drillPath.join(' → ')}
                                    </span>
                                </div>
                            )}
                            {visual.graphDefinition.options.dimension_fields?.length > 0 && (
                                <div className="rvc-state-row">
                                    <span className="rvc-state-key">Dimensions</span>
                                    <span className="rvc-state-val">
                                        {visual.graphDefinition.options.dimension_fields.join(', ')}
                                    </span>
                                </div>
                            )}
                            {visual.graphDefinition.options.measure_fields?.length > 0 && (
                                <div className="rvc-state-row">
                                    <span className="rvc-state-key">Measures</span>
                                    <span className="rvc-state-val">
                                        {visual.graphDefinition.options.measure_fields
                                            .map(m => `${m.aggregation}(${m.column})`)
                                            .join(', ')}
                                    </span>
                                </div>
                            )}
                            {!visual.graphDefinition.options.filters?.length &&
                                !visual.graphDefinition.options.drillPath?.length &&
                                !visual.graphDefinition.options.dimension_fields?.length && (
                                    <p className="rvc-hint" style={{ marginBottom: 0 }}>
                                        Current dashboard state will be used exactly as-is.
                                    </p>
                                )}
                        </div>
                    </Section>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="rvc-footer">
                <button type="button" className="rvc-btn rvc-btn-cancel" onClick={onClose}>Cancel</button>
                <button type="button" className="rvc-btn rvc-btn-save" onClick={handleSave}>Apply Configuration</button>
            </div>
        </div>
    );
};

export default ReportVisualConfigPanel;
