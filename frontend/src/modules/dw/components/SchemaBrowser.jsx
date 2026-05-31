import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import {
  FiChevronDown, FiChevronRight, FiArchive, FiLayers, FiDatabase, FiTable, FiColumns, FiSearch, FiPlay
} from 'react-icons/fi';

const sanitizeName = (name) => {
  if (!name) return name;
  let sanitized = name;
  if (sanitized.startsWith('dt_')) sanitized = sanitized.substring(3);
  const hexSuffixMatch = sanitized.match(/_[a-f0-9]{8}$/i);
  if (hexSuffixMatch) sanitized = sanitized.substring(0, hexSuffixMatch.index);
  return sanitized;
};

const SchemaBrowser = ({ onTablePreview, hideHeader = false }) => {
  const { catalogs } = useData();
  const [expanded, setExpanded] = useState({ 'sales_catalog': true });
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-full w-full select-none bg-transparent" style={{ boxSizing: 'border-box' }}>
      {!hideHeader && (
        <div className="px-4 pt-5 pb-2 border-b border-[var(--df-border-light)] shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-[10px] font-bold tracking-wider uppercase text-[var(--df-text-muted)]">Schema Browser</h2>
          </div>
          <div className="search-bar w-full">
            <FiSearch className="search-icon" size={13} />
            <input
              type="text"
              placeholder="Filter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {hideHeader && (
        <div className="p-4 pb-2 w-full shrink-0">
          <div className="search-bar w-full">
            <FiSearch className="search-icon" size={13} />
            <input
              type="text"
              placeholder="Filter schemas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 df-scrollbar">
        {catalogs && Object.entries(catalogs).map(([catalogName, schemas]) => (
          <div key={catalogName} className="mb-1.5">
            <div
              className="flex items-center gap-2 py-1 px-1.5 rounded-lg cursor-pointer group transition-all"
              onClick={() => toggleExpand(catalogName)}
              style={{ color: 'var(--df-strong)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {expanded[catalogName] ? <FiChevronDown size={11} style={{ color: 'var(--df-text-muted)' }} /> : <FiChevronRight size={11} style={{ color: 'var(--df-text-muted)' }} />}
              <FiDatabase size={13} strokeWidth={2.2} style={{ color: 'var(--df-accent)' }} />
              <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--df-strong)' }}>{catalogName}</span>
            </div>

            {expanded[catalogName] && (
              <div className="ml-2.5 pl-2 mt-0.5" style={{ borderLeft: '1px solid var(--df-border-light)' }}>
                {Object.entries(schemas).map(([schemaName, tables]) => (
                  <div key={`${catalogName}-${schemaName}`} className="mb-0.5">
                    <div
                      className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg cursor-pointer group transition-colors"
                      onClick={() => toggleExpand(`${catalogName}-${schemaName}`)}
                      style={{ color: 'var(--df-strong)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {expanded[`${catalogName}-${schemaName}`] ? <FiChevronDown size={11} style={{ color: 'var(--df-text-muted)' }} /> : <FiChevronRight size={11} style={{ color: 'var(--df-text-muted)' }} />}
                      <FiLayers size={12} style={{ color: 'var(--df-text-muted)' }} />
                      <span className="text-[11.5px] font-medium" style={{ color: 'var(--df-strong)' }}>{schemaName}</span>
                    </div>

                    {expanded[`${catalogName}-${schemaName}`] && (
                      <div className="ml-2.5 pl-2 mt-0.5" style={{ borderLeft: '1px solid var(--df-border-light)' }}>
                        {Object.entries(tables)
                          .filter(([tableName]) => tableName !== '__meta__' && tableName.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map(([tableName, tableData]) => (
                            <TableItem
                              key={tableName}
                              name={tableName}
                              columns={tableData.columns}
                              onPreview={() => {
                                // Use physical schema name for the SQL preview query
                                const physicalSchema = tableData.physicalSchema || schemaName;
                                if (onTablePreview) onTablePreview(`"${physicalSchema}".${tableName}`);
                              }}
                              schemaName={schemaName}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const TableItem = ({ name, columns, onPreview, schemaName }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/sql-table', `${schemaName}.${name}`);
  };

  return (
    <div className="mb-0.5" draggable onDragStart={handleDragStart} title="Drag to editor">
      <div
        className="flex items-center justify-between py-1 px-1.5 rounded-lg group transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <div className="flex items-center gap-1.5 cursor-pointer flex-1" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <FiChevronDown size={10} style={{ color: 'var(--df-text-muted)' }} /> : <FiChevronRight size={10} style={{ color: 'var(--df-text-muted)' }} />}
          <FiTable size={12} style={{ color: 'var(--df-strong)' }} />
          <span className="text-[11.5px] font-medium" style={{ color: 'var(--df-text-muted)' }}>{sanitizeName(name)}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          className="p-0.5 px-1 flex items-center gap-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: 'var(--df-text-muted)' }}
          title="Preview Data"
        >
          <FiPlay size={8} className="fill-current" />
        </button>
      </div>

      {isOpen && (
        <div className="ml-2.5 pl-2 mt-0.5" style={{ borderLeft: '1px solid var(--df-border-light)' }}>
          {columns.map(col => (
            <div key={col} className="flex items-center gap-1.5 py-0.5 px-1.5 rounded-md cursor-default group transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <FiColumns size={10} style={{ color: 'var(--df-text-muted)' }} />
              <span className="text-[10.5px] font-medium" style={{ color: 'var(--df-text-muted)' }}>{col}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchemaBrowser;
