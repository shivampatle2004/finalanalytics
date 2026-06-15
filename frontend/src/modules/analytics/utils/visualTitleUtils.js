/**
 * Display title for BI visuals — strips legacy "New " prefix from defaults.
 */
export const formatVisualDisplayTitle = (title, graphType) => {
    const raw = String(title ?? '').trim();
    if (raw) {
        const stripped = raw.replace(/^new\s+/i, '').trim();
        return stripped || raw;
    }
    const type = String(graphType || 'visual').replace(/_/g, ' ').trim();
    return type ? type.toUpperCase() : 'Visual';
};

/** Default title when creating a new visual (no "New" prefix). */
export const defaultVisualTitle = (graphType) => {
    const type = String(graphType || 'visual').replace(/_/g, ' ').trim();
    return type ? type.toUpperCase() : 'Visual';
};
