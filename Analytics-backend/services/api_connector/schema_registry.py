"""
Schema registry for REST API connectors.

Auto-infers structure from any JSON response so users can connect arbitrary APIs
and get stable, chart-ready column names.
"""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from services.api_connector.schema_detector import _detect_type, detect_schema
from services.api_connector.transformer import flatten_json

# Common API field → canonical name (applied during auto-inference)
COMMON_FIELD_ALIASES: dict[str, str] = {
    "current_price": "price",
    "last_price": "price",
    "close": "price",
    "total_volume": "volume",
    "vol": "volume",
    "quote_volume": "quote_volume",
    "market_cap": "market_cap",
    "marketcap": "market_cap",
    "full_name": "name",
    "title": "name",
    "label": "name",
    "symbol": "symbol",
    "ticker": "symbol",
    "created_at": "created_at",
    "updated_at": "updated_at",
    "timestamp": "timestamp",
    "date": "date",
}

PRIMARY_KEY_CANDIDATES = (
    "id",
    "_id",
    "uuid",
    "symbol",
    "code",
    "key",
    "slug",
    "name",
    "ticker",
    "sku",
    "order_id",
    "transaction_id",
)

EXCLUDE_FIELD_PATTERNS = re.compile(
    r"(^image$|image_|_image|sparkline|logo|icon|avatar|thumbnail|url$|href$|link$|"
    r"description|html|raw_|_raw|metadata|permissions|relations)",
    re.IGNORECASE,
)

MAX_FLATTEN_DEPTH = 2


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def find_records_array(payload: Any) -> tuple[list[dict], str]:
    """
    Locate the best array-of-objects in an arbitrary JSON payload.
    Returns (records, dot_path) where path is '' for root array.
    """
    if isinstance(payload, list):
        dict_rows = [x for x in payload if isinstance(x, dict)]
        if dict_rows:
            return dict_rows, ""
        return [{"value": x} for x in payload], ""

    if not isinstance(payload, dict):
        return [{"value": payload}], ""

    candidates: list[tuple[int, str, list]] = []

    def walk(obj: Any, path: str = "", depth: int = 0):
        if depth > 6:
            return
        if isinstance(obj, list):
            dict_rows = [x for x in obj if isinstance(x, dict)]
            if dict_rows and len(dict_rows) >= max(1, len(obj) // 2):
                candidates.append((len(dict_rows), path, dict_rows))
            return
        if isinstance(obj, dict):
            for key, val in obj.items():
                child_path = f"{path}.{key}" if path else key
                walk(val, child_path, depth + 1)

    walk(payload)
    if candidates:
        candidates.sort(key=lambda x: (-x[0], len(x[1])))
        return candidates[0][2], candidates[0][1]

    return [payload], ""


def _flatten_record(record: dict, max_depth: int = MAX_FLATTEN_DEPTH) -> dict:
    """Flatten nested dicts up to max_depth; skip deep objects/arrays."""
    flat = flatten_json(record)
    result: dict[str, Any] = {}
    for key, value in flat.items():
        depth = key.count(".")
        if depth > max_depth:
            continue
        if isinstance(value, (dict, list)):
            continue
        if isinstance(value, str) and len(value) > 2000:
            continue
        result[key] = value
    return result


def _pick_primary_key(flat_rows: list[dict]) -> str | None:
    if not flat_rows:
        return None
    sample = flat_rows[: min(200, len(flat_rows))]
    n = len(sample)

    for candidate in PRIMARY_KEY_CANDIDATES:
        values = [row.get(candidate) for row in sample if row.get(candidate) is not None]
        if not values:
            continue
        unique = len(set(str(v) for v in values))
        if unique >= max(1, n * 0.5):
            return candidate

    # Fallback: first string/int column with high cardinality
    for key in flat_rows[0].keys():
        values = [row.get(key) for row in sample if row.get(key) is not None]
        if not values:
            continue
        if _detect_type(values[0]) not in {"string", "integer"}:
            continue
        unique = len(set(str(v) for v in values))
        if unique >= max(2, n * 0.7):
            return key

    return None


def _suggest_canonical_name(field_name: str) -> str:
    base = field_name.split(".")[-1]
    lower = base.lower()
    if lower in COMMON_FIELD_ALIASES:
        return COMMON_FIELD_ALIASES[lower]
    return re.sub(r"[^a-zA-Z0-9_]", "_", base).strip("_").lower() or base


def _should_exclude_field(field_name: str, sample_value: Any) -> bool:
    base = field_name.split(".")[-1]
    if EXCLUDE_FIELD_PATTERNS.search(base):
        return True
    if isinstance(sample_value, str) and sample_value.startswith(("http://", "https://", "data:")):
        if any(x in base.lower() for x in ("image", "logo", "icon", "avatar", "url", "link")):
            return True
    return False


def infer_schema_from_payload(payload: Any) -> dict:
    """
    Build a full schema config from raw API JSON.
    Stored on ApiConnection.schema_config and editable by the user.
    """
    records, records_path = find_records_array(payload)
    flat_rows = [_flatten_record(r) if isinstance(r, dict) else {"value": r} for r in records]

    if not flat_rows:
        return {
            "records_path": records_path,
            "primary_key": None,
            "field_mappings": {},
            "included_fields": [],
            "excluded_fields": [],
            "delta_fields": [],
            "fields": [],
            "auto_inferred": True,
        }

    primary_key = _pick_primary_key(flat_rows)
    field_samples: dict[str, list[Any]] = {}
    for row in flat_rows[:200]:
        for k, v in row.items():
            field_samples.setdefault(k, []).append(v)

    field_mappings: dict[str, str] = {}
    excluded_fields: list[str] = []
    included_fields: list[str] = []

    for api_field, samples in field_samples.items():
        sample = next((v for v in samples if v is not None), None)
        if _should_exclude_field(api_field, sample):
            excluded_fields.append(api_field)
            continue
        canonical = _suggest_canonical_name(api_field)
        # Avoid collisions: keep original if canonical already mapped differently
        if canonical in field_mappings.values() and field_mappings.get(api_field) != canonical:
            canonical = api_field.replace(".", "_")
        field_mappings[api_field] = canonical
        included_fields.append(api_field)

    # Delta fields = numeric measures likely to change
    delta_fields: list[str] = []
    for api_field in included_fields:
        canonical = field_mappings[api_field]
        sample = next((v for v in field_samples[api_field] if v is not None), None)
        if _detect_type(sample) in {"integer", "float"} and canonical != primary_key:
            delta_fields.append(canonical)
    delta_fields = delta_fields[:12]

    # Build field metadata for UI
    normalized_preview = [
        {field_mappings[k]: row.get(k) for k in included_fields if k in row}
        for row in flat_rows[:5]
    ]
    schema_fields = detect_schema(normalized_preview) if normalized_preview else []

    return {
        "records_path": records_path,
        "primary_key": primary_key,
        "field_mappings": field_mappings,
        "included_fields": included_fields,
        "excluded_fields": excluded_fields,
        "delta_fields": delta_fields,
        "fields": schema_fields,
        "auto_inferred": True,
        "record_count": len(flat_rows),
    }


def merge_schema_config(inferred: dict, user_overrides: dict | None) -> dict:
    """Merge user-edited schema with auto-inferred defaults."""
    if not user_overrides:
        return inferred
    merged = deepcopy(inferred)
    for key in (
        "records_path",
        "primary_key",
        "field_mappings",
        "included_fields",
        "excluded_fields",
        "delta_fields",
    ):
        if key in user_overrides and user_overrides[key] is not None:
            merged[key] = user_overrides[key]
    if user_overrides.get("auto_inferred") is False:
        merged["auto_inferred"] = False
    return merged


def schema_fields_for_ui(schema_config: dict) -> list[dict]:
    """Return field metadata list for chart builder from stored schema config."""
    if schema_config.get("fields"):
        return schema_config["fields"]
    mappings = schema_config.get("field_mappings") or {}
    included = schema_config.get("included_fields") or list(mappings.keys())
    rows = [{mappings[k]: None for k in included if k in mappings}]
    return detect_schema(rows) if rows else []
