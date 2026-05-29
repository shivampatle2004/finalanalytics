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

/** Stable category color from a theme/report palette (same value → same color). */
export const getCategoryColor = (value, fallbackIndex = 0, palette = VIBRANT_PALETTE) => {
    const colors = Array.isArray(palette) && palette.length > 0 ? palette : VIBRANT_PALETTE;
    if (value === undefined || value === null) {
        return colors[Math.abs(fallbackIndex) % colors.length];
    }
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
};
