import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Import CSS
import './MapVisual.css';

// Import services and subcomponents
import mapService from '../services/mapService';
import BubbleMap from './BubbleMap';
import CategoryMap from './CategoryMap';
import HeatMap from './HeatMap';
import ChoroplethMap from './ChoroplethMap';
import MapToolbar from './MapToolbar';
import MapLegend from './MapLegend';
import MapFilters from './MapFilters';
import MapSettings from './MapSettings';

import { Settings, Filter, Sliders, MapPin } from 'lucide-react';

// Tile providers configuration
const TILE_PROVIDERS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  hot: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
};

const TILE_ATTRIBUTIONS = {
  light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  osm: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  hot: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team'
};

// React-Leaflet Map Controller Sub-component
const MapController = ({ center, zoom, bounds, autoFit }) => {
  const map = useMap();

  useEffect(() => {
    if (center && !bounds) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [map, center, zoom, bounds]);

  useEffect(() => {
    if (bounds && autoFit) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [map, bounds, autoFit]);

  return null;
};

// Map Instance Capture Sub-component
const MapInstanceCapture = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => {
    if (map) {
      setMapInstance(map);
    }
  }, [map, setMapInstance]);
  return null;
};

// Reusable Native Leaflet Marker Cluster Component
const MarkerClusterGroup = ({ data, measure, color, onMarkerClick }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !Array.isArray(data) || data.length === 0) return;

    // Initialize Leaflet Marker Cluster group
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40
    });

    data.forEach((item, idx) => {
      const lat = item.latitude;
      const lon = item.longitude;
      if (lat === null || lat === undefined || lon === null || lon === undefined) return;

      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: color || '#3b82f6',
        fillOpacity: 0.8,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.95
      });

      // Formulate Popup markup
      const label = item.location || item.group_name || `Location ${idx + 1}`;
      const val = Number(item[measure] ?? item.value ?? 0);
      const categoryText = item.category ? `<div class="map-tooltip-row"><span class="map-tooltip-key">Category</span><span class="map-tooltip-val">${item.category}</span></div>` : '';
      
      marker.bindPopup(`
        <div class="map-tooltip-popup">
          <div class="map-tooltip-header">${label}</div>
          <div class="map-tooltip-row">
            <span class="map-tooltip-key">${measure.toUpperCase()}</span>
            <span class="map-tooltip-val">${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          ${categoryText}
        </div>
      `);

      marker.on('click', () => {
        if (onMarkerClick) onMarkerClick(item);
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      if (map && clusterGroup) {
        map.removeLayer(clusterGroup);
      }
    };
  }, [map, data, measure, color, onMarkerClick]);

  return null;
};

export const MapVisual = ({
  fileId,
  graphDefinition = {},
  measures = [],
  schema = [],
  isViewOnly = false,
  onUpdate,
  onApplyCrossFilter,
  onClearCrossFilter
}) => {
  // Extract configurations from graphDefinition or use defaults
  const options = graphDefinition.options || {};
  const initialVisualType = options.mapVisualType || 'bubble';
  const initialSettings = {
    mapTheme: options.mapTheme || 'light',
    bubbleColor: options.bubbleColor || '#3b82f6',
    minBubbleSize: options.minBubbleSize || 6,
    maxBubbleSize: options.maxBubbleSize || 30,
    opacity: options.opacity !== undefined ? options.opacity : 0.7,
    centerLat: options.centerLat !== undefined ? options.centerLat : 20,
    centerLon: options.centerLon !== undefined ? options.centerLon : 77,
    zoom: options.zoom !== undefined ? options.zoom : 4,
    clusteringEnabled: options.clusteringEnabled !== false,
    autoFitEnabled: options.autoFitEnabled !== false,
    legendPosition: options.legendPosition || 'bottom-right'
  };

  const [visualType, setVisualType] = useState(initialVisualType);
  const [settings, setSettings] = useState(initialSettings);
  const [activeTab, setActiveTab] = useState('fields'); // fields | filters | settings
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isViewOnly);

  // Leaflet map instance state
  const [mapInstance, setMapInstance] = useState(null);

  // Data state
  const [mapData, setMapData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 100;

  // Filtering state
  const [activeFilters, setActiveFilters] = useState({});
  const [disabledCategories, setDisabledCategories] = useState([]);

  // Drilldown hierarchy state: 'country' -> 'state' -> 'city'
  const [drillLevel, setDrillLevel] = useState('country');
  const [drillPath, setDrillPath] = useState({ country: null, state: null });

  // Map state
  const [mapCenter, setMapCenter] = useState([settings.centerLat, settings.centerLon]);
  const [mapZoom, setMapZoom] = useState(settings.zoom);
  const [mapBounds, setMapBounds] = useState(null);

  // Dynamic field bucket states
  const [fieldMapping, setFieldMapping] = useState({
    location: options.fieldMapping?.location || 'country',
    measure: options.fieldMapping?.measure || 'sales',
    legend: options.fieldMapping?.legend || 'category',
    tooltips: options.fieldMapping?.tooltips || ['profit', 'revenue']
  });

  // Unique categories list for legend
  const [categoriesList, setCategoriesList] = useState([]);

  // Fetch unique categories
  useEffect(() => {
    mapService.getCategories(fileId).then(setCategoriesList).catch(console.error);
  }, [fileId]);

  // Sync state modifications back to graphDefinition
  const saveVisualConfig = (updatedSettings, updatedFields, updatedVisualType) => {
    if (onUpdate && !isViewOnly) {
      onUpdate({
        options: {
          ...options,
          mapVisualType: updatedVisualType,
          mapTheme: updatedSettings.mapTheme,
          bubbleColor: updatedSettings.bubbleColor,
          minBubbleSize: updatedSettings.minBubbleSize,
          maxBubbleSize: updatedSettings.maxBubbleSize,
          opacity: updatedSettings.opacity,
          centerLat: updatedSettings.centerLat,
          centerLon: updatedSettings.centerLon,
          zoom: updatedSettings.zoom,
          clusteringEnabled: updatedSettings.clusteringEnabled,
          autoFitEnabled: updatedSettings.autoFitEnabled,
          legendPosition: updatedSettings.legendPosition,
          fieldMapping: updatedFields
        }
      });
    }
  };

  // Load Map Data based on Field Mappings, Filters, Pagination, and Drilldown level
  useEffect(() => {
    setLoading(true);
    setError(null);

    const activeFilterPayload = { ...activeFilters };
    
    // Inject drill path filters into API filters dynamically
    if (drillLevel === 'state' && drillPath.country) {
      activeFilterPayload.country = drillPath.country;
    } else if (drillLevel === 'city' && drillPath.country && drillPath.state) {
      activeFilterPayload.country = drillPath.country;
      activeFilterPayload.state = drillPath.state;
    }

    // Determine if we query aggregated endpoints or raw coordinates list
    const isAggregatedMode = visualType === 'filled' || drillLevel !== 'city';
    
    if (isAggregatedMode) {
      // Group by either country, state, or city based on drilldown
      const groupByField = drillLevel;
      mapService.getAggregated(groupByField, fieldMapping.measure, 'sum', activeFilterPayload, fileId)
        .then(res => {
          setMapData(res.items || []);
          setTotalRecords(res.items?.length || 0);
          calculateBounds(res.items || []);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to retrieve aggregated map boundaries');
          setLoading(false);
        });
    } else if (visualType === 'heat') {
      // Fetch spatial aggregation for heatmaps
      mapService.getHeatmap(fieldMapping.measure, 'sum', activeFilterPayload, fileId)
        .then(res => {
          setMapData(res || []);
          setTotalRecords(res?.length || 0);
          calculateBounds(res || []);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to retrieve heatmap aggregation points');
          setLoading(false);
        });
    } else {
      // Fetch raw geocoded coordinate points for bubbles, categories, and clustering
      const offset = (page - 1) * pageSize;
      mapService.getData(offset, pageSize, activeFilterPayload, fileId)
        .then(res => {
          setMapData(res.data || []);
          setTotalRecords(res.total || 0);
          calculateBounds(res.data || []);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to retrieve map coordinate points');
          setLoading(false);
        });
    }
  }, [fileId, visualType, drillLevel, drillPath, activeFilters, fieldMapping.measure, page]);

  // Compute map bounding box to auto-fit bounds on data change
  const calculateBounds = (points) => {
    if (!Array.isArray(points) || points.length === 0) {
      setMapBounds(null);
      return;
    }

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    let validCount = 0;

    points.forEach(p => {
      const lat = p.latitude;
      const lon = p.longitude;
      if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        validCount++;
      }
    });

    if (validCount > 0) {
      // Add slight padding to the bounds
      setMapBounds([
        [minLat - 0.05, minLon - 0.05],
        [maxLat + 0.05, maxLon + 0.05]
      ]);
    } else {
      setMapBounds(null);
    }
  };

  // Perform geocoding search in toolbar
  const handleLocationSearch = (query) => {
    setLoading(true);
    mapService.geocode(query)
      .then(res => {
        setMapCenter([res.latitude, res.longitude]);
        setMapZoom(10); // zoom closer on target location search match
        if (mapInstance) {
          mapInstance.setView([res.latitude, res.longitude], 10);
        }
        setLoading(false);
      })
      .catch(err => {
        alert(`Could not find location: ${query}. Details: ${err.message}`);
        setLoading(false);
      });
  };

  // Handle marker/feature click events (Triggers drilldowns & cross-filtering)
  const handlePointInteraction = (item) => {
    if (!item) return;

    // Apply dashboard-wide cross filtering if callback is configured
    if (onApplyCrossFilter && graphDefinition.id) {
      const crossFilterField = drillLevel === 'country' ? 'Country' : drillLevel === 'state' ? 'State' : 'City';
      const crossFilterVal = item.group_name || item.location || item[drillLevel];
      if (crossFilterVal) {
        onApplyCrossFilter(graphDefinition.id, [
          {
            field: crossFilterField,
            operator: 'equals',
            value: crossFilterVal
          }
        ]);
      }
    }

    // Trigger Country -> State -> City Drilldown
    if (drillLevel === 'country') {
      const countryVal = item.group_name || item.country;
      if (countryVal && !item.isMockRegion) {
        setDrillPath({ country: countryVal, state: null });
        setDrillLevel('state');
        setPage(1);
      }
    } else if (drillLevel === 'state') {
      const stateVal = item.group_name || item.state;
      if (stateVal && !item.isMockRegion) {
        setDrillPath(prev => ({ ...prev, state: stateVal }));
        setDrillLevel('city');
        setPage(1);
      }
    }
  };

  const handleDrillBreadcrumbClick = (targetLevel) => {
    if (targetLevel === 'country') {
      setDrillPath({ country: null, state: null });
      setDrillLevel('country');
    } else if (targetLevel === 'state') {
      setDrillPath(prev => ({ ...prev, state: null }));
      setDrillLevel('state');
    }
    setPage(1);
  };

  // Toggle legends items for filtering categories
  const handleCategoryToggle = (categoryName) => {
    let nextDisabled;
    if (disabledCategories.includes(categoryName)) {
      nextDisabled = disabledCategories.filter(c => c !== categoryName);
    } else {
      nextDisabled = [...disabledCategories, categoryName];
    }
    
    setDisabledCategories(nextDisabled);
    
    // Apply categorical filters to map payload
    const activeCats = categoriesList.filter(c => !nextDisabled.includes(c));
    setActiveFilters(prev => ({
      ...prev,
      category: activeCats.length === categoriesList.length ? '' : activeCats
    }));

    // Trigger dashboard cross filtering by category
    if (onApplyCrossFilter && graphDefinition.id) {
      if (activeCats.length === categoriesList.length || activeCats.length === 0) {
        onClearCrossFilter?.();
      } else {
        onApplyCrossFilter(graphDefinition.id, activeCats.map(cat => ({
          field: 'Category',
          operator: 'equals',
          value: cat
        })));
      }
    }
  };

  // Export dataset handler
  const handleExport = (format) => {
    mapService.exportData(format, activeFilters, fileId).catch(console.error);
  };

  // Handle toolbar resets
  const handleReset = () => {
    setSettings(initialSettings);
    setVisualType(initialVisualType);
    setActiveFilters({});
    setDrillLevel('country');
    setDrillPath({ country: null, state: null });
    setDisabledCategories([]);
    setPage(1);
    setMapCenter([initialSettings.centerLat, initialSettings.centerLon]);
    setMapZoom(initialSettings.zoom);
    calculateBounds(mapData);
    if (mapInstance) {
      mapInstance.setView([initialSettings.centerLat, initialSettings.centerLon], initialSettings.zoom);
    }
  };

  // Trigger Fit bounds manual override
  const handleFitBounds = () => {
    if (mapBounds && mapInstance) {
      mapInstance.fitBounds(mapBounds);
    } else {
      calculateBounds(mapData);
    }
  };

  // Filter data client-side for inactive categories to support cross-highlighting toggles
  const visibleMapData = useMemo(() => {
    if (disabledCategories.length === 0 || visualType === 'heat' || visualType === 'filled') {
      return mapData;
    }
    return mapData.filter(item => !disabledCategories.includes(item.category));
  }, [mapData, disabledCategories, visualType]);

  return (
    <div className={`map-visual-container ${settings.mapTheme === 'dark' ? 'dark' : ''}`}>
      {/* Settings toggle button for edit mode */}
      {!isViewOnly && (
        <button
          type="button"
          className={`map-settings-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title="Field Mapping and Settings Panels"
          aria-label="Toggle configurations sidebar"
        >
          <Settings size={16} />
        </button>
      )}

      {/* Main Map Viewport */}
      <div className="map-main-pane">
        {/* Floating Controls Toolbar */}
        <MapToolbar
          visualType={visualType}
          onVisualTypeChange={(type) => {
            setVisualType(type);
            saveVisualConfig(settings, fieldMapping, type);
          }}
          onZoomIn={() => {
            if (mapInstance) {
              mapInstance.zoomIn();
            } else {
              setMapZoom(prev => Math.min(18, prev + 1));
            }
          }}
          onZoomOut={() => {
            if (mapInstance) {
              mapInstance.zoomOut();
            } else {
              setMapZoom(prev => Math.max(1, prev - 1));
            }
          }}
          onResetView={handleReset}
          onFitBounds={handleFitBounds}
          onSearch={handleLocationSearch}
          onExport={handleExport}
          isViewOnly={isViewOnly}
        />

        {/* Bounding breadcrumbs representing Drilldowns hierarchy */}
        <div style={{ position: 'absolute', top: '60px', left: '16px', zIndex: 1000 }}>
          <div className="map-drill-breadcrumbs">
            <span
              className={`map-drill-crumb ${drillLevel === 'country' ? 'active' : ''}`}
              onClick={() => handleDrillBreadcrumbClick('country')}
            >
              World Countries
            </span>
            {drillPath.country && (
              <>
                <span className="map-drill-divider">/</span>
                <span
                  className={`map-drill-crumb ${drillLevel === 'state' ? 'active' : ''}`}
                  onClick={() => handleDrillBreadcrumbClick('state')}
                >
                  {drillPath.country} States
                </span>
              </>
            )}
            {drillPath.state && (
              <>
                <span className="map-drill-divider">/</span>
                <span className={`map-drill-crumb active`}>
                  {drillPath.state} Cities
                </span>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Map Area */}
        <div className="map-canvas-area">
          {error ? (
            <div className="map-error-pane">
              <div className="map-error-title">Boundary Query Failed</div>
              <div className="map-error-desc">{error}</div>
              <button type="button" className="map-btn primary" onClick={() => handleReset()}>Retry Connection</button>
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              scrollWheelZoom={true}
              zoomControl={false} // Override zoom controls with custom toolbar buttons
            >
              <MapInstanceCapture setMapInstance={setMapInstance} />
              <TileLayer
                attribution={TILE_ATTRIBUTIONS[settings.mapTheme] || TILE_ATTRIBUTIONS.osm}
                url={TILE_PROVIDERS[settings.mapTheme] || TILE_PROVIDERS.osm}
              />
              
              <MapController
                center={mapCenter}
                zoom={mapZoom}
                bounds={mapBounds}
                autoFit={settings.autoFitEnabled !== false}
              />

              {/* Renders appropriate map type layers */}
              {visualType === 'bubble' && (
                settings.clusteringEnabled ? (
                  <MarkerClusterGroup
                    data={visibleMapData}
                    measure={fieldMapping.measure}
                    color={settings.bubbleColor}
                    onMarkerClick={handlePointInteraction}
                  />
                ) : (
                  <BubbleMap
                    data={visibleMapData}
                    measure={fieldMapping.measure}
                    color={settings.bubbleColor}
                    minRadius={settings.minBubbleSize}
                    maxRadius={settings.maxBubbleSize}
                    opacity={settings.opacity}
                    onMarkerClick={handlePointInteraction}
                    tooltipFields={fieldMapping.tooltips}
                  />
                )
              )}

              {visualType === 'category' && (
                settings.clusteringEnabled ? (
                  <MarkerClusterGroup
                    data={visibleMapData}
                    measure={fieldMapping.measure}
                    onMarkerClick={handlePointInteraction}
                  />
                ) : (
                  <CategoryMap
                    data={visibleMapData}
                    measure={fieldMapping.measure}
                    categories={categoriesList}
                    opacity={settings.opacity}
                    onMarkerClick={handlePointInteraction}
                    tooltipFields={fieldMapping.tooltips}
                  />
                )
              )}

              {visualType === 'cluster' && (
                <MarkerClusterGroup
                  data={visibleMapData}
                  measure={fieldMapping.measure}
                  color={settings.bubbleColor}
                  onMarkerClick={handlePointInteraction}
                />
              )}

              {visualType === 'heat' && (
                <HeatMap
                  data={visibleMapData}
                  measure={fieldMapping.measure}
                  radius={settings.maxBubbleSize}
                />
              )}

              {visualType === 'filled' && (
                <ChoroplethMap
                  data={visibleMapData}
                  measure={fieldMapping.measure}
                  drillLevel={drillLevel === 'city' ? 'state' : drillLevel} // Choropleth only draws country/state boundaries
                  baseColor={settings.bubbleColor}
                  opacity={settings.opacity}
                  onFeatureClick={handlePointInteraction}
                />
              )}
            </MapContainer>
          )}
        </div>

        {/* Legend overlays */}
        {settings.legendPosition !== 'hidden' && (
          <MapLegend
            visualType={visualType}
            measure={fieldMapping.measure}
            categories={categoriesList}
            baseColor={settings.bubbleColor}
            data={visibleMapData}
            disabledCategories={disabledCategories}
            onCategoryToggle={handleCategoryToggle}
          />
        )}

        {/* Server Side Pagination controls for raw data */}
        {visualType !== 'filled' && visualType !== 'heat' && drillLevel === 'city' && totalRecords > pageSize && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(255,255,255,0.95)',
              padding: '6px 12px',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #cbd5e1'
            }}
          >
            <button
              type="button"
              className="map-btn"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '0 8px', height: '24px' }}
            >
              Prev
            </button>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
              Page {page} of {Math.ceil(totalRecords / pageSize)}
            </span>
            <button
              type="button"
              className="map-btn"
              disabled={page * pageSize >= totalRecords}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '0 8px', height: '24px' }}
            >
              Next
            </button>
          </div>
        )}

        {/* Loading spinners */}
        {loading && (
          <div className="map-loading-indicator">
            <div className="map-spinner" />
            <span>Fetching data boundaries...</span>
          </div>
        )}
      </div>

      {/* Editing configurations panel */}
      {isSidebarOpen && !isViewOnly && (
        <div className="map-sidebar-pane">
          <div className="map-sidebar-tabs">
            <button
              type="button"
              className={`map-tab-btn ${activeTab === 'fields' ? 'active' : ''}`}
              onClick={() => setActiveTab('fields')}
            >
              <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
              Fields
            </button>
            <button
              type="button"
              className={`map-tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
              onClick={() => setActiveTab('filters')}
            >
              <Filter size={12} style={{ display: 'inline', marginRight: 4 }} />
              Filters
            </button>
            <button
              type="button"
              className={`map-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Sliders size={12} style={{ display: 'inline', marginRight: 4 }} />
              Format
            </button>
          </div>

          <div className="map-sidebar-content">
            {activeTab === 'fields' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                  Assign data attributes to visual mapping buckets.
                </div>
                
                {/* Location Bucket */}
                <div className="map-field-section">
                  <div className="map-field-section-title">Location Field</div>
                  <div className="map-field-bucket">
                    <div className="map-mapped-field">
                      <span>{fieldMapping.location.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* Measure/Values Selector */}
                <div className="map-field-section">
                  <div className="map-field-section-title">Values (Measure)</div>
                  <select
                    className="map-setting-control"
                    value={fieldMapping.measure}
                    onChange={(e) => {
                      const nextFields = { ...fieldMapping, measure: e.target.value };
                      setFieldMapping(nextFields);
                      saveVisualConfig(settings, nextFields, visualType);
                    }}
                  >
                    <option value="sales">Sales</option>
                    <option value="profit">Profit</option>
                    <option value="revenue">Revenue</option>
                  </select>
                </div>

                {/* Legend Selector */}
                <div className="map-field-section">
                  <div className="map-field-section-title">Legend (Category)</div>
                  <div className="map-field-bucket">
                    <div className="map-mapped-field">
                      <span>{fieldMapping.legend.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* Tooltips configuration */}
                <div className="map-field-section">
                  <div className="map-field-section-title">Tooltip Fields</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {['sales', 'profit', 'revenue', 'quantity'].map(col => (
                      <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                        <input
                          type="checkbox"
                          id={`tooltip-${col}`}
                          checked={fieldMapping.tooltips.includes(col) || fieldMapping.measure === col}
                          disabled={fieldMapping.measure === col}
                          onChange={(e) => {
                            let nextTooltips;
                            if (e.target.checked) {
                              nextTooltips = [...fieldMapping.tooltips, col];
                            } else {
                              nextTooltips = fieldMapping.tooltips.filter(c => c !== col);
                            }
                            const nextFields = { ...fieldMapping, tooltips: nextTooltips };
                            setFieldMapping(nextFields);
                            saveVisualConfig(settings, nextFields, visualType);
                          }}
                        />
                        <label htmlFor={`tooltip-${col}`} style={{ cursor: 'pointer' }}>{col.toUpperCase()}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'filters' && (
              <MapFilters
                filters={activeFilters}
                onFilterChange={setActiveFilters}
                activeMeasure={fieldMapping.measure}
              />
            )}

            {activeTab === 'settings' && (
              <MapSettings
                settings={settings}
                onSettingsChange={(nextSettings) => {
                  setSettings(nextSettings);
                  setMapCenter([nextSettings.centerLat, nextSettings.centerLon]);
                  setMapZoom(nextSettings.zoom);
                  saveVisualConfig(nextSettings, fieldMapping, visualType);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapVisual;
