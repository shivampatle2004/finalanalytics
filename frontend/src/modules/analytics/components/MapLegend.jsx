import React from 'react';

const DEFAULT_COLORS = [
  '#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899', '#14b8a6', '#eab308'
];

export const MapLegend = ({
  visualType = 'bubble',
  measure = 'sales',
  categories = [],
  categoryColors = {},
  baseColor = '#3b82f6',
  data = [],
  disabledCategories = [],
  onCategoryToggle
}) => {
  // If filled/choropleth map, draw a color gradient scale
  if (visualType === 'filled') {
    const values = data.map(d => Number(d[measure] ?? d.value ?? 0));
    const maxVal = Math.max(...values, 0);
    const formatNumber = (num) => {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
      return Math.round(num).toString();
    };

    return (
      <div className="map-legend-overlay">
        <div className="map-legend-title">Metric: {measure.toUpperCase()}</div>
        <div className="map-scale-legend">
          <div
            className="map-scale-bar"
            style={{
              background: `linear-gradient(to right, rgba(59, 130, 246, 0.05), ${baseColor})`
            }}
          />
          <div className="map-scale-labels">
            <span>0</span>
            <span>{formatNumber(maxVal)}</span>
          </div>
        </div>
      </div>
    );
  }

  // If category map or cluster map, show categories
  if (visualType === 'category' || visualType === 'cluster') {
    if (categories.length === 0) return null;

    return (
      <div className="map-legend-overlay">
        <div className="map-legend-title">Legend Categories</div>
        <div className="map-legend-items">
          {categories.map((cat, idx) => {
            const color = categoryColors[cat] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
            const isDisabled = disabledCategories.includes(cat);

            return (
              <div
                key={cat}
                className={`map-legend-item ${isDisabled ? 'disabled' : ''}`}
                onClick={() => onCategoryToggle && onCategoryToggle(cat)}
              >
                <div
                  className="map-legend-color-dot"
                  style={{ backgroundColor: color }}
                />
                <span>{cat}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // For Bubble or Heat map, single scale indicator
  return (
    <div className="map-legend-overlay">
      <div className="map-legend-title">Metric Mapping</div>
      <div className="map-legend-item">
        <div className="map-legend-color-dot" style={{ backgroundColor: baseColor }} />
        <span>{measure.toUpperCase()} Value Size</span>
      </div>
    </div>
  );
};

export default MapLegend;
