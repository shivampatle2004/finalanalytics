# Map Visualization Module - Documentation Guide

Welcome to the Power BI-style Map Visualization Module documentation. This module is built using Leaflet + React-Leaflet on the frontend and FastAPI + SQLAlchemy on the backend, providing bubble maps, category maps, density heatmaps, marker clustering, and boundaries-filled choropleth maps.

---

## 1. Installation Guide

### Frontend Setup
Ensure that compatible mapping libraries are installed in your React app. If they are not already installed, run:
```bash
cd frontend
npm install leaflet react-leaflet@^4 leaflet.markercluster leaflet.heat --legacy-peer-deps
```

### Backend Setup
Verify that your virtual environment is active and all required Python packages (SQLAlchemy, FastAPI, Pydantic) are installed. 

Startup migrations are handled automatically. When the FastAPI server runs `startup_event`, the database will automatically initialize two tables:
- `map_data`: Core sales metrics with coordinates.
- `geocoding_cache`: Offline coordinates caches.

---

## 2. API Documentation

All API endpoints are grouped under the `/analytics/api/maps` prefix:

### A. Raw Coordinates Data
* **Endpoint**: `GET /analytics/api/maps/data`
* **Query Parameters**:
  * `offset` (int, default: 0): Page index offset.
  * `limit` (int, default: 100): Page size.
  * `country`, `state`, `city`, `category` (strings, optional): Comma-separated filters.
  * `date_start`, `date_end` (string, ISO-date format, optional): Order date filters.
  * `min_value`, `max_value` (float, optional): Sales metric filters.
* **Response**:
  ```json
  {
    "total": 549,
    "offset": 0,
    "limit": 100,
    "data": [
      {
        "id": 1,
        "location": "Nagpur, Maharashtra, India",
        "country": "India",
        "state": "Maharashtra",
        "city": "Nagpur",
        "latitude": 21.1458,
        "longitude": 79.0882,
        "sales": 582.4,
        "profit": 120.3,
        "revenue": 687.2,
        "category": "Electronics",
        "date": "2025-06-15",
        "additional_fields": {}
      }
    ]
  }
  ```

### B. Analytical Group-By Aggregations
* **Endpoint**: `POST /analytics/api/maps/aggregated`
* **Request Body**:
  ```json
  {
    "group_by": "country",
    "measure": "sales",
    "agg_type": "sum",
    "filters": {
      "category": "Electronics"
    }
  }
  ```
* **Response**:
  ```json
  {
    "items": [
      {
        "group_name": "India",
        "value": 142050.25,
        "count": 92,
        "latitude": 21.2275,
        "longitude": 78.1769
      }
    ],
    "measure": "sales",
    "agg_type": "sum"
  }
  ```

### C. Heatmap Intensity Density Grid
* **Endpoint**: `GET /analytics/api/maps/heatmap`
* **Response**: Array of grid coordinates with normalized intensities (ideal for plotting 100,000+ points).

### D. Location Search Resolver
* **Endpoint**: `POST /analytics/api/maps/geocode`
* **Request Body**: `{"query": "Nagpur, India"}`
* **Response**:
  ```json
  {
    "latitude": 21.1458,
    "longitude": 79.0882,
    "country": "India",
    "state": "Maharashtra",
    "city": "Nagpur",
    "cached": true
  }
  ```

---

## 3. Configuration Guide

When editing the Map visual inside the Analytics Workspace, click the **Format Settings (Gear icon)** to customize visual preferences. The dashboard visual configuration accepts:

| Option Property | Type | Description | Default |
|:---|:---|:---|:---|
| `mapTheme` | `string` | Base Map layer: `light`, `dark`, `osm`, `hot` | `light` |
| `bubbleColor` | `string` | Hex color code for bubbles and shapes | `#3b82f6` |
| `minBubbleSize` | `number` | Minimum radius in pixels | `6` |
| `maxBubbleSize` | `number` | Maximum radius in pixels | `30` |
| `opacity` | `number` | Fill opacity between `0.1` and `1.0` | `0.7` |
| `clusteringEnabled`| `boolean`| Toggles marker clustering on and off | `true` |
| `autoFitEnabled` | `boolean`| Auto-zooms to data coordinates bounds on load | `true` |
| `legendPosition` | `string` | Overlay coordinates: `bottom-right`, `bottom-left`, `top-right`, `hidden` | `bottom-right` |

---

## 4. Usage Examples

### Embed in Dashboard Canvas
Simply select the **Map Visual type** from the Visualizations Panel. 

```javascript
import MapVisual from './components/MapVisual';

// Render the Map Visual
<MapVisual
  fileId="report_123"
  graphDefinition={{
    id: "visual_map_01",
    graph_type: "map",
    options: {
      mapTheme: "dark",
      bubbleColor: "#f97316"
    }
  }}
  isViewOnly={false}
  onUpdate={(updates) => console.log('Save options config:', updates)}
  onApplyCrossFilter={(filter) => console.log('Cross-filter dashboard:', filter)}
/>
```

### Drilldown Hierarchy (Country &rarr; State &rarr; City)
1. **World level (Country)**: The map displays markers grouped by Countries.
2. **First Drill (State)**: Double-click a country bubble (e.g. "India"). The map filters to show states (e.g., "Maharashtra", "Tamil Nadu", "Karnataka").
3. **Second Drill (City)**: Double-click a state. The map zooms down and plots precise coordinate points representing individual cities.
4. **Breadcrumbs**: Use the top-left navigation crumbs (e.g. `World Countries / India States`) to go back up the hierarchy.
