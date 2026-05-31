"""
Apply schema registry rules to raw API JSON → normalized row dicts for storage & charts.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from services.api_connector.schema_registry import (
    _flatten_record,
    find_records_array,
    merge_schema_config,
)


def _get_by_path(obj: Any, path: str) -> Any:
    if not path:
        return obj
    current = obj
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _build_checksum(row: dict, delta_fields: list[str]) -> str:
    payload = {k: row.get(k) for k in delta_fields if k in row}
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


class APIDataTransformer:
    """Normalize arbitrary API payloads using a per-connection schema config."""

    def __init__(self, schema_config: dict):
        self.schema_config = schema_config or {}

    @classmethod
    def from_payload(cls, payload: Any, user_schema: dict | None = None) -> "APIDataTransformer":
        from services.api_connector.schema_registry import infer_schema_from_payload

        inferred = infer_schema_from_payload(payload)
        merged = merge_schema_config(inferred, user_schema)
        return cls(merged)

    def transform(self, payload: Any) -> tuple[list[dict], dict]:
        """
        Returns (normalized_rows, stats).
        Each row has canonical field names + _entity_id, _checksum, _primary_key.
        """
        records_path = self.schema_config.get("records_path") or ""
        if records_path:
            scoped = _get_by_path(payload, records_path)
            records, _ = find_records_array(scoped if scoped is not None else payload)
        else:
            records, _ = find_records_array(payload)

        mappings: dict[str, str] = dict(self.schema_config.get("field_mappings") or {})
        excluded = set(self.schema_config.get("excluded_fields") or [])
        included = self.schema_config.get("included_fields")
        primary_key_field = self.schema_config.get("primary_key")
        delta_fields = list(self.schema_config.get("delta_fields") or [])

        if included:
            allowed_api = set(included) - excluded
        else:
            allowed_api = set(mappings.keys()) - excluded

        normalized: list[dict] = []
        for idx, record in enumerate(records):
            if not isinstance(record, dict):
                record = {"value": record}
            flat = _flatten_record(record)

            row: dict[str, Any] = {}
            for api_field in allowed_api:
                if api_field not in flat:
                    continue
                canonical = mappings.get(api_field, api_field.replace(".", "_"))
                row[canonical] = flat[api_field]

            entity_id = None
            if primary_key_field and primary_key_field in flat:
                entity_id = str(flat[primary_key_field])
            elif primary_key_field:
                # primary_key may be canonical name
                for api_field, canon in mappings.items():
                    if canon == primary_key_field and api_field in flat:
                        entity_id = str(flat[api_field])
                        break
            if entity_id is None:
                entity_id = str(idx)

            row["_entity_id"] = entity_id
            if not delta_fields:
                delta_fields = [
                    k for k, v in row.items()
                    if k != "_entity_id" and isinstance(v, (int, float))
                ]
            row["_checksum"] = _build_checksum(row, delta_fields)
            normalized.append(row)

        stats = {
            "processed": len(records),
            "normalized": len(normalized),
            "schema_config": self.schema_config,
        }
        return normalized, stats

    def transform_for_preview(self, payload: Any, limit: int = 20) -> dict:
        rows, stats = self.transform(payload)
        public_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows[:limit]]
        from services.api_connector.schema_detector import detect_schema

        fields = detect_schema(public_rows) if public_rows else []
        return {
            "rows": public_rows,
            "columns": list(public_rows[0].keys()) if public_rows else [],
            "schema": fields,
            "schema_config": stats["schema_config"],
            "row_count": len(rows),
            "processed": stats["processed"],
        }
