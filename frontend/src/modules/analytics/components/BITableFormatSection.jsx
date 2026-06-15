import React from 'react';
import { DEFAULT_TABLE_STYLE, getTableColumns, mergeTableStyle } from '../utils/tableStyleUtils';

function SliderControl({ label, value, min, max, step, disabled, onChange, formatValue }) {
    const display = formatValue ? formatValue(value) : `${value}px`;
    return (
        <div className="bi-tf-slider">
            <span className="bi-tf-slider-label">{label}</span>
            <input
                type="range"
                className="bi-tf-range"
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={label}
            />
            <span className="bi-tf-slider-value">{display}</span>
        </div>
    );
}

function ColorControl({ label, value, fallback, disabled, onChange, onReset }) {
    const isCustom = Boolean(value && String(value).trim());
    return (
        <div className="bi-tf-color">
            <span className="bi-tf-color-label">{label}</span>
            <div className="bi-tf-color-actions">
                <input
                    type="color"
                    className="bi-tf-color-swatch"
                    value={value || fallback}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={label}
                />
                {isCustom && (
                    <button
                        type="button"
                        className="bi-tf-color-clear"
                        disabled={disabled}
                        onClick={onReset}
                        title="Reset to default"
                        aria-label={`Reset ${label}`}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

function BITableFormatSection({ selectedVisual, currentOptions, onUpdateTableStyle, isViewOnly }) {
    if (!selectedVisual || selectedVisual.graph_type !== 'table') return null;

    const tableStyle = mergeTableStyle(currentOptions.tableStyle);
    const columns = getTableColumns(selectedVisual);
    const disabled = isViewOnly;

    const patch = (partial) => {
        if (disabled) return;
        onUpdateTableStyle(partial);
    };

    const setColumnWidth = (col, raw) => {
        const n = Number(raw);
        const columnWidths = { ...tableStyle.columnWidths };
        if (!raw || !Number.isFinite(n) || n <= 0) {
            delete columnWidths[col];
        } else {
            columnWidths[col] = Math.round(Math.min(600, Math.max(40, n)));
        }
        patch({ columnWidths });
    };

    const resetTableStyle = () => {
        if (disabled) return;
        onUpdateTableStyle({ ...DEFAULT_TABLE_STYLE }, true);
    };

    const toggles = [
        { key: 'stripedRows', label: 'Striped rows', checked: tableStyle.stripedRows !== false },
        { key: 'stickyHeader', label: 'Sticky header', checked: tableStyle.stickyHeader !== false },
        { key: 'wrapText', label: 'Wrap cell text', checked: tableStyle.wrapText !== false },
    ];

    return (
        <div className="bi-table-format">
            <div className="bi-table-format-top">
                <span className="bi-table-format-title">Table style</span>
                <button
                    type="button"
                    className="bi-table-format-reset"
                    disabled={disabled}
                    onClick={resetTableStyle}
                >
                    Reset all
                </button>
            </div>

            <div className="bi-tf-group">
                <div className="bi-tf-group-title">Typography &amp; spacing</div>
                <div className="bi-tf-group-body">
                    <SliderControl
                        label="Font size"
                        value={tableStyle.fontSize}
                        min={10}
                        max={20}
                        step={1}
                        disabled={disabled}
                        onChange={(v) => patch({ fontSize: v })}
                    />
                    <SliderControl
                        label="Cell padding X"
                        value={tableStyle.cellPaddingX}
                        min={4}
                        max={32}
                        step={1}
                        disabled={disabled}
                        onChange={(v) => patch({ cellPaddingX: v })}
                    />
                    <SliderControl
                        label="Cell padding Y"
                        value={tableStyle.cellPaddingY}
                        min={4}
                        max={24}
                        step={1}
                        disabled={disabled}
                        onChange={(v) => patch({ cellPaddingY: v })}
                    />
                    <SliderControl
                        label="Row height"
                        value={tableStyle.rowHeight}
                        min={0}
                        max={56}
                        step={2}
                        disabled={disabled}
                        formatValue={(v) => (v ? `${v}px` : 'Auto')}
                        onChange={(v) => patch({ rowHeight: v })}
                    />
                    <label className="bi-tf-select">
                        <span className="bi-tf-select-label">Text align</span>
                        <select
                            className="bi-tf-select-input"
                            disabled={disabled}
                            value={tableStyle.textAlign}
                            onChange={(e) => patch({ textAlign: e.target.value })}
                        >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className="bi-tf-group">
                <div className="bi-tf-group-title">Colors</div>
                <div className="bi-tf-group-body bi-tf-colors">
                    <ColorControl label="Header background" value={tableStyle.headerBg} fallback="#f9fafb" disabled={disabled} onChange={(v) => patch({ headerBg: v })} onReset={() => patch({ headerBg: '' })} />
                    <ColorControl label="Header text" value={tableStyle.headerText} fallback="#374151" disabled={disabled} onChange={(v) => patch({ headerText: v })} onReset={() => patch({ headerText: '' })} />
                    <ColorControl label="Row background" value={tableStyle.rowBg} fallback="#ffffff" disabled={disabled} onChange={(v) => patch({ rowBg: v })} onReset={() => patch({ rowBg: '' })} />
                    <ColorControl label="Alternate row" value={tableStyle.altRowBg} fallback="#f8fafc" disabled={disabled} onChange={(v) => patch({ altRowBg: v })} onReset={() => patch({ altRowBg: '' })} />
                    <ColorControl label="Hover row" value={tableStyle.hoverRowBg} fallback="#f3f4f6" disabled={disabled} onChange={(v) => patch({ hoverRowBg: v })} onReset={() => patch({ hoverRowBg: '' })} />
                    <ColorControl label="Cell text" value={tableStyle.cellTextColor} fallback="#4b5563" disabled={disabled} onChange={(v) => patch({ cellTextColor: v })} onReset={() => patch({ cellTextColor: '' })} />
                    <ColorControl label="Border" value={tableStyle.borderColor} fallback="#e5e7eb" disabled={disabled} onChange={(v) => patch({ borderColor: v })} onReset={() => patch({ borderColor: '' })} />
                </div>
            </div>

            <div className="bi-tf-group">
                <div className="bi-tf-group-title">Layout</div>
                <div className="bi-tf-group-body">
                    <div className="bi-tf-toggles">
                        {toggles.map(({ key, label, checked }) => (
                            <label key={key} className="bi-tf-check">
                                <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={checked}
                                    onChange={(e) => patch({ [key]: e.target.checked })}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </div>
                    <SliderControl
                        label="Min column width"
                        value={tableStyle.minColumnWidth}
                        min={48}
                        max={200}
                        step={4}
                        disabled={disabled}
                        onChange={(v) => patch({ minColumnWidth: v })}
                    />
                </div>
            </div>

            {columns.length > 0 && (
                <div className="bi-tf-group">
                    <div className="bi-tf-group-title">Column widths</div>
                    <p className="bi-tf-hint">Leave blank for auto. Enter pixels to fix a column.</p>
                    <div className="bi-tf-col-list">
                        {columns.map((col) => (
                            <label key={col} className="bi-tf-col-row">
                                <span className="bi-tf-col-name" title={col}>{col}</span>
                                <input
                                    type="number"
                                    className="bi-tf-col-input"
                                    min={40}
                                    max={600}
                                    step={4}
                                    placeholder="Auto"
                                    disabled={disabled}
                                    value={tableStyle.columnWidths[col] ?? ''}
                                    onChange={(e) => setColumnWidth(col, e.target.value)}
                                />
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default BITableFormatSection;
