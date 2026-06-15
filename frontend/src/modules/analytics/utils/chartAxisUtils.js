/** Display labels for aggregation functions on chart axes and tooltips. */
const AGG_DISPLAY = {
    SUM: 'Sum',
    AVG: 'Average',
    MEAN: 'Average',
    COUNT: 'Count',
    MIN: 'Min',
    MAX: 'Max',
    NONE: 'Record count',
};

export const normalizeAggregation = (agg) => {
    const u = String(agg || 'SUM').trim().toUpperCase();
    if (u === 'MEAN') return 'AVG';
    if (u === 'NONE') return 'NONE';
    return u;
};

export const formatMeasureExpression = (expr) => {
    const raw = String(expr || '').trim();
    if (/record count/i.test(raw)) return raw;
    const match = raw.match(/^(\w+)\s*\((.+)\)\s*$/);
    if (!match) return raw;
    const agg = normalizeAggregation(match[1]);
    if (agg === 'NONE') return 'Record count';
    const col = match[2].trim();
    return `${AGG_DISPLAY[agg] || agg} of ${col}`;
};

/** Resolve primary measure from field-well or legacy y_axis + aggregation. */
export const getMeasureConfig = (graphDefinition) => {
    const opts = graphDefinition?.options || {};
    const measures = Array.isArray(opts.measure_fields) ? opts.measure_fields : [];
    const first = measures.find((m) => m?.column && String(m.column).trim());
    if (first) {
        return {
            column: String(first.column).trim(),
            aggregation: normalizeAggregation(first.aggregation || graphDefinition?.aggregation),
        };
    }
    const y = graphDefinition?.y_axis;
    if (y && String(y).trim()) {
        return {
            column: String(y).trim(),
            aggregation: normalizeAggregation(graphDefinition?.aggregation),
        };
    }
    return null;
};

export const getMeasureExpression = (graphDefinition) => {
    const opts = graphDefinition?.options || {};
    if (opts?.axis_mapping?.y_axis) return String(opts.axis_mapping.y_axis);
    const m = getMeasureConfig(graphDefinition);
    if (!m) return null;
    if (m.aggregation === 'NONE') return 'Record count';
    return `${m.aggregation}(${m.column})`;
};

export const getYAxisTitle = (graphDefinition, opts = null) => {
    const options = opts || graphDefinition?.options || {};
    if (options.yLabel && String(options.yLabel).trim()) return String(options.yLabel).trim();
    if (options?.axis_mapping?.y_axis) {
        const mapped = String(options.axis_mapping.y_axis);
        if (/record count/i.test(mapped)) return mapped;
        return formatMeasureExpression(mapped);
    }
    const m = getMeasureConfig(graphDefinition);
    if (m?.aggregation === 'NONE') {
        const xTitle = getXAxisTitle(graphDefinition, options);
        return xTitle ? `Record count by ${xTitle}` : 'Record count';
    }
    if (m) return `${AGG_DISPLAY[m.aggregation] || m.aggregation} of ${m.column}`;
    return graphDefinition?.y_axis || 'Value';
};

export const getXAxisTitle = (graphDefinition, opts = null) => {
    const options = opts || graphDefinition?.options || {};
    if (options.xLabel && String(options.xLabel).trim()) return String(options.xLabel).trim();
    if (options?.axis_mapping?.x_axis) return String(options.axis_mapping.x_axis).trim();
    const dims = options.dimension_fields;
    if (Array.isArray(dims) && dims[0] && String(dims[0]).trim()) return String(dims[0]).trim();
    return graphDefinition?.x_axis || '';
};

/** Ensure API receives measure_fields aligned with y_axis / aggregation. */
export const buildMeasureFieldsForApi = (graphDefinition, cleanMeasureFields, yAxis, aggregation) => {
    if (Array.isArray(cleanMeasureFields) && cleanMeasureFields.length > 0) {
        return cleanMeasureFields
            .filter((m) => m?.column && String(m.column).trim())
            .map((m) => ({
                ...m,
                column: String(m.column).trim(),
                aggregation: String(normalizeAggregation(m.aggregation || aggregation)).toLowerCase() === 'none'
                    ? 'none'
                    : normalizeAggregation(m.aggregation || aggregation),
            }));
    }
    if (yAxis && String(yAxis).trim()) {
        return [{
            column: String(yAxis).trim(),
            aggregation: normalizeAggregation(aggregation),
        }];
    }
    return [];
};

/** Coerce API rows so Recharts always plots numeric values. */
export const coerceChartRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        const raw = row?.value;
        let value = raw;
        if (typeof raw === 'string') {
            const cleaned = raw.replace(/[$€£¥,\s]/g, '');
            value = parseFloat(cleaned);
        } else {
            value = Number(raw);
        }
        if (!Number.isFinite(value)) value = 0;
        return {
            ...row,
            name: row?.name != null ? String(row.name) : '',
            value,
        };
    });
};

/**
 * @param {'compact'|'axis'|'full'} mode
 * compact = data labels; axis = tick marks; full = tooltips
 */
export const formatChartNumber = (num, mode = 'compact') => {
    if (num == null || !Number.isFinite(Number(num))) return '–';
    const n = Number(num);
    if (mode === 'full') {
        return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    if (mode === 'axis') {
        if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
        if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
        if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
        return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
