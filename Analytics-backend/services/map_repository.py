from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Dict, Any, Optional
from map_model import MapData, GeocodingCache
from datetime import datetime

class MapRepository:
    @staticmethod
    def get_all(db: Session, filters: Optional[Dict[str, Any]] = None, offset: int = 0, limit: int = 100) -> List[MapData]:
        query = db.query(MapData)
        query = MapRepository._apply_filters(query, filters)
        return query.offset(offset).limit(limit).all()

    @staticmethod
    def get_count(db: Session, filters: Optional[Dict[str, Any]] = None) -> int:
        query = db.query(func.count(MapData.id))
        query = MapRepository._apply_filters(query, filters)
        return query.scalar() or 0

    @staticmethod
    def get_countries(db: Session) -> List[str]:
        results = db.query(MapData.country).distinct().filter(MapData.country.isnot(None)).all()
        return [r[0] for r in results if r[0]]

    @staticmethod
    def get_states(db: Session, country: Optional[str] = None) -> List[str]:
        query = db.query(MapData.state).distinct().filter(MapData.state.isnot(None))
        if country:
            query = query.filter(MapData.country == country)
        results = query.all()
        return [r[0] for r in results if r[0]]

    @staticmethod
    def get_cities(db: Session, state: Optional[str] = None, country: Optional[str] = None) -> List[str]:
        query = db.query(MapData.city).distinct().filter(MapData.city.isnot(None))
        if country:
            query = query.filter(MapData.country == country)
        if state:
            query = query.filter(MapData.state == state)
        results = query.all()
        return [r[0] for r in results if r[0]]

    @staticmethod
    def get_categories(db: Session) -> List[str]:
        results = db.query(MapData.category).distinct().filter(MapData.category.isnot(None)).all()
        return [r[0] for r in results if r[0]]

    @staticmethod
    def get_aggregated_data(
        db: Session, 
        group_by: str, 
        measure: str, 
        agg_type: str, 
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        # Map fields
        group_col = getattr(MapData, group_by, MapData.country)
        meas_col = getattr(MapData, measure, MapData.sales)

        # Select aggregation function
        if agg_type == "average":
            agg_func = func.avg(meas_col)
        elif agg_type == "min":
            agg_func = func.min(meas_col)
        elif agg_type == "max":
            agg_func = func.max(meas_col)
        elif agg_type == "count":
            agg_func = func.count(meas_col)
        else:
            agg_func = func.sum(meas_col)

        # Base query
        query = db.query(
            group_col.label("group_name"),
            agg_func.label("value"),
            func.count(MapData.id).label("count"),
            func.avg(MapData.latitude).label("latitude"),
            func.avg(MapData.longitude).label("longitude")
        )

        query = MapRepository._apply_filters(query, filters)
        query = query.group_by(group_col)
        
        results = query.all()
        return [
            {
                "group_name": r.group_name,
                "value": float(r.value) if r.value is not None else 0.0,
                "count": r.count,
                "latitude": float(r.latitude) if r.latitude is not None else None,
                "longitude": float(r.longitude) if r.longitude is not None else None
            } for r in results
        ]

    @staticmethod
    def get_spatial_aggregation(
        db: Session,
        measure: str,
        agg_type: str,
        grid_precision: float = 0.1,  # 0.1 degree corresponds to ~11km
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Groups points on a coordinate grid for extremely large datasets (100,000+ rows).
        Works on SQLite and PostgreSQL.
        """
        meas_col = getattr(MapData, measure, MapData.sales)
        if agg_type == "average":
            agg_func = func.avg(meas_col)
        elif agg_type == "min":
            agg_func = func.min(meas_col)
        elif agg_type == "max":
            agg_func = func.max(meas_col)
        elif agg_type == "count":
            agg_func = func.count(meas_col)
        else:
            agg_func = func.sum(meas_col)

        # Define grid-based rounding using standard division and rounding in SQL
        # round(coord / precision) * precision
        lat_grid = func.round(MapData.latitude / grid_precision) * grid_precision
        lon_grid = func.round(MapData.longitude / grid_precision) * grid_precision

        query = db.query(
            lat_grid.label("lat"),
            lon_grid.label("lon"),
            agg_func.label("value"),
            func.count(MapData.id).label("count"),
            func.max(MapData.location).label("location_preview")
        ).filter(
            MapData.latitude.isnot(None),
            MapData.longitude.isnot(None)
        )

        query = MapRepository._apply_filters(query, filters)
        query = query.group_by(lat_grid, lon_grid)

        results = query.all()
        return [
            {
                "latitude": float(r.lat),
                "longitude": float(r.lon),
                "value": float(r.value) if r.value is not None else 0.0,
                "count": r.count,
                "location": r.location_preview
            } for r in results
        ]

    @staticmethod
    def get_geocoding_cache(db: Session, query: str) -> Optional[GeocodingCache]:
        return db.query(GeocodingCache).filter(GeocodingCache.query == query.strip().lower()).first()

    @staticmethod
    def save_geocoding_cache(
        db: Session, 
        query: str, 
        lat: float, 
        lon: float,
        country: Optional[str] = None,
        state: Optional[str] = None,
        city: Optional[str] = None
    ) -> GeocodingCache:
        cache_item = GeocodingCache(
            query=query.strip().lower(),
            latitude=lat,
            longitude=lon,
            resolved_country=country,
            resolved_state=state,
            resolved_city=city
        )
        db.add(cache_item)
        db.commit()
        db.refresh(cache_item)
        return cache_item

    @staticmethod
    def bulk_insert_map_data(db: Session, items: List[MapData]):
        db.bulk_save_objects(items)
        db.commit()

    @staticmethod
    def _apply_filters(query, filters: Optional[Dict[str, Any]]):
        if not filters:
            return query

        if "country" in filters and filters["country"]:
            countries = filters["country"]
            if isinstance(countries, list):
                query = query.filter(MapData.country.in_(countries))
            else:
                query = query.filter(MapData.country == countries)

        if "state" in filters and filters["state"]:
            states = filters["state"]
            if isinstance(states, list):
                query = query.filter(MapData.state.in_(states))
            else:
                query = query.filter(MapData.state == states)

        if "city" in filters and filters["city"]:
            cities = filters["city"]
            if isinstance(cities, list):
                query = query.filter(MapData.city.in_(cities))
            else:
                query = query.filter(MapData.city == cities)

        if "category" in filters and filters["category"]:
            categories = filters["category"]
            if isinstance(categories, list):
                query = query.filter(MapData.category.in_(categories))
            else:
                query = query.filter(MapData.category == categories)

        if "date_start" in filters and filters["date_start"]:
            dt_start = datetime.strptime(filters["date_start"], "%Y-%m-%d").date()
            query = query.filter(MapData.date >= dt_start)

        if "date_end" in filters and filters["date_end"]:
            dt_end = datetime.strptime(filters["date_end"], "%Y-%m-%d").date()
            query = query.filter(MapData.date <= dt_end)

        if "min_value" in filters and filters["min_value"] is not None:
            query = query.filter(MapData.sales >= float(filters["min_value"]))

        if "max_value" in filters and filters["max_value"] is not None:
            query = query.filter(MapData.sales <= float(filters["max_value"]))

        return query
