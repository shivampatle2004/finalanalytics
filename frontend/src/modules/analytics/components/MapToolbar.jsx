import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Search, Download, Layers, RotateCcw, Map } from 'lucide-react';

export const MapToolbar = ({
  visualType = 'bubble',
  onVisualTypeChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitBounds,
  onSearch,
  onExport,
  isViewOnly = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
    }
  };

  return (
    <div className="map-toolbar">
      <div className="map-toolbar-left">
        {/* Visual Type Switcher */}
        <div className="map-btn-group" role="group" aria-label="Map visual types">
          {[
            { id: 'bubble', label: 'Bubble' },
            { id: 'category', label: 'Category' },
            { id: 'cluster', label: 'Cluster' },
            { id: 'heat', label: 'Heat' },
            { id: 'filled', label: 'Filled' }
          ].map(type => (
            <button
              key={type.id}
              type="button"
              className={`map-group-btn ${visualType === type.id ? 'active' : ''}`}
              onClick={() => onVisualTypeChange(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="map-toolbar-right">
        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="map-search-wrapper">
          <input
            type="text"
            className="map-search-input"
            placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="map-search-btn" aria-label="Search">
            <Search size={14} />
          </button>
        </form>

        {/* View Controls */}
        <button type="button" className="map-btn" onClick={onZoomIn} title="Zoom In" aria-label="Zoom In">
          <ZoomIn size={14} />
        </button>
        <button type="button" className="map-btn" onClick={onZoomOut} title="Zoom Out" aria-label="Zoom Out">
          <ZoomOut size={14} />
        </button>
        <button type="button" className="map-btn" onClick={onFitBounds} title="Auto-Fit Bounds" aria-label="Auto-Fit Bounds">
          <Maximize2 size={14} />
        </button>
        <button type="button" className="map-btn" onClick={onResetView} title="Reset View" aria-label="Reset View">
          <RotateCcw size={14} />
        </button>

        {/* Export Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="map-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="Export Options"
            aria-label="Export Data"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
          
          {showExportMenu && (
            <div
              style={{
                position: 'absolute',
                top: '36px',
                right: 0,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 2000,
                width: '120px',
                display: 'flex',
                flexDirection: 'column',
                padding: '4px 0'
              }}
            >
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 12px',
                  fontSize: '11px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#334155'
                }}
                onClick={() => {
                  if (onExport) onExport('csv');
                  setShowExportMenu(false);
                }}
              >
                Export CSV
              </button>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 12px',
                  fontSize: '11px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#334155'
                }}
                onClick={() => {
                  if (onExport) onExport('json');
                  setShowExportMenu(false);
                }}
              >
                Export JSON
              </button>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 12px',
                  fontSize: '11px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#334155'
                }}
                onClick={() => {
                  window.print();
                  setShowExportMenu(false);
                }}
              >
                Print Map
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapToolbar;
