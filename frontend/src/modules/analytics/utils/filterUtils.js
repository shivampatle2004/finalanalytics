/**
 * True when this filter dimension controls the chart's category axis (incl. "City | Region").
 */
export const dimensionAppliesToChartAxis = (dimension, xAxis) => {
    if (!dimension) return false;
    const dimNorm = String(dimension).toLowerCase().trim();
    const xNorm = String(xAxis || '').toLowerCase().trim();
    if (!xNorm) return true;
    if (dimNorm === xNorm) return true;
    if (xNorm.includes(' | ')) {
        const parts = xNorm.split(' | ').map((s) => s.trim());
        return parts.includes(dimNorm);
    }
    return false;
};

/** Normalize persisted / API filter rules to `{ field, operator, value }[]`. */
export const normalizeFilterRules = (list) => {
    let rules = list;
    if (typeof rules === 'string') {
        try {
            rules = JSON.parse(rules);
        } catch {
            return [];
        }
    }
    if (Array.isArray(rules)) {
        return rules
            .filter((f) => f?.field && String(f.field).trim())
            .map((f) => {
                const op = String(f.operator || 'equals').toLowerCase();
                return {
                    ...f,
                    field: String(f.field).trim(),
                    operator: op === 'all' ? 'all' : op,
                };
            })
            .filter((f) => f.operator && f.operator !== 'all');
    }
    if (rules && typeof rules === 'object' && rules.field && rules.operator) {
        return normalizeFilterRules([rules]);
    }
    return [];
};

/** Ensure cross-visual filter map values are always string arrays. */
export const sanitizeFilterMap = (filterMap) => {
    if (!filterMap || typeof filterMap !== 'object') return {};
    const out = {};
    for (const [dimension, values] of Object.entries(filterMap)) {
        if (!dimension) continue;
        let list = values;
        if (!Array.isArray(list)) {
            if (list == null || String(list).trim() === '') continue;
            list = [list];
        }
        const cleaned = list
            .map((v) => (v == null ? '' : String(v).trim()))
            .filter((v) => v !== '');
        if (cleaned.length > 0) out[dimension] = cleaned;
    }
    return out;
};

/** Convert visual filter rules (`{ field, operator, value }[]`) to FilterContext map shape. */
/** Convert FilterContext map shape back to visual filter rules. */
export const filterMapToFilterRules = (filterMap) => {
    const map = sanitizeFilterMap(filterMap);
    const out = [];
    for (const [field, vals] of Object.entries(map)) {
        for (const value of vals) {
            out.push({ field, operator: 'equals', value: String(value) });
        }
    }
    return out;
};

export const filterRulesToFilterMap = (rules) => {
    const out = {};
    const normalized = normalizeFilterRules(rules);
    if (!normalized.length) return out;
    for (const rule of normalized) {
        if (!rule?.field || rule.operator !== 'equals') continue;
        const val = rule.value;
        if (val == null || String(val).trim() === '') continue;
        const key = String(rule.field);
        if (!out[key]) out[key] = [];
        const str = String(val);
        if (!out[key].includes(str)) out[key].push(str);
    }
    return out;
};

export const filterMapHasValues = (filterMap) =>
    filterMap &&
    typeof filterMap === 'object' &&
    Object.keys(filterMap).some((k) => Array.isArray(filterMap[k]) && filterMap[k].length > 0);

const valuesMatch = (candidate, selectedValues) => {
    const candidateStr = String(candidate).trim().toLowerCase();
    return selectedValues.some((val) => String(val).trim().toLowerCase() === candidateStr);
};

/**
 * Generic data filtering function for OneStopAnalytics.
 * Matches active filters against either raw dataset rows or aggregated chart data structures.
 *
 * @param {Array} data - Array of records/rows to filter
 * @param {Object} filters - Active filter dictionary, e.g., { City: ["Mumbai", "Pune"] }
 * @param {string} xAxis - Optional X-axis field name (for mapping aggregated name keys)
 * @param {string} yAxis - Optional Y-axis field name
 * @returns {Array} - The filtered dataset
 */
export const filterData = (data, filters, xAxis = null, yAxis = null) => {
    if (!Array.isArray(data) || !data.length) return data;
    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) return data;

    return data.filter((row) => {
        // A row must satisfy all active filters (AND operation between dimensions, OR within each dimension)
        return Object.entries(filters).every(([dimension, selectedValues]) => {
            if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
                return true;
            }

            const appliesToAxis = dimensionAppliesToChartAxis(dimension, xAxis);

            // 1. Direct match: row.City or row['City']
            let candidate = row[dimension];

            // 2. Case-insensitive key fallback
            if (candidate === undefined) {
                const lowerDimension = dimension.toLowerCase();
                const matchedKey = Object.keys(row).find((k) => k.toLowerCase() === lowerDimension);
                if (matchedKey) candidate = row[matchedKey];
            }

            // 3. Chart aggregated data — row.name holds "Boston | East" when x-axis is "City | Region"
            if (candidate === undefined && appliesToAxis && row.name !== undefined && row.name !== null) {
                candidate = row.name;
            }

            if (candidate !== undefined && candidate !== null) {
                if (valuesMatch(candidate, selectedValues)) return true;
                // Composite category labels: "Boston | East" should match filter value "Boston"
                if (appliesToAxis && row.name != null) {
                    const parts = String(row.name).split(' | ').map((s) => s.trim()).filter(Boolean);
                    if (parts.some((part) => valuesMatch(part, selectedValues))) return true;
                }
                return false;
            }

            // 4. Stacked / grouped multi-series fallback
            const selectedValuesLower = selectedValues.map((v) => String(v).toLowerCase());
            const hasMatchingSeriesValue = Object.keys(row).some((k) => {
                if (selectedValuesLower.includes(k.toLowerCase())) {
                    return typeof row[k] === 'number' && row[k] > 0;
                }
                return false;
            });

            if (hasMatchingSeriesValue) {
                return true;
            }

            // 5. Filter applies to this chart's category axis but row did not match — hide bar
            if (appliesToAxis && row.name !== undefined && row.name !== null) {
                return false;
            }

            // Unrelated dimension (cross-visual) — keep row
            return true;
        });
    });
};

/**
 * Normalizes values to keep consistent styling colors mapped to specific categories.
 * Generates an HSL palette color dynamically to ensure visually harmony.
 */
export const getConsistentColor = (value, index = 0) => {
    if (value === undefined || value === null) return '#CBD5E1';
    
    // Hash category string for a stable seed
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    
    // Generate stable HSL coordinates
    const hue = Math.abs(hash) % 360;
    const saturation = 65 + (Math.abs(hash) % 15); // 65% - 80%
    const lightness = 45 + (Math.abs(hash) % 10);  // 45% - 55%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};
