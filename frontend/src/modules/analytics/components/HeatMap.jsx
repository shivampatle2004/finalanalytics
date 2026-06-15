import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

export const HeatMap = ({
  data = [],
  measure = 'sales',
  radius = 20,
  blur = 15,
  maxZoom = 18
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !Array.isArray(data) || data.length === 0) return;

    // Normalize intensity values between 0.1 and 1.0 to ensure low-value areas are visible
    const values = data.map(d => Number(d[measure] ?? d.value ?? 0));
    const maxVal = Math.max(...values, 1);

    const points = data
      .map(item => {
        const lat = item.latitude;
        const lon = item.longitude;
        if (lat === null || lat === undefined || lon === null || lon === undefined) {
          return null;
        }
        const val = Number(item[measure] ?? item.value ?? 0);
        const intensity = maxVal > 0 ? Math.max(0.1, val / maxVal) : 0.5;
        return [lat, lon, intensity];
      })
      .filter(Boolean);

    // Create heat layer using L.heatLayer
    // The gradient uses dynamic color transitions
    const heatLayer = L.heatLayer(points, {
      radius: radius,
      blur: blur,
      maxZoom: maxZoom,
      gradient: {
        0.2: 'blue',
        0.4: 'cyan',
        0.6: 'green',
        0.8: 'yellow',
        1.0: 'red'
      }
    }).addTo(map);

    // Cleanup layer on unmount
    return () => {
      if (map && heatLayer) {
        map.removeLayer(heatLayer);
      }
    };
  }, [map, data, measure, radius, blur, maxZoom]);

  return null;
};

export default HeatMap;
