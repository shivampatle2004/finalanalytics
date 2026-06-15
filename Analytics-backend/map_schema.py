from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date

class MapDataCreate(BaseModel):
    location: str
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sales: Optional[float] = 0.0
    profit: Optional[float] = 0.0
    revenue: Optional[float] = 0.0
    category: Optional[str] = None
    date: Optional[date] = None
    additional_fields: Optional[Dict[str, Any]] = None

class MapDataResponse(BaseModel):
    id: int
    location: str
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sales: float
    profit: float
    revenue: float
    category: Optional[str] = None
    date: Optional[date] = None
    additional_fields: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class MapAggregatedRequest(BaseModel):
    group_by: str = Field(..., description="Field to group by: country, state, city, category")
    measure: str = Field("sales", description="Measure field: sales, revenue, profit")
    agg_type: str = Field("sum", description="Aggregation type: sum, average, min, max, count")
    filters: Optional[Dict[str, Any]] = None
    file_id: Optional[str] = Field(None, description="Optional uploaded file ID context")


class MapAggregatedItem(BaseModel):
    group_name: Optional[str] = None
    value: float
    count: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class MapAggregatedResponse(BaseModel):
    items: List[MapAggregatedItem]
    measure: str
    agg_type: str
