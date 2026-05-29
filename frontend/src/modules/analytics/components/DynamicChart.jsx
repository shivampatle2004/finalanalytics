import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { GitBranch } from 'lucide-react';
import './DynamicChart.css';
import { useGlobalFilters } from '../context/FilterContext';
import {
    filterData,
    filterRulesToFilterMap,
    filterMapHasValues,
    dimensionAppliesToChartAxis,
    getConsistentColor,
} from '../utils/filterUtils';
import {
    buildMeasureFieldsForApi,
    coerceChartRows,
    formatChartNumber,
    getXAxisTitle,
    getYAxisTitle,
} from '../utils/chartAxisUtils';
import {
    getHierarchyDimensions,
    getHierarchyXAxisLabel,
    getCompositeFilterKeys,
} from '../utils/drillHierarchy';
import LegendComponent, { truncateLabel, getVisualDimensionFilterValues, getLegendColor } from './Legend';
import DrillDownPanel from './DrillDownPanel';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Sector,
    XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    AreaChart, Area, ScatterChart, Scatter, ReferenceLine,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Treemap, ComposedChart, Sankey, RadialBarChart, RadialBar, LabelList
} from 'recharts';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import CustomVisualRenderer from './CustomVisualRenderer';
import useVisualRegistryStore from '../store/visualRegistryStore';
import SmartNarrativeVisual from './SmartNarrativeVisual';
import PowerAutomateVisual from './PowerAutomateVisual';
import QnaVisual from './QnaVisual';
import InfluencersVisual from './InfluencersVisual';
import PowerAppsVisual from './PowerAppsVisual';
import { VIBRANT_PALETTE, getCategoryColor } from '../constants/chartPalette';
const THEME_PALETTES = {
    /** OSA Purple — full vibrant series colors (no restricted theme palette). */
    theme_default: {
        palette: null,
        useVibrantPalette: true,
        positive: '#10B981',
        negative: '#EF4444',
    },
    theme_dark: {
        palette: ['#4CC9F0', '#4895EF', '#4361EE', '#7209B7', '#B5179E', '#F72585', '#F8961E', '#90BE6D'],
        positive: '#90BE6D',
        negative: '#F94144',
    },
    theme_high_contrast: {
        palette: ['#FFFFFF', '#FFD60A', '#00E5FF', '#00FF85', '#FF4D6D', '#C77DFF', '#F9844A', '#A7F432'],
        positive: '#00FF85',
        negative: '#FF4D6D',
    },
    theme_storm: {
        palette: ['#2F5D8A', '#4A7AA7', '#6796C2', '#86B3DD', '#A5C8E8', '#5F8FB7', '#3D6E9A', '#244F77'],
        positive: '#2C9A7A',
        negative: '#B34E4E',
    },
    theme_bloom: {
        palette: ['#00A99D', '#58C17A', '#FFC857', '#F28F3B', '#E76F51', '#A44A8A', '#4D96FF', '#7BD389'],
        positive: '#58C17A',
        negative: '#E76F51',
    },
    theme_sunset: {
        palette: ['#EF476F', '#F78C6B', '#FFD166', '#06D6A0', '#118AB2', '#7B2CBF', '#F3722C', '#90BE6D'],
        positive: '#06D6A0',
        negative: '#EF476F',
    },
    theme_forest: {
        palette: ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#081C15'],
        positive: '#52B788',
        negative: '#B23A48',
    },
    theme_monochrome: {
        palette: ['#111827', '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'],
        positive: '#374151',
        negative: '#9CA3AF',
    },
    /** Executive (navy & gold): charcoal, gold accent, coral negative, neutral grey */
    theme_financial: {
        palette: ['#2D2D3A', '#FFC107', '#E67E4D', '#D1D5DB', '#3D3D4A', '#FFD54F', '#F4A574', '#9CA3AF'],
        positive: '#FFC107',
        negative: '#E67E4D',
    },
};

const getThemeColor = (id, palette = VIBRANT_PALETTE) => {
    if (!id) return palette[0];
    // Simple hash to pick a stable color from the palette based on ID
    let hash = 0;
    const strId = String(id);
    for (let i = 0; i < strId.length; i++) {
        hash = ((hash << 5) - hash) + strId.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return palette[Math.abs(hash) % palette.length];
};

/** Category tick label — truncation limit comes from layout (slot width / label length). */
const formatXAxisTick = (val, fullLabels = false, tickMaxLen = 12) => {
    const str = String(val ?? '');
    if (fullLabels || str.includes(' | ')) return str;
    const max = Math.max(6, Number(tickMaxLen) || 12);
    if (str.length <= max) return str;
    return `${str.slice(0, Math.max(4, max - 1))}…`;
};

const TICK_FONT_PX = 8;
const TICK_CHAR_PX = TICK_FONT_PX * 0.62;

/** Vertical space (px) needed for a tick label at a given angle and character count. */
const estimateAngledTickHeight = (labelChars, angleDeg, fontSize = TICK_FONT_PX) => {
    if (!angleDeg) return fontSize + 12;
    const rad = (Math.abs(angleDeg) * Math.PI) / 180;
    const textPx = labelChars * TICK_CHAR_PX * (fontSize / TICK_FONT_PX);
    return Math.ceil(Math.sin(rad) * textPx + Math.cos(rad) * (fontSize + 4) + 6);
};

/** Y-axis title for Recharts (X-axis title on bar charts is rendered as HTML below the plot). */
const buildYAxisTitleLabel = (title) => {
    const text = String(title ?? '').trim();
    if (!text) return undefined;
    return {
        value: text,
        angle: -90,
        position: 'insideLeft',
        offset: 8,
        fontSize: 10,
        fill: '#334155',
        fontWeight: 600,
        style: { textAnchor: 'middle' },
    };
};

/** Bottom margin sized to the computed tick band (axis title is outside the chart). */
const computeChartBottomMargin = (xLayout) => {
    const height = xLayout?.height ?? 24;
    const tickMargin = xLayout?.tickMargin ?? 2;
    return height + tickMargin + 2;
};

/**
 * X-axis layout derived from category labels + plot width:
 * angle, reserved height, and truncation all scale with actual values.
 */
/** Normalize API/cached payload into [{ name, value, ... }] rows. */
const extractChartRows = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
};

const computeXAxisLayout = (chartData, { expandModeActive = false, compactMode = false, chartWidth = 0 } = {}) => {
    const names = (Array.isArray(chartData) ? chartData : []).map((d) => String(d?.name ?? ''));
    const count = names.length;
    const emptyLayout = {
        fullLabels: true,
        tickMaxLen: 32,
        angle: 0,
        height: 20,
        bottom: 22,
        interval: 0,
        fontSize: TICK_FONT_PX,
        textAnchor: 'middle',
        minTickGap: 0,
        tickMargin: 2,
        footerGap: 4,
    };
    if (count === 0) return emptyLayout;

    const hasComposite = expandModeActive || names.some((n) => n.includes(' | '));
    const maxLen = names.reduce((m, n) => Math.max(m, n.length), 0);
    const plotWidth = chartWidth > 60 ? chartWidth - 24 : 0;
    const slotWidth = plotWidth > 0 ? plotWidth / count : 0;
    const charsPerSlot = slotWidth > 0 ? Math.max(4, Math.floor(slotWidth / TICK_CHAR_PX)) : maxLen;

    const fullLabels = hasComposite
        || (compactMode && count <= 8 && maxLen <= 28)
        || (count <= 5 && maxLen <= 24)
        || (count <= 8 && maxLen <= 18 && charsPerSlot >= maxLen);

    const tickMaxLen = fullLabels ? maxLen : Math.min(maxLen, charsPerSlot);
    const displayLen = fullLabels ? maxLen : Math.min(tickMaxLen, maxLen);

    let angle = 0;
    if (compactMode) {
        angle = count > 2 ? -36 : (maxLen > 8 ? -18 : 0);
    } else if (hasComposite || maxLen > 20) {
        angle = count > 6 ? -42 : -32;
    } else if (count > 8 || maxLen > 14) {
        angle = count > 14 ? -40 : -32;
    } else if (count > 4 || maxLen > 10) {
        angle = -28;
    } else if (count > 2 && maxLen > 8) {
        angle = -18;
    }

    let height = estimateAngledTickHeight(displayLen, angle, TICK_FONT_PX);
    const maxHeight = compactMode ? 56 : (hasComposite ? 76 : 64);
    height = Math.min(maxHeight, Math.max(angle === 0 ? 18 : 22, height));

    const tickMargin = angle ? Math.min(6, Math.max(2, Math.round(height * 0.06))) : 2;
    let interval = 0;
    if (count > 28) interval = 'preserveStartEnd';
    else if (count > 18 && slotWidth > 0 && slotWidth < 22) {
        interval = Math.max(1, Math.floor(count / 14));
    }

    return {
        fullLabels,
        tickMaxLen,
        angle,
        height,
        bottom: height + tickMargin,
        interval,
        fontSize: TICK_FONT_PX,
        textAnchor: angle ? 'end' : 'middle',
        minTickGap: 0,
        tickMargin,
        footerGap: 4,
    };
};

const DynamicChart = ({ fileId, graphDefinition: propGraphDefinition, selection = null, onClick, onUpdate, onSelectVisual, isExporting = false, hideInternalStats = false, hideChartTitle = false, isDragging = false, showZoomControls = false, zoomToolbarContainer = null, reportTheme = 'theme_default', isViewOnly = false }) => {
    // 1. Calculate active X-axis dimension label based on drill path & mode at the top
    //    Also build validDimFields with x_axis as fallback for charts that haven't used the field-well yet
    const rawDimFields = Array.isArray(propGraphDefinition?.options?.dimension_fields)
        ? propGraphDefinition.options.dimension_fields
        : [];
    const validDimFields = rawDimFields.filter(d => typeof d === 'string' && d.trim() !== '');

    // If dimension_fields is empty/missing but x_axis is set, treat x_axis as the first dimension
    // so existing charts can still participate in drill-down after adding a 2nd dimension
    const effectiveDimFields = validDimFields.length > 0
        ? validDimFields
        : (propGraphDefinition?.x_axis ? [propGraphDefinition.x_axis] : []);

    const pDrillLevelIndex = propGraphDefinition?.options?.drillLevelIndex ?? 0;
    const pExpandModeActive = propGraphDefinition?.options?.expandModeActive ?? false;
    const activeXAxisLabel = effectiveDimFields.length > 1
        ? getHierarchyXAxisLabel(effectiveDimFields, pDrillLevelIndex, pExpandModeActive)
        : (propGraphDefinition?.x_axis || effectiveDimFields[0] || '');

    // 2. Safely derive graphDefinition for the rest of the component
    const graphDefinition = {
        ...propGraphDefinition,
        x_axis: activeXAxisLabel
    };

    const { installedVisuals } = useVisualRegistryStore();
    const MAX_ZOOM = 10;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [crossFilterRefreshing, setCrossFilterRefreshing] = useState(false);
    const baselineChartDataRef = useRef(null);
    /** Authoritative full dataset from unfiltered API/cache loads only. */
    const unfilteredBaselineRef = useRef(null);
    const skipFilterPropSyncRef = useRef(false);
    const forceUnfilteredFetchRef = useRef(false);
    const silentRefetchRef = useRef(false);
    const [dataFetchNonce, setDataFetchNonce] = useState(0);

    const getUnfilteredSnapshot = useCallback(() => {
        const snap = unfilteredBaselineRef.current || baselineChartDataRef.current;
        const rows = extractChartRows(snap);
        return { snap, rows, rowCount: rows.length };
    }, []);
    /** Full unfiltered dataset — never shrink when a filtered snapshot is saved. */
    const saveBaselineRows = useCallback((rows, force = false) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        const prev = baselineChartDataRef.current;
        const nextLen = extractChartRows(rows).length;
        const prevLen = prev ? extractChartRows(prev).length : 0;
        if (force || !prev || nextLen >= prevLen) {
            baselineChartDataRef.current = rows;
        }
        if (force) {
            unfilteredBaselineRef.current = rows;
        }
    }, []);
    const fetchAbortRef = useRef(null);
    const [error, setError] = useState(null);
    const [configHint, setConfigHint] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [textContent, setTextContent] = useState(graphDefinition.content || '');
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [expandedNodeIds, setExpandedNodeIds] = useState([]);
    const [zoomLevel, setZoomLevel] = useState(1);
    const containerRef = useRef(null);
    const zoomViewportRef = useRef(null);

    // ── Smart chart controls (Power BI-like) ──────────────────────────────
    const [scTopN, setScTopN] = useState(10);
    const [scShowAll, setScShowAll] = useState(false);
    const [scGroupOthers, setScGroupOthers] = useState(true);
    const [scShowLabels, setScShowLabels] = useState(true);
    const [scLegendSearch, setScLegendSearch] = useState('');
    const [scHiddenSlices, setScHiddenSlices] = useState(new Set());
    /** Pie/donut: set only while pointer is over a slice (never on click). */
    const [pieHoverSegment, setPieHoverSegment] = useState(null);
    const [scLabelSide, setScLabelSide] = useState('right'); // all | left | right | leftTop | leftBottom | rightTop | rightBottom
    const [scTotalPoints, setScTotalPoints] = useState(0);
    const scLegendRef = useRef(null);

    // --- Centralized Global Filter Hook & Memoized Filtered Dataset ---
    const {
        filters,
        highlightedItem,
        setHighlightedItem,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
        clearReportCrossFilter,
    } = useGlobalFilters();

    const [visualFilterRules, setVisualFilterRules] = useState(
        () => (Array.isArray(graphDefinition.options?.filters) ? graphDefinition.options.filters : [])
    );

    useEffect(() => {
        const fromProp = Array.isArray(graphDefinition.options?.filters) ? graphDefinition.options.filters : [];
        if (skipFilterPropSyncRef.current) {
            if (fromProp.length === 0) skipFilterPropSyncRef.current = false;
            else return;
        }
        setVisualFilterRules(fromProp);
    }, [graphDefinition.options?.filters]);

    const drillLevelIndex = graphDefinition.options?.drillLevelIndex ?? 0;
    const drillPath = graphDefinition.options?.drillPath ?? [];
    const drillModeActive = graphDefinition.options?.drillModeActive ?? false;
    const expandModeActive = graphDefinition.options?.expandModeActive ?? false;
    const isDrillingActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;

    const chartFilterMap = useMemo(() => {
        const visualMap = filterRulesToFilterMap(visualFilterRules);
        if (!filterMapHasValues(filters)) return visualMap;
        if (!filterMapHasValues(visualMap)) return filters;
        return { ...visualMap, ...filters };
    }, [filters, visualFilterRules]);

    const crossFiltersFetchKey = useMemo(
        () => (reportCrossFilterEnabled && filterMapHasValues(filters) ? JSON.stringify(filters) : ''),
        [reportCrossFilterEnabled, filters]
    );
    const prevCrossFiltersFetchKeyRef = useRef(crossFiltersFetchKey);

    const useServerCrossFilter = reportCrossFilterEnabled && filterMapHasValues(filters);

    const rawChartRows = useMemo(() => {
        const fromState = extractChartRows(data);
        const fullSource = unfilteredBaselineRef.current || baselineChartDataRef.current;
        const fullRows = extractChartRows(fullSource);
        const chartFiltered = filterMapHasValues(chartFilterMap);

        if (useServerCrossFilter) {
            const hasFreshServerRows = fromState.length > 0 && !crossFilterRefreshing;
            if (hasFreshServerRows) return fromState;
            const canClientPreview = filterMapHasValues(filters)
                && Object.keys(filters).some((dim) =>
                    dimensionAppliesToChartAxis(dim, graphDefinition.x_axis)
                );
            if (canClientPreview && fullRows.length > 0) {
                const preview = filterData(
                    fullRows,
                    filters,
                    graphDefinition.x_axis,
                    graphDefinition.y_axis
                );
                if (preview.length > 0) return preview;
            }
            return fromState;
        }
        if (isDrillingActive) return fromState;
        if (chartFiltered && fullRows.length > 0) return fullRows;
        if (!chartFiltered) {
            if (fromState.length >= fullRows.length && fromState.length > 0) return fromState;
            if (fullRows.length > 0) return fullRows;
        }
        return fromState.length > 0 ? fromState : fullRows;
    }, [
        data,
        useServerCrossFilter,
        filters,
        chartFilterMap,
        crossFilterRefreshing,
        isDrillingActive,
        graphDefinition.x_axis,
        graphDefinition.y_axis,
        drillLevelIndex,
        drillPath.length,
        expandModeActive,
        dataFetchNonce,
    ]);

    const processedChartData = useMemo(() => {
        const rows = useServerCrossFilter
            ? rawChartRows
            : filterData(rawChartRows, chartFilterMap, graphDefinition.x_axis, graphDefinition.y_axis);
        return coerceChartRows(rows);
    }, [rawChartRows, chartFilterMap, graphDefinition.x_axis, graphDefinition.y_axis, useServerCrossFilter]);

    useEffect(() => {
        setPieHoverSegment(null);
    }, [crossFiltersFetchKey, graphDefinition.id, processedChartData]);

    const hasActiveChartFilter = filterMapHasValues(chartFilterMap);
    const hasNoChartRows = !Array.isArray(processedChartData) || processedChartData.length === 0;
    const isCrossFilterActive =
        reportCrossFilterEnabled || hasActiveChartFilter || filterMapHasValues(filters);

    const activeReportTheme = reportTheme || graphDefinition.options?.reportTheme || 'theme_default';
    const isOsaPurpleTheme = activeReportTheme === 'theme_default';
    const reportPalette = useMemo(() => {
        if (isOsaPurpleTheme) return VIBRANT_PALETTE;
        const cfg = THEME_PALETTES[activeReportTheme] || THEME_PALETTES.theme_default;
        return cfg.palette || VIBRANT_PALETTE;
    }, [activeReportTheme, isOsaPurpleTheme]);

    // Legend values from baseline (full categories) so chips + Clear stay visible while filtering.
    const rawLegendValues = useMemo(() => {
        const names = new Set();
        const baselineRows = unfilteredBaselineRef.current || baselineChartDataRef.current;
        if (Array.isArray(baselineRows) && baselineRows.length > 0) {
            extractChartRows(baselineRows).forEach((d) => {
                if (d?.name != null && String(d.name).trim() !== '') names.add(d.name);
            });
        }
        if (isDrillingActive || names.size === 0) {
            extractChartRows(data).forEach((d) => {
                if (d?.name != null && String(d.name).trim() !== '') names.add(d.name);
            });
        }
        return [...names];
    }, [data, dataFetchNonce, isDrillingActive, drillLevelIndex, drillPath.length, expandModeActive]);

    // legendValues used for rendering the chart itself (filtered)
    const legendValues = useMemo(() => {
        if (!processedChartData || !Array.isArray(processedChartData)) return [];
        return [...new Set(processedChartData.map(d => d.name).filter(Boolean))];
    }, [processedChartData]);

    const barChartFooterLayout = useMemo(() => {
        const barTypes = ['bar', 'column', 'stackedColumn', 'histogram'];
        if (!barTypes.includes(graphDefinition.graph_type)) return null;
        if (!Array.isArray(processedChartData) || processedChartData.length === 0) return null;
        const hierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
        const plotWidth = dimensions.width > 0 ? Math.max(100, dimensions.width - 68) : 420;
        return computeXAxisLayout(processedChartData, {
            expandModeActive,
            compactMode: hierarchyActive,
            chartWidth: plotWidth,
        });
    }, [
        graphDefinition.graph_type,
        processedChartData,
        dimensions.width,
        expandModeActive,
        drillLevelIndex,
        drillPath.length,
    ]);

    const isDrillDownApplied = drillLevelIndex > 0 || drillPath.length > 0;
    const showDrillFilter = isDrillDownApplied
        && graphDefinition.options?.showLegend !== false
        && rawLegendValues.length > 0;

    // Must match graphDefinition.x_axis so legend clicks filter bars (incl. "City | Region" expand mode)
    const legendFilterDimension = graphDefinition.x_axis || effectiveDimFields[0] || 'series';

    const setDrillLevelIndex = (val) => {
        const nextVal = typeof val === 'function' ? val(drillLevelIndex) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillLevelIndex: nextVal
                }
            });
        }
    };

    const setDrillPath = (val) => {
        const nextVal = typeof val === 'function' ? val(drillPath) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillPath: nextVal
                }
            });
        }
    };

    const setDrillModeActive = (val) => {
        const nextVal = typeof val === 'function' ? val(drillModeActive) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    drillModeActive: nextVal
                }
            });
        }
    };

    const setExpandModeActive = (val) => {
        const nextVal = typeof val === 'function' ? val(expandModeActive) : val;
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    expandModeActive: nextVal
                }
            });
        }
    };

    const updateDrillState = (updates) => {
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    ...updates
                }
            });
        }
    };

    const graphOptionsRef = useRef(graphDefinition.options);
    graphOptionsRef.current = graphDefinition.options;

    /** Paint full chart immediately (no loader / no wait for API). */
    const instantRestoreUnfilteredChart = useCallback(() => {
        const { snap, rows, rowCount } = getUnfilteredSnapshot();
        if (rowCount === 0) return false;
        flushSync(() => {
            setData(Array.isArray(snap) ? snap : rows);
            setLoading(false);
            setCrossFilterRefreshing(false);
        });
        return rowCount > 0;
    }, [getUnfilteredSnapshot]);

    const restoreUnfilteredChartData = useCallback(() => instantRestoreUnfilteredChart(), [instantRestoreUnfilteredChart]);

    const scheduleSilentRefetchIfNeeded = useCallback(() => {
        const { rowCount } = getUnfilteredSnapshot();
        if (rowCount > 1) return;
        silentRefetchRef.current = true;
        forceUnfilteredFetchRef.current = true;
        setDataFetchNonce((n) => n + 1);
    }, [getUnfilteredSnapshot]);

    /** Clear filters and restore full chart (legend ✕ Clear) — instant when snapshot exists. */
    const resetChartToUnfiltered = useCallback(() => {
        skipFilterPropSyncRef.current = true;
        setHighlightedItem(null);
        const restored = instantRestoreUnfilteredChart();
        if (!restored) scheduleSilentRefetchIfNeeded();
    }, [setHighlightedItem, instantRestoreUnfilteredChart, scheduleSilentRefetchIfNeeded]);

    /** Per-visual slicer — returns updated filter rules array */
    const applyVisualDimensionFilter = useCallback((dimension, next) => {
        if (!dimension) return [];
        const optsNow = graphOptionsRef.current || graphDefinition.options || {};
        const current = Array.isArray(optsNow.filters) ? optsNow.filters : [];
        let nextFilters = current.filter((f) => f?.field !== dimension);
        if (next && next !== '__all__') {
            nextFilters = [
                ...nextFilters,
                { field: dimension, operator: 'equals', value: String(next) },
            ];
        }
        const nextOptions = {
            ...optsNow,
            filters: nextFilters,
        };
        graphOptionsRef.current = nextOptions;
        setVisualFilterRules(nextFilters);
        if (onUpdate) {
            onUpdate({
                options: nextOptions,
                ...(next === '__all__' ? { cached_data: null } : {}),
            });
        }
        if (next === '__all__') {
            if (crossFilterSourceVisualId === graphDefinition.id || reportCrossFilterEnabled) {
                clearReportCrossFilter();
            }
            skipFilterPropSyncRef.current = true;
            setVisualFilterRules(nextFilters);
            if (!instantRestoreUnfilteredChart()) scheduleSilentRefetchIfNeeded();
        }
        return nextFilters;
    }, [
        onUpdate,
        graphDefinition.options,
        graphDefinition.id,
        crossFilterSourceVisualId,
        reportCrossFilterEnabled,
        clearReportCrossFilter,
        instantRestoreUnfilteredChart,
        scheduleSilentRefetchIfNeeded,
    ]);

    const handleLegendFilterClear = useCallback((dimension) => {
        const dim = dimension || legendFilterDimension;
        const optsNow = graphOptionsRef.current || graphDefinition.options || {};
        const current = Array.isArray(optsNow.filters) ? optsNow.filters : [];
        const drop = new Set([dim, ...effectiveDimFields].filter(Boolean));
        const nextFilters = current.filter((f) => !drop.has(f?.field));
        if (crossFilterSourceVisualId === graphDefinition.id || reportCrossFilterEnabled) {
            clearReportCrossFilter();
        }
        skipFilterPropSyncRef.current = true;
        graphOptionsRef.current = { ...optsNow, filters: nextFilters };
        flushSync(() => {
            setVisualFilterRules(nextFilters);
            setHighlightedItem(null);
            instantRestoreUnfilteredChart();
        });
        const { rowCount } = getUnfilteredSnapshot();
        if (onUpdate) {
            onUpdate({
                options: {
                    ...optsNow,
                    filters: nextFilters,
                },
                ...(rowCount <= 1 ? { cached_data: null } : {}),
            });
        }
        if (rowCount <= 1) scheduleSilentRefetchIfNeeded();
    }, [
        legendFilterDimension,
        effectiveDimFields,
        onUpdate,
        graphDefinition.options,
        graphDefinition.id,
        crossFilterSourceVisualId,
        clearReportCrossFilter,
        reportCrossFilterEnabled,
        setHighlightedItem,
        instantRestoreUnfilteredChart,
        getUnfilteredSnapshot,
        scheduleSilentRefetchIfNeeded,
    ]);

    const visualCategoryFilters = useMemo(
        () => getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension),
        [visualFilterRules, legendFilterDimension]
    );
    const hasVisualCategoryFilter = visualCategoryFilters.length > 0;

    /** Show chip legend row when multiple categories exist, or when filtered so ✕ Clear is available. */
    const showLegendFilterRow = useMemo(() => {
        if (rawLegendValues.length === 0) return false;
        if (rawLegendValues.length > 1) return true;
        return hasVisualCategoryFilter || hasActiveChartFilter;
    }, [rawLegendValues.length, hasVisualCategoryFilter, hasActiveChartFilter]);

    const chartCategoryClickLockRef = useRef(0);
    const pieSliceDataRef = useRef([]);

    /**
     * Single path for legend chips, bar/column clicks, pie slices, scatter points, etc.
     * Always uses legendFilterDimension (x_axis) so filtering matches the legend row.
     */
    const applyCategoryClickFilter = useCallback((categoryValue, payload = null) => {
        if (categoryValue === undefined || categoryValue === null || String(categoryValue).trim() === '') return;
        if (String(categoryValue) === 'Others' || String(categoryValue) === 'Unknown') return;

        const now = Date.now();
        if (now - chartCategoryClickLockRef.current < 280) return;
        chartCategoryClickLockRef.current = now;

        const filterDimension = legendFilterDimension;
        if (!filterDimension) return;

        const currentVals = getVisualDimensionFilterValues(visualFilterRules, filterDimension);
        const pathKey = String(categoryValue);
        const isFiltered = currentVals.some((v) => String(v) === pathKey);
        if (!isFiltered) {
            const currentRows = extractChartRows(data);
            const savedRows = extractChartRows(unfilteredBaselineRef.current);
            if (currentRows.length > 1 && currentRows.length >= savedRows.length) {
                saveBaselineRows(data, true);
            } else if (savedRows.length === 0 && currentRows.length > 0) {
                saveBaselineRows(data, currentRows.length > 1);
            }
        }
        applyVisualDimensionFilter(filterDimension, isFiltered ? '__all__' : categoryValue);

        if (onSelectVisual) onSelectVisual(graphDefinition.id);

        if (isFiltered) {
            if (reportCrossFilterEnabled && crossFilterSourceVisualId === graphDefinition.id) {
                clearReportCrossFilter();
                restoreUnfilteredChartData();
            }
            return;
        }

        if (onClick) {
            const base = payload && typeof payload === 'object' ? payload : {};
            onClick({
                ...base,
                name: categoryValue,
                value: base.value,
                visualId: graphDefinition.id,
                graphTitle: `${graphDefinition.graph_type.toUpperCase()}: ${graphDefinition.x_axis}`,
                xKey: filterDimension,
                yKey: graphDefinition.y_axis || 'Count',
            });
        }
    }, [
        graphDefinition.id,
        graphDefinition.graph_type,
        graphDefinition.x_axis,
        graphDefinition.y_axis,
        legendFilterDimension,
        visualFilterRules,
        applyVisualDimensionFilter,
        onSelectVisual,
        clearReportCrossFilter,
        crossFilterSourceVisualId,
        reportCrossFilterEnabled,
        restoreUnfilteredChartData,
        onClick,
        data,
        saveBaselineRows,
    ]);

    /** Pie/donut slice — delegates to shared category filter. */
    const handlePieDonutSliceClick = useCallback((sliceEntry) => {
        if (!sliceEntry || sliceEntry.__others) return;
        applyCategoryClickFilter(sliceEntry.name, sliceEntry);
    }, [applyCategoryClickFilter]);

    /** Bar, column, line, area, scatter — direct click on marks. */
    const handleRechartsCategoryClick = useCallback((data, index, e) => {
        e?.stopPropagation?.();
        const entry = data?.payload ?? data;
        if (!entry || entry.__others) return;
        const name = entry.name ?? data?.name;
        if (name === undefined || name === null) return;
        applyCategoryClickFilter(name, {
            ...entry,
            name,
            value: entry.value ?? data?.value,
        });
    }, [applyCategoryClickFilter]);

    const resolvePieSliceEntry = useCallback((sectorProps, index) => {
        const payload = sectorProps?.payload;
        if (payload && payload.name != null && !payload.__others) return payload;
        const fromRef = pieSliceDataRef.current[index];
        if (fromRef && !fromRef.__others) return fromRef;
        if (sectorProps?.name != null) {
            return { name: sectorProps.name, value: sectorProps.value };
        }
        return null;
    }, []);

    const renderPieSliceSector = useCallback((sectorProps) => {
        const index = sectorProps?.index;
        const entry = resolvePieSliceEntry(sectorProps, index);
        const fireSliceClick = (e) => {
            e?.stopPropagation?.();
            e?.preventDefault?.();
            if (entry) handlePieDonutSliceClick(entry);
        };
        return (
            <Sector
                {...sectorProps}
                className="pie-donut-slice-sector recharts-pie-sector"
                cursor="pointer"
                onMouseDown={fireSliceClick}
                onClick={fireSliceClick}
            />
        );
    }, [handlePieDonutSliceClick, resolvePieSliceEntry]);

    // Micro-rendering thresholds — use actual measured size, but treat 0 as "not yet measured" (not micro)
    const isSmall = dimensions.width > 0 && (dimensions.width < 300 || dimensions.height < 220);
    const isMicro = dimensions.width > 0 && (dimensions.width < 180 || dimensions.height < 130);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            if (!entries.length) return;
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setTextContent(graphDefinition.content || '');
    }, [graphDefinition.content]);

    useEffect(() => {
        // Reset zoom when user switches to another visual.
        setZoomLevel(1);
    }, [graphDefinition.id]);

    useEffect(() => {
        setPieHoverSegment(null);
    }, [graphDefinition.id]);

    useEffect(() => {
        // Show All: render callout paths for every slice (all quadrants).
        if (scShowAll) setScLabelSide('all');
        else setScLabelSide('right');
    }, [scShowAll, graphDefinition.id]);

    const recenterZoomViewport = useCallback(() => {
        const el = zoomViewportRef.current;
        if (!el) return;
        const centerX = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
        const centerY = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
        el.scrollTo({ left: centerX, top: centerY, behavior: 'auto' });
    }, []);

    useEffect(() => {
        setTextContent(graphDefinition.content || '');
    }, [graphDefinition.content]);

    // Data-related properties that should trigger a re-fetch
    const dataDeps = JSON.stringify({
        graph_type: graphDefinition.graph_type,
        x_axis: graphDefinition.x_axis,
        y_axis: graphDefinition.y_axis,
        aggregation: graphDefinition.aggregation,
        dimension_fields: graphDefinition?.options?.dimension_fields || [],
        measure_fields: graphDefinition?.options?.measure_fields || [],
        drillLevelIndex,
        drillPath,
        expandModeActive
    });

    const prevDataDepsRef = useRef(dataDeps);

    const wasCrossFilterSourceRef = useRef(false);
    const prevReportCrossEnabledRef = useRef(reportCrossFilterEnabled);

    useEffect(() => {
        if (crossFilterSourceVisualId === graphDefinition.id) {
            wasCrossFilterSourceRef.current = true;
        }
    }, [crossFilterSourceVisualId, graphDefinition.id]);

    const restoreAfterCrossFilterUnlink = useCallback(() => {
        instantRestoreUnfilteredChart();
        const optsNow = graphOptionsRef.current || {};
        const current = Array.isArray(optsNow.filters) ? optsNow.filters : [];
        if (onUpdate && current.length > 0) {
            onUpdate({
                options: {
                    ...optsNow,
                    filters: [],
                },
            });
        }
    }, [onUpdate, instantRestoreUnfilteredChart]);

    useEffect(() => {
        const wasEnabled = prevReportCrossEnabledRef.current;
        prevReportCrossEnabledRef.current = reportCrossFilterEnabled;
        if (!wasEnabled || reportCrossFilterEnabled) return;
        skipFilterPropSyncRef.current = true;
        if (wasCrossFilterSourceRef.current || crossFilterSourceVisualId === graphDefinition.id) {
            wasCrossFilterSourceRef.current = false;
            restoreAfterCrossFilterUnlink();
        }
        if (!instantRestoreUnfilteredChart()) scheduleSilentRefetchIfNeeded();
    }, [
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
        graphDefinition.id,
        restoreAfterCrossFilterUnlink,
        instantRestoreUnfilteredChart,
        scheduleSilentRefetchIfNeeded,
    ]);

    useEffect(() => {
        baselineChartDataRef.current = null;
        unfilteredBaselineRef.current = null;
    }, [fileId, graphDefinition.id]);

    useEffect(() => {
        const { graph_type, x_axis, y_axis, aggregation, cached_data } = graphDefinition;
        const dimensionFields = graphDefinition?.options?.dimension_fields || null;
        const measureFields = graphDefinition?.options?.measure_fields || null;
        const cleanDimensionFieldsRaw = (Array.isArray(dimensionFields) ? dimensionFields : [])
            .filter((d) => typeof d === 'string' ? d.trim() !== '' : Boolean(d));
            
        let cleanDimensionFields = cleanDimensionFieldsRaw;
        let activeXAxis = x_axis;

        if (cleanDimensionFieldsRaw.length > 1) {
            cleanDimensionFields = getHierarchyDimensions(
                cleanDimensionFieldsRaw,
                drillLevelIndex,
                expandModeActive
            );
            activeXAxis = cleanDimensionFields[0] || cleanDimensionFieldsRaw[0];
        } else {
            activeXAxis = cleanDimensionFieldsRaw[0] || x_axis;
        }

        const cleanMeasureFields = (Array.isArray(measureFields) ? measureFields : [])
            .map((m) => typeof m === 'string' ? { column: m, aggregation: 'SUM' } : m)
            .filter((m) => m && m.column && String(m.column).trim() !== '');
        const measureFieldsForApi = buildMeasureFieldsForApi(
            graphDefinition,
            cleanMeasureFields,
            y_axis,
            aggregation
        );
        // Keep a tiny minimum loader to avoid flicker, but never force a 2s delay.
        const waitMinLoader = async (startedAt) => {
            const elapsed = Date.now() - startedAt;
            const remaining = 150 - elapsed;
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
        };

        if (fetchAbortRef.current) {
            fetchAbortRef.current.abort();
        }
        const abortController = new AbortController();
        fetchAbortRef.current = abortController;

        // If the data is already provided in the graph definition, use it directly
        // However, bypass the cache if the user is actively drilling down, so we fetch fresh sliced data
        const isDrilling = isDrillingActive;
        const activeFiltersForFetch = useServerCrossFilter ? filters : {};
        const hasSlicerFilters = filterMapHasValues(activeFiltersForFetch);
        const hasPriorChartData = Array.isArray(baselineChartDataRef.current) && baselineChartDataRef.current.length > 0;
        const isCrossFilterRefresh = hasSlicerFilters && hasPriorChartData;

        let prevDeps = {};
        let nextDeps = {};
        try {
            prevDeps = JSON.parse(prevDataDepsRef.current || '{}');
            nextDeps = JSON.parse(dataDeps || '{}');
        } catch {
            prevDeps = {};
            nextDeps = {};
        }
        const dataDepsChanged = prevDataDepsRef.current !== dataDeps;
        prevDataDepsRef.current = dataDeps;
        const onlyMeasureOrAggChanged = dataDepsChanged
            && prevDeps.x_axis === nextDeps.x_axis
            && JSON.stringify(prevDeps.dimension_fields) === JSON.stringify(nextDeps.dimension_fields)
            && (
                prevDeps.aggregation !== nextDeps.aggregation
                || prevDeps.y_axis !== nextDeps.y_axis
                || JSON.stringify(prevDeps.measure_fields) !== JSON.stringify(nextDeps.measure_fields)
            );
        const isFieldWellSoftRefresh = hasPriorChartData && !isDrilling && onlyMeasureOrAggChanged;
        const isSoftRefresh = isCrossFilterRefresh || isFieldWellSoftRefresh;
        const crossFilterJustCleared = Boolean(prevCrossFiltersFetchKeyRef.current) && !crossFiltersFetchKey;
        prevCrossFiltersFetchKeyRef.current = crossFiltersFetchKey;
        const forceUnfilteredFetch = forceUnfilteredFetchRef.current;
        if (forceUnfilteredFetch) forceUnfilteredFetchRef.current = false;
        const isSilentRefetch = silentRefetchRef.current;
        if (isSilentRefetch) silentRefetchRef.current = false;
        const { rowCount: baselineRowCount } = getUnfilteredSnapshot();

        // Clear / unlink: use in-memory snapshot; skip API unless snapshot is missing or single-point.
        if ((crossFilterJustCleared || forceUnfilteredFetch) && baselineRowCount > 1) {
            instantRestoreUnfilteredChart();
            return () => abortController.abort();
        }

        if (
            cached_data
            && !isDrilling
            && !hasSlicerFilters
            && !dataDepsChanged
            && !crossFilterJustCleared
            && !forceUnfilteredFetch
        ) {
            setConfigHint(null);
            if (cached_data.is_table) {
                setData({
                    columns: cached_data.columns || [],
                    rows: cached_data.rows || []
                });
                saveBaselineRows(extractChartRows({
                    columns: cached_data.columns || [],
                    rows: cached_data.rows || [],
                }), true);
                setLoading(false);
                return () => abortController.abort();
            }

            if (Array.isArray(cached_data.labels)) {
                const transformedData = coerceChartRows(
                    cached_data.labels.map((label, index) => ({
                        name: label,
                        value: cached_data.values ? cached_data.values[index] : null,
                    }))
                );
                setData(transformedData);
                saveBaselineRows(transformedData, true);
                setScTotalPoints(Number(cached_data.total_points) || transformedData.length);
            }
            setLoading(false);
            return () => abortController.abort();
        }

        // ── Custom visuals: fetch data using the user's selected dimension/measure fields,
        //    but use 'bar' as the backend graph_type (it always returns labels+values).
        //    Then transform into Recharts-friendly [{name, subject, value}] format.
        const isCustomVisual = installedVisuals.some(v => v.id === graph_type);
        if (isCustomVisual) {
            const dimField = activeXAxis || null;
            const measField = y_axis || cleanMeasureFields[0]?.column || null;
            const measAgg = aggregation || cleanMeasureFields[0]?.aggregation?.toLowerCase() || 'sum';

            if (!fileId || !dimField || !measField) {
                // Don't auto-guess fields; ask user to configure buckets explicitly.
                setData([]);
                baselineChartDataRef.current = null;
                setLoading(false);
                setError(null);
                setConfigHint('Select at least one Dimension and one Measure to render this visual.');
                return () => abortController.abort();
            }

            const finishCrossFilterTransition = () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setCrossFilterRefreshing(false));
                });
            };

            const fetchCustomData = async () => {
                const startedAt = Date.now();
                if (isSilentRefetch) { /* keep current chart visible */ }
                else if (isSoftRefresh) setCrossFilterRefreshing(true);
                else setLoading(true);
                setError(null);
                setConfigHint(null);
                try {
                    const response = await fetch(`/api/files/${fileId}/graph-data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: abortController.signal,
                        body: JSON.stringify({
                            graph_type: 'bar',  // proxy type the backend understands
                            x_axis: dimField,
                            y_axis: measField,
                            aggregation: measAgg,
                            dimension_fields: cleanDimensionFields.length ? cleanDimensionFields : (dimField ? [dimField] : []),
                            measure_fields: buildMeasureFieldsForApi(graphDefinition, cleanMeasureFields, measField, measAgg),
                            drill_filters: drillPath,
                            active_filters: activeFiltersForFetch,
                        })
                    });

                    if (!response.ok) {
                        setData([]);
                        setError(null);
                        setLoading(false);
                        return;
                    }

                    const result = await response.json();

                    // Backend returns { labels: [...], values: [...] }
                    // Transform → [{ name, subject, value }] for Recharts
                    if (result && Array.isArray(result.labels)) {
                        const transformed = result.labels.map((label, i) => ({
                            name: String(label),
                            subject: String(label),
                            value: result.values?.[i] ?? 0
                        }));
                        if (transformed.length > 0) {
                            setData(transformed);
                            if (!isDrilling && !hasSlicerFilters) saveBaselineRows(transformed, true);
                        }
                        setScTotalPoints(result.total_points || transformed.length);
                    } else if (Array.isArray(result)) {
                        if (result.length > 0) {
                            setData(result);
                            if (!isDrilling && !hasSlicerFilters) saveBaselineRows(result, true);
                        }
                    } else {
                        setData([]);
                        setError(null);
                    }
                } catch (err) {
                    if (err?.name === 'AbortError') return;
                    console.error('Custom visual data fetch failed:', err);
                    setData([]);
                    setError(null);
                } finally {
                    if (!abortController.signal.aborted) {
                        if (isSilentRefetch) setLoading(false);
                        else if (isSoftRefresh) finishCrossFilterTransition();
                        else await waitMinLoader(startedAt);
                        if (!isSilentRefetch) setLoading(false);
                    }
                }
            };

            fetchCustomData();
            return () => {
                abortController.abort();
                setCrossFilterRefreshing(false);
            };
        }

        const noDataTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate', 'smart_narrative']);
        if (!fileId || noDataTypes.has(graph_type)) {
            // These visual types don't require API data; they render from options/content only.
            // Keep `data` as-is; rendering will bypass the empty-data guard below.
            if (graph_type === 'text') {
                setData([{ name: 'text', value: 0 }]);
            } else if (graph_type === 'smart_narrative') {
                setData([{ name: 'smart_narrative', value: 0 }]);
            }
            setConfigHint(null);
            setLoading(false);
            return () => abortController.abort();
        }

        if (graph_type !== 'table') {
            const hasDimension = Boolean((activeXAxis && String(activeXAxis).trim()) || cleanDimensionFields.length > 0);
            const hasMeasure = Boolean((y_axis && String(y_axis).trim()) || cleanMeasureFields.length > 0);
            const needsDimension = graph_type !== 'kpiCard' && graph_type !== 'metricCard';

            if ((needsDimension && !hasDimension) || !hasMeasure) {
                setData([]);
                baselineChartDataRef.current = null;
                setLoading(false);
                setError(null);
                if (graph_type === 'kpiCard' || graph_type === 'metricCard') {
                    setConfigHint('Select at least one Measure to render this card.');
                } else {
                    setConfigHint('Select at least one Dimension and one Measure to render this visual.');
                }
                return () => abortController.abort();
            }
        }

        const finishCrossFilterTransition = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setCrossFilterRefreshing(false));
            });
        };

        const fetchData = async () => {
            const startedAt = Date.now();
            try {
                if (isSilentRefetch) { /* keep current chart visible */ }
                else if (isSoftRefresh) setCrossFilterRefreshing(true);
                else setLoading(true);
                setConfigHint(null);

                const payload = {
                    graph_type,
                    x_axis: activeXAxis,
                    y_axis,
                    aggregation,
                    dimension_fields: cleanDimensionFields,
                    measure_fields: measureFieldsForApi,
                    drill_filters: drillPath,
                    active_filters: activeFiltersForFetch,
                };

                const response = await fetch(`/api/files/${fileId}/graph-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: abortController.signal,
                    body: JSON.stringify(payload)
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.warn('Graph data request failed:', result?.detail || result?.message || response.status);
                    if (!isCrossFilterRefresh) setData([]);
                    setError(null);
                    return;
                }

                if (!result) {
                    if (!isCrossFilterRefresh) setData([]);
                    setError(null);
                    return;
                }
                if (result && typeof result === 'object' && result.processing) {
                    // Backend is preparing the dataset (common for blank report + SQL-imported tables).
                    // Keep loading so the user doesn't see "No data".
                    setError(null);
                    setConfigHint(result.message || 'Preparing data…');
                    return;
                }

                if (graph_type === 'table') {
                    if (result.columns && result.rows) {
                        setData({ columns: result.columns, rows: result.rows });
                        if (onUpdate) {
                            onUpdate({
                                cached_data: {
                                    is_table: true,
                                    columns: result.columns,
                                    rows: result.rows
                                }
                            });
                        }
                    } else {
                        setData({ columns: [], rows: [] });
                        setError(null);
                    }
                    return;
                }

                if (graph_type === 'decomp_tree') {
                    setData(result);
                    return;
                }

                if (!Array.isArray(result.labels)) {
                    if (!isCrossFilterRefresh) setData([]);
                    setError(null);
                    return;
                }

                const transformedData = coerceChartRows(
                    result.labels.map((label, index) => ({
                        name: label,
                        value: result.values ? result.values[index] : null,
                    }))
                );

                if (transformedData.length > 0) {
                    setData(transformedData);
                    if (!isDrilling && !hasSlicerFilters) saveBaselineRows(transformedData, true);
                } else if (!isCrossFilterRefresh) {
                    setData([]);
                    setError(null);
                }
                setScTotalPoints(Number(result.total_points) || transformedData.length);
                const saveCache = !hasSlicerFilters;
                if (onUpdate && saveCache) {
                    const optsNow = graphDefinition.options || {};
                    onUpdate({
                        cached_data: {
                            labels: result.labels,
                            values: result.values,
                            total_points: result.total_points,
                        },
                        options: {
                            ...optsNow,
                            ...(result.axis_mapping ? { axis_mapping: result.axis_mapping } : {}),
                        },
                    });
                }
            } catch (err) {
                if (err?.name === 'AbortError') return;
                console.error('Graph data fetch failed:', err);
                if (!isCrossFilterRefresh) setData([]);
                setError(null);
            } finally {
                if (!abortController.signal.aborted) {
                    if (isSilentRefetch) setLoading(false);
                    else if (isSoftRefresh) finishCrossFilterTransition();
                    else await waitMinLoader(startedAt);
                    if (!isSilentRefetch) setLoading(false);
                }
            }
        };

        fetchData();
        return () => {
            abortController.abort();
            setCrossFilterRefreshing(false);
        };
    }, [
        fileId,
        dataDeps,
        crossFiltersFetchKey,
        dataFetchNonce,
        saveBaselineRows,
        isDrillingActive,
        instantRestoreUnfilteredChart,
        getUnfilteredSnapshot,
    ]);

    const handleClick = useCallback((state) => {
        let payload = null;
        if (state?.activePayload?.length > 0) {
            payload = state.activePayload[0].payload;
        } else if (state?.payload) {
            payload = state.payload;
        } else if (state?.name != null && state?.value !== undefined) {
            payload = state;
        }

        let rawVal = null;
        if (payload?.name !== undefined && payload?.name !== null) {
            rawVal = payload.name;
        } else if (state?.activeLabel !== undefined && state?.activeLabel !== null) {
            rawVal = state.activeLabel;
        } else if (payload?.value !== undefined && payload?.value !== null) {
            rawVal = payload.value;
        }

        if (rawVal === null || rawVal === undefined) return;
        if (payload?.__others) return;

        applyCategoryClickFilter(rawVal, payload);
    }, [applyCategoryClickFilter]);

    /** Normalizes Recharts bar/line vs pie slice click payloads into handleClick shape. */
    const handleChartPointerClick = (stateOrSlice) => {
        if (!stateOrSlice || stateOrSlice.__others) return;
        const slicePayload = stateOrSlice.payload ?? stateOrSlice;
        if (slicePayload?.__others) return;
        const sliceName = slicePayload?.name ?? stateOrSlice?.name;
        if (sliceName == null || String(sliceName).trim() === '') return;
        if (String(sliceName) === 'Others') return;
        const isPieDonut =
            graphDefinition.graph_type === 'pie'
            || graphDefinition.graph_type === 'donut';
        if (isPieDonut) {
            handlePieDonutSliceClick(slicePayload?.name != null ? slicePayload : { name: sliceName, value: slicePayload?.value });
            return;
        }
        if (stateOrSlice.activePayload) {
            handleClick(stateOrSlice);
            return;
        }
        const normalized = {
            name: sliceName,
            value: slicePayload?.value ?? stateOrSlice?.value,
            ...slicePayload,
        };
        handleClick({
            payload: normalized,
            activePayload: [{ payload: normalized }],
        });
    };

    const renderChart = () => {
        const animation = !isExporting && !isDragging && !hasActiveChartFilter && !crossFilterRefreshing;
        const opts = graphDefinition.options || {};
        const activeTheme = reportTheme || opts.reportTheme || 'theme_default';
        const isDark = activeTheme === 'theme_dark';
        const axisTickColor = isDark ? '#f1f5f9' : '#4b5563';
        const axisTitleColor = isDark ? '#f1f5f9' : '#4b5563';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        const tableBorderColor = isDark ? '#334155' : '#e5e7eb';
        const tableHeaderBg = isDark ? '#0f172a' : '#f9fafb';
        const tableHeaderTextColor = isDark ? '#f1f5f9' : '#374151';
        const tableRowHover = isDark ? '#1e293b' : '#f3f4f6';
        const tableCellBorder = isDark ? '#1e293b' : '#f3f4f6';
        const tableCellText = isDark ? '#cbd5e1' : '#4b5563';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipText = isDark ? '#f1f5f9' : '#1e293b';
        const tooltipSubtext = isDark ? '#94a3b8' : '#64748b';
        const lineStrokeColor = isDark ? '#94a3b8' : '#1a1a1a';
        
        const themeConfig = THEME_PALETTES[activeTheme] || THEME_PALETTES.theme_default;
        const isOsaPurple = activeTheme === 'theme_default' || themeConfig.useVibrantPalette;
        const palette = isOsaPurple ? VIBRANT_PALETTE : (themeConfig.palette || VIBRANT_PALETTE);
        const isSmall = opts.size === 'small' || (opts.width && opts.width < 400);
        const isMicro = opts.size === 'small' || (opts.width && opts.width < 250);
        const mainColor = opts.mainColor || (
            isOsaPurple
                ? getThemeColor(graphDefinition.id, VIBRANT_PALETTE)
                : (palette[0] || getThemeColor(graphDefinition.id, palette))
        );
        const categoryColor = (categoryName, index) => {
            if (opts.mainColor) return mainColor;
            if (isOsaPurple) {
                return getCategoryColor(categoryName, index, VIBRANT_PALETTE);
            }
            return getCategoryColor(categoryName, index, palette);
        };

        const renderInteractiveLegend = ({ payload }) => {
            const fromPayload = (payload || [])
                .map((entry) => entry.value)
                .filter((v) => v != null && String(v).trim() !== '');
            const values = rawLegendValues.length > 0 ? rawLegendValues : fromPayload;
            if (!values.length || !legendFilterDimension) return null;
            return (
                <LegendComponent
                    dimension={legendFilterDimension}
                    values={values}
                    maxItems={values.length > 8 ? 6 : 12}
                    variant="chips"
                    layout="horizontal"
                    filterScope="visual"
                    visualFilters={visualFilterRules}
                    onVisualFilterChange={applyVisualDimensionFilter}
                    onFilterClear={handleLegendFilterClear}
                    colorPalette={palette}
                />
            );
        };
        // ─────────────────────────────────────────────────────────────────────

        const pieLabelFontSize = isMicro ? 9 : (isSmall ? 10 : 12);
        const pieLabelNameLimit = isMicro ? 8 : (isSmall ? 12 : 18);
        const pieMargin = isMicro
            ? { top: 10, right: 34, bottom: 10, left: 34 }
            : (isSmall ? { top: 16, right: 50, bottom: 16, left: 50 } : { top: 20, right: 70, bottom: 20, left: 70 });
        const pieOuterRadius = isMicro ? '56%' : (isSmall ? '64%' : '74%');
        const pieInnerRadius = graphDefinition.graph_type === 'donut'
            ? (isMicro ? '32%' : (isSmall ? '40%' : '50%'))
            : 0;
        const formatNumber = (num, mode = 'compact') => {
            if (typeof num !== 'number' || !Number.isFinite(num)) return num;
            if (opts.numberFormat === 'integer') return Math.round(num).toLocaleString();
            if (opts.numberFormat === 'decimal') {
                return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            }
            if (opts.numberFormat === 'currency') return '$' + num.toLocaleString();
            if (opts.numberFormat === 'percentage') return num.toLocaleString() + '%';
            return formatChartNumber(num, mode);
        };
        const yAxisDisplayTitle = getYAxisTitle(graphDefinition, opts);
        const xAxisDisplayTitle = getXAxisTitle(graphDefinition, opts);
        const renderPieDonutLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
            const RADIAN = Math.PI / 180;
            const direction = Math.cos(-midAngle * RADIAN) >= 0 ? 1 : -1;
            const lineStartRadius = outerRadius + (isMicro ? 4 : 6);
            const lineEndRadius = outerRadius + (isMicro ? 10 : 16);
            const labelRadius = outerRadius + (isMicro ? 14 : 24);

            const sx = cx + lineStartRadius * Math.cos(-midAngle * RADIAN);
            const sy = cy + lineStartRadius * Math.sin(-midAngle * RADIAN);
            const mx = cx + lineEndRadius * Math.cos(-midAngle * RADIAN);
            const my = cy + lineEndRadius * Math.sin(-midAngle * RADIAN);
            const ex = mx + direction * (isMicro ? 6 : 10);
            const ey = my;

            const labelName = String(name ?? '');
            const compactName = labelName.length > pieLabelNameLimit
                ? `${labelName.slice(0, pieLabelNameLimit)}...`
                : labelName;
            const labelText = `${compactName}: ${formatNumber(value)}`;

            return (
                <g>
                    <polyline
                        points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
                        fill="none"
                        stroke="#000000"
                        strokeWidth={1}
                    />
                    <text
                        x={cx + labelRadius * Math.cos(-midAngle * RADIAN)}
                        y={cy + labelRadius * Math.sin(-midAngle * RADIAN)}
                        textAnchor={direction === 1 ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={pieLabelFontSize}
                        fontWeight={500}
                        fill="#000000"
                    >
                        {labelText}
                    </text>
                </g>
            );
        };

                if (graphDefinition.graph_type === 'table') {
            if (!data || !data.columns || !data.rows) return <div>Invalid table data</div>;
            return (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', borderRadius: '8px', border: `1px solid ${tableBorderColor}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: tableHeaderBg, zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <tr>
                                {data.columns.map((col, i) => (
                                    <th key={i} style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${tableBorderColor}`, color: tableHeaderTextColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(processedChartData || data.rows).map((row, i) => (
                                <tr key={i} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = tableRowHover} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    {data.columns.map((col, j) => (
                                        <td key={j} style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${tableCellBorder}`, color: tableCellText }}>
                                            {row[col] !== null ? row[col].toString() : '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Prepare and Sort Data (only for array data charts)
        let chartData = Array.isArray(processedChartData) ? [...processedChartData] : [];
        // Page/report filters only — visual + cross filters already applied in processedChartData.
        const reportPageFilters = [
            ...(Array.isArray(opts.reportFilters) ? opts.reportFilters : []),
            ...(Array.isArray(opts.pageFilters) ? opts.pageFilters : []),
        ].filter((f) => f && f.field && f.operator && f.operator !== 'all');

        if (reportPageFilters.length > 0) {
            chartData = chartData.filter((row) => {
                return reportPageFilters.every((f) => {
                    const candidate =
                        row?.[f.field] ??
                        (f.field === graphDefinition.x_axis ? row?.name : undefined) ??
                        (f.field === graphDefinition.y_axis || f.field === 'value' ? row?.value : undefined);
                    if (candidate == null) return false;
                    const cStr = String(candidate).toLowerCase();
                    const vStr = String(f.value ?? '').toLowerCase();
                    if (f.operator === 'equals') return cStr === vStr;
                    if (f.operator === 'contains') return cStr.includes(vStr);
                    if (f.operator === 'gt') return Number(candidate) > Number(f.value);
                    if (f.operator === 'lt') return Number(candidate) < Number(f.value);
                    return true;
                });
            });
        }
        if (opts.sort === 'asc') chartData.sort((a, b) => a.value - b.value);
        if (opts.sort === 'desc') chartData.sort((a, b) => b.value - a.value);

        const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
        const plotWidth = dimensions.width > 0 ? Math.max(100, dimensions.width - 68) : 420;
        const xLayout = computeXAxisLayout(chartData, {
            expandModeActive,
            compactMode: isHierarchyActive,
            chartWidth: plotWidth,
        });
        const yAxisDomain = chartData.length > 0 && chartData.every((d) => Number(d?.value ?? 0) >= 0)
            ? [0, 'auto']
            : undefined;
        const totalValue = chartData.reduce((sum, entry) => sum + (entry.value || 0), 0);

        const barChartTypes = ['bar', 'column', 'stackedColumn', 'histogram'];
        const isBarFamily = barChartTypes.includes(graphDefinition.graph_type);
        const showBarDataLabels = isBarFamily
            && opts.showDataLabels !== false
            && !isMicro
            && !isSmall
            && chartData.length > 0
            && chartData.length <= 28;

        const showAxisTitles = opts.showAxisTitles !== false && !isMicro;
        const xTitleText = xAxisDisplayTitle;
        const yTitleText = yAxisDisplayTitle;
        const yAxisTitleLabel = showAxisTitles ? buildYAxisTitleLabel(yTitleText) : undefined;
        const chartBottomMargin = computeChartBottomMargin(xLayout);
        const yAxisTickWidth = showAxisTitles && yTitleText ? 58 : 50;

        const tooltipFormatter = (value, name, props) => {
            const val = formatNumber(value, 'full');
            const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) + '%' : null;
            const category = props?.payload?.name ?? name;
            return [
                <div key="tt" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {category && (
                        <div style={{ fontSize: '11px', color: tooltipSubtext, fontWeight: 600 }}>{category}</div>
                    )}
                    <div style={{ fontWeight: 700, color: tooltipText }}>{yAxisDisplayTitle}: {val}</div>
                    {percentage && (
                        <div style={{ fontSize: '11px', color: tooltipSubtext, opacity: 0.8 }}>
                            {percentage} of total
                        </div>
                    )}
                </div>,
                yAxisDisplayTitle
            ];
        };

        const customVisual = installedVisuals.find(v => v.id === graphDefinition.graph_type);
        if (customVisual) {
            const customConfig = { ...opts, xAxis: graphDefinition.x_axis, yAxis: graphDefinition.y_axis };
            return <CustomVisualRenderer visual={customVisual} data={chartData} config={customConfig} />;
        }

        const buildSankeyData = () => {
            if (graphDefinition?.sankeyData?.nodes?.length && graphDefinition?.sankeyData?.links?.length) {
                return graphDefinition.sankeyData;
            }

            if (!Array.isArray(chartData) || chartData.length === 0) return null;

            const dimensionFields = Array.isArray(opts.dimension_fields) ? opts.dimension_fields : [];
            const sourceField = opts.sankeySourceField || graphDefinition.sankeySourceField || dimensionFields[0] || 'source';
            const targetField = opts.sankeyTargetField || graphDefinition.sankeyTargetField || dimensionFields[1] || 'target';
            const valueField = opts.sankeyValueField || graphDefinition.sankeyValueField || graphDefinition.y_axis || 'value';

            // Aggregate duplicate source->target edges.
            const edgeMap = new Map();
            for (const row of chartData) {
                const srcRaw = row?.[sourceField] ?? row?.source ?? row?.from ?? row?.name;
                const tgtRaw = row?.[targetField] ?? row?.target ?? row?.to;
                const valRaw = row?.[valueField] ?? row?.value ?? 1;

                if (srcRaw == null || tgtRaw == null) continue;
                const src = String(srcRaw).trim();
                const tgt = String(tgtRaw).trim();
                if (!src || !tgt) continue;

                const val = Number(valRaw);
                const safeVal = Number.isFinite(val) && val > 0 ? val : 1;
                const key = `${src}__->__${tgt}`;
                edgeMap.set(key, (edgeMap.get(key) || 0) + safeVal);
            }

            // Fallback: if target doesn't exist in data, build root -> category flow
            if (edgeMap.size === 0) {
                for (const row of chartData) {
                    const tgtRaw = row?.name ?? row?.label ?? row?.[sourceField];
                    if (tgtRaw == null) continue;
                    const tgt = String(tgtRaw).trim();
                    if (!tgt) continue;
                    const val = Number(row?.[valueField] ?? row?.value ?? 1);
                    const safeVal = Number.isFinite(val) && val > 0 ? val : 1;
                    const key = `Total__->__${tgt}`;
                    edgeMap.set(key, (edgeMap.get(key) || 0) + safeVal);
                }
            }

            if (edgeMap.size === 0) return null;

            const nodeIndex = new Map();
            const nodes = [];
            const ensureNode = (name) => {
                if (nodeIndex.has(name)) return nodeIndex.get(name);
                const idx = nodes.length;
                nodeIndex.set(name, idx);
                nodes.push({ name });
                return idx;
            };

            const links = [];
            [...edgeMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 180)
                .forEach(([k, v]) => {
                    const [src, tgt] = k.split('__->__');
                    const s = ensureNode(src);
                    const t = ensureNode(tgt);
                    if (s === t) return;
                    links.push({ source: s, target: t, value: v });
                });

            if (links.length === 0 || nodes.length < 2) return null;
            return { nodes, links };
        };

        switch (graphDefinition.graph_type) {
            case 'smart_narrative': {
                return (
                    <SmartNarrativeVisual
                        fileId={fileId}
                        dataset={data}
                        graphDefinition={graphDefinition}
                        onUpdate={onUpdate}
                    />
                );
            }
            case 'qna': {
                return (
                    <QnaVisual fileId={fileId} isDark={reportTheme === 'theme_dark'} />
                );
            }
            case 'decomp_tree': {
                const dims = data?.dimensions || [];

                // Identify the actual measurement key in the grouped rows.
                // The backend uses a format like "SUM_Sales" for the DataFrame column,
                // grouping by the provided dimensions.
                const rowKeys = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];
                const measureField = rowKeys.find(k => !dims.includes(k) && k !== 'id' && k !== '__sort_value') || rowKeys[rowKeys.length - 1];

                if (!data || !data.rows || data.rows.length === 0 || !measureField || dims.length === 0) {
                    return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: tooltipSubtext }}>
                            <GitBranch size={48} color={axisTickColor} style={{ marginBottom: '16px' }} />
                            <div style={{ fontWeight: 600, fontSize: '14px', color: axisTitleColor }}>Decomposition Tree</div>
                            <div style={{ fontSize: '12px', marginTop: '8px', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
                                To generate a decomposition tree, please add a field to the <strong>Measures</strong> bucket and one or more fields to the <strong>Dimensions</strong> bucket.
                            </div>
                        </div>
                    );
                }

                const displayMeasureName = data?.measures?.[0] || measureField;

                const toggleExpand = (id) => {
                    setExpandedNodeIds(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    );
                };

                // Build tree dynamically
                const treeRoot = { name: 'Total', value: 0, children: {}, id: 'root' };
                data.rows.forEach(row => {
                    const val = Number(row[measureField]) || 0;
                    treeRoot.value += val;
                    let current = treeRoot;
                    dims.forEach((dim, idx) => {
                        const dVal = String(row[dim]);
                        if (!current.children[dVal]) {
                            current.children[dVal] = { name: dVal, value: 0, children: {}, id: current.id + '|' + dVal, level: idx };
                        }
                        current.children[dVal].value += val;
                        current = current.children[dVal];
                    });
                });

                const TreeConnector = ({ childCount, isRoot, color = "#cbd5e1" }) => {
                    const nodeHeight = isRoot ? 64 : 52;
                    const gap = isRoot ? 12 : 8;
                    const svgWidth = 40;
                    const totalHeight = childCount * nodeHeight + (childCount - 1) * gap;

                    const parentY = totalHeight / 2;
                    const paths = [];

                    for (let i = 0; i < childCount; i++) {
                        const childY = (i * nodeHeight) + (nodeHeight / 2) + (i * gap);
                        // Using a cubic bezier for smooth S-curves
                        // Start point: (0, parentY)
                        // End point: (svgWidth, childY)
                        // Control points to enforce horizontal entry/exit
                        const cp1x = svgWidth * 0.5;
                        const cp2x = svgWidth * 0.5;
                        paths.push(`M 0 ${parentY} C ${cp1x} ${parentY}, ${cp2x} ${childY}, ${svgWidth} ${childY}`);
                    }

                    return (
                        <div style={{ width: svgWidth, height: totalHeight, flexShrink: 0, pointerEvents: 'none' }}>
                            <svg width={svgWidth} height={totalHeight} viewBox={`0 0 ${svgWidth} ${totalHeight}`} style={{ display: 'block' }}>
                                {paths.map((d, idx) => (
                                    <path
                                        key={idx}
                                        d={d}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        style={{ opacity: 0.6 }}
                                    />
                                ))}
                            </svg>
                        </div>
                    );
                };

                const renderNode = (node) => {
                    if (!node) return null;
                    const isExpan = expandedNodeIds.includes(node.id);
                    const hasChildren = Object.keys(node.children || {}).length > 0;
                    const isRoot = node.id === 'root';

                    const sortedChildren = hasChildren ? Object.values(node.children).sort((a, b) => b.value - a.value) : [];
                    const nodeLabel = isRoot ? (displayMeasureName ? displayMeasureName : 'Total') : node.name;

                    return (
                        <div key={node.id} style={{ display: 'flex', alignItems: 'center', transition: 'all 0.3s ease-in-out' }}>
                            <div
                                onClick={() => hasChildren && toggleExpand(node.id)}
                                style={{
                                    flexShrink: 0, width: isRoot ? '140px' : '160px', padding: isRoot ? '12px' : '10px',
                                    background: '#fff',
                                    border: isExpan ? '2px solid #8c2546' : '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    boxShadow: isRoot ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    position: 'relative',
                                    cursor: hasChildren ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                    zIndex: 5
                                }}
                            >
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: isRoot ? '4px' : '3px', background: isExpan ? '#8c2546' : (isRoot ? '#10b981' : '#94a3b8'), borderRadius: '4px 0 0 4px' }} />

                                <div style={{ fontSize: isRoot ? '10px' : '11px', fontWeight: isRoot ? 600 : 700, color: isRoot ? '#64748b' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {nodeLabel}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: isRoot ? '16px' : '10px', marginTop: isRoot ? '4px' : '2px', fontWeight: isRoot ? 800 : 400 }}>
                                    <span style={{ color: isRoot ? '#1e293b' : '#64748b' }}>{formatNumber(node.value)}</span>
                                    {!isRoot && treeRoot.value > 0 && (
                                        <span style={{ color: '#8c2546', fontWeight: 600 }}>{((node.value / treeRoot.value) * 100).toFixed(1)}%</span>
                                    )}
                                </div>

                                {hasChildren && (
                                    <div style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: '#8c2546', zIndex: 10 }}>
                                        {isExpan ? 'âˆ’' : '+'}
                                    </div>
                                )}
                            </div>

                            {isExpan && hasChildren && (
                                <>
                                    <TreeConnector
                                        childCount={sortedChildren.length}
                                        isRoot={isRoot}
                                        color={isRoot ? "#8c2546" : "#cbd5e1"}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: isRoot ? '12px' : '8px', position: 'relative' }}>
                                        {sortedChildren.map(child => renderNode(child))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                };

                return (
                    <div className="decomp-tree-canvas" style={{ width: '100%', height: '100%', background: '#f8fafc', overflowX: 'auto', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', padding: '40px' }}>
                            {renderNode(treeRoot)}
                        </div>
                    </div>
                );
            }
            case 'influencers': {
                return <InfluencersVisual fileId={fileId} graphDefinition={graphDefinition} isDark={reportTheme === 'theme_dark'} />;
            }
            case 'image': {
                const src = opts.src;
                if (!src) {
                    return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px' }}>
                            No image selected
                        </div>
                    );
                }
                return (
                    <img
                        src={src}
                        alt={opts.alt || 'Inserted image'}
                        draggable={false}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: opts.fit || 'contain',
                            borderRadius: '4px',
                            userSelect: 'none',
                            pointerEvents: 'none'
                        }}
                    />
                );
            }
            case 'shape': {
                const shape = opts.shape || 'rectangle';
                const fill = opts.fill || 'rgba(140, 37, 70, 0.12)';
                const stroke = opts.stroke || 'rgba(140, 37, 70, 0.9)';
                const strokeWidth = opts.strokeWidth ?? 2;

                const element = (() => {
                    switch (shape) {
                        case 'oval':
                            return <ellipse cx="50" cy="50" rx="42" ry="32" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                        case 'line':
                            return <line x1="12" y1="50" x2="88" y2="50" stroke={stroke} strokeWidth={Math.max(2, Number(strokeWidth) || 2)} strokeLinecap="round" />;
                        case 'triangle':
                            return <path d="M50 14 L88 86 L12 86 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                        case 'arrow':
                            return <path d="M14 52 H70 V36 L88 50 L70 64 V52 H14 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
                        case 'rectangle':
                        default:
                            return <rect x="14" y="20" width="72" height="60" rx="6" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                    }
                })();

                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
                            {element}
                        </svg>
                    </div>
                );
            }
            case 'button': {
                const label = opts.label || 'Button';
                const variant = opts.variant || 'primary';
                const bg = variant === 'secondary' ? '#f1f5f9' : '#7a1e3a';
                const fg = variant === 'secondary' ? '#0f172a' : '#ffffff';
                const border = variant === 'secondary' ? '#cbd5e1' : '#7a1e3a';

                if (isEditing) {
                    return (
                        <input
                            value={textContent}
                            autoFocus
                            onChange={(e) => setTextContent(e.target.value)}
                            onBlur={() => {
                                setIsEditing(false);
                                if (onUpdate && !isViewOnly) onUpdate({ options: { ...(opts || {}), label: textContent || 'Button' } });
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: '1px solid #8c2546',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                outline: 'none'
                            }}
                        />
                    );
                }

                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onClick) onClick(graphDefinition);
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setTextContent(label);
                                setIsEditing(true);
                            }}
                            style={{
                                width: '92%',
                                height: '60%',
                                borderRadius: '10px',
                                border: `1px solid ${border}`,
                                background: bg,
                                color: fg,
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: isDragging ? 'grabbing' : 'pointer',
                                boxShadow: '0 6px 16px rgba(2, 6, 23, 0.08)',
                                userSelect: 'none'
                            }}
                            title="Double-click to rename"
                        >
                            {label}
                        </button>
                    </div>
                );
            }
            case 'power_automate': {
                return <PowerAutomateVisual visualId={graphDefinition.id} />;
            }
            case 'bar':
            case 'column':
            case 'stackedColumn':
            case 'histogram':
                return (
                    <BarChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: showBarDataLabels ? 22 : 10, right: 10, left: 20, bottom: chartBottomMargin }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={isDark ? 0.2 : 0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={{ stroke: gridColor }}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tickMargin={xLayout.tickMargin}
                                tick={{ fill: axisTickColor, fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels, xLayout.tickMaxLen)}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={yAxisTickWidth}
                                domain={yAxisDomain}
                                label={yAxisTitleLabel}
                            />
                        )}
                        <Tooltip cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} />
                        <Bar
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={animation}
                            fill={mainColor}
                            stackId={graphDefinition.graph_type === 'stackedColumn' ? "a" : undefined}
                            className="chart-bar-marks"
                            onClick={handleRechartsCategoryClick}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={categoryColor(entry.name, index)}
                                    className="chart-bar-cell"
                                    onClick={(_, __, e) => handleRechartsCategoryClick(entry, index, e)}
                                />
                            ))}
                            {showBarDataLabels && (
                                <LabelList
                                    dataKey="value"
                                    position="top"
                                    formatter={(v) => formatNumber(v)}
                                    fontSize={9}
                                    fill={'#ffffff'}
                                    fontWeight={600}
                                />
                            )}
                        </Bar>
                    </BarChart>
                );

            case 'sparkline': {
                const sparkType = opts.sparklineType || 'area';
                const sparkMargin = { top: 6, right: 6, left: 6, bottom: 6 };
                const sparkTooltip = (
                    <Tooltip
                        cursor={false}
                        contentStyle={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px' }}
                        formatter={(val) => [formatNumber(val), yAxisDisplayTitle || '']}
                        labelFormatter={(label) => String(label ?? '')}
                    />
                );

                if (sparkType === 'line') {
                    return (
                        <LineChart data={chartData} margin={sparkMargin} onClick={handleClick}>
                            {sparkTooltip}
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke={mainColor}
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 3, strokeWidth: 0 }}
                                isAnimationActive={animation}
                            />
                        </LineChart>
                    );
                }

                if (sparkType === 'column') {
                    return (
                        <BarChart data={chartData} margin={sparkMargin} onClick={handleClick}>
                            {sparkTooltip}
                            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                            <Bar dataKey="value" maxBarSize={10} radius={[2, 2, 0, 0]} isAnimationActive={animation}>
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`spark-col-${index}`}
                                        fill={Number(entry?.value) < 0 ? '#94a3b8' : mainColor}
                                        fillOpacity={Number(entry?.value) < 0 ? 0.85 : 1}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    );
                }

                if (sparkType === 'bar') {
                    const maxVal = Math.max(...chartData.map((d) => Math.abs(Number(d?.value) || 0)), 1e-9);
                    const barRows = chartData.map((row) => {
                        const abs = Math.abs(Number(row?.value) || 0);
                        const pct = Math.round((abs / maxVal) * 100);
                        return { ...row, pct };
                    });
                    const barFill = (pct) => (pct >= 67 ? mainColor : `${mainColor}b3`);
                    return (
                        <div className="sparkline-bar-list" role="list" aria-label="Bar sparkline">
                            {barRows.map((row, index) => (
                                <div key={`spark-bar-${index}`} className="sparkline-bar-row" role="listitem">
                                    <div
                                        className="sparkline-bar-track"
                                        title={`${row.name}: ${formatNumber(row.value)} (${row.pct}%)`}
                                    >
                                        <div
                                            className="sparkline-bar-fill"
                                            style={{ width: `${row.pct}%`, backgroundColor: barFill(row.pct) }}
                                        />
                                        <span className="sparkline-bar-pct">{row.pct}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }

                return (
                    <AreaChart data={chartData} margin={sparkMargin} onClick={handleClick}>
                        <defs>
                            <linearGradient id={`colorValue-${graphDefinition.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={mainColor} stopOpacity={0.55} />
                                <stop offset="95%" stopColor={mainColor} stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        {sparkTooltip}
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={mainColor}
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill={`url(#colorValue-${graphDefinition.id})`}
                            isAnimationActive={animation}
                        />
                    </AreaChart>
                );
            }
            case 'line':
                return (
                    <LineChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: xLayout.bottom }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={isDark ? 0.2 : 0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={false}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tick={{ fill: axisTickColor, fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels)}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={50}
                                domain={yAxisDomain}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 10, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && !isHierarchyActive && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Line
                            type="monotone"
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            stroke={mainColor}
                            strokeWidth={3}
                            dot={{ r: 4, fill: mainColor, strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            isAnimationActive={animation}
                        >
                        </Line>
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: xLayout.bottom }} className="chart-category-clickable">
                        <defs>
                            <linearGradient id={`colorValue-${graphDefinition.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={mainColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={isDark ? 0.2 : 0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={xLayout.fontSize}
                                tickLine={false}
                                axisLine={false}
                                interval={xLayout.interval}
                                minTickGap={xLayout.minTickGap}
                                angle={xLayout.angle}
                                textAnchor={xLayout.textAnchor}
                                height={xLayout.height}
                                tick={{ fill: axisTickColor, fontSize: xLayout.fontSize }}
                                tickFormatter={(val) => formatXAxisTick(val, xLayout.fullLabels)}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={50}
                                domain={yAxisDomain}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 10, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && !isHierarchyActive && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            stroke={mainColor}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={`url(#colorValue-${graphDefinition.id})`}
                            isAnimationActive={animation}
                        >
                        </Area>
                    </AreaChart>
                );
            case 'pie':
            case 'donut': {
                if (!Array.isArray(chartData) || chartData.length === 0) {
                    return (
                        <div className="chart-empty sc-pie-empty">
                            {isCrossFilterActive ? 'No data matches the current filter' : 'No data available'}
                        </div>
                    );
                }
                // ── Smart Donut / Pie ───────────────────────────────────
                const isDonut = graphDefinition.graph_type === 'donut';
                const MAX_SHOW_ALL_RENDER_SLICES = 1200;

                // 1. Process data — Top-N + Others + hidden slices filter
                const rawSorted = [...chartData].sort((a, b) => b.value - a.value);
                let processedData;
                if (!scShowAll && rawSorted.length > scTopN) {
                    const top = rawSorted.slice(0, scTopN).filter(d => !scHiddenSlices.has(d.name));
                    if (scGroupOthers) {
                        const othersVal = rawSorted.slice(scTopN).reduce((s, d) => s + (d.value || 0), 0)
                            + rawSorted.filter(d => scHiddenSlices.has(d.name)).reduce((s, d) => s + (d.value || 0), 0);
                        processedData = othersVal > 0 ? [...top, { name: 'Others', value: othersVal, __others: true }] : top;
                    } else {
                        processedData = top;
                    }
                } else {
                    processedData = rawSorted.filter(d => !scHiddenSlices.has(d.name));
                    if (processedData.length > MAX_SHOW_ALL_RENDER_SLICES) {
                        // In Show All mode, avoid collapsing into one gray "Others" slice.
                        // Keep multi-color slices for a Power BI-like dense look.
                        processedData = processedData.slice(0, MAX_SHOW_ALL_RENDER_SLICES);
                    }
                }

                const pieSlices = processedData;
                const pieTotal = pieSlices.reduce((s, d) => s + (Number(d.value) || 0), 0);
                const nonZeroSliceCount = pieSlices.filter((d) => Number(d.value) > 0).length;
                const hasZeroValueSlices = pieSlices.some((d) => !Number(d.value));
                const scLabelCount = pieSlices.length;
                const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
                const chartTight = dimensions.height > 0 && (dimensions.height < 300 || dimensions.width < 340);
                const chartCompact = dimensions.height > 0 && (dimensions.height < 420 || dimensions.width < 500);
                const useOutsideLabels = scShowLabels && scLabelCount > 0
                    && (scShowAll || !(chartTight && scLabelCount > 5));
                const labelsEnabled = useOutsideLabels;
                const pieChartData = scShowAll
                    ? pieSlices
                    : (hasZeroValueSlices ? pieSlices.filter((d) => Number(d.value) > 0) : pieSlices);
                pieSliceDataRef.current = pieChartData;
                if (pieChartData.length === 0) {
                    return (
                        <div className="chart-empty sc-pie-empty">
                            {isCrossFilterActive ? 'No data matches the current filter' : 'No data available'}
                        </div>
                    );
                }
                const pieChartTotal = pieChartData.reduce((s, d) => s + (Number(d.value) || 0), 0);
                const pieSliceActiveFilters = getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension);
                const pieSliceIsDimmed = (name) =>
                    pieSliceActiveFilters.length > 0
                    && !pieSliceActiveFilters.some((v) => String(v) === String(name));
                const pieChartSliceCount = pieChartData.length;
                const showLegendPanel = rawSorted.length > 6 && !isMicro && !isDrillDownApplied
                    && dimensions.width >= 520
                    && dimensions.height >= 300;
                // Bigger center hole only — colored slice band width unchanged from original
                const DONUT_HOLE_BOOST = 8;
                const effectiveInnerRadius = isDonut
                    ? (isMicro ? `${32 + DONUT_HOLE_BOOST}%` : (isSmall ? `${40 + DONUT_HOLE_BOOST}%` : `${50 + DONUT_HOLE_BOOST}%`))
                    : 0;

                // 2. Slice color — from active report theme palette
                const sliceColor = (name, index) => {
                    const src = pieChartData[index] ?? pieSlices.find((d) => d.name === name);
                    if (name === 'Others' || src?.__others) return '#94a3b8';
                    if (opts.mainColor && pieChartData.length === 1) return mainColor;
                    const srcIndex = pieSlices.findIndex((d) => d.name === name);
                    return categoryColor(name, srcIndex >= 0 ? srcIndex : index);
                };

                // Callout labels — Show All: every slice with a value gets a leader line
                const labelEligible = (() => {
                    const eligible = new Set();
                    if (scShowAll) {
                        pieChartData.forEach((d, i) => {
                            if (Number(d.value) > 0) eligible.add(i);
                        });
                        return eligible;
                    }
                    const ranked = pieChartData
                        .map((d, i) => ({
                            i,
                            val: Number(d.value) || 0,
                            pct: pieChartTotal > 0 ? ((Number(d.value) || 0) / pieChartTotal) * 100 : 0,
                        }))
                        .filter((row) => row.val > 0)
                        .sort((a, b) => b.pct - a.pct);
                    const cap = chartTight ? 5 : (chartCompact ? 8 : 12);
                    const minPct = pieChartSliceCount > 6 ? 4 : 0;
                    ranked.forEach((row, rank) => {
                        if (rank < cap || row.pct >= minPct) eligible.add(row.i);
                    });
                    return eligible;
                })();

                // 3. Adaptive label strategy
                const compactLabelMode = pieChartSliceCount > 10;
                const maxVisibleLabels = pieChartSliceCount;
                const showAllDense = scShowAll && scLabelCount > 24 && scLabelSide !== 'all';
                const veryDenseShowAll = scShowAll && scLabelCount > 80 && scLabelSide !== 'all';
                const activeLabelRegion = scLabelSide;
                const denseLabelCountByRegion = {
                    leftTop: 0,
                    leftBottom: 0,
                    rightTop: 0,
                    rightBottom: 0
                };
                const maxDenseLabelsPerRegion = scShowAll && scLabelSide === 'all'
                    ? pieChartSliceCount
                    : (veryDenseShowAll ? 18 : 28);
                const handleDenseRegionClick = (event) => {
                    if (!veryDenseShowAll) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const relX = event.clientX - bounds.left;
                    const relY = event.clientY - bounds.top;
                    const isLeft = relX < bounds.width / 2;
                    const isTop = relY < bounds.height / 2;
                    if (isLeft && isTop) setScLabelSide('leftTop');
                    else if (isLeft && !isTop) setScLabelSide('leftBottom');
                    else if (!isLeft && isTop) setScLabelSide('rightTop');
                    else setScLabelSide('rightBottom');
                };
                const MIN_LABEL_GAP = scShowAll
                    ? (pieChartSliceCount > 40 ? 10 : pieChartSliceCount > 20 ? 11 : 14)
                    : (pieChartSliceCount > 20 ? 12 : 16);
                const MAX_LABEL_DRIFT = scShowAll
                    ? Math.min(80, 22 + Math.max(0, pieChartSliceCount - 10) * 1.5)
                    : 22;
                let pieLabelYLayout = null;

                const buildPieLabelYLayout = (cx, cy, outerR) => {
                    const RADIAN = Math.PI / 180;
                    const labelBlock = Math.max(MIN_LABEL_GAP, pieLabelFontSize + 6);
                    const left = [];
                    const right = [];
                    let angle = 0;
                    pieChartData.forEach((entry, index) => {
                        const val = Number(entry.value) || 0;
                        const sliceAngle = val > 0
                            ? (val / (pieChartTotal || 1)) * 360
                            : (scShowAll ? 1.2 : 0);
                        if (val > 0 && labelEligible.has(index)) {
                            const midAngle = angle + sliceAngle / 2;
                            const naturalY = cy + (outerR + 10) * Math.sin(-midAngle * RADIAN);
                            const bucket = Math.cos(-midAngle * RADIAN) >= 0 ? right : left;
                            bucket.push({ index, naturalY });
                        }
                        angle += sliceAngle;
                    });
                    const layout = new Map();
                    const placeSide = (items) => {
                        items.sort((a, b) => a.naturalY - b.naturalY);
                        let lastY = -Infinity;
                        items.forEach(({ index, naturalY }) => {
                            let ly = naturalY;
                            if (ly - lastY < labelBlock) ly = lastY + labelBlock;
                            if (Math.abs(ly - naturalY) > MAX_LABEL_DRIFT) return;
                            lastY = ly;
                            layout.set(index, ly);
                        });
                    };
                    placeSide(left);
                    placeSide(right);
                    return layout;
                };

                // 4. Label renderer — with vertical collision evasion
                const renderAdaptiveLabel = (props) => {
                    const { cx, cy, midAngle, outerRadius: or, startAngle, endAngle, name, value, index } = props;
                    if (!labelsEnabled || !Number(value) || !labelEligible.has(index)) return null;
                    const sliceAngle = Math.abs(endAngle - startAngle);
                    if (sliceAngle < 0.5) return null;
                    const RADIAN = Math.PI / 180;
                    const dir = Math.cos(-midAngle * RADIAN) >= 0 ? 1 : -1;
                    const outerR = typeof or === 'number' ? or : parseFloat(or);
                    const lineStart = outerR + 3;
                    const lineEnd = outerR + 12;
                    const sx = cx + lineStart * Math.cos(-midAngle * RADIAN);
                    const sy = cy + lineStart * Math.sin(-midAngle * RADIAN);
                    const mx = cx + lineEnd * Math.cos(-midAngle * RADIAN);
                    const my = cy + lineEnd * Math.sin(-midAngle * RADIAN);
                    if (showAllDense && activeLabelRegion !== 'all') {
                        const isLeft = dir === -1;
                        const isTop = my < cy;
                        const visibleBySide = (
                            (activeLabelRegion === 'left' && isLeft) ||
                            (activeLabelRegion === 'right' && !isLeft) ||
                            (activeLabelRegion === 'leftTop' && isLeft && isTop) ||
                            (activeLabelRegion === 'leftBottom' && isLeft && !isTop) ||
                            (activeLabelRegion === 'rightTop' && !isLeft && isTop) ||
                            (activeLabelRegion === 'rightBottom' && !isLeft && !isTop)
                        );
                        if (!visibleBySide) return null;
                    }
                    const isLeft = dir === -1;
                    const isTop = my < cy;
                    const regionKey = isLeft ? (isTop ? 'leftTop' : 'leftBottom') : (isTop ? 'rightTop' : 'rightBottom');
                    if (showAllDense) {
                        if (denseLabelCountByRegion[regionKey] >= maxDenseLabelsPerRegion) return null;
                    }
                    if (!pieLabelYLayout) {
                        pieLabelYLayout = buildPieLabelYLayout(cx, cy, outerR);
                    }
                    const presetY = pieLabelYLayout.get(index);
                    const ly = presetY !== undefined ? presetY : my;
                    const hingeX = mx + dir * 6;
                    const lx = hingeX + dir * 3;

                    const pct = pieChartTotal > 0 ? ((Number(value) / pieChartTotal) * 100).toFixed(1) : '0.0';
                    const nameLimit = compactLabelMode ? 10 : (isMicro ? 8 : isSmall ? 12 : 16);
                    const displayName = String(name).length > nameLimit
                        ? `${String(name).slice(0, nameLimit - 1)}…`
                        : String(name);
                    const labelText = `${displayName} (${pct}%)`;
                    const labelFont = Math.max(8, pieLabelFontSize - (compactLabelMode ? 1 : 0));
                    if (showAllDense) {
                        denseLabelCountByRegion[regionKey] += 1;
                    }
                    const linePoints = Math.abs(ly - my) > 2
                        ? `${sx},${sy} ${mx},${my} ${hingeX},${my} ${hingeX},${ly}`
                        : `${sx},${sy} ${mx},${my} ${hingeX},${my}`;
                    return (
                        <g className="pie-donut-callout">
                            <polyline
                                points={linePoints}
                                fill="none"
                                stroke={lineStrokeColor}
                                strokeWidth={1}
                            />
                            <text
                                x={lx}
                                y={ly}
                                textAnchor={dir === 1 ? 'start' : 'end'}
                                dominantBaseline="central"
                                fontSize={labelFont}
                                fontWeight={500}
                                fill={axisTitleColor}
                            >
                                {labelText}
                            </text>
                        </g>
                    );
                };

                // 5. Custom tooltip — only while hovering a slice
                const CustomPieTooltip = ({ active, payload }) => {
                    if (!pieHoverSegment || !active || !payload || !payload.length) return null;
                    const entry = payload[0];
                    const val = entry.value;
                    const pct = pieTotal > 0 ? ((val / pieTotal) * 100).toFixed(1) : '0.0';
                    return (
                        <div className="pie-donut-hover-tooltip">
                            <div className="pie-donut-hover-tooltip__label">{entry.name}</div>
                            <div className="pie-donut-hover-tooltip__value">{formatNumber(val)}</div>
                            <div className="pie-donut-hover-tooltip__pct">{pct}% of total</div>
                        </div>
                    );
                };

                const pieTooltipPayload = pieHoverSegment
                    ? [{
                        name: pieHoverSegment.name,
                        value: pieHoverSegment.value,
                        payload: pieHoverSegment,
                    }]
                    : [];

                const clearPieHover = () => setPieHoverSegment(null);
                const handlePieSliceEnter = (segment) => {
                    if (!segment || segment.__others) {
                        clearPieHover();
                        return;
                    }
                    setPieHoverSegment(segment);
                };

                // 6. Center label for donut (hover shows slice; default shows total)
                const centerLabel = pieHoverSegment
                    ? { name: String(pieHoverSegment.name), val: pieHoverSegment.value, pct: pieTotal > 0 ? ((pieHoverSegment.value / pieTotal) * 100).toFixed(1) : '0' }
                    : {
                        name: scShowAll ? `${scLabelCount} categories` : 'Total',
                        val: pieTotal,
                        pct: scShowAll && nonZeroSliceCount < scLabelCount
                            ? `${nonZeroSliceCount} w/ data`
                            : '100',
                    };

                // 7. Filtered legend items
                const legendSearch = scLegendSearch.toLowerCase();
                const legendItems = rawSorted.filter(d =>
                    !legendSearch || String(d.name).toLowerCase().includes(legendSearch)
                );

                // 8. Controls bar
                const ControlsBar = () => (
                    <div className="sc-controls-bar">
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scShowLabels} onChange={e => setScShowLabels(e.target.checked)} />
                            <span>Labels</span>
                        </label>
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scGroupOthers} onChange={e => setScGroupOthers(e.target.checked)} disabled={scShowAll} />
                            <span>Group Others</span>
                        </label>
                        <label className="sc-toggle">
                            <input type="checkbox" checked={scShowAll} onChange={e => setScShowAll(e.target.checked)} />
                            <span>Show All</span>
                        </label>
                        {showAllDense && (
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                {veryDenseShowAll && (
                                    <span style={{ fontSize: 10, color: '#64748b' }}>Dense mode: click any chart side for that corner labels</span>
                                )}
                                {!veryDenseShowAll && (
                                    <>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'leftTop' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('leftTop')}
                                >
                                    Left Top
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'leftBottom' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('leftBottom')}
                                >
                                    Left Bottom
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'rightTop' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('rightTop')}
                                >
                                    Right Top
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'rightBottom' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('rightBottom')}
                                >
                                    Right Bottom
                                </button>
                                <button
                                    type="button"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: scLabelSide === 'all' ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}
                                    onClick={() => setScLabelSide('all')}
                                >
                                    All
                                </button>
                                    </>
                                )}
                            </div>
                        )}
                        {!scShowAll && (
                            <label className="sc-slider-label">
                                <span>Top {scTopN}</span>
                                <input
                                    type="range" min={5} max={100} step={5}
                                    value={scTopN}
                                    onChange={e => setScTopN(Number(e.target.value))}
                                    className="sc-slider"
                                />
                            </label>
                        )}
                        <span className="sc-info">
                            {scShowAll
                                ? `${scLabelCount} categories · ${nonZeroSliceCount} with values · total ${formatNumber(pieTotal)}`
                                : `${pieSlices.length}/${Math.max(rawSorted.length, scTotalPoints)} shown`}
                            {scShowAll && rawSorted.length > MAX_SHOW_ALL_RENDER_SLICES ? ' (render-capped)' : ''}
                        </span>
                    </div>
                );

                // 9. Scrollable legend panel
                const LegendPanel = () => (
                    <div className="sc-legend-panel">
                        <input
                            type="text"
                            placeholder="Search…"
                            value={scLegendSearch}
                            onChange={e => setScLegendSearch(e.target.value)}
                            className="sc-legend-search"
                        />
                        <div className="sc-legend-list">
                            {legendItems.map((item) => {
                                const isHidden = scHiddenSlices.has(item.name);
                                const itemIdx = rawSorted.indexOf(item);
                                const color = sliceColor(item.name, itemIdx >= 0 ? itemIdx : 0);
                                const pct = pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : '0.0';
                                return (
                                    <div
                                        key={item.name}
                                        className={`sc-legend-item${isHidden ? ' sc-hidden' : ''}`}
                                        onClick={() => {
                                            setScHiddenSlices(prev => {
                                                const next = new Set(prev);
                                                next.has(item.name) ? next.delete(item.name) : next.add(item.name);
                                                return next;
                                            });
                                        }}
                                        title={`${item.name}: ${formatNumber(item.value)} (${pct}%)`}
                                    >
                                        <span className="sc-legend-dot" style={{ background: color }} />
                                        <span className="sc-legend-name">{String(item.name).length > 18 ? String(item.name).slice(0, 16) + '…' : item.name}</span>
                                        <span className="sc-legend-val">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );

                // 10. Render
                // Margin: ensure enough space for labels outside the ring
                // When labels ON → large margins so leader-lines are not clipped
                // When labels OFF or too many slices → compact margins
                const labelMargin = labelsEnabled
                    ? (scShowAll && pieChartSliceCount > 15
                        ? (chartTight ? 28 : chartCompact ? 36 : 52)
                        : (chartTight ? 22 : chartCompact ? 30 : (isHierarchyActive ? 32 : 44)))
                    : 4;
                const pieChartMargin = {
                    top: labelMargin,
                    right: labelMargin,
                    bottom: labelMargin,
                    left: labelMargin,
                };
                const effectiveOuterRadius = (() => {
                    const donutOuterBoost = isDonut ? DONUT_HOLE_BOOST : 0;
                    if (!labelsEnabled) {
                        if (isMicro) return '58%';
                        if (chartTight) return '92%';
                        if (chartCompact) return '88%';
                        return isDonut ? `${86 + donutOuterBoost}%` : pieOuterRadius;
                    }
                    if (chartTight) return '66%';
                    if (chartCompact) return '70%';
                    if (isMicro) return `${50 + donutOuterBoost}%`;
                    if (isSmall) return `${58 + donutOuterBoost}%`;
                    return `${68 + donutOuterBoost}%`;
                })();
                const chartPortion = (
                    <PieChart
                        margin={pieChartMargin}
                        onMouseLeave={clearPieHover}
                    >
                        <Pie
                            data={pieChartData}
                            innerRadius={effectiveInnerRadius}
                            outerRadius={effectiveOuterRadius}
                            minAngle={scShowAll && hasZeroValueSlices ? 1.2 : 0}
                            paddingAngle={pieChartData.length > 50 ? 0 : pieChartData.length > 20 ? 1 : 2}
                            dataKey="value"
                            nameKey="name"
                            shape={renderPieSliceSector}
                            activeShape={crossFilterRefreshing ? undefined : renderPieSliceSector}
                            onClick={(sliceData, index, e) => {
                                e?.stopPropagation?.();
                                const entry = pieChartData[index] ?? sliceData;
                                if (entry) handlePieDonutSliceClick(entry);
                            }}
                            onMouseEnter={handlePieSliceEnter}
                            onMouseLeave={clearPieHover}
                            style={{ cursor: 'pointer' }}
                            isAnimationActive={animation && pieChartData.length <= 100}
                            label={labelsEnabled ? renderAdaptiveLabel : false}
                            labelLine={false}
                        >
                            {pieChartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={sliceColor(entry.name, index)}
                                    className="pie-donut-slice-cell"
                                    style={{ cursor: 'pointer' }}
                                    opacity={!Number(entry.value)
                                        ? 0.4
                                        : (pieSliceIsDimmed(entry.name)
                                            ? 0.35
                                            : (pieHoverSegment && pieHoverSegment.name !== entry.name ? 0.55 : 1))}
                                    stroke={
                                        pieSliceActiveFilters.some((v) => String(v) === String(entry.name))
                                            ? '#fff'
                                            : (pieHoverSegment && pieHoverSegment.name === entry.name ? '#fff' : 'none')
                                    }
                                    strokeWidth={
                                        pieSliceActiveFilters.some((v) => String(v) === String(entry.name))
                                            || (pieHoverSegment && pieHoverSegment.name === entry.name)
                                            ? 2.5
                                            : 0
                                    }
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            active={Boolean(pieHoverSegment) && !crossFilterRefreshing}
                            payload={pieTooltipPayload}
                            content={<CustomPieTooltip />}
                            cursor={false}
                            isAnimationActive={false}
                            animationDuration={0}
                            wrapperStyle={{ pointerEvents: 'none', outline: 'none', zIndex: 30 }}
                        />
                        {isDonut && (
                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                                <tspan x="50%" dy="-0.6em" fontSize={isMicro ? 9 : isSmall ? 11 : 13} fontWeight={600} fill={tooltipSubtext}>
                                    {String(centerLabel.name).length > 14 ? String(centerLabel.name).slice(0, 12) + '…' : centerLabel.name}
                                </tspan>
                                <tspan x="50%" dy="1.4em" fontSize={isMicro ? 11 : (isSmall || isHierarchyActive ? 12 : 18)} fontWeight={800} fill={axisTitleColor}>
                                    {formatNumber(centerLabel.val)}
                                </tspan>
                                <tspan x="50%" dy="1.2em" fontSize={isMicro ? 8 : 10} fill={tooltipSubtext}>
                                    {String(centerLabel.pct).includes('%') || String(centerLabel.pct).includes('w/')
                                        ? centerLabel.pct
                                        : `${centerLabel.pct}%`}
                                </tspan>
                            </text>
                        )}
                    </PieChart>
                );

                return (
                    <div className={`sc-chart-wrapper${isHierarchyActive ? ' sc-chart-wrapper--drill-active' : ''}${chartCompact ? ' sc-chart-wrapper--compact-card' : ''}`}>
                        {graphDefinition.options?.showLegend !== false && showLegendFilterRow && (
                            <div className="sc-legend-filter-row">
                                <LegendComponent
                                    dimension={legendFilterDimension}
                                    values={rawLegendValues}
                                    maxItems={rawLegendValues.length > 8 ? 6 : 12}
                                    variant="chips"
                                    filterScope="visual"
                                    visualFilters={visualFilterRules}
                                    onVisualFilterChange={applyVisualDimensionFilter}
                                    onFilterClear={handleLegendFilterClear}
                                    colorPalette={palette}
                                />
                            </div>
                        )}
                        {!isMicro && <ControlsBar />}
                        <div className={`sc-chart-body${showLegendPanel ? '' : ' sc-chart-body--full'}`}>
                            <div
                                className={`sc-chart-area${pieHoverSegment ? ' sc-chart-area--slice-hover' : ''}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={handleDenseRegionClick}
                                onMouseLeave={clearPieHover}
                                style={veryDenseShowAll ? { cursor: 'crosshair' } : { cursor: 'pointer' }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    {chartPortion}
                                </ResponsiveContainer>
                            </div>
                            {showLegendPanel && <LegendPanel />}
                        </div>
                    </div>
                );
            }
            case 'scatter':
                return (
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 25, left: 10 }} onClick={handleClick} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                interval="preserveStartEnd"
                                angle={-35}
                                textAnchor="end"
                                height={45}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                dataKey="value"
                                fontSize={8}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={50}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 10, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Scatter
                            name={yAxisDisplayTitle}
                            data={chartData}
                            fill={mainColor}
                            isAnimationActive={animation}
                            line={{ stroke: mainColor }}
                            shape="circle"
                            onClick={handleRechartsCategoryClick}
                        />
                    </ScatterChart>
                );
            case 'radar':
                return (
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData} onClick={handleClick} className="chart-category-clickable">
                        <PolarGrid strokeOpacity={0.1} stroke={gridColor} />
                        <PolarAngleAxis dataKey="name" tick={{ fill: axisTickColor, fontSize: 10 }} />
                        <PolarRadiusAxis tickFormatter={(v) => formatNumber(v, 'axis')} tick={{ fill: axisTickColor, fontSize: 8 }} />
                        <Radar
                            name={yAxisDisplayTitle}
                            dataKey="value"
                            stroke={mainColor}
                            fill={mainColor}
                            fillOpacity={0.6}
                            isAnimationActive={animation}
                        >
                        </Radar>
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={42} />}
                    </RadarChart>
                );
            case 'polarArea':
                return (
                    <PieChart>
                        <Pie
                            data={chartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius="80%"
                            isAnimationActive={animation}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={0.3 + (index / chartData.length) * 0.7} />
                            ))}
                        </Pie>
                        <PolarGrid opacity={0.1} />
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={42} />}
                    </PieChart>
                );
            case 'treemap':
            case 'heatmap':
                return (
                    <Treemap
                        data={chartData}
                        dataKey="value"
                        ratio={4 / 3}
                        stroke="#fff"
                        isAnimationActive={animation}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={1 - (index / chartData.length) * 0.6} />
                        ))}
                        <Tooltip formatter={tooltipFormatter} />
                    </Treemap>
                );
            case 'composed':
                return (
                    <ComposedChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                                angle={-35}
                                textAnchor="end"
                                height={45}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 10, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={50}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 10, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip formatter={tooltipFormatter} />
                        {opts.showLegend && !isSmall && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '8px', overflow: 'visible' }} />}
                        <Bar dataKey="value" name={yAxisDisplayTitle} barSize={20} fill={mainColor} opacity={0.4} radius={[4, 4, 0, 0]} onClick={handleRechartsCategoryClick} />
                        <Line type="monotone" dataKey="value" name={yAxisDisplayTitle} stroke={mainColor} strokeWidth={3} dot={{ r: 4 }} onClick={handleRechartsCategoryClick} />
                    </ComposedChart>
                );
            case 'funnel':
                return (
                    <BarChart layout="vertical" data={data} onClick={handleClick} margin={{ top: 5, right: 20, left: -20, bottom: 5 }} className="chart-category-clickable">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} stroke={gridColor} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" fontSize={8} width={60} tick={{ fill: axisTickColor, fontSize: 8 }} />
                        <Tooltip />
                        <Bar dataKey="value" isAnimationActive={animation} onClick={handleRechartsCategoryClick}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={palette[index % palette.length]}
                                    onClick={(_, __, e) => handleRechartsCategoryClick(entry, index, e)}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'sankey':
                const sankeyData = buildSankeyData();
                if (!sankeyData) {
                    return <div className="chart-empty">Assign source and target fields for Sankey flow.</div>;
                }
                return (
                    <Sankey
                        data={sankeyData}
                        margin={{ top: 10, left: 10, right: 10, bottom: 10 }}
                        node={{ stroke: '#fff', strokeWidth: 1, fill: mainColor }}
                        link={{ stroke: mainColor, fillOpacity: 0.2 }}
                    >
                        <Tooltip />
                    </Sankey>
                );
            case 'waterfall':
                return (
                    <BarChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />
                        <XAxis dataKey="name" fontSize={8} tick={{ fill: axisTickColor, fontSize: 8 }} height={35} label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: axisTitleColor, fontWeight: 600 } : undefined} />
                        <YAxis tickFormatter={(v) => formatNumber(v, 'axis')} fontSize={8} tick={{ fill: axisTickColor, fontSize: 8 }} width={50} label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 9, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined} />
                        <Tooltip />
                        <Bar dataKey="base" stackId="a" fill="transparent" />
                        <Bar dataKey="value" stackId="a" onClick={handleRechartsCategoryClick}>
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.value >= 0 ? (opts.positiveColor || themeConfig.positive) : (opts.negativeColor || themeConfig.negative)}
                                    onClick={(_, __, e) => handleRechartsCategoryClick(entry, index, e)}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'radialBar':
                return (
                    <RadialBarChart
                        innerRadius="30%"
                        outerRadius="100%"
                        data={chartData}
                        startAngle={180}
                        endAngle={0}
                    >
                        <RadialBar
                            minAngle={15}
                            label={{ position: 'insideStart', fill: '#fff' }}
                            background
                            clockWise={true}
                            dataKey="value"
                            isAnimationActive={animation}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                            ))}
                        </RadialBar>
                        <Tooltip />
                        <Legend content={renderInteractiveLegend} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ overflow: 'visible' }} />
                    </RadialBarChart>
                );
            case 'gauge':
                return (
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ height: '70%', width: '100%' }}>
                            <PieChart margin={{ top: 20 }}>
                                <Pie
                                    data={chartData.slice(0, 1)}
                                    dataKey="value"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius="60%"
                                    outerRadius="90%"
                                    isAnimationActive={animation}
                                >
                                    {chartData.slice(0, 1).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={mainColor} />
                                    ))}
                                </Pie>
                                {/* Background arc */}
                                <Pie
                                    data={[{ value: totalValue * 1.5 || 100 }]}
                                    dataKey="value"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius="60%"
                                    outerRadius="90%"
                                    isAnimationActive={false}
                                >
                                    <Cell fill={isDark ? 'var(--bg-tertiary)' : '#e2e8f0'} stroke="none" />
                                </Pie>
                            </PieChart>
                        </div>
                        <div style={{ position: 'absolute', bottom: '15%', textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: axisTitleColor }}>
                                {formatNumber(chartData[0]?.value || 0)}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: axisTickColor, textTransform: 'uppercase' }}>
                                {opts.xLabel || graphDefinition.x_axis || 'Metric'}
                            </div>
                        </div>
                    </div>
                );
            case 'step':
                return (
                    <LineChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 9, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Line type="stepBefore" dataKey="value" name={yAxisDisplayTitle} stroke={mainColor} strokeWidth={3} dot={{ r: 3, fill: mainColor, strokeWidth: 2, stroke: isDark ? 'var(--bg-elevated)' : '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={animation} />
                    </LineChart>
                );
            case 'rangeBar':
                // The values for RangeBar are guaranteed to be [[min, max]] arrays from the backend
                // Recharts Bar handles array dataKeys inherently by drawing from index 0 to index 1
                return (
                    <BarChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: opts.yLabel || graphDefinition.y_axis || 'Min-Max Range', angle: -90, position: 'insideLeft', fontSize: 9, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: isDark ? 'var(--bg-tertiary)' : '#f1f5f9' }} formatter={(val) => {
                            if (Array.isArray(val)) {
                                return `${formatNumber(val[0])} - ${formatNumber(val[1])}`
                            }
                            return formatNumber(val);
                        }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="value" fill={mainColor} radius={[4, 4, 4, 4]} isAnimationActive={animation} onClick={handleRechartsCategoryClick}>
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={opts.useMultipleColors ? palette[index % palette.length] : mainColor}
                                    onClick={(_, __, e) => handleRechartsCategoryClick(entry, index, e)}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'combination':
                // Combination plot: A ComposedChart showing Area behind a bold Line
                return (
                    <ComposedChart data={chartData} onClick={handleClick} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                height={35}
                                label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: axisTitleColor, fontWeight: 600 } : undefined}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                fontSize={8}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                                width={50}
                                label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 9, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined}
                            />
                        )}
                        <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="value" name="Volume/Area" fill={mainColor} fillOpacity={0.2} stroke="none" isAnimationActive={animation} />
                        <Line type="monotone" dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Trend'} stroke={palette[1] || mainColor} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={animation} onClick={handleRechartsCategoryClick} />
                    </ComposedChart>
                );
            case 'kpiCard': {
                const kpiLabel = opts.xLabel || graphDefinition.x_axis || 'Metric';
                const showKpiFilter = graphDefinition.options?.showLegend !== false && rawLegendValues.length > 1;
                const kpiCompact = !showZoomControls;
                const kpiValue = totalValue;
                const avgValue = totalValue / (chartData.length || 1);
                return (
                    <div className={`kpi-card-visual${kpiCompact ? ' kpi-card-visual--compact' : ''}`}>
                        <div className="kpi-card-visual-body">
                            <div className="kpi-card-visual-header-row">
                                <span className="kpi-card-visual-kicker">{kpiLabel}</span>
                                {showKpiFilter && (
                                    <div className="kpi-card-filter-row card-filter-row">
                                        <LegendComponent
                                            dimension={legendFilterDimension}
                                            values={rawLegendValues}
                                            variant="inline"
                                            filterScope="visual"
                                            visualFilters={visualFilterRules}
                                            onVisualFilterChange={applyVisualDimensionFilter}
                                            onFilterClear={handleLegendFilterClear}
                                            colorPalette={palette}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="kpi-card-visual-metrics">
                                <div className="kpi-card-visual-value" style={{ color: mainColor }}>
                                    {formatNumber(kpiValue)}
                                </div>
                                <div className="kpi-card-visual-stats">
                                    <div className="kpi-card-visual-stat">
                                        <span className="kpi-card-visual-stat-label">Average</span>
                                        <span className="kpi-card-visual-stat-value">{formatNumber(avgValue)}</span>
                                    </div>
                                    <div className="kpi-card-visual-stat">
                                        <span className="kpi-card-visual-stat-label">Count</span>
                                        <span className="kpi-card-visual-stat-value">{chartData.length}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 'metricCard': {
                const mcLabel = opts.xLabel || graphDefinition.x_axis || 'Metric';
                const mcSubtitle = opts.metricSubtitle || graphDefinition.y_axis || 'Measure';
                const mcActiveFilters = getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension);
                const mcHeading = mcActiveFilters.length === 1
                    ? truncateLabel(mcActiveFilters[0], 28)
                    : (mcActiveFilters.length > 1 ? `${mcActiveFilters.length} categories` : mcLabel);
                const showMcFilter = graphDefinition.options?.showLegend !== false && rawLegendValues.length > 1;
                const mcCompact = true;
                const mcValue = totalValue;
                const baselineRows = coerceChartRows(baselineChartDataRef.current || []);
                const mcFiltered =
                    mcActiveFilters.length > 0
                    || hasActiveChartFilter
                    || reportPageFilters.length > 0;
                // When filtered to one category, keep the big number filtered but draw trend from all categories.
                const sparkSourceRows =
                    chartData.length >= 2
                        ? chartData
                        : (mcFiltered && baselineRows.length >= 2 ? baselineRows : chartData);
                const sparkSlice = sparkSourceRows.length > 36 ? sparkSourceRows.slice(-36) : sparkSourceRows;
                const sparkData = sparkSlice.map((d) => {
                    const raw = d.value;
                    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                    return { name: d.name, value: Number.isFinite(n) ? n : 0 };
                });
                const parseMetricVal = (raw) => {
                    if (typeof raw === 'number') return raw;
                    const n = parseFloat(String(raw ?? '').replace(/,/g, ''));
                    return Number.isFinite(n) ? n : 0;
                };
                const firstRaw = sparkSourceRows[0]?.value;
                const lastRaw = sparkSourceRows[sparkSourceRows.length - 1]?.value;
                const firstN = parseMetricVal(firstRaw);
                const lastN = parseMetricVal(lastRaw);
                const selectedRow = chartData.length === 1 ? chartData[0] : null;
                const selectedN = selectedRow ? parseMetricVal(selectedRow.value) : null;
                let trendLine = '—';
                let trendPositive = true;
                if (chartData.length === 1 && baselineRows.length >= 2 && selectedN != null) {
                    const totalAll = baselineRows.reduce((s, d) => s + parseMetricVal(d.value), 0);
                    const pctOfTotal = totalAll > 0 ? ((selectedN / totalAll) * 100).toFixed(1) : '0.0';
                    const ranked = [...baselineRows].sort((a, b) => parseMetricVal(b.value) - parseMetricVal(a.value));
                    const rank = ranked.findIndex((d) => String(d.name) === String(selectedRow.name)) + 1;
                    trendLine = rank > 0
                        ? `${pctOfTotal}% of total · #${rank} of ${ranked.length}`
                        : `${pctOfTotal}% of total`;
                    trendPositive = true;
                } else if (sparkSourceRows.length > 1 && Number.isFinite(firstN) && Number.isFinite(lastN)) {
                    const delta = lastN - firstN;
                    if (Math.abs(firstN) > 1e-9) {
                        const pct = (delta / firstN) * 100;
                        trendLine = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs first category`;
                        trendPositive = pct >= 0;
                    } else {
                        trendLine = `${delta >= 0 ? '+' : ''}${formatNumber(delta)} vs first`;
                        trendPositive = delta >= 0;
                    }
                }
                const canShowSpark = sparkData.length >= 2;
                return (
                    <div className={`metric-card-visual${mcCompact ? ' metric-card-visual--compact' : ''}`}>
                        <div className="metric-card-visual-accent" style={{ background: mainColor }} />
                        <div className="metric-card-visual-body">
                            <div className="metric-card-visual-top">
                                <div className="metric-card-visual-header-row">
                                    <span className="metric-card-visual-kicker">{mcSubtitle}</span>
                                    {showMcFilter && (
                                        <div className="metric-card-filter-row card-filter-row">
                                            <LegendComponent
                                                dimension={legendFilterDimension}
                                                values={rawLegendValues}
                                                variant="inline"
                                                filterScope="visual"
                                                visualFilters={visualFilterRules}
                                                onVisualFilterChange={applyVisualDimensionFilter}
                                                onFilterClear={handleLegendFilterClear}
                                                colorPalette={palette}
                                            />
                                        </div>
                                    )}
                                </div>
                                <h3 className="metric-card-visual-heading">{mcHeading}</h3>
                            </div>
                            <div className="metric-card-visual-metric" style={{ color: mainColor }}>
                                {formatNumber(mcValue)}
                            </div>
                            <div className={`metric-card-visual-trend ${trendPositive ? 'is-positive' : 'is-negative'}`}>
                                {trendLine}
                            </div>
                            <div className="metric-card-visual-spark">
                                {canShowSpark ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sparkData} margin={{ top: 6, right: 8, left: 8, bottom: 2 }}>
                                            <Line
                                                type="linear"
                                                dataKey="value"
                                                stroke={mainColor}
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={false}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="metric-card-visual-spark-empty">
                                        {mcFiltered
                                            ? 'Add a dimension with multiple categories to compare'
                                            : 'Select a category filter or add a dimension to show trend'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }
            case 'bubble':
                return (
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                        {opts.showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />}
                        {opts.showXAxis !== false && (
                            <XAxis
                                dataKey="name"
                                fontSize={8}
                                name={opts.xLabel || graphDefinition.x_axis}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                dataKey="value"
                                fontSize={8}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={35}
                                tick={{ fill: axisTickColor, fontSize: 8 }}
                            />
                        )}
                        <ZAxis type="number" range={[100, 1000]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={tooltipFormatter} />
                        <Scatter name={yAxisDisplayTitle} data={chartData} fill={mainColor} fillOpacity={0.6}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                );
            case 'bullet':
                return (
                    <div style={{ width: '100%', height: '100%', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                        {chartData.slice(0, 5).map((entry, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10px', width: '50px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: axisTickColor }}>{entry.name}</span>
                                <div style={{ flex: 1, height: '14px', backgroundColor: isDark ? 'var(--bg-tertiary)' : '#f1f5f9', borderRadius: '2px', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '70%', backgroundColor: isDark ? 'var(--border-secondary)' : '#e2e8f0', borderRadius: '2px' }} />
                                    <div style={{ position: 'absolute', left: 0, top: '2px', height: '10px', width: `${Math.min(100, (entry.value / totalValue) * 300)}%`, backgroundColor: mainColor, borderRadius: '1px' }} />
                                    <div style={{ position: 'absolute', left: '85%', top: 0, height: '100%', width: '2px', backgroundColor: isDark ? 'var(--text-primary)' : '#1e293b' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'map':
                {
                    const worldGeoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

                    const normalizeGeoLabel = (label) =>
                        String(label || '')
                            .toLowerCase()
                            .replace(/[^a-z0-9\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                    // A few common aliases so "USA" and friends still match world-atlas names.
                    const aliases = {
                        usa: 'united states of america',
                        us: 'united states of america',
                        uk: 'united kingdom',
                        uae: 'united arab emirates',
                        russia: 'russian federation',
                        'south korea': 'korea republic of',
                        'north korea': 'korea democratic peoples republic of',
                        vietnam: 'viet nam'
                    };

                    // Parse a "lat,lon" string if your data has coordinates.
                    const parseLatLon = (raw) => {
                        const match = String(raw || '')
                            .trim()
                            .match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
                        if (!match) return null;
                        const lat = Number(match[1]);
                        const lon = Number(match[3]);
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
                        return { lat, lon };
                    };

                    // Deterministic fallback when values can't be geocoded.
                    const pseudoCoordsFromName = (name) => {
                        let hash = 0;
                        const s = String(name || '');
                        for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
                        const seed = Math.abs(hash);
                        // [-180,180], [-55,75] tends to look better on mercator
                        const lon = -180 + (seed % 360);
                        const lat = -55 + (Math.floor(seed / 97) % 130);
                        return { lon, lat };
                    };

                    const toNumeric = (v) => {
                        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
                        return Number.isFinite(n) ? n : 0;
                    };

                    const rawPoints = Array.isArray(chartData) ? chartData.slice(0, 20) : [];
                    const values = rawPoints.map((p) => toNumeric(p.value));
                    const maxMapValue = Math.max(...values, 1);

                    return (
                        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#f8fafc', borderRadius: 6 }}>
                            <ComposableMap
                                projection="geoMercator"
                                projectionConfig={{ scale: 140 }}
                                style={{ width: '100%', height: '100%' }}
                            >
                                <ZoomableGroup center={[0, 20]} zoom={1} minZoom={0.8} maxZoom={4}>
                                    <Geographies geography={worldGeoUrl}>
                                        {({ geographies }) => {
                                            const geoByName = {};
                                            for (const geo of geographies) {
                                                const rawName = geo?.properties?.name || geo?.properties?.NAME || '';
                                                const key = normalizeGeoLabel(rawName);
                                                if (key && !geoByName[key]) geoByName[key] = geo;
                                            }

                                            const mapPoints = rawPoints.map((entry, index) => {
                                                const name = String(entry?.name || `Point ${index + 1}`);
                                                const ll = parseLatLon(name);
                                                const normalized = normalizeGeoLabel(name);
                                                const aliasNormalized = aliases[normalized] || normalized;
                                                const matchedGeo = aliasNormalized ? geoByName[aliasNormalized] : null;
                                                const centroid = matchedGeo ? geoCentroid(matchedGeo) : null;

                                                if (ll) {
                                                    return { name, value: toNumeric(entry.value), lon: ll.lon, lat: ll.lat, color: palette[index % palette.length], mapped: true };
                                                }

                                                if (centroid && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
                                                    return { name, value: toNumeric(entry.value), lon: centroid[0], lat: centroid[1], color: palette[index % palette.length], mapped: true };
                                                }

                                                const fallback = pseudoCoordsFromName(name);
                                                return { name, value: toNumeric(entry.value), lon: fallback.lon, lat: fallback.lat, color: palette[index % palette.length], mapped: false };
                                            });

                                            const mappedCount = mapPoints.filter((p) => p.mapped).length;
                                            const fallbackCount = mapPoints.length - mappedCount;

                                            return (
                                                <>
                                                    {geographies.map((geo) => (
                                                        <Geography
                                                            key={geo.rsmKey}
                                                            geography={geo}
                                                            fill="#e5e7eb"
                                                            stroke="#cbd5e1"
                                                            strokeWidth={0.4}
                                                            style={{
                                                                default: { outline: 'none' },
                                                                hover: { outline: 'none', fill: '#dbeafe' },
                                                                pressed: { outline: 'none' }
                                                            }}
                                                        />
                                                    ))}

                                                    {mapPoints.map((p, i) => {
                                                        const radius = 3 + (Math.max(0, p.value) / maxMapValue) * 9;
                                                        return (
                                                            <Marker key={`${p.name}-${i}`} coordinates={[p.lon, p.lat]}>
                                                                <circle r={radius + 2} fill={p.color} opacity={0.2} />
                                                                <circle r={radius} fill={p.color} stroke="#fff" strokeWidth={1.2}>
                                                                    <title>{`${p.name}: ${formatNumber(p.value)}${p.mapped ? '' : ' (approx)'}`}</title>
                                                                </circle>
                                                            </Marker>
                                                        );
                                                    })}

                                                    {/* Corner legend */}
                                                    <foreignObject x="12" y="12" width="220" height="40">
                                                        <div style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.85)', padding: '4px 8px', borderRadius: 4 }}>
                                                            Map: {mappedCount} mapped{fallbackCount > 0 ? `, ${fallbackCount} approx` : ''}
                                                        </div>
                                                    </foreignObject>
                                                </>
                                            );
                                        }}
                                    </Geographies>
                                </ZoomableGroup>
                            </ComposableMap>
                            {/* Center label (small) */}
                            <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 11, color: '#94a3b8' }}>
                                {rawPoints.length} points shown
                            </div>
                        </div>
                    );
                }
            case 'sunburst':
                return (
                    <PieChart>
                        <Pie data={chartData} dataKey="value" innerRadius="0%" outerRadius="40%" fill={mainColor} opacity={0.4} isAnimationActive={animation} />
                        <Pie data={chartData} dataKey="value" innerRadius="45%" outerRadius="85%" fill={mainColor} isAnimationActive={animation}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={mainColor} fillOpacity={0.6 + (index / chartData.length) * 0.4} />
                            ))}
                        </Pie>
                        <Tooltip formatter={tooltipFormatter} />
                    </PieChart>
                );
            case 'boxPlot':
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px' }}>
                        {chartData.slice(0, 5).map((entry, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '8px' }}>
                                <div style={{ width: '2px', height: '60%', backgroundColor: '#cbd5e1', position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: '20%', left: '-10px', width: '22px', height: '40%', backgroundColor: mainColor, borderRadius: '2px', border: '1px solid #fff' }} />
                                    <div style={{ position: 'absolute', top: '0', left: '-5px', width: '12px', height: '2px', backgroundColor: '#94a3b8' }} />
                                    <div style={{ position: 'absolute', bottom: '0', left: '-5px', width: '12px', height: '2px', backgroundColor: '#94a3b8' }} />
                                </div>
                                <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>{entry.name}</span>
                            </div>
                        ))}
                    </div>
                );
            case 'violin':
                return (
                    <div className="violin-mock-container" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%' }}>
                                <svg width="100%" height="100%" viewBox="0 0 80 180" preserveAspectRatio="xMidYMid meet">
                                    <path
                                        d="M40,10 Q65,40 65,90 Q65,140 40,170 Q15,140 15,90 Q15,40 40,10"
                                        fill={palette[i % palette.length]}
                                        opacity="0.7"
                                        stroke={palette[i % palette.length]}
                                        strokeWidth="2"
                                    />
                                    <line x1="40" y1="30" x2="40" y2="150" stroke="#1e293b" strokeWidth="2" strokeDasharray="4" />
                                    <rect x="34" y="80" width="12" height="20" fill="#1e293b" rx="2" />
                                    <circle cx="40" cy="90" r="3" fill="#fff" />
                                </svg>
                                <span style={{ fontSize: 'max(8px, 1vw)', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>Seg {i + 1}</span>
                            </div>
                        ))}
                    </div>
                );
            case 'text':
                if (isEditing) {
                    return (
                        <textarea
                            style={{
                                width: '100%',
                                height: '100%',
                                border: '1px solid #8c2546',
                                borderRadius: '4px',
                                padding: '10px',
                                fontSize: '14px',
                                color: 'var(--text-primary)',
                                background: 'var(--bg-elevated)',
                                resize: 'none',
                                outline: 'none',
                                fontStyle: 'normal'
                            }}
                            autoFocus
                            value={textContent}
                            onChange={(e) => setTextContent(e.target.value)}
                            onBlur={() => {
                                setIsEditing(false);
                                if (onUpdate && !isViewOnly) onUpdate({ content: textContent });
                            }}
                        />
                    );
                }
                return (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isDark ? 'var(--text-secondary)' : '#475569',
                            fontSize: '14px',
                            textAlign: 'center',
                            padding: '10px',
                            fontStyle: 'italic',
                            cursor: 'text',
                            userSelect: 'none'
                        }}
                        onDoubleClick={() => !isViewOnly && setIsEditing(true)}
                        title={isViewOnly ? textContent : "Double-click to edit"}
                    >
                        {textContent || (isViewOnly ? '' : 'Double-click to edit text box')}
                    </div>
                );
            case 'paginated_report':
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: isDark ? 'var(--bg-secondary)' : '#f8fafc', border: `1px solid ${isDark ? 'var(--border-primary)' : '#e2e8f0'}`, borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: isDark ? 'var(--bg-tertiary)' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${isDark ? 'var(--border-primary)' : '#cbd5e1'}` }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#f1f5f9' : '#0f172a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#0f172a' }}>Paginated Report</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isDark ? 'var(--text-muted)' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: isDark ? 'var(--text-secondary)' : '#334155', marginBottom: '8px' }}>Use Insert → Paginated Report</div>
                            <div style={{ fontSize: '11px', color: isDark ? 'var(--text-muted)' : '#64748b', maxWidth: '250px' }}>Generate PDF reports from the Insert tab ribbon.</div>
                        </div>
                    </div>
                );
            case 'power_app':
                return (
                    <PowerAppsVisual
                        fileId={fileId}
                        graphDefinition={graphDefinition}
                        selection={selection}
                        onUpdate={onUpdate}
                        isDragging={isDragging}
                    />
                );
            default:
                return <div>Unsupported graph type: {graphDefinition.graph_type}</div>;
        }
    };

    const getStats = () => {
        if (!data || !Array.isArray(data)) return null;
        if (graphDefinition.graph_type === 'table') return null;
        if (data.length === 0) return null;

        // Use parseFloat to handle potential string formatted numbers
        const validValues = data.map(d => {
            const val = typeof d.value === 'string' ? parseFloat(d.value.replace(/,/g, '')) : d.value;
            return val;
        }).filter(v => typeof v === 'number' && !isNaN(v));

        if (validValues.length === 0) return null;

        const sum = validValues.reduce((a, b) => a + b, 0);
        const avg = sum / validValues.length;
        const max = Math.max(...validValues);
        const min = Math.min(...validValues);

        return { sum, avg, max, min };
    };

    const stats = getStats();
    const zoomableVisualTypes = new Set([
        'bar', 'column', 'stackedColumn', 'histogram',
        'line', 'area', 'pie', 'donut', 'scatter', 'radar',
        'polarArea', 'treemap', 'heatmap', 'composed', 'funnel',
        'sankey', 'waterfall', 'radialBar', 'gauge', 'step',
        'rangeBar', 'combination', 'bubble', 'sunburst'
    ]);
    const canZoom = zoomableVisualTypes.has(graphDefinition.graph_type);
    const zoomIn = () => setZoomLevel((prev) => Math.min(MAX_ZOOM, Number((prev + 0.25).toFixed(2))));
    const zoomOut = () => setZoomLevel((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))));
    const resetZoom = () => setZoomLevel(1);

    useLayoutEffect(() => {
        const el = zoomViewportRef.current;
        if (!el) return;
        if (!showZoomControls || !canZoom || zoomLevel <= 1) {
            el.scrollTo({ left: 0, top: 0, behavior: 'auto' });
            return;
        }
        let rafA = 0;
        let rafB = 0;
        rafA = requestAnimationFrame(() => {
            rafB = requestAnimationFrame(() => {
                recenterZoomViewport();
            });
        });
        return () => {
            if (rafA) cancelAnimationFrame(rafA);
            if (rafB) cancelAnimationFrame(rafB);
        };
    }, [zoomLevel, showZoomControls, canZoom, graphDefinition.id, dimensions.width, dimensions.height, recenterZoomViewport]);

    const renderChartMessage = (message, className = 'chart-empty') => (
        <div className="chart-wrapper chart-wrapper--state">
            <div className={className}>{message}</div>
        </div>
    );

    const noDataRenderTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate', 'smart_narrative']);
    if (!noDataRenderTypes.has(graphDefinition.graph_type)) {
        if (loading && !data && !crossFilterRefreshing) return renderChartMessage('Loading chart...', 'chart-loading');
        if (error && !data && !crossFilterRefreshing) return renderChartMessage('No data available');
        if (configHint && !data && !crossFilterRefreshing) return renderChartMessage(configHint);
        if (hasNoChartRows) {
            if (loading || crossFilterRefreshing) return renderChartMessage('Loading chart...', 'chart-loading');
            return renderChartMessage(
                isCrossFilterActive ? 'No data matches the current filter' : 'No data available'
            );
        }
    } else {
        if (error && !data) return null;
    }

    // Use effectiveDimFields: falls back to [x_axis] for auto-generated charts that haven't used the field-well
    const canDrill = effectiveDimFields.length > 1 && graphDefinition.graph_type !== 'table';
    const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
    const isCompactLayout = Boolean(zoomToolbarContainer || hideChartTitle);
    const isPieDonutChart = graphDefinition.graph_type === 'pie' || graphDefinition.graph_type === 'donut';
    const isMetricCard = graphDefinition.graph_type === 'metricCard';
    const isKpiCard = graphDefinition.graph_type === 'kpiCard';
    const isSparkline = graphDefinition.graph_type === 'sparkline';
    const isCardVisual = isKpiCard || isMetricCard;
    const hideTopLegendOnCard = (isMetricCard || isKpiCard) && hideInternalStats;

    const zoomToolbarNode = showZoomControls && canZoom ? (
        <div className={`chart-zoom-toolbar ${zoomToolbarContainer ? 'chart-zoom-toolbar-header' : ''} ${showZoomControls && !zoomToolbarContainer ? 'chart-zoom-toolbar-focus' : ''}`}>
            <button type="button" className="chart-zoom-btn" onClick={zoomOut} disabled={zoomLevel <= 1}>-</button>
            <span className="chart-zoom-value">{Math.round(zoomLevel * 100)}%</span>
            <button type="button" className="chart-zoom-btn" onClick={zoomIn} disabled={zoomLevel >= MAX_ZOOM}>+</button>
            <button type="button" className="chart-zoom-reset" onClick={resetZoom} disabled={zoomLevel === 1}>Reset</button>
        </div>
    ) : null;

    const barChartTypes = ['bar', 'column', 'stackedColumn', 'histogram'];
    const isBarChartVisual = barChartTypes.includes(graphDefinition.graph_type);
    const visualOpts = graphDefinition.options || {};
    const showXAxisTitleFooter = isBarChartVisual
        && visualOpts.showAxisTitles !== false
        && !isMicro
        && visualOpts.showXAxis !== false;
    const xAxisFooterTitle = showXAxisTitleFooter
        ? String(visualOpts.xLabel || graphDefinition.x_axis || '').trim()
        : '';

    const activeTheme = reportTheme || graphDefinition.options?.reportTheme || 'theme_default';
    const isDark = activeTheme === 'theme_dark';
    const axisTitleColor = isDark ? '#f1f5f9' : '#4b5563';

    return (
        <div
            ref={containerRef}
            className={`chart-wrapper ${isDark ? 'dark-theme ' : ''}${isCompactLayout ? 'chart-wrapper--compact' : ''}${isHierarchyActive ? ' chart-wrapper--drill-active' : ''}${hasActiveChartFilter ? ' chart-wrapper--filtering' : ''}${crossFilterRefreshing ? ' chart-wrapper--crossfilter-refresh' : ''}${isMetricCard ? ' chart-wrapper--metric-card' : ''}${isKpiCard ? ' chart-wrapper--kpi-card' : ''}${isSparkline ? ' chart-wrapper--sparkline' : ''}`}
            style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: graphDefinition.options?.bgColor || 'transparent',
            padding: isMicro ? '2px' : (isCompactLayout || isCardVisual ? '0' : '4px'),
            borderRadius: '4px',
            overflow: 'hidden'
        }}>
            {canDrill && (
                <DrillDownPanel
                    dimensionFields={effectiveDimFields}
                    activeLevelIndex={drillLevelIndex}
                    drillPath={drillPath}
                    drillModeActive={drillModeActive}
                    expandModeActive={expandModeActive}
                    showLegendFilter={showDrillFilter}
                    legendFilterDimension={legendFilterDimension}
                    legendFilterValues={rawLegendValues}
                    onDrillUp={() => {
                        if (drillPath.length > 0) {
                            const newPath = drillPath.slice(0, -1);
                            updateDrillState({
                                drillPath: newPath,
                                drillLevelIndex: Math.max(0, newPath.length),
                                expandModeActive: newPath.length > 0,
                            });
                            return;
                        }

                        if (expandModeActive && drillLevelIndex > 0) {
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex - 1,
                                expandModeActive: true,
                            });
                            return;
                        }

                        if (expandModeActive && drillLevelIndex === 0) {
                            updateDrillState({ expandModeActive: false });
                            return;
                        }

                        if (drillLevelIndex > 0) {
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex - 1,
                                expandModeActive: drillLevelIndex - 1 > 0,
                            });
                        }
                    }}
                    onDrillDown={() => {
                        if (drillLevelIndex < effectiveDimFields.length - 1) {
                            updateDrillState({
                                drillLevelIndex: drillLevelIndex + 1,
                                expandModeActive: true,
                            });
                        }
                    }}
                    onDrillModeToggle={() => {
                        updateDrillState({
                            drillModeActive: !drillModeActive,
                        });
                    }}
                    onResetDrill={() => {
                        updateDrillState({
                            drillLevelIndex: 0,
                            drillPath: [],
                            expandModeActive: false,
                            drillModeActive: false,
                        });
                    }}
                />
            )}
            {graphDefinition.options?.title && !isMicro && !hideChartTitle && !hideInternalStats && (
                <div style={{
                    fontSize: isSmall ? '10px' : '12px',
                    fontWeight: 700,
                    color: axisTitleColor,
                    marginBottom: isCompactLayout ? '2px' : '4px',
                    textAlign: 'center'
                }}>
                    {graphDefinition.options.title}
                </div>
            )}
            {graphDefinition.options?.showLegend !== false && !isMicro && showLegendFilterRow && !showDrillFilter && !hideTopLegendOnCard && !isPieDonutChart && (
                <div
                    style={{
                        margin: isCompactLayout ? '2px 0 0' : '4px 0 2px',
                        display: 'flex',
                        justifyContent: 'center',
                        width: '100%',
                        flexShrink: 0,
                    }}
                >
                    <LegendComponent
                        dimension={legendFilterDimension}
                        values={rawLegendValues}
                        maxItems={rawLegendValues.length > 8 ? 6 : 12}
                        variant="chips"
                        filterScope="visual"
                        visualFilters={visualFilterRules}
                        onVisualFilterChange={applyVisualDimensionFilter}
                        onFilterClear={handleLegendFilterClear}
                        colorPalette={reportPalette}
                    />
                </div>
            )}
            {(!hideInternalStats && stats) && (
                <div className="chart-kpi-row">
                    <div className="chart-kpi-item">
                        <span className="kpi-label">TOTAL</span>
                        <span className="kpi-value">{Math.round(stats.sum).toLocaleString()}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">AVG</span>
                        <span className="kpi-value">{stats.avg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">MAX</span>
                        <span className="kpi-value">{stats.max.toLocaleString()}</span>
                    </div>
                    <div className="chart-kpi-item">
                        <span className="kpi-label">MIN</span>
                        <span className="kpi-value">{stats.min.toLocaleString()}</span>
                    </div>
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {zoomToolbarNode && !zoomToolbarContainer && zoomToolbarNode}
                {zoomToolbarNode && zoomToolbarContainer && createPortal(zoomToolbarNode, zoomToolbarContainer)}
                <div
                    ref={zoomViewportRef}
                    className={`chart-zoom-viewport${isCardVisual ? ' chart-zoom-viewport--card' : ''}${crossFilterRefreshing ? ' chart-zoom-viewport--refreshing' : ''}${hasVisualCategoryFilter || hasActiveChartFilter ? ' chart-zoom-viewport--filtered' : ''}`}
                    style={{ flex: 1, minHeight: 0, width: '100%', overflow: canZoom && zoomLevel > 1 ? 'auto' : 'hidden' }}
                    onMouseDown={(e) => {
                        if (e.target?.closest?.('.recharts-wrapper, .recharts-surface, .sc-chart-area, svg')) {
                            e.stopPropagation();
                        }
                    }}
                >
                    {crossFilterRefreshing && <div className="chart-crossfilter-shimmer" aria-hidden="true" />}
                    {isCardVisual ? (
                        <div className="chart-card-visual-slot">
                            {renderChart()}
                        </div>
                    ) : (
                        <div style={{ width: canZoom ? `${zoomLevel * 100}%` : '100%', height: canZoom ? `${zoomLevel * 100}%` : '100%', minWidth: '100%', minHeight: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                {renderChart()}
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
                {xAxisFooterTitle ? (
                    <div
                        className="chart-axis-title chart-axis-title--x"
                        title={xAxisFooterTitle}
                        style={{ paddingTop: barChartFooterLayout?.footerGap ?? 4 }}
                    >
                        {xAxisFooterTitle}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default React.memo(DynamicChart);
