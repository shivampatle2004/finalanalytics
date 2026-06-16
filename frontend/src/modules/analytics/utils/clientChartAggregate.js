/**
 * Instant client-side chart aggregation from dataset preview rows.
 * Used to paint charts immediately while the server aggregates the full dataset.
 */

function normalizeAgg(agg) {
    const raw = String(agg || 'sum').trim().toLowerCase();
    if (raw === 'avg') return 'mean';
    if (raw === 'none') return 'count';
    return raw;
}

function toNumber(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = String(value).replace(/[$€£¥,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function isBlank(value) {
    if (value == null) return true;
    const s = String(value).trim();
    return s === '' || s.toLowerCase() === 'nan';
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ dimensionFields?: string[], measureFields?: Array<{column?: string, aggregation?: string}>, xAxis?: string, yAxis?: string, aggregation?: string }} config
 * @returns {{ labels: string[], values: number[], isPreview: true } | null}
 */
export function aggregateChartPreview(rows, config = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const dimensionFields = Array.isArray(config.dimensionFields)
        ? config.dimensionFields.filter((d) => d && String(d).trim())
        : [];
    const measureFields = Array.isArray(config.measureFields)
        ? config.measureFields.filter((m) => m && m.column && String(m.column).trim())
        : [];

    const dimension = dimensionFields[0] || config.xAxis || null;
    const measureField = measureFields[0] || (config.yAxis ? { column: config.yAxis, aggregation: config.aggregation } : null);
    if (!dimension || !measureField?.column) return null;

    const measureCol = String(measureField.column);
    const agg = normalizeAgg(measureField.aggregation || config.aggregation);

    const groups = new Map();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        if (isBlank(row[dimension]) && isBlank(row[measureCol])) continue;
        const key = isBlank(row[dimension]) ? 'Unknown' : String(row[dimension]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    if (groups.size === 0) return null;

    const entries = [];
    for (const [label, groupRows] of groups) {
        let value = 0;
        if (agg === 'count') {
            value = groupRows.length;
        } else {
            const nums = groupRows.map((r) => toNumber(r[measureCol])).filter((n) => n != null);
            if (agg === 'sum') value = nums.reduce((a, b) => a + b, 0);
            else if (agg === 'mean') value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
            else if (agg === 'min') value = nums.length ? Math.min(...nums) : 0;
            else if (agg === 'max') value = nums.length ? Math.max(...nums) : 0;
            else value = nums.reduce((a, b) => a + b, 0);
        }
        entries.push({ label, value });
    }

    entries.sort((a, b) => b.value - a.value);

    return {
        labels: entries.map((e) => e.label),
        values: entries.map((e) => e.value),
        isPreview: true,
    };
}

export function previewRowsToChartData(previewResult) {
    if (!previewResult || !Array.isArray(previewResult.labels)) return [];
    return previewResult.labels.map((label, index) => ({
        name: String(label),
        value: previewResult.values?.[index] ?? 0,
    }));
}
