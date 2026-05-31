import React, { useState } from 'react';
import { FiBook, FiDatabase, FiChevronDown } from 'react-icons/fi';

const CatalogSelector = ({ catalogs, selectedContext, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 py-1 rounded-md transition-all hover:bg-[var(--df-sidebar-hover)]"
                style={{ color: 'var(--df-text-soft)' }}
            >
                <div className="flex items-center gap-1.5">
                  <FiBook size={13} className="opacity-60" />
                  <span className="text-[12px] font-medium tracking-tight">{selectedContext.catalog}</span>
                </div>
                <span className="font-black opacity-30 text-[10px]">.</span>
                <div className="flex items-center gap-1.5">
                  <FiDatabase size={13} className="opacity-60" />
                  <span className="text-[12px] font-medium tracking-tight">{selectedContext.schema}</span>
                </div>
                <FiChevronDown size={12} className="opacity-40 ml-0.5" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute left-0 mt-1 w-64 rounded-xl py-2 z-30 shadow-lg border" style={{ backgroundColor: 'var(--df-card-bg)', borderColor: 'var(--df-border)' }}>
                        <div className="px-4 py-2 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--df-text-muted)' }}>Select Catalog . Schema</div>
                        {catalogs && Object.entries(catalogs).map(([catName, schemas]) => (
                            <div key={catName}>
                                <div className="px-4 py-1.5 text-xs font-medium" style={{ color: 'var(--df-text)' }}>{catName}</div>
                                {Object.keys(schemas).map(schName => (
                                    <button
                                        key={schName}
                                        className="w-full text-left px-8 py-1.5 text-[13px] transition-colors hover:bg-[var(--df-sidebar-hover)]"
                                        style={{ color: 'var(--df-text-soft)' }}
                                        onClick={() => { onSelect({ catalog: catName, schema: schName }); setIsOpen(false); }}
                                    >
                                        {schName}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default CatalogSelector;
