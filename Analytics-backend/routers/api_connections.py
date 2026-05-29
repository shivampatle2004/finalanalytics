from datetime import datetime, timezone
from typing import Any, Optional
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.api_connector.cache_manager import write_cache
from services.api_connector.encryption import decrypt_auth_config, encrypt_auth_config
from services.api_connector.fetcher import APIRequestError, fetch_api_data
from services.api_connector.schema_detector import detect_schema
from services.api_connector.transformer import to_rows

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


async def _materialize_preview(payload: ApiConnectionPayload):
    result = await fetch_api_data(
        base_url=payload.base_url,
        endpoint=payload.endpoint,
        method=payload.http_method,
        headers=payload.headers,
        query_params=payload.query_params,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
        request_body=payload.request_body,
    )
    rows = to_rows(result["data"])
    return result, rows


def _save_dataset_records(
    db: Session,
    *,
    connection_id: str,
    connection_name: str,
    result_data: Any,
    rows: list[dict],
):
    dataset = models.ApiDataset(
        connection_id=connection_id,
        dataset_name=f"{connection_name} Dataset",
        raw_response=result_data,
        flattened_sample=rows[:20],
        row_count=len(rows),
        schema_detected=True,
    )
    db.add(dataset)
    db.flush()

    fields = detect_schema(rows[:200])
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
    return dataset


@router.post("/connections/test")
async def test_connection(payload: ApiConnectionPayload):
    try:
        result, rows = await _materialize_preview(payload)
        return {
            "success": True,
            "response_time": result["response_time"],
            "status_code": result["status_code"],
            "sample_data": rows[:20],
        }
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/connections/preview")
async def preview_connection(payload: ApiConnectionPayload):
    try:
        result, rows = await _materialize_preview(payload)
        fields = detect_schema(rows[:200])
        columns = [f["field_name"] for f in fields]
        return {
            "success": True,
            "status_code": result["status_code"],
            "response_time": result["response_time"],
            "columns": columns,
            "rows": rows[:20],
            "schema": fields,
            "row_count": len(rows),
        }
    except APIRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/connections/save")
async def save_connection(payload: ApiConnectionPayload, db: Session = Depends(get_db)):
    try:
        result, rows = await _materialize_preview(payload)
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
    )
    db.add(conn)
    db.flush()

    dataset = _save_dataset_records(
        db,
        connection_id=conn.id,
        connection_name=payload.name,
        result_data=result["data"],
        rows=rows,
    )
    write_cache(db, conn.id, result["data"], payload.refresh_interval)
    db.commit()
    return {"success": True, "connection_id": conn.id, "dataset_id": dataset.id}


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
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
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
    )
    try:
        result, rows = await _materialize_preview(payload)
        dataset = _save_dataset_records(
            db,
            connection_id=row.id,
            connection_name=row.name,
            result_data=result["data"],
            rows=rows,
        )
        write_cache(db, row.id, result["data"], row.refresh_interval)
        row.last_refresh_at = datetime.now(timezone.utc)
        row.connection_status = "active"
        log.refresh_status = "success"
        log.rows_fetched = len(rows)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {"success": True, "dataset_id": dataset.id, "rows_fetched": len(rows)}
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

    dataset = (
        db.query(models.ApiDataset)
        .filter(models.ApiDataset.connection_id == connection_id)
        .order_by(models.ApiDataset.created_at.desc())
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="No dataset found for this connection")

    rows = to_rows(dataset.raw_response or [])
    if not rows:
        rows = list(dataset.flattened_sample or [])
    if not rows:
        raise HTTPException(status_code=400, detail="No rows available to materialize")

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
    )
    db.add(uploaded)
    db.flush()

    fields = (
        db.query(models.ApiDatasetField)
        .filter(models.ApiDatasetField.dataset_id == dataset.id)
        .order_by(models.ApiDatasetField.field_name.asc())
        .all()
    )
    if fields:
        for fld in fields:
            db.add(
                models.FileColumn(
                    file_id=uploaded.id,
                    column_name=fld.field_name,
                    data_type=fld.data_type or "unknown",
                    null_count=0,
                    unique_count=0,
                )
            )
    else:
        for fld in detect_schema(rows[:300]):
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
    return {"success": True, "file_id": uploaded.id, "file_name": uploaded.file_name}

