import React, { useEffect, useMemo, useState } from 'react';
import './BIVisualizationsPane.css';
import {
    AlignLeft, BarChart3, Layers, LineChart, TrendingUp, PieChart, CircleDashed,
    LayoutGrid, ScatterChart, ArrowDownRight, Filter, Radar, Aperture, Compass,
    Hash, Grid, Circle, Sliders, Share2, Map as MapIcon, Sun, Boxes, Layout, Table, BarChart, CreditCard,
    Gauge, GitCommit, GitCompare, Copy, ChevronDown, Palette, Settings2, Code,
    AlertTriangle, SlidersHorizontal, Maximize2, Plus, Trash2, RotateCcw, Tag
} from 'lucide-react';
import { formatVisualDisplayTitle } from '../utils/visualTitleUtils';
import useVisualRegistryStore from '../store/visualRegistryStore';
import BIVisualGeneralPane from './BIVisualGeneralPane';
import BITableFormatSection from './BITableFormatSection';
import { VIBRANT_PALETTE } from '../constants/chartPalette';
import { DEFAULT_TABLE_STYLE, mergeTableStyle } from '../utils/tableStyleUtils';

const COLOR_OVERRIDE_KEYS = ['mainColor', 'positiveColor', 'negativeColor', 'bgColor', 'noFill'];

const hasCustomColors = (graph) => {
    const opts = graph?.options || {};
    return !!(opts.mainColor || opts.positiveColor || opts.negativeColor || opts.bgColor || opts.noFill);
};

const BIVisualizationsPane = ({
    selectedVisual,
    onUpdateVisual,
    onAddVisual,
    onDeleteVisual,
    onAddToReport,
    onExpandVisual,
    onResetVisualColors,
    schema,
    dataset,
    isFieldsRefreshing = false,
    reportNoFill = false,
    onApplyReportNoFill,
    onApplyReportBackgroundFill,
    onApplyReportBackgroundReset,
    isViewOnly = false,
    measures = []
}) => {
    const [viewMode, setViewMode] = useState('build'); // 'build', 'format', 'general'
    const [isSelectorCollapsed, setIsSelectorCollapsed] = useState(false);
    const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);

    const { installedVisuals } = useVisualRegistryStore();

    const visualTypes = useMemo(() => {
        const baseVisuals = [
            { type: 'bar', icon: <AlignLeft size={13} />, label: 'Bar' },
            { type: 'column', icon: <BarChart3 size={13} />, label: 'Column' },
            { type: 'line', icon: <LineChart size={13} />, label: 'Line' },
            { type: 'step', icon: <GitCommit size={13} />, label: 'Step Line' },
            { type: 'donut', icon: <CircleDashed size={13} />, label: 'Donut' },
            { type: 'pie', icon: <PieChart size={13} />, label: 'Pie' },
            { type: 'stackedColumn', icon: <Layers size={13} />, label: 'Stacked Column' },
            { type: 'scatter', icon: <ScatterChart size={13} />, label: 'Scatter' },
            { type: 'area', icon: <TrendingUp size={13} />, label: 'Area' },
            { type: 'radialBar', icon: <Aperture size={13} />, label: 'Radial Bar' },
            { type: 'funnel', icon: <Filter size={13} />, label: 'Funnel' },
            { type: 'waterfall', icon: <ArrowDownRight size={13} />, label: 'Waterfall' },
            { type: 'gauge', icon: <Gauge size={13} />, label: 'Gauge' },
            { type: 'kpiCard', icon: <Hash size={13} />, label: 'KPI Card' },
            { type: 'metricCard', icon: <CreditCard size={13} />, label: 'Metric card' },
            { type: 'table', icon: <Table size={13} />, label: 'Table' },
            { type: 'bubble', icon: <Circle size={13} />, label: 'Bubble' },
            { type: 'polarArea', icon: <Compass size={13} />, label: 'Polar Area' },
            { type: 'bullet', icon: <Sliders size={13} />, label: 'Bullet' },
            { type: 'map', icon: <MapIcon size={13} />, label: 'Map' },
            { type: 'sunburst', icon: <Sun size={13} />, label: 'Sunburst' },
            { type: 'sankey', icon: <Share2 size={13} />, label: 'Sankey' },
            { type: 'treemap', icon: <LayoutGrid size={13} />, label: 'Treemap' },
            { type: 'heatmap', icon: <Grid size={13} />, label: 'Heatmap' },
            { type: 'histogram', icon: <BarChart size={13} />, label: 'Histogram' },
            { type: 'radar', icon: <Radar size={13} />, label: 'Radar' },
            { type: 'boxPlot', icon: <Boxes size={13} />, label: 'Box Plot' },
            { type: 'composed', icon: <Layout size={13} />, label: 'Composed' },
            { type: 'rangeBar', icon: <GitCompare size={13} />, label: 'Range Bar' },
            { type: 'combination', icon: <Copy size={13} />, label: 'Combination' },
        ];
        
        const customs = installedVisuals.map(v => ({
            type: v.id,
            icon: v.icon ? <img src={v.icon} style={{ width: 13, height: 13, objectFit: 'contain' }} alt={v.name} /> : <Code size={13} />,
            label: v.name
        }));
        
        return [...baseVisuals, ...customs];
    }, [installedVisuals]);

    const currentOptions = selectedVisual?.options || {};
    const isDefaultBackground = !reportNoFill && !currentOptions.bgColor && !currentOptions.noFill;
    const AGGREGATION_OPTIONS = ['NONE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];

    /** Phone / ID-style columns should not default to SUM. */
    const suggestAggregationForColumn = (columnName) => {
        if (!columnName) return 'SUM';
        const n = String(columnName).toLowerCase();
        if (
            /phone|mobile|fax|zip|postal|ssn|account/.test(n)
            || /(^|_)id$/.test(n)
            || /customer_id|car_id|dealer_no/.test(n)
        ) {
            return 'COUNT';
        }
        return 'SUM';
    };

    const schemaTypeMap = useMemo(() => {
        const map = new Map();
        (schema || []).forEach((col) => {
            const name = col?.column_name || col?.name;
            if (!name) return;
            const dtype = String(col?.data_type ?? col?.type ?? '').toLowerCase();
            map.set(name, dtype);
        });
        return map;
    }, [schema]);

    const getColumnType = (columnName) => {
        if (!columnName) return '';
        return schemaTypeMap.get(columnName) || '';
    };

    const numericGuessMap = useMemo(() => {
        const map = new Map();
        const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
        if (!rows.length) return map;

        const fields = (schema || []).map((c) => c?.column_name || c?.name).filter(Boolean);
        const sample = rows.slice(0, 250);
        const looksNumeric = (v) => {
            if (v === null || v === undefined) return false;
            if (typeof v === 'number') return Number.isFinite(v);
            if (typeof v === 'boolean') return false;
            const s = String(v).trim();
            if (!s) return false;
            // Support commas/currency/percent in CSV-like text values.
            const normalized = s.replace(/[$,%\s]/g, '').replace(/,/g, '');
            if (!normalized) return false;
            const n = Number(normalized);
            return Number.isFinite(n);
        };

        fields.forEach((f) => {
            let present = 0;
            let numeric = 0;
            sample.forEach((r) => {
                if (!r || !Object.prototype.hasOwnProperty.call(r, f)) return;
                const v = r[f];
                if (v === null || v === undefined || String(v).trim() === '') return;
                present += 1;
                if (looksNumeric(v)) numeric += 1;
            });
            if (present > 0) {
                // Power BI-like expectation from user: if a column has numeric values, allow it as a measure.
                map.set(f, numeric > 0);
            }
        });
        return map;
    }, [dataset, schema]);

    const isNumericColumn = (columnName) => {
        if (Array.isArray(measures) && measures.some(m => m.name === columnName)) {
            return true;
        }
        const tRaw = getColumnType(columnName);
        if (!tRaw) return numericGuessMap.get(columnName) === true;

        // Normalize: remove punctuation/whitespace so types like "NUMERIC(10,2)" match cleanly.
        const t = tRaw.replace(/[^a-z0-9]/g, '');

        // Handle common pandas + SQL + spreadsheet numeric type labels
        // Examples: numeric, numeric102, number, int64, integer, bigint, smallint, float64, double, decimal, real
        return (
            t.includes('numeric') ||
            t.includes('number') ||
            t.includes('int') ||      // int, int64, integer, bigint, smallint, tinyint
            t.includes('float') ||    // float, float64
            t.includes('double') ||
            t.includes('decimal') ||
            t.includes('real')
        ) || (numericGuessMap.get(columnName) === true);
    };

    const isDateColumn = (columnName) => {
        const t = getColumnType(columnName);
        return t.includes('date') || t.includes('time');
    };

    const isCategoricalColumn = (columnName) => {
        const t = getColumnType(columnName);
        if (!t) return false;
        // Pandas/spreadsheet labels
        if (
            t.includes('categorical') ||
            t.includes('string') ||
            t.includes('object') ||
            t.includes('bool')
        ) {
            return true;
        }
        // SQL text types (PostgreSQL "character varying" does not match the word "string")
        if (
            t.includes('varchar') ||
            t.includes('character') ||
            t.includes('nvarchar') ||
            t.includes('nchar') ||
            t.includes('bpchar') ||
            t.includes('citext') ||
            t.includes('enum')
        ) {
            return true;
        }
        if (t === 'char' || t.startsWith('char(')) {
            return true;
        }
        if (t.includes('text') || t.includes('clob') || t.includes('json') || t.includes('xml') || t.includes('uuid')) {
            return true;
        }
        return false;
    };

    const isDimensionColumn = (columnName) => isCategoricalColumn(columnName) || isDateColumn(columnName) || isNumericColumn(columnName);

    const schemaFields = useMemo(
        () => (schema || []).map((col) => col?.column_name || col?.name).filter(Boolean),
        [schema]
    );
    const dimensionCandidates = useMemo(
        () => schemaFields.filter(isDimensionColumn),
        [schemaFields]
    );
    const measureCandidates = useMemo(
        () => {
            const numericFields = schemaFields.filter(isNumericColumn);
            const customNames = Array.isArray(measures) ? measures.map(m => m.name) : [];
            return Array.from(new Set([...numericFields, ...customNames]));
        },
        [schemaFields, measures]
    );

    const mapEngineAggToUi = (agg) => {
        if (!agg) return 'SUM';
        const normalized = String(agg).toLowerCase();
        if (normalized === 'mean') return 'AVG';
        if (normalized === 'none') return 'NONE';
        return normalized.toUpperCase();
    };

    const mapUiAggToEngine = (agg) => {
        const normalized = String(agg || 'SUM').toUpperCase();
        if (normalized === 'AVG') return 'mean';
        if (normalized === 'NONE') return 'none';
        return normalized.toLowerCase();
    };

    const getFieldWellState = () => {
        if (!selectedVisual) return { dimensions: [], measures: [] };
        const opts = selectedVisual.options || {};
        const dimensions = Array.isArray(opts.dimension_fields)
            ? opts.dimension_fields
            : (selectedVisual.x_axis ? [selectedVisual.x_axis] : []);
        const measures = Array.isArray(opts.measure_fields)
            ? opts.measure_fields
            : (selectedVisual.y_axis ? [{ column: selectedVisual.y_axis, aggregation: mapEngineAggToUi(selectedVisual.aggregation || 'sum') }] : []);

        return {
            // Keep empty placeholders so the user can select values in the UI.
            dimensions: (dimensions || []).filter((d) => d !== null && d !== undefined).map((d) => String(d)),
            measures: (measures || [])
                .filter((m) => m && typeof m === 'object')
                .map((m) => ({
                    column: m.column ? String(m.column) : '',
                    aggregation: mapEngineAggToUi(m.aggregation || 'sum')
                }))
        };
    };

    const getValidationErrors = (dimensions, measures) => {
        const cleanDimensions = (dimensions || [])
            .filter((d) => d && isDimensionColumn(d));
        const selectedMeasures = (measures || []).filter((m) => m && m.column);
        const usesNoneAgg = selectedMeasures.some(
            (m) => String(m.aggregation || '').toUpperCase() === 'NONE'
        );
        const cleanMeasures = usesNoneAgg
            ? selectedMeasures
            : selectedMeasures.filter((m) => isNumericColumn(m.column));

        const errors = [];
        if (!cleanDimensions.length) errors.push('Select at least one Dimension for X-axis grouping.');
        if (!cleanMeasures.length) errors.push('Select at least one Measure for Y-axis (or use NONE to count rows).');
        if (!usesNoneAgg) {
            const nonNumericMeasure = selectedMeasures.find((m) => !isNumericColumn(m.column));
            if (nonNumericMeasure?.column) {
                errors.push(`Measure "${nonNumericMeasure.column}" must be numeric (or use NONE / COUNT).`);
            }
        }
        return errors;
    };

    const applyFieldWellChanges = (nextDimensions, nextMeasures) => {
        if (!selectedVisual || isViewOnly || !onUpdateVisual) return;
        const displayDimensions = (nextDimensions || []).map((d) => (d === null || d === undefined ? '' : String(d)));
        const displayMeasures = (nextMeasures || [])
            .filter((m) => m && typeof m === 'object')
            .map((m) => ({
                column: m.column ? String(m.column) : '',
                aggregation: AGGREGATION_OPTIONS.includes(String(m.aggregation || '').toUpperCase())
                    ? String(m.aggregation).toUpperCase()
                    : 'SUM'
            }));

        const cleanDimensions = displayDimensions.filter((d) => d && isDimensionColumn(d));
        const cleanMeasures = displayMeasures.filter((m) => {
            if (!m?.column) return false;
            if (String(m.aggregation || '').toUpperCase() === 'NONE') return true;
            return isNumericColumn(m.column);
        });

        const validationErrors = getValidationErrors(cleanDimensions, displayMeasures.filter((m) => m?.column));
        const firstDimension = cleanDimensions[0] || null;
        const firstMeasure = cleanMeasures[0] || null;
        const firstMeasureExpression = firstMeasure
            ? (firstMeasure.aggregation === 'NONE'
                ? 'Record count'
                : `${firstMeasure.aggregation}(${firstMeasure.column})`)
            : null;
        const measureExpressions = cleanMeasures.map((m) =>
            m.aggregation === 'NONE' ? 'Record count' : `${m.aggregation}(${m.column})`
        );
        const queryPreview = (
            cleanDimensions.length && cleanMeasures.length
                ? `SELECT ${cleanDimensions.join(', ')}, ${measureExpressions.join(', ')} FROM table GROUP BY ${cleanDimensions.join(', ')}`
                : ''
        );

        onUpdateVisual(selectedVisual.id, {
            x_axis: firstDimension,
            y_axis: firstMeasure?.column || null,
            aggregation: firstMeasure ? mapUiAggToEngine(firstMeasure.aggregation) : null,
            options: {
                ...(selectedVisual.options || {}),
                // Keep placeholders for the UI bucket rows; API/query uses only clean ones.
                dimension_fields: displayDimensions,
                measure_fields: displayMeasures,
                measure_expressions: measureExpressions,
                axis_mapping: {
                    x_axis: firstDimension,
                    y_axis: firstMeasureExpression
                },
                visualization_config: {
                    dimension: firstDimension,
                    measure: firstMeasureExpression,
                    dimensions: cleanDimensions,
                    measures: measureExpressions,
                    query: queryPreview
                },
                validation_errors: validationErrors
            },
            cached_data: null
        });
    };

    const handleDimensionChange = (index, value) => {
        const { dimensions, measures } = getFieldWellState();
        const next = [...dimensions];
        next[index] = value || '';
        applyFieldWellChanges(next, measures);
    };

    const handleMeasureColumnChange = (index, value) => {
        const { dimensions, measures: currentMeasures } = getFieldWellState();
        const next = [...currentMeasures];
        const isCustom = Array.isArray(measures) && measures.some(m => m.name === value);
        const prevAgg = next[index]?.aggregation;
        const suggested = isCustom ? 'NONE' : suggestAggregationForColumn(value);
        const keepAgg = !isCustom && prevAgg && AGGREGATION_OPTIONS.includes(String(prevAgg).toUpperCase());
        next[index] = {
            ...(next[index] || { aggregation: 'SUM' }),
            column: value || '',
            aggregation: keepAgg ? prevAgg : suggested,
        };
        applyFieldWellChanges(dimensions, next);
    };

    const handleMeasureAggregationChange = (index, value) => {
        const { dimensions, measures } = getFieldWellState();
        const next = [...measures];
        if (!next[index]) return;
        next[index] = { ...next[index], aggregation: value || 'SUM' };
        applyFieldWellChanges(dimensions, next);
    };

    const addDimension = () => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges([...dimensions, ''], measures);
    };

    const removeDimension = (index) => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions.filter((_, idx) => idx !== index), measures);
    };

    const addMeasure = () => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions, [...measures, { column: '', aggregation: 'SUM' }]);
    };

    const removeMeasure = (index) => {
        const { dimensions, measures } = getFieldWellState();
        applyFieldWellChanges(dimensions, measures.filter((_, idx) => idx !== index));
    };

    const { dimensions: selectedDimensions, measures: selectedMeasures } = getFieldWellState();
    const validationErrors = getValidationErrors(selectedDimensions, selectedMeasures);
    const firstSelectedDimension = (selectedDimensions || []).find((d) => d && isDimensionColumn(d)) || null;
    const firstSelectedMeasure = (selectedMeasures || []).find((m) => m?.column && isNumericColumn(m.column)) || null;

    const handleOptionUpdate = (key, value) => {
        if (!selectedVisual || isViewOnly || !onUpdateVisual) return;
        const newOptions = { ...currentOptions, [key]: value };
        onUpdateVisual(selectedVisual.id, { options: newOptions });
    };

    const handleTableStyleUpdate = (partial, replace = false) => {
        if (!selectedVisual || isViewOnly || !onUpdateVisual) return;
        const nextStyle = replace
            ? { ...DEFAULT_TABLE_STYLE, ...partial }
            : mergeTableStyle({ ...currentOptions.tableStyle, ...partial });
        onUpdateVisual(selectedVisual.id, {
            options: { ...currentOptions, tableStyle: nextStyle },
        });
    };

    const isTableVisual = selectedVisual?.graph_type === 'table';

    const handleTypeChange = (type) => {
        if (isViewOnly || !onAddVisual) return;
        onAddVisual(type);
    };

    const handleTypeDragStart = (e, type) => {
        if (!type || isViewOnly) return;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('bi/viz-type', type);
        e.dataTransfer.setData('application/x-bi-viz-type', type);
        e.dataTransfer.setData('text/plain', `bi-viz:${type}`);
    };

    useEffect(() => {
        setDeleteConfirmPending(false);
    }, [selectedVisual?.id]);

    useEffect(() => {
        if (!deleteConfirmPending) return undefined;
        const timer = window.setTimeout(() => setDeleteConfirmPending(false), 3500);
        return () => window.clearTimeout(timer);
    }, [deleteConfirmPending]);

    const handleDeleteClick = () => {
        if (!selectedVisual || !onDeleteVisual) return;
        if (!deleteConfirmPending) {
            setDeleteConfirmPending(true);
            return;
        }
        onDeleteVisual(selectedVisual.id);
        setDeleteConfirmPending(false);
    };

    const handleResetColorsClick = () => {
        if (!selectedVisual) return;
        if (onResetVisualColors) {
            onResetVisualColors(selectedVisual);
            return;
        }
        if (!onUpdateVisual) return;
        const clears = COLOR_OVERRIDE_KEYS.reduce((acc, key) => {
            if (selectedVisual.options?.[key] != null && selectedVisual.options[key] !== '') {
                acc[key] = null;
            }
            return acc;
        }, {});
        if (!Object.keys(clears).length) return;
        onUpdateVisual(selectedVisual.id, { options: clears });
    };

    const selectedVisualTitle = selectedVisual
        ? (selectedVisual.graph_type === 'text'
            ? (selectedVisual.options?.title || 'Text box')
            : formatVisualDisplayTitle(selectedVisual.options?.title, selectedVisual.graph_type))
        : '';

    const isPieDonutVisual = selectedVisual && ['pie', 'donut'].includes(selectedVisual.graph_type);
    const pieOptions = selectedVisual?.options || {};
    const pieShowLabels = pieOptions.pieShowLabels !== false;
    const pieShowAll = pieOptions.pieShowAll !== false;
    const pieGroupOthers = pieOptions.pieGroupOthers !== false;
    const pieTopN = typeof pieOptions.pieTopN === 'number' ? pieOptions.pieTopN : 10;
    const pieCategoryCount = Array.isArray(selectedVisual?.cached_data?.labels)
        ? selectedVisual.cached_data.labels.length
        : 100;

    const patchPieOptions = (patch) => {
        if (!selectedVisual || isViewOnly || !onUpdateVisual) return;
        onUpdateVisual(selectedVisual.id, {
            options: { ...pieOptions, ...patch },
        });
    };

    const handlePieShowAllToggle = (checked) => {
        patchPieOptions({
            pieShowAll: checked,
            ...(checked ? { pieGroupOthers: false, pieLabelSide: 'all' } : { pieLabelSide: 'right' }),
        });
    };

    return (
        <div className={`bi-pane-view bi-pane-view--viz${isViewOnly ? ' bi-pane-view--view-only' : ''}`}>
            <div className="bi-viz-pane-top">
                <div className="bi-pane-header bi-pane-header--viz">
                    <span className="bi-pane-title">Visualizations</span>
                    <button
                        type="button"
                        className={`bi-pane-toggle-btn ${isSelectorCollapsed ? 'collapsed' : ''}`}
                        onClick={() => setIsSelectorCollapsed(!isSelectorCollapsed)}
                        title={isSelectorCollapsed ? 'Expand chart types' : 'Collapse chart types'}
                        aria-expanded={!isSelectorCollapsed}
                        aria-label={isSelectorCollapsed ? 'Expand chart types' : 'Collapse chart types'}
                    >
                        <ChevronDown size={14} />
                    </button>
                </div>

                <div className={`bi-viz-selector-container ${isSelectorCollapsed ? 'collapsed' : ''}`}>
                    <div className="bi-viz-selector-grid" role="listbox" aria-label="Chart types">
                        {visualTypes.map(v => (
                            <button
                                type="button"
                                key={v.type}
                                role="option"
                                aria-selected={selectedVisual?.graph_type === v.type}
                                className={`bi-viz-type ${selectedVisual?.graph_type === v.type ? 'active' : ''}`}
                                title={v.label}
                                draggable={!isViewOnly}
                                onDragStart={(e) => handleTypeDragStart(e, v.type)}
                                onClick={() => handleTypeChange(v.type)}
                                disabled={isViewOnly}
                            >
                                {v.icon}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bi-viz-sub-tabs" role="tablist" aria-label="Visual configuration">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'build'}
                        className={`bi-viz-sub-tab ${viewMode === 'build' ? 'active' : ''}`}
                        onClick={() => setViewMode('build')}
                        title="Visualization"
                    >
                        <Layout size={15} strokeWidth={1.75} />
                        <span className="bi-viz-sub-tab-label">Visual</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'format'}
                        className={`bi-viz-sub-tab ${viewMode === 'format' ? 'active' : ''}`}
                        onClick={() => setViewMode('format')}
                        title="Format"
                    >
                        <Palette size={15} strokeWidth={1.75} />
                        <span className="bi-viz-sub-tab-label">Format</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'general'}
                        className={`bi-viz-sub-tab ${viewMode === 'general' ? 'active' : ''}`}
                        onClick={() => setViewMode('general')}
                        title="Analytics"
                    >
                        <SlidersHorizontal size={15} strokeWidth={1.75} />
                        <span className="bi-viz-sub-tab-label">Analytics</span>
                    </button>
                </div>
            </div>

            <div className="bi-viz-pane-body">
                {selectedVisual && (
                    <div className="bi-visual-actions bi-visual-actions--compact">
                        <div className="bi-visual-actions-meta">
                            <span className="bi-visual-actions-label">Selected</span>
                            <span className="bi-visual-actions-name" title={selectedVisualTitle}>{selectedVisualTitle}</span>
                        </div>
                        <div className="bi-visual-actions-row">
                            {onExpandVisual && (
                                <button
                                    type="button"
                                    className="bi-visual-action-btn bi-visual-action-btn--expand"
                                    onClick={() => onExpandVisual(selectedVisual)}
                                    aria-label="Expand visual"
                                >
                                    <Maximize2 size={15} strokeWidth={2} />
                                    <span className="bi-visual-action-tip">Expand</span>
                                </button>
                            )}
                            {!isViewOnly && onAddToReport && (
                                <button
                                    type="button"
                                    className="bi-visual-action-btn bi-visual-action-btn--add"
                                    onClick={() => onAddToReport(selectedVisual)}
                                    aria-label="Add to report"
                                >
                                    <Plus size={15} strokeWidth={2} />
                                    <span className="bi-visual-action-tip">Add to report</span>
                                </button>
                            )}
                            {!isViewOnly && onDeleteVisual && (
                                <button
                                    type="button"
                                    className={`bi-visual-action-btn bi-visual-action-btn--delete${deleteConfirmPending ? ' confirming' : ''}`}
                                    onClick={handleDeleteClick}
                                    aria-label={deleteConfirmPending ? 'Confirm delete' : 'Delete visual'}
                                >
                                    <Trash2 size={15} strokeWidth={2} />
                                    <span className="bi-visual-action-tip">{deleteConfirmPending ? 'Confirm?' : 'Delete'}</span>
                                </button>
                            )}
                            {!isViewOnly && hasCustomColors(selectedVisual) && (
                                <button
                                    type="button"
                                    className="bi-visual-action-btn bi-visual-action-btn--reset"
                                    onClick={handleResetColorsClick}
                                    aria-label="Reset colors"
                                >
                                    <RotateCcw size={15} strokeWidth={2} />
                                    <span className="bi-visual-action-tip">Reset colors</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {isPieDonutVisual && !isViewOnly && (
                    <div className="bi-pie-chart-options bi-pie-chart-options--compact">
                        <span className="bi-pie-chart-options-label">Pie</span>
                        <div className="bi-pie-chart-options-toggles">
                            <label className="bi-pie-chart-toggle-icon" aria-label="Labels">
                                <input
                                    type="checkbox"
                                    checked={pieShowLabels}
                                    onChange={(e) => patchPieOptions({ pieShowLabels: e.target.checked })}
                                />
                                <Tag size={14} strokeWidth={2} />
                                <span className="bi-pie-chart-toggle-tip">Labels</span>
                            </label>
                            <label className={`bi-pie-chart-toggle-icon${pieShowAll ? ' is-disabled' : ''}`} aria-label="Group Others">
                                <input
                                    type="checkbox"
                                    checked={pieGroupOthers}
                                    disabled={pieShowAll}
                                    onChange={(e) => patchPieOptions({ pieGroupOthers: e.target.checked })}
                                />
                                <Layers size={14} strokeWidth={2} />
                                <span className="bi-pie-chart-toggle-tip">Group Others</span>
                            </label>
                            <label className="bi-pie-chart-toggle-icon" aria-label="Show All">
                                <input
                                    type="checkbox"
                                    checked={pieShowAll}
                                    onChange={(e) => handlePieShowAllToggle(e.target.checked)}
                                />
                                <LayoutGrid size={14} strokeWidth={2} />
                                <span className="bi-pie-chart-toggle-tip">Show All</span>
                            </label>
                        </div>
                        {!pieShowAll && (
                            <label className="bi-pie-chart-topn bi-pie-chart-topn--compact" title={`Top ${pieTopN}`}>
                                <span className="bi-pie-chart-topn-val">{pieTopN}</span>
                                <input
                                    type="range"
                                    min={3}
                                    max={Math.min(100, Math.max(3, pieCategoryCount))}
                                    step={1}
                                    value={Math.min(pieTopN, pieCategoryCount)}
                                    onChange={(e) => patchPieOptions({ pieTopN: Number(e.target.value) })}
                                    aria-label="Top N slices"
                                />
                            </label>
                        )}
                    </div>
                )}

                {viewMode === 'build' && selectedVisual?.graph_type === 'power_app' && (
                    <div className="bi-build-area">
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Power App connection</span>
                            <div className="bi-bucket-drop" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                                    Click <strong>Connect app</strong> on the canvas to paste your Power Apps play link (Share → link to this app), or set App ID + environment in the dialog. Then choose which dataset columns to append as URL parameters for{' '}
                                    <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>Param(&quot;…&quot;)</code> in your canvas app.
                                </p>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Pass fields (first row)</span>
                            <div
                                className="bi-bucket-drop"
                                style={{ maxHeight: 220, overflowY: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '8px' }}
                            >
                                {(schema || []).length === 0 && (
                                    <span className="bi-bucket-placeholder">Load a dataset to list fields</span>
                                )}
                                {(schema || []).map((col) => {
                                    const name = col.column_name || col.name;
                                    if (!name) return null;
                                    const fields = Array.isArray(selectedVisual?.options?.powerAppsContextFields)
                                        ? selectedVisual.options.powerAppsContextFields
                                        : [];
                                    const checked = fields.includes(name);
                                    return (
                                        <label
                                            key={name}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', color: '#334155' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    const next = checked ? fields.filter((f) => f !== name) : [...fields, name];
                                                    onUpdateVisual(selectedVisual.id, {
                                                        options: { ...(selectedVisual.options || {}), powerAppsContextFields: next },
                                                        cached_data: null,
                                                    });
                                                }}
                                            />
                                            <span>{name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'build' && selectedVisual?.graph_type === 'influencers' && (
                    <div className="bi-build-area">
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Analyze</span>
                            <div className="bi-bucket-drop">
                                <select
                                    className="bi-bucket-select"
                                    value={selectedVisual?.y_axis || ''}
                                    onChange={(e) => {
                                        const y = e.target.value || null;
                                        onUpdateVisual(selectedVisual.id, { y_axis: y, cached_data: null });
                                    }}
                                >
                                    <option value="">Add data fields here</option>
                                    {schema?.map(col => (
                                        <option key={col.column_name} value={col.column_name}>
                                            {col.column_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Explain by</span>
                            <div className="bi-bucket-drop">
                                <select
                                    className="bi-bucket-select"
                                    value={selectedVisual?.x_axis || ''}
                                    onChange={(e) => {
                                        const x = e.target.value || null;
                                        onUpdateVisual(selectedVisual.id, { x_axis: x, cached_data: null });
                                    }}
                                >
                                    <option value="">Add data fields here</option>
                                    {schema?.map(col => (
                                        <option key={col.column_name} value={col.column_name}>
                                            {col.column_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="bi-build-bucket">
                            <span className="bi-bucket-label">Expand by</span>
                            <div className="bi-bucket-drop">
                                <span className="bi-bucket-placeholder">Add data fields here</span>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'build' && selectedVisual?.graph_type !== 'influencers' && selectedVisual?.graph_type !== 'power_app' && (
                    <div className="bi-build-area">
                        {isFieldsRefreshing && (
                            <div className="bi-viz-info-banner">
                                <div className="bi-loading-spinner bi-viz-info-spinner" />
                                <span>Refreshing Dimensions/Measures…</span>
                            </div>
                        )}
                        <section className="bi-viz-section bi-build-bucket">
                            <div className="bi-fieldwell-header">
                                <span className="bi-bucket-label">Dimensions</span>
                                <button type="button" className="bi-fieldwell-add-btn" onClick={addDimension} disabled={!selectedVisual || isFieldsRefreshing}>
                                    + Add
                                </button>
                            </div>
                            {selectedDimensions.map((dimension, idx) => (
                                <div className="bi-bucket-drop bi-fieldwell-row" key={`dimension-${idx}`}>
                                    <select
                                        className="bi-bucket-select"
                                        value={dimension}
                                        onChange={(e) => handleDimensionChange(idx, e.target.value)}
                                        disabled={!selectedVisual || isFieldsRefreshing}
                                    >
                                        <option value="">Select dimension</option>
                                        {dimensionCandidates.map((field) => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                    <button type="button" className="bi-fieldwell-remove-btn" onClick={() => removeDimension(idx)}>×</button>
                                </div>
                            ))}
                            {selectedDimensions.length === 0 && (
                                <div className="bi-fieldwell-dropzone">
                                    <span className="bi-bucket-placeholder">Add categorical/date/numeric fields for grouping</span>
                                </div>
                            )}
                        </section>
                        <section className="bi-viz-section bi-build-bucket">
                            <div className="bi-fieldwell-header">
                                <span className="bi-bucket-label">Measures</span>
                                <button type="button" className="bi-fieldwell-add-btn" onClick={addMeasure} disabled={!selectedVisual || isFieldsRefreshing}>
                                    + Add
                                </button>
                            </div>
                            {selectedMeasures.map((measure, idx) => (
                                <div className="bi-bucket-drop bi-fieldwell-row" key={`measure-${idx}`}>
                                    <select
                                        className="bi-bucket-select"
                                        value={measure.column || ''}
                                        onChange={(e) => handleMeasureColumnChange(idx, e.target.value)}
                                        disabled={!selectedVisual || isFieldsRefreshing}
                                    >
                                        <option value="">Select measure</option>
                                        {measureCandidates.map((field) => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                    {Array.isArray(measures) && measures.some(m => m.name === measure.column) ? (
                                        <select
                                            className="bi-bucket-select bi-agg-select"
                                            value="NONE"
                                            disabled={true}
                                        >
                                            <option value="NONE">Calculated</option>
                                        </select>
                                    ) : (
                                        <select
                                            className="bi-bucket-select bi-agg-select"
                                            value={measure.aggregation || 'SUM'}
                                            onChange={(e) => handleMeasureAggregationChange(idx, e.target.value)}
                                            disabled={!selectedVisual || isFieldsRefreshing}
                                        >
                                            {AGGREGATION_OPTIONS.map((agg) => (
                                                <option key={agg} value={agg}>{agg === 'NONE' ? 'NONE' : agg}</option>
                                            ))}
                                        </select>
                                    )}
                                    <button type="button" className="bi-fieldwell-remove-btn" onClick={() => removeMeasure(idx)}>×</button>
                                </div>
                            ))}
                            {selectedMeasures.length === 0 && (
                                <div className="bi-fieldwell-dropzone">
                                    <span className="bi-bucket-placeholder">Add numeric fields with SUM/AVG/MIN/MAX/COUNT</span>
                                </div>
                            )}
                        </section>
                        <section className="bi-axis-mapping-card" aria-label="Axis mapping">
                            <div className="bi-axis-mapping-title">Axis Mapping</div>
                            <div className="bi-axis-mapping-rows">
                                <div className="bi-axis-mapping-row">
                                    <span className="bi-axis-mapping-key">X-axis</span>
                                    <span className="bi-axis-mapping-val">{firstSelectedDimension || 'Not assigned'}</span>
                                </div>
                                <div className="bi-axis-mapping-row">
                                    <span className="bi-axis-mapping-key">Y-axis</span>
                                    <span className="bi-axis-mapping-val">
                                        {firstSelectedMeasure
                                            ? (firstSelectedMeasure.aggregation === 'NONE'
                                                ? `Record count by ${firstSelectedDimension || 'category'}`
                                                : `${firstSelectedMeasure.aggregation}(${firstSelectedMeasure.column})`)
                                            : 'Not assigned'}
                                    </span>
                                </div>
                            </div>
                        </section>
                        {validationErrors.length > 0 && (
                            <div className="bi-viz-alert" role="alert">
                                <AlertTriangle size={15} className="bi-viz-alert-icon" aria-hidden />
                                <div className="bi-viz-alert-content">
                                    {validationErrors.map((err) => (
                                        <p key={err} className="bi-viz-alert-text">{err}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'format' && (
                    <div className="bi-format-area">
                        {!selectedVisual ? (
                            <div className="bi-format-placeholder">Select a visual to format</div>
                        ) : (
                            <>
                                <div className="bi-format-section">
                                    <div className="bi-format-section-header">Visual Title</div>
                                    <div className="bi-format-field">
                                        <input
                                            type="text"
                                            className="bi-format-input"
                                            placeholder="Enter visual title..."
                                            value={currentOptions.title || ''}
                                            onChange={(e) => handleOptionUpdate('title', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {isTableVisual && (
                                    <BITableFormatSection
                                        selectedVisual={selectedVisual}
                                        currentOptions={currentOptions}
                                        onUpdateTableStyle={handleTableStyleUpdate}
                                        isViewOnly={isViewOnly}
                                    />
                                )}

                                {!isTableVisual && selectedVisual.graph_type === 'waterfall' ? (
                                    <>
                                        <div className="bi-format-section">
                                            <div className="bi-format-section-header">Increase Color</div>
                                            <div className="bi-color-grid">
                                                {VIBRANT_PALETTE.map(color => (
                                                    <div
                                                        key={`inc-${color}`}
                                                        className={`bi-color-swatch ${currentOptions.positiveColor === color ? 'selected' : ''}`}
                                                        style={{ backgroundColor: color }}
                                                        onClick={() => handleOptionUpdate('positiveColor', color)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bi-format-section">
                                            <div className="bi-format-section-header">Decrease Color</div>
                                            <div className="bi-color-grid">
                                                {VIBRANT_PALETTE.map(color => (
                                                    <div
                                                        key={`dec-${color}`}
                                                        className={`bi-color-swatch ${currentOptions.negativeColor === color ? 'selected' : ''}`}
                                                        style={{ backgroundColor: color }}
                                                        onClick={() => handleOptionUpdate('negativeColor', color)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : !isTableVisual ? (
                                    <div className="bi-format-section">
                                        <div className="bi-format-section-header">Chart Color</div>
                                        <div className="bi-color-grid">
                                            {VIBRANT_PALETTE.map(color => (
                                                <div
                                                    key={color}
                                                    className={`bi-color-swatch ${currentOptions.mainColor === color ? 'selected' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => handleOptionUpdate('mainColor', color)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="bi-format-section">
                                    <div className="bi-format-section-header">Background Color (All Visuals)</div>
                                    <div className="bi-bg-palette-grid">
                                        <button
                                            type="button"
                                            className={`bi-bg-swatch bi-bg-swatch--no-fill ${reportNoFill ? 'selected' : ''}`}
                                            title="No Fill — apply to all visuals"
                                            aria-label="No Fill — apply to all visuals"
                                            onClick={() => onApplyReportNoFill?.()}
                                        >
                                            <span className="bi-bg-swatch-no-fill-label">No Fill</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`bi-bg-swatch bi-bg-swatch--none ${isDefaultBackground ? 'selected' : ''}`}
                                            title="None — restore default background on all visuals"
                                            aria-label="None — restore default background on all visuals"
                                            onClick={() => onApplyReportBackgroundReset?.()}
                                        >
                                            <span className="bi-bg-swatch-none-label">None</span>
                                        </button>
                                        {[
                                            /* Neutrals */
                                            '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1',
                                            /* Warm gradient stops */
                                            '#fef9f0', '#fef3c7', '#fde68a', '#fca5a5', '#fecdd3',
                                            /* Cool gradient stops */
                                            '#eff6ff', '#dbeafe', '#bfdbfe', '#a5f3fc', '#d1fae5',
                                            /* Vivid / dark */
                                            '#1e293b', '#0f172a', '#4c1d95', '#7a1e3a', '#064e3b',
                                        ].map(color => (
                                            <div
                                                key={color}
                                                className={`bi-bg-swatch ${!reportNoFill && !isDefaultBackground && currentOptions.bgColor === color ? 'selected' : ''}`}
                                                style={{ background: color }}
                                                title={color}
                                                onClick={() => onApplyReportBackgroundFill?.(color)}
                                            />
                                        ))}
                                    </div>
                                    <div className="bi-bg-custom-row">
                                        <span className="bi-bg-custom-label">Custom</span>
                                        <input
                                            type="color"
                                            className="bi-cs-color-input"
                                            value={reportNoFill || isDefaultBackground ? '#ffffff' : (currentOptions.bgColor || '#ffffff')}
                                            onChange={(e) => onApplyReportBackgroundFill?.(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {!isTableVisual && (
                                    <>
                                        <div className="bi-format-section">
                                            <div className="bi-format-toggle-item">
                                                <span>Show X-Axis</span>
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.showXAxis !== false}
                                                    onChange={(e) => handleOptionUpdate('showXAxis', e.target.checked)}
                                                />
                                            </div>
                                            <div className="bi-format-toggle-item">
                                                <span>Show Y-Axis</span>
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.showYAxis !== false}
                                                    onChange={(e) => handleOptionUpdate('showYAxis', e.target.checked)}
                                                />
                                            </div>
                                            <div className="bi-format-toggle-item">
                                                <span>Data Labels</span>
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.showDataLabels !== false}
                                                    onChange={(e) => handleOptionUpdate('showDataLabels', e.target.checked)}
                                                />
                                            </div>
                                            <div className="bi-format-toggle-item">
                                                <span>Axis Titles</span>
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.showAxisTitles !== false}
                                                    onChange={(e) => handleOptionUpdate('showAxisTitles', e.target.checked)}
                                                />
                                            </div>
                                        </div>

                                        <div className="bi-format-section">
                                            <div className="bi-format-section-header">Axis Titles</div>
                                            <label className="bi-format-field">
                                                <span>X-axis title</span>
                                                <input
                                                    type="text"
                                                    className="bi-format-input bi-format-input--compact"
                                                    placeholder={firstSelectedDimension || selectedVisual?.x_axis || 'Category'}
                                                    value={currentOptions.xLabel ?? ''}
                                                    onChange={(e) => handleOptionUpdate('xLabel', e.target.value)}
                                                />
                                            </label>
                                            <label className="bi-format-field">
                                                <span>Y-axis title</span>
                                                <input
                                                    type="text"
                                                    className="bi-format-input bi-format-input--compact"
                                                    placeholder={firstSelectedMeasure ? `${firstSelectedMeasure.aggregation}(${firstSelectedMeasure.column})` : (selectedVisual?.y_axis || 'Value')}
                                                    value={currentOptions.yLabel ?? ''}
                                                    onChange={(e) => handleOptionUpdate('yLabel', e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    </>
                                )}

                                {/* ── CARD STYLING ─────────────────────────────────────────── */}
                                <div className="bi-format-section bi-card-styling-section">
                                    <div className="bi-format-section-header">Card Styling</div>

                                    {/* ── Card Border ── */}
                                    <div className="bi-cs-subsection">
                                        <div className="bi-cs-subsection-title-row">
                                            <span className="bi-cs-subsection-title">Card Border</span>
                                            <button
                                                className="bi-cs-remove-border-btn"
                                                onClick={() => {
                                                    if (!selectedVisual) return;
                                                    onUpdateVisual(selectedVisual.id, {
                                                        options: {
                                                            ...currentOptions,
                                                            cardBorderEnabled: false,
                                                            cardBorderWidth: 0,
                                                            cardBorderRemoved: true,
                                                        }
                                                    });
                                                }}
                                                title="Remove all borders from this card"
                                            >
                                                ✕ Remove Border
                                            </button>
                                        </div>
                                        <div className="bi-format-toggle-item">
                                            <span>Enable Border</span>
                                            <label className="bi-cs-toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.cardBorderEnabled !== false ? (currentOptions.cardBorderEnabled || false) : false}
                                                    onChange={(e) => {
                                                        if (!selectedVisual) return;
                                                        onUpdateVisual(selectedVisual.id, {
                                                            options: {
                                                                ...currentOptions,
                                                                cardBorderEnabled: e.target.checked,
                                                                // Re-enabling clears the removed flag
                                                                cardBorderRemoved: e.target.checked ? false : currentOptions.cardBorderRemoved,
                                                            }
                                                        });
                                                    }}
                                                />
                                                <span className="bi-cs-toggle-slider" />
                                            </label>
                                        </div>
                                        {currentOptions.cardBorderEnabled && (
                                            <>
                                                <div className="bi-cs-row">
                                                    <label className="bi-cs-label">Color</label>
                                                    <input
                                                        type="color"
                                                        className="bi-cs-color-input"
                                                        value={currentOptions.cardBorderColor || '#cbd5e1'}
                                                        onChange={(e) => handleOptionUpdate('cardBorderColor', e.target.value)}
                                                    />
                                                </div>
                                                <div className="bi-cs-row">
                                                    <label className="bi-cs-label">Width <span className="bi-cs-value">{currentOptions.cardBorderWidth ?? 1}px</span></label>
                                                    <input
                                                        type="range" min="0" max="10" step="1"
                                                        className="bi-cs-slider"
                                                        value={currentOptions.cardBorderWidth ?? 1}
                                                        onChange={(e) => handleOptionUpdate('cardBorderWidth', Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="bi-cs-row">
                                                    <label className="bi-cs-label">Radius <span className="bi-cs-value">{currentOptions.cardBorderRadius ?? 8}px</span></label>
                                                    <input
                                                        type="range" min="0" max="32" step="1"
                                                        className="bi-cs-slider"
                                                        value={currentOptions.cardBorderRadius ?? 8}
                                                        onChange={(e) => handleOptionUpdate('cardBorderRadius', Number(e.target.value))}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* ── Shadow ── */}
                                    <div className="bi-cs-subsection">
                                        <div className="bi-cs-subsection-title">Shadow</div>
                                        <div className="bi-format-toggle-item">
                                            <span>Enable Shadow</span>
                                            <label className="bi-cs-toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={currentOptions.cardShadowEnabled || false}
                                                    onChange={(e) => handleOptionUpdate('cardShadowEnabled', e.target.checked)}
                                                />
                                                <span className="bi-cs-toggle-slider" />
                                            </label>
                                        </div>
                                        {currentOptions.cardShadowEnabled && (
                                            <div className="bi-cs-shadow-block">
                                                <span className="bi-cs-label">Intensity</span>
                                                <div className="bi-cs-shadow-options">
                                                    {['low', 'medium', 'high'].map(lvl => (
                                                        <button
                                                            key={lvl}
                                                            className={`bi-cs-shadow-btn ${(currentOptions.cardShadowIntensity || 'medium') === lvl ? 'active' : ''}`}
                                                            onClick={() => handleOptionUpdate('cardShadowIntensity', lvl)}
                                                        >
                                                            {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* ── END CARD STYLING ─────────────────────────────────────── */}
                            </>
                        )}
                    </div>
                )}

                {viewMode === 'general' && (
                    <BIVisualGeneralPane
                        selectedVisual={selectedVisual}
                        onUpdateVisual={isViewOnly ? undefined : onUpdateVisual}
                    />
                )}
            </div>
        </div>
    );
};

export default BIVisualizationsPane;
