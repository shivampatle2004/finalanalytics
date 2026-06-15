import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

export const ChoroplethMap = ({
  data = [],
  measure = 'sales',
  drillLevel = 'country', // country | state
  baseColor = '#3b82f6',
  opacity = 0.75,
  onFeatureClick
}) => {
  const [geoJsonData, setGeoJsonData] = useState(null);

  // Load local GeoJSON boundary files based on drilldown level
  useEffect(() => {
    const file = drillLevel === 'state' ? 'states.json' : 'countries.json';
    fetch(`/geojson/${file}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load /geojson/${file}`);
        return res.json();
      })
      .then(json => {
        setGeoJsonData(json);
      })
      .catch(err => {
        console.error('Error loading GeoJSON:', err);
        setGeoJsonData(null);
      });
  }, [drillLevel]);

  if (!geoJsonData || !Array.isArray(data) || data.length === 0) return null;

  // Find max value in data to scale opacity/colors
  const values = data.map(d => Number(d[measure] ?? d.value ?? 0));
  const maxVal = Math.max(...values, 1);

  // Map data values to location names for quick lookup
  const dataLookup = {};
  data.forEach(item => {
    // Group name or individual property depending on aggregation
    const rawName = item.group_name || item.location || item.country || item.state || '';
    const name = rawName.trim().toLowerCase();
    dataLookup[name] = Number(item[measure] ?? item.value ?? 0);
  });

  // Style helper for polygons
  const styleFeature = (feature) => {
    const name = (feature.properties?.name || '').toLowerCase();
    const val = dataLookup[name] ?? 0;
    
    // Calculate color intensity (0.1 to 1.0)
    const ratio = maxVal > 0 ? Math.min(1.0, val / maxVal) : 0.0;
    
    // Return Leaflet style configuration
    return {
      fillColor: baseColor,
      fillOpacity: val > 0 ? 0.15 + ratio * (opacity - 0.15) : 0.05,
      color: '#ffffff',
      weight: 1.2,
      opacity: 0.8
    };
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Bind popups and drill clicks on each map boundary feature
  const onEachFeature = (feature, layer) => {
    const name = feature.properties?.name || 'Unknown region';
    const val = dataLookup[name.toLowerCase()] ?? 0;

    layer.bindPopup(`
      <div class="map-tooltip-popup">
        <div class="map-tooltip-header">${name}</div>
        <div class="map-tooltip-row">
          <span class="map-tooltip-key">${measure.toUpperCase()}</span>
          <span class="map-tooltip-val">${formatNumber(val)}</span>
        </div>
      </div>
    `);

    layer.on({
      click: (e) => {
        // Try to find matching data item in dataset
        const matchedItem = data.find(d => {
          const dName = (d.group_name || d.location || d.country || d.state || '').toLowerCase();
          return dName === name.toLowerCase();
        });
        
        if (onFeatureClick) {
          onFeatureClick(matchedItem || { group_name: name, value: val, isMockRegion: true });
        }
      }
    });
  };

  return (
    <GeoJSON
      key={`${drillLevel}-${data.length}-${measure}`} // Remount component on key changes to force Leaflet refresh styles
      data={geoJsonData}
      style={styleFeature}
      onEachFeature={onEachFeature}
    />
  );
};

export default ChoroplethMap;
