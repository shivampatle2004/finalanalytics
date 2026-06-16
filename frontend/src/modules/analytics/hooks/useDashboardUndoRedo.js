import { useRef, useCallback, useState } from 'react';

const MAX_UNDO_STEPS = 50;

function cloneSnapshot(value) {
    if (value == null) return value;
    try {
        if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (_) { /* fallback */ }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return value;
    }
}

/** Whether a visual update should create an undo step (skip cache-only / UI flags). */
export function isRecordableVisualUpdate(updates) {
    if (!updates || typeof updates !== 'object') return false;
    const keys = Object.keys(updates).filter((k) => k !== 'cached_data' && k !== 'openFiltersPane');
    return keys.length > 0;
}

export function useDashboardUndoRedo({
    graphs,
    pages,
    activeVisualId,
    activePageId,
    setGraphs,
    setPages,
    setActiveVisualId,
    setActivePageId,
}) {
    const storeRef = useRef({ undo: [], redo: [], restoring: false });
    const [revision, setRevision] = useState(0);

    const takeSnapshot = useCallback(() => ({
        graphs: cloneSnapshot(graphs),
        pages: cloneSnapshot(pages),
        activeVisualId: activeVisualId ?? null,
        activePageId: activePageId ?? 'page-1',
    }), [graphs, pages, activeVisualId, activePageId]);

    const bump = useCallback(() => setRevision((r) => r + 1), []);

    const clearHistory = useCallback(() => {
        storeRef.current.undo = [];
        storeRef.current.redo = [];
        bump();
    }, [bump]);

    const pushHistory = useCallback(() => {
        if (storeRef.current.restoring) return;
        const snap = takeSnapshot();
        const serialized = JSON.stringify(snap);
        const stack = storeRef.current.undo;
        if (stack.length > 0 && JSON.stringify(stack[stack.length - 1]) === serialized) return;
        stack.push(snap);
        if (stack.length > MAX_UNDO_STEPS) stack.shift();
        storeRef.current.redo = [];
        bump();
    }, [takeSnapshot, bump]);

    const restoreSnapshot = useCallback((snap) => {
        if (!snap) return;
        storeRef.current.restoring = true;
        setGraphs(cloneSnapshot(snap.graphs));
        setPages(cloneSnapshot(snap.pages));
        setActiveVisualId(snap.activeVisualId ?? null);
        setActivePageId(snap.activePageId ?? 'page-1');
        queueMicrotask(() => {
            storeRef.current.restoring = false;
            bump();
        });
    }, [setGraphs, setPages, setActiveVisualId, setActivePageId, bump]);

    const undo = useCallback(() => {
        const stack = storeRef.current.undo;
        if (stack.length === 0) return;
        storeRef.current.redo.push(takeSnapshot());
        const previous = stack.pop();
        restoreSnapshot(previous);
    }, [takeSnapshot, restoreSnapshot]);

    const redo = useCallback(() => {
        const stack = storeRef.current.redo;
        if (stack.length === 0) return;
        storeRef.current.undo.push(takeSnapshot());
        const next = stack.pop();
        restoreSnapshot(next);
    }, [takeSnapshot, restoreSnapshot]);

    const canUndo = storeRef.current.undo.length > 0;
    const canRedo = storeRef.current.redo.length > 0;

    return {
        pushHistory,
        undo,
        redo,
        clearHistory,
        canUndo,
        canRedo,
        revision,
    };
}
