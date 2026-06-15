import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useGlobalFilters } from '../context/FilterContext';
import { filterRulesToFilterMap, normalizeFilterRules, filterMapHasValues } from '../utils/filterUtils';
import { formatVisualDisplayTitle } from '../utils/visualTitleUtils';

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

const BIFiltersPane = ({
    selectedVisual,
    schema,
    dataset,
    onUpdateVisual,
    onUnlinkCrossFilter,
    isViewOnly = false,
}) => {
    const {
        filters: crossFilters,
        setFilters,
        addFilter,
        removeFilter,
        clearDimensionFilters,
        clearFilters,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
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

    useLayoutEffect(() => {
        const opts = selectedVisual?.options || {};
        setVisualFilters(normalizeFilterRules(opts.filters));
        setPageFilters(normalizeFilterRules(opts.pageFilters));
        setReportFilters(normalizeFilterRules(opts.reportFilters));
    }, [
        selectedVisual?.id,
        selectedVisual?.options,
        selectedVisual?.options?.filters,
        selectedVisual?.options?.pageFilters,
    ]);

    const slicerRulesForApply = useMemo(() => {
        const fromVisual = normalizeFilterRules(selectedVisual?.options?.filters);
        const fromPane = normalizeFilterRules(visualFilters);
        const merged = fromVisual.length > 0 ? fromVisual : fromPane;
        return merged.filter(
            (f) => f?.field && f.operator === 'equals' && f.value != null && String(f.value).trim() !== ''
        );
    }, [selectedVisual?.options?.filters, visualFilters]);

    const visualSlicerEntries = useMemo(() => {
        const map = filterRulesToFilterMap(slicerRulesForApply);
        return Object.entries(map).filter(([, vals]) => Array.isArray(vals) && vals.length > 0);
    }, [slicerRulesForApply]);

    const isCrossFilterSynced =
        reportCrossFilterEnabled
        || filterMapHasValues(crossFilters);

    const hasAnyActiveFilters = useMemo(() => {
        if (isCrossFilterSynced) return true;
        if (normalizeFilterRules(pageFilters).length > 0) return true;
        if (normalizeFilterRules(visualFilters).length > 0) return true;
        return false;
    }, [isCrossFilterSynced, pageFilters, visualFilters]);

    const displayFilterEntries = isCrossFilterSynced ? crossFilterEntries : visualSlicerEntries;

    const rulesFromSlicerEntries = useCallback((entries) => {
        if (!Array.isArray(entries) || entries.length === 0) return [];
        return entries.flatMap(([field, vals]) =>
            (Array.isArray(vals) ? vals : []).map((value) => ({
                field,
                operator: 'equals',
                value: String(value),
            }))
        );
    }, []);

    const syncToVisual = (nextVisualFilters, nextPageFilters = pageFilters, nextReportFilters = reportFilters) => {
        if (!selectedVisual?.id || !onUpdateVisual || isViewOnly) return;
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
        const values = Array.isArray(crossFilters[oldDimension]) ? crossFilters[oldDimension] : [];
        setFilters((prev) => {
            const next = { ...prev };
            delete next[oldDimension];
            const existing = next[newDimension] || [];
            next[newDimension] = [...new Set([...existing, ...values])];
            return next;
        });
    };

    const handleAddCrossFilter = () => {
        if (isViewOnly) return;
        const field = fieldOptions[0];
        if (!field) return;
        if (!isCrossFilterSynced) {
            const distinct = getDistinctValues(dataset, field);
            const next = [
                ...visualFilters,
                { field, operator: 'equals', value: distinct[0] || '' },
            ];
            updateFilterList('visual', next);
            return;
        }
        const distinct = getDistinctValues(dataset, field);
        if (distinct.length > 0) {
            addFilter(field, distinct[0]);
        } else {
            setDimensionValues(field, ['']);
        }
    };

    const hasVisualSlicer = visualSlicerEntries.length > 0 || slicerRulesForApply.length > 0;
    const showUnlinkAllFilter = isCrossFilterSynced;

    const handleUnlinkFilter = useCallback(() => {
        if (onUnlinkCrossFilter) {
            onUnlinkCrossFilter();
        } else {
            const sourceId = crossFilterSourceVisualId;
            clearFilters();
            if (sourceId && onUpdateVisual && selectedVisual?.id === sourceId) {
                onUpdateVisual(sourceId, {
                    options: {
                        ...(selectedVisual.options || {}),
                        filters: [],
                        pageFilters: [],
                    },
                    cached_data: null,
                });
            }
        }
        setVisualFilters([]);
        setPageFilters([]);
    }, [onUnlinkCrossFilter, crossFilterSourceVisualId, clearFilters, onUpdateVisual, selectedVisual]);

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
                Chart clicks instantly filter all visuals on this page.
            </p>

            <div className="bi-cross-filter-actions">
                {showUnlinkAllFilter ? (
                    <button
                        type="button"
                        className="bi-crossfilter-unlink-btn"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleUnlinkFilter();
                        }}
                        title="Remove the filter from all linked visuals on this page"
                    >
                        Unlink all visuals
                    </button>
                ) : null}
                {selectedVisual && !hasVisualSlicer && !isCrossFilterSynced && (
                    <span className="bi-crossfilter-status bi-crossfilter-status--muted">
                        Click a chart value to filter linked visuals
                    </span>
                )}
                {isCrossFilterSynced && (
                    <span className="bi-crossfilter-status">
                        Cross-filter active across linked visuals
                    </span>
                )}
            </div>

            <div className="bi-filter-dropzone bi-filter-dropzone--cross">
                {displayFilterEntries.length === 0 && (
                    <span className="bi-dropzone-empty">No cross-visual filters applied</span>
                )}

                {isCrossFilterSynced && displayFilterEntries.map(([dimension, values]) => {
                    const distinct = getDistinctValues(dataset, dimension);
                    const primaryValue = values[0] ?? '';

                    return (
                        <div key={dimension} className="bi-filter-editor-row">
                            <div className="bi-filter-main-grid">
                                <select
                                    className="bi-filter-select"
                                    value={dimension}
                                    disabled={isViewOnly}
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
                                {!isViewOnly && (
                                <button
                                    type="button"
                                    className="bi-filter-remove-btn"
                                    onClick={() => clearDimensionFilters(dimension)}
                                    title={`Remove ${dimension} filter`}
                                >
                                    <X size={14} />
                                </button>
                                )}
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

                {!isViewOnly && isCrossFilterSynced && (
                    <div className="bi-cross-filter-dropzone-actions">
                        <button
                            type="button"
                            className="bi-filter-add-btn bi-filter-add-btn--cross"
                            disabled={fieldOptions.length === 0}
                            onClick={handleAddCrossFilter}
                        >
                            + Add filter
                        </button>
                        {displayFilterEntries.length > 0 && (
                            <button
                                type="button"
                                className="bi-filter-clear-cross-btn"
                                onClick={handleClearCrossVisualFilters}
                            >
                                Clear cross-visual filters
                            </button>
                        )}
                    </div>
                )}

                {!isViewOnly && !isCrossFilterSynced && (
                    <button
                        type="button"
                        className="bi-filter-add-btn bi-filter-add-btn--cross"
                        disabled={fieldOptions.length === 0 || !selectedVisual}
                        onClick={handleAddCrossFilter}
                    >
                        Add filter
                    </button>
                )}
            </div>
        </div>
    );

    const renderFilterSection = (title, section, filterRules, disabled = false) => {
        const filters = Array.isArray(filterRules) ? filterRules : [];
        return (
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
    };

    return (
        <div className={`bi-pane-view bi-pane-view--filters${isViewOnly ? ' bi-pane-view--view-only' : ''}`}>
            <div className="bi-pane-header bi-pane-header--filters">
                <div className="bi-pane-header__titles">
                    <span className="bi-pane-title">Filters</span>
                    {selectedVisual && (
                        <span className="bi-pane-subtitle" title={formatVisualDisplayTitle(selectedVisual.options?.title, selectedVisual.graph_type)}>
                            {formatVisualDisplayTitle(selectedVisual.options?.title, selectedVisual.graph_type)}
                        </span>
                    )}
                </div>
                {hasAnyActiveFilters && !isViewOnly && (
                    <button
                        type="button"
                        className="bi-crossfilter-unlink-btn bi-filters-pane-unlink-btn"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleUnlinkFilter();
                        }}
                        title="Remove all filters on this page"
                    >
                        Unlink
                    </button>
                )}
            </div>

            <div className="bi-pane-scroll">
                {renderCrossVisualFilterSection()}
                {renderFilterSection('Filters on this visual', 'visual', visualFilters, !selectedVisual || isViewOnly)}
                {renderFilterSection('Filters on this page', 'page', pageFilters, !selectedVisual || isViewOnly)}
                {renderFilterSection('Filters on all pages', 'report', reportFilters, !selectedVisual || isViewOnly)}
            </div>
        </div>
    );
};

export default BIFiltersPane;
