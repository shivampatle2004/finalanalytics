import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { filterRulesToFilterMap, filterMapHasValues, sanitizeFilterMap } from '../utils/filterUtils';

const FilterContext = createContext(null);

export const FilterProvider = ({ children }) => {
    // Centralized filter state: { [dimension]: [selectedValue1, selectedValue2, ...] }
    const [filters, setFilters] = useState({});

    /** When true, linked visuals use `filters` (set automatically on chart selection). */
    const [reportCrossFilterEnabled, setReportCrossFilterEnabled] = useState(false);
    const [crossFilterSourceVisualId, setCrossFilterSourceVisualId] = useState(null);
    /** Bumps when report-wide cross-filter is applied so all charts refetch. */
    const [crossFilterRevision, setCrossFilterRevision] = useState(0);

    // Highlighted item state for "Highlight or Filter" legend system:
    // { dimension: string, value: string }
    const [highlightedItem, setHighlightedItem] = useState(null);

    // Add a filter value for a specific dimension
    const addFilter = (dimension, value) => {
        if (!dimension || value === undefined || value === null) return;
        setFilters(prev => {
            const currentValues = Array.isArray(prev?.[dimension]) ? prev[dimension] : [];
            if (currentValues.includes(value)) return prev;
            return {
                ...prev,
                [dimension]: [...currentValues, value]
            };
        });
    };

    // Remove a filter value for a specific dimension
    const removeFilter = (dimension, value) => {
        if (!dimension) return;
        setFilters(prev => {
            const currentValues = Array.isArray(prev?.[dimension]) ? prev[dimension] : [];
            const nextValues = currentValues.filter(val => val !== value);

            const nextFilters = { ...prev };
            if (nextValues.length === 0) {
                delete nextFilters[dimension];
            } else {
                nextFilters[dimension] = nextValues;
            }
            return nextFilters;
        });
    };

    // Toggle a filter value (multi-select by default)
    const toggleFilter = (dimension, value) => {
        if (!dimension || value === undefined || value === null) return;
        setFilters(prev => {
            const currentValues = Array.isArray(prev?.[dimension]) ? prev[dimension] : [];
            let nextValues;

            if (currentValues.includes(value)) {
                nextValues = currentValues.filter(val => val !== value);
            } else {
                nextValues = [...currentValues, value];
            }

            const nextFilters = { ...prev };
            if (nextValues.length === 0) {
                delete nextFilters[dimension];
            } else {
                nextFilters[dimension] = nextValues;
            }
            return nextFilters;
        });
    };

    // Clear all filters
    const clearFilters = () => {
        setFilters({});
        setHighlightedItem(null);
        setReportCrossFilterEnabled(false);
        setCrossFilterSourceVisualId(null);
        setCrossFilterRevision(0);
    };

    const applyReportCrossFilter = useCallback((visualId, visualFilterRules) => {
        const nextMap = sanitizeFilterMap(filterRulesToFilterMap(visualFilterRules));
        if (!filterMapHasValues(nextMap)) return;
        setFilters(nextMap);
        setCrossFilterSourceVisualId(visualId || null);
        setReportCrossFilterEnabled(true);
        setCrossFilterRevision((n) => n + 1);
    }, []);

    const clearReportCrossFilter = useCallback(() => {
        setFilters({});
        setReportCrossFilterEnabled(false);
        setCrossFilterSourceVisualId(null);
        setCrossFilterRevision((n) => n + 1);
    }, []);

    // Clear filters for a single dimension
    const clearDimensionFilters = (dimension) => {
        if (!dimension) return;
        setFilters(prev => {
            const nextFilters = { ...prev };
            delete nextFilters[dimension];
            return nextFilters;
        });
    };

    // Check if a dimension has any active filters
    const hasFilter = (dimension, value = null) => {
        const active = filters[dimension];
        if (!active) return false;
        if (value === null) return active.length > 0;
        return active.includes(value);
    };

    const safeFilters = useMemo(() => sanitizeFilterMap(filters), [filters]);

    const value = useMemo(() => ({
        filters: safeFilters,
        highlightedItem,
        reportCrossFilterEnabled,
        crossFilterSourceVisualId,
        crossFilterRevision,
        setFilters,
        addFilter,
        removeFilter,
        toggleFilter,
        clearFilters,
        clearDimensionFilters,
        hasFilter,
        setHighlightedItem,
        applyReportCrossFilter,
        clearReportCrossFilter,
    }), [safeFilters, highlightedItem, reportCrossFilterEnabled, crossFilterSourceVisualId, crossFilterRevision, applyReportCrossFilter, clearReportCrossFilter]);

    return (
        <FilterContext.Provider value={value}>
            {children}
        </FilterContext.Provider>
    );
};

export const useGlobalFilters = () => {
    const context = useContext(FilterContext);
    if (!context) {
        // Safe fallback to avoid crashes in isolated or test rendering environments
        return {
            filters: {},
            highlightedItem: null,
            setFilters: () => { },
            addFilter: () => { },
            removeFilter: () => { },
            toggleFilter: () => { },
            clearFilters: () => { },
            clearDimensionFilters: () => { },
            hasFilter: () => false,
            setHighlightedItem: () => { },
            reportCrossFilterEnabled: false,
            crossFilterSourceVisualId: null,
            crossFilterRevision: 0,
            applyReportCrossFilter: () => { },
            clearReportCrossFilter: () => { },
        };
    }
    return context;
};
