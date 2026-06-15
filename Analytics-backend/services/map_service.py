import random
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from map_model import MapData, GeocodingCache
from services.map_repository import MapRepository

# Predefined coordinates for common global cities to ensure high accuracy offline geocoding
GEOGRAPHY_REGISTRY = {
    # India
    "nagpur": {"lat": 21.1458, "lon": 79.0882, "state": "Maharashtra", "country": "India"},
    "mumbai": {"lat": 19.0760, "lon": 72.8777, "state": "Maharashtra", "country": "India"},
    "pune": {"lat": 18.5204, "lon": 73.8567, "state": "Maharashtra", "country": "India"},
    "delhi": {"lat": 28.7041, "lon": 77.1025, "state": "Delhi", "country": "India"},
    "new delhi": {"lat": 28.6139, "lon": 77.2090, "state": "Delhi", "country": "India"},
    "bangalore": {"lat": 12.9716, "lon": 77.5946, "state": "Karnataka", "country": "India"},
    "bengaluru": {"lat": 12.9716, "lon": 77.5946, "state": "Karnataka", "country": "India"},
    "chennai": {"lat": 13.0827, "lon": 80.2707, "state": "Tamil Nadu", "country": "India"},
    "hyderabad": {"lat": 17.3850, "lon": 78.4867, "state": "Telangana", "country": "India"},
    "kolkata": {"lat": 22.5726, "lon": 88.3639, "state": "West Bengal", "country": "India"},
    "jaipur": {"lat": 26.9124, "lon": 75.7873, "state": "Rajasthan", "country": "India"},
    "lucknow": {"lat": 26.8467, "lon": 80.9462, "state": "Uttar Pradesh", "country": "India"},
    
    # USA
    "new york": {"lat": 40.7128, "lon": -74.0060, "state": "New York", "country": "United States"},
    "new york city": {"lat": 40.7128, "lon": -74.0060, "state": "New York", "country": "United States"},
    "san francisco": {"lat": 37.7749, "lon": -122.4194, "state": "California", "country": "United States"},
    "los angeles": {"lat": 34.0522, "lon": -118.2437, "state": "California", "country": "United States"},
    "chicago": {"lat": 41.8781, "lon": -87.6298, "state": "Illinois", "country": "United States"},
    "seattle": {"lat": 47.6062, "lon": -122.3321, "state": "Washington", "country": "United States"},
    "boston": {"lat": 42.3601, "lon": -71.0589, "state": "Massachusetts", "country": "United States"},
    "miami": {"lat": 25.7617, "lon": -80.1918, "state": "Florida", "country": "United States"},
    "austin": {"lat": 30.2672, "lon": -97.7431, "state": "Texas", "country": "United States"},
    "denver": {"lat": 39.7392, "lon": -104.9903, "state": "Colorado", "country": "United States"},
    "san diego": {"lat": 32.7157, "lon": -117.1611, "state": "California", "country": "United States"},

    # UK
    "london": {"lat": 51.5074, "lon": -0.1278, "state": "England", "country": "United Kingdom"},
    "manchester": {"lat": 53.4808, "lon": -2.2426, "state": "England", "country": "United Kingdom"},
    "birmingham": {"lat": 52.4862, "lon": -1.8904, "state": "England", "country": "United Kingdom"},
    "leeds": {"lat": 53.8008, "lon": -1.5491, "state": "England", "country": "United Kingdom"},

    # Germany
    "berlin": {"lat": 52.5200, "lon": 13.4050, "state": "Berlin", "country": "Germany"},
    "munich": {"lat": 48.1351, "lon": 11.5820, "state": "Bavaria", "country": "Germany"},
    "hamburg": {"lat": 53.5511, "lon": 9.9937, "state": "Hamburg", "country": "Germany"},
    "frankfurt": {"lat": 50.1109, "lon": 8.6821, "state": "Hesse", "country": "Germany"},

    # Australia
    "sydney": {"lat": -33.8688, "lon": 151.2093, "state": "New South Wales", "country": "Australia"},
    "melbourne": {"lat": -37.8136, "lon": 144.9631, "state": "Victoria", "country": "Australia"},
    "brisbane": {"lat": -27.4705, "lon": 153.0260, "state": "Queensland", "country": "Australia"},

    # Japan
    "tokyo": {"lat": 35.6762, "lon": 139.6503, "state": "Tokyo", "country": "Japan"},
    "osaka": {"lat": 34.6937, "lon": 135.5023, "state": "Osaka", "country": "Japan"},

    # Others
    "toronto": {"lat": 43.6532, "lon": -79.3832, "state": "Ontario", "country": "Canada"},
    "vancouver": {"lat": 49.2827, "lon": -123.1207, "state": "British Columbia", "country": "Canada"},
    "singapore": {"lat": 1.3521, "lon": 103.8198, "state": "Central Region", "country": "Singapore"},
    "sao paulo": {"lat": -23.5505, "lon": -46.6333, "state": "Sao Paulo", "country": "Brazil"},
    "rio de janeiro": {"lat": -22.9068, "lon": -43.1729, "state": "Rio de Janeiro", "country": "Brazil"},
    "johannesburg": {"lat": -26.2041, "lon": 28.0473, "state": "Gauteng", "country": "South Africa"},
    "cape town": {"lat": -33.9249, "lon": 18.4241, "state": "Western Cape", "country": "South Africa"}
}

class MapService:
    @staticmethod
    def get_map_data(db: Session, filters: Optional[Dict[str, Any]] = None, offset: int = 0, limit: int = 100) -> Dict[str, Any]:
        records = MapRepository.get_all(db, filters, offset, limit)
        total = MapRepository.get_count(db, filters)
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "data": records
        }

    @staticmethod
    def get_countries(db: Session) -> List[str]:
        return MapRepository.get_countries(db)

    @staticmethod
    def get_states(db: Session, country: Optional[str] = None) -> List[str]:
        return MapRepository.get_states(db, country)

    @staticmethod
    def get_cities(db: Session, state: Optional[str] = None, country: Optional[str] = None) -> List[str]:
        return MapRepository.get_cities(db, state, country)

    @staticmethod
    def get_categories(db: Session) -> List[str]:
        return MapRepository.get_categories(db)

    @staticmethod
    def get_aggregated_data(db: Session, group_by: str, measure: str, agg_type: str, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return MapRepository.get_aggregated_data(db, group_by, measure, agg_type, filters)

    @staticmethod
    def get_heatmap_data(db: Session, measure: str = "sales", agg_type: str = "sum", filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Uses spatial aggregation to return grid-grouped intensity values for heatmaps.
        Ensures performance even if there are hundreds of thousands of records.
        """
        return MapRepository.get_spatial_aggregation(db, measure, agg_type, grid_precision=0.1, filters=filters)

    @staticmethod
    def export_data(db: Session, format_type: str, filters: Optional[Dict[str, Any]] = None) -> str:
        # Export all matches
        records = MapRepository.get_all(db, filters, offset=0, limit=100000)
        
        if format_type == "csv":
            import io
            import csv
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["ID", "Location", "Country", "State", "City", "Latitude", "Longitude", "Sales", "Profit", "Revenue", "Category", "Date"])
            for r in records:
                writer.writerow([r.id, r.location, r.country, r.state, r.city, r.latitude, r.longitude, r.sales, r.profit, r.revenue, r.category, r.date])
            return output.getvalue()
        
        elif format_type == "json":
            import json
            data = [
                {
                    "id": r.id,
                    "location": r.location,
                    "country": r.country,
                    "state": r.state,
                    "city": r.city,
                    "latitude": r.latitude,
                    "longitude": r.longitude,
                    "sales": r.sales,
                    "profit": r.profit,
                    "revenue": r.revenue,
                    "category": r.category,
                    "date": str(r.date) if r.date else None,
                    "additional_fields": r.additional_fields
                } for r in records
            ]
            return json.dumps(data, indent=2)
            
        else:
            raise ValueError(f"Unsupported export format: {format_type}")

    @staticmethod
    def geocode_location(db: Session, location_query: str) -> Dict[str, Any]:
        """
        Resolves a search location query:
        1. Checks preconfigured list (GEOGRAPHY_REGISTRY)
        2. Checks geocoding cache database table
        3. Fails back to hashing coordinate lookup (determinisitc offline fallback)
        """
        cleaned = location_query.strip().lower()
        
        # 1. Local Pre-configured Registry
        for key, geo in GEOGRAPHY_REGISTRY.items():
            if key in cleaned or cleaned in key:
                return {
                    "latitude": geo["lat"],
                    "longitude": geo["lon"],
                    "country": geo["country"],
                    "state": geo["state"],
                    "city": key.title(),
                    "cached": True
                }

        # 2. Database Geocoding Cache
        cached = MapRepository.get_geocoding_cache(db, cleaned)
        if cached:
            return {
                "latitude": cached.latitude,
                "longitude": cached.longitude,
                "country": cached.resolved_country,
                "state": cached.resolved_state,
                "city": cached.resolved_city,
                "cached": True
            }

        # 3. Deterministic Hashing Offline Fallback
        # Produce repeatable pseudo-random coordinates
        hash_val = abs(hash(cleaned))
        # Latitude range: -40 to 60, Longitude range: -120 to 140
        lat = -40.0 + (hash_val % 100)
        lon = -120.0 + ((hash_val // 100) % 260)
        
        # Parse fields from the query
        parts = [p.strip().title() for p in cleaned.split(",")]
        city = parts[0] if len(parts) > 0 else "Unknown City"
        state = parts[1] if len(parts) > 1 else None
        country = parts[2] if len(parts) > 2 else "Unknown Country"

        # Cache it
        MapRepository.save_geocoding_cache(
            db, 
            query=cleaned, 
            lat=lat, 
            lon=lon,
            country=country,
            state=state,
            city=city
        )

        return {
            "latitude": lat,
            "longitude": lon,
            "country": country,
            "state": state,
            "city": city,
            "cached": False
        }

        MapRepository.bulk_insert_map_data(db, seed_objects)
        print(f"SUCCESS: Seeded {len(seed_objects)} records in map_data table.")

    @staticmethod
    def get_enriched_file_df(db: Session, file_id: str):
        from services.model_engine import ModelEngine
        from models import UploadedFile
        
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            import pandas as pd
            return pd.DataFrame()
            
        df = None
        try:
            df = ModelEngine.load_report_dataframe(file_id, db)
        except Exception as e:
            print(f"Error loading report dataframe: {e}")
            
        if df is None or df.empty:
            if file_record.file_path:
                from services.data_processor import DataProcessor
                try:
                    df = DataProcessor.read_file(file_record.file_path)
                except Exception as e:
                    print(f"Error reading file directly: {e}")
                    
        if df is None or df.empty:
            import pandas as pd
            return pd.DataFrame()
            
        # Ensure we work on a copy to avoid mutating cache
        df = df.copy()
            
        # Auto-detect key columns
        location_col = None
        category_col = None
        date_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if col_lower in ["city", "town", "location"]:
                location_col = col
                break
                
        if not location_col:
            for col in df.columns:
                col_lower = col.lower()
                if col_lower in ["region", "state", "country"]:
                    location_col = col
                    break
            if not location_col:
                location_col = df.columns[0]
                
        for col in df.columns:
            col_lower = col.lower()
            if col_lower in ["category", "type"]:
                category_col = col
                break
        if not category_col:
            for col in df.columns:
                col_lower = col.lower()
                if "category" in col_lower or "type" in col_lower:
                    category_col = col
                    break
            if not category_col:
                category_col = df.columns[0]
                
        for col in df.columns:
            col_lower = col.lower()
            if col_lower in ["date", "orderdate", "order_date"]:
                date_col = col
                break
        if not date_col:
            for col in df.columns:
                col_lower = col.lower()
                if "date" in col_lower:
                    date_col = col
                    break
                    
        # Resolve numeric columns for sales, profit, revenue
        sales_col = None
        profit_col = None
        revenue_col = None
        quantity_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if col_lower in ["sales", "totalprice", "total_price"]:
                sales_col = col
            elif col_lower in ["profit"]:
                profit_col = col
            elif col_lower in ["revenue"]:
                revenue_col = col
            elif col_lower in ["quantity", "qty"]:
                quantity_col = col
                
        # Fallback mappings
        if not sales_col:
            sales_col = revenue_col or profit_col or df.columns[0]
        if not profit_col:
            profit_col = sales_col
        if not revenue_col:
            revenue_col = sales_col
        if not quantity_col:
            quantity_col = sales_col
            
        import pandas as pd
        for col in [sales_col, profit_col, revenue_col, quantity_col]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
                
        if date_col and date_col in df.columns:
            df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
            
        # Geocode unique locations
        unique_locations = df[location_col].dropna().unique()
        location_geo = {}
        for loc in unique_locations:
            geo = MapService.geocode_location(db, str(loc))
            location_geo[loc] = geo
            
        df["_latitude"] = df[location_col].map(lambda x: location_geo.get(x, {}).get("latitude"))
        df["_longitude"] = df[location_col].map(lambda x: location_geo.get(x, {}).get("longitude"))
        df["_country"] = df[location_col].map(lambda x: location_geo.get(x, {}).get("country"))
        df["_state"] = df[location_col].map(lambda x: location_geo.get(x, {}).get("state"))
        df["_city"] = df[location_col].map(lambda x: location_geo.get(x, {}).get("city"))
        df["_location"] = df[location_col].map(lambda x: f"{x}, {location_geo.get(x, {}).get('state', '') or ''}, {location_geo.get(x, {}).get('country', '') or ''}")
        
        df.attrs["location_col"] = location_col
        df.attrs["category_col"] = category_col
        df.attrs["date_col"] = date_col
        df.attrs["sales_col"] = sales_col
        df.attrs["profit_col"] = profit_col
        df.attrs["revenue_col"] = revenue_col
        df.attrs["quantity_col"] = quantity_col
        
        return df

    @staticmethod
    def filter_file_df(df, filters: Optional[Dict[str, Any]]):
        if not filters:
            return df
            
        import pandas as pd
        
        category_col = df.attrs.get("category_col")
        date_col = df.attrs.get("date_col")
        
        if "category" in filters and filters["category"]:
            cats = filters["category"]
            if not isinstance(cats, list):
                cats = [cats]
            cats = [c for c in cats if c]
            if cats and category_col in df.columns:
                cats_set = {str(c).lower() for c in cats}
                df = df[df[category_col].astype(str).str.lower().isin(cats_set)]
                
        if "country" in filters and filters["country"] and "_country" in df.columns:
            countries = filters["country"]
            if not isinstance(countries, list):
                countries = [countries]
            countries = [c for c in countries if c]
            if countries:
                countries_set = {str(c).lower() for c in countries}
                df = df[df["_country"].astype(str).str.lower().isin(countries_set)]
                
        if "state" in filters and filters["state"] and "_state" in df.columns:
            states = filters["state"]
            if not isinstance(states, list):
                states = [states]
            states = [s for s in states if s]
            if states:
                states_set = {str(s).lower() for s in states}
                df = df[df["_state"].astype(str).str.lower().isin(states_set)]
                
        if "city" in filters and filters["city"] and "_city" in df.columns:
            cities = filters["city"]
            if not isinstance(cities, list):
                cities = [cities]
            cities = [c for c in cities if c]
            if cities:
                cities_set = {str(c).lower() for c in cities}
                df = df[df["_city"].astype(str).str.lower().isin(cities_set)]
                
        if date_col and date_col in df.columns:
            if "date_start" in filters and filters["date_start"]:
                dt_start = pd.to_datetime(filters["date_start"], errors='coerce')
                if not pd.isna(dt_start):
                    df = df[df[date_col] >= dt_start]
            if "date_end" in filters and filters["date_end"]:
                dt_end = pd.to_datetime(filters["date_end"], errors='coerce')
                if not pd.isna(dt_end):
                    df = df[df[date_col] <= dt_end]
                    
        sales_col = df.attrs.get("sales_col")
        if sales_col and sales_col in df.columns:
            if "min_value" in filters and filters["min_value"] is not None:
                df = df[df[sales_col] >= float(filters["min_value"])]
            if "max_value" in filters and filters["max_value"] is not None:
                df = df[df[sales_col] <= float(filters["max_value"])]
                
        return df

    @staticmethod
    def get_file_map_data(db: Session, file_id: str, filters: Optional[Dict[str, Any]] = None, offset: int = 0, limit: int = 100) -> Dict[str, Any]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty:
            return {"total": 0, "offset": offset, "limit": limit, "data": []}
            
        df = MapService.filter_file_df(df, filters)
        total = len(df)
        df_page = df.iloc[offset : offset + limit]
        
        data = []
        category_col = df.attrs["category_col"]
        date_col = df.attrs["date_col"]
        sales_col = df.attrs["sales_col"]
        profit_col = df.attrs["profit_col"]
        revenue_col = df.attrs["revenue_col"]
        quantity_col = df.attrs["quantity_col"]
        
        import pandas as pd
        for idx, row in df_page.iterrows():
            d_val = row[date_col] if date_col in df.columns and not pd.isna(row[date_col]) else None
            if isinstance(d_val, pd.Timestamp):
                d_val = d_val.date()
                
            data.append({
                "id": idx,
                "location": str(row["_location"]),
                "country": str(row["_country"]),
                "state": str(row["_state"]),
                "city": str(row["_city"]),
                "latitude": float(row["_latitude"]) if not pd.isna(row["_latitude"]) else None,
                "longitude": float(row["_longitude"]) if not pd.isna(row["_longitude"]) else None,
                "sales": float(row[sales_col]),
                "profit": float(row[profit_col]),
                "revenue": float(row[revenue_col]),
                "category": str(row[category_col]) if category_col in df.columns else None,
                "date": d_val,
                "additional_fields": {
                    "quantity": int(row[quantity_col]) if quantity_col in df.columns else None
                }
            })
            
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "data": data
        }

    @staticmethod
    def get_file_countries(db: Session, file_id: str) -> List[str]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty or "_country" not in df.columns:
            return []
        return sorted([c for c in df["_country"].dropna().unique().tolist() if c])

    @staticmethod
    def get_file_states(db: Session, file_id: str, country: Optional[str] = None) -> List[str]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty or "_state" not in df.columns:
            return []
        if country:
            df = df[df["_country"].astype(str).str.lower() == country.lower()]
        return sorted([s for s in df["_state"].dropna().unique().tolist() if s])

    @staticmethod
    def get_file_cities(db: Session, file_id: str, state: Optional[str] = None, country: Optional[str] = None) -> List[str]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty or "_city" not in df.columns:
            return []
        if country:
            df = df[df["_country"].astype(str).str.lower() == country.lower()]
        if state:
            df = df[df["_state"].astype(str).str.lower() == state.lower()]
        return sorted([c for c in df["_city"].dropna().unique().tolist() if c])

    @staticmethod
    def get_file_categories(db: Session, file_id: str) -> List[str]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty:
            return []
        category_col = df.attrs.get("category_col")
        if not category_col or category_col not in df.columns:
            return []
        return sorted([c for c in df[category_col].dropna().unique().tolist() if c])

    @staticmethod
    def get_file_aggregated_data(
        db: Session,
        file_id: str,
        group_by: str,
        measure: str,
        agg_type: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty:
            return []
            
        df = MapService.filter_file_df(df, filters)
        if df.empty:
            return []
            
        group_col = f"_{group_by}" if f"_{group_by}" in df.columns else group_by
        if group_by == "category":
            group_col = df.attrs["category_col"]
            
        meas_col = df.attrs.get(f"{measure}_col")
        if not meas_col or meas_col not in df.columns:
            meas_col = df.attrs["sales_col"]
            
        import pandas as pd
        if agg_type == "average":
            agg_res = df.groupby(group_col).agg(
                value=(meas_col, "mean"),
                count=(meas_col, "count"),
                latitude=("_latitude", "mean"),
                longitude=("_longitude", "mean")
            )
        elif agg_type == "min":
            agg_res = df.groupby(group_col).agg(
                value=(meas_col, "min"),
                count=(meas_col, "count"),
                latitude=("_latitude", "mean"),
                longitude=("_longitude", "mean")
            )
        elif agg_type == "max":
            agg_res = df.groupby(group_col).agg(
                value=(meas_col, "max"),
                count=(meas_col, "count"),
                latitude=("_latitude", "mean"),
                longitude=("_longitude", "mean")
            )
        elif agg_type == "count":
            agg_res = df.groupby(group_col).agg(
                value=(meas_col, "count"),
                count=(meas_col, "count"),
                latitude=("_latitude", "mean"),
                longitude=("_longitude", "mean")
            )
        else: # sum
            agg_res = df.groupby(group_col).agg(
                value=(meas_col, "sum"),
                count=(meas_col, "count"),
                latitude=("_latitude", "mean"),
                longitude=("_longitude", "mean")
            )
            
        items = []
        for grp_name, row in agg_res.iterrows():
            items.append({
                "group_name": str(grp_name),
                "value": float(row["value"]) if not pd.isna(row["value"]) else 0.0,
                "count": int(row["count"]),
                "latitude": float(row["latitude"]) if not pd.isna(row["latitude"]) else None,
                "longitude": float(row["longitude"]) if not pd.isna(row["longitude"]) else None
            })
            
        return items

    @staticmethod
    def get_file_heatmap_data(
        db: Session,
        file_id: str,
        measure: str = "sales",
        agg_type: str = "sum",
        filters: Optional[Dict[str, Any]] = None,
        grid_precision: float = 0.1
    ) -> List[Dict[str, Any]]:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty:
            return []
            
        df = MapService.filter_file_df(df, filters)
        if df.empty:
            return []
            
        import numpy as np
        import pandas as pd
        
        df["lat_grid"] = np.round(df["_latitude"] / grid_precision) * grid_precision
        df["lon_grid"] = np.round(df["_longitude"] / grid_precision) * grid_precision
        
        meas_col = df.attrs.get(f"{measure}_col")
        if not meas_col or meas_col not in df.columns:
            meas_col = df.attrs["sales_col"]
            
        if agg_type == "average":
            agg_res = df.groupby(["lat_grid", "lon_grid"]).agg(
                value=(meas_col, "mean"),
                count=(meas_col, "count"),
                location_preview=("_location", "first")
            )
        elif agg_type == "min":
            agg_res = df.groupby(["lat_grid", "lon_grid"]).agg(
                value=(meas_col, "min"),
                count=(meas_col, "count"),
                location_preview=("_location", "first")
            )
        elif agg_type == "max":
            agg_res = df.groupby(["lat_grid", "lon_grid"]).agg(
                value=(meas_col, "max"),
                count=(meas_col, "count"),
                location_preview=("_location", "first")
            )
        elif agg_type == "count":
            agg_res = df.groupby(["lat_grid", "lon_grid"]).agg(
                value=(meas_col, "count"),
                count=(meas_col, "count"),
                location_preview=("_location", "first")
            )
        else: # sum
            agg_res = df.groupby(["lat_grid", "lon_grid"]).agg(
                value=(meas_col, "sum"),
                count=(meas_col, "count"),
                location_preview=("_location", "first")
            )
            
        items = []
        for (lat, lon), row in agg_res.iterrows():
            items.append({
                "latitude": float(lat),
                "longitude": float(lon),
                "value": float(row["value"]) if not pd.isna(row["value"]) else 0.0,
                "count": int(row["count"]),
                "location": str(row["location_preview"])
            })
            
        return items

    @staticmethod
    def export_file_data(db: Session, file_id: str, format_type: str, filters: Optional[Dict[str, Any]] = None) -> str:
        df = MapService.get_enriched_file_df(db, file_id)
        if df.empty:
            return ""
        df = MapService.filter_file_df(df, filters)
        
        location_col = df.attrs["location_col"]
        category_col = df.attrs["category_col"]
        date_col = df.attrs["date_col"]
        sales_col = df.attrs["sales_col"]
        profit_col = df.attrs["profit_col"]
        revenue_col = df.attrs["revenue_col"]
        quantity_col = df.attrs["quantity_col"]
        
        import pandas as pd
        records = []
        for idx, row in df.iterrows():
            d_val = row[date_col] if date_col in df.columns and not pd.isna(row[date_col]) else None
            if isinstance(d_val, pd.Timestamp):
                d_val = str(d_val.date())
            else:
                d_val = str(d_val) if d_val else None
                
            records.append({
                "id": idx,
                "location": str(row["_location"]),
                "country": str(row["_country"]),
                "state": str(row["_state"]),
                "city": str(row["_city"]),
                "latitude": float(row["_latitude"]) if not pd.isna(row["_latitude"]) else None,
                "longitude": float(row["_longitude"]) if not pd.isna(row["_longitude"]) else None,
                "sales": float(row[sales_col]) if sales_col in df.columns else 0.0,
                "profit": float(row[profit_col]) if profit_col in df.columns else 0.0,
                "revenue": float(row[revenue_col]) if revenue_col in df.columns else 0.0,
                "category": str(row[category_col]) if category_col in df.columns else None,
                "date": d_val
            })
            
        if format_type == "csv":
            import io
            import csv
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["ID", "Location", "Country", "State", "City", "Latitude", "Longitude", "Sales", "Profit", "Revenue", "Category", "Date"])
            for r in records:
                writer.writerow([r["id"], r["location"], r["country"], r["state"], r["city"], r["latitude"], r["longitude"], r["sales"], r["profit"], r["revenue"], r["category"], r["date"]])
            return output.getvalue()
        elif format_type == "json":
            import json
            return json.dumps(records, indent=2)
        else:
            raise ValueError(f"Unsupported export format: {format_type}")
