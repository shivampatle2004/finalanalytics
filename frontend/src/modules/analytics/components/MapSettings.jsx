import React from 'react';

export const MapSettings = ({
  settings = {},
  onSettingsChange
}) => {
  const handleChange = (key, value) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Map Theme Layers */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-tile-theme">Map Tile Theme</label>
        <select
          id="setting-tile-theme"
          className="map-setting-control"
          value={settings.mapTheme || 'light'}
          onChange={(e) => handleChange('mapTheme', e.target.value)}
        >
          <option value="light">OpenStreetMap Light</option>
          <option value="dark">CartoDB Dark Matter</option>
          <option value="osm">Standard OpenStreetMap</option>
          <option value="hot">Humanitarian OpenStreetMap</option>
        </select>
      </div>

      {/* Bubble Primary Color */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-bubble-color">Primary Visual Color</label>
        <div className="map-setting-flex">
          <input
            id="setting-bubble-color"
            type="color"
            className="map-setting-color-picker"
            value={settings.bubbleColor || '#3b82f6'}
            onChange={(e) => handleChange('bubbleColor', e.target.value)}
          />
          <span style={{ fontSize: '11px', color: '#64748b' }}>{settings.bubbleColor || '#3b82f6'}</span>
        </div>
      </div>

      {/* Bubble Scale Limits */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-min-bubble">Bubble Min Radius ({settings.minBubbleSize || 6}px)</label>
        <input
          id="setting-min-bubble"
          type="range"
          min="2"
          max="15"
          className="map-setting-control"
          value={settings.minBubbleSize || 6}
          onChange={(e) => handleChange('minBubbleSize', parseInt(e.target.value))}
        />
      </div>

      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-max-bubble">Bubble Max Radius ({settings.maxBubbleSize || 30}px)</label>
        <input
          id="setting-max-bubble"
          type="range"
          min="16"
          max="50"
          className="map-setting-control"
          value={settings.maxBubbleSize || 30}
          onChange={(e) => handleChange('maxBubbleSize', parseInt(e.target.value))}
        />
      </div>

      {/* Fill Opacity */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-opacity">Fill Opacity ({Math.round((settings.opacity || 0.65) * 100)}%)</label>
        <input
          id="setting-opacity"
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          className="map-setting-control"
          value={settings.opacity || 0.65}
          onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
        />
      </div>

      {/* Default Map Center Coordinates */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-center-lat">Default Center (Lat / Lon)</label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            id="setting-center-lat"
            type="number"
            className="map-setting-control"
            placeholder="Lat"
            value={settings.centerLat ?? 20}
            onChange={(e) => handleChange('centerLat', e.target.value === '' ? 20 : parseFloat(e.target.value))}
          />
          <input
            id="setting-center-lon"
            type="number"
            className="map-setting-control"
            placeholder="Lon"
            value={settings.centerLon ?? 77}
            onChange={(e) => handleChange('centerLon', e.target.value === '' ? 77 : parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* Default Map Zoom */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-zoom">Default Zoom Level ({settings.zoom || 4})</label>
        <input
          id="setting-zoom"
          type="range"
          min="1"
          max="16"
          className="map-setting-control"
          value={settings.zoom || 4}
          onChange={(e) => handleChange('zoom', parseInt(e.target.value))}
        />
      </div>

      {/* Legend Position Selector */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="setting-legend-position">Legend Overlay</label>
        <select
          id="setting-legend-position"
          className="map-setting-control"
          value={settings.legendPosition || 'bottom-right'}
          onChange={(e) => handleChange('legendPosition', e.target.value)}
        >
          <option value="bottom-right">Bottom Right</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="top-right">Top Right</option>
          <option value="top-left">Top Left</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>

      {/* Clustering toggle */}
      <div className="map-setting-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <input
          id="setting-clustering"
          type="checkbox"
          checked={settings.clusteringEnabled !== false}
          onChange={(e) => handleChange('clusteringEnabled', e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label className="map-setting-label" htmlFor="setting-clustering" style={{ margin: 0, cursor: 'pointer' }}>
          Enable Clustering
        </label>
      </div>

      {/* Auto-fit toggle */}
      <div className="map-setting-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          id="setting-autofit"
          type="checkbox"
          checked={settings.autoFitEnabled !== false}
          onChange={(e) => handleChange('autoFitEnabled', e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label className="map-setting-label" htmlFor="setting-autofit" style={{ margin: 0, cursor: 'pointer' }}>
          Auto-Fit Bounds on Load
        </label>
      </div>
    </div>
  );
};

export default MapSettings;
