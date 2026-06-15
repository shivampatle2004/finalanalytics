/**
 * aiChartContext — extract a structured chart context object from a visual.
 *
 * The AI Insights backend (POST /api/ai/explain-chart, /anomaly-detection, etc.)
 * expects a payload like:
 *   {
 *     chartType, title, dimensions: [], measures: [], aggregation,
 *     filters: [], data: [{label, value}, ...], columns?, rows?
 *   }
 */

import { buildMeasureFieldsForApi } from './chartAxisUtils';

const safeNum = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const raw = v.trim().replace(/[$€£¥,\s]/g, '');
    if (!raw) return null;
    let mult = 1;
    let numStr = raw;
    const suffix = raw.slice(-1).toUpperCase();
    if (suffix === 'K') { mult = 1e3; numStr = raw.slice(0, -1); }
    else if (suffix === 'M') { mult = 1e6; numStr = raw.slice(0, -1); }
    else if (suffix === 'B') { mult = 1e9; numStr = raw.slice(0, -1); }
    const n = Number(numStr);
    return Number.isFinite(n) ? n * mult : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cleanColumnName = (c, i) => {
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') return c.name || c.field || c.label || `col${i}`;
  return `col${i}`;
};

const cleanMeasure = (m) => {
  if (!m) return null;
  if (typeof m === 'string') return m;
  if (typeof m === 'object') return m.column || m.name || m.field || null;
  return String(m);
};

const fromLabelsValues = (labels, values) => {
  const out = [];
  for (let i = 0; i < labels.length; i += 1) {
    const val = safeNum(values?.[i]);
    if (val === null) continue;
    out.push({ label: String(labels[i]), value: val });
  }
  return out;
};

const fromMultiSeries = (labels, datasets) => {
  const out = [];
  for (let i = 0; i < labels.length; i += 1) {
    const row = { label: String(labels[i]) };
    datasets.forEach((ds, di) => {
      const key = ds?.name || ds?.label || `series${di + 1}`;
      const series = Array.isArray(ds?.values) ? ds.values : (Array.isArray(ds?.data) ? ds.data : []);
      row[key] = safeNum(series[i]);
    });
    if (row.value === undefined) {
      const firstKey = datasets[0]?.name || datasets[0]?.label || 'series1';
      if (Object.prototype.hasOwnProperty.call(row, firstKey)) {
        row.value = row[firstKey];
      }
    }
    if (row.value != null) out.push(row);
  }
  return out;
};

const fromTable = (columns, rows, dimKey, measKey) => {
  const colNames = (columns || []).map(cleanColumnName);
  const out = [];
  for (const r of rows || []) {
    if (Array.isArray(r)) {
      const obj = {};
      colNames.forEach((c, i) => { obj[c] = r[i]; });
      out.push(obj);
    } else if (r && typeof r === 'object') {
      out.push({ ...r });
    }
  }
  if (out.length > 0) {
    const sample = out[0];
    let labelKey = dimKey || null;
    let valueKey = measKey || null;
    for (const k of Object.keys(sample)) {
      if (valueKey === null && safeNum(sample[k]) !== null) valueKey = k;
      else if (labelKey === null && safeNum(sample[k]) === null) labelKey = k;
    }
    out.forEach((row) => {
      if (labelKey && row.label === undefined) row.label = String(row[labelKey] ?? '');
      if (valueKey && row.value === undefined) row.value = safeNum(row[valueKey]);
    });
  }
  return out.filter((row) => row.label != null && row.value != null);
};

function resolveDimensionFields(graph) {
  const o = graph?.options || {};
  const raw = Array.isArray(o.dimension_fields) ? o.dimension_fields : [];
  const fromOpts = raw
    .map((d) => (typeof d === 'string' ? d : (d?.column || d?.name || '')))
    .filter(Boolean);
  if (fromOpts.length) return fromOpts;
  return graph?.x_axis ? [graph.x_axis] : [];
}

function resolveMeasureFields(graph) {
  const o = graph?.options || {};
  const raw = Array.isArray(o.measure_fields) ? o.measure_fields : [];
  const fromOpts = raw.map(cleanMeasure).filter(Boolean);
  if (fromOpts.length) return fromOpts;
  return graph?.y_axis ? [graph.y_axis] : [];
}

/** Build the same graph-data request body DynamicChart uses. */
export function buildGraphDataRequest(graph) {
  if (!graph) return null;
  const o = graph.options || {};
  const dimensionFields = resolveDimensionFields(graph);
  const activeXAxis = dimensionFields[0] || graph.x_axis || '';

  const measureFieldsRaw = Array.isArray(o.measure_fields) ? o.measure_fields : [];
  const cleanMeasureFields = measureFieldsRaw
    .map((m) => (typeof m === 'string' ? { column: m, aggregation: 'SUM' } : m))
    .filter((m) => m?.column && String(m.column).trim());

  const measureFieldsForApi = buildMeasureFieldsForApi(
    graph,
    cleanMeasureFields,
    graph.y_axis,
    graph.aggregation || o.aggregation,
  );

  if (!activeXAxis && !dimensionFields.length) return null;
  if (!measureFieldsForApi.length && !graph.y_axis) return null;

  return {
    graph_type: graph.graph_type || 'bar',
    x_axis: activeXAxis,
    y_axis: graph.y_axis,
    aggregation: graph.aggregation || o.aggregation || 'sum',
    dimension_fields: dimensionFields.length ? dimensionFields : (activeXAxis ? [activeXAxis] : []),
    measure_fields: measureFieldsForApi,
    drill_filters: [],
    active_filters: {},
  };
}

export function extractChartContext(graph, opts = {}) {
  if (!graph) return null;
  const cached = graph.cached_data || {};
  const o = graph.options || {};
  const dimensions = resolveDimensionFields(graph);
  const measures = resolveMeasureFields(graph);
  const dimKey = dimensions[0];
  const measKey = measures[0];

  let data = [];
  let columns;
  let rows;

  if (cached && cached.is_table && Array.isArray(cached.rows) && Array.isArray(cached.columns)) {
    columns = (cached.columns || []).map(cleanColumnName);
    rows = cached.rows;
    data = fromTable(cached.columns, cached.rows, dimKey, measKey);
  } else if (cached && Array.isArray(cached.labels) && Array.isArray(cached.datasets) && cached.datasets.length > 0) {
    data = fromMultiSeries(cached.labels, cached.datasets);
  } else if (cached && Array.isArray(cached.labels) && Array.isArray(cached.values)) {
    data = fromLabelsValues(cached.labels, cached.values);
  } else if (Array.isArray(graph.data)) {
    data = graph.data
      .map((d) => {
        if (!d || typeof d !== 'object') return null;
        const row = { ...d };
        if (row.label === undefined && dimKey && row[dimKey] != null) row.label = String(row[dimKey]);
        if (row.value === undefined && measKey) row.value = safeNum(row[measKey]);
        if (row.value === undefined && row.name != null) row.label = String(row.name);
        if (row.value === undefined) row.value = safeNum(row.value ?? row.y);
        return row.label != null && row.value != null ? row : null;
      })
      .filter(Boolean);
  }

  const title = (o.title && String(o.title)) || (graph.title && String(graph.title))
    || (dimensions[0] && measures[0] ? `${measures[0]} by ${dimensions[0]}` : `${graph.graph_type || 'Chart'}`);

  return {
    chartType: graph.graph_type || 'bar',
    title,
    dimensions,
    measures,
    aggregation: graph.aggregation || o.aggregation || 'sum',
    filters: Array.isArray(o.filters) ? o.filters : [],
    data: data.slice(0, 250),
    columns,
    rows: Array.isArray(rows) ? rows.slice(0, 250) : undefined,
    pageName: opts.pageName || null,
    visualId: graph.id || null,
  };
}

function contextHasNumericData(ctx) {
  return Array.isArray(ctx?.data) && ctx.data.some((d) => safeNum(d?.value) != null);
}

/**
 * Ensure AI context includes live chart points — fetches graph-data when cache is empty.
 */
export async function hydrateChartContext(graph, fileId, opts = {}) {
  let ctx = extractChartContext(graph, opts);
  if (!ctx || !fileId) return ctx;
  if (contextHasNumericData(ctx)) return ctx;

  const payload = buildGraphDataRequest(graph);
  if (!payload) return ctx;

  try {
    const res = await fetch(`/analytics/api/files/${fileId}/graph-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result || result.processing) return ctx;

    let enriched = graph;
    if (graph.graph_type === 'table' && result.columns && result.rows) {
      enriched = {
        ...graph,
        cached_data: { is_table: true, columns: result.columns, rows: result.rows },
      };
    } else if (Array.isArray(result.labels) && Array.isArray(result.values)) {
      enriched = {
        ...graph,
        cached_data: {
          labels: result.labels,
          values: result.values,
          total_points: result.total_points,
        },
      };
    } else {
      return ctx;
    }
    ctx = extractChartContext(enriched, opts);
  } catch {
    /* keep best-effort ctx */
  }
  return ctx;
}

/**
 * Pick the most analysis-friendly visual on a page when no visual is selected.
 */
export function pickBestVisual(graphs) {
  if (!Array.isArray(graphs) || graphs.length === 0) return null;
  const skip = new Set(['text', 'shape', 'button', 'image', 'slicer', 'paginated_report']);
  const scored = graphs
    .filter((g) => g && g.id && !skip.has(g.graph_type))
    .map((g) => {
      const cached = g.cached_data || {};
      const hasData = (Array.isArray(cached.labels) && cached.labels.length > 0)
        || (cached.is_table && Array.isArray(cached.rows) && cached.rows.length > 0);
      const dims = resolveDimensionFields(g);
      const meas = resolveMeasureFields(g);
      let score = 0;
      if (hasData) score += 4;
      if (dims.length) score += 2;
      if (meas.length) score += 2;
      if (['bar', 'line', 'area', 'column', 'pie', 'donut'].includes(g.graph_type)) score += 1;
      return { g, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.g || null;
}
