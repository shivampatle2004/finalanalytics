from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import SessionLocal
from map_schema import MapDataResponse, MapAggregatedRequest, MapAggregatedResponse
from services.map_service import MapService
from typing import Optional, List, Dict, Any
from datetime import date

router = APIRouter(prefix="/api/maps", tags=["maps"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/seed")
def force_seed_database(db: Session = Depends(get_db)):
    """Triggers database seeding manually."""
    try:
        MapService.seed_data_if_empty(db)
        return {"status": "success", "message": "Database seed check/populate completed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/data")
def get_map_data(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    country: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    file_id: Optional[str] = Query(None, description="Optional uploaded file ID context"),
    db: Session = Depends(get_db)
):
    """Retrieves filtered paginated raw map data."""
    filters = {}
    if country: filters["country"] = country.split(",") if "," in country else country
    if state: filters["state"] = state.split(",") if "," in state else state
    if city: filters["city"] = city.split(",") if "," in city else city
    if category: filters["category"] = category.split(",") if "," in category else category
    if date_start: filters["date_start"] = date_start
    if date_end: filters["date_end"] = date_end
    if min_value is not None: filters["min_value"] = min_value
    if max_value is not None: filters["max_value"] = max_value

    try:
        if file_id:
            return MapService.get_file_map_data(db, file_id, filters, offset, limit)
        return MapService.get_map_data(db, filters, offset, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/countries", response_model=List[str])
def get_countries(file_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Lists distinct countries available in datasets."""
    if file_id:
        return MapService.get_file_countries(db, file_id)
    return MapService.get_countries(db)

@router.get("/states", response_model=List[str])
def get_states(
    country: Optional[str] = Query(None, description="Filter states by country"),
    file_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Lists distinct states, optionally filtered by country."""
    if file_id:
        return MapService.get_file_states(db, file_id, country)
    return MapService.get_states(db, country)

@router.get("/cities", response_model=List[str])
def get_cities(
    country: Optional[str] = Query(None, description="Filter cities by country"),
    state: Optional[str] = Query(None, description="Filter cities by state"),
    file_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Lists distinct cities, optionally filtered by state or country."""
    if file_id:
        return MapService.get_file_cities(db, file_id, state, country)
    return MapService.get_cities(db, state, country)

@router.get("/categories", response_model=List[str])
def get_categories(file_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Lists distinct categories available in dataset."""
    if file_id:
        return MapService.get_file_categories(db, file_id)
    return MapService.get_categories(db)

@router.post("/aggregated", response_model=MapAggregatedResponse)
def get_aggregated_data(
    payload: MapAggregatedRequest,
    db: Session = Depends(get_db)
):
    """Returns dynamic aggregations grouped by specified attributes."""
    try:
        if payload.file_id:
            items = MapService.get_file_aggregated_data(
                db, 
                file_id=payload.file_id,
                group_by=payload.group_by, 
                measure=payload.measure, 
                agg_type=payload.agg_type, 
                filters=payload.filters
            )
        else:
            items = MapService.get_aggregated_data(
                db, 
                group_by=payload.group_by, 
                measure=payload.measure, 
                agg_type=payload.agg_type, 
                filters=payload.filters
            )
        return {
            "items": items,
            "measure": payload.measure,
            "agg_type": payload.agg_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/heatmap")
def get_heatmap_data(
    measure: str = Query("sales", description="sales, revenue, profit"),
    agg_type: str = Query("sum", description="sum, average, min, max, count"),
    country: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    file_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Retrieves spatial aggregated heatmap intensity grid points."""
    filters = {}
    if country: filters["country"] = country.split(",") if "," in country else country
    if state: filters["state"] = state.split(",") if "," in state else state
    if city: filters["city"] = city.split(",") if "," in city else city
    if category: filters["category"] = category.split(",") if "," in category else category
    if date_start: filters["date_start"] = date_start
    if date_end: filters["date_end"] = date_end

    try:
        if file_id:
            return MapService.get_file_heatmap_data(db, file_id, measure, agg_type, filters)
        return MapService.get_heatmap_data(db, measure, agg_type, filters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export")
def export_map_data(
    format: str = Query("csv", description="csv or json"),
    country: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    file_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Exports filtered dataset as CSV or JSON."""
    filters = {}
    if country: filters["country"] = country.split(",") if "," in country else country
    if state: filters["state"] = state.split(",") if "," in state else state
    if city: filters["city"] = city.split(",") if "," in city else city
    if category: filters["category"] = category.split(",") if "," in category else category
    if date_start: filters["date_start"] = date_start
    if date_end: filters["date_end"] = date_end

    try:
        if file_id:
            content = MapService.export_file_data(db, file_id, format, filters)
        else:
            content = MapService.export_data(db, format, filters)
        media_type = "text/csv" if format == "csv" else "application/json"
        filename = f"map_export_{date.today().isoformat()}.{format}"
        
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/geocode")
def geocode_location(
    query: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    """Resolves geocoding queries utilizing registries, db cache or deterministic hashing."""
    try:
        return MapService.geocode_location(db, query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
