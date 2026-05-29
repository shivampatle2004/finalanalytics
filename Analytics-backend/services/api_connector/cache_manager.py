from datetime import datetime, timedelta, timezone
from typing import Optional

import models


def refresh_interval_to_timedelta(value: Optional[str]) -> Optional[timedelta]:
    mapping = {
        "manual": None,
        "1 min": timedelta(minutes=1),
        "5 mins": timedelta(minutes=5),
        "15 mins": timedelta(minutes=15),
        "hourly": timedelta(hours=1),
        "daily": timedelta(days=1),
    }
    return mapping.get((value or "manual").strip().lower())


def write_cache(db, connection_id: str, payload: dict, refresh_interval: Optional[str]):
    delta = refresh_interval_to_timedelta(refresh_interval)
    now = datetime.now(timezone.utc)
    expires_at = now + delta if delta else None
    row = (
        db.query(models.ApiCache)
        .filter(models.ApiCache.connection_id == connection_id)
        .order_by(models.ApiCache.cache_created_at.desc())
        .first()
    )
    if not row:
        row = models.ApiCache(connection_id=connection_id)
        db.add(row)
    row.cached_response = payload
    row.cache_created_at = now
    row.expires_at = expires_at
    db.flush()
    return row

