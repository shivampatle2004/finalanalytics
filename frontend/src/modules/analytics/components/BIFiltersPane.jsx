import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useGlobalFilters } from '../context/FilterContext';

const EMPTY_FILTER = { field: '', operator: 'equals', value: '' };

const getDistinctValues = (dataset, field) => {
    if (!field || !dataset?.rows || !Array.isArray(dataset.rows)) return [];
    const seen = new Set();
    for (const row of dataset.rows) {
        const val = row[field];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            seen.add(String(val));
        }
    }
    return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const BIFiltersPane = ({ selectedVisual, schema, dataset, onUpdateVisual }) => {
    const {
        filters: crossFilters,
        setFilters,
        addFilter,
        removeFilter,
        clearDimensionFilters,
        clearFilters,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
        applyReportCrossFilter,
        clearReportCrossFilter,
    } = useGlobalFilters();

    const fieldOptions = useMemo(
        () => (Array.isArray(schema) ? schema.map((s) => s?.column_name).filter(Boolean) : []),
        [schema]
    );

    const crossFilterEntries = useMemo(
        () =>
            Object.entries(crossFilters || {}).filter(
                ([, vals]) => Array.isArray(vals) && vals.length > 0
            ),
        [crossFilters]
    );

    const [visualFilters, setVisualFilters] = useState([]);
    const [pageFilters, setPageFilters] = useState([]);
    const [reportFilters, setReportFilters] = useState([]);

    const normalizeFilterRules = (list) =>
        (Array.isArray(list) ? list : []).filter(
            (f) => f?.field && f?.operator && f.operator !== 'all'
        );

    useEffect(() => {
        const opts = selectedVisual?.options || {};
        setVisualFilters(normalizeFilterRules(opts.filters));
        setPageFilters(normalizeFilterRules(opts.pageFilters));
        setReportFilters(normalizeFilterRules(opts.reportFilters));
    }, [selectedVisual?.id, selectedVisual?.options, selectedVisual?.options?.filters]);

    const slicerRulesForApply = useMemo(() => {
        const fromVisual = normalizeFilterRules(selectedVisual?.options?.filters);
        return fromVisual.length > 0 ? fromVisual : normalizeFilterRules(visualFilters);
    }, [selectedVisual?.options?.filters, visualFilters]);

    const syncToVisual = (nextVisualFilters, nextPageFilters = pageFilters, nextReportFilters = reportFilters) => {
        if (!selectedVisual?.id || !onUpdateVisual) return;
        onUpdateVisual(selectedVisual.id, {
            options: {
                ...(selectedVisual.options || {}),
                filters: nextVisualFilters,
                pageFilters: nextPageFilters,
                reportFilters: nextReportFilters,
            },
        });
    };

    const updateFilterList = (section, nextList) => {
        if (section === 'visual') {
            setVisualFilters(nextList);
            syncToVisual(nextList, pageFilters, reportFilters);
        } else if (section === 'page') {
            setPageFilters(nextList);
            syncToVisual(visualFilters, nextList, reportFilters);
        } else {
            setReportFilters(nextList);
            syncToVisual(visualFilters, pageFilters, nextList);
        }
    };

    const setDimensionValues = (dimension, values) => {
        setFilters((prev) => {
            const next = { ...prev };
            const cleaned = (values || []).filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
            if (cleaned.length === 0) {
                delete next[dimension];
            } else {
                next[dimension] = cleaned;
            }
            return next;
        });
    };

    const renameCrossFilterDimension = (oldDimension, newDimension) => {
        if (!oldDimension || !newDimension || oldDimension === newDimension) return;
        const values = crossFilters[oldDimension] || [];
        setFilters((prev) => {
            const next = { ...prev };
            delete next[oldDimension];
            const existing = next[newDimension] || [];
            next[newDimension] = [...new Set([...existing, ...values])];
            return next;
        });
    };

    const handleAddCrossFilter = () => {
        const field = fieldOptions[0];
        if (!field) return;
        const distinct = getDistinctValues(dataset, field);
        if (distinct.length > 0) {
            addFilter(field, distinct[0]);
        } else {
            setDimensionValues(field, ['']);
        }
    };

    const hasVisualSlicer = slicerRulesForApply.some(
        (f) => f?.field && f.operator === 'equals' && f.value != null && String(f.value).trim() !== ''
    );
    const isCrossFilterSource =
        Boolean(selectedVisual?.id) && crossFilterSourceVisualId === selectedVisual.id;
    const canApplyToAll =
        Boolean(selectedVisual?.id) && hasVisualSlicer && !isCrossFilterSource && !reportCrossFilterEnabled;

    const handleUnlinkAllVisuals = () => {
        const sourceId = crossFilterSourceVisualId;
        clearReportCrossFilter();
        if (sourceId && onUpdateVisual && selectedVisual?.id === sourceId) {
            onUpdateVisual(sourceId, {
                options: {
                    ...(selectedVisual.options || {}),
                    filters: [],
                },
            });
        }
    };

    const handleClearCrossVisualFilters = () => {
        const sourceId = crossFilterSourceVisualId;
        clearFilters();
        if (sourceId && onUpdateVisual && selectedVisual?.id === sourceId) {
            onUpdateVisual(sourceId, {
                options: {
                    ...(selectedVisual.options || {}),
                    filters: [],
                },
            });
        }
    };

    const renderCrossVisualFilterSection = () => (
        <div className="bi-pane-section bi-cross-filters-section">
            <div className="bi-section-subtitle">Cross-visual filters (drill-down &amp; selection)</div>
            <p className="bi-cross-filters-hint">
                Chart clicks filter the selected visual only. Use the button below to sync that filter to every chart on the page.
            </p>
            <div className="bi-cross-filter-actions">
                {canApplyToAll && (
                    <button
                        type="button"
                        className="bi-crossfilter-apply-btn"
                        onClick={() => {
                            if (!slicerRulesForApply.length) return;
                            applyReportCrossFilter(selectedVisual.id, slicerRulesForApply);
                        }}
                        title="Apply this visual's filter to all other charts"
                    >
                        Apply to all visuals
                    </button>
                )}
                {isCrossFilterSource && (
                    <button
                        type="button"
                        className="bi-crossfilter-unlink-btn"
                        onClick={handleUnlinkAllVisuals}
                        title="Stop filtering other charts and restore the source chart"
                    >
                        Unlink all visuals
                    </button>
                )}
                {reportCrossFilterEnabled && !isCrossFilterSource && (
                    <span className="bi-crossfilter-status">Another visual is filtering the report</span>
                )}
                {selectedVisual && !hasVisualSlicer && !reportCrossFilterEnabled && (
                    <span className="bi-crossfilter-status bi-crossfilter-status--muted">
                        Select a value on the chart to enable cross-filter
                    </span>
                )}
            </div>
            <div className="bi-filter-dropzone">
                {crossFilterEntries.length === 0 && (
                    <span className="bi-dropzone-empty">No cross-visual filters applied</span>
                )}

                {crossFilterEntries.map(([dimension, values]) => {
                    const distinct = getDistinctValues(dataset, dimension);
                    const primaryValue = values[0] ?? '';

                    return (
                        <div key={dimension} className="bi-filter-editor-row">
                            <div className="bi-filter-main-grid">
                                <select
                                    className="bi-filter-select"
                                    value={dimension}
                                    onChange={(e) => renameCrossFilterDimension(dimension, e.target.value)}
                                >
                                    {fieldOptions.map((field) => (
                                        <option key={field} value={field}>
                                            {field}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="bi-filter-select"
                                    value="equals"
                                    disabled
                                    title="Cross-visual filters use equals matching"
                                >
                                    <option value="equals">Equals</option>
                                </select>
                                {distinct.length > 0 ? (
                                    <select
                                        className="bi-filter-select"
                                        value={primaryValue}
                                        onChange={(e) => setDimensionValues(dimension, [e.target.value])}
                                    >
                                        {distinct.map((val) => (
                                            <option key={val} value={val}>
                                                {val}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="bi-filter-input"
                                        type="text"
                                        value={primaryValue}
                                        placeholder="Value"
                                        onChange={(e) => setDimensionValues(dimension, [e.target.value])}
                                    />
                                )}
                                <button
                                    type="button"
                                    className="bi-filter-remove-btn"
                                    onClick={() => clearDimensionFilters(dimension)}
                                    title={`Remove ${dimension} filter`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            {values.length > 1 && (
                                <div className="bi-cross-filter-multi">
                                    {values.map((val) => (
                                        <span key={val} className="bi-cross-filter-chip">
                                            {val}
                                            <button
                                                type="button"
                                                className="bi-cross-filter-chip-remove"
                                                onClick={() => removeFilter(dimension, val)}
                                                title="Remove value"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    type="button"
                    className="bi-filter-add-btn"
                    disabled={fieldOptions.length === 0}
                    onClick={handleAddCrossFilter}
                >
                    Add filter
                </button>
                {crossFilterEntries.length > 0 && (
                    <button
                        type="button"
                        className="bi-filter-clear-cross-btn"
                        onClick={handleClearCrossVisualFilters}
                    >
                        Clear cross-visual filters
                    </button>
                )}
            </div>
        </div>
    );

    const renderFilterSection = (title, section, filters, disabled = false) => (
        <div className="bi-pane-section">
            <div className="bi-section-subtitle">{title}</div>
            <div className="bi-filter-dropzone">
                {filters.length === 0 && (
                    <span className="bi-dropzone-empty">{disabled ? 'Select a visual to add filters' : 'No filters applied'}</span>
                )}

                {filters.map((f, idx) => {
                    const distinct = getDistinctValues(dataset, f.field);
                    const useValueSelect =
                        (f.operator === 'equals' || f.operator === 'contains') && distinct.length > 0;

                    return (
                    <div key={`${section}-${idx}`} className="bi-filter-editor-row">
                        <div className="bi-filter-main-grid">
                            <select
                                className="bi-filter-select"
                                value={f.field || ''}
                                disabled={disabled}
                                onChange={(e) => {
                                    const next = [...filters];
                                    next[idx] = { ...next[idx], field: e.target.value, value: '' };
                                    updateFilterList(section, next);
                                }}
                            >
                                <option value="">Field</option>
                                {fieldOptions.map((field) => (
                                    <option key={field} value={field}>
                                        {field}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="bi-filter-select"
                                value={f.operator || 'all'}
                                disabled={disabled}
                                onChange={(e) => {
                                    const next = [...filters];
                                    next[idx] = { ...next[idx], operator: e.target.value };
                                    updateFilterList(section, next);
                                }}
                            >
                                <option value="all">All</option>
                                <option value="equals">Equals</option>
                                <option value="contains">Contains</option>
                                <option value="gt">Greater than</option>
                                <option value="lt">Less than</option>
                            </select>
                            {useValueSelect ? (
                                <select
                                    className="bi-filter-select"
                                    value={f.value ?? ''}
                                    disabled={disabled}
                                    onChange={(e) => {
                                        const next = [...filters];
                                        next[idx] = { ...next[idx], value: e.target.value };
                                        updateFilterList(section, next);
                                    }}
                                >
                                    <option value="">Value</option>
                                    {distinct.map((val) => (
                                        <option key={val} value={val}>
                                            {val}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className="bi-filter-input"
                                    type="text"
                                    value={f.value ?? ''}
                                    disabled={disabled || f.operator === 'all'}
                                    placeholder="Value"
                                    onChange={(e) => {
                                        const next = [...filters];
                                        next[idx] = { ...next[idx], value: e.target.value };
                                        updateFilterList(section, next);
                                    }}
                                />
                            )}
                            <button
                                type="button"
                                className="bi-filter-remove-btn"
                                disabled={disabled}
                                onClick={() => updateFilterList(section, filters.filter((_, i) => i !== idx))}
                                title="Remove filter"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    );
                })}
                <button
                    type="button"
                    className="bi-filter-add-btn"
                    disabled={disabled}
                    onClick={() => updateFilterList(section, [...filters, {
                        field: fieldOptions[0] || '',
                        operator: 'equals',
                        value: '',
                    }])}
                >
                    Add filter
                </button>
            </div>
        </div>
    );

    return (
        <div className="bi-pane-view">
            <div className="bi-pane-header">
                <span className="bi-pane-title">Filters</span>
                {selectedVisual && (
                    <span className="bi-pane-subtitle" title={selectedVisual.options?.title || selectedVisual.graph_type}>
                        {selectedVisual.options?.title || selectedVisual.graph_type || 'Visual'}
                    </span>
                )}
            </div>

            <div className="bi-pane-scroll">
                {renderCrossVisualFilterSection()}
                {renderFilterSection('Filters on this visual', 'visual', visualFilters, !selectedVisual)}
                {renderFilterSection('Filters on this page', 'page', pageFilters, !selectedVisual)}
                {renderFilterSection('Filters on all pages', 'report', reportFilters, !selectedVisual)}
            </div>
        </div>
    );
};

export default BIFiltersPane;
