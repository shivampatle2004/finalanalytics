from sqlalchemy import Column, Integer, String, Float, Date, JSON
from database import Base

class MapData(Base):
    __tablename__ = "map_data"

    id = Column(Integer, primary_key=True, index=True)
    location = Column(String(255), index=True)
    country = Column(String(100), index=True, nullable=True)
    state = Column(String(100), index=True, nullable=True)
    city = Column(String(100), index=True, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    sales = Column(Float, default=0.0)
    profit = Column(Float, default=0.0)
    revenue = Column(Float, default=0.0)
    category = Column(String(100), index=True, nullable=True)
    date = Column(Date, index=True, nullable=True)
    additional_fields = Column(JSON, nullable=True)

class GeocodingCache(Base):
    __tablename__ = "geocoding_cache"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(String(255), unique=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    resolved_country = Column(String(100), nullable=True)
    resolved_state = Column(String(100), nullable=True)
    resolved_city = Column(String(100), nullable=True)
