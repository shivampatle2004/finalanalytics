from datetime import datetime, timezone
from typing import Any, Optional
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.api_connector.api_transformer import APIDataTransformer
from services.api_connector.cache_manager import write_cache
from services.api_connector.delta_processor import load_connector_rows, save_to_database_with_delta
from services.api_connector.encryption import decrypt_auth_config, encrypt_auth_config
from services.api_connector.fetcher import APIRequestError, fetch_api_data
from services.api_connector.schema_detector import detect_schema
from services.api_connector.schema_registry import (
    infer_schema_from_payload,
    merge_schema_config,
    schema_fields_for_ui,
)

router = APIRouter(prefix="/api/rest", tags=["api_connections"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ApiConnectionPayload(BaseModel):
    name: str
    base_url: str
    endpoint: str = ""
    http_method: str = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    query_params: dict[str, Any] = Field(default_factory=dict)
    request_body: Optional[dict[str, Any]] = None
    auth_type: str = "none"
    auth_config: dict[str, Any] = Field(default_factory=dict)
    refresh_interval: Optional[str] = "manual"
    created_by: Optional[str] = None
    schema_config: Optional[dict[str, Any]] = None


class SchemaUpdatePayload(BaseModel):
    records_path: Optional[str] = None
    primary_key: Optional[str] = None
    field_mappings: Optional[dict[str, str]] = None
    included_fields: Optional[list[str]] = None
    excluded_fields: Optional[list[str]] = None
    delta_fields: Optional[list[str]] = None


async def _fetch_raw(payload: ApiConnectionPayload):
    return await fetch_api_data(
        base_url=payload.base_url,
        endpoint=payload.endpoint,
        method=payload.http_method,
        headers=payload.headers,
        query_params=payload.query_params,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
        request_body=payload.request_body,
    )


def _resolve_schema_config(raw_payload: Any, user_schema: dict | None) -> dict:
    inferred = infer_schema_from_payload(raw_payload)
    return merge_schema_config(inferred, user_schema)


def _transform_payload(raw_payload: Any, schema_config: dict) -> tuple[list[dict], dict]:
    transformer = APIDataTransformer(schema_config)
    return transformer.transform(raw_payload)


def _save_dataset_records(
    db: Session,
    *,
    connection_id: str,
    connection_name: str,
    result_data: Any,
    normalized_rows: list[dict],
    schema_config: dict,
    delta_stats: dict | None = None,
):
    public_sample = [
        {k: v for k, v in r.items() if not k.startswith("_")} for r in normalized_rows[:20]
    ]
    dataset = models.ApiDataset(
        connection_id=connection_id,
        dataset_name=f"{connection_name} Dataset",
        raw_response=result_data,
        flattened_sample=public_sample,
        row_count=len(normalized_rows),
        schema_detected=True,
    )
    db.add(dataset)
    db.flush()

    fields = schema_fields_for_ui(schema_config) or detect_schema(public_sample)
    for field in fields:
        db.add(
            models.ApiDatasetField(
                dataset_id=dataset.id,
                field_name=field["field_name"],
                display_name=field["display_name"],
                data_type=field["data_type"],
                field_category=field["field_category"],
                is_dimension=field["is_dimension"],
                is_measure=field["is_measure"],
                is_date_field=field["is_date_field"],
                sample_value=field["sample_value"],
            )
        )
    db.flush()
    return dataset, delta_stats or {}


async def _ingest_connection(
    db: Session,
    *,
    connection_id: str,
    connection_name: str,
    payload: ApiConnectionPayload,
    schema_config: dict | None = None,
):
    result = await _fetch_raw(payload)
    merged_schema = _resolve_schema_config(result["data"], schema_config)
    normalized_rows, _ = _transform_payload(result["data"], merged_schema)
    delta_stats = save_to_database_with_delta(
        db,
        connection_id=connection_id,
        rows=normalized_rows,
        primary_key_field=merged_schema.get("primary_key"),
    )
    dataset, delta_stats = _save_dataset_records(
        db,
        connection_id=connection_id,
        connection_name=connection_name,
        result_data=result["data"],
        normalized_rows=normalized_rows,
        schema_config=merged_schema,
        delta_stats=delta_stats,
    )
    write_cache(db, connection_id, result["data"], payload.refresh_interval)
    return result, normalized_rows, merged_schema, dataset, delta_stats


@router.post("/connections/test")
async def test_connection(payload: ApiConnectionPayload):
    try:
        result = await _fetch_raw(payload)
        preview = APIDataTransformer.from_payload(
            result["data"], payload.schema_config
        ).transform_for_preview(result["data"])
        return {
            "success": True,
            "response_time": result["response_time"],
            "status_code": result["status_code"],
            "sample_data": preview["rows"][:20],
        }
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/connections/preview")
async def preview_connection(payload: ApiConnectionPayload):
    try:
        result = await _fetch_raw(payload)
        preview = APIDataTransformer.from_payload(
            result["data"], payload.schema_config
        ).transform_for_preview(result["data"])
        return {
            "success": True,
            "status_code": result["status_code"],
            "response_time": result["response_time"],
            "columns": preview["columns"],
            "rows": preview["rows"],
            "schema": preview["schema"],
            "schema_config": preview["schema_config"],
            "row_count": preview["row_count"],
            "processed": preview["processed"],
        }
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/connections/infer-schema")
async def infer_schema(payload: ApiConnectionPayload):
    """Fetch API once and return auto-inferred schema for user review."""
    try:
        result = await _fetch_raw(payload)
        schema_config = _resolve_schema_config(result["data"], payload.schema_config)
        preview = APIDataTransformer(schema_config).transform_for_preview(result["data"])
        return {
            "success": True,
            "schema_config": schema_config,
            "preview": preview,
        }
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/connections/save")
async def save_connection(payload: ApiConnectionPayload, db: Session = Depends(get_db)):
    try:
        result = await _fetch_raw(payload)
        schema_config = _resolve_schema_config(result["data"], payload.schema_config)
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    conn = models.ApiConnection(
        name=payload.name,
        base_url=payload.base_url,
        endpoint=payload.endpoint,
        http_method=payload.http_method.upper(),
        headers=payload.headers,
        query_params=payload.query_params,
        request_body=payload.request_body,
        auth_type=payload.auth_type,
        auth_config=encrypt_auth_config(payload.auth_config),
        created_by=payload.created_by,
        refresh_interval=payload.refresh_interval,
        connection_status="active",
        last_tested_at=datetime.now(timezone.utc),
        last_refresh_at=datetime.now(timezone.utc),
        schema_config=schema_config,
    )
    db.add(conn)
    db.flush()

    normalized_rows, _ = _transform_payload(result["data"], schema_config)
    delta_stats = save_to_database_with_delta(
        db,
        connection_id=conn.id,
        rows=normalized_rows,
        primary_key_field=schema_config.get("primary_key"),
    )
    dataset, _ = _save_dataset_records(
        db,
        connection_id=conn.id,
        connection_name=payload.name,
        result_data=result["data"],
        normalized_rows=normalized_rows,
        schema_config=schema_config,
        delta_stats=delta_stats,
    )
    write_cache(db, conn.id, result["data"], payload.refresh_interval)
    db.commit()

    from services.api_connector.refresh_scheduler import load_api_refresh_schedules
    load_api_refresh_schedules()

    return {
        "success": True,
        "connection_id": conn.id,
        "dataset_id": dataset.id,
        "schema_config": schema_config,
        "delta": delta_stats,
    }


@router.get("/connections")
def list_connections(db: Session = Depends(get_db)):
    rows = db.query(models.ApiConnection).order_by(models.ApiConnection.created_at.desc()).all()
    return {"connections": rows}


@router.get("/connections/{connection_id}")
def get_connection(connection_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"connection": row}


@router.get("/connections/{connection_id}/schema")
def get_connection_schema(connection_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    schema_config = row.schema_config or {}
    return {
        "schema_config": schema_config,
        "fields": schema_fields_for_ui(schema_config),
    }


@router.put("/connections/{connection_id}/schema")
def update_connection_schema(
    connection_id: str,
    body: SchemaUpdatePayload,
    db: Session = Depends(get_db),
):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    current = dict(row.schema_config or {})
    overrides = body.model_dump(exclude_unset=True)
    merged = merge_schema_config(current, overrides)
    merged["auto_inferred"] = False
    row.schema_config = merged
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "schema_config": merged, "fields": schema_fields_for_ui(merged)}


@router.get("/connections/{connection_id}/fields")
def get_connection_fields(connection_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    if row.schema_config:
        return {"fields": schema_fields_for_ui(row.schema_config)}
    sample = (
        db.query(models.ApiConnectorData)
        .filter(models.ApiConnectorData.connection_id == connection_id)
        .limit(50)
        .all()
    )
    rows = [dict(r.data or {}) for r in sample]
    return {"fields": detect_schema(rows) if rows else []}


@router.get("/connections/{connection_id}/data")
def get_connection_data(
    connection_id: str,
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    rows = load_connector_rows(db, connection_id, limit=limit, offset=offset)
    total = (
        db.query(models.ApiConnectorData)
        .filter(models.ApiConnectorData.connection_id == connection_id)
        .count()
    )
    fields = schema_fields_for_ui(row.schema_config or {}) if row.schema_config else detect_schema(rows[:50])
    return {
        "rows": rows,
        "columns": list(rows[0].keys()) if rows else [],
        "fields": fields,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.put("/connections/{connection_id}")
def update_connection(connection_id: str, payload: ApiConnectionPayload, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    row.name = payload.name
    row.base_url = payload.base_url
    row.endpoint = payload.endpoint
    row.http_method = payload.http_method.upper()
    row.headers = payload.headers
    row.query_params = payload.query_params
    row.request_body = payload.request_body
    row.auth_type = payload.auth_type
    row.auth_config = encrypt_auth_config(payload.auth_config)
    row.refresh_interval = payload.refresh_interval
    if payload.schema_config is not None:
        row.schema_config = merge_schema_config(row.schema_config or {}, payload.schema_config)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()

    from services.api_connector.refresh_scheduler import load_api_refresh_schedules
    load_api_refresh_schedules()

    return {"success": True}


@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    datasets = db.query(models.ApiDataset).filter(models.ApiDataset.connection_id == connection_id).all()
    dataset_ids = [d.id for d in datasets]
    if dataset_ids:
        db.query(models.ApiDatasetField).filter(models.ApiDatasetField.dataset_id.in_(dataset_ids)).delete(synchronize_session=False)
    db.query(models.ApiDataset).filter(models.ApiDataset.connection_id == connection_id).delete(synchronize_session=False)
    db.query(models.ApiRefreshLog).filter(models.ApiRefreshLog.connection_id == connection_id).delete(synchronize_session=False)
    db.query(models.ApiCache).filter(models.ApiCache.connection_id == connection_id).delete(synchronize_session=False)
    db.query(models.ApiConnectorData).filter(models.ApiConnectorData.connection_id == connection_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"success": True}


@router.post("/connections/{connection_id}/refresh")
async def refresh_connection(connection_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    log = models.ApiRefreshLog(
        connection_id=connection_id,
        refresh_status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    db.flush()

    payload = ApiConnectionPayload(
        name=row.name,
        base_url=row.base_url,
        endpoint=row.endpoint,
        http_method=row.http_method,
        headers=row.headers or {},
        query_params=row.query_params or {},
        request_body=row.request_body,
        auth_type=row.auth_type or "none",
        auth_config=decrypt_auth_config(row.auth_config or {}),
        refresh_interval=row.refresh_interval,
        created_by=row.created_by,
        schema_config=row.schema_config,
    )
    try:
        result, normalized_rows, schema_config, dataset, delta_stats = await _ingest_connection(
            db,
            connection_id=row.id,
            connection_name=row.name,
            payload=payload,
            schema_config=row.schema_config,
        )
        if not row.schema_config:
            row.schema_config = schema_config
        row.last_refresh_at = datetime.now(timezone.utc)
        row.connection_status = "active"
        log.refresh_status = "success"
        log.rows_fetched = len(normalized_rows)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "success": True,
            "dataset_id": dataset.id,
            "rows_fetched": len(normalized_rows),
            "processed": delta_stats.get("processed", len(normalized_rows)),
            "records_saved": delta_stats.get("saved", 0),
            "skipped": delta_stats.get("skipped", 0),
            "delta": delta_stats,
        }
    except APIRequestError as exc:
        row.connection_status = "failed"
        log.refresh_status = "failed"
        log.error_message = str(exc)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/datasets/{dataset_id}/schema")
def dataset_schema(dataset_id: str, db: Session = Depends(get_db)):
    fields = (
        db.query(models.ApiDatasetField)
        .filter(models.ApiDatasetField.dataset_id == dataset_id)
        .order_by(models.ApiDatasetField.field_name.asc())
        .all()
    )
    return {"fields": fields}


@router.get("/datasets/{dataset_id}/preview")
def dataset_preview(dataset_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ApiDataset).filter(models.ApiDataset.id == dataset_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"rows": (row.flattened_sample or [])[:20], "row_count": row.row_count or 0}


@router.post("/connections/{connection_id}/materialize")
def materialize_connection_dataset(connection_id: str, db: Session = Depends(get_db)):
    conn = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    rows = load_connector_rows(db, connection_id, limit=50000)
    if not rows:
        dataset = (
            db.query(models.ApiDataset)
            .filter(models.ApiDataset.connection_id == connection_id)
            .order_by(models.ApiDataset.created_at.desc())
            .first()
        )
        if dataset and dataset.flattened_sample:
            rows = list(dataset.flattened_sample)
        elif dataset and dataset.raw_response:
            schema_config = conn.schema_config or infer_schema_from_payload(dataset.raw_response)
            normalized, _ = _transform_payload(dataset.raw_response, schema_config)
            rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in normalized]

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No rows available. Run the connector at least once to ingest data.",
        )

    uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    safe_name = (conn.name or "api_dataset").strip().replace(" ", "_")
    file_name = f"{safe_name}.json"
    file_path = uploads_dir / f"{conn.id}_{file_name}"
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    user_id = None
    try:
        if conn.created_by is not None and str(conn.created_by).strip().isdigit():
            user_id = int(str(conn.created_by).strip())
    except Exception:
        user_id = None

    uploaded = models.UploadedFile(
        user_id=user_id,
        file_name=file_name,
        file_path=str(file_path),
        row_count=len(rows),
        column_count=len(rows[0].keys()) if rows else 0,
        status="completed",
        model_config={
            "source_type": "api_connector",
            "api_connection_id": connection_id,
        },
    )
    db.add(uploaded)
    db.flush()

    fields = schema_fields_for_ui(conn.schema_config or {}) if conn.schema_config else detect_schema(rows[:300])
    for fld in fields:
        db.add(
            models.FileColumn(
                file_id=uploaded.id,
                column_name=fld["field_name"],
                data_type=fld["data_type"],
                null_count=0,
                unique_count=0,
            )
        )

    db.commit()
    return {"success": True, "file_id": uploaded.id, "file_name": uploaded.file_name, "row_count": len(rows)}
