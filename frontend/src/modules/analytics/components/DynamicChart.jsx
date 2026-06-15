import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { GitBranch } from 'lucide-react';
import './DynamicChart.css';
import { useTheme } from '../../../shared/context/ThemeContext';
import { useGlobalFilters } from '../context/FilterContext';
import {
    filterData,
    filterRulesToFilterMap,
    filterMapHasValues,
    normalizeFilterRules,
    sanitizeFilterMap,
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
import { resolveTableStyle } from '../utils/tableStyleUtils';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Sector, Label,
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
import {
    VIBRANT_PALETTE,
    buildCategoryColorMap,
    resolveCategoryColor,
    isChartNoFill,
    resolveChartFillBackground,
} from '../constants/chartPalette';
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

/** Scale typography with the measured visual container (resize card → fonts follow). */
const computeResponsiveFontSize = (baseSize, width, height, { min = 7, max = 18 } = {}) => {
    const w = width > 0 ? width : 400;
    const h = height > 0 ? height : 320;
    const minDim = Math.min(w, h);
    const scale = Math.min(1.35, Math.max(0.72, minDim / 360));
    return Math.round(Math.min(max, Math.max(min, baseSize * scale)));
};

const estimateTextWidth = (text, fontSize, weight = 400) => {
    const len = Math.max(1, String(text).length);
    const charFactor = weight >= 700 ? 0.62 : 0.54;
    return len * fontSize * charFactor;
};

/** Fit donut center labels inside the inner hole using the rendered inner radius (px). */
const computeDonutCenterTypography = ({
    innerRadiusPx,
    nameText = '',
    valueText = '',
    pctText = '',
}) => {
    const innerR = Math.max(6, Number(innerRadiusPx) || 0);
    const holeDiameter = innerR * 2;
    const maxW = holeDiameter * 0.62;
    const maxH = holeDiameter * 0.62;

    const showTitle = holeDiameter >= 44 && String(nameText).trim().length > 0;
    const showPct = holeDiameter >= 36 && String(pctText).trim().length > 0;
    const lineCount = 1 + (showTitle ? 1 : 0) + (showPct ? 1 : 0);

    let valueFont = Math.max(6, Math.min(18, innerR * (lineCount === 1 ? 0.42 : 0.34)));
    let titleFont = Math.max(5, Math.min(12, valueFont * 0.58));
    let pctFont = Math.max(5, Math.min(10, valueFont * 0.48));

    const fitFontToWidth = (font, text, weight) => {
        const est = estimateTextWidth(text, font, weight);
        return est > maxW ? font * (maxW / est) : font;
    };

    valueFont = fitFontToWidth(valueFont, valueText, 800);
    if (showTitle) titleFont = fitFontToWidth(titleFont, nameText, 600);
    if (showPct) pctFont = fitFontToWidth(pctFont, pctText, 500);

    const lineGap = (a, b) => Math.max(1, Math.min(4, (a + b) * 0.08));
    const lineFonts = [];
    if (showTitle) lineFonts.push(titleFont);
    lineFonts.push(valueFont);
    if (showPct) lineFonts.push(pctFont);

    let totalH = lineFonts.reduce((sum, font, i) => {
        if (i === 0) return font;
        return sum + lineGap(lineFonts[i - 1], font) + font;
    }, 0);

    if (totalH > maxH) {
        const shrink = maxH / totalH;
        titleFont *= shrink;
        valueFont *= shrink;
        pctFont *= shrink;
    }

    const finalLineFonts = [];
    if (showTitle) finalLineFonts.push(titleFont);
    finalLineFonts.push(valueFont);
    if (showPct) finalLineFonts.push(pctFont);
    totalH = finalLineFonts.reduce((sum, font, i) => {
        if (i === 0) return font;
        return sum + lineGap(finalLineFonts[i - 1], font) + font;
    }, 0);

    const maxNameChars = Math.max(4, Math.floor(maxW / (titleFont * 0.54)));
    let displayName = String(nameText);
    if (displayName.length > maxNameChars) {
        displayName = `${displayName.slice(0, Math.max(3, maxNameChars - 1))}…`;
    }

    const round = (n) => Math.round(n * 10) / 10;
    return {
        titleFont: round(titleFont),
        valueFont: round(valueFont),
        pctFont: round(pctFont),
        totalH: round(totalH),
        displayName,
        showTitle,
        showPct,
        lineGap,
    };
};

const buildDonutCenterLabelLines = (type, cx, cy, valueText, pctText) => {
    const items = [];
    if (type.showTitle) {
        items.push({ text: type.displayName, fontSize: type.titleFont, weight: 600, kind: 'title' });
    }
    items.push({ text: valueText, fontSize: type.valueFont, weight: 800, kind: 'value' });
    if (type.showPct) {
        items.push({ text: pctText, fontSize: type.pctFont, weight: 500, kind: 'pct' });
    }

    const gap = type.lineGap;
    let y = cy - type.totalH / 2;
    return items.map((item, index) => {
        y += item.fontSize / 2;
        const line = { ...item, x: cx, y };
        y += item.fontSize / 2;
        if (index < items.length - 1) {
            y += gap(item.fontSize, items[index + 1].fontSize);
        }
        return line;
    });
};

const TICK_FONT_PX = 8;
const TICK_CHAR_PX = TICK_FONT_PX * 0.62;

/** How many characters fit in one bar slot at a given font size (px). */
const measureSlotCharCapacity = (slotWidthPx, fontSize) => {
    if (slotWidthPx <= 0 || fontSize <= 0) return 0;
    const charPx = Math.max(2.6, fontSize * 0.5);
    return Math.max(1, Math.floor((slotWidthPx * 0.95) / charPx));
};

const formatXAxisTick = (val, fullLabels = false, _tickMaxLen = 12, _charsPerSlot = 0, slotWidthPx = 0, fontSize = TICK_FONT_PX, angle = 0) => {
    const str = String(val ?? '');
    if (fullLabels || str.includes(' | ')) return str;

    const slotChars = (angle === -90)
        ? _tickMaxLen
        : (slotWidthPx > 0
            ? measureSlotCharCapacity(slotWidthPx, fontSize)
            : Math.max(1, Math.floor(Number(_charsPerSlot) || Number(_tickMaxLen) || 12)));

    if (str.length <= slotChars) return str;
    if (slotChars < 2) return str;
    return `${str.slice(0, slotChars - 1)}…`;
};

const QUICK_MEASURE_FIELD_LABELS = {
    value_field: 'Value',
    total_field: 'Total',
    current_field: 'Current',
    prior_field: 'Prior',
    actual_field: 'Actual',
    target_field: 'Target',
    numerator: 'Numerator',
    denominator: 'Denominator',
    part_field: 'Part',
    whole_field: 'Whole',
    field: 'Field',
    field_a: 'Field A',
    field_b: 'Field B',
    date_field: 'Date',
    category_field: 'Category',
    condition_field: 'Condition',
    weight_field: 'Weight',
    top_n: 'Top N',
    periods: 'Periods',
};

const formatQuickMeasureFieldLabel = (key) => {
    const raw = String(key || '').trim();
    if (!raw) return 'Field';
    if (QUICK_MEASURE_FIELD_LABELS[raw]) return QUICK_MEASURE_FIELD_LABELS[raw];
    return raw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const getQuickMeasureMappings = (measureField) => {
    const mappings = measureField?.field_mappings || measureField?.config || {};
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) return [];
    return Object.entries(mappings)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([key, value]) => ({
            key,
            label: formatQuickMeasureFieldLabel(key),
            value: String(value),
        }));
};

const formatPercentNumber = (num) => {
    if (typeof num !== 'number' || !Number.isFinite(num)) return num;
    return `${num.toLocaleString(undefined, {
        minimumFractionDigits: Math.abs(num) > 0 && Math.abs(num) < 1 ? 2 : 0,
        maximumFractionDigits: 2,
    })}%`;
};

/**
 * Pick the largest readable font that fits the longest label in each bar slot.
 * Falls back to the font that maximizes visible characters when the longest name cannot fit.
 */
const computeXAxisTickFontSize = (count, slotWidth, focusView = false, maxLabelLen = 0, dashboardCard = false) => {
    if (slotWidth <= 0) return focusView ? 11 : TICK_FONT_PX;

    const longest = Math.max(1, Number(maxLabelLen) || 1);
    const minFs = focusView ? 8 : (dashboardCard ? 7 : 5);
    const maxFs = focusView ? 14 : (dashboardCard ? 8 : 9);

    let bestFs = minFs;
    let bestCap = 0;
    for (let fs = maxFs; fs >= minFs; fs -= 1) {
        const cap = measureSlotCharCapacity(slotWidth, fs);
        if (cap >= longest) return fs;
        if (cap > bestCap) {
            bestCap = cap;
            bestFs = fs;
        }
    }
    return dashboardCard ? Math.max(minFs, bestFs) : bestFs;
};

/** Plot width available for category bands (single margin pass). */
const resolveBarPlotWidth = (containerWidth, { isDashboardCanvas = false, isFocusView = false } = {}) => {
    if (containerWidth <= 0) return 420;
    const yAxisReserve = isDashboardCanvas ? 44 : 52;
    const sideMargin = isDashboardCanvas ? 10 : (isFocusView ? 14 : 18);
    return Math.max(120, containerWidth - yAxisReserve - sideMargin);
};

/** Vertical space (px) needed for a tick label at a given angle and character count. */
const estimateAngledTickHeight = (labelChars, angleDeg, fontSize = TICK_FONT_PX) => {
    if (!angleDeg) return fontSize + 8;
    const rad = (Math.abs(angleDeg) * Math.PI) / 180;
    const textPx = labelChars * TICK_CHAR_PX * (fontSize / TICK_FONT_PX);
    return Math.ceil(Math.sin(rad) * textPx + Math.cos(rad) * (fontSize + 2) + 4);
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

/** Small padding below the X-axis band (tick space is reserved via XAxis `height`). */
const computeChartBottomMargin = (isDashboardCanvas = false) => (
    isDashboardCanvas ? 2 : 4
);

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

/** Above this category count, x-axis labels are thinned (API / high-cardinality charts). */
const DENSE_X_AXIS_CATEGORY_CAP = 28;

const computeXAxisLayout = (chartData, { expandModeActive = false, compactMode = false, chartWidth = 0, focusView = false, dashboardCard = false, graphType = '' } = {}) => {
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
        footerGap: 2,
    };
    if (count === 0) return emptyLayout;

    const hasComposite = expandModeActive || names.some((n) => n.includes(' | '));
    const maxLen = names.reduce((m, n) => Math.max(m, n.length), 0);
    const plotWidth = chartWidth > 60 ? chartWidth : 0;
    const slotWidth = plotWidth > 0 ? plotWidth / count : 0;
    let fontSize = computeXAxisTickFontSize(count, slotWidth, focusView, maxLen, dashboardCard);
    let charsPerSlot = measureSlotCharCapacity(slotWidth, fontSize) || maxLen;

    const isHighCardinality = count > DENSE_X_AXIS_CATEGORY_CAP;

    const useAngledDashboard = dashboardCard && !focusView && !hasComposite
        && !isHighCardinality
        && count > 8
        && (charsPerSlot < maxLen || count > 12);

    if (useAngledDashboard) {
        fontSize = Math.max(7, Math.min(8, fontSize));
        charsPerSlot = Math.max(charsPerSlot, Math.min(maxLen, 14));
    }

    let fullLabels = !hasComposite && !isHighCardinality && charsPerSlot >= maxLen;
    let tickMaxLen = fullLabels ? maxLen : Math.min(maxLen, charsPerSlot);
    let displayLen = useAngledDashboard ? Math.min(maxLen, 16) : tickMaxLen;

    const preferHorizontal = focusView
        ? true
        : (!useAngledDashboard && (compactMode || count > 8 || (slotWidth > 0 && slotWidth < 64)));
    let angle = 0;
    let textAnchor = 'middle';

    if (useAngledDashboard) {
        angle = count > 14 ? -40 : -35;
        textAnchor = 'end';
    } else if (!preferHorizontal && !hasComposite) {
        if (maxLen > 20) {
            angle = count > 6 ? -32 : -24;
        } else if (count > 10 || maxLen > 16) {
            angle = -28;
        } else if (count > 6 || maxLen > 12) {
            angle = count <= 8 ? -22 : -28;
        } else if (count > 3 && maxLen > 9) {
            angle = -16;
        }
        if (angle !== 0) textAnchor = 'end';
    }

    const isColumnScroll = count > 10 && ['column', 'stackedColumn', 'histogram'].includes(graphType);
    if (isColumnScroll) {
        angle = -90;
        textAnchor = 'end';
        fontSize = focusView ? 9 : 8;
        tickMaxLen = 12;
        displayLen = 12;
        fullLabels = false;
    }

    const tickPad = focusView ? 10 : (dashboardCard ? 9 : 7);
    let height = angle === 0
        ? fontSize + tickPad
        : estimateAngledTickHeight(displayLen, angle, fontSize);
    const maxHeight = isColumnScroll
        ? (focusView ? 90 : 75)
        : (focusView
            ? 64
            : (useAngledDashboard ? 48 : (compactMode ? 40 : (hasComposite ? 64 : 52))));
    height = Math.min(maxHeight, Math.max(angle === 0 ? fontSize + (focusView ? 8 : (dashboardCard ? 7 : 6)) : 20, height));

    const tickMargin = angle ? Math.min(4, Math.max(1, Math.round(height * 0.04))) : (focusView ? 2 : 1);
    let interval = 0;
    let minTickGap = 0;

    if (isColumnScroll) {
        interval = 0;
        minTickGap = 0;
    } else if (isHighCardinality) {
        angle = 0;
        textAnchor = 'middle';
        fontSize = dashboardCard ? 7 : Math.min(fontSize, 8);
        charsPerSlot = measureSlotCharCapacity(slotWidth, fontSize) || charsPerSlot;
        tickMaxLen = Math.min(maxLen, Math.max(4, charsPerSlot));
        displayLen = tickMaxLen;
        height = fontSize + (dashboardCard ? 8 : 9);
        const maxTicks = focusView
            ? Math.min(20, Math.max(10, Math.floor(plotWidth / 34)))
            : Math.min(12, Math.max(6, Math.floor(plotWidth / 40)));
        interval = Math.max(1, Math.ceil(count / maxTicks) - 1);
        minTickGap = 6;
    } else {
        const labelsFitAll = focusView || fullLabels || (slotWidth >= 28 && charsPerSlot >= 5);
        if (!labelsFitAll && slotWidth > 0) {
            if (count > 32 && slotWidth < 20) {
                interval = 'preserveStartEnd';
            } else if (charsPerSlot < 5 && count > 12) {
                const targetVisible = Math.max(8, Math.floor(plotWidth / Math.max(maxLen * fontSize * 0.5, fontSize * 5)));
                if (targetVisible < count) {
                    interval = Math.max(1, Math.ceil(count / targetVisible) - 1);
                }
            }
        }
        minTickGap = labelsFitAll || interval === 0 ? 0 : 1;
    }

    return {
        fullLabels,
        tickMaxLen,
        charsPerSlot,
        slotWidth,
        useAngledDashboard,
        angle,
        height,
        bottom: height + tickMargin,
        interval,
        fontSize,
        textAnchor,
        minTickGap,
        tickMargin,
        footerGap: 2,
    };
};

/** Bar value labels — above positive bars, just above zero line for negatives (avoids x-axis overlap). */
const renderBarDataLabel = (formatNumber) => (props) => {
    const { x, y, width, height, value } = props;
    const num = Number(value);
    if (!Number.isFinite(num) || x == null || y == null) return null;
    const cx = Number(x) + (Number(width) || 0) / 2;
    const isNeg = num < 0;
    const labelY = isNeg ? Number(y) - 4 : Number(y) - 6;
    return (
        <text
            x={cx}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="auto"
            fontSize={9}
            fontWeight={600}
            fill="#334155"
            style={{ pointerEvents: 'none' }}
        >
            {formatNumber(value)}
        </text>
    );
};

const MAX_PIE_SHOW_ALL_SLICES = 1200;

/** Shared Top-N / Show All slice builder for pie & donut (controls + chart must use the same output). */
function buildPieDonutProcessedData(chartRows, { scShowAll, scTopN, scGroupOthers, scHiddenSlices }) {
    if (!Array.isArray(chartRows) || chartRows.length === 0) return null;
    const rawSorted = [...chartRows].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

    const showAll = scShowAll;
    const topN = scTopN;
    const groupOthers = scGroupOthers;

    let processedData;
    if (!showAll && rawSorted.length > topN) {
        const top = rawSorted.slice(0, topN).filter((d) => !scHiddenSlices.has(d.name));
        if (groupOthers) {
            const othersVal = rawSorted.slice(topN).reduce((s, d) => s + (Number(d.value) || 0), 0)
                + rawSorted.filter((d) => scHiddenSlices.has(d.name)).reduce((s, d) => s + (Number(d.value) || 0), 0);
            processedData = othersVal > 0
                ? [...top, { name: 'Others', value: othersVal, __others: true }]
                : top;
        } else {
            processedData = top;
        }
    } else {
        processedData = rawSorted.filter((d) => !scHiddenSlices.has(d.name));
        if (processedData.length > MAX_PIE_SHOW_ALL_SLICES) {
            processedData = processedData.slice(0, MAX_PIE_SHOW_ALL_SLICES);
        }
    }
    const pieSlices = processedData;
    const pieTotal = pieSlices.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const nonZeroSliceCount = pieSlices.filter((d) => Number(d.value) > 0).length;
    return {
        rawSorted,
        pieSlices,
        pieTotal,
        nonZeroSliceCount,
        scLabelCount: pieSlices.length,
        actualShowAll: showAll,
        actualTopN: topN,
        actualGroupOthers: groupOthers,
    };
}

/** Max radial outside labels that fit in the card without overlap */
function computeMaxPieOutsideLabels({
    sliceCount,
    labelFont,
    labelMargin,
    plotHeight,
    plotWidth,
    hasLegendPanel,
}) {
    const legendSide = hasLegendPanel ? 120 : 0;
    const plotH = Math.max(100, plotHeight - labelMargin * 2 - 36);
    const plotW = Math.max(100, plotWidth - labelMargin * 2 - legendSide);
    const ring = Math.min(plotH, plotW);
    const slotH = labelFont + 8;
    let cap = Math.max(6, Math.floor(ring / slotH));
    if (sliceCount <= 6) return sliceCount;
    if (sliceCount <= 10) cap = Math.min(cap, 8);
    else if (sliceCount <= 16) cap = Math.min(cap, 7);
    else if (sliceCount > 35) cap = Math.min(cap, 10);
    else if (sliceCount > 24) cap = Math.min(cap, 12);
    else if (sliceCount > 16) cap = Math.min(cap, 14);
    return Math.min(cap, sliceCount);
}

/** Dashboard pie/donut: scale label budget + pie size with card dimensions. */
function computePieCardLabelCapacity({
    plotWidth,
    plotHeight,
    sliceCount,
    labelFont = 10,
    isDashboardCanvas = false,
}) {
    const w = Math.max(120, plotWidth || 300);
    const h = Math.max(100, plotHeight || 280);
    const minDim = Math.min(w, h);
    const area = w * h;
    const isLarge = minDim >= 360 || area >= 160000;
    const isMedium = !isLarge && (minDim >= 260 || area >= 90000);

    const slotH = labelFont + 7;
    const labelRing = Math.min(Math.max(80, w - 36), Math.max(80, h - 36));
    let maxLabels = Math.max(4, Math.floor(labelRing / slotH));

    if (!isDashboardCanvas) {
        return {
            maxLabels: Math.min(maxLabels, sliceCount),
            isLarge,
            isMedium,
            marginRatio: 0.12,
            outerBoost: 0,
            maxStaggerTiers: 8,
            cardInset: 4,
        };
    }

    if (sliceCount <= 6) {
        maxLabels = sliceCount;
    } else if (isLarge) {
        maxLabels = Math.min(sliceCount, sliceCount <= 10 ? sliceCount : sliceCount <= 16 ? 12 : 14);
    } else if (isMedium) {
        maxLabels = Math.min(sliceCount, sliceCount <= 10 ? 9 : sliceCount <= 16 ? 10 : 11);
    } else {
        maxLabels = Math.min(sliceCount, sliceCount <= 10 ? 7 : sliceCount <= 16 ? 8 : 9);
    }

    let marginRatio;
    if (isLarge) {
        marginRatio = sliceCount <= 6 ? 0.085 : sliceCount <= 10 ? 0.095 : sliceCount <= 16 ? 0.10 : 0.11;
    } else if (isMedium) {
        marginRatio = sliceCount <= 6 ? 0.10 : sliceCount <= 10 ? 0.11 : sliceCount <= 16 ? 0.12 : 0.13;
    } else {
        marginRatio = sliceCount <= 6 ? 0.11 : sliceCount <= 10 ? 0.13 : sliceCount <= 16 ? 0.14 : 0.15;
    }

    const outerBoost = isLarge ? 10 : isMedium ? 5 : 0;
    const maxStaggerTiers = isLarge ? 14 : isMedium ? 10 : 6;

    return {
        maxLabels,
        isLarge,
        isMedium,
        marginRatio,
        outerBoost,
        maxStaggerTiers,
        cardInset: isLarge ? 6 : 8,
    };
}

function computePieOutsideLabelEligible(pieSlices, pieTotal, maxOutside, showAllLabels = false) {
    const eligible = new Set();
    if (showAllLabels) {
        pieSlices.forEach((d, i) => {
            if (Number(d.value) > 0) eligible.add(i);
        });
        return eligible;
    }
    const candidates = [];
    const sliceCount = pieSlices.length;
    const minPct = sliceCount > 20 ? 0.025 : sliceCount > 12 ? 0.015 : 0;
    pieSlices.forEach((d, i) => {
        const val = Number(d.value) || 0;
        if (val <= 0) return;
        const isOthers = d.name === 'Others' || d.__others;
        const pct = pieTotal > 0 ? val / pieTotal : 0;
        candidates.push({ index: i, val, pct, isOthers });
    });
    candidates.sort((a, b) => b.val - a.val);
    candidates.filter((c) => c.isOthers).forEach((c) => eligible.add(c.index));
    for (const c of candidates) {
        if (eligible.size >= maxOutside) break;
        if (eligible.has(c.index)) continue;
        if (minPct > 0 && c.pct < minPct) continue;
        eligible.add(c.index);
    }
    return eligible;
}

/** Stop dashboard card drag/select — bubble phase only so inputs still receive clicks. */
function stopPieControlBubble(e) {
    e.stopPropagation();
}

function PieDonutControls({
    scShowLabels,
    onShowLabelsChange,
    scGroupOthers,
    onGroupOthersChange,
    scShowAll,
    onShowAllChange,
    scTopN,
    onTopNChange,
    scLabelSide,
    onLabelSideChange,
    sliceModel,
    scTotalPoints,
    formatNumber,
    calloutLabelStats,
    isFocusView = false,
    centerLegend = null,
}) {
    if (!sliceModel) return null;
    const { rawSorted, pieSlices, pieTotal, nonZeroSliceCount, scLabelCount } = sliceModel;
    const showAllDense = scShowAll && scLabelCount > 24 && scLabelSide !== 'all';
    const veryDenseShowAll = scShowAll && scLabelCount > 80 && scLabelSide !== 'all';

    return (
        <div
            className={`sc-controls-bar${isFocusView ? ' sc-controls-bar--focus' : ''}${!isFocusView ? ' sc-controls-bar--dashboard' : ''}`}
            role="toolbar"
            aria-label="Pie chart display options"
            onMouseDown={stopPieControlBubble}
            onPointerDown={stopPieControlBubble}
            onClick={stopPieControlBubble}
        >
            <div className="sc-controls-start">
                <label className="sc-toggle">
                    <input
                        type="checkbox"
                        checked={scShowLabels}
                        onChange={(e) => onShowLabelsChange(e.target.checked)}
                    />
                    <span>Labels</span>
                </label>
                <label className="sc-toggle">
                    <input
                        type="checkbox"
                        checked={scGroupOthers}
                        onChange={(e) => onGroupOthersChange(e.target.checked)}
                        disabled={scShowAll}
                    />
                    <span>Group Others</span>
                </label>
                <label className="sc-toggle">
                    <input
                        type="checkbox"
                        checked={scShowAll}
                        onChange={(e) => onShowAllChange(e.target.checked)}
                    />
                    <span>Show All</span>
                </label>
                {showAllDense && (
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {veryDenseShowAll && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>Dense mode: click any chart side for that corner labels</span>
                        )}
                        {!veryDenseShowAll && (
                            <>
                                {[
                                    ['leftTop', 'Left Top'],
                                    ['leftBottom', 'Left Bottom'],
                                    ['rightTop', 'Right Top'],
                                    ['rightBottom', 'Right Bottom'],
                                    ['all', 'All'],
                                ].map(([side, label]) => (
                                    <button
                                        key={side}
                                        type="button"
                                        style={{
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 6,
                                            border: '1px solid #cbd5e1',
                                            background: scLabelSide === side ? '#eef2ff' : '#fff',
                                            color: '#334155',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => onLabelSideChange(side)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                )}
                {!scShowAll && (
                    <label className="sc-slider-label">
                        <span>Top {scTopN}</span>
                        <input
                            type="range"
                            min={3}
                            max={Math.min(100, Math.max(3, rawSorted.length))}
                            step={1}
                            value={Math.min(scTopN, rawSorted.length)}
                            onChange={(e) => onTopNChange(Number(e.target.value))}
                            onInput={(e) => onTopNChange(Number(e.target.value))}
                            className="sc-slider"
                        />
                    </label>
                )}
            </div>
            {isFocusView && centerLegend ? (
                <div className="sc-controls-legend">{centerLegend}</div>
            ) : null}
            {isFocusView && (
                <span className="sc-info">
                    {scShowAll
                        ? `${scLabelCount} categories · ${nonZeroSliceCount} with values · total ${formatNumber(pieTotal)}`
                        : `${pieSlices.length}/${Math.max(rawSorted.length, scTotalPoints)} shown`}
                    {scShowAll && rawSorted.length > MAX_PIE_SHOW_ALL_SLICES ? ' (render-capped)' : ''}
                    {scShowLabels && calloutLabelStats && (
                        <> · {calloutLabelStats.shown}/{calloutLabelStats.total} labels on chart</>
                    )}
                </span>
            )}
        </div>
    );
}

// ── Power BI-like Radar Chart Helpers & Custom Components ───────────────────

const buildRadarProcessedData = (rawData, showAll = true) => {
    if (!Array.isArray(rawData) || rawData.length === 0) return [];
    const sorted = [...rawData].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    if (showAll) {
        return sorted;
    } else {
        const top = sorted.slice(0, 10);
        const othersVal = sorted.slice(10).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
        return othersVal > 0 ? [...top, { name: 'Others', value: othersVal, __others: true }] : top;
    }
};

const computeRadarTicksVisibility = (radarData, hoveredName, selectedFilters) => {
    const visibleIndices = new Set();
    if (!Array.isArray(radarData) || radarData.length === 0) return visibleIndices;

    const N = radarData.length;
    const cx = 150;
    const cy = 150;
    const radius = 110;
    const RADIAN = Math.PI / 180;

    const items = radarData.map((d, index) => {
        const angleDeg = -90 + (index * 360) / N;
        const angleRad = angleDeg * RADIAN;
        const tx = cx + radius * Math.cos(angleRad);
        const ty = cy + radius * Math.sin(angleRad);

        // Estimate label size
        const name = d.name || '';
        const len = name.length > 14 ? 14 : name.length;
        const w = len * 6 + 6;
        const h = 14;

        // Bounding box estimation based on quadrants
        let x1, x2, y1, y2;
        const cosVal = Math.cos(angleRad);
        const sinVal = Math.sin(angleRad);

        if (Math.abs(cosVal) >= Math.abs(sinVal)) {
            // Left or Right
            if (cosVal >= 0) {
                x1 = tx;
                x2 = tx + w;
            } else {
                x2 = tx;
                x1 = tx - w;
            }
            y1 = ty - h / 2;
            y2 = ty + h / 2;
        } else {
            // Top or Bottom
            x1 = tx - w / 2;
            x2 = tx + w / 2;
            if (sinVal >= 0) {
                y1 = ty;
                y2 = ty + h;
            } else {
                y2 = ty;
                y1 = ty - h;
            }
        }

        return {
            index,
            name,
            value: Number(d.value) || 0,
            bbox: { x1, y1, x2, y2 }
        };
    });

    const priorityOrder = [...items].sort((a, b) => {
        const aSelected = selectedFilters.some((v) => String(v) === String(a.name));
        const bSelected = selectedFilters.some((v) => String(v) === String(b.name));
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;

        const aHovered = hoveredName === a.name;
        const bHovered = hoveredName === b.name;
        if (aHovered && !bHovered) return -1;
        if (!aHovered && bHovered) return 1;

        return b.value - a.value;
    });

    const placed = [];
    const bboxesOverlap = (a, b) =>
        a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

    priorityOrder.forEach((item) => {
        const isSelected = selectedFilters.some((v) => String(v) === String(item.name));
        const isHovered = hoveredName === item.name;

        if (isSelected || isHovered) {
            visibleIndices.add(item.index);
            placed.push(item.bbox);
        } else {
            const overlaps = placed.some((p) => bboxesOverlap(item.bbox, p));
            if (!overlaps) {
                visibleIndices.add(item.index);
                placed.push(item.bbox);
            }
        }
    });

    return visibleIndices;
};

const RadarAngleTick = (props) => {
    const { x, y, cx, cy, angle, payload, index, visibleIndices, hoveredName, selectedFilters, axisTickColor } = props;
    const name = payload?.value;
    if (name == null) return null;

    const isSelected = selectedFilters.some((v) => String(v) === String(name));
    const isHovered = hoveredName === name;

    const isVisible = isSelected || isHovered || visibleIndices.has(index);
    if (!isVisible) return null;

    const fill = isSelected || isHovered ? '#ffffff' : axisTickColor || 'rgba(255, 255, 255, 0.6)';
    const fontWeight = isSelected || isHovered ? 750 : 400;
    const fontSize = isSelected || isHovered ? 11 : 9;

    const displayName = (isSelected || isHovered)
        ? name
        : (name.length > 14 ? name.slice(0, 12) + '…' : name);

    return (
        <text
            x={x}
            y={y}
            textAnchor={props.textAnchor}
            dominantBaseline={props.dominantBaseline}
            fill={fill}
            fontSize={fontSize}
            fontWeight={fontWeight}
            className={`radar-axis-tick${isSelected ? ' radar-axis-tick--selected' : ''}${isHovered ? ' radar-axis-tick--hovered' : ''}`}
            style={{ transition: 'all 0.15s ease' }}
        >
            {displayName}
            <title>{name}</title>
        </text>
    );
};

const CustomRadarDot = (props) => {
    const { cx, cy, payload, value, hoveredName, selectedFilters, mainColor, formatNumber } = props;
    if (cx == null || cy == null || !payload) return null;

    const name = payload.name;
    const isSelected = selectedFilters.some((v) => String(v) === String(name));
    const isHovered = hoveredName === name;

    const isAnyActive = selectedFilters.length > 0 || hoveredName !== null;
    const isActive = isSelected || isHovered;

    const r = isActive ? 6 : (isAnyActive ? 2 : 4);
    const opacity = isActive ? 1.0 : (isAnyActive ? 0.25 : 0.85);
    const fill = isActive ? '#ffffff' : mainColor;
    const stroke = isActive ? mainColor : '#ffffff';
    const strokeWidth = isActive ? 2.5 : 1;

    return (
        <g style={{ pointerEvents: 'none' }}>
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                className="radar-active-dot"
                style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
        </g>
    );
};

const formatCustomMeasureValue = (value, measure) => {
    if (value === null || value === undefined) return 'BLANK';
    const val = parseFloat(value);
    if (isNaN(val)) return String(value);

    const formatType = measure.format || 'General';
    const decimalPlaces = measure.decimal_places !== undefined ? measure.decimal_places : 2;
    const currencySymbol = measure.currency || '₹';
    const displayUnits = measure.display_units || 'None';

    // Apply scale divisor
    let scaledVal = val;
    let suffix = '';
    if (formatType !== 'Percentage' && formatType !== 'Growth Rate') {
        if (displayUnits === 'Thousands') {
            scaledVal = val / 1000.0;
            suffix = 'K';
        } else if (displayUnits === 'Millions') {
            scaledVal = val / 1000000.0;
            suffix = 'M';
        } else if (displayUnits === 'Billions') {
            scaledVal = val / 1000000000.0;
            suffix = 'B';
        }
    }

    // Format decimals
    let formattedNum = scaledVal.toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
    });

    if (formatType === 'Percentage') {
        return `${formattedNum}%`;
    } else if (formatType === 'Growth Rate') {
        const sign = val > 0 ? '+' : '';
        return `${sign}${formattedNum}%`;
    } else if (formatType === 'Currency') {
        return `${currencySymbol}${formattedNum}${suffix}`;
    } else if (formatType === 'Whole Number') {
        return Math.round(val).toLocaleString();
    }

    if (measure.currency) {
        return `${measure.currency}${formattedNum}${suffix}`;
    }
    return `${formattedNum}${suffix}`;
};

const resolveMeasureMetadata = (fieldName, measuresList, forceFallback = false) => {
    if (!fieldName) return null;
    const cleanName = String(fieldName).replace(/^\[|\]$/g, '').trim();
    const custom = (measuresList || []).find(m => m.name === cleanName || m.display_name === cleanName);
    if (custom) {
        return {
            name: custom.name,
            display_name: custom.display_name || custom.name,
            displayName: custom.display_name || custom.name,
            description: custom.description || `Custom semantic measure for ${custom.name}`,
            format: custom.format || 'General',
            decimal_places: custom.decimal_places !== undefined ? custom.decimal_places : 2,
            currency: custom.currency || '₹ ',
            display_units: custom.display_units || 'None',
            isCustom: true
        };
    }

    const lowerName = cleanName.toLowerCase();
    if (lowerName.includes('revenue')) {
        return {
            name: cleanName,
            display_name: 'Revenue',
            displayName: 'Revenue',
            description: 'Total Revenue Generated',
            format: 'Currency',
            currency: '₹ ',
            display_units: 'Millions',
            decimal_places: 1,
            isCustom: false
        };
    }
    if (lowerName.includes('profit')) {
        return {
            name: cleanName,
            display_name: 'Profit',
            displayName: 'Profit',
            description: 'Net Profit Margin and Income',
            format: 'Currency',
            currency: '₹ ',
            display_units: 'Millions',
            decimal_places: 1,
            isCustom: false
        };
    }
    if (lowerName.includes('sales')) {
        return {
            name: cleanName,
            display_name: 'Sales',
            displayName: 'Sales',
            description: 'Total Volume of Sales Transactions',
            format: 'Whole Number',
            decimal_places: 0,
            isCustom: false
        };
    }
    if (lowerName.includes('margin')) {
        return {
            name: cleanName,
            display_name: 'Margin',
            displayName: 'Margin',
            description: 'Profit Margin Percentage',
            format: 'Percentage',
            decimal_places: 1,
            isCustom: false
        };
    }
    if (lowerName.includes('cost')) {
        return {
            name: cleanName,
            display_name: 'Cost',
            displayName: 'Cost',
            description: 'Total Operational Cost incurred',
            format: 'Currency',
            currency: '₹ ',
            display_units: 'Millions',
            decimal_places: 1,
            isCustom: false
        };
    }

    if (forceFallback) {
        return {
            name: cleanName,
            display_name: cleanName,
            displayName: cleanName,
            description: `Sum of ${cleanName}`,
            format: 'General',
            decimal_places: 2,
            isCustom: false
        };
    }
    return null;
};

const DynamicChart = ({ fileId, graphDefinition: propGraphDefinition, selection = null, onClick, onUpdate, onSelectVisual, onApplyCrossFilter, onClearCrossFilter, isExporting = false, hideInternalStats = false, hideChartTitle = false, isDragging = false, showZoomControls = false, zoomToolbarContainer = null, reportTheme = 'theme_default', reportNoFill = false, isViewOnly = false, reportCrossFilterRevision = '', legendHeaderSlotId = null, measures = [] }) => {
    const { isDark: globalIsDark } = useTheme();
    const isFocusView = Boolean(zoomToolbarContainer);
    const isCompactLayout = Boolean(zoomToolbarContainer || hideChartTitle);
    const isDashboardCanvas = isCompactLayout && !isFocusView;
    const suppressCanvasLegendRail = isDashboardCanvas;
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

    // ── Smart chart controls (Power BI-like) — persisted on visual options ──
    const chartOptions = graphDefinition.options || {};
    const scShowLabels = chartOptions.pieShowLabels !== false;
    const scShowAll = chartOptions.pieShowAll !== false;
    const scGroupOthers = chartOptions.pieGroupOthers !== false;
    const scTopN = typeof chartOptions.pieTopN === 'number' ? chartOptions.pieTopN : 10;
    const scLabelSide = chartOptions.pieLabelSide || (scShowAll ? 'all' : 'right');

    const patchPieOptions = useCallback((patch) => {
        if (!onUpdate) return;
        onUpdate({
            options: {
                ...(graphDefinition.options || {}),
                ...patch,
            },
        });
    }, [onUpdate, graphDefinition.options]);

    const setScShowLabels = useCallback((value) => {
        patchPieOptions({ pieShowLabels: value });
    }, [patchPieOptions]);

    const setScGroupOthers = useCallback((value) => {
        patchPieOptions({ pieGroupOthers: value });
    }, [patchPieOptions]);

    const setScTopN = useCallback((value) => {
        patchPieOptions({ pieTopN: value });
    }, [patchPieOptions]);

    const setScLabelSide = useCallback((value) => {
        patchPieOptions({ pieLabelSide: value });
    }, [patchPieOptions]);
    const [scLegendSearch, setScLegendSearch] = useState('');
    const [scLegendPanelCollapsed, setScLegendPanelCollapsed] = useState(true);
    const toggleLegendPanelCollapsed = useCallback((e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        setScLegendPanelCollapsed((collapsed) => !collapsed);
    }, []);
    const [scHiddenSlices, setScHiddenSlices] = useState(new Set());
    /** Pie/donut: set only while pointer is over a slice (never on click). */
    const [pieHoverSegment, setPieHoverSegment] = useState(null);
    const [radarHoveredName, setRadarHoveredName] = useState(null);
    const [scTotalPoints, setScTotalPoints] = useState(0);
    const [chartNotice, setChartNotice] = useState('');
    const scLegendRef = useRef(null);
    const lastRollbackKeyRef = useRef('');
    const chartNoticeTimerRef = useRef(null);

    // --- Centralized Global Filter Hook & Memoized Filtered Dataset ---
    const {
        filters,
        highlightedItem,
        setHighlightedItem,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
    } = useGlobalFilters();


    const crossFilterMap = useMemo(() => sanitizeFilterMap(filters), [filters]);
    const isCrossFilterLinked = graphDefinition.options?.crossFilterLinked !== false;

    const [visualFilterRules, setVisualFilterRules] = useState(
        () => normalizeFilterRules(graphDefinition.options?.filters)
    );

    useEffect(() => {
        const fromProp = normalizeFilterRules(graphDefinition.options?.filters);
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
    const drillHistory = Array.isArray(graphDefinition.options?.drillHistory)
        ? graphDefinition.options.drillHistory
        : [];
    const isDrillingActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;

    const effectiveCrossFilterMap = useMemo(
        () => (isCrossFilterLinked ? crossFilterMap : {}),
        [isCrossFilterLinked, crossFilterMap]
    );

    const chartFilterMap = useMemo(() => {
        const visualMap = filterRulesToFilterMap(visualFilterRules);
        if (!filterMapHasValues(effectiveCrossFilterMap)) return visualMap;
        if (!filterMapHasValues(visualMap)) return effectiveCrossFilterMap;
        return { ...visualMap, ...effectiveCrossFilterMap };
    }, [effectiveCrossFilterMap, visualFilterRules]);

    const crossFiltersFetchKey = useMemo(
        () => (isCrossFilterLinked && reportCrossFilterEnabled && filterMapHasValues(effectiveCrossFilterMap)
            ? JSON.stringify(effectiveCrossFilterMap)
            : ''),
        [isCrossFilterLinked, reportCrossFilterEnabled, effectiveCrossFilterMap]
    );
    const prevCrossFiltersFetchKeyRef = useRef(crossFiltersFetchKey);

    const useServerCrossFilter = isCrossFilterLinked && reportCrossFilterEnabled && filterMapHasValues(effectiveCrossFilterMap);

    // Schema column for slicer / cross-filter rules — persisted x_axis, not drill display label
    const categoryFilterField = useMemo(() => {
        const fromX = propGraphDefinition?.x_axis;
        if (fromX && String(fromX).trim()) return String(fromX).trim();
        if (effectiveDimFields.length === 1) return effectiveDimFields[0];
        return graphDefinition.x_axis || effectiveDimFields[0] || '';
    }, [propGraphDefinition?.x_axis, effectiveDimFields, graphDefinition.x_axis]);

    const rawChartRows = useMemo(() => {
        const fromState = extractChartRows(data);
        const fullSource = unfilteredBaselineRef.current || baselineChartDataRef.current;
        const fullRows = extractChartRows(fullSource);
        const chartFiltered = filterMapHasValues(chartFilterMap);

        if (useServerCrossFilter) {
            const applyReportFilter = (rows) => {
                if (!filterMapHasValues(effectiveCrossFilterMap) || !rows?.length) return rows;
                const filtered = filterData(
                    rows,
                    effectiveCrossFilterMap,
                    categoryFilterField,
                    graphDefinition.y_axis
                );
                return filtered.length > 0 ? filtered : rows;
            };
            if (fullRows.length > 0) {
                const fromBaseline = applyReportFilter(fullRows);
                if (fromBaseline.length > 0) return fromBaseline;
            }
            if (fromState.length > 0) {
                const fromFiltered = applyReportFilter(fromState);
                return fromFiltered.length > 0 ? fromFiltered : fromState;
            }
            return fromState;
        }
        if (isDrillingActive) {
            if (fromState.length > 0) return fromState;
            if (fullRows.length > 0) return fullRows;
            return fromState;
        }
        if (chartFiltered && fullRows.length > 0) return fullRows;
        if (!chartFiltered) {
            if (fromState.length >= fullRows.length && fromState.length > 0) return fromState;
            if (fullRows.length > 0) return fullRows;
        }
        return fromState.length > 0 ? fromState : fullRows;
    }, [
        data,
        useServerCrossFilter,
        effectiveCrossFilterMap,
        chartFilterMap,
        crossFilterRefreshing,
        isDrillingActive,
        categoryFilterField,
        graphDefinition.y_axis,
        drillLevelIndex,
        drillPath.length,
        expandModeActive,
        dataFetchNonce,
        reportCrossFilterRevision,
    ]);

    const processedChartData = useMemo(() => {
        let rows = extractChartRows(rawChartRows);
        if (isCrossFilterLinked && reportCrossFilterEnabled && filterMapHasValues(effectiveCrossFilterMap)) {
            const baseline = extractChartRows(
                unfilteredBaselineRef.current || baselineChartDataRef.current
            );
            const source = baseline.length >= rows.length && baseline.length > 0 ? baseline : rows;
            const crossFiltered = filterData(
                source,
                effectiveCrossFilterMap,
                categoryFilterField,
                graphDefinition.y_axis
            );
            if (crossFiltered.length > 0) rows = crossFiltered;
        } else if (!useServerCrossFilter && filterMapHasValues(chartFilterMap)) {
            rows = filterData(
                rows,
                chartFilterMap,
                categoryFilterField,
                graphDefinition.y_axis
            );
        }
        return coerceChartRows(rows);
    }, [
        rawChartRows,
        chartFilterMap,
        effectiveCrossFilterMap,
        isCrossFilterLinked,
        reportCrossFilterEnabled,
        useServerCrossFilter,
        categoryFilterField,
        graphDefinition.y_axis,
        reportCrossFilterRevision,
    ]);

    const renderedChartData = useMemo(() => {
        let chartData = Array.isArray(processedChartData) ? [...processedChartData] : [];
        const opts = graphDefinition.options || {};

        // Page/report filters
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

        const isBarFamilyType = ['bar', 'column', 'stackedColumn', 'histogram'].includes(graphDefinition.graph_type);
        if (isBarFamilyType) {
            const maxCategories = isFocusView ? 100 : 15;
            if (chartData.length > maxCategories) {
                chartData = chartData.slice(0, maxCategories);
            }
        }
        return chartData;
    }, [processedChartData, graphDefinition.graph_type, graphDefinition.options, graphDefinition.x_axis, graphDefinition.y_axis, isFocusView]);

    useEffect(() => {
        setPieHoverSegment(null);
    }, [crossFiltersFetchKey, graphDefinition.id, processedChartData, crossFilterRefreshing]);

    const isPieDonutChart = graphDefinition.graph_type === 'pie' || graphDefinition.graph_type === 'donut';

    const pieChartRowsForControls = useMemo(() => {
        if (!isPieDonutChart) return [];
        let rows = Array.isArray(processedChartData) ? [...processedChartData] : [];
        const opts = graphDefinition.options || {};
        const reportPageFilters = [
            ...(Array.isArray(opts.reportFilters) ? opts.reportFilters : []),
            ...(Array.isArray(opts.pageFilters) ? opts.pageFilters : []),
        ].filter((f) => f && f.field && f.operator && f.operator !== 'all');
        if (reportPageFilters.length > 0) {
            rows = rows.filter((row) => reportPageFilters.every((f) => {
                const candidate =
                    row?.[f.field]
                    ?? (f.field === graphDefinition.x_axis ? row?.name : undefined)
                    ?? (f.field === graphDefinition.y_axis || f.field === 'value' ? row?.value : undefined);
                if (candidate == null) return false;
                const cStr = String(candidate).toLowerCase();
                const vStr = String(f.value ?? '').toLowerCase();
                if (f.operator === 'equals') return cStr === vStr;
                if (f.operator === 'contains') return cStr.includes(vStr);
                if (f.operator === 'gt') return Number(candidate) > Number(f.value);
                if (f.operator === 'lt') return Number(candidate) < Number(f.value);
                return true;
            }));
        }
        if (opts.sort === 'asc') rows.sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));
        if (opts.sort === 'desc') rows.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
        return rows;
    }, [
        isPieDonutChart,
        processedChartData,
        graphDefinition.options,
        graphDefinition.x_axis,
        graphDefinition.y_axis,
    ]);

    const pieDonutSliceModel = useMemo(() => {
        if (!isPieDonutChart || pieChartRowsForControls.length === 0) return null;
        return buildPieDonutProcessedData(pieChartRowsForControls, {
            scShowAll,
            scTopN,
            scGroupOthers,
            scHiddenSlices,
        });
    }, [
        isPieDonutChart,
        pieChartRowsForControls,
        scShowAll,
        scTopN,
        scGroupOthers,
        scHiddenSlices,
    ]);

    const handlePieShowAllChange = useCallback((next) => {
        patchPieOptions({
            pieShowAll: next,
            ...(next ? { pieGroupOthers: false, pieLabelSide: 'all' } : { pieLabelSide: 'right' }),
        });
    }, [patchPieOptions]);

    const pieCalloutLabelStats = useMemo(() => {
        if (!isPieDonutChart || !pieDonutSliceModel || !scShowLabels) return null;
        const { pieSlices, pieTotal, rawSorted } = pieDonutSliceModel;
        const sliceCount = pieSlices.length;
        const chartTight = dimensions.height > 0 && (dimensions.height < 300 || dimensions.width < 340);
        const chartCompact = dimensions.height > 0 && (dimensions.height < 420 || dimensions.width < 500);
        const dense = sliceCount > 18;
        const labelMargin = dense
            ? (chartTight ? 36 : chartCompact ? 42 : 46)
            : sliceCount > 8
                ? (chartTight ? 30 : chartCompact ? 34 : 38)
                : (chartTight ? 22 : chartCompact ? 26 : 32);
        const compactLabelMode = sliceCount > 10;
        const labelFont = Math.max(
            7,
            computeResponsiveFontSize(13, dimensions.width, dimensions.height, { min: 9, max: 15 })
            - (compactLabelMode ? 1 : 0)
            - (sliceCount > 20 ? 1 : 0)
        );
        const hasLegendPanel = false;
        const maxOutside = computeMaxPieOutsideLabels({
            sliceCount,
            labelFont,
            labelMargin,
            plotHeight: dimensions.height || 280,
            plotWidth: dimensions.width || 360,
            hasLegendPanel,
        });
        const eligible = computePieOutsideLabelEligible(pieSlices, pieTotal, maxOutside, true);
        return { shown: eligible.size, total: sliceCount };
    }, [
        isPieDonutChart,
        pieDonutSliceModel,
        scShowLabels,
        dimensions.height,
        dimensions.width,
    ]);

    const hasActiveChartFilter = filterMapHasValues(chartFilterMap);
    const hasNoChartRows = !Array.isArray(processedChartData) || processedChartData.length === 0;
    const isCrossFilterActive =
        reportCrossFilterEnabled || hasActiveChartFilter || filterMapHasValues(effectiveCrossFilterMap);

    const showChartNotice = useCallback((message) => {
        setChartNotice(message);
        if (chartNoticeTimerRef.current) window.clearTimeout(chartNoticeTimerRef.current);
        chartNoticeTimerRef.current = window.setTimeout(() => setChartNotice(''), 2200);
    }, []);

    useEffect(() => {
        return () => {
            if (chartNoticeTimerRef.current) window.clearTimeout(chartNoticeTimerRef.current);
        };
    }, []);

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

    const categoryColorMap = useMemo(() => {
        const ordered = [];
        const pushName = (name) => {
            const s = String(name ?? '').trim();
            if (s) ordered.push(s);
        };
        if (Array.isArray(processedChartData)) {
            processedChartData.forEach((d) => pushName(d?.name));
        }
        rawLegendValues.forEach(pushName);
        if (pieDonutSliceModel?.pieSlices) {
            pieDonutSliceModel.pieSlices.forEach((d) => pushName(d?.name));
        }
        return buildCategoryColorMap(ordered, reportPalette);
    }, [processedChartData, rawLegendValues, pieDonutSliceModel, reportPalette]);

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
        const plotWidth = resolveBarPlotWidth(dimensions.width, { isDashboardCanvas, isFocusView });
        return computeXAxisLayout(processedChartData, {
            expandModeActive,
            compactMode: hierarchyActive || isDashboardCanvas,
            chartWidth: plotWidth,
            focusView: isFocusView,
            dashboardCard: isDashboardCanvas,
            graphType: graphDefinition.graph_type,
        });
    }, [
        graphDefinition.graph_type,
        processedChartData,
        dimensions.width,
        expandModeActive,
        drillLevelIndex,
        drillPath.length,
        isDashboardCanvas,
        isFocusView,
    ]);

    const isDrillDownApplied = drillLevelIndex > 0 || drillPath.length > 0;
    const showDrillFilter = isDrillDownApplied
        && graphDefinition.options?.showLegend !== false
        && rawLegendValues.length > 0;

    const legendFilterDimension = categoryFilterField || 'series';

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

    function updateDrillState(updates) {
        if (onUpdate) {
            onUpdate({
                options: {
                    ...(graphDefinition.options || {}),
                    ...updates
                }
            });
        }
    }

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

    useEffect(() => {
        if (loading || crossFilterRefreshing) return;
        if (!hasNoChartRows) return;

        const hasRecoverableState = isDrillingActive || hasActiveChartFilter;
        if (!hasRecoverableState) return;

        // Guard: data must have actually finished loading (not null = still initialising).
        // Also require a saved baseline to restore from — otherwise we have nothing to show.
        if (data === null) return;
        const baselineRows = extractChartRows(unfilteredBaselineRef.current || baselineChartDataRef.current);
        if (baselineRows.length === 0) return;

        const rollbackKey = JSON.stringify({
            v: graphDefinition.id,
            level: drillLevelIndex,
            path: drillPath,
            expand: expandModeActive,
            filters: visualFilterRules,
        });
        if (lastRollbackKeyRef.current === rollbackKey) return;
        lastRollbackKeyRef.current = rollbackKey;

        showChartNotice('No matching data. Reverted to previous state.');

        if (isDrillingActive) {
            // Immediately paint baseline so user never sees a blank chart.
            instantRestoreUnfilteredChart();

            if (drillHistory.length > 0) {
                const prevState = drillHistory[drillHistory.length - 1] || {};
                updateDrillState({
                    drillHistory: drillHistory.slice(0, -1),
                    drillPath: Array.isArray(prevState.drillPath) ? prevState.drillPath : [],
                    drillLevelIndex: Number.isFinite(prevState.drillLevelIndex) ? prevState.drillLevelIndex : 0,
                    expandModeActive: Boolean(prevState.expandModeActive),
                    drillModeActive: Boolean(prevState.drillModeActive),
                });
                return;
            }

            updateDrillState({
                drillLevelIndex: 0,
                drillPath: [],
                drillHistory: [],
                expandModeActive: false,
            });
            return;
        }

        if (hasActiveChartFilter) {
            resetChartToUnfiltered();
            setVisualFilterRules([]);
            if (onUpdate) {
                onUpdate({
                    options: {
                        ...(graphDefinition.options || {}),
                        filters: [],
                    },
                    cached_data: null,
                });
            }
        }
    }, [
        loading,
        crossFilterRefreshing,
        hasNoChartRows,
        data,
        isDrillingActive,
        hasActiveChartFilter,
        graphDefinition.id,
        graphDefinition.options,
        drillLevelIndex,
        drillPath,
        expandModeActive,
        visualFilterRules,
        drillHistory,
        resetChartToUnfiltered,
        onUpdate,
        showChartNotice,
        instantRestoreUnfilteredChart,
    ]);

    const syncCrossFilterFromRules = useCallback((nextFilters) => {
        if (!isCrossFilterLinked) return;
        const appliedRules = normalizeFilterRules(nextFilters).filter(
            (f) => f?.field && f.operator === 'equals' && f.value != null && String(f.value).trim() !== ''
        );
        if (appliedRules.length > 0) {
            onApplyCrossFilter?.(graphDefinition.id, appliedRules);
            return;
        }
        if (reportCrossFilterEnabled || crossFilterSourceVisualId === graphDefinition.id) {
            onClearCrossFilter?.();
        }
    }, [
        isCrossFilterLinked,
        onApplyCrossFilter,
        onClearCrossFilter,
        graphDefinition.id,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
    ]);

    /** Per-visual slicer — returns updated filter rules array */
    const applyVisualDimensionFilter = useCallback((dimension, next, filterMode = 'toggle') => {
        if (!dimension) return [];
        const optsNow = graphOptionsRef.current || graphDefinition.options || {};
        const current = Array.isArray(optsNow.filters) ? optsNow.filters : [];
        let nextFilters = current;
        if (next === '__all__') {
            nextFilters = current.filter((f) => f?.field !== dimension);
        } else if (filterMode === 'toggle') {
            const exists = current.some(
                (f) => f?.field === dimension && String(f.value) === String(next)
            );
            nextFilters = exists
                ? current.filter((f) => !(f?.field === dimension && String(f.value) === String(next)))
                : [
                    ...current,
                    { field: dimension, operator: 'equals', value: String(next) },
                ];
        } else {
            nextFilters = [
                ...current.filter((f) => f?.field !== dimension),
                { field: dimension, operator: 'equals', value: String(next) },
            ];
        }
        const dimensionCleared = !nextFilters.some((f) => f?.field === dimension);
        const allFiltersCleared = nextFilters.length === 0;
        const nextOptions = {
            ...optsNow,
            filters: nextFilters,
        };
        graphOptionsRef.current = nextOptions;
        setVisualFilterRules(nextFilters);
        if (onUpdate) {
            onUpdate({
                options: nextOptions,
                ...((dimensionCleared || allFiltersCleared) ? { cached_data: null } : {}),
                ...(next && next !== '__all__' ? { openFiltersPane: true } : {}),
            });
        }
        syncCrossFilterFromRules(nextFilters);
        if (dimensionCleared || allFiltersCleared) {
            skipFilterPropSyncRef.current = true;
            setVisualFilterRules(nextFilters);
            if (!instantRestoreUnfilteredChart()) scheduleSilentRefetchIfNeeded();
        }
        return nextFilters;
    }, [
        onUpdate,
        graphDefinition.options,
        syncCrossFilterFromRules,
        instantRestoreUnfilteredChart,
        scheduleSilentRefetchIfNeeded,
    ]);

    const handleLegendFilterClear = useCallback((dimension) => {
        const dim = dimension || legendFilterDimension;
        const optsNow = graphOptionsRef.current || graphDefinition.options || {};
        const current = Array.isArray(optsNow.filters) ? optsNow.filters : [];
        const drop = new Set([dim, ...effectiveDimFields].filter(Boolean));
        const nextFilters = current.filter((f) => !drop.has(f?.field));
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
        syncCrossFilterFromRules(nextFilters);
        if (rowCount <= 1) scheduleSilentRefetchIfNeeded();
    }, [
        legendFilterDimension,
        effectiveDimFields,
        onUpdate,
        graphDefinition.options,
        syncCrossFilterFromRules,
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

    const categoryMarkIsDimmed = useCallback(
        (name) =>
            visualCategoryFilters.length > 0
            && !visualCategoryFilters.some((v) => String(v) === String(name)),
        [visualCategoryFilters]
    );

    const categoryMarkIsSelected = useCallback(
        (name) => visualCategoryFilters.some((v) => String(v) === String(name)),
        [visualCategoryFilters]
    );

    /** Show chip legend row when multiple categories exist, or when filtered so ✕ Clear is available. */
    const showLegendFilterRow = useMemo(() => {
        if (rawLegendValues.length === 0) return false;
        if (rawLegendValues.length > 1) return true;
        return hasVisualCategoryFilter || hasActiveChartFilter;
    }, [rawLegendValues.length, hasVisualCategoryFilter, hasActiveChartFilter]);

    const [legendHeaderHost, setLegendHeaderHost] = useState(null);

    useLayoutEffect(() => {
        if (!legendHeaderSlotId) {
            setLegendHeaderHost(null);
            return;
        }
        setLegendHeaderHost(document.getElementById(legendHeaderSlotId));
    }, [legendHeaderSlotId, graphDefinition.id, rawLegendValues.length, showLegendFilterRow]);

    const legendInHeader = Boolean(legendHeaderHost);

    /** Compact color-dot rail for all category legends (labels on hover). */
    const chartLegendVariant = 'compact';

    const renderInteractiveLegend = useCallback(({ payload } = {}) => {
        const fromPayload = (payload || [])
            .map((entry) => entry?.value)
            .filter((v) => v != null && String(v).trim() !== '');
        const values = rawLegendValues.length > 0 ? rawLegendValues : fromPayload;
        if (!values.length || !legendFilterDimension) return null;
        return (
            <LegendComponent
                dimension={legendFilterDimension}
                values={values}
                maxItems={values.length > 8 ? 8 : 16}
                variant={chartLegendVariant}
                layout="horizontal"
                filterScope="visual"
                visualFilters={visualFilterRules}
                onVisualFilterChange={applyVisualDimensionFilter}
                onFilterClear={handleLegendFilterClear}
                colorPalette={reportPalette}
                categoryColorMap={categoryColorMap}
            />
        );
    }, [
        rawLegendValues,
        legendFilterDimension,
        visualFilterRules,
        applyVisualDimensionFilter,
        handleLegendFilterClear,
        reportPalette,
        categoryColorMap,
    ]);

    const pieSliceDataRef = useRef([]);

    const hoverTimeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

    const clearPieDonutHover = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setPieHoverSegment(null);
    }, []);

    const handlePiePointerExit = useCallback((e) => {
        const related = e.relatedTarget;
        if (related && e.currentTarget.contains(related)) return;
        clearPieDonutHover();
    }, [clearPieDonutHover]);

    const handlePieDonutSliceHover = useCallback((data, index) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (crossFilterRefreshing) {
            setPieHoverSegment(null);
            return;
        }
        let entry = null;
        if (typeof index === 'number' && pieSliceDataRef.current[index]) {
            entry = pieSliceDataRef.current[index];
        } else if (data?.payload && data.payload.name != null) {
            entry = data.payload;
        } else if (data?.name != null) {
            entry = data;
        }
        if (!entry) {
            setPieHoverSegment(null);
            return;
        }
        setPieHoverSegment(entry);
    }, [crossFilterRefreshing]);

    /**
     * Single path for legend chips, bar/column clicks, pie slices, scatter points, etc.
     * Always uses legendFilterDimension (x_axis) so filtering matches the legend row.
     */
    const applyCategoryClickFilter = useCallback((categoryValue, payload = null) => {
        if (categoryValue === undefined || categoryValue === null || String(categoryValue).trim() === '') return;
        if (String(categoryValue) === 'Others' || String(categoryValue) === 'Unknown') return;

        if (drillModeActive && effectiveDimFields.length > 1) {
            const canAdvanceLevel = drillLevelIndex < effectiveDimFields.length - 1;
            if (canAdvanceLevel) {
                const currentField = effectiveDimFields[Math.min(drillLevelIndex, effectiveDimFields.length - 1)];
                const nextPath = [
                    ...drillPath,
                    { field: currentField, value: String(categoryValue) },
                ];
                const historyEntry = {
                    drillPath,
                    drillLevelIndex,
                    expandModeActive,
                    drillModeActive,
                };
                updateDrillState({
                    drillHistory: [...drillHistory, historyEntry].slice(-30),
                    drillPath: nextPath,
                    drillLevelIndex: Math.min(drillLevelIndex + 1, effectiveDimFields.length - 1),
                    expandModeActive: true,
                    drillModeActive: true,
                });
                return;
            }
        }

        const filterDimension = legendFilterDimension;
        if (!filterDimension) return;

        if (onSelectVisual) onSelectVisual(graphDefinition.id);

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
        applyVisualDimensionFilter(filterDimension, categoryValue, 'toggle');

        if (isFiltered) {
            restoreUnfilteredChartData();
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
        drillModeActive,
        effectiveDimFields,
        drillLevelIndex,
        drillPath,
        drillHistory,
        updateDrillState,
        graphDefinition.id,
        graphDefinition.graph_type,
        graphDefinition.x_axis,
        graphDefinition.y_axis,
        legendFilterDimension,
        visualFilterRules,
        applyVisualDimensionFilter,
        onSelectVisual,
        restoreUnfilteredChartData,
        onClick,
        data,
        saveBaselineRows,
    ]);

    /** Pie/donut slice — delegates to shared category filter. */
    const handlePieDonutSliceClick = useCallback((sliceEntry) => {
        if (!sliceEntry || sliceEntry.__others) return;
        const name = sliceEntry.name ?? sliceEntry.payload?.name;
        if (name == null) return;
        clearPieDonutHover();
        applyCategoryClickFilter(name, {
            ...sliceEntry,
            name,
            value: sliceEntry._rawValue ?? sliceEntry.value,
        });
    }, [applyCategoryClickFilter, clearPieDonutHover]);

    /** Resolve bar/line/scatter click payloads (Recharts passes several shapes). */
    const resolveCategoryClickEntry = useCallback((data, index) => {
        if (!data) return null;
        const payload = data?.payload ?? data;
        if (payload && !payload.__others && payload.name != null) return payload;
        if (data?.name != null && !data.__others) return data;
        if (data?.activePayload?.length > 0) {
            const fromActive = data.activePayload[0]?.payload;
            if (fromActive && !fromActive.__others) return fromActive;
        }
        if (data?.activeLabel != null && String(data.activeLabel).trim() !== '') {
            const label = String(data.activeLabel);
            const rows = extractChartRows(processedChartData);
            const match = rows.find((r) => String(r?.name) === label);
            return match ?? { name: label, value: null };
        }
        const rows = extractChartRows(processedChartData);
        if (typeof index === 'number' && rows[index] && !rows[index].__others) return rows[index];
        return null;
    }, [processedChartData]);

    /** Bar, column, line, area, scatter — direct click on marks. */
    const handleRechartsCategoryClick = useCallback((data, index, e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        const entry = resolveCategoryClickEntry(data, index);
        if (!entry || entry.__others) return;
        const name = entry.name ?? data?.name;
        if (name === undefined || name === null) return;
        applyCategoryClickFilter(name, {
            ...entry,
            name,
            value: entry.value ?? data?.value,
        });
    }, [applyCategoryClickFilter, resolveCategoryClickEntry]);

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
        const name = entry?.name;

        const activeFilters = getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension);
        const isSelected = activeFilters.some((v) => String(v) === String(name));
        const isHovered = pieHoverSegment && String(pieHoverSegment.name) === String(name);

        let extraRadius = 0;
        if (isSelected) {
            extraRadius = 6;
        } else if (isHovered) {
            extraRadius = 3;
        }

        const outerRadius = (sectorProps.outerRadius || 0) + extraRadius;

        const fireSliceClick = (e) => {
            e?.stopPropagation?.();
            e?.preventDefault?.();
            if (entry) handlePieDonutSliceClick(entry);
        };
        const handleSliceEnter = () => {
            handlePieDonutSliceHover(sectorProps?.payload ?? sectorProps, index);
        };
        return (
            <Sector
                {...sectorProps}
                outerRadius={outerRadius}
                className="pie-donut-slice-sector recharts-pie-sector"
                cursor="pointer"
                onMouseEnter={handleSliceEnter}
                onMouseMove={handleSliceEnter}
                onMouseDown={fireSliceClick}
                onClick={fireSliceClick}
            />
        );
    }, [handlePieDonutSliceClick, handlePieDonutSliceHover, resolvePieSliceEntry, visualFilterRules, legendFilterDimension, pieHoverSegment]);

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
        if (isDashboardCanvas && scShowLabels) {
            setScLegendPanelCollapsed(true);
        }
    }, [isDashboardCanvas, scShowLabels, graphDefinition.id]);

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
    const prevReportCrossFilterRevisionRef = useRef(reportCrossFilterRevision);

    useEffect(() => {
        if (prevReportCrossFilterRevisionRef.current === reportCrossFilterRevision) return;
        const prevRevision = prevReportCrossFilterRevisionRef.current;
        prevReportCrossFilterRevisionRef.current = reportCrossFilterRevision;
        if (!isCrossFilterLinked) return;
        if (reportCrossFilterEnabled && filterMapHasValues(effectiveCrossFilterMap)) {
            setDataFetchNonce((n) => n + 1);
            return;
        }
        if (prevRevision && !reportCrossFilterEnabled) {
            setDataFetchNonce((n) => n + 1);
        }
    }, [reportCrossFilterRevision, reportCrossFilterEnabled, effectiveCrossFilterMap, isCrossFilterLinked]);

    const wasCrossFilterSourceRef = useRef(false);
    const prevReportCrossEnabledRef = useRef(reportCrossFilterEnabled);

    useEffect(() => {
        if (crossFilterSourceVisualId === graphDefinition.id) {
            wasCrossFilterSourceRef.current = true;
        }
    }, [crossFilterSourceVisualId, graphDefinition.id]);

    useEffect(() => {
        const wasEnabled = prevReportCrossEnabledRef.current;
        prevReportCrossEnabledRef.current = reportCrossFilterEnabled;
        if (!isCrossFilterLinked) return;
        if (!wasEnabled || reportCrossFilterEnabled) return;

        wasCrossFilterSourceRef.current = false;
        skipFilterPropSyncRef.current = true;
        setHighlightedItem(null);
        setVisualFilterRules([]);

        const { rowCount } = getUnfilteredSnapshot();
        const restored = instantRestoreUnfilteredChart();
        if (!restored || rowCount <= 1) {
            silentRefetchRef.current = true;
            forceUnfilteredFetchRef.current = true;
            setDataFetchNonce((n) => n + 1);
        }

        const optsNow = graphOptionsRef.current || graphDefinition.options || {};
        if (onUpdate && Array.isArray(optsNow.filters) && optsNow.filters.length > 0) {
            onUpdate({
                options: {
                    ...optsNow,
                    filters: [],
                },
            });
        }
    }, [
        reportCrossFilterEnabled,
        isCrossFilterLinked,
        graphDefinition.id,
        graphDefinition.options,
        setHighlightedItem,
        instantRestoreUnfilteredChart,
        getUnfilteredSnapshot,
        onUpdate,
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
        const hasQuickMeasureField = measureFieldsForApi.some((m) => m?.template_id);
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
        const activeFiltersForFetch = useServerCrossFilter ? effectiveCrossFilterMap : {};
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
        const isDrillSoftRefresh = hasPriorChartData && isDrilling;
        const isSoftRefresh = isCrossFilterRefresh || isFieldWellSoftRefresh || isDrillSoftRefresh;
        const crossFilterJustCleared = Boolean(prevCrossFiltersFetchKeyRef.current) && !crossFiltersFetchKey;
        prevCrossFiltersFetchKeyRef.current = crossFiltersFetchKey;
        const forceUnfilteredFetch = forceUnfilteredFetchRef.current;
        if (forceUnfilteredFetch) forceUnfilteredFetchRef.current = false;
        const isSilentRefetch = silentRefetchRef.current;
        if (isSilentRefetch) silentRefetchRef.current = false;
        const { rowCount: baselineRowCount } = getUnfilteredSnapshot();

        // Clear / unlink: restore from full baseline when possible; otherwise refetch unfiltered data.
        if (crossFilterJustCleared || forceUnfilteredFetch) {
            if (baselineRowCount > 1) {
                instantRestoreUnfilteredChart();
                return () => abortController.abort();
            }
            forceUnfilteredFetchRef.current = true;
        }

        if (
            cached_data
            && !isDrilling
            && !hasSlicerFilters
            && !hasQuickMeasureField
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
                    const response = await fetch(`/analytics/api/files/${fileId}/graph-data`, {
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
                        if (!isSoftRefresh) setData([]);
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
                        if (!isSoftRefresh) setData([]);
                        setError(null);
                    }
                } catch (err) {
                    if (err?.name === 'AbortError') return;
                    console.error('Custom visual data fetch failed:', err);
                    if (!isSoftRefresh) setData([]);
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
                setError(null);

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

                const response = await fetch(`/analytics/api/files/${fileId}/graph-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: abortController.signal,
                    body: JSON.stringify(payload)
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.warn('Graph data request failed:', result?.detail || result?.message || response.status);
                    if (!isSoftRefresh) setData([]);
                    setError(result?.detail || result?.message || `Error ${response.status}: Failed to load visual data`);
                    return;
                }

                if (!result) {
                    if (!isSoftRefresh) setData([]);
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
                    if (!isSoftRefresh) setData([]);
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
                } else if (!isSoftRefresh) {
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
                if (!isSoftRefresh) setData([]);
                setError(err?.message || 'Network error loading visual data');
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
        reportCrossFilterRevision,
        dataFetchNonce,
        useServerCrossFilter,
        saveBaselineRows,
        isDrillingActive,
        instantRestoreUnfilteredChart,
        getUnfilteredSnapshot,
    ]);

    const handleClick = useCallback((state, index, e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        const entry = resolveCategoryClickEntry(state, index);
        if (!entry || entry.__others) return;
        const rawVal = entry.name;
        if (rawVal === null || rawVal === undefined) return;
        applyCategoryClickFilter(rawVal, entry);
    }, [applyCategoryClickFilter, resolveCategoryClickEntry]);

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
        const animation = !isExporting && !window.isExportingReportPdf && !isDragging && !hasActiveChartFilter && !crossFilterRefreshing;
        const opts = graphDefinition.options || {};
        const isKpiCard = graphDefinition.graph_type === 'kpiCard';
        const matchedMeasure = resolveMeasureMetadata(graphDefinition.y_axis, measures, isKpiCard);
        const activeTheme = reportTheme || opts.reportTheme || 'theme_default';
        const isDark = globalIsDark || activeTheme === 'theme_dark';
        const chartNoFill = isChartNoFill(opts, reportNoFill);
        const chartFillBackground = resolveChartFillBackground(
            opts,
            isDark ? 'var(--bg-secondary)' : '#ffffff',
            reportNoFill
        );
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
            return resolveCategoryColor(categoryColorMap, categoryName, index, palette);
        };

        const showEmbeddedRechartsLegend = opts.showLegend
            && !isSmall
            && !isHierarchyActive
            && !showLegendFilterRow
            && !suppressCanvasLegendRail;

        const pieLabelFontSize = isMicro ? 11 : (isSmall ? 12 : 14);
        const pieLabelNameLimit = isMicro ? 8 : (isSmall ? 12 : 18);
        const pieMargin = isMicro
            ? { top: 10, right: 34, bottom: 10, left: 34 }
            : (isSmall ? { top: 16, right: 50, bottom: 16, left: 50 } : { top: 20, right: 70, bottom: 20, left: 70 });
        const pieOuterRadius = isMicro ? '56%' : (isSmall ? '64%' : '74%');
        const pieInnerRadius = graphDefinition.graph_type === 'donut'
            ? (isMicro ? '32%' : (isSmall ? '40%' : '50%'))
            : 0;
        const formatNumber = (num, mode = 'compact', seriesName = null) => {
            const seriesMeasure = seriesName
                ? resolveMeasureMetadata(seriesName, measures, false)
                : matchedMeasure;
            if (seriesMeasure) {
                return formatCustomMeasureValue(num, seriesMeasure);
            }
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
                        stroke={isDark ? '#cbd5e1' : '#000000'}
                        strokeWidth={1}
                    />
                    <text
                        x={cx + labelRadius * Math.cos(-midAngle * RADIAN)}
                        y={cy + labelRadius * Math.sin(-midAngle * RADIAN)}
                        textAnchor={direction === 1 ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={pieLabelFontSize}
                        fontWeight={500}
                        fill={isDark ? '#cbd5e1' : '#000000'}
                    >
                        {labelText}
                    </text>
                </g>
            );
        };

        if (graphDefinition.graph_type === 'table') {
            if (!data || !data.columns || !data.rows) return <div>Invalid table data</div>;
            const ts = resolveTableStyle(opts.tableStyle, { isDark });
            const hasFixedColumns = Object.keys(ts.columnWidths || {}).length > 0;
            const cellPad = `${ts.cellPaddingY}px ${ts.cellPaddingX}px`;
            const rowMinH = ts.rowHeight > 0 ? `${ts.rowHeight}px` : undefined;
            const colWidthStyle = (col) => {
                const w = ts.columnWidths?.[col];
                if (w) return { width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` };
                return { minWidth: `${ts.minColumnWidth}px` };
            };

            return (
                <div
                    className="bi-table-visual-scroll"
                    style={{
                        width: '100%',
                        height: '100%',
                        overflow: 'auto',
                        borderRadius: '8px',
                        border: `1px solid ${ts.borderColor || tableBorderColor}`,
                        backgroundColor: ts.rowBg || chartFillBackground,
                    }}
                >
                    <table
                        className={`bi-table-visual${hasFixedColumns ? ' bi-table-visual--fixed-cols' : ''}`}
                        style={{
                            width: hasFixedColumns ? 'max-content' : '100%',
                            minWidth: '100%',
                            borderCollapse: 'collapse',
                            textAlign: ts.textAlign,
                            fontSize: `${ts.fontSize}px`,
                            tableLayout: hasFixedColumns ? 'fixed' : 'auto',
                        }}
                    >
                        <thead
                            style={{
                                position: ts.stickyHeader !== false ? 'sticky' : 'static',
                                top: 0,
                                backgroundColor: ts.headerBg || tableHeaderBg,
                                zIndex: 1,
                                boxShadow: ts.stickyHeader !== false ? '0 1px 2px rgba(0,0,0,0.05)' : undefined,
                            }}
                        >
                            <tr>
                                {data.columns.map((col, i) => {
                                    const m = resolveMeasureMetadata(col, measures, false);
                                    return (
                                        <th
                                            key={i}
                                            style={{
                                                ...colWidthStyle(col),
                                                padding: cellPad,
                                                minHeight: rowMinH,
                                                borderBottom: `1px solid ${ts.borderColor || tableBorderColor}`,
                                                color: ts.headerText || tableHeaderTextColor,
                                                fontWeight: 600,
                                                whiteSpace: ts.wrapText === false ? 'nowrap' : 'normal',
                                                verticalAlign: 'middle',
                                            }}
                                        >
                                            {m ? m.display_name || m.name : col}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {(processedChartData || data.rows).map((row, i) => {
                                const baseBg = ts.stripedRows !== false && i % 2 === 1
                                    ? (ts.altRowBg || (isDark ? '#1e293b' : '#f8fafc'))
                                    : (ts.rowBg || 'transparent');
                                return (
                                    <tr
                                        key={i}
                                        className="bi-table-visual-row"
                                        style={{
                                            backgroundColor: baseBg,
                                            transition: 'background-color 0.15s',
                                            minHeight: rowMinH,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = ts.hoverRowBg || tableRowHover;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = baseBg;
                                        }}
                                    >
                                        {data.columns.map((col, j) => {
                                            const m = resolveMeasureMetadata(col, measures, false);
                                            let cellText = '-';
                                            if (row[col] !== null && row[col] !== undefined) {
                                                if (m) {
                                                    const formatted = formatCustomMeasureValue(row[col], m);
                                                    cellText = formatted === 'BLANK' ? '-' : formatted;
                                                } else {
                                                    cellText = row[col].toString();
                                                }
                                            }
                                            return (
                                                <td
                                                    key={j}
                                                    style={{
                                                        ...colWidthStyle(col),
                                                        padding: cellPad,
                                                        minHeight: rowMinH,
                                                        borderBottom: `1px solid ${ts.cellBorderColor || tableCellBorder}`,
                                                        color: ts.cellTextColor || tableCellText,
                                                        whiteSpace: ts.wrapText === false ? 'nowrap' : 'normal',
                                                        wordBreak: ts.wrapText !== false ? 'break-word' : 'normal',
                                                        verticalAlign: 'middle',
                                                    }}
                                                >
                                                    {cellText}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Prepare and Sort Data (only for array data charts)
        let chartData = renderedChartData;

        const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
        const plotWidth = resolveBarPlotWidth(dimensions.width, { isDashboardCanvas, isFocusView });
        const xLayout = computeXAxisLayout(chartData, {
            expandModeActive,
            compactMode: isHierarchyActive || isDashboardCanvas,
            chartWidth: plotWidth,
            focusView: isFocusView,
            dashboardCard: isDashboardCanvas,
            graphType: graphDefinition.graph_type,
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
        const chartBottomMargin = computeChartBottomMargin(isDashboardCanvas);
        const chartPlotMargin = {
            top: isDashboardCanvas ? 4 : 10,
            right: isDashboardCanvas ? 6 : 10,
            left: isDashboardCanvas ? 12 : 20,
            bottom: isDashboardCanvas ? 4 : 8,
        };
        const barChartMargin = {
            top: showBarDataLabels ? (isDashboardCanvas ? 14 : 22) : chartPlotMargin.top,
            right: chartPlotMargin.right,
            left: chartPlotMargin.left,
            bottom: chartBottomMargin,
        };
        const yAxisTickWidth = showAxisTitles && yTitleText ? (isDashboardCanvas ? 48 : 58) : (isDashboardCanvas ? 42 : 50);

        const tooltipFormatter = (value, name, props) => {
            const seriesMeasure = resolveMeasureMetadata(name, measures, false);
            const val = seriesMeasure
                ? formatCustomMeasureValue(value, seriesMeasure)
                : formatNumber(value, 'full', name);
            const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) + '%' : null;
            const category = props?.payload?.name ?? name;
            const displayTitle = seriesMeasure ? (seriesMeasure.display_name || seriesMeasure.name) : (name || yAxisDisplayTitle);
            return [
                <div key="tt" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {category && category !== displayTitle && (
                        <div style={{ fontSize: '11px', color: tooltipSubtext, fontWeight: 600 }}>{category}</div>
                    )}
                    <div style={{ fontWeight: 700, color: tooltipText }}>{displayTitle}: {val}</div>
                    {percentage && (
                        <div style={{ fontSize: '11px', color: tooltipSubtext, opacity: 0.8 }}>
                            {percentage} of total
                        </div>
                    )}
                </div>,
                displayTitle
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
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: chartFillBackground, color: tooltipSubtext }}>
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
                    <div className="decomp-tree-canvas" style={{ width: '100%', height: '100%', background: chartFillBackground, overflowX: 'auto', overflowY: 'auto' }}>
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
                    <BarChart
                        data={chartData}
                        style={{ cursor: 'pointer' }}
                        margin={barChartMargin}
                        className="chart-category-clickable"
                    >
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
                                tick={{
                                    fill: axisTickColor,
                                    fontSize: xLayout.fontSize,
                                    fontWeight: (isFocusView || isDashboardCanvas) ? 500 : 400,
                                    dy: xLayout.angle ? 2 : 0,
                                }}
                                tickFormatter={(val) => formatXAxisTick(
                                    val,
                                    xLayout.fullLabels,
                                    xLayout.tickMaxLen,
                                    xLayout.charsPerSlot,
                                    xLayout.slotWidth,
                                    xLayout.fontSize,
                                    xLayout.angle,
                                )}
                            />
                        )}
                        {opts.showYAxis !== false && (
                            <YAxis
                                fontSize={isFocusView ? 10 : 8}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: axisTickColor, fontSize: isFocusView ? 10 : 8 }}
                                tickFormatter={(v) => formatNumber(v, 'axis')}
                                width={yAxisTickWidth}
                                domain={yAxisDomain}
                                label={yAxisTitleLabel}
                            />
                        )}
                        <Tooltip shared={false} cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} />
                        <Bar
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={animation}
                            fill={mainColor}
                            stackId={graphDefinition.graph_type === 'stackedColumn' ? 'a' : undefined}
                            className="chart-bar-marks"
                            onClick={handleRechartsCategoryClick}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={categoryColor(entry.name, index)}
                                    className="chart-bar-cell"
                                    opacity={!Number(entry.value)
                                        ? 0.4
                                        : (categoryMarkIsDimmed(entry.name) ? 0.35 : 1)}
                                    stroke={categoryMarkIsSelected(entry.name) ? '#fff' : 'none'}
                                    strokeWidth={categoryMarkIsSelected(entry.name) ? 2 : 0}
                                />
                            ))}
                            {showBarDataLabels && (
                                <LabelList
                                    dataKey="value"
                                    content={renderBarDataLabel(formatNumber)}
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
                        shared={false}
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
                    <LineChart data={chartData} style={{ cursor: 'pointer' }} margin={chartPlotMargin} className="chart-category-clickable">
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
                                tickFormatter={(val) => formatXAxisTick(
                                    val,
                                    xLayout.fullLabels,
                                    xLayout.tickMaxLen,
                                    xLayout.charsPerSlot,
                                    xLayout.slotWidth,
                                    xLayout.fontSize,
                                    xLayout.angle,
                                )}
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '4px', overflow: 'visible' }} />}
                        <Line
                            type="monotone"
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            stroke={mainColor}
                            strokeWidth={3}
                            dot={{ r: 4, fill: mainColor, strokeWidth: 2, stroke: '#fff', cursor: 'pointer' }}
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: handleRechartsCategoryClick }}
                            isAnimationActive={animation}
                            onClick={handleRechartsCategoryClick}
                        >
                        </Line>
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={chartData} style={{ cursor: 'pointer' }} margin={chartPlotMargin} className="chart-category-clickable">
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
                                tickFormatter={(val) => formatXAxisTick(
                                    val,
                                    xLayout.fullLabels,
                                    xLayout.tickMaxLen,
                                    xLayout.charsPerSlot,
                                    xLayout.slotWidth,
                                    xLayout.fontSize,
                                    xLayout.angle,
                                )}
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '4px', overflow: 'visible' }} />}
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={yAxisDisplayTitle}
                            stroke={mainColor}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={`url(#colorValue-${graphDefinition.id})`}
                            isAnimationActive={animation}
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: handleRechartsCategoryClick }}
                            onClick={handleRechartsCategoryClick}
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

                // 1. Process data — same builder as toolbar controls (pieDonutSliceModel)
                const sliceModel = buildPieDonutProcessedData(chartData, {
                    scShowAll,
                    scTopN,
                    scGroupOthers,
                    scHiddenSlices,
                });
                if (!sliceModel) {
                    return (
                        <div className="chart-empty sc-pie-empty">
                            {isCrossFilterActive ? 'No data matches the current filter' : 'No data available'}
                        </div>
                    );
                }
                const {
                    rawSorted,
                    pieSlices,
                    pieTotal,
                    nonZeroSliceCount,
                    scLabelCount,
                } = sliceModel;
                const hasZeroValueSlices = pieSlices.some((d) => !Number(d.value));
                const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
                const chartTight = !isDashboardCanvas
                    && dimensions.height > 0
                    && (dimensions.height < 300 || dimensions.width < 340);
                const chartCompact = !isDashboardCanvas
                    && dimensions.height > 0
                    && (dimensions.height < 420 || dimensions.width < 500);
                const labelsEnabled = scShowLabels && scLabelCount > 0;
                const pieSliceActiveFilters = getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension);
                const pieCategoryFiltered = pieSliceActiveFilters.length > 0;

                let pieChartBase = scShowAll
                    ? pieSlices
                    : (hasZeroValueSlices && !pieCategoryFiltered
                        ? pieSlices.filter((d) => Number(d.value) > 0)
                        : pieSlices);

                /** Recharts Pie cannot draw negative arcs — use |value| for slice size, keep raw for labels. */
                const pieChartDataRaw = pieChartBase.map((entry) => {
                    const raw = Number(entry?.value) || 0;
                    let arcValue = raw;
                    const isSelected = pieSliceActiveFilters.some((v) => String(v) === String(entry.name));
                    if (isSelected && raw <= 0) {
                        arcValue = Math.abs(raw) || 1;
                    } else if (raw < 0) {
                        arcValue = Math.abs(raw);
                    }
                    return { ...entry, _rawValue: raw, value: arcValue };
                }).filter((entry) => pieCategoryFiltered || scShowAll || Number(entry.value) > 0);

                // Keep natural pie order to avoid long cross-chart connector jumps.
                const pieChartData = pieChartDataRaw;

                pieSliceDataRef.current = pieChartData;
                if (pieChartData.length === 0) {
                    return (
                        <div className="chart-empty sc-pie-empty">
                            {isCrossFilterActive ? 'No data matches the current filter' : 'No data available'}
                        </div>
                    );
                }
                const pieChartTotal = pieChartData.reduce((s, d) => s + (Number(d.value) || 0), 0);
                const pieDisplayTotal = pieCategoryFiltered && pieChartData.length === 1
                    ? (pieChartData[0]._rawValue ?? pieChartData[0].value)
                    : pieSlices.reduce((s, d) => s + (Number(d._rawValue ?? d.value) || 0), 0);
                const pieSliceIsDimmed = (name) =>
                    pieSliceActiveFilters.length > 0
                    && !pieSliceActiveFilters.some((v) => String(v) === String(name));
                const pieChartSliceCount = pieChartData.length;
                const pieCardCapacity = computePieCardLabelCapacity({
                    plotWidth: dimensions.width || 300,
                    plotHeight: dimensions.height || 280,
                    sliceCount: pieChartSliceCount,
                    labelFont: 10,
                    isDashboardCanvas,
                });
                const piePreferAllLabels = isDashboardCanvas && (
                    pieChartSliceCount <= 6
                    || (pieCardCapacity.isMedium && pieChartSliceCount <= 8)
                    || (pieCardCapacity.isLarge && pieChartSliceCount <= 12)
                );
                const showLegendPanel = false;
                const legendPanelActive = showLegendPanel && !scLegendPanelCollapsed;
                const showPieCalloutLabels = labelsEnabled;
                const shrinkForLegend = (outerPct) => {
                    if (!legendPanelActive) return outerPct;
                    return Math.max(44, outerPct - 12);
                };
                // Donut ring width ~17% of plot — standard proportion; hole size comes from outer radius.
                const donutInnerPct = (outerPct) => {
                    const o = Number(outerPct) || 50;
                    const ringWidth = isDashboardCanvas ? 17 : 15;
                    return Math.max(20, o - ringWidth);
                };
                const resolvePieDonutRadii = () => {
                    if (!isDonut) {
                        if (!labelsEnabled) {
                            if (isMicro) return { inner: 0, outer: '58%' };
                            if (isDashboardCanvas) return { inner: 0, outer: shrinkForLegend(62) + '%' };
                            if (chartTight) return { inner: 0, outer: shrinkForLegend(88) + '%' };
                            if (chartCompact) return { inner: 0, outer: shrinkForLegend(84) + '%' };
                            return { inner: 0, outer: shrinkForLegend(parseInt(pieOuterRadius, 10) || 74) + '%' };
                        }
                        const dense = pieChartSliceCount > 18;
                        if (isDashboardCanvas) {
                            const baseOuter = dense
                                ? 40
                                : (pieChartSliceCount <= 6 ? 50
                                    : pieChartSliceCount <= 10 ? 46
                                        : pieChartSliceCount <= 14 ? 42
                                            : 38);
                            const outer = shrinkForLegend(
                                Math.min(56, baseOuter + pieCardCapacity.outerBoost)
                            );
                            return { inner: 0, outer: `${outer}%` };
                        }
                        if (dense) {
                            if (chartTight) return { inner: 0, outer: `${shrinkForLegend(48)}%` };
                            if (chartCompact) return { inner: 0, outer: `${shrinkForLegend(54)}%` };
                            return { inner: 0, outer: `${shrinkForLegend(60)}%` };
                        }
                        if (chartTight) return { inner: 0, outer: `${shrinkForLegend(58)}%` };
                        if (chartCompact) return { inner: 0, outer: `${shrinkForLegend(62)}%` };
                        const baseOuter = isMicro ? 56 : isSmall ? 60 : 62;
                        return { inner: 0, outer: `${shrinkForLegend(baseOuter)}%` };
                    }
                    if (!labelsEnabled) {
                        const outerPct = isDashboardCanvas
                            ? 62
                            : (isMicro ? 72 : isSmall ? 80 : 88);
                        const adjustedOuter = shrinkForLegend(outerPct);
                        return {
                            inner: `${donutInnerPct(adjustedOuter)}%`,
                            outer: `${adjustedOuter}%`,
                        };
                    }
                    const dense = pieChartSliceCount > 18;
                    const donutBaseOuter = dense
                        ? 50
                        : (pieChartSliceCount <= 6 ? 54 : pieChartSliceCount <= 10 ? 52 : pieChartSliceCount <= 14 ? 50 : 48);
                    const outerPct = isDashboardCanvas
                        ? Math.min(58, donutBaseOuter + pieCardCapacity.outerBoost)
                        : (dense
                            ? (chartTight ? 48 : chartCompact ? 54 : 60)
                            : (chartTight ? 66 : chartCompact ? 70 : 74));
                    const adjustedOuter = shrinkForLegend(outerPct);
                    return {
                        inner: `${donutInnerPct(adjustedOuter)}%`,
                        outer: `${adjustedOuter}%`,
                    };
                };
                // 2. Slice color — from active report theme palette
                const sliceColor = (name, index) => {
                    const src = pieChartData[index] ?? pieSlices.find((d) => d.name === name);
                    if (name === 'Others' || src?.__others) return '#94a3b8';
                    if (opts.mainColor && pieChartData.length === 1) return mainColor;
                    const srcIndex = pieSlices.findIndex((d) => d.name === name);
                    return categoryColor(name, srcIndex >= 0 ? srcIndex : index);
                };

                const piePaddingAngleDeg = pieChartData.length > 50 ? 0 : pieChartData.length > 20 ? 1 : 2;
                const totalSweepDeg = Math.max(1, 360 - pieChartData.length * piePaddingAngleDeg);

                const pieSideMargin = labelsEnabled
                    ? (() => {
                        const dense = pieChartSliceCount > 18;
                        const manyLabels = pieChartSliceCount > 24;
                        const legendExtra = legendPanelActive ? (isDashboardCanvas ? 6 : 8) : 0;
                        if (isDashboardCanvas) {
                            const cw = dimensions.width || 300;
                            const ch = Math.max(80, dimensions.height || 300);
                            const minDim = Math.min(cw, ch);
                            let marginRatio = pieCardCapacity.marginRatio;
                            if (manyLabels) marginRatio = Math.max(marginRatio, 0.12);
                            if (dense) marginRatio = Math.max(marginRatio, 0.11);
                            if (minDim < 240) marginRatio += 0.02;
                            const minSide = pieCardCapacity.isLarge ? 18 : pieCardCapacity.isMedium ? 20 : 22;
                            return Math.max(minSide, Math.round(minDim * marginRatio)) + legendExtra;
                        }
                        if (manyLabels) return chartTight ? 44 : chartCompact ? 50 : 56;
                        if (dense) return chartTight ? 36 : chartCompact ? 42 : 48;
                        if (pieChartSliceCount > 8) return chartTight ? 28 : chartCompact ? 34 : 40;
                        return chartTight ? 22 : chartCompact ? 26 : 32;
                    })()
                    : (isDashboardCanvas ? 2 : 4);
                const pieVerticalMargin = labelsEnabled
                    ? Math.max(isDashboardCanvas ? 10 : 14, Math.round(pieSideMargin * 0.5))
                    : (isDashboardCanvas ? 2 : 4);
                const labelMargin = pieSideMargin;
                const { inner: effectiveInnerRadius, outer: effectiveOuterRadius } = resolvePieDonutRadii();
                const pieChartMargin = {
                    top: pieVerticalMargin,
                    right: pieSideMargin,
                    bottom: pieVerticalMargin,
                    left: pieSideMargin,
                };

                // 3. Adaptive label strategy
                const compactLabelMode = pieChartSliceCount > 10;
                const showAllDense = scShowAll && scLabelCount > 24 && scLabelSide !== 'all';
                const veryDenseShowAll = scShowAll && scLabelCount > 80 && scLabelSide !== 'all';
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

                const pieCalloutLabelFont = Math.max(
                    isDashboardCanvas ? 8 : 9,
                    computeResponsiveFontSize(
                        isDashboardCanvas ? 11 : 14,
                        dimensions.width,
                        dimensions.height,
                        { min: isDashboardCanvas ? 8 : 9, max: isDashboardCanvas ? 12 : 16 }
                    )
                    - (compactLabelMode && !piePreferAllLabels && !pieCardCapacity.isLarge ? 1 : 0)
                    - (pieChartSliceCount > 16 && !pieCardCapacity.isLarge ? 1 : 0)
                    - (isDashboardCanvas && pieCardCapacity.isLarge && pieChartSliceCount > 10 ? 1 : 0)
                    - (pieChartSliceCount > 24 ? 1 : 0)
                    - (pieChartSliceCount > 32 ? 1 : 0)
                );
                const legendFontSize = computeResponsiveFontSize(11, dimensions.width, dimensions.height, { min: 8, max: 13 });
                const legendSearchFontSize = computeResponsiveFontSize(10, dimensions.width, dimensions.height, { min: 7, max: 12 });
                const legendToggleFontSize = computeResponsiveFontSize(10, dimensions.width, dimensions.height, { min: 8, max: 12 });
                const legendDotSize = Math.max(6, Math.min(10, Math.round(legendFontSize * 0.72)));
                const geometricMaxLabels = computeMaxPieOutsideLabels({
                    sliceCount: pieChartSliceCount,
                    labelFont: pieCalloutLabelFont,
                    labelMargin: pieSideMargin,
                    plotHeight: dimensions.height || 280,
                    plotWidth: dimensions.width || 360,
                    hasLegendPanel: legendPanelActive,
                });
                const maxOutsideLabels = Math.min(
                    pieChartSliceCount,
                    Math.max(pieCardCapacity.maxLabels, geometricMaxLabels)
                );
                const labelEligible = computePieOutsideLabelEligible(
                    pieChartData,
                    pieChartTotal,
                    maxOutsideLabels,
                    scShowAll
                    || piePreferAllLabels
                    || (labelsEnabled && !isDashboardCanvas)
                    || (isDashboardCanvas && pieCardCapacity.isLarge && pieChartSliceCount <= 14)
                );
                const getRadialLabelStyle = (cosA, sinA) => {
                    const textAnchor = cosA >= 0 ? 'start' : 'end';
                    const dx = cosA >= 0 ? 3 : -3;
                    return { textAnchor, dx };
                };

                const pieCalloutValueFont = Math.max(8, pieCalloutLabelFont - 1);

                const buildPieCalloutLines = (entryName, rawVal, pct, { isOthers = false, nameLimit = 32 } = {}) => {
                    const displayName = isOthers
                        ? 'Others'
                        : (String(entryName).length > nameLimit
                            ? `${String(entryName).slice(0, nameLimit - 1)}…`
                            : String(entryName));
                    const valueLine = `${formatNumber(rawVal)} (${pct}%)`;
                    return { nameLine: displayName, valueLine };
                };

                let pieRadialLayoutCache = null;

                const estimateRadialTextBBox = (cx, cy, cosA, sinA, labelDist, nameLine, valueLine) => {
                    const { textAnchor, dx } = getRadialLabelStyle(cosA, sinA);
                    const lx = cx + labelDist * cosA;
                    const ly = cy + labelDist * sinA;
                    const tx = lx + dx;
                    const ty = ly;
                    const nameW = Math.max(20, String(nameLine).length * pieCalloutLabelFont * 0.55);
                    const valueW = Math.max(20, String(valueLine).length * pieCalloutValueFont * 0.5);
                    const w = Math.max(nameW, valueW);
                    const h = pieCalloutLabelFont + pieCalloutValueFont + 8;
                    const pad = 4;
                    let x1;
                    let x2;
                    if (textAnchor === 'start') {
                        x1 = tx - pad;
                        x2 = tx + w + pad;
                    } else {
                        x2 = tx + pad;
                        x1 = x2 - w - pad * 2;
                    }
                    const y1 = ty - h / 2 - pad;
                    const y2 = ty + h / 2 + pad;
                    return { x1, y1, x2, y2 };
                };

                const radialBboxesOverlap = (a, b) =>
                    a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

                /** Radial callouts along slice angle; stagger length only enough to avoid label overlap */
                const buildCompactRadialLayout = (outerR, cx, cy, chartMargin) => {
                    const RADIAN = Math.PI / 180;
                    const baseExtra = Math.max(10, Math.min(20, outerR * 0.15));
                    const staggerStep = pieChartSliceCount > 24 ? 4 : (pieCardCapacity.isLarge ? 5 : 6);
                    const maxTier = pieCardCapacity.maxStaggerTiers;
                    const edgePad = chartMargin + 2;
                    const cardInset = isDashboardCanvas ? pieCardCapacity.cardInset : 4;
                    const chartW = dimensions.width || cx * 2;
                    const chartH = dimensions.height || cy * 2;
                    const labelFitsChart = (bbox) =>
                        bbox.x1 >= cardInset
                        && bbox.x2 <= chartW - cardInset
                        && bbox.y1 >= cardInset
                        && bbox.y2 <= chartH - cardInset;
                    const maxFromCenter = Math.min(
                        cx - edgePad,
                        cy - edgePad,
                        outerR + baseExtra + maxTier * staggerStep + 12
                    );
                    const maxLabelDist = Math.max(
                        outerR + baseExtra,
                        Math.min(outerR + baseExtra + maxTier * staggerStep, maxFromCenter)
                    );

                    const items = [];
                    let cursorDeg = 0;
                    pieChartData.forEach((entry, index) => {
                        const val = Number(entry.value) || 0;
                        const sliceAngle = val > 0 ? (val / (pieChartTotal || 1)) * totalSweepDeg : 0;
                        const midAngle = cursorDeg + sliceAngle / 2;
                        if (labelEligible.has(index) && val > 0) {
                            const rawVal = Number(entry?._rawValue ?? entry.value) || 0;
                            const pct = pieChartTotal > 0 ? ((rawVal / pieChartTotal) * 100).toFixed(1) : '0.0';
                            const isOthers = entry.name === 'Others' || entry.__others;
                            const nameLimitLayout = isDashboardCanvas
                                ? (pieCardCapacity.isLarge
                                    ? (pieChartSliceCount > 10 ? 20 : 26)
                                    : pieCardCapacity.isMedium
                                        ? (pieChartSliceCount > 10 ? 14 : 18)
                                        : (pieChartSliceCount > 10 ? 11 : 15))
                                : (compactLabelMode ? 14 : 18);
                            const { nameLine, valueLine } = buildPieCalloutLines(
                                entry.name,
                                rawVal,
                                pct,
                                { isOthers, nameLimit: nameLimitLayout }
                            );
                            const angleRad = -midAngle * RADIAN;
                            items.push({
                                index,
                                midAngle,
                                cosA: Math.cos(angleRad),
                                sinA: Math.sin(angleRad),
                                nameLine,
                                valueLine,
                                value: val,
                                name: entry.name,
                            });
                        }
                        if (val > 0) cursorDeg += sliceAngle + piePaddingAngleDeg;
                    });

                    // Prioritize selection and hover, then sort by value descending
                    const placementOrder = [...items].sort((a, b) => {
                        const aSelected = pieSliceActiveFilters.some((v) => String(v) === String(a.name));
                        const bSelected = pieSliceActiveFilters.some((v) => String(v) === String(b.name));
                        if (aSelected && !bSelected) return -1;
                        if (!aSelected && bSelected) return 1;

                        const aHovered = pieHoverSegment && String(pieHoverSegment.name) === String(a.name);
                        const bHovered = pieHoverSegment && String(pieHoverSegment.name) === String(b.name);
                        if (aHovered && !bHovered) return -1;
                        if (!aHovered && bHovered) return 1;

                        return b.value - a.value;
                    });

                    const layout = new Map();
                    const placed = [];

                    placementOrder.forEach((item) => {
                        let chosenDist = null;
                        let chosenBBox = null;
                        const isSelected = pieSliceActiveFilters.some((v) => String(v) === String(item.name));
                        const isHovered = pieHoverSegment && String(pieHoverSegment.name) === String(item.name);

                        for (let tier = 0; tier <= maxTier; tier += 1) {
                            const dist = Math.min(maxLabelDist, outerR + baseExtra + tier * staggerStep);
                            const bbox = estimateRadialTextBBox(
                                cx, cy, item.cosA, item.sinA, dist, item.nameLine, item.valueLine
                            );
                            const overlaps = placed.some((p) => radialBboxesOverlap(bbox, p.bbox));
                            if (!overlaps && labelFitsChart(bbox)) {
                                chosenDist = dist;
                                chosenBBox = bbox;
                                break;
                            }
                        }

                        const forceShow = piePreferAllLabels;
                        if (chosenDist !== null) {
                            layout.set(item.index, { labelDist: chosenDist, visible: true });
                            placed.push({ bbox: chosenBBox });
                        } else if ((forceShow || isSelected || isHovered)) {
                            const dist = Math.min(maxLabelDist, outerR + baseExtra + (forceShow ? maxTier * staggerStep : 0));
                            const bbox = estimateRadialTextBBox(
                                cx, cy, item.cosA, item.sinA, dist, item.nameLine, item.valueLine
                            );
                            if (labelFitsChart(bbox)) {
                                layout.set(item.index, { labelDist: dist, visible: true });
                                placed.push({ bbox: bbox });
                            } else {
                                layout.set(item.index, { labelDist: null, visible: false });
                            }
                        } else {
                            layout.set(item.index, { labelDist: null, visible: false });
                        }
                    });
                    return layout;
                };

                const getRadialLayoutItem = (outerR, cx, cy, index) => {
                    const activeFilterKey = pieSliceActiveFilters.join(',');
                    const hoverKey = pieHoverSegment ? pieHoverSegment.name : '';
                    const cacheKey = `${outerR}|${cx}|${cy}|${labelMargin}|${activeFilterKey}|${hoverKey}`;
                    if (!pieRadialLayoutCache || pieRadialLayoutCache.key !== cacheKey) {
                        pieRadialLayoutCache = {
                            key: cacheKey,
                            layout: buildCompactRadialLayout(outerR, cx, cy, labelMargin),
                        };
                    }
                    return pieRadialLayoutCache.layout.get(index);
                };

                // 4. Label renderer — compact radial lines (fits inside card)
                const renderAdaptiveLabel = (props) => {
                    const { cx, cy, midAngle, outerRadius: or, name, value, index } = props;
                    if (!showPieCalloutLabels) return null;
                    const sliceEntry = pieChartData[index];
                    const arcVal = Number(value) || 0;
                    const rawVal = Number(sliceEntry?._rawValue ?? value) || 0;
                    if (arcVal <= 0 && rawVal === 0) return null;

                    const RADIAN = Math.PI / 180;
                    const outerR = typeof or === 'number' ? or : parseFloat(or);
                    if (!Number.isFinite(outerR)) return null;

                    const layoutItem = getRadialLayoutItem(outerR, cx, cy, index);
                    if (!layoutItem || !layoutItem.visible || !layoutItem.labelDist) return null;

                    const labelDist = layoutItem.labelDist;

                    const cosA = Math.cos(-midAngle * RADIAN);
                    const sinA = Math.sin(-midAngle * RADIAN);
                    const sx = cx + outerR * cosA;
                    const sy = cy + outerR * sinA;
                    const lx = cx + labelDist * cosA;
                    const ly = cy + labelDist * sinA;
                    const { textAnchor, dx } = getRadialLabelStyle(cosA, sinA);
                    const anchorX = lx + dx;

                    const pct = pieChartTotal > 0 ? ((rawVal / pieChartTotal) * 100).toFixed(1) : '0.0';
                    const isOthersSlice = name === 'Others' || sliceEntry?.__others;
                    const isSelected = pieSliceActiveFilters.some((v) => String(v) === String(name));
                    const isHovered = pieHoverSegment && String(pieHoverSegment.name) === String(name);
                    const dashboardNameLimit = Math.max(
                        18,
                        Math.min(48, Math.round((Math.min(dimensions.width || 300, dimensions.height || 300) - pieSideMargin * 2) / 9))
                    );
                    const nameLimit = (isSelected || isHovered)
                        ? 60
                        : (isDashboardCanvas
                            ? dashboardNameLimit
                            : (compactLabelMode ? (chartTight ? 14 : 18) : (chartTight ? 16 : (chartCompact ? 20 : (isMicro ? 14 : isSmall ? 24 : 32)))));
                    const { nameLine, valueLine } = buildPieCalloutLines(name, rawVal, pct, {
                        isOthers: isOthersSlice,
                        nameLimit,
                    });
                    const fullLabelTitle = isOthersSlice
                        ? `Others: ${formatNumber(rawVal)} (${pct}%)`
                        : `${name}: ${formatNumber(rawVal)} (${pct}%)`;
                    const nameFill = isOthersSlice
                        ? (isDark ? '#94a3b8' : '#64748b')
                        : (isDark ? '#e2e8f0' : '#1e293b');
                    const valueFill = isDark ? '#94a3b8' : '#64748b';

                    return (
                        <g className="pie-donut-callout">
                            <line
                                className={isOthersSlice ? 'pie-donut-callout__line--others' : undefined}
                                x1={sx}
                                y1={sy}
                                x2={anchorX}
                                y2={ly}
                            />
                            <text
                                x={anchorX}
                                y={ly}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fontSize={pieCalloutLabelFont}
                                fill={nameFill}
                            >
                                <tspan x={anchorX} dy="-0.55em" fontWeight={700}>{nameLine}</tspan>
                                <tspan
                                    x={anchorX}
                                    dy="1.2em"
                                    fontSize={pieCalloutValueFont}
                                    fontWeight={500}
                                    fill={valueFill}
                                >
                                    {valueLine}
                                </tspan>
                                <title>{fullLabelTitle}</title>
                            </text>
                        </g>
                    );
                };

                const renderPieDonutTooltip = ({ active, payload: tooltipPayload }) => {
                    if (!active || !tooltipPayload?.length || crossFilterRefreshing) return null;
                    const sliceEntry = tooltipPayload[0]?.payload;
                    if (!sliceEntry?.name) return null;
                    const rawVal = Number(sliceEntry._rawValue ?? sliceEntry.value) || 0;
                    const pct = pieChartTotal > 0
                        ? ((Math.abs(rawVal) / pieChartTotal) * 100).toFixed(1)
                        : '0.0';

                    const sortedSlices = [...pieChartData].sort((a, b) => (Number(b._rawValue ?? b.value) || 0) - (Number(a._rawValue ?? a.value) || 0));
                    const rank = sortedSlices.findIndex((d) => d.name === sliceEntry.name) + 1;
                    const totalRankCount = sortedSlices.length;

                    const averageValue = pieChartTotal / (pieChartData.length || 1);
                    const compToAvg = averageValue > 0 ? (rawVal / averageValue) : 0;
                    const avgStr = compToAvg >= 1
                        ? `${((compToAvg - 1) * 100).toFixed(0)}% above average`
                        : `${((1 - compToAvg) * 100).toFixed(0)}% below average`;

                    return (
                        <div className="pie-donut-hover-tooltip pie-donut-hover-tooltip--cursor" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="pie-donut-hover-tooltip__label" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: '4px', marginBottom: '4px', color: '#1e293b' }}>{String(sliceEntry.name)}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                                <span style={{ color: '#64748b' }}>Value:</span>
                                <span className="pie-donut-hover-tooltip__value" style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{formatNumber(rawVal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                                <span style={{ color: '#64748b' }}>Share:</span>
                                <span className="pie-donut-hover-tooltip__pct" style={{ fontSize: '12px', fontWeight: 600, color: '#0284c7' }}>{pct}% of total</span>
                            </div>
                            {sliceEntry.name !== 'Others' && !sliceEntry.__others && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                                        <span style={{ color: '#64748b' }}>Rank:</span>
                                        <span style={{ color: '#334155', fontSize: '11px', fontWeight: 600 }}>#{rank} of {totalRankCount}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                                        <span style={{ color: '#64748b' }}>VS Avg:</span>
                                        <span style={{ color: compToAvg >= 1 ? '#059669' : '#dc2626', fontSize: '11px', fontWeight: 600 }}>{avgStr}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                };



                const pieSliceTooltipFormatter = (value, name, item) => {
                    const entry = item?.payload ?? item;
                    const rawVal = Number(entry?._rawValue ?? value) || 0;
                    const pct = pieChartTotal > 0
                        ? ((Math.abs(rawVal) / pieChartTotal) * 100).toFixed(1)
                        : '0.0';
                    return [formatNumber(rawVal), `${name ?? entry?.name ?? ''} (${pct}%)`];
                };

                // 6. Center label for donut (hover shows slice; default shows total)
                const centerLabel = pieHoverSegment
                    ? {
                        name: String(pieHoverSegment.name),
                        val: pieHoverSegment._rawValue ?? pieHoverSegment.value,
                        pct: pieChartTotal > 0
                            ? ((Math.abs(Number(pieHoverSegment._rawValue ?? pieHoverSegment.value) || 0) / pieChartTotal) * 100).toFixed(1)
                            : '0',
                    }
                    : {
                        name: pieCategoryFiltered && pieChartData.length === 1
                            ? String(pieChartData[0].name)
                            : (scShowAll ? `${scLabelCount} categories` : 'Total'),
                        val: pieCategoryFiltered && pieChartData.length === 1
                            ? (pieChartData[0]._rawValue ?? pieChartData[0].value)
                            : pieDisplayTotal,
                        pct: pieCategoryFiltered && pieChartData.length === 1
                            ? '100'
                            : (scShowAll && nonZeroSliceCount < scLabelCount
                                ? `${nonZeroSliceCount} w/ data`
                                : '100'),
                    };

                const centerValueText = formatNumber(centerLabel.val);
                const centerPctText = String(centerLabel.pct).includes('%') || String(centerLabel.pct).includes('w/')
                    ? String(centerLabel.pct)
                    : `${centerLabel.pct}%`;

                const renderDonutCenterLabel = (labelProps) => {
                    const viewBox = labelProps?.viewBox ?? {};
                    const cx = Number(labelProps?.cx ?? viewBox?.cx);
                    const cy = Number(labelProps?.cy ?? viewBox?.cy);
                    const innerRadius = Number(labelProps?.innerRadius ?? viewBox?.innerRadius);
                    if (!Number.isFinite(cx) || !Number.isFinite(cy) || innerRadius <= 0) return null;

                    const donutType = computeDonutCenterTypography({
                        innerRadiusPx: innerRadius,
                        nameText: centerLabel.name,
                        valueText: centerValueText,
                        pctText: centerPctText,
                    });
                    const lines = buildDonutCenterLabelLines(
                        donutType,
                        cx,
                        cy,
                        centerValueText,
                        centerPctText,
                    );
                    const clipId = `donut-center-clip-${graphDefinition.id}`;

                    return (
                        <g className="donut-center-label" style={{ pointerEvents: 'none' }}>
                            <defs>
                                <clipPath id={clipId}>
                                    <circle cx={cx} cy={cy} r={innerRadius * 0.9} />
                                </clipPath>
                            </defs>
                            <g clipPath={`url(#${clipId})`}>
                                {lines.map((line) => (
                                    <text
                                        key={line.kind}
                                        x={line.x}
                                        y={line.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={line.fontSize}
                                        fontWeight={line.weight}
                                        fill={line.kind === 'value' ? axisTitleColor : tooltipSubtext}
                                    >
                                        {line.text}
                                    </text>
                                ))}
                            </g>
                        </g>
                    );
                };

                // 7. Filtered legend items
                const legendSearch = scLegendSearch.toLowerCase();
                const legendItems = rawSorted.filter(d =>
                    !legendSearch || String(d.name).toLowerCase().includes(legendSearch)
                );

                const legendPanelNode = showLegendPanel ? (
                    <div
                        className={`sc-legend-panel${scLegendPanelCollapsed ? ' sc-legend-panel--collapsed' : ''}`}
                        style={{
                            '--sc-legend-font-size': `${legendFontSize}px`,
                            '--sc-legend-search-font-size': `${legendSearchFontSize}px`,
                            '--sc-legend-toggle-font-size': `${legendToggleFontSize}px`,
                            '--sc-legend-dot-size': `${legendDotSize}px`,
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="sc-legend-panel-toggle"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={toggleLegendPanelCollapsed}
                            title={scLegendPanelCollapsed ? 'Expand legend' : 'Collapse legend'}
                            aria-expanded={!scLegendPanelCollapsed}
                            aria-label={scLegendPanelCollapsed ? 'Expand legend' : 'Collapse legend'}
                        >
                            <span className="sc-legend-panel-toggle-label">Legend</span>
                            <span className="sc-legend-panel-toggle-icon" aria-hidden="true">
                                {scLegendPanelCollapsed ? '‹' : '›'}
                            </span>
                        </button>
                        {!scLegendPanelCollapsed && (
                            <>
                                <input
                                    type="text"
                                    placeholder="Search…"
                                    value={scLegendSearch}
                                    onChange={e => {
                                        setScLegendSearch(e.target.value);
                                    }}
                                    className="sc-legend-search"
                                />
                                <div className="sc-legend-list">
                                    {legendItems.map((item) => {
                                        const isSelected = pieSliceActiveFilters.some((v) => String(v) === String(item.name));
                                        const isDimmed = pieSliceActiveFilters.length > 0 && !isSelected;
                                        const itemIdx = rawSorted.indexOf(item);
                                        const color = sliceColor(item.name, itemIdx >= 0 ? itemIdx : 0);
                                        const pct = pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : '0.0';
                                        return (
                                            <div
                                                key={item.name}
                                                className={`sc-legend-item${isSelected ? ' sc-legend-item--selected' : ''}${isDimmed ? ' sc-legend-item--dimmed' : ''}`}
                                                onMouseEnter={() => handlePieDonutSliceHover(item, rawSorted.indexOf(item))}
                                                onMouseLeave={clearPieDonutHover}
                                                onClick={() => {
                                                    handlePieDonutSliceClick(item);
                                                }}
                                                title={`${item.name}: ${formatNumber(item.value)} (${pct}%)`}
                                            >
                                                <span className="sc-legend-dot" style={{ background: color }} />
                                                <span className="sc-legend-name" style={{ fontWeight: isSelected ? 700 : 400 }}>{String(item.name)}</span>
                                                <span className="sc-legend-val">{pct}%</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                ) : null;

                // 10. Render
                const chartPortion = (
                    <PieChart margin={pieChartMargin}>
                        <Tooltip
                            shared={false}
                            content={renderPieDonutTooltip}
                            formatter={pieSliceTooltipFormatter}
                            wrapperStyle={{ zIndex: 60, outline: 'none', pointerEvents: 'none' }}
                            contentStyle={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                boxShadow: 'none',
                            }}
                            itemStyle={{ color: '#e2e8f0' }}
                            labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                        />
                        <Pie
                            key={`pie-${scShowAll ? 'all' : `top${scTopN}`}-${scGroupOthers ? 'grp' : 'flat'}-${pieChartData.length}`}
                            data={pieChartData}
                            innerRadius={effectiveInnerRadius}
                            outerRadius={effectiveOuterRadius}
                            minAngle={
                                pieCategoryFiltered && pieChartData.length === 1
                                    ? 3
                                    : (scShowAll && hasZeroValueSlices ? 1.2 : 0)
                            }
                            paddingAngle={piePaddingAngleDeg}
                            dataKey="value"
                            nameKey="name"
                            shape={renderPieSliceSector}
                            onClick={(sliceData, index, e) => {
                                e?.stopPropagation?.();
                                const entry = pieChartData[index] ?? sliceData;
                                if (entry) handlePieDonutSliceClick(entry);
                            }}
                            onMouseEnter={handlePieDonutSliceHover}
                            onMouseLeave={clearPieDonutHover}
                            style={{ cursor: 'pointer' }}
                            isAnimationActive={false}
                            label={showPieCalloutLabels ? renderAdaptiveLabel : false}
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
                            {isDonut && (
                                <Label content={renderDonutCenterLabel} position="center" />
                            )}
                        </Pie>
                    </PieChart>
                );

                const handleChartBackgroundClick = (e) => {
                    if (veryDenseShowAll) {
                        handleDenseRegionClick(e);
                        return;
                    }
                    if (!e.target.closest('.recharts-pie-sector, .pie-donut-slice-sector, .pie-donut-slice-cell, .sc-legend-item')) {
                        const filterDimension = legendFilterDimension;
                        if (filterDimension) {
                            applyVisualDimensionFilter(filterDimension, '__all__');
                            restoreUnfilteredChartData();
                        }
                    }
                };

                return (
                    <div
                        key={`sc-pie-${scShowAll ? 'all' : `n${scTopN}`}-${scGroupOthers ? 'g' : 'f'}-${pieChartData.length}`}
                        className={`sc-chart-wrapper${isHierarchyActive ? ' sc-chart-wrapper--drill-active' : ''}${(chartCompact || isDashboardCanvas) ? ' sc-chart-wrapper--compact-card' : ''}${labelsEnabled ? ' sc-chart-wrapper--pie-labels' : ''}`}
                        onPointerLeave={handlePiePointerExit}
                    >
                        {graphDefinition.options?.showLegend !== false && showLegendFilterRow && !legendInHeader && !isFocusView && !suppressCanvasLegendRail && (
                            <div className="sc-legend-filter-row">
                                <LegendComponent
                                    dimension={legendFilterDimension}
                                    values={rawLegendValues}
                                    maxItems={rawLegendValues.length > 8 ? 6 : 12}
                                    variant={chartLegendVariant}
                                    filterScope="visual"
                                    visualFilters={visualFilterRules}
                                    onVisualFilterChange={applyVisualDimensionFilter}
                                    onFilterClear={handleLegendFilterClear}
                                    colorPalette={palette}
                                    categoryColorMap={categoryColorMap}
                                />
                            </div>
                        )}
                        <div className={`sc-chart-body${showLegendPanel ? '' : ' sc-chart-body--full'}${scLegendPanelCollapsed ? ' sc-chart-body--legend-collapsed' : ''}`}>
                            <div
                                className={`sc-chart-area${pieHoverSegment ? ' sc-chart-area--slice-hover' : ''}`}
                                onMouseDown={(e) => {
                                    if (!isDashboardCanvas && e.target?.closest?.('.recharts-pie-sector, .pie-donut-slice-sector, .pie-donut-slice-cell')) {
                                        e.stopPropagation();
                                    }
                                }}
                                onClick={handleChartBackgroundClick}
                                onPointerLeave={handlePiePointerExit}
                                style={{ cursor: 'pointer' }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    {chartPortion}
                                </ResponsiveContainer>
                            </div>
                            {legendPanelNode}
                        </div>
                    </div>
                );
            }
            case 'scatter':
                return (
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 25, left: 10 }} className="chart-category-clickable">
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
            case 'radar': {
                const radarData = buildRadarProcessedData(chartData, scShowAll);
                const radarActiveFilters = getVisualDimensionFilterValues(visualFilterRules, legendFilterDimension);
                const radarVisibleIndices = computeRadarTicksVisibility(radarData, radarHoveredName, radarActiveFilters);

                const handleRadarMouseMove = (state) => {
                    if (state && state.activeLabel) {
                        setRadarHoveredName(state.activeLabel);
                    } else {
                        setRadarHoveredName(null);
                    }
                };

                return (
                    <RadarChart
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        data={radarData}
                        onClick={handleClick}
                        onMouseMove={handleRadarMouseMove}
                        onMouseLeave={() => setRadarHoveredName(null)}
                        className="chart-category-clickable"
                    >
                        <PolarGrid strokeOpacity={0.1} stroke={gridColor} />
                        <PolarAngleAxis
                            dataKey="name"
                            tick={<RadarAngleTick visibleIndices={radarVisibleIndices} hoveredName={radarHoveredName} selectedFilters={radarActiveFilters} axisTickColor={axisTickColor} />}
                        />
                        <PolarRadiusAxis
                            tickFormatter={(v) => formatNumber(v, 'axis')}
                            tick={{ fill: axisTickColor, fontSize: 8 }}
                        />
                        <Radar
                            name={yAxisDisplayTitle}
                            dataKey="value"
                            stroke={mainColor}
                            fill={mainColor}
                            fillOpacity={radarActiveFilters.length > 0 || radarHoveredName !== null ? 0.35 : 0.6}
                            isAnimationActive={animation}
                            dot={<CustomRadarDot hoveredName={radarHoveredName} selectedFilters={radarActiveFilters} mainColor={mainColor} formatNumber={formatNumber} />}
                            activeDot={false}
                        />
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={36} />}
                    </RadarChart>
                );
            }
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && <Legend content={renderInteractiveLegend} verticalAlign="bottom" height={36} />}
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                    </Treemap>
                );
            case 'composed':
                return (
                    <ComposedChart data={chartData} style={{ cursor: 'pointer' }} margin={{ ...chartPlotMargin, bottom: chartBottomMargin }} className="chart-category-clickable">
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && <Legend content={renderInteractiveLegend} wrapperStyle={{ paddingTop: '4px', overflow: 'visible' }} />}
                        <Bar dataKey="value" name={yAxisDisplayTitle} barSize={20} fill={mainColor} opacity={0.4} radius={[4, 4, 0, 0]} onClick={handleRechartsCategoryClick} />
                        <Line type="monotone" dataKey="value" name={yAxisDisplayTitle} stroke={mainColor} strokeWidth={3} dot={{ r: 4 }} onClick={handleRechartsCategoryClick} />
                    </ComposedChart>
                );
            case 'funnel':
                return (
                    <BarChart layout="vertical" data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }} className="chart-category-clickable">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} stroke={gridColor} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" fontSize={8} width={60} tick={{ fill: axisTickColor, fontSize: 8 }} />
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        <Bar dataKey="value" isAnimationActive={animation} onClick={handleRechartsCategoryClick}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={palette[index % palette.length]}
                                    opacity={categoryMarkIsDimmed(entry.name) ? 0.35 : 1}
                                    stroke={categoryMarkIsSelected(entry.name) ? '#fff' : 'none'}
                                    strokeWidth={categoryMarkIsSelected(entry.name) ? 2 : 0}
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                    </Sankey>
                );
            case 'waterfall':
                return (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke={gridColor} />
                        <XAxis dataKey="name" fontSize={8} tick={{ fill: axisTickColor, fontSize: 8 }} height={35} label={!isMicro ? { value: opts.xLabel || graphDefinition.x_axis, position: 'insideBottom', offset: -10, fontSize: 9, fill: axisTitleColor, fontWeight: 600 } : undefined} />
                        <YAxis tickFormatter={(v) => formatNumber(v, 'axis')} fontSize={8} tick={{ fill: axisTickColor, fontSize: 8 }} width={50} label={!isMicro ? { value: yAxisDisplayTitle, angle: -90, position: 'insideLeft', fontSize: 9, fill: axisTitleColor, fontWeight: 600, offset: 0 } : undefined} />
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        <Bar dataKey="base" stackId="a" fill="transparent" />
                        <Bar dataKey="value" stackId="a" onClick={handleRechartsCategoryClick}>
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.value >= 0 ? (opts.positiveColor || themeConfig.positive) : (opts.negativeColor || themeConfig.negative)}
                                    opacity={categoryMarkIsDimmed(entry.name) ? 0.35 : 1}
                                    stroke={categoryMarkIsSelected(entry.name) ? '#fff' : 'none'}
                                    strokeWidth={categoryMarkIsSelected(entry.name) ? 2 : 0}
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
                        {showEmbeddedRechartsLegend && (
                            <Legend content={renderInteractiveLegend} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ overflow: 'visible' }} />
                        )}
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
                        <Tooltip shared={false} cursor={{ fill: 'transparent' }} formatter={tooltipFormatter} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Line type="stepBefore" dataKey="value" name={yAxisDisplayTitle} stroke={mainColor} strokeWidth={3} dot={{ r: 3, fill: mainColor, strokeWidth: 2, stroke: isDark ? 'var(--bg-elevated)' : '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={animation} />
                    </LineChart>
                );
            case 'rangeBar':
                // The values for RangeBar are guaranteed to be [[min, max]] arrays from the backend
                // Recharts Bar handles array dataKeys inherently by drawing from index 0 to index 1
                return (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 25 }} className="chart-category-clickable">
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
                        <Tooltip shared={false} cursor={{ fill: isDark ? 'var(--bg-tertiary)' : '#f1f5f9' }} formatter={(val) => {
                            if (Array.isArray(val)) {
                                return `${formatNumber(val[0])} - ${formatNumber(val[1])}`
                            }
                            return formatNumber(val);
                        }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                        <Bar
                            dataKey="value"
                            fill={mainColor}
                            radius={[4, 4, 4, 4]}
                            isAnimationActive={animation}
                            onClick={handleRechartsCategoryClick}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={opts.useMultipleColors ? palette[index % palette.length] : mainColor}
                                    opacity={categoryMarkIsDimmed(entry.name) ? 0.35 : 1}
                                    stroke={categoryMarkIsSelected(entry.name) ? '#fff' : 'none'}
                                    strokeWidth={categoryMarkIsSelected(entry.name) ? 2 : 0}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                );
            case 'combination':
                // Combination plot: A ComposedChart showing Area behind a bold Line
                return (
                    <ComposedChart data={chartData} margin={{ ...chartPlotMargin, bottom: chartBottomMargin }} className="chart-category-clickable">
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
                        <Tooltip shared={false} cursor={{ fill: '#f1f5f9' }} formatter={tooltipFormatter} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="value" name="Volume/Area" fill={mainColor} fillOpacity={0.2} stroke="none" isAnimationActive={animation} />
                        <Line type="monotone" dataKey="value" name={opts.yLabel || graphDefinition.y_axis || 'Trend'} stroke={palette[1] || mainColor} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={animation} onClick={handleRechartsCategoryClick} />
                    </ComposedChart>
                );
            case 'kpiCard': {
                const kpiWidth = dimensions.width || opts.width || 240;
                const kpiHeight = dimensions.height || opts.height || 130;
                const scaleW = kpiWidth / 240;
                const scaleH = kpiHeight / 130;
                const scale = Math.min(scaleW, scaleH);

                if (chartData.length > 1) {
                    const cols = Math.min(3, chartData.length);
                    const itemScale = scale * 0.95;
                    return (
                        <div
                            className="kpi-comparison-grid"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                gap: '12px',
                                width: '100%',
                                height: '100%',
                                padding: '8px',
                                boxSizing: 'border-box',
                                overflowY: 'auto'
                            }}
                        >
                            {chartData.map((entry, idx) => {
                                const solved = resolveMeasureMetadata(entry.name, measures, true);
                                const displayVal = formatCustomMeasureValue(entry.value, solved);
                                const entryLabel = solved.displayName || entry.name;
                                const entryDesc = solved.description || '';

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            padding: '12px',
                                            boxSizing: 'border-box',
                                            background: isDark ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)' : 'linear-gradient(135deg, rgba(248, 250, 252, 0.9) 0%, rgba(241, 245, 249, 1) 100%)',
                                            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                                            borderRadius: '8px',
                                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.01)',
                                            minWidth: 0,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: `${Math.max(9, Math.min(13, Math.round(10 * itemScale)))}px`,
                                                fontWeight: 600,
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                            title={entryLabel}
                                        >
                                            {entryLabel}
                                        </div>
                                        <div
                                            style={{
                                                color: palette[idx % palette.length] || mainColor,
                                                fontSize: `${Math.max(16, Math.min(28, Math.round(20 * itemScale)))}px`,
                                                fontWeight: 700,
                                                margin: '4px 0',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {displayVal}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: `${Math.max(8, Math.min(11, Math.round(9 * itemScale)))}px`,
                                                color: isDark ? '#64748b' : '#94a3b8',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                            title={entryDesc}
                                        >
                                            {entryDesc}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                const quickMeasureField = Array.isArray(opts.measure_fields)
                    ? opts.measure_fields.find((m) => m?.template_id)
                    : null;
                const isQuickMeasureKpi = Boolean(quickMeasureField);
                const quickTemplateId = String(quickMeasureField?.template_id || '').toLowerCase();
                const quickMeasureName = opts.measureName || opts.title || quickMeasureField?.template_id;
                const isPercentageMeasure = /percent|percentage|growth|mom|qoq|cagr|over_month|over_quarter/.test(quickTemplateId)
                    || /%\s*$|\*\s*100/.test(String(opts.measureFormula || ''));

                const kpiLabel = opts.xLabel || (matchedMeasure ? matchedMeasure.display_name : null) || quickMeasureName || graphDefinition.x_axis || 'Metric';
                const showKpiFilter = graphDefinition.options?.showLegend !== false && rawLegendValues.length > 1;
                const kpiCompact = !showZoomControls;

                const kpiValue = isQuickMeasureKpi && chartData.length === 1
                    ? chartData[0].value
                    : totalValue;

                const displayKpiValue = matchedMeasure
                    ? formatCustomMeasureValue(kpiValue, matchedMeasure)
                    : (isPercentageMeasure && typeof kpiValue === 'number'
                        ? formatPercentNumber(kpiValue)
                        : formatNumber(kpiValue));

                const kpiDesc = matchedMeasure?.description || (isQuickMeasureKpi ? 'Quick Measure calculation' : 'No description available');

                return (
                    <div
                        className={`kpi-card-visual${kpiCompact ? ' kpi-card-visual--compact' : ''}`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                            padding: '16px',
                            boxSizing: 'border-box',
                            background: isDark ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)' : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 1) 100%)',
                            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                            overflow: 'hidden'
                        }}
                    >
                        <div className="kpi-card-visual-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', width: '100%' }}>
                            {/* Header: Display Name */}
                            <div className="kpi-card-visual-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span
                                    className="kpi-card-visual-kicker"
                                    style={{
                                        fontSize: `${Math.max(11, Math.min(16, Math.round(12 * scale)))}px`,
                                        fontWeight: 600,
                                        color: isDark ? '#94a3b8' : '#64748b',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}
                                >
                                    {kpiLabel}
                                </span>
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
                                            categoryColorMap={categoryColorMap}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Main Value: Formatted Result */}
                            <div className="kpi-card-visual-metrics" style={{ margin: '8px 0', flex: 1, display: 'flex', alignItems: 'center' }}>
                                <div
                                    className="kpi-card-visual-value"
                                    style={{
                                        color: mainColor || (isDark ? '#3b82f6' : '#1d4ed8'),
                                        fontSize: `${Math.max(20, Math.min(54, Math.round(32 * scale)))}px`,
                                        fontWeight: 700,
                                        letterSpacing: '-0.02em',
                                        lineHeight: 1.1
                                    }}
                                >
                                    {displayKpiValue}
                                </div>
                            </div>

                            {/* Footer: Description */}
                            <div
                                className="kpi-card-visual-footer"
                                title={kpiDesc}
                                style={{
                                    fontSize: `${Math.max(9, Math.min(13, Math.round(10 * scale)))}px`,
                                    color: isDark ? '#64748b' : '#94a3b8',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    marginTop: '4px'
                                }}
                            >
                                {kpiDesc}
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
                                                categoryColorMap={categoryColorMap}
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
                        <Tooltip shared={false} cursor={{ strokeDasharray: '3 3' }} formatter={tooltipFormatter} />
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
                        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: chartFillBackground, borderRadius: chartNoFill ? 0 : 6 }}>
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
                        <Tooltip shared={false} formatter={tooltipFormatter} />
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
                            className="bi-text-visual-editor"
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
                        className={`bi-text-visual-body${!textContent && !isViewOnly ? ' bi-text-visual-body--placeholder' : ''}`}
                        onDoubleClick={() => !isViewOnly && setIsEditing(true)}
                        title={isViewOnly ? textContent : 'Double-click to edit'}
                    >
                        {textContent || (isViewOnly ? '' : 'Double-click to edit text box')}
                    </div>
                );
            case 'paginated_report':
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: chartFillBackground, border: chartNoFill ? 'none' : `1px solid ${isDark ? 'var(--border-primary)' : '#e2e8f0'}`, borderRadius: chartNoFill ? '0' : '4px', overflow: 'hidden' }}>
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

    const getActionableEmptyMessage = () => {
        if (isCrossFilterActive) {
            return 'No data matches the current filter settings. Try clearing some filters.';
        }
        const hasMeasures = Boolean(graphDefinition.y_axis) || (Array.isArray(graphDefinition.options?.measure_fields) && graphDefinition.options.measure_fields.length > 0);
        const hasDimensions = Boolean(graphDefinition.x_axis) || (Array.isArray(graphDefinition.options?.dimensions) && graphDefinition.options.dimensions.length > 0);
        const type = graphDefinition.graph_type;

        if (!hasMeasures) {
            return 'Add a Measure to see values';
        }
        if (!hasDimensions) {
            if (type === 'kpiCard' || type === 'metricCard' || type === 'gauge') {
                return 'No data available for this metric.';
            }
            if (type === 'line' || type === 'area' || type === 'sparkline') {
                return 'Add a Date field to view trends';
            }
            return 'Add a Dimension to compare results';
        }
        return 'No data available for this visual configuration.';
    };

    const renderChartMessage = (message, className = 'chart-empty') => {
        const isCustomEmpty = [
            'Add a Measure to see values',
            'Add a Date field to view trends',
            'Add a Dimension to compare results',
            'No data available for this metric.'
        ].includes(message);

        if (isCustomEmpty) {
            const activeTheme = reportTheme || graphDefinition.options?.reportTheme || 'theme_default';
            const isDarkTheme = globalIsDark || activeTheme === 'theme_dark' || className.includes('dark');
            let icon = null;
            let title = message;
            let subtitle = 'Drag a field from the Fields Pane and drop it here to visualize.';
            let borderThemeColor = '#cbd5e1';
            let iconBg = '#f1f5f9';

            if (message === 'Add a Measure to see values') {
                borderThemeColor = isDarkTheme ? '#1e3a8a' : '#bfdbfe';
                iconBg = isDarkTheme ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)';
                icon = (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                    </svg>
                );
            } else if (message === 'Add a Date field to view trends') {
                borderThemeColor = isDarkTheme ? '#831843' : '#fbcfe8';
                iconBg = isDarkTheme ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.08)';
                icon = (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                );
            } else if (message === 'Add a Dimension to compare results') {
                borderThemeColor = isDarkTheme ? '#064e3b' : '#a7f3d0';
                iconBg = isDarkTheme ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)';
                icon = (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                );
            } else if (message === 'No data available for this metric.') {
                borderThemeColor = isDarkTheme ? '#475569' : '#cbd5e1';
                iconBg = isDarkTheme ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.08)';
                icon = (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                    </svg>
                );
                subtitle = 'The semantic model returned no values or failed to calculate this measure.';
            }

            return (
                <div
                    className="chart-wrapper chart-wrapper--state"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        padding: '16px',
                        boxSizing: 'border-box'
                    }}
                >
                    <div
                        className="bi-smart-empty-card"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            width: '100%',
                            height: '100%',
                            border: `2px dashed ${borderThemeColor}`,
                            borderRadius: '12px',
                            padding: '24px 16px',
                            backgroundColor: isDarkTheme ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.5)',
                            transition: 'all 0.3s ease',
                            cursor: 'default',
                            boxSizing: 'border-box',
                            userSelect: 'none'
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                backgroundColor: iconBg,
                                marginBottom: '16px',
                                transition: 'transform 0.25s ease'
                            }}
                        >
                            {icon}
                        </div>
                        <h4
                            style={{
                                margin: '0 0 8px 0',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: isDarkTheme ? '#f1f5f9' : '#1e293b'
                            }}
                        >
                            {title}
                        </h4>
                        <p
                            style={{
                                margin: 0,
                                fontSize: '11px',
                                color: isDarkTheme ? '#94a3b8' : '#64748b',
                                lineHeight: '1.4',
                                maxWidth: '280px'
                            }}
                        >
                            {subtitle}
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="chart-wrapper chart-wrapper--state">
                <div className={className}>{message}</div>
            </div>
        );
    };

    const noDataRenderTypes = new Set(['text', 'shape', 'button', 'image', 'influencers', 'qna', 'paginated_report', 'power_app', 'power_automate', 'smart_narrative']);
    if (!noDataRenderTypes.has(graphDefinition.graph_type)) {
        if (loading && !data && !crossFilterRefreshing) return renderChartMessage('Loading chart...', 'chart-loading');
        if (error && !data && !crossFilterRefreshing) return renderChartMessage(error, 'chart-empty chart-error');
        if (configHint && !data && !crossFilterRefreshing) return renderChartMessage(configHint);
        if (hasNoChartRows) {
            if (loading || crossFilterRefreshing) return renderChartMessage('Loading chart...', 'chart-loading');
            return renderChartMessage(getActionableEmptyMessage());
        }
    } else {
        if (error && !data) return null;
    }

    // Use effectiveDimFields: falls back to [x_axis] for auto-generated charts that haven't used the field-well
    const canDrill = effectiveDimFields.length > 1 && graphDefinition.graph_type !== 'table';
    const isHierarchyActive = drillLevelIndex > 0 || drillPath.length > 0 || expandModeActive;
    const isMetricCard = graphDefinition.graph_type === 'metricCard';
    const isKpiCard = graphDefinition.graph_type === 'kpiCard';
    const isSparkline = graphDefinition.graph_type === 'sparkline';
    const isCardVisual = isKpiCard || isMetricCard;
    const hideTopLegendOnCard = (isMetricCard || isKpiCard) && hideInternalStats;

    const showCompactLegend =
        graphDefinition.options?.showLegend !== false
        && !isMicro
        && showLegendFilterRow
        && !showDrillFilter
        && !hideTopLegendOnCard
        && !isFocusView
        && !suppressCanvasLegendRail;

    const compactLegendElement = showCompactLegend ? (
        <LegendComponent
            dimension={legendFilterDimension}
            values={rawLegendValues}
            maxItems={rawLegendValues.length > 8 ? 8 : 16}
            variant={chartLegendVariant}
            filterScope="visual"
            visualFilters={visualFilterRules}
            onVisualFilterChange={applyVisualDimensionFilter}
            onFilterClear={handleLegendFilterClear}
            colorPalette={reportPalette}
            categoryColorMap={categoryColorMap}
        />
    ) : null;

    const compactLegendPortal =
        legendInHeader && compactLegendElement && legendHeaderHost
            ? createPortal(compactLegendElement, legendHeaderHost)
            : null;

    const showHeaderZoomToolbar = Boolean(zoomToolbarContainer);
    const zoomToolbarNode = (showZoomControls && canZoom) || showHeaderZoomToolbar ? (
        <div className={`chart-zoom-toolbar ${showHeaderZoomToolbar ? 'chart-zoom-toolbar-header' : ''} ${showZoomControls && !zoomToolbarContainer ? 'chart-zoom-toolbar-focus' : ''}`}>
            <div className="chart-zoom-controls-group">
                <button type="button" className="chart-zoom-btn" onClick={zoomOut} disabled={!canZoom || zoomLevel <= 1} aria-label="Zoom out">−</button>
                <span className="chart-zoom-value">{Math.round(zoomLevel * 100)}%</span>
                <button type="button" className="chart-zoom-btn" onClick={zoomIn} disabled={!canZoom || zoomLevel >= MAX_ZOOM} aria-label="Zoom in">+</button>
                <button type="button" className="chart-zoom-reset" onClick={resetZoom} disabled={!canZoom || zoomLevel === 1}>Reset</button>
            </div>
            {showHeaderZoomToolbar && (graphDefinition.x_axis || graphDefinition.y_axis) && (
                <>
                    <span className="chart-zoom-toolbar-divider" aria-hidden="true" />
                    <div className="chart-zoom-meta-group">
                        {graphDefinition.x_axis && (
                            <div className="chart-zoom-meta">
                                <span className="chart-zoom-meta-label">FIELD</span>
                                <span className="chart-zoom-meta-value">{graphDefinition.x_axis}</span>
                            </div>
                        )}
                        {graphDefinition.y_axis && (
                            <div className="chart-zoom-meta">
                                <span className="chart-zoom-meta-label">METRIC</span>
                                <span className="chart-zoom-meta-value">{graphDefinition.y_axis}</span>
                            </div>
                        )}
                    </div>
                </>
            )}
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
    const isDark = globalIsDark || activeTheme === 'theme_dark';
    const axisTitleColor = isDark ? '#f1f5f9' : '#4b5563';
    const chartNoFill = isChartNoFill(chartOptions, reportNoFill);
    const chartFillBackground = resolveChartFillBackground(
        chartOptions,
        isDark ? 'var(--bg-secondary)' : '#ffffff',
        reportNoFill
    );

    return (
        <>
            {compactLegendPortal}
            <div
                ref={containerRef}
                className={`chart-wrapper ${isDark ? 'dark-theme ' : ''}${isCompactLayout ? 'chart-wrapper--compact' : ''}${isFocusView ? ' chart-wrapper--focus' : ''}${isBarChartVisual ? ' chart-wrapper--bar' : ''}${isPieDonutChart ? ' chart-wrapper--pie-donut' : ''}${isPieDonutChart && scShowLabels ? ' chart-wrapper--pie-labels-visible' : ''}${isHierarchyActive ? ' chart-wrapper--drill-active' : ''}${hasActiveChartFilter ? ' chart-wrapper--filtering' : ''}${crossFilterRefreshing ? ' chart-wrapper--crossfilter-refresh' : ''}${isMetricCard ? ' chart-wrapper--metric-card' : ''}${isKpiCard ? ' chart-wrapper--kpi-card' : ''}${isSparkline ? ' chart-wrapper--sparkline' : ''}${legendInHeader ? ' chart-wrapper--legend-in-header' : ''}${chartNoFill ? ' chart-wrapper--no-fill' : ''}`}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: chartFillBackground,
                    padding: isMicro ? '2px' : (isCompactLayout || isCardVisual ? '0' : '4px'),
                    borderRadius: chartNoFill ? '0' : '4px',
                    overflow: (isPieDonutChart && scShowLabels && !isDashboardCanvas) ? 'visible' : 'hidden',
                }}>
                {chartNotice && (
                    <div className="chart-inline-notice" role="status" aria-live="polite">
                        {chartNotice}
                    </div>
                )}
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
                            if (drillHistory.length > 0) {
                                const prevState = drillHistory[drillHistory.length - 1] || {};
                                updateDrillState({
                                    drillHistory: drillHistory.slice(0, -1),
                                    drillPath: Array.isArray(prevState.drillPath) ? prevState.drillPath : [],
                                    drillLevelIndex: Number.isFinite(prevState.drillLevelIndex) ? prevState.drillLevelIndex : 0,
                                    expandModeActive: Boolean(prevState.expandModeActive),
                                    drillModeActive: Boolean(prevState.drillModeActive),
                                });
                                return;
                            }

                            const hasStateToRewind = drillPath.length > 0 || drillLevelIndex > 0 || expandModeActive;
                            if (!hasStateToRewind) return;

                            const nextPath = drillPath.length > 0 ? drillPath.slice(0, -1) : drillPath;
                            const nextLevelIndex = Math.max(0, drillLevelIndex - 1);
                            const nextExpandMode = nextPath.length > 0 || nextLevelIndex > 0;

                            updateDrillState({
                                drillPath: nextPath,
                                drillLevelIndex: nextLevelIndex,
                                expandModeActive: nextExpandMode,
                            });
                        }}
                        onDrillDown={() => {
                            if (drillLevelIndex < effectiveDimFields.length - 1) {
                                const historyEntry = {
                                    drillPath,
                                    drillLevelIndex,
                                    expandModeActive,
                                    drillModeActive,
                                };
                                updateDrillState({
                                    drillHistory: [...drillHistory, historyEntry].slice(-30),
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
                                drillHistory: [],
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
                {!legendInHeader && compactLegendElement && !isPieDonutChart && (
                    <div
                        className="chart-legend-filter-row"
                        style={{
                            margin: isCompactLayout ? '2px 0 0' : '4px 0 2px',
                            display: 'flex',
                            justifyContent: 'center',
                            width: '100%',
                            flexShrink: 0,
                        }}
                    >
                        {compactLegendElement}
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
                    {isPieDonutChart && !isMicro && pieDonutSliceModel && isFocusView && (
                        <PieDonutControls
                            scShowLabels={scShowLabels}
                            onShowLabelsChange={setScShowLabels}
                            scGroupOthers={scGroupOthers}
                            onGroupOthersChange={setScGroupOthers}
                            scShowAll={scShowAll}
                            onShowAllChange={handlePieShowAllChange}
                            scTopN={scTopN}
                            onTopNChange={setScTopN}
                            scLabelSide={scLabelSide}
                            onLabelSideChange={setScLabelSide}
                            sliceModel={pieDonutSliceModel}
                            scTotalPoints={scTotalPoints}
                            formatNumber={(n) => formatChartNumber(n, 'compact')}
                            calloutLabelStats={pieCalloutLabelStats}
                            isFocusView={isFocusView}
                            centerLegend={
                                isFocusView
                                    && graphDefinition.options?.showLegend !== false
                                    && showLegendFilterRow
                                    ? (
                                        <LegendComponent
                                            dimension={legendFilterDimension}
                                            values={rawLegendValues}
                                            maxItems={6}
                                            variant={chartLegendVariant}
                                            filterScope="visual"
                                            visualFilters={visualFilterRules}
                                            onVisualFilterChange={applyVisualDimensionFilter}
                                            onFilterClear={handleLegendFilterClear}
                                            colorPalette={reportPalette}
                                            categoryColorMap={categoryColorMap}
                                        />
                                    )
                                    : null
                            }
                        />
                    )}
                    <div
                        ref={zoomViewportRef}
                        className={`chart-zoom-viewport${isCardVisual ? ' chart-zoom-viewport--card' : ''}${crossFilterRefreshing ? ' chart-zoom-viewport--refreshing' : ''}${hasVisualCategoryFilter || hasActiveChartFilter ? ' chart-zoom-viewport--filtered' : ''}${isPieDonutChart && scShowLabels ? ' chart-zoom-viewport--pie-labels' : ''}`}
                        style={{
                            flex: 1,
                            minHeight: 0,
                            width: '100%',
                            overflow: canZoom && zoomLevel > 1
                                ? 'auto'
                                : (isPieDonutChart && scShowLabels && !isDashboardCanvas ? 'visible' : 'hidden'),
                        }}
                        onMouseDown={(e) => {
                            if (e.target?.closest?.('.sc-controls-bar, .sc-toggle, .sc-slider-label, input[type="checkbox"], input[type="range"]')) {
                                e.stopPropagation();
                                return;
                            }
                            if (!isDashboardCanvas && e.target?.closest?.('.recharts-wrapper, .recharts-surface, .sc-chart-area, svg')) {
                                e.stopPropagation();
                            }
                        }}
                    >
                        {crossFilterRefreshing && <div className="chart-crossfilter-shimmer" aria-hidden="true" />}
                        {isCardVisual ? (
                            <div className="chart-card-visual-slot">
                                {renderChart()}
                            </div>
                        ) : isPieDonutChart ? (
                            <div style={{ width: canZoom ? `${zoomLevel * 100}%` : '100%', height: canZoom ? `${zoomLevel * 100}%` : '100%', minWidth: '100%', minHeight: 0 }}>
                                {renderChart()}
                            </div>
                        ) : (() => {
                            const isScrollableBarFamily = ['column', 'stackedColumn', 'histogram'].includes(graphDefinition.graph_type);
                            const hasScroll = isScrollableBarFamily && Array.isArray(renderedChartData) && renderedChartData.length > 10;
                            const barSlotWidth = isFocusView ? 65 : 45;
                            const dynamicChartWidth = hasScroll ? `${renderedChartData.length * barSlotWidth}px` : '100%';
                            return (
                                <div
                                    style={{
                                        width: canZoom ? `${zoomLevel * 100}%` : '100%',
                                        height: canZoom ? `${zoomLevel * 100}%` : '100%',
                                        minWidth: '100%',
                                        minHeight: '100%',
                                        overflowX: hasScroll ? 'auto' : 'hidden',
                                        overflowY: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: canZoom ? `${zoomLevel * 100}%` : dynamicChartWidth,
                                            minWidth: '100%',
                                            height: '100%',
                                        }}
                                    >
                                        <ResponsiveContainer width="100%" height="100%">
                                            {renderChart()}
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    {xAxisFooterTitle ? (
                        <div
                            className="chart-axis-title chart-axis-title--x"
                            title={xAxisFooterTitle}
                            style={{
                                paddingTop: isDashboardCanvas ? 0 : (barChartFooterLayout?.footerGap ?? 2),
                                fontSize: isFocusView ? 13 : undefined,
                            }}
                        >
                            {xAxisFooterTitle}
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
};

export default DynamicChart;
