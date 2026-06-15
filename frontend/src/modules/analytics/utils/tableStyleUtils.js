/** Default table visual styling (stored in visual options.tableStyle). */
export const DEFAULT_TABLE_STYLE = {
    fontSize: 14,
    cellPaddingX: 16,
    cellPaddingY: 12,
    rowHeight: 0,
    headerBg: '',
    headerText: '',
    rowBg: '',
    altRowBg: '',
    hoverRowBg: '',
    borderColor: '',
    cellTextColor: '',
    stripedRows: true,
    stickyHeader: true,
    wrapText: true,
    textAlign: 'left',
    minColumnWidth: 72,
    columnWidths: {},
};

const THEME_DEFAULTS_LIGHT = {
    borderColor: '#e5e7eb',
    headerBg: '#f9fafb',
    headerText: '#374151',
    rowBg: '#ffffff',
    altRowBg: '#f8fafc',
    hoverRowBg: '#f3f4f6',
    cellTextColor: '#4b5563',
};

const THEME_DEFAULTS_DARK = {
    borderColor: '#334155',
    headerBg: '#0f172a',
    headerText: '#f1f5f9',
    rowBg: 'transparent',
    altRowBg: '#1e293b',
    hoverRowBg: '#1e293b',
    cellTextColor: '#cbd5e1',
};

export function mergeTableStyle(raw = {}) {
    return {
        ...DEFAULT_TABLE_STYLE,
        ...(raw && typeof raw === 'object' ? raw : {}),
        columnWidths: {
            ...DEFAULT_TABLE_STYLE.columnWidths,
            ...(raw?.columnWidths && typeof raw.columnWidths === 'object' ? raw.columnWidths : {}),
        },
    };
}

export function resolveTableStyle(rawStyle, { isDark = false } = {}) {
    const theme = isDark ? THEME_DEFAULTS_DARK : THEME_DEFAULTS_LIGHT;
    const style = mergeTableStyle(rawStyle);

    const pick = (key) => (style[key] && String(style[key]).trim() !== '' ? style[key] : theme[key]);

    const fontSize = Math.max(10, Math.min(22, Number(style.fontSize) || DEFAULT_TABLE_STYLE.fontSize));
    const cellPaddingX = Math.max(4, Math.min(48, Number(style.cellPaddingX) || DEFAULT_TABLE_STYLE.cellPaddingX));
    const cellPaddingY = Math.max(4, Math.min(32, Number(style.cellPaddingY) || DEFAULT_TABLE_STYLE.cellPaddingY));
    const rowHeight = Math.max(0, Math.min(80, Number(style.rowHeight) || 0));
    const minColumnWidth = Math.max(40, Math.min(400, Number(style.minColumnWidth) || DEFAULT_TABLE_STYLE.minColumnWidth));

    const textAlign = ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left';

    return {
        ...style,
        fontSize,
        cellPaddingX,
        cellPaddingY,
        rowHeight,
        minColumnWidth,
        textAlign,
        borderColor: pick('borderColor'),
        headerBg: pick('headerBg'),
        headerText: pick('headerText'),
        rowBg: pick('rowBg'),
        altRowBg: pick('altRowBg'),
        hoverRowBg: pick('hoverRowBg'),
        cellTextColor: pick('cellTextColor'),
        cellBorderColor: isDark ? '#1e293b' : '#f3f4f6',
    };
}

export function getTableColumns(selectedVisual) {
    const cached = selectedVisual?.cached_data;
    if (cached?.is_table && Array.isArray(cached.columns) && cached.columns.length > 0) {
        return cached.columns;
    }
    const dims = selectedVisual?.options?.dimension_fields;
    if (Array.isArray(dims) && dims.length > 0) {
        return dims.filter((d) => typeof d === 'string' && d.trim() !== '');
    }
    return [];
}
