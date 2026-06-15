import React from 'react';
import { CircleMarker, Popup } from 'react-leaflet';

export const BubbleMap = ({
  data = [],
  measure = 'sales',
  color = '#3b82f6',
  minRadius = 6,
  maxRadius = 30,
  opacity = 0.6,
  onMarkerClick,
  tooltipFields = []
}) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  // Find dynamic range for scaling
  const values = data.map(d => Number(d[measure] ?? d.value ?? 0));
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 1);
  const valRange = maxVal - minVal || 1;

  const getRadius = (val) => {
    const numeric = Number(val || 0);
    const fraction = (numeric - minVal) / valRange;
    return minRadius + fraction * (maxRadius - minRadius);
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <>
      {data.map((item, idx) => {
        const lat = item.latitude;
        const lon = item.longitude;
        if (lat === null || lat === undefined || lon === null || lon === undefined) {
          return null;
        }

        const val = Number(item[measure] ?? item.value ?? 0);
        const radius = getRadius(val);
        const label = item.location || item.group_name || `Point ${idx + 1}`;

        return (
          <CircleMarker
            key={`${label}-${idx}`}
            center={[lat, lon]}
            radius={radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: opacity,
              color: '#ffffff',
              weight: 1.5,
              opacity: 0.95
            }}
            eventHandlers={{
              click: (e) => {
                if (onMarkerClick) onMarkerClick(item);
              }
            }}
          >
            <Popup>
              <div className="map-tooltip-popup">
                <div className="map-tooltip-header">{label}</div>
                <div className="map-tooltip-row">
                  <span className="map-tooltip-key">{measure.toUpperCase()}</span>
                  <span className="map-tooltip-val">{formatNumber(val)}</span>
                </div>
                {item.category && (
                  <div className="map-tooltip-row">
                    <span className="map-tooltip-key">Category</span>
                    <span className="map-tooltip-val">{item.category}</span>
                  </div>
                )}
                {item.city && (
                  <div className="map-tooltip-row">
                    <span className="map-tooltip-key">City</span>
                    <span className="map-tooltip-val">{item.city}</span>
                  </div>
                )}
                {item.state && (
                  <div className="map-tooltip-row">
                    <span className="map-tooltip-key">State</span>
                    <span className="map-tooltip-val">{item.state}</span>
                  </div>
                )}
                {item.country && (
                  <div className="map-tooltip-row">
                    <span className="map-tooltip-key">Country</span>
                    <span className="map-tooltip-val">{item.country}</span>
                  </div>
                )}
                {/* Custom tooltip fields */}
                {tooltipFields.map((field) => {
                  const rawVal = item[field] ?? (item.additional_fields ? item.additional_fields[field] : null);
                  if (rawVal === null || rawVal === undefined) return null;
                  return (
                    <div className="map-tooltip-row" key={field}>
                      <span className="map-tooltip-key">{field.replace('_', ' ')}</span>
                      <span className="map-tooltip-val">
                        {typeof rawVal === 'number' ? formatNumber(rawVal) : String(rawVal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
};

export default BubbleMap;
