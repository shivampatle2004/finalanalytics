import React from 'react';
import { CircleMarker, Popup } from 'react-leaflet';

const CATEGORY_PALETTE = [
  '#3b82f6', // blue
  '#f97316', // orange
  '#10b981', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308'  // yellow
];

export const CategoryMap = ({
  data = [],
  measure = 'sales',
  categories = [],
  categoryColors = {},
  radius = 8,
  opacity = 0.8,
  onMarkerClick,
  tooltipFields = []
}) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  // Build a fallback category color map if not provided
  const categoryColorMap = { ...categoryColors };
  categories.forEach((cat, idx) => {
    if (!categoryColorMap[cat]) {
      categoryColorMap[cat] = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
    }
  });

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

        const cat = item.category || 'Other';
        const color = categoryColorMap[cat] || '#64748b';
        const val = Number(item[measure] ?? item.value ?? 0);
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
                  <span className="map-tooltip-key">Category</span>
                  <span className="map-tooltip-val" style={{ color, fontWeight: 700 }}>{cat}</span>
                </div>
                <div className="map-tooltip-row">
                  <span className="map-tooltip-key">{measure.toUpperCase()}</span>
                  <span className="map-tooltip-val">{formatNumber(val)}</span>
                </div>
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

export default CategoryMap;
