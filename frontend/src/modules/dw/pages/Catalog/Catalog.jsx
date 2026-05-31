import React, { useState, useEffect } from 'react';
import { FiTable, FiFilter, FiEye, FiInfo, FiUploadCloud, FiStar, FiChevronRight, FiBox, FiMoreVertical, FiLink, FiShare2, FiShield, FiPlus, FiSearch, FiLayers, FiDatabase } from 'react-icons/fi';
import { useData } from '../../context/DataContext';
import TableDetailsView from '../../components/Catalog/TableDetailsView';
import SchemaDetailsView from '../../components/Catalog/SchemaDetailsView';
import TablePreviewModal from '../../components/Catalog/TablePreviewModal';
import VolumePanel from '../../components/Catalog/VolumePanel';
import VolumeUploadModal from '../../components/Catalog/VolumeUploadModal';
import TagBadge from '../../components/shared/TagBadge';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import CatalogSidebar from '../../components/Catalog/CatalogSidebar';
import CatalogCreateDropdown from '../../components/Catalog/CatalogCreateDropdown';
import CreateCatalogModal from '../../components/Catalog/CreateCatalogModal';
import CreateSchemaModal from '../../components/Catalog/CreateSchemaModal';
import CreateVolumeModal from '../../components/Catalog/CreateVolumeModal';
import UploadTableDirectModal from '../../components/Catalog/UploadTableDirectModal';
import VolumeDetailsView from '../../components/Catalog/VolumeDetailsView';

const Catalog = () => {
  const { catalogs, isLoading, fetchCatalogs } = useData();
  const [activeTab, setActiveTab] = useState('suggested');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('catalog_favorites') || '[]'); } catch { return []; } });
  const [viewMode, setViewMode] = useState('list');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null); // { type, catalogName, schemaName }
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTable, setPreviewTable] = useState(null);
  const [previewSchema, setPreviewSchema] = useState(null);
  const [previewCatalog, setPreviewCatalog] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [allTags, setAllTags] = useState({});
  const [volumeUploadOpen, setVolumeUploadOpen] = useState(false);
  const [createCatalogOpen, setCreateCatalogOpen] = useState(false);
  const [createSchemaOpen, setCreateSchemaOpen] = useState(false);
  const [createVolumeOpen, setCreateVolumeOpen] = useState(false);
  const [uploadTableOpen, setUploadTableOpen] = useState(false);
  const [volumeRefreshKey, setVolumeRefreshKey] = useState(0);

  useEffect(() => {
    if (catalogs && expandedItems.length === 0) {
      const dbNames = Object.keys(catalogs);
      const initialExpand = [];
      dbNames.forEach(db => {
        initialExpand.push(db);
        if (catalogs[db] && catalogs[db]['public']) initialExpand.push(`${db}-public`);
      });
      if (initialExpand.length > 0) setExpandedItems(initialExpand);
    }
  }, [catalogs, expandedItems.length]);

  const toggleExpand = (id) => setExpandedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleFavorite = (tableId, e) => {
    e?.stopPropagation();
    const newFavs = favorites.includes(tableId) ? favorites.filter(id => id !== tableId) : [...favorites, tableId];
    setFavorites(newFavs);
    localStorage.setItem('catalog_favorites', JSON.stringify(newFavs));
  };

  const allEntities = [];
  // Add Catalogs
  Object.keys(catalogs || {}).forEach(catName => {
    allEntities.push({
      type: 'catalog',
      id: `cat-${catName}`,
      name: catName,
      fullName: catName,
      catalog: { name: catName },
      lastViewed: 'You view frequently'
    });
    
    // Add Schemas
    const schemas = catalogs[catName] || {};
    Object.keys(schemas).filter(schName => schName !== '__meta__').forEach(schName => {
      allEntities.push({
        type: 'schema',
        id: `sch-${catName}-${schName}`,
        name: schName,
        fullName: `${catName}.${schName}`,
        catalog: { name: catName },
        schema: { name: schName },
        lastViewed: 'Recently updated'
      });

      // Add Tables
      const tables = schemas[schName] || {};
      Object.entries(tables).filter(([tblName]) => tblName !== '__meta__').forEach(([tblName, tblData]) => {
        allEntities.push({
          type: 'table',
          id: `tbl-${catName}-${schName}-${tblName}`,
          ...tblData,
          catalog: { name: catName },
          schema: { name: schName },
          fullName: `${catName}.${schName}.${tblName}`
        });
      });
    });
  });

  const filteredEntities = allEntities.filter(item => {
    const q = (filterQuery || searchQuery).toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.fullName?.toLowerCase().includes(q);
  });

  const handleSelectTable = (catalog, schema, table, e) => { 
    e?.stopPropagation(); 
    setSelectedCatalog(catalog); 
    setSelectedSchema(schema); 
    setSelectedTable(table); 
    setSelectedVolume(null);
    setViewMode('detail'); 
  };

  const handleSelectVolume = (volume) => {
    setSelectedVolume(volume);
    setSelectedTable(null);
    setSelectedContainer(null);
    setViewMode('list');
  };

  const handleSelectContainer = (type, catalogName, schemaName) => {
    setSelectedContainer({ type, catalogName, schemaName });
    setViewMode('container_detail');
  };

  const handleBack = () => {
    setSelectedTable(null);
    setSelectedVolume(null);
    setSelectedContainer(null);
    setViewMode('list');
  };

  const handleOpenPreview = (catalog, schema, table, e) => { e?.stopPropagation(); setPreviewCatalog(catalog); setPreviewSchema(schema); setPreviewTable(table); setPreviewOpen(true); };

  // Determine type label for each item
  const getTypeLabel = (table) => {
    if (table.type) return table.type;
    if (table.rowCount != null) return 'Table';
    return 'Table';
  };

  // Reason/context text
  const getReasonText = (table) => {
    if (table.lastViewed) return `You viewed • ${table.lastViewed}`;
    return 'You view frequently';
  };

  // Type icon
  const TypeIcon = ({ type }) => {
    const t = (type || '').toLowerCase();
    if (t === 'catalog') return <FiDatabase size={14} style={{ color: 'var(--df-icon-accent)' }} />;
    if (t === 'schema') return <FiLayers size={14} style={{ color: 'var(--df-icon-accent)' }} />;
    return <FiTable size={14} style={{ color: 'var(--df-icon-accent)' }} />;
  };

  const tabs = [
    { id: 'suggested', label: 'Suggested', icon: '✦' },
    { id: 'favorites', label: 'Favorites', icon: '★' },
    { id: 'recents', label: 'Recents', icon: '⏱' },
    { id: 'volumes', label: 'Volumes', icon: '📁' },
  ];

  return (
    <div className="flex flex-col h-full animate-fadeIn" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: 'var(--df-bg)', color: 'var(--df-text)' }}>
      {/* --- STANDARD HEADER SPANNING FULL PAGE --- */}
      {viewMode === 'list' && (
        <div style={{ padding: '20px 24px 14px 20px', borderBottom: '1px solid var(--df-border-light)', backgroundColor: 'var(--df-bg)', flexShrink: 0 }}>
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--df-strong)', margin: 0 }}>
                Data Catalog
              </h1>
              <p className="text-[14px] mt-1" style={{ color: 'var(--df-text-muted)', opacity: 0.8, margin: 0 }}>
                Discover, manage, and govern your data assets
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 mt-4">
              <button className="dw-btn-secondary flex items-center gap-1.5">
                <FiShare2 size={13} /> Share
              </button>
              <CatalogCreateDropdown onAction={(action) => {
                if (action === 'create-catalog') setCreateCatalogOpen(true);
                else if (action === 'create-schema') setCreateSchemaOpen(true);
                else if (action === 'create-volume') setCreateVolumeOpen(true);
                else if (action === 'upload-table') setUploadTableOpen(true);
                else if (action === 'upload-volume') setVolumeUploadOpen(true);
              }} />
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN LAYOUT (SIDEBAR + CONTENT) --- */}
      <div className="flex flex-1 overflow-hidden" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
        <CatalogSidebar
          isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          isLoading={isLoading} catalogs={catalogs}
          expandedItems={expandedItems} toggleExpand={toggleExpand}
          selectedTable={selectedTable} handleSelectTable={handleSelectTable} favorites={favorites}
          onSelectContainer={handleSelectContainer}
          onSelectVolume={handleSelectVolume}
        />

        {/* ── Collapsed Sidebar Strip ── */}
        {!isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(true)}
            className="flex flex-col items-center flex-shrink-0 cursor-pointer transition-colors"
            style={{
              width: '36px',
              borderRight: '1px solid var(--df-border)',
              backgroundColor: 'var(--df-sidebar-bg)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-bg)'; }}
          >
            <div className="pt-3 pb-2">
              <FiChevronRight size={14} style={{ color: 'var(--df-icon-accent)' }} />
            </div>
            <span className="text-[10px] font-semibold tracking-wider"
              style={{ color: 'var(--df-text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Catalog
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--df-bg)' }}>

          {viewMode === 'detail' && selectedTable ? (
            <TableDetailsView table={selectedTable} schema={selectedSchema} catalog={selectedCatalog} onBack={handleBack} />
          ) : viewMode === 'container_detail' && selectedContainer ? (
            <SchemaDetailsView
              containerInfo={selectedContainer}
              catalogs={catalogs}
              onBack={handleBack}
              onSelectTable={handleSelectTable}
              onSelectVolume={handleSelectVolume}
              onSelectContainer={handleSelectContainer}
              onCreateSchema={() => setCreateSchemaOpen(true)}
              onRefresh={fetchCatalogs}
              onAction={(action) => {
                if (action === 'upload-table') setUploadTableOpen(true);
                else if (action === 'create-volume') setCreateVolumeOpen(true);
              }}
            />
          ) : selectedVolume ? (
            <VolumeDetailsView 
              volume={selectedVolume}
              onBack={handleBack}
              onRefresh={fetchCatalogs}
            />
          ) : (
            <>


            {/* ═══ Tabs + Filter Row ═══ */}
            <div className="flex items-center justify-between px-8" style={{ padding: '24px 32px 16px 32px', borderBottom: '1px solid var(--df-border-light)', flexShrink: 0 }}>
              <div className="flex items-center gap-6">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-2 pb-2 transition-all relative"
                    style={{
                      color: activeTab === tab.id ? 'var(--df-text-accent)' : 'var(--df-text-soft)',
                      fontWeight: activeTab === tab.id ? 600 : 500
                    }}
                  >
                    <span style={{ fontSize: '13px', opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                    <span className="text-[13px]">{tab.label}</span>
                    {activeTab === tab.id && (
                       <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ backgroundColor: 'var(--df-text-accent)' }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Filter Input */}
              <div className="relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--df-text-muted)', zIndex: 1 }} size={14} />
                <input
                  type="text"
                  placeholder="Filter tables..."
                  className="rounded-lg py-2 text-[13px] outline-none transition-all"
                  style={{ 
                    width: 240, 
                    paddingLeft: '36px', 
                    paddingRight: '14px', 
                    border: '1px solid var(--df-border)', 
                    backgroundColor: 'var(--df-bg)', 
                    color: 'var(--df-text)' 
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--df-accent)'; e.target.style.boxShadow = '0 0 0 2px var(--df-accent-soft)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--df-border)'; e.target.style.boxShadow = 'none'; }}
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
              </div>
            </div>

            {/* ═══ Content Area ═══ */}
            <div className="flex-1 overflow-y-auto df-scrollbar">
              {activeTab === 'volumes' ? (
                <div className="py-6 px-8">
                  <VolumePanel 
                    key={volumeRefreshKey} 
                    onConvertDone={() => { setVolumeRefreshKey(k => k + 1); fetchCatalogs(); }} 
                    onSelectVolume={handleSelectVolume}
                  />
                </div>
              ) : isLoading ? (
                <div className="py-6 px-8"><LoadingSkeleton count={8} height="48px" gap="8px" /></div>
              ) : (
                <table className="w-full text-left mt-4" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className="text-[11px] font-bold uppercase tracking-wider text-left"
                        style={{
                          width: '35%',
                          padding: '14px 16px 14px 32px',
                          color: 'var(--df-text-soft)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg-secondary)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        Name
                      </th>
                      <th className="text-[11px] font-bold uppercase tracking-wider text-left"
                        style={{
                          width: '50%',
                          padding: '14px 16px',
                          color: 'var(--df-text-soft)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg-secondary)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        {activeTab === 'suggested' ? 'Reason for suggestion' : 'Details'}
                      </th>
                      <th className="text-[11px] font-bold uppercase tracking-wider text-left"
                        style={{
                          width: '15%',
                          padding: '14px 32px 14px 16px',
                          color: 'var(--df-text-soft)',
                          borderBottom: '1px solid var(--df-border-light)',
                          backgroundColor: 'var(--df-bg-secondary)',
                          position: 'sticky', top: 0, zIndex: 5
                        }}>
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntities
                      .filter((item) => {
                        if (activeTab === 'favorites') return favorites.includes(item.id);
                        return true;
                      })
                      .map((item) => (
                        <tr
                          key={item.id}
                          onClick={(e) => {
                            if (item.type === 'table') {
                              handleSelectTable(item.catalog, item.schema, item, e);
                            } else {
                              handleSelectContainer(item.type, item.catalog?.name, item.schema?.name);
                            }
                          }}
                          className="group transition-colors cursor-pointer border-b last:border-0"
                          style={{ borderColor: 'var(--df-border-light)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-sidebar-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {/* Name Cell */}
                          <td style={{ padding: '16px 16px 16px 32px', borderBottom: '1px solid var(--df-border-light)' }}>
                            <div className="flex items-center gap-3">
                              <TypeIcon type={item.type} />
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] truncate"
                                  style={{ color: 'var(--df-strong)', fontWeight: 500 }}>
                                  {item.name}
                                </span>
                                {item.type !== 'catalog' && (
                                  <span className="text-[12px] truncate mt-0.5"
                                    style={{ color: 'var(--df-text-muted)' }}>
                                    {item.fullName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Reason / Details Cell */}
                          <td style={{ padding: '16px 16px', borderBottom: '1px solid var(--df-border-light)' }}>
                            <span className="text-[13px]" style={{ color: 'var(--df-text-soft)' }}>
                              {item.lastViewed || getReasonText(item)}
                            </span>
                          </td>

                          {/* Type Cell */}
                          <td style={{ padding: '16px 32px 16px 16px', borderBottom: '1px solid var(--df-border-light)' }}>
                            <div className="flex items-center">
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border"
                                style={{
                                  backgroundColor: 'var(--df-accent-soft)',
                                  color: 'var(--df-text-accent)',
                                  borderColor: 'var(--df-border-light)'
                                }}
                              >
                                {item.type.toUpperCase()}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {!isLoading && filteredEntities.length === 0 && activeTab !== 'volumes' && (
                <div className="py-20 text-center">
                  <p className="text-[14px]" style={{ color: 'var(--df-strong)', fontWeight: 500 }}>No items found</p>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--df-text-muted)' }}>Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>

      <TablePreviewModal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} table={previewTable} schema={previewSchema} catalog={previewCatalog} />
      <VolumeUploadModal isOpen={volumeUploadOpen} onClose={() => setVolumeUploadOpen(false)} onUploaded={() => { setVolumeRefreshKey(k => k + 1); setActiveTab('volumes'); }} />
      <CreateCatalogModal isOpen={createCatalogOpen} onClose={() => setCreateCatalogOpen(false)} onCreated={() => fetchCatalogs()} />
      <CreateSchemaModal isOpen={createSchemaOpen} onClose={() => setCreateSchemaOpen(false)} onCreated={() => fetchCatalogs()} initialCatalog={selectedContainer?.catalogName} />
      <CreateVolumeModal isOpen={createVolumeOpen} onClose={() => setCreateVolumeOpen(false)} onCreated={() => { setVolumeRefreshKey(k => k + 1); setActiveTab('volumes'); }} />
      <UploadTableDirectModal 
        isOpen={uploadTableOpen} 
        onClose={() => setUploadTableOpen(false)} 
        onUploaded={() => fetchCatalogs()}
        catalog={selectedContainer?.catalogName || 'etldb'}
        schema={selectedContainer?.schemaName || 'public'}
      />
    </div>
  );
};

export default Catalog;
