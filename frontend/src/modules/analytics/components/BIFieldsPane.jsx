import React, { useMemo, useState, useEffect } from 'react';
import { Search, Database, ChevronDown, ChevronRight, Hash, Type, Calendar, CheckSquare, Calculator, MoreVertical, Edit, Copy, Trash2, Folder, Archive, AlertCircle } from 'lucide-react';

const BIFieldsPane = ({
    schema,
    dataset,
    fileName,
    measures = [],
    activeColumn,
    onSelectColumn,
    isFieldsRefreshing = false,
    onEditMeasure,
    onDuplicateMeasure,
    onDeleteMeasure,
    onArchiveMeasure,
    onDeprecateMeasure
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(true);
    const [isNumericMeasuresExpanded, setIsNumericMeasuresExpanded] = useState(true);
    const [isMeasuresExpanded, setIsMeasuresExpanded] = useState(true);
    
    // Grouped categories expansion state
    const [expandedCategories, setExpandedCategories] = useState({
        Financial: true,
        Sales: true,
        Marketing: true,
        Operations: true,
        HR: true,
        Custom: true
    });

    const [activeMenuId, setActiveMenuId] = useState(null);
    const [hoveredMeasure, setHoveredMeasure] = useState(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

    // Close menu when clicking elsewhere
    useEffect(() => {
        const handleOutsideClick = () => setActiveMenuId(null);
        window.addEventListener('click', handleOutsideClick);
        return () => window.removeEventListener('click', handleOutsideClick);
    }, []);

    const toggleCategory = (cat) => {
        setExpandedCategories(prev => ({
            ...prev,
            [cat]: !prev[cat]
        }));
    };

    const getIconForType = (col) => {
        if (col.isCustom) return <Calculator size={14} className="bi-type-calc" style={{ color: '#7a1e3a' }} />;
        if (!col.data_type) return <Type size={14} />;
        const t = col.data_type.toLowerCase();
        if (t.includes('int') || t.includes('float') || t.includes('numeric')) return <Hash size={14} className="bi-type-num" />;
        if (t.includes('date') || t.includes('time')) return <Calendar size={14} className="bi-type-date" />;
        if (t.includes('bool')) return <CheckSquare size={14} className="bi-type-bool" />;
        return <Type size={14} className="bi-type-text" />;
    };

    const getType = (col) => String(col?.data_type || '').toLowerCase();
    const numericGuessMap = useMemo(() => {
        const map = new Map();
        const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
        if (!rows.length) return map;

        const fields = (schema || []).map((c) => c?.column_name || c?.name).filter(Boolean);
        const sample = rows.slice(0, 250);
        const looksNumeric = (v) => {
            if (v === null || v === undefined) return false;
            if (typeof v === 'number') return Number.isFinite(v);
            if (typeof v === 'boolean') return false;
            const s = String(v).trim();
            if (!s) return false;
            const normalized = s.replace(/[$,%\s]/g, '').replace(/,/g, '');
            if (!normalized) return false;
            const n = Number(normalized);
            return Number.isFinite(n);
        };

        fields.forEach((f) => {
            let present = 0;
            let numeric = 0;
            sample.forEach((r) => {
                if (!r || !Object.prototype.hasOwnProperty.call(r, f)) return;
                const v = r[f];
                if (v === null || v === undefined || String(v).trim() === '') return;
                present += 1;
                if (looksNumeric(v)) numeric += 1;
            });
            if (present > 0) map.set(f, numeric > 0);
        });

        return map;
    }, [dataset, schema]);

    const isNumeric = (col) => {
        const tRaw = getType(col);
        const colName = col?.column_name || col?.name;
        if (!tRaw) return numericGuessMap.get(colName) === true;
        const t = tRaw.replace(/[^a-z0-9]/g, '');
        return (
            t.includes('numeric') ||
            t.includes('number') ||
            t.includes('int') ||
            t.includes('float') ||
            t.includes('double') ||
            t.includes('decimal') ||
            t.includes('real') ||
            numericGuessMap.get(colName) === true
        );
    };

    const isDimension = () => true;

    const filteredSchema = (schema || [])
        .filter((s) => {
            const name = (s?.column_name ?? '').toString();
            if (!name) return false;
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        })
        .sort((a, b) => String(a?.column_name || '').localeCompare(String(b?.column_name || '')));
    const filteredDimensions = filteredSchema.filter(isDimension);
    const filteredNumericFields = filteredSchema.filter(isNumeric);

    const filteredMeasures = measures?.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    // Group measures strictly by the enterprise semantic categories
    const groupedMeasures = useMemo(() => {
        const groups = {
            Financial: [],
            Sales: [],
            Marketing: [],
            Operations: [],
            HR: [],
            Custom: []
        };
        filteredMeasures.forEach(m => {
            let cat = m.category || 'Custom';
            if (groups[cat]) {
                groups[cat].push(m);
            } else {
                groups.Custom.push(m);
            }
        });
        // Return only groups that have measures to keep the pane uncluttered
        return Object.fromEntries(
            Object.entries(groups).filter(([_, items]) => items.length > 0)
        );
    }, [filteredMeasures]);

    const datasetName = fileName || 'Dataset';

    return (
        <div className="bi-pane-view">
            <div className="bi-pane-header">
                <span className="bi-pane-title">Fields</span>
            </div>

            {isFieldsRefreshing && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    margin: '0 12px 10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                }}>
                    <div className="bi-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Refreshing fields…
                </div>
            )}

            <div className="bi-pane-search">
                <Search size={14} />
                <input
                    type="text"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={isFieldsRefreshing}
                />
            </div>

            <div className="bi-pane-scroll" style={{ padding: '12px' }}>
                {/* ── Measures Section (Grouped by Category) ── */}
                {measures.length > 0 && (
                    <div className="bi-field-tree" style={{ marginBottom: 16 }}>
                        <div
                            className="bi-tree-table"
                            onClick={() => setIsMeasuresExpanded(!isMeasuresExpanded)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer' }}
                        >
                            {isMeasuresExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Calculator size={14} className="bi-database-icon" style={{ color: '#6366f1' }} />
                            <span className="bi-table-name" style={{ color: '#6366f1' }}>Measures</span>
                        </div>
                        {isMeasuresExpanded && (
                            <div className="bi-tree-columns" style={{ paddingLeft: '16px', marginTop: '4px' }}>
                                {Object.entries(groupedMeasures).map(([categoryName, catMeasures]) => (
                                    <div key={categoryName} className="bi-category-node" style={{ marginBottom: '8px' }}>
                                        <div 
                                            className="bi-category-header"
                                            onClick={() => toggleCategory(categoryName)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '3px 0' }}
                                        >
                                            {expandedCategories[categoryName] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                            <Folder size={11} style={{ color: '#94a3b8' }} />
                                            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.03em' }}>
                                                {categoryName} ({catMeasures.length})
                                            </span>
                                        </div>
                                        {expandedCategories[categoryName] && (
                                            <div className="bi-category-items" style={{ paddingLeft: '14px', marginTop: '2px' }}>
                                                {catMeasures.map((measure) => (
                                                    <div 
                                                        key={measure.id || measure.name} 
                                                        className={`bi-tree-item bi-measure-item ${activeColumn?.column_name === measure.name ? 'active' : ''}`}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', measure.name);
                                                            e.dataTransfer.effectAllowed = 'copyMove';
                                                        }}
                                                        onClick={() => onSelectColumn && onSelectColumn({ column_name: measure.name, data_type: 'numeric', isCustom: true })}
                                                        onMouseEnter={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setHoveredMeasure(measure);
                                                            setHoverPos({
                                                                x: rect.left - 290,
                                                                y: rect.top
                                                            });
                                                        }}
                                                        onMouseLeave={() => {
                                                            setHoveredMeasure(null);
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', position: 'relative' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                                            <div className="bi-item-icon" style={{ color: '#6366f1' }}>
                                                                <Calculator size={13} />
                                                            </div>
                                                            <span 
                                                                className="bi-item-name" 
                                                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                                                            >
                                                                {measure.display_name || measure.name}
                                                            </span>
                                                            {measure.certification_status === 'Certified' && (
                                                                <span 
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        background: '#dcfce7',
                                                                        color: '#14532d',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '10px',
                                                                        fontWeight: '600',
                                                                        marginLeft: '4px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px'
                                                                    }}
                                                                    title="Certified governed business asset"
                                                                >
                                                                    ✓ Certified
                                                                </span>
                                                            )}
                                                            {measure.certification_status === 'Under Review' && (
                                                                <span 
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        background: '#fef3c7',
                                                                        color: '#713f12',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '10px',
                                                                        fontWeight: '600',
                                                                        marginLeft: '4px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px'
                                                                    }}
                                                                    title="Under Review governed business asset"
                                                                >
                                                                    Review
                                                                </span>
                                                            )}
                                                            {(!measure.certification_status || measure.certification_status === 'Uncertified') && (
                                                                <span 
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        background: '#f1f5f9',
                                                                        color: '#475569',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '10px',
                                                                        fontWeight: '600',
                                                                        marginLeft: '4px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px'
                                                                    }}
                                                                    title="Uncertified business asset"
                                                                >
                                                                    Uncertified
                                                                </span>
                                                            )}
                                                            {measure.status === 'Archived' && (
                                                                <span 
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        background: '#f1f5f9',
                                                                        color: '#64748b',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '10px',
                                                                        fontWeight: '600',
                                                                        marginLeft: '4px'
                                                                    }}
                                                                >
                                                                    Archived
                                                                </span>
                                                            )}
                                                            {measure.status === 'Deprecated' && (
                                                                <span 
                                                                    style={{
                                                                        fontSize: '9px',
                                                                        background: '#fef3c7',
                                                                        color: '#d97706',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '10px',
                                                                        fontWeight: '600',
                                                                        marginLeft: '4px'
                                                                    }}
                                                                >
                                                                    Deprecated
                                                                </span>
                                                            )}
                                                        </div>


                                                        {/* Context Actions Menu */}
                                                        <div className="bi-measure-actions-wrapper" style={{ position: 'relative' }}>
                                                            <button 
                                                                className="bi-measure-menu-trigger" 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveMenuId(activeMenuId === measure.id ? null : measure.id);
                                                                }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8', borderRadius: '4px' }}
                                                            >
                                                                <MoreVertical size={13} />
                                                            </button>
                                                            {activeMenuId === measure.id && (
                                                                <div 
                                                                    className="bi-measure-dropdown-menu"
                                                                    style={{ 
                                                                        position: 'absolute', 
                                                                        right: 0, 
                                                                        top: '20px', 
                                                                        background: '#ffffff', 
                                                                        border: '1px solid #cbd5e1', 
                                                                        borderRadius: '6px', 
                                                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', 
                                                                        zIndex: 1000, 
                                                                        minWidth: '125px',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        padding: '4px 0'
                                                                    }}
                                                                >
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); onEditMeasure && onEditMeasure(measure); }}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', fontSize: '11.5px', color: '#334155', cursor: 'pointer' }}
                                                                    >
                                                                        <Edit size={11} /> Rename / Edit
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); onDuplicateMeasure && onDuplicateMeasure(measure); }}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', fontSize: '11.5px', color: '#334155', cursor: 'pointer' }}
                                                                    >
                                                                        <Copy size={11} /> Duplicate
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); onArchiveMeasure && onArchiveMeasure(measure); }}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', fontSize: '11.5px', color: '#334155', cursor: 'pointer' }}
                                                                    >
                                                                        <Archive size={11} /> Archive
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); onDeprecateMeasure && onDeprecateMeasure(measure); }}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', fontSize: '11.5px', color: '#64748b', cursor: 'pointer' }}
                                                                    >
                                                                        <AlertCircle size={11} /> Deprecate
                                                                    </button>
                                                                    <button 
                                                                        className="delete-action" 
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); onDeleteMeasure && onDeleteMeasure(measure); }}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', fontSize: '11.5px', color: '#ef4444', cursor: 'pointer' }}
                                                                    >
                                                                        <Trash2 size={11} /> Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {filteredMeasures.length === 0 && (
                                    <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
                                        No measures match search
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Dimensions ── */}
                <div className="bi-field-tree">
                    <div
                        className="bi-tree-table"
                        onClick={() => setIsDimensionsExpanded(!isDimensionsExpanded)}
                    >
                        {isDimensionsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Database size={14} className="bi-database-icon" />
                        <span className="bi-table-name">{datasetName} Dimensions</span>
                    </div>

                    {isDimensionsExpanded && (
                        <div className="bi-tree-columns">
                            {filteredDimensions.map(col => (
                                <div
                                    key={col.column_name}
                                    className={`bi-tree-item ${activeColumn?.column_name === col.column_name ? 'active' : ''}`}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', col.column_name);
                                        e.dataTransfer.effectAllowed = 'copyMove';
                                    }}
                                    onClick={() => onSelectColumn && onSelectColumn(col)}
                                >
                                    <div className="bi-item-icon">
                                        {getIconForType(col)}
                                    </div>
                                    <span className="bi-item-name">{col.column_name}</span>
                                </div>
                            ))}
                            {filteredDimensions.length === 0 && (
                                <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    No dimensions found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Numeric Measures ── */}
                <div className="bi-field-tree" style={{ marginTop: 12 }}>
                    <div
                        className="bi-tree-table"
                        onClick={() => setIsNumericMeasuresExpanded(!isNumericMeasuresExpanded)}
                    >
                        {isNumericMeasuresExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Database size={14} className="bi-database-icon" />
                        <span className="bi-table-name">{datasetName} Measures</span>
                    </div>

                    {isNumericMeasuresExpanded && (
                        <div className="bi-tree-columns">
                            {filteredNumericFields.map(col => (
                                <div
                                    key={`measure-${col.column_name}`}
                                    className={`bi-tree-item ${activeColumn?.column_name === col.column_name ? 'active' : ''}`}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', col.column_name);
                                        e.dataTransfer.effectAllowed = 'copyMove';
                                    }}
                                    onClick={() => onSelectColumn && onSelectColumn(col)}
                                >
                                    <div className="bi-item-icon">
                                        {getIconForType(col)}
                                    </div>
                                    <span className="bi-item-name">{col.column_name}</span>
                                </div>
                            ))}
                            {filteredNumericFields.length === 0 && (
                                <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    No numeric measures found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {filteredSchema.length === 0 && filteredMeasures.length === 0 && (
                    <div className="bi-field-tree" style={{ marginTop: 12 }}>
                        <div className="bi-tree-columns">
                            <div className="bi-tree-item" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                No fields found
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {hoveredMeasure && (
                <div 
                    className="premium-metadata-tooltip"
                    style={{
                        position: 'fixed',
                        left: `${hoverPos.x}px`,
                        top: `${hoverPos.y}px`,
                        width: '280px',
                        backgroundColor: 'var(--df-panel, #ffffff)',
                        border: '1px solid var(--df-border, #cbd5e1)',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        zIndex: 9999,
                        pointerEvents: 'none',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        color: 'var(--df-text, #334155)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--df-border, #e2e8f0)', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--df-strong, #0f172a)' }}>
                            {hoveredMeasure.display_name || hoveredMeasure.name}
                        </span>
                        <span style={{ 
                            fontSize: '9px', 
                            background: hoveredMeasure.certification_status === 'Certified' ? '#dcfce7' : (hoveredMeasure.certification_status === 'Under Review' ? '#fef3c7' : '#f1f5f9'),
                            color: hoveredMeasure.certification_status === 'Certified' ? '#14532d' : (hoveredMeasure.certification_status === 'Under Review' ? '#713f12' : '#475569'),
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '700'
                        }}>
                            {hoveredMeasure.certification_status === 'Certified' ? '✓ Certified' : (hoveredMeasure.certification_status === 'Under Review' ? 'Review' : 'Uncertified')}
                        </span>
                    </div>
                    {hoveredMeasure.description && (
                        <div style={{ fontSize: '11px', color: 'var(--df-text-soft, #475569)', lineHeight: '1.4' }}>
                            {hoveredMeasure.description}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--df-text-muted, #64748b)', letterSpacing: '0.03em' }}>Formula</span>
                        <pre style={{ 
                            margin: 0, 
                            padding: '6px', 
                            background: 'var(--df-bg-secondary, #f8fafc)', 
                            border: '1px solid var(--df-border, #cbd5e1)', 
                            borderRadius: '4px', 
                            fontFamily: 'monospace', 
                            fontSize: '11.5px', 
                            color: 'var(--df-accent, #4f46e5)', 
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                        }}>
                            {hoveredMeasure.expression}
                        </pre>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px', paddingTop: '4px', borderTop: '1px solid var(--df-border, #e2e8f0)' }}>
                        <div>
                            <span style={{ color: 'var(--df-text-muted, #64748b)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>Category</span>
                            <span style={{ fontWeight: 600, color: 'var(--df-text, #334155)' }}>{hoveredMeasure.category || 'Custom'}</span>
                        </div>
                        <div>
                            <span style={{ color: 'var(--df-text-muted, #64748b)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>Format</span>
                            <span style={{ fontWeight: 600, color: 'var(--df-text, #334155)' }}>{hoveredMeasure.format || 'General'}</span>
                        </div>
                        {hoveredMeasure.owner && (
                            <div>
                                <span style={{ color: 'var(--df-text-muted, #64748b)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>Owner</span>
                                <span style={{ fontWeight: 600, color: 'var(--df-text, #334155)' }}>{hoveredMeasure.owner}</span>
                            </div>
                        )}
                        <div>
                            <span style={{ color: 'var(--df-text-muted, #64748b)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>Status</span>
                            <span style={{ 
                                fontWeight: 700,
                                color: hoveredMeasure.status === 'Active' ? '#16a34a' : (hoveredMeasure.status === 'Deprecated' ? '#d97706' : '#64748b')
                            }}>{hoveredMeasure.status || 'Active'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BIFieldsPane;
