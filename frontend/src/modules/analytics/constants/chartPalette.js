/**
 * Shared palette for Format → Chart Color swatches and default series colors.
 */
export const VIBRANT_PALETTE = [
    '#6366F1',
    '#10B981',
    '#F59E0B',
    '#EC4899',
    '#06B6D4',
    '#8B5CF6',
    '#F97316',
    '#14B8A6',
    '#1e293b',
    '#DC2626',
    '#84CC16',
    '#0EA5E9',
    '#EAB308',
    '#D946EF',
    '#22C55E',
    '#64748B',
    '#F43F5E',
    '#0891B2',
    '#7C3AED',
    '#EA580C',
    '#0D9488',
    '#BE185D',
    '#4ADE80',
    '#C026D3',
];

/** Whether the visual uses a transparent chart/card fill (no background layer). */
export const isChartNoFill = (options = {}, reportNoFill = false) => (
    reportNoFill === true || options?.noFill === true
);

/** Resolve chart/container fill from saved visual options. */
export const resolveChartFillBackground = (options = {}, fallback = '#ffffff', reportNoFill = false) => {
    if (isChartNoFill(options, reportNoFill)) return 'transparent';
    if (typeof options?.bgColor === 'string' && options.bgColor.trim()) return options.bgColor;
    return fallback;
};

/** Category color by position in the theme palette (unique per index when count ≤ palette length). */
export const getCategoryColor = (value, fallbackIndex = 0, palette = VIBRANT_PALETTE) => {
    const colors = Array.isArray(palette) && palette.length > 0 ? palette : VIBRANT_PALETTE;
    const idx = Math.abs(Number(fallbackIndex) || 0);
    return colors[idx % colors.length];
};

/**
 * Assigns each category a distinct palette color in first-seen order.
 * Re-used across chart series and legend chips for the same visual.
 */
export const buildCategoryColorMap = (orderedNames, palette = VIBRANT_PALETTE) => {
    const colors = Array.isArray(palette) && palette.length > 0 ? palette : VIBRANT_PALETTE;
    const map = new Map();
    const seen = new Set();
    let colorIndex = 0;
    for (const raw of orderedNames || []) {
        const name = String(raw ?? '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        map.set(name, colors[colorIndex % colors.length]);
        colorIndex += 1;
    }
    return map;
};

/** Resolve color by category name map, then fall back to index. */
export const resolveCategoryColor = (colorMap, value, fallbackIndex = 0, palette = VIBRANT_PALETTE) => {
    const key = String(value ?? '').trim();
    if (colorMap instanceof Map && key && colorMap.has(key)) {
        return colorMap.get(key);
    }
    return getCategoryColor(value, fallbackIndex, palette);
};
