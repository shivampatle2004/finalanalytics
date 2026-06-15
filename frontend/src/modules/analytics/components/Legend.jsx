import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalFilters } from '../context/FilterContext';
import { VIBRANT_PALETTE, getCategoryColor, resolveCategoryColor } from '../constants/chartPalette';
import './Legend.css';

/**
 * Returns a stable color for a given string value using VIBRANT_PALETTE.
 * Same value → same color across all charts in the session.
 */
export const getLegendColor = (value, fallbackIndex = 0, palette = VIBRANT_PALETTE, colorMap = null) =>
    resolveCategoryColor(colorMap, value, fallbackIndex, palette);

/**
 * Legend component props:
 * - dimension {string}   The FilterContext dimension key (e.g. "Category")
 * - values    {string[]} Unique values to display (e.g. ["Electronics","Furniture"])
 * - layout    {'horizontal'|'vertical'}
 * - maxItems  {number}   Cap how many items are shown before collapsing (default 12)
 * - variant   {'chips'|'compact'|'dropdown'|'inline'}  compact = color dot rail (minimal)
 */
export const truncateLabel = (val, max = 52) => {
    const str = String(val ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

const LEGEND_MENU_WIDTH = 248;
const LEGEND_MENU_LIST_MAX = 240;

/** Portal menu anchored inside the visual card (searchable value list). */
function useLegendFilterMenuPortal({ open, wrapRef, anchorRef, menuWidth = LEGEND_MENU_WIDTH }) {
    const [menuStyle, setMenuStyle] = useState(null);
    const [portalHost, setPortalHost] = useState(null);
    const menuRef = useRef(null);

    const updateMenuPosition = useCallback(() => {
        const trigger = anchorRef?.current;
        const host = wrapRef?.current?.closest('.bi-visual-card, .bi-focus-content, .chart-wrapper, .sc-chart-wrapper');
        if (!trigger || !host) {
            setMenuStyle(null);
            return;
        }
        const tr = trigger.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        let left = tr.left - hr.left;
        if (left + menuWidth > hr.width - 4) {
            left = Math.max(4, hr.width - menuWidth - 4);
        }
        left = Math.max(4, left);
        let top = tr.bottom - hr.top + 4;
        const estimatedMenuHeight = 280;
        if (top + estimatedMenuHeight > hr.height - 4) {
            top = Math.max(4, tr.top - hr.top - estimatedMenuHeight - 4);
        }
        setMenuStyle({
            position: 'absolute',
            top,
            left,
            width: menuWidth,
            zIndex: 5000,
        });
    }, [anchorRef, wrapRef, menuWidth]);

    useEffect(() => {
        const host = wrapRef?.current?.closest('.bi-visual-card, .bi-focus-content, .chart-wrapper, .sc-chart-wrapper') || null;
        if (!open) {
            host?.classList.remove('bi-filter-menu-open');
            setPortalHost(null);
            setMenuStyle(null);
            return undefined;
        }
        host?.classList.add('bi-filter-menu-open');
        setPortalHost(host);
        updateMenuPosition();
        const onReposition = () => updateMenuPosition();
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            host?.classList.remove('bi-filter-menu-open');
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open, updateMenuPosition, wrapRef]);

    return { menuStyle, portalHost, menuRef };
}

function useLegendMenuOutsideClose({ open, onClose, wrapRef, menuRef, anchorRef, skipOutsideCloseRef }) {
    useEffect(() => {
        if (!open) return undefined;
        const onDocPointerDown = (e) => {
            if (skipOutsideCloseRef?.current) {
                skipOutsideCloseRef.current = false;
                return;
            }
            const root = wrapRef?.current;
            const menu = menuRef?.current;
            const anchor = anchorRef?.current;
            if (root?.contains(e.target) || menu?.contains(e.target) || anchor?.contains(e.target)) return;
            onClose();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        const timer = window.setTimeout(() => {
            document.addEventListener('pointerdown', onDocPointerDown);
        }, 0);
        document.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('pointerdown', onDocPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose, wrapRef, menuRef, anchorRef, skipOutsideCloseRef]);
}

/** Searchable filter popover — used for “+N more” and inline drill filters. */
const LegendFilterMenu = ({
    open,
    onClose,
    wrapRef,
    anchorRef,
    dimension,
    uniqueValues,
    activeFilters,
    hasActiveFilter,
    mode = 'select',
    selectValue,
    onApply,
    onToggle,
    onClear,
    headerTitle,
    outsideCloseSkipRef,
    colorPalette,
    categoryColorMap = null,
}) => {
    const menuPalette = colorPalette || VIBRANT_PALETTE;
    const menuColor = (val, idx) => getLegendColor(val, idx, menuPalette, categoryColorMap);
    const [search, setSearch] = useState('');
    const internalSkipRef = useRef(false);
    const skipRef = outsideCloseSkipRef || internalSkipRef;
    const { menuStyle, portalHost, menuRef } = useLegendFilterMenuPortal({ open, wrapRef, anchorRef });

    useEffect(() => {
        if (!open) setSearch('');
        else skipRef.current = true;
    }, [open, skipRef]);

    useLegendMenuOutsideClose({
        open,
        onClose,
        wrapRef,
        menuRef,
        anchorRef,
        skipOutsideCloseRef: skipRef,
    });

    const filteredValues = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return uniqueValues;
        return uniqueValues.filter((v) => String(v).toLowerCase().includes(q));
    }, [uniqueValues, search]);

    if (!open || !menuStyle || !portalHost) return null;

    const menuNode = (
        <div
            ref={menuRef}
            className="legend-filter-inline-menu legend-filter-picker-menu"
            role="listbox"
            aria-label={`Filter ${dimension}`}
            style={menuStyle}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="legend-filter-picker-head">
                <span className="legend-filter-picker-title">
                    {headerTitle || `Filter — ${truncateLabel(dimension, 28)}`}
                </span>
                <span className="legend-filter-picker-count">{uniqueValues.length} values</span>
            </div>
            <input
                type="search"
                className="legend-filter-picker-search"
                placeholder="Search values…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                autoFocus
            />
            <div className="legend-filter-inline-menu-scroll legend-filter-picker-scroll">
                {mode === 'select' && (
                    <button
                        type="button"
                        role="option"
                        aria-selected={selectValue === '__all__'}
                        className={`legend-filter-inline-option${selectValue === '__all__' ? ' is-selected' : ''}`}
                        onClick={() => {
                            onApply('__all__');
                            onClose();
                        }}
                    >
                        All ({uniqueValues.length})
                    </button>
                )}
                {filteredValues.length === 0 ? (
                    <p className="legend-filter-picker-empty">No matches</p>
                ) : (
                    filteredValues.map((val, idx) => {
                        const isSelected = activeFilters.includes(val);
                        return (
                            <button
                                key={val}
                                type="button"
                                role="option"
                                aria-selected={mode === 'select' ? selectValue === val : isSelected}
                                className={`legend-filter-inline-option${(mode === 'select' ? selectValue === val : isSelected) ? ' is-selected' : ''}`}
                                onClick={() => {
                                    if (mode === 'select') {
                                        onApply(val);
                                        onClose();
                                    } else {
                                        onToggle(val);
                                        onClose();
                                    }
                                }}
                                title={val}
                            >
                                <span
                                    className="legend-filter-inline-dot"
                                    style={{ background: menuColor(val, idx) }}
                                    aria-hidden
                                />
                                <span className="legend-filter-inline-option-text">{truncateLabel(val, 36)}</span>
                                {mode === 'toggle' && isSelected && (
                                    <span className="legend-filter-picker-check" aria-hidden>✓</span>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
            {hasActiveFilter && onClear && (
                <button
                    type="button"
                    className="legend-filter-inline-clear"
                    onClick={() => {
                        onClear();
                        onClose();
                    }}
                >
                    Clear filter
                </button>
            )}
        </div>
    );

    return createPortal(menuNode, portalHost);
};

/** Compact drill-bar filter — custom scroll menu scoped to the visual card. */
const LegendInlineFilter = ({
    dimension,
    uniqueValues,
    activeFilters,
    hasActiveFilter,
    selectValue,
    onApply,
    onClear,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const skipOutsideCloseRef = useRef(false);

    const close = useCallback(() => setOpen(false), []);

    const toggleOpen = useCallback((e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        setOpen((prev) => {
            if (!prev) skipOutsideCloseRef.current = true;
            return !prev;
        });
    }, []);

    const triggerLabel = selectValue === '__all__'
        ? `All (${uniqueValues.length})`
        : activeFilters.length > 1
            ? `${activeFilters.length} selected`
            : truncateLabel(selectValue, 18);

    return (
        <div className="legend-filter-inline-wrap" ref={wrapRef}>
            <button
                ref={triggerRef}
                type="button"
                className={`legend-filter-inline-trigger${hasActiveFilter ? ' is-active' : ''}${open ? ' is-open' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={toggleOpen}
                aria-expanded={open}
                aria-haspopup="listbox"
                title={hasActiveFilter ? `Filtered: ${activeFilters.join(', ')}` : `Filter ${dimension}`}
            >
                <span className="legend-filter-inline-trigger-text">{triggerLabel}</span>
            </button>
            <LegendFilterMenu
                open={open}
                onClose={close}
                wrapRef={wrapRef}
                anchorRef={triggerRef}
                dimension={dimension}
                uniqueValues={uniqueValues}
                activeFilters={activeFilters}
                hasActiveFilter={hasActiveFilter}
                mode="select"
                selectValue={selectValue}
                onApply={onApply}
                onClear={onClear}
                outsideCloseSkipRef={skipOutsideCloseRef}
            />
        </div>
    );
};

/** Read equals-filters for one field from visual-level filter rules. */
export const getVisualDimensionFilterValues = (visualFilters, dimension) => {
    if (!dimension || !Array.isArray(visualFilters)) return [];
    return visualFilters
        .filter((f) => f?.field === dimension && f?.operator === 'equals' && f?.value != null && String(f.value).trim() !== '')
        .map((f) => String(f.value));
};

const Legend = ({
    dimension,
    values = [],
    layout = 'horizontal',
    maxItems = 12,
    variant = 'chips',
    /** 'global' = cross-visual (chart clicks); 'visual' = this card only */
    filterScope = 'global',
    visualFilters = [],
    onVisualFilterChange,
    /** Optional: clear global + visual + refetch (from DynamicChart) */
    onFilterClear,
    /** Report theme palette for chip colors */
    colorPalette,
    /** Per-visual map: category name → unique theme color */
    categoryColorMap = null,
}) => {
    const chipPalette = colorPalette || VIBRANT_PALETTE;
    const chipColor = (val, idx) => getLegendColor(val, idx, chipPalette, categoryColorMap);
    const { filters, toggleFilter, clearDimensionFilters, setFilters } = useGlobalFilters();

    const [overflowPickerOpen, setOverflowPickerOpen] = useState(false);
    const legendWrapRef = useRef(null);
    const overflowBtnRef = useRef(null);
    const overflowSkipCloseRef = useRef(false);

    // Deduplicate + cap
    const uniqueValues = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const v of values) {
            const key = String(v ?? '');
            if (key && !seen.has(key)) { seen.add(key); out.push(key); }
        }
        return out;
    }, [values]);

    if (!uniqueValues.length || !dimension) return null;

    const isVisualScope = filterScope === 'visual';

    const activeFilters = isVisualScope
        ? getVisualDimensionFilterValues(visualFilters, dimension)
        : (Array.isArray(filters?.[dimension]) ? filters[dimension] : []);

    const hasActiveFilter = activeFilters.length > 0;

    const selectValue = activeFilters.length === 1
        ? activeFilters[0]
        : (activeFilters.length > 1 ? '__multi__' : '__all__');

    const applyDropdownFilter = (next) => {
        if (isVisualScope) {
            onVisualFilterChange?.(dimension, next, next === '__all__' ? 'toggle' : 'set');
            return;
        }
        if (!next || next === '__all__') {
            clearDimensionFilters(dimension);
            return;
        }
        setFilters((prev) => ({ ...prev, [dimension]: [next] }));
    };

    const clearScopeFilters = (e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        if (typeof onFilterClear === 'function') {
            onFilterClear(dimension);
            return;
        }
        if (isVisualScope) {
            onVisualFilterChange?.(dimension, '__all__');
            return;
        }
        clearDimensionFilters(dimension);
    };

    if (variant === 'inline') {
        return (
            <LegendInlineFilter
                dimension={dimension}
                uniqueValues={uniqueValues}
                activeFilters={activeFilters}
                hasActiveFilter={hasActiveFilter}
                selectValue={selectValue}
                onApply={applyDropdownFilter}
                onClear={clearScopeFilters}
            />
        );
    }

    if (variant === 'dropdown') {
        return (
            <div className="legend-filter-dropdown" role="group" aria-label={`Filter by ${dimension}`}>
                <span className="legend-filter-dropdown-label" title={dimension}>
                    Filter
                </span>
                <select
                    className="legend-filter-dropdown-select"
                    value={selectValue}
                    onChange={(e) => applyDropdownFilter(e.target.value)}
                    title={`Filter ${dimension}`}
                >
                    <option value="__all__">All — {uniqueValues.length} items</option>
                    {activeFilters.length > 1 && (
                        <option value="__multi__" disabled>
                            {activeFilters.length} selected (pick one)
                        </option>
                    )}
                    {uniqueValues.map((val) => (
                        <option key={val} value={val}>
                            {truncateLabel(val, 64)}
                        </option>
                    ))}
                </select>
                {hasActiveFilter && (
                    <button
                        type="button"
                        className="legend-filter-dropdown-clear"
                        onClick={() => clearDimensionFilters(dimension)}
                        title="Clear filter"
                    >
                        Clear
                    </button>
                )}
            </div>
        );
    }

    const visibleValues = uniqueValues.slice(0, maxItems);
    const hiddenCount = uniqueValues.length - visibleValues.length;

    const isSelected = (val) => !hasActiveFilter || activeFilters.includes(val);

    if (variant === 'compact') {
        const COMPACT_DOT_CAP = 6;
        const compactVisible = uniqueValues.slice(0, COMPACT_DOT_CAP);
        const compactHidden = Math.max(0, uniqueValues.length - compactVisible.length);

        const applyChipFilter = (val) => {
            const isFiltered = activeFilters.includes(val);
            if (isVisualScope) {
                onVisualFilterChange?.(dimension, val, 'toggle');
                return;
            }
            if (isFiltered) {
                clearScopeFilters();
            } else {
                setFilters((prev) => ({ ...prev, [dimension]: [val] }));
            }
        };

        const openOverflowPicker = (e) => {
            e?.stopPropagation?.();
            e?.preventDefault?.();
            overflowSkipCloseRef.current = true;
            setOverflowPickerOpen(true);
        };

        return (
            <div ref={legendWrapRef} className="legend-compact-rail" role="group" aria-label={`Legend for ${dimension}`}>
                <div className="legend-compact-dots">
                    {compactVisible.map((val, idx) => {
                        const color = chipColor(val, idx);
                        const isFiltered = activeFilters.includes(val);
                        const dimmed = hasActiveFilter && !isFiltered;
                        return (
                            <span
                                key={val}
                                className={`legend-compact-item${isFiltered ? ' is-filtered' : ''}${dimmed ? ' is-dimmed' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="legend-compact-dot"
                                    style={{ backgroundColor: color, color }}
                                    onClick={() => applyChipFilter(val)}
                                    title={isFiltered ? `Clear filter: ${val}` : val}
                                    aria-label={isFiltered ? `Clear filter: ${val}` : `Filter by ${val}`}
                                    aria-pressed={isFiltered}
                                />
                            </span>
                        );
                    })}
                    {compactHidden > 0 && (
                        <button
                            ref={overflowBtnRef}
                            type="button"
                            className="legend-compact-more"
                            onClick={openOverflowPicker}
                            aria-expanded={overflowPickerOpen}
                            aria-haspopup="listbox"
                            title={`Show all ${uniqueValues.length} categories — filter`}
                        >
                            +{compactHidden} more
                        </button>
                    )}
                </div>
                <span className="legend-compact-meta">
                    {hasActiveFilter
                        ? `${activeFilters.length} filtered`
                        : `${uniqueValues.length} ${uniqueValues.length === 1 ? 'category' : 'categories'}`}
                </span>
                {hasActiveFilter && (
                    <button
                        type="button"
                        className="legend-compact-clear"
                        onClick={clearScopeFilters}
                        title="Clear filter"
                    >
                        Clear
                    </button>
                )}
                <LegendFilterMenu
                    open={overflowPickerOpen}
                    onClose={() => setOverflowPickerOpen(false)}
                    wrapRef={legendWrapRef}
                    anchorRef={overflowBtnRef}
                    dimension={dimension}
                    uniqueValues={uniqueValues}
                    activeFilters={activeFilters}
                    hasActiveFilter={hasActiveFilter}
                    mode="toggle"
                    onToggle={applyChipFilter}
                    onClear={clearScopeFilters}
                    headerTitle="Filter categories"
                    outsideCloseSkipRef={overflowSkipCloseRef}
                    colorPalette={chipPalette}
                    categoryColorMap={categoryColorMap}
                />
            </div>
        );
    }

    /** Toggle category filters; click again removes that value; Clear restores all. */
    const applyChipFilter = (val) => {
        const isFiltered = activeFilters.includes(val);
        if (isVisualScope) {
            onVisualFilterChange?.(dimension, val, 'toggle');
            return;
        }
        if (isFiltered) {
            clearScopeFilters();
        } else {
            setFilters((prev) => ({ ...prev, [dimension]: [val] }));
        }
    };

    const openOverflowPicker = (e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        overflowSkipCloseRef.current = true;
        setOverflowPickerOpen(true);
    };

    // ── Styles ──────────────────────────────────────────────────────────────
    const containerStyle = {
        display: 'flex',
        flexDirection: layout === 'vertical' ? 'column' : 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: layout === 'vertical' ? 4 : '4px 10px',
        padding: '3px 2px',
        width: '100%',
        justifyContent: layout === 'vertical' ? 'flex-start' : 'center',
    };

    const itemBase = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        padding: '2px 5px',
        borderRadius: 4,
        transition: 'opacity 0.15s, background 0.15s',
        flexShrink: 0,
        outline: 'none',
        userSelect: 'none',
    };

    return (
        <div ref={legendWrapRef} style={containerStyle} role="group" aria-label={`Legend for ${dimension}`}>
            {visibleValues.map((val, idx) => {
                const color = chipColor(val, idx);
                const selected = isSelected(val);
                const isFiltered = activeFilters.includes(val);

                return (
                    <button
                        key={val}
                        onClick={() => applyChipFilter(val)}
                        title={isFiltered ? `Remove filter: ${val}` : `Filter by ${val}`}
                        aria-pressed={isFiltered}
                        style={{
                            ...itemBase,
                            opacity: selected ? 1 : 0.32,
                            background: isFiltered ? `${color}18` : 'transparent',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = `${color}22`;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = isFiltered ? `${color}18` : 'transparent';
                        }}
                    >
                        {/* Color dot */}
                        <span style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0,
                            boxShadow: isFiltered
                                ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}`
                                : `0 0 0 1.5px ${color}44`,
                            transform: isFiltered ? 'scale(1.2)' : 'scale(1)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }} />

                        {/* Label */}
                        <span style={{
                            fontSize: 10,
                            fontWeight: isFiltered ? 700 : 500,
                            color: isFiltered ? '#1e293b' : '#475569',
                            maxWidth: val.includes(' | ') ? 140 : 90,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}>
                            {val}
                        </span>
                    </button>
                );
            })}

            {hiddenCount > 0 && (
                <button
                    ref={overflowBtnRef}
                    type="button"
                    onClick={openOverflowPicker}
                    aria-expanded={overflowPickerOpen}
                    aria-haspopup="listbox"
                    title={`Search and filter all ${uniqueValues.length} values`}
                    style={{
                        ...itemBase,
                        fontSize: 10,
                        color: '#6366f1',
                        fontWeight: 600,
                        opacity: 0.85,
                    }}
                >
                    +{hiddenCount} more
                </button>
            )}

            <LegendFilterMenu
                open={overflowPickerOpen}
                onClose={() => setOverflowPickerOpen(false)}
                wrapRef={legendWrapRef}
                anchorRef={overflowBtnRef}
                dimension={dimension}
                uniqueValues={uniqueValues}
                activeFilters={activeFilters}
                hasActiveFilter={hasActiveFilter}
                mode="toggle"
                onToggle={applyChipFilter}
                onClear={clearScopeFilters}
                headerTitle="Filter values"
                outsideCloseSkipRef={overflowSkipCloseRef}
                colorPalette={chipPalette}
                categoryColorMap={categoryColorMap}
            />

            {/* Clear filter button — shown only when a filter is active */}
            {hasActiveFilter && (
                <button
                    type="button"
                    onClick={clearScopeFilters}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Clear all filters for this legend"
                    style={{
                        ...itemBase,
                        fontSize: 9,
                        color: '#ef4444',
                        fontWeight: 600,
                        opacity: 0.8,
                        marginLeft: 2,
                    }}
                >
                    ✕ Clear
                </button>
            )}
        </div>
    );
};

export default React.memo(Legend);
