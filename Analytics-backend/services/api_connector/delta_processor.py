"""
Delta upsert for normalized API connector rows.
Only writes NEW or UPDATED entities (checksum changed).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import models


def save_to_database_with_delta(
    db,
    *,
    connection_id: str,
    rows: list[dict],
    primary_key_field: str | None = None,
) -> dict[str, int]:
    """
    Upsert normalized rows into api_connector_data.
    Returns counts: processed, saved, skipped (unchanged).
    """
    if not rows:
        return {"processed": 0, "saved": 0, "skipped": 0, "inserted": 0, "updated": 0}

    entity_ids = [str(r.get("_entity_id", "")) for r in rows if r.get("_entity_id") is not None]
    existing_map: dict[str, models.ApiConnectorData] = {}
    if entity_ids:
        existing = (
            db.query(models.ApiConnectorData)
            .filter(
                models.ApiConnectorData.connection_id == connection_id,
                models.ApiConnectorData.entity_id.in_(entity_ids),
            )
            .all()
        )
        existing_map = {e.entity_id: e for e in existing}

    processed = len(rows)
    saved = 0
    skipped = 0
    inserted = 0
    updated = 0
    now = datetime.now(timezone.utc)

    for row in rows:
        entity_id = str(row.get("_entity_id", ""))
        if not entity_id:
            continue
        checksum = row.get("_checksum", "")
        public_data = {k: v for k, v in row.items() if not k.startswith("_")}

        composite_pk = f"{connection_id}:{entity_id}"
        label = _pick_label(public_data, primary_key_field, entity_id)
        price = _pick_numeric(public_data, ("price", "current_price", "last_price", "close"))

        existing = existing_map.get(entity_id)
        if existing:
            if existing.checksum == checksum:
                skipped += 1
                continue
            existing.data = public_data
            existing.checksum = checksum
            existing.delta_type = "updated"
            existing.instrument = label
            existing.price = price
            existing.primary_key = composite_pk
            existing.updated_at = now
            updated += 1
            saved += 1
        else:
            db.add(
                models.ApiConnectorData(
                    connection_id=connection_id,
                    entity_id=entity_id,
                    primary_key=composite_pk,
                    instrument=label,
                    price=price,
                    data=public_data,
                    checksum=checksum,
                    delta_type="new",
                    updated_at=now,
                )
            )
            inserted += 1
            saved += 1

    db.flush()
    return {
        "processed": processed,
        "saved": saved,
        "skipped": skipped,
        "inserted": inserted,
        "updated": updated,
    }


def load_connector_rows(
    db,
    connection_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Load latest normalized rows for pipeline / visualization."""
    rows = (
        db.query(models.ApiConnectorData)
        .filter(models.ApiConnectorData.connection_id == connection_id)
        .order_by(models.ApiConnectorData.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [dict(r.data or {}) for r in rows]


def _pick_label(data: dict, primary_key_field: str | None, entity_id: str) -> str | None:
    for key in ("name", "symbol", "title", "label", primary_key_field):
        if key and data.get(key) is not None:
            return str(data[key])[:255]
    return entity_id[:255] if entity_id else None


def _pick_numeric(data: dict, keys: tuple[str, ...]) -> float | None:
    for key in keys:
        val = data.get(key)
        if val is None:
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return None
