import React, { useMemo } from 'react';
import DynamicChart from './DynamicChart';
import { KPI_CARD_DEFAULT_SIZE, METRIC_CARD_DEFAULT_SIZE, PIE_DONUT_DEFAULT_SIZE, TEXT_BOX_DEFAULT_SIZE } from '../constants/visualDefaults';
import { useGlobalFilters } from '../context/FilterContext';
import { filterMapHasValues } from '../utils/filterUtils';
import { formatVisualDisplayTitle } from '../utils/visualTitleUtils';
import './BIDashboardCanvas.css';

const QUICK_MEASURE_FIELD_LABELS = {
    value_field: 'Value',
    total_field: 'Total',
    current_field: 'Current',
    prior_field: 'Prior',
    actual_field: 'Actual',
    target_field: 'Target',
    numerator: 'Numerator',
    denominator: 'Denominator',
    part_field: 'Part',
    whole_field: 'Whole',
    field: 'Field',
    field_a: 'Field A',
    field_b: 'Field B',
    date_field: 'Date',
    category_field: 'Category',
    condition_field: 'Condition',
    weight_field: 'Weight',
    top_n: 'Top N',
    periods: 'Periods',
};

const formatQuickMeasureFieldLabel = (key) => {
    const raw = String(key || '').trim();
    if (!raw) return 'Field';
    if (QUICK_MEASURE_FIELD_LABELS[raw]) return QUICK_MEASURE_FIELD_LABELS[raw];
    return raw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const getQuickMeasureInfo = (graph) => {
    const measureField = Array.isArray(graph?.options?.measure_fields)
        ? graph.options.measure_fields.find((m) => m?.template_id)
        : null;
    if (!measureField) return null;
    const mappings = measureField.field_mappings || measureField.config || {};
    const fields = mappings && typeof mappings === 'object' && !Array.isArray(mappings)
        ? Object.entries(mappings)
            .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
            .map(([key, value]) => ({
                key,
                label: formatQuickMeasureFieldLabel(key),
                value: String(value),
            }))
        : [];
    return {
        name: graph?.options?.measureName || graph?.options?.title || measureField.template_id,
        fields,
    };
};

const truncateFocusValue = (value, max = 24) => {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const BIDashboardCanvas = ({
    graphs,
    fileId,
    selection,
    onDataClick,
    isExporting,
    activeVisualId,
    onSelectVisual,
    onAddVisual,
    onResizeChart,
    onUpdateVisual,
    onButtonAction,
    onDeselectVisual,
    showGridlines = true,
    snapToGrid = false,
    reportTheme = 'theme_default',
    reportHeaderText = '',
    reportBackgroundColor = '#ffffff',
    reportNoFill = false,
    onUpdateReportHeader,
    isViewOnly = false,
    onApplyCrossFilter,
    onClearCrossFilter,
    schema = [],
    measures = [],
    onDropFieldOnCanvas,
    onDropFieldOnVisual,
    focusedGraphId: focusedGraphIdProp,
    onFocusGraph,
    onCloseFocusGraph,
}) => {
    const [internalFocusedGraphId, setInternalFocusedGraphId] = React.useState(null);
    const focusedGraphId = focusedGraphIdProp !== undefined ? focusedGraphIdProp : internalFocusedGraphId;
    const setFocusedGraphId = React.useCallback((id) => {
        if (onFocusGraph || onCloseFocusGraph) {
            if (id == null) onCloseFocusGraph?.();
            else onFocusGraph?.(id);
        } else {
            setInternalFocusedGraphId(id);
        }
    }, [onFocusGraph, onCloseFocusGraph]);
    const [focusZoomToolbarHost, setFocusZoomToolbarHost] = React.useState(null);
    const [isDraggingOverCanvas, setIsDraggingOverCanvas] = React.useState(false);
    const dragCounterRef = React.useRef(0);
    const workspaceRef = React.useRef(null);
    const initializedLayoutIdsRef = React.useRef(new Set());
    const [draggingGraphId, setDraggingGraphId] = React.useState(null);
    const [frontGraphId, setFrontGraphId] = React.useState(null);
    const [resizingGraphId, setResizingGraphId] = React.useState(null);
    const [resizeDir, setResizeDir] = React.useState(null);
    const [initialPos, setInitialPos] = React.useState({ x: 0, y: 0 });
    const [initialSize, setInitialSize] = React.useState({ width: 0, height: 0 });
    const [initialResizeCard, setInitialResizeCard] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
    const resizeFrameRef = React.useRef(null);
    const pendingResizeRef = React.useRef(null);
    const [isEditingReportHeader, setIsEditingReportHeader] = React.useState(false);
    const [draftReportHeader, setDraftReportHeader] = React.useState('');
    const reportHeaderInputRef = React.useRef(null);
    // Propagate report-wide cross-filter changes into memoized DynamicChart instances.
    const { reportCrossFilterEnabled, filters: reportCrossFilters, crossFilterRevision } = useGlobalFilters();
    const reportCrossFilterRevision = useMemo(() => {
        const filterKey = reportCrossFilterEnabled && filterMapHasValues(reportCrossFilters)
            ? JSON.stringify(reportCrossFilters)
            : '';
        return `${crossFilterRevision}:${filterKey}`;
    }, [crossFilterRevision, reportCrossFilterEnabled, reportCrossFilters]);

    // Refs for drag — NO useCallback, NO stale closures
    const dragCtx = React.useRef(null);
    const onUpdateVisualRef = React.useRef(onUpdateVisual);
    onUpdateVisualRef.current = onUpdateVisual;
    const graphsRef = React.useRef(graphs);
    graphsRef.current = graphs;
    const snapToGridRef = React.useRef(snapToGrid);
    snapToGridRef.current = snapToGrid;

    const isVisualPositionLocked = React.useCallback(
        (graph) => isViewOnly || Boolean(graph?.options?.positionLocked),
        [isViewOnly]
    );

    const clearCardDragStyles = (card) => {
        if (!card) return;
        card.style.transform = '';
        card.style.willChange = '';
        card.style.transition = '';
        card.style.zIndex = '';
        card.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    const cancelActiveCardDrag = React.useCallback(() => {
        const ctx = dragCtx.current;
        if (!ctx?.card) return;
        if (ctx.onMove) window.removeEventListener('mousemove', ctx.onMove, true);
        if (ctx.onUp) window.removeEventListener('mouseup', ctx.onUp, true);
        clearCardDragStyles(ctx.card);
        dragCtx.current = null;
        setDraggingGraphId(null);
    }, []);

    React.useEffect(() => {
        if (!draggingGraphId) return;
        const g = graphs.find((x) => x.id === draggingGraphId);
        if (g && isVisualPositionLocked(g)) cancelActiveCardDrag();
    }, [graphs, draggingGraphId, isVisualPositionLocked, cancelActiveCardDrag]);

    React.useEffect(() => {
        if (!resizingGraphId) return;
        const g = graphs.find((x) => x.id === resizingGraphId);
        if (g && isVisualPositionLocked(g)) {
            setResizingGraphId(null);
            setResizeDir(null);
        }
    }, [graphs, resizingGraphId, isVisualPositionLocked]);

    const handleUpdate = React.useCallback((id, updates) => {
        if (onUpdateVisual) onUpdateVisual(id, updates);
    }, [onUpdateVisual]);

    const bringGraphToFront = React.useCallback((graphId) => {
        if (!graphId || !onUpdateVisualRef.current) return;
        const latestGraph = graphsRef.current?.find(g => g.id === graphId);
        const latestOpts = latestGraph?.options || {};
        onUpdateVisualRef.current(graphId, {
            options: { ...latestOpts, layerOrder: Date.now() }
        });
    }, []);

    const focusedGraph = React.useMemo(() => {
        if (!focusedGraphId) return null;
        return (graphs || []).find(g => g?.id === focusedGraphId) || null;
    }, [focusedGraphId, graphs]);

    const quickMeasureInfo = React.useMemo(
        () => getQuickMeasureInfo(focusedGraph),
        [focusedGraph]
    );

    const focusStats = React.useMemo(() => {
        if (quickMeasureInfo) return null;
        const values = focusedGraph?.cached_data?.values;
        if (!values || !Array.isArray(values)) return null;
        const nums = values.map(v => parseFloat(String(v).replace(/,/g, ''))).filter(v => !isNaN(v));
        if (nums.length === 0) return null;
        const total = nums.reduce((a, b) => a + b, 0);
        return { total, avg: total / nums.length, max: Math.max(...nums), min: Math.min(...nums) };
    }, [focusedGraph?.cached_data, quickMeasureInfo]);

    // --- Viz-type drag-and-drop (HTML5 DnD — kept as bonus, but click-to-add is primary) ---
    const handleCanvasDragEnter = (e) => {
        e.preventDefault();
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) {
            setIsDraggingOverCanvas(true);
        }
    };
    const handleCanvasDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    const handleCanvasDragLeave = (e) => {
        e.preventDefault();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDraggingOverCanvas(false);
        }
    };
    const handleCanvasDrop = (e) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDraggingOverCanvas(false);
        let vizType = e.dataTransfer.getData('bi/viz-type');
        if (!vizType) {
            const plain = e.dataTransfer.getData('text/plain') || '';
            if (plain.startsWith('bi-viz:')) {
                vizType = plain.slice(7);
            } else if (plain) {
                // Drop a plain field or measure name on the canvas
                const gridEl = e.currentTarget.querySelector('.bi-visuals-grid') || e.currentTarget;
                let dropPosition = null;
                if (gridEl) {
                    const r = gridEl.getBoundingClientRect();
                    dropPosition = {
                        x: e.clientX - r.left - 120,
                        y: e.clientY - r.top - 60
                    };
                }
                if (onDropFieldOnCanvas) {
                    onDropFieldOnCanvas(plain, dropPosition);
                }
                return;
            }
        }
        if (vizType && onAddVisual) onAddVisual(vizType);
    };

    const CARD_DRAG_THRESHOLD = 5;

    const CHART_FILTER_CLICK_SELECTOR = [
        '.chart-category-clickable',
        '.sc-chart-area',
        '.chart-wrapper',
        '.recharts-wrapper',
        '.recharts-surface',
        '.recharts-pie-sector',
        '.pie-donut-slice-sector',
        '.pie-donut-slice-cell',
        '.recharts-bar-rectangle',
        '.chart-bar-marks',
        '.chart-bar-cell',
        '.recharts-rectangle',
        '.recharts-line-curve',
        '.recharts-area-area',
        '.recharts-scatter-symbol',
        '.recharts-active-dot',
        '.recharts-active-bar',
    ].join(', ');

    const isChartFilterClickTarget = (target) => {
        if (!target?.closest) return false;
        return Boolean(target.closest(CHART_FILTER_CLICK_SELECTOR));
    };

    const isInteractiveDragTarget = (target) => {
        if (!target?.closest) return false;
        if (isChartFilterClickTarget(target)) return true;
        return Boolean(target.closest(
            '.bi-resize-handle, button, a, input, textarea, select, option, [contenteditable="true"], ' +
            '.legend-filter-inline-wrap, .legend-filter-inline-menu, .sc-controls-bar, .sc-toggle, .sc-slider-label'
        ));
    };

    // --- Card repositioning: drag from anywhere after a small movement threshold ---
    function startCardDrag(e, graph) {
        if (isVisualPositionLocked(graph)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (e.button !== 0) return;
        if (isInteractiveDragTarget(e.target)) return;

        const card = e.currentTarget?.closest
            ? (e.currentTarget.closest('.bi-visual-card') || e.currentTarget)
            : e.currentTarget;
        if (!card) return;
        const grid = card.closest('.bi-visuals-grid');
        const opts = graph.options || {};

        let baseX = typeof opts.x === 'number' ? opts.x : 0;
        let baseY = typeof opts.y === 'number' ? opts.y : 0;

        if (grid && opts.x == null && opts.y == null) {
            const cr = card.getBoundingClientRect();
            const gr = grid.getBoundingClientRect();
            baseX = cr.left - gr.left;
            baseY = cr.top - gr.top;
            if (onUpdateVisualRef.current) {
                const latestGraph = graphsRef.current?.find(g => g.id === graph.id);
                const latestOpts = latestGraph?.options || opts;
                onUpdateVisualRef.current(graph.id, {
                    options: { ...latestOpts, x: baseX, y: baseY, width: card.offsetWidth, height: card.offsetHeight, size: latestOpts.size || 'custom' }
                });
            }
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const origOpts = { ...opts, x: baseX, y: baseY };
        let dragStarted = false;

        const beginDrag = () => {
            if (dragStarted) return;
            dragStarted = true;
            card.classList.add('dragging');
            card.style.willChange = 'transform';
            card.style.transition = 'none';
            card.style.zIndex = '1000';
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            setDraggingGraphId(graph.id);
            setFrontGraphId(graph.id);
            bringGraphToFront(graph.id);
            if (onSelectVisual) onSelectVisual(graph.id);
        };

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!dragStarted) {
                if (Math.hypot(dx, dy) < CARD_DRAG_THRESHOLD) return;
                beginDrag();
            }
            ev.preventDefault();
            card.style.transform = `translate(${dx}px, ${dy}px)`;
        }

        function onUp(ev) {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
            dragCtx.current = null;

            if (!dragStarted) return;

            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const snap = (value) => (snapToGridRef.current ? Math.round(value / 25) * 25 : value);
            const finalX = snap(Math.max(0, baseX + dx));
            const finalY = snap(Math.max(0, baseY + dy));

            clearCardDragStyles(card);

            if (onUpdateVisualRef.current) {
                const latestGraph = graphsRef.current?.find(g => g.id === graph.id);
                const latestOpts = latestGraph?.options || origOpts;
                onUpdateVisualRef.current(graph.id, {
                    options: { ...latestOpts, x: finalX, y: finalY, size: 'custom' }
                });
            }
            setDraggingGraphId(null);

            const suppressClick = (clickEv) => {
                clickEv.preventDefault();
                clickEv.stopPropagation();
            };
            card.addEventListener('click', suppressClick, true);
            window.setTimeout(() => card.removeEventListener('click', suppressClick, true), 0);
        }

        dragCtx.current = { card, graph, onMove, onUp };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    }

    // --- Resize handlers ---
    const handleResizeStart = (e, graph, direction) => {
        if (isVisualPositionLocked(graph) || graph?.graph_type === 'metricCard') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setResizingGraphId(graph.id);
        setResizeDir(direction);
        setInitialPos({ x: e.clientX, y: e.clientY });
        const element = e.target.closest('.bi-visual-card');
        if (element) {
            const w = element.offsetWidth, h = element.offsetHeight;
            setInitialSize({ width: w, height: h });
            const opts = graph.options || {};
            setInitialResizeCard({ x: typeof opts.x === 'number' ? opts.x : 0, y: typeof opts.y === 'number' ? opts.y : 0, width: w, height: h });
        }
    };

    React.useEffect(() => {
        if (!resizingGraphId || !resizeDir) return;
        const handleMouseMove = (e) => {
            const deltaX = e.clientX - initialPos.x, deltaY = e.clientY - initialPos.y;
            let newWidth = initialSize.width, newHeight = initialSize.height, newX = initialResizeCard.x, newY = initialResizeCard.y;
            if (resizeDir.includes('right')) newWidth = initialSize.width + deltaX;
            else if (resizeDir.includes('left')) { newWidth = initialSize.width - deltaX; newX = initialResizeCard.x + deltaX; }
            if (resizeDir.includes('bottom')) newHeight = initialSize.height + deltaY;
            else if (resizeDir.includes('top')) { newHeight = initialSize.height - deltaY; newY = initialResizeCard.y + deltaY; }
            newWidth = Math.max(newWidth, 150); newHeight = Math.max(newHeight, 120);
            pendingResizeRef.current = { id: resizingGraphId, x: newX, y: newY, width: newWidth, height: newHeight };
            if (resizeFrameRef.current) return;
            resizeFrameRef.current = window.requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                const nextResize = pendingResizeRef.current;
                if (!nextResize) return;
                if (onResizeChart) onResizeChart(nextResize.id, nextResize.width, nextResize.height);
                if (onUpdateVisual) {
                    const cur = graphsRef.current.find(g => g.id === nextResize.id)?.options || {};
                    onUpdateVisual(nextResize.id, {
                        options: {
                            ...cur,
                            x: nextResize.x,
                            y: nextResize.y,
                            width: nextResize.width,
                            height: nextResize.height,
                            size: 'custom'
                        }
                    });
                }
            });
        };
        const handleMouseUp = () => {
            if (resizeFrameRef.current) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
            const nextResize = pendingResizeRef.current;
            if (nextResize && onUpdateVisual) {
                const cur = graphsRef.current.find(g => g.id === nextResize.id)?.options || {};
                onUpdateVisual(nextResize.id, {
                    options: {
                        ...cur,
                        x: nextResize.x,
                        y: nextResize.y,
                        width: nextResize.width,
                        height: nextResize.height,
                        size: 'custom'
                    }
                });
            }
            pendingResizeRef.current = null;
            setResizingGraphId(null);
            setResizeDir(null);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            if (resizeFrameRef.current) {
                window.cancelAnimationFrame(resizeFrameRef.current);
                resizeFrameRef.current = null;
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingGraphId, resizeDir, initialPos, initialSize, initialResizeCard, onResizeChart, onUpdateVisual]);

    // Safety: never leave the canvas in a stuck "resizing" interaction state.
    React.useEffect(() => {
        const resetResizeState = () => {
            setResizingGraphId(null);
            setResizeDir(null);
        };
        window.addEventListener('blur', resetResizeState);
        window.addEventListener('mouseleave', resetResizeState);
        return () => {
            window.removeEventListener('blur', resetResizeState);
            window.removeEventListener('mouseleave', resetResizeState);
        };
    }, []);

    // --- Auto-layout ---
    React.useEffect(() => {
        if (!onUpdateVisual || !Array.isArray(graphs) || graphs.length === 0) return;
        const ww = workspaceRef.current?.clientWidth || 1200;
        const sizeDefaults = (s) => { switch(s) { case 'small': return {width:360,height:240}; case 'large': return {width:980,height:520}; case 'wide': return {width:980,height:320}; default: return {width:520,height:360}; } };
        const pad = 24, gap = 24, cols = 2;
        const cw = Math.max(320, Math.floor((ww - pad*2 - gap*(cols-1)) / cols));
        const cx = [pad, pad + cw + gap], cy = [pad, pad];
        for (const g of graphs) {
            if (!g?.id || initializedLayoutIdsRef.current.has(g.id)) continue;
            const o = g.options || {};
            if (typeof o.x==='number' && typeof o.y==='number' && typeof o.width==='number' && typeof o.height==='number') { initializedLayoutIdsRef.current.add(g.id); continue; }
            const bs = sizeDefaults(o.size), w = o.width || Math.min(bs.width, cw), h = o.height || bs.height;
            const tc = cy[0] <= cy[1] ? 0 : 1;
            const x = typeof o.x==='number' ? o.x : cx[tc], y = typeof o.y==='number' ? o.y : cy[tc];
            cy[tc] = y + h + gap;
            initializedLayoutIdsRef.current.add(g.id);
            onUpdateVisual(g.id, { options: { ...o, x, y, width: w, height: h, size: 'custom' } });
        }
    }, [graphs, onUpdateVisual]);

    React.useEffect(() => {
        if (!isEditingReportHeader) {
            setDraftReportHeader(reportHeaderText || '');
        }
    }, [reportHeaderText, isEditingReportHeader]);

    React.useEffect(() => {
        if (!isEditingReportHeader || !reportHeaderInputRef.current) return;
        reportHeaderInputRef.current.focus();
        reportHeaderInputRef.current.select();
    }, [isEditingReportHeader]);

    const commitReportHeader = React.useCallback(() => {
        const nextValue = (draftReportHeader || '').trim();
        if (onUpdateReportHeader) onUpdateReportHeader(nextValue);
        setIsEditingReportHeader(false);
    }, [draftReportHeader, onUpdateReportHeader]);

    const layerRankById = React.useMemo(() => {
        const sorted = [...(graphs || [])].sort((a, b) => {
            const aOrder = Number(a?.options?.layerOrder) || 0;
            const bOrder = Number(b?.options?.layerOrder) || 0;
            return aOrder - bOrder;
        });
        const rankMap = {};
        sorted.forEach((g, idx) => {
            rankMap[g.id] = idx + 1;
        });
        return rankMap;
    }, [graphs]);

    const graphsByLayer = React.useMemo(() => {
        return [...(graphs || [])].sort((a, b) => {
            const aOrder = Number(a?.options?.layerOrder) || 0;
            const bOrder = Number(b?.options?.layerOrder) || 0;
            return aOrder - bOrder;
        });
    }, [graphs]);

    React.useEffect(() => {
        if (!activeVisualId) return;
        setFrontGraphId(activeVisualId);
        bringGraphToFront(activeVisualId);
    }, [activeVisualId, bringGraphToFront]);

    const canvasMinWidth = React.useMemo(() => {
        const baseWidth = 1200;
        const rightMostEdge = (graphs || []).reduce((maxEdge, graph) => {
            const opts = graph?.options || {};
            const x = typeof opts.x === 'number' ? opts.x : 0;
            const width = typeof opts.width === 'number' ? opts.width : 520;
            return Math.max(maxEdge, x + width);
        }, 0);
        return Math.max(baseWidth, rightMostEdge + 48);
    }, [graphs]);

    const canvasMinHeight = React.useMemo(() => {
        const baseHeight = 900;
        const bottomMostEdge = (graphs || []).reduce((maxEdge, graph) => {
            const opts = graph?.options || {};
            const y = typeof opts.y === 'number' ? opts.y : 0;
            const height = typeof opts.height === 'number' ? opts.height : 360;
            return Math.max(maxEdge, y + height);
        }, 0);
        return Math.max(baseHeight, bottomMostEdge + 48);
    }, [graphs]);

    const isBlankReport = !graphs || graphs.length === 0;
    const isDefaultReportName = !reportHeaderText || String(reportHeaderText).trim().toLowerCase() === 'enter the report name';
    const shouldHideGridlines = isBlankReport || isDefaultReportName || isEditingReportHeader;

    return (
        <div
            className={`bi-canvas ${isDraggingOverCanvas ? 'drag-over' : ''}`}
            style={{
                backgroundColor: reportBackgroundColor || '#ffffff'
            }}
            onDragEnter={handleCanvasDragEnter}
            onDragOver={handleCanvasDragOver}
            onDragLeave={handleCanvasDragLeave}
            onDrop={handleCanvasDrop}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && onDeselectVisual) onDeselectVisual();
            }}
        >
            {showGridlines && !shouldHideGridlines && <div className="bi-canvas-grid-lines" />}
            {isDraggingOverCanvas && !isViewOnly && (
                <div className="bi-drag-hint"><div className="bi-drag-hint-box"><div className="bi-drag-hint-icon">➕</div><p>Drop to add visualization</p></div></div>
            )}
            <div className="bi-report-header-banner" title={reportHeaderText || 'Enter the report name'}>
                {isEditingReportHeader ? (
                    <input
                        ref={reportHeaderInputRef}
                        type="text"
                        className="bi-report-header-input"
                        value={draftReportHeader}
                        onChange={(e) => setDraftReportHeader(e.target.value)}
                        onBlur={commitReportHeader}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitReportHeader();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setDraftReportHeader(reportHeaderText || '');
                                setIsEditingReportHeader(false);
                            }
                        }}
                        placeholder="Enter the report name"
                    />
                ) : (
                    <h1
                        className={`bi-report-header-title ${String(reportHeaderText || '').trim().toLowerCase() === 'enter the report name' ? 'is-placeholder' : ''} ${isViewOnly ? 'view-only' : ''}`}
                        onClick={() => !isViewOnly && setIsEditingReportHeader(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (!isViewOnly && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setIsEditingReportHeader(true);
                            }
                        }}
                        title={isViewOnly ? reportHeaderText : "Click to edit report name"}
                    >
                        {reportHeaderText || 'Enter the report name'}
                    </h1>
                )}
            </div>
            {focusedGraph && (
                <div className="bi-focus-overlay">
                    <div className="bi-focus-content">
                        <div className="bi-focus-header">
                            <div className="bi-focus-header-left">
                                <h2 className="bi-focus-title">
                                    {formatVisualDisplayTitle(focusedGraph.options?.title, focusedGraph.graph_type)}
                                </h2>
                            </div>
                            {focusStats && (
                                <div className="bi-focus-kpi-bar">
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">TOTAL</span><span className="bi-focus-kpi-value">{Math.round(focusStats.total).toLocaleString()}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">AVG</span><span className="bi-focus-kpi-value">{focusStats.avg.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">MAX</span><span className="bi-focus-kpi-value">{focusStats.max.toLocaleString()}</span></div>
                                    <div className="bi-focus-kpi-item"><span className="bi-focus-kpi-label">MIN</span><span className="bi-focus-kpi-value">{focusStats.min.toLocaleString()}</span></div>
                                </div>
                            )}
                            <div className="bi-focus-header-right">
                                <div ref={setFocusZoomToolbarHost} className="bi-focus-zoom-slot" />
                                <span className="bi-focus-toolbar-divider" aria-hidden="true" />
                                <button type="button" className="bi-focus-close" onClick={() => setFocusedGraphId(null)} aria-label="Close focus view">✕</button>
                            </div>
                        </div>
                        <div className="bi-focus-body" data-visual-id={focusedGraph.id}>
                            <DynamicChart
                                key={`${fileId}-${focusedGraph.id}-${reportTheme}-focus-${reportCrossFilterRevision}`}
                                fileId={fileId}
                                graphDefinition={focusedGraph}
                                reportCrossFilterRevision={reportCrossFilterRevision}
                                measures={measures}
                                schema={schema}
                                isExporting={isExporting}
                                hideInternalStats={true}
                                hideChartTitle={true}
                                showZoomControls={true}
                                zoomToolbarContainer={focusZoomToolbarHost}
                                reportTheme={reportTheme}
                                reportNoFill={reportNoFill}
                                isViewOnly={isViewOnly}
                                onSelectVisual={onSelectVisual}
                                onApplyCrossFilter={onApplyCrossFilter}
                                onClearCrossFilter={onClearCrossFilter}
                                onUpdate={(u) => handleUpdate(focusedGraph.id, u)}
                            />
                        </div>
                    </div>
                </div>
            )}
            <div
                className="bi-visuals-grid"
                ref={workspaceRef}
                style={{
                    minWidth: `${canvasMinWidth}px`,
                    minHeight: `${canvasMinHeight}px`
                }}
                onDragEnter={handleCanvasDragEnter}
                onDragOver={handleCanvasDragOver}
                onDragLeave={handleCanvasDragLeave}
                onDrop={handleCanvasDrop}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && onDeselectVisual) onDeselectVisual();
                }}
            >
                {Array.isArray(graphsByLayer) && graphsByLayer.length > 0 ? graphsByLayer.map((graph, index) => {
                    const opts = graph.options || {};
                    const dragging = draggingGraphId === graph.id;
                    const layerRank = layerRankById[graph.id] || 1;
                    const isMetricCard = graph.graph_type === 'metricCard';
                    const isKpiCard = graph.graph_type === 'kpiCard';
                    const isTextBox = graph.graph_type === 'text';
                    const isPieDonut = graph.graph_type === 'pie' || graph.graph_type === 'donut';
                    const defaultCardSize = isMetricCard
                        ? METRIC_CARD_DEFAULT_SIZE
                        : (isKpiCard
                            ? KPI_CARD_DEFAULT_SIZE
                            : (isTextBox
                                ? TEXT_BOX_DEFAULT_SIZE
                                : (isPieDonut ? PIE_DONUT_DEFAULT_SIZE : { width: 520, height: 360 })));

                    // ── Card Styling options ────────────────────────────────
                    const isNoFill = reportNoFill || opts.noFill === true;
                    const cardBgBase = isNoFill
                        ? 'transparent'
                        : (opts.cardBgColor || opts.bgColor || '#ffffff');
                    const cardOpacity = opts.cardBgOpacity !== undefined ? opts.cardBgOpacity / 100 : 1;
                    const cardBgStyle = isNoFill
                        ? 'transparent'
                        : (opts.cardBgGradient
                            ? `linear-gradient(135deg, ${cardBgBase}, ${opts.cardBgGradientEnd || '#f1f5f9'})`
                            : cardBgBase);

                    const shadowMap = {
                        low:    '0 2px 8px rgba(0,0,0,0.08)',
                        medium: '0 6px 20px rgba(0,0,0,0.14)',
                        high:   '0 16px 48px rgba(0,0,0,0.22)',
                    };
                    // When border is removed, also suppress the selected-state pink box-shadow
                    // unless the user has explicitly turned on their own shadow
                    const cardShadow = isNoFill && !opts.cardShadowEnabled
                        ? 'none'
                        : (opts.cardShadowEnabled
                            ? shadowMap[opts.cardShadowIntensity || 'medium']
                            : opts.cardBorderRemoved
                                ? 'none'   // kills .bi-visual-card.selected glow too
                                : undefined);

                    const cardBorder = isNoFill && !opts.cardBorderEnabled
                        ? 'none'
                        : (opts.cardBorderEnabled
                            ? `${opts.cardBorderWidth ?? 1}px solid ${opts.cardBorderColor || '#cbd5e1'}`
                            : opts.cardBorderRemoved
                                ? 'none'
                                : undefined);
                    const cardRadius = opts.cardBorderEnabled
                        ? `${opts.cardBorderRadius ?? 8}px`
                        : undefined;
                    // ───────────────────────────────────────────────────────

                    const cardStyles = {
                        position: 'absolute',
                        left: (typeof opts.x === 'number' ? opts.x : 0) + 'px',
                        top: (typeof opts.y === 'number' ? opts.y : 0) + 'px',
                        width: (isMetricCard
                            ? METRIC_CARD_DEFAULT_SIZE.width
                            : (typeof opts.width === 'number' ? opts.width : defaultCardSize.width)) + 'px',
                        height: (isMetricCard
                            ? METRIC_CARD_DEFAULT_SIZE.height
                            : (typeof opts.height === 'number' ? opts.height : defaultCardSize.height)) + 'px',
                        ...(opts.cardBgGradient
                            ? { background: cardBgStyle }
                            : { backgroundColor: cardBgBase }),
                        opacity: cardOpacity,
                        // border:none / boxShadow:none must always win when user clicked Remove Border
                        ...(cardBorder !== undefined ? { border: cardBorder } : {}),
                        ...(cardRadius ? { borderRadius: cardRadius } : {}),
                        ...(cardShadow !== undefined ? { boxShadow: cardShadow } : {}),
                        zIndex: dragging
                            ? 60
                            : (activeVisualId === graph.id && !isViewOnly
                                ? Math.max(52, layerRank + 10)
                                : (frontGraphId === graph.id
                                    ? 50
                                    : layerRank)),
                    };
                    const defaultAriaName =
                        formatVisualDisplayTitle(graph.options?.title, graph.graph_type)
                        || (graph.graph_type === 'text' ? 'Text box' : 'Visual');
                    const ariaLabel = (opts.altText && String(opts.altText).trim()) || defaultAriaName;

                    const cardLocked = isVisualPositionLocked(graph);
                    const showCardHeader = activeVisualId === graph.id && !graph.options?.noHeader;
                    const legendHeaderSlotId = null;

                    return (
                        <div
                            key={graph.id || index}
                            data-visual-id={graph.id}
                            role="article"
                            aria-label={ariaLabel}
                            className={`bi-card bi-visual-card ${activeVisualId === graph.id && !isViewOnly ? 'selected' : ''} ${resizingGraphId === graph.id ? 'resizing' : ''} ${graph.graph_type === 'text' ? 'bi-is-text' : ''} ${isKpiCard ? 'bi-visual-card--kpi' : ''} ${isMetricCard ? 'bi-visual-card--metric' : ''} ${isViewOnly ? 'view-only' : ''}${cardLocked ? ' bi-visual-card--locked' : ''}${isNoFill ? ' bi-visual-card--no-fill' : ''}`}
                            onDragOver={(e) => {
                                if (!isViewOnly) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                }
                            }}
                            onDrop={(e) => {
                                if (isViewOnly) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const droppedText = e.dataTransfer.getData('text/plain') || '';
                                if (droppedText && !droppedText.startsWith('bi-viz:') && onDropFieldOnVisual) {
                                    onDropFieldOnVisual(droppedText, graph.id);
                                }
                            }}
                            onMouseDownCapture={(e) => {
                                if (e.button !== 0) return;
                                if (e.target?.closest?.('.sc-controls-bar, .sc-toggle, .sc-slider-label, input[type="checkbox"], input[type="range"]')) {
                                    return;
                                }
                                // Let bar/slice/path clicks apply cross-filter on the first click; selection runs inside DynamicChart.
                                if (isChartFilterClickTarget(e.target)) return;
                                if (onSelectVisual) onSelectVisual(graph.id);
                                bringGraphToFront(graph.id);
                            }}
                            onMouseDown={(e) => {
                                if (!cardLocked) startCardDrag(e, graph);
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (frontGraphId !== graph.id) setFrontGraphId(graph.id);
                                bringGraphToFront(graph.id);
                                if (onSelectVisual) onSelectVisual(graph.id);
                            }}
                            style={cardStyles}
                        >
                            {showCardHeader && (
                                <div className="bi-visual-header">
                                    <div className="bi-header-left">
                                        <div className="bi-visual-title-row">
                                            {!isViewOnly && !cardLocked && (
                                                <div
                                                    className="bi-drag-handle"
                                                    title="Drag visualization"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>
                                                </div>
                                            )}
                                            {!isViewOnly && cardLocked && (
                                                <span className="bi-visual-lock-badge" title="Locked — select visual and use View → Unlock">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                                                </span>
                                            )}
                                            <span className="bi-visual-title">
                                                {graph.graph_type === 'text'
                                                    ? (graph.options?.title || '')
                                                    : formatVisualDisplayTitle(graph.options?.title, graph.graph_type)}
                                            </span>
                                        </div>
                                    </div>
                                    {legendHeaderSlotId && (
                                        <div className="bi-visual-header-center">
                                            <div
                                                id={legendHeaderSlotId}
                                                className="bi-visual-header-legend-slot"
                                                aria-hidden={false}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            <div
                                className={`bi-visual-content${isNoFill ? ' bi-visual-content--no-fill' : ''}`}
                            >
                                <DynamicChart
                                    key={`${fileId}-${graph.id}-${reportTheme}-${reportCrossFilterRevision}`}
                                    fileId={fileId}
                                    graphDefinition={graph}
                                    legendHeaderSlotId={legendHeaderSlotId}
                                    reportCrossFilterRevision={reportCrossFilterRevision}
                                    measures={measures}
                                    schema={schema}
                                    selection={selection}
                                    isExporting={isExporting}
                                    hideInternalStats={true}
                                    hideChartTitle={true}
                                    showZoomControls={false}
                                    reportTheme={reportTheme}
                                    reportNoFill={reportNoFill}
                                    isDragging={dragging || resizingGraphId === graph.id}
                                    isViewOnly={isViewOnly}
                                    onSelectVisual={onSelectVisual}
                                    onApplyCrossFilter={onApplyCrossFilter}
                                    onClearCrossFilter={onClearCrossFilter}
                                    onUpdate={(u) => handleUpdate(graph.id, u)}
                                    onClick={(payload) => {
                                        if (graph.graph_type === 'button') {
                                            if (onButtonAction) onButtonAction(graph, payload);
                                            return;
                                        }
                                        if (onDataClick) onDataClick(payload);
                                    }}
                                />
                            </div>
                            {!cardLocked && !isMetricCard && ['top','bottom','left','right','top-left','top-right','bottom-left','bottom-right'].map(dir => (
                                <div key={dir} className={`bi-resize-handle bi-resize-${dir}`} onMouseDown={(e) => handleResizeStart(e, graph, dir)} />
                            ))}
                        </div>
                    );
                }) : (
                    <div className="bi-empty-canvas"><div className="bi-empty-icon">📊</div><p>No visualizations added yet.</p><span>Click a chart type in the right panel to add one.</span></div>
                )}
            </div>
        </div>
    );
};

export default BIDashboardCanvas;
