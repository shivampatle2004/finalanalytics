import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Search, Download, RotateCcw } from 'lucide-react';

export const MapToolbar = ({
  visualType = 'bubble',
  onVisualTypeChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitBounds,
  onSearch,
  onExport,
  variant = 'sidebar',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const isSidebar = variant === 'sidebar';
  const isCompact = variant === 'compact';

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
    }
  };

  const visualTypes = [
    { id: 'bubble', label: 'Bubble' },
    { id: 'category', label: 'Category' },
    { id: 'cluster', label: 'Cluster' },
    { id: 'heat', label: 'Heat' },
    { id: 'filled', label: 'Filled' },
  ];

  if (isCompact) {
    return (
      <div className="map-zoom-control" aria-label="Map zoom controls">
        <button type="button" className="map-zoom-control-btn" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
          <ZoomIn size={15} />
        </button>
        <button type="button" className="map-zoom-control-btn" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <ZoomOut size={15} />
        </button>
        <button type="button" className="map-zoom-control-btn" onClick={onFitBounds} title="Fit bounds" aria-label="Fit bounds">
          <Maximize2 size={14} />
        </button>
        <button type="button" className="map-zoom-control-btn" onClick={onResetView} title="Reset view" aria-label="Reset view">
          <RotateCcw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`map-toolbar${isSidebar ? ' map-toolbar--sidebar' : ''}`}>
      <section className="map-panel-section">
        <h4 className="map-panel-label">Map style</h4>
        <div className="map-style-pills" role="group" aria-label="Map visual types">
          {visualTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`map-style-pill${visualType === type.id ? ' active' : ''}`}
              onClick={() => onVisualTypeChange(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </section>

      <section className="map-panel-section">
        <h4 className="map-panel-label">Search</h4>
        <form onSubmit={handleSearchSubmit} className="map-panel-search">
          <Search size={14} className="map-panel-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="map-panel-search-input"
            placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </section>

      <section className="map-panel-section">
        <h4 className="map-panel-label">View</h4>
        <div className="map-view-strip" role="group" aria-label="Map view controls">
          <button type="button" className="map-view-strip-btn" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button type="button" className="map-view-strip-btn" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button type="button" className="map-view-strip-btn" onClick={onFitBounds} title="Fit bounds" aria-label="Fit bounds">
            <Maximize2 size={14} />
          </button>
          <button type="button" className="map-view-strip-btn" onClick={onResetView} title="Reset view" aria-label="Reset view">
            <RotateCcw size={14} />
          </button>
        </div>
      </section>

      <section className="map-panel-section map-panel-section--footer">
        <div className="map-export-wrap">
          <button
            type="button"
            className="map-export-trigger"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="Export options"
            aria-label="Export data"
            aria-expanded={showExportMenu}
          >
            <Download size={14} />
            <span>Export data</span>
          </button>

          {showExportMenu && (
            <div className="map-export-menu map-export-menu--panel">
              <button
                type="button"
                className="map-export-menu-item"
                onClick={() => {
                  if (onExport) onExport('csv');
                  setShowExportMenu(false);
                }}
              >
                CSV
              </button>
              <button
                type="button"
                className="map-export-menu-item"
                onClick={() => {
                  if (onExport) onExport('json');
                  setShowExportMenu(false);
                }}
              >
                JSON
              </button>
              <button
                type="button"
                className="map-export-menu-item"
                onClick={() => {
                  window.print();
                  setShowExportMenu(false);
                }}
              >
                Print
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default MapToolbar;
