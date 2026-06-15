"""
Power BI-style Data Management API: transformations, refresh, datasources, parameters, variables.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from database import SessionLocal
import models
from routers.files import resolve_stored_file_path, verify_write_permission
from services.transformation_engine import (
    apply_pipeline, load_source_dataframe, dataframe_to_preview,
    make_step, describe_step, SUPPORTED_STEPS,
)
from services.datasource_service import (
    test_connection, serialize_datasource, update_health_status,
    get_column_metadata, SUPPORTED_SOURCE_TYPES,
)
from services.data_refresh_service import (
    execute_file_refresh, execute_dataset_refresh, refresh_file_async,
    get_refresh_stats, get_refresh_logs, VALID_REFRESH_TYPES,
)
from services.data_metadata_service import get_cached, set_cached, invalidate
from services.data_audit_service import log_action
from services.dataset_refresh_scheduler import register_schedule, unregister_schedule
from services.credentials_crypto import encrypt_secret as enc_secret

router = APIRouter(prefix="/api/data", tags=["data-management"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class DatasourceCreate(BaseModel):
    file_id: Optional[str] = None
    name: str
    source_type: str
    connection_config: Dict[str, Any] = {}
    password: Optional[str] = None
    ssl_enabled: bool = True


class DatasourceUpdate(BaseModel):
    name: Optional[str] = None
    connection_config: Optional[Dict[str, Any]] = None
    password: Optional[str] = None
    ssl_enabled: Optional[bool] = None


class DatasetCreate(BaseModel):
    file_id: str
    name: str
    datasource_id: Optional[str] = None
    source_table: Optional[str] = None
    source_query: Optional[str] = None
    incremental_column: Optional[str] = None


class TransformStepAdd(BaseModel):
    type: str
    config: Dict[str, Any] = {}


class TransformStepsUpdate(BaseModel):
    steps: List[Dict[str, Any]]


class RefreshSchedulePayload(BaseModel):
    enabled: bool = False
    refresh_type: str = "every_30_minutes"
    cron_expression: Optional[str] = None
    timezone: str = "UTC"
    incremental_enabled: bool = False


class ParameterCreate(BaseModel):
    name: str
    display_name: Optional[str] = None
    param_type: str = "text"
    default_value: Any = None
    current_value: Any = None
    options: List[Any] = []
    validation_rules: Dict[str, Any] = {}
    is_required: bool = False


class ParameterUpdate(BaseModel):
    display_name: Optional[str] = None
    current_value: Any = None
    default_value: Any = None
    options: Optional[List[Any]] = None


class VariableCreate(BaseModel):
    name: str
    display_name: Optional[str] = None
    variable_type: str = "custom"
    scope: str = "report"
    expression: Optional[str] = None
    current_value: Any = None


class VariableUpdate(BaseModel):
    display_name: Optional[str] = None
    current_value: Any = None
    expression: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_file(db: Session, file_id: str) -> models.UploadedFile:
    row = db.query(models.UploadedFile).filter(models.UploadedFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report file not found")
    return row


def _ensure_default_dataset(db: Session, file_id: str) -> models.BIDataset:
    ds = db.query(models.BIDataset).filter(
        models.BIDataset.file_id == file_id,
        models.BIDataset.is_active == True,
    ).first()
    if ds:
        return ds
    file_row = _get_file(db, file_id)
    ds = models.BIDataset(
        id=str(uuid.uuid4()),
        file_id=file_id,
        name=file_row.file_name or "Primary Dataset",
        source_table=None,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)

    transform = models.BIDatasetTransformation(
        id=str(uuid.uuid4()),
        dataset_id=ds.id,
        name="Query",
        steps=[],
    )
    db.add(transform)
    db.commit()
    return ds


def _get_transformation(db: Session, dataset_id: str) -> models.BIDatasetTransformation:
    t = db.query(models.BIDatasetTransformation).filter(
        models.BIDatasetTransformation.dataset_id == dataset_id
    ).order_by(models.BIDatasetTransformation.updated_at.desc()).first()
    if not t:
        t = models.BIDatasetTransformation(
            id=str(uuid.uuid4()),
            dataset_id=dataset_id,
            name="Query",
            steps=[],
        )
        db.add(t)
        db.commit()
        db.refresh(t)
    return t


def _load_df_for_dataset(db: Session, dataset: models.BIDataset):
    file_row = _get_file(db, dataset.file_id)
    path = resolve_stored_file_path(file_row)
    if not path:
        raise HTTPException(status_code=404, detail="Source data file not found")
    return load_source_dataframe(path)


def _sync_parameters_to_model(db: Session, file_id: str):
    params = db.query(models.BIReportParameter).filter(
        models.BIReportParameter.file_id == file_id
    ).order_by(models.BIReportParameter.sort_order).all()
    file_row = _get_file(db, file_id)
    cfg = dict(file_row.model_config or {})
    cfg["parameters"] = [{
        "id": p.id, "type": p.param_type, "name": p.name,
        "display_name": p.display_name, "default": p.default_value,
        "current": p.current_value, "options": p.options or [],
    } for p in params]
    file_row.model_config = cfg
    db.commit()


# ── Datasources ──────────────────────────────────────────────────────────────

@router.get("/datasources")
def list_datasources(file_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.BIDatasource).filter(models.BIDatasource.is_active == True)
    if file_id:
        q = q.filter(models.BIDatasource.file_id == file_id)
    rows = q.order_by(models.BIDatasource.name).all()
    return {"datasources": [serialize_datasource(r) for r in rows]}


@router.post("/datasources")
def create_datasource(
    payload: DatasourceCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    if payload.source_type not in SUPPORTED_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported source type: {payload.source_type}")
    ds = models.BIDatasource(
        id=str(uuid.uuid4()),
        file_id=payload.file_id,
        name=payload.name,
        source_type=payload.source_type,
        connection_config=payload.connection_config,
        encrypted_credentials=enc_secret(payload.password) if payload.password else None,
        ssl_enabled=payload.ssl_enabled,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    log_action(db, "datasource.create", "datasource", ds.id, payload.file_id)
    return serialize_datasource(ds, include_config=True)


@router.get("/datasources/{datasource_id}")
def get_datasource(datasource_id: str, db: Session = Depends(get_db)):
    ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == datasource_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return serialize_datasource(ds, include_config=True)


@router.put("/datasources/{datasource_id}")
def update_datasource(
    datasource_id: str,
    payload: DatasourceUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == datasource_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Datasource not found")
    if payload.name:
        ds.name = payload.name
    if payload.connection_config is not None:
        ds.connection_config = payload.connection_config
    if payload.password:
        ds.encrypted_credentials = enc_secret(payload.password)
    if payload.ssl_enabled is not None:
        ds.ssl_enabled = payload.ssl_enabled
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    log_action(db, "datasource.update", "datasource", ds.id, ds.file_id)
    return serialize_datasource(ds, include_config=True)


@router.post("/datasources/{datasource_id}/test")
def test_datasource_connection(datasource_id: str, db: Session = Depends(get_db)):
    ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == datasource_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Datasource not found")
    from services.datasource_service import decrypt_credentials
    password = decrypt_credentials(ds)
    ok, msg, tables = test_connection(ds.source_type, ds.connection_config or {}, password)
    ds.health_status = "connected" if ok else "disconnected"
    ds.last_health_check = datetime.now(timezone.utc)
    ds.last_error = None if ok else msg
    db.commit()
    return {"success": ok, "message": msg, "tables": tables, "health_status": ds.health_status}


@router.get("/datasources/{datasource_id}/tables/{table_name}/columns")
def get_table_columns(datasource_id: str, table_name: str, db: Session = Depends(get_db)):
    ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == datasource_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Datasource not found")
    from services.datasource_service import decrypt_credentials
    password = decrypt_credentials(ds)
    cols = get_column_metadata(ds.source_type, ds.connection_config or {}, password, table_name)
    return {"columns": cols}


@router.delete("/datasources/{datasource_id}")
def delete_datasource(
    datasource_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == datasource_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Datasource not found")
    ds.is_active = False
    db.commit()
    log_action(db, "datasource.delete", "datasource", datasource_id, ds.file_id)
    return {"success": True}


# ── Datasets ─────────────────────────────────────────────────────────────────

@router.get("/datasets")
def list_datasets(file_id: str, db: Session = Depends(get_db)):
    rows = db.query(models.BIDataset).filter(
        models.BIDataset.file_id == file_id,
        models.BIDataset.is_active == True,
    ).all()
    return {"datasets": [{
        "id": d.id, "name": d.name, "file_id": d.file_id,
        "datasource_id": d.datasource_id, "row_count": d.row_count,
        "version": d.version, "schema": d.schema_snapshot,
    } for d in rows]}


@router.post("/datasets")
def create_dataset(
    payload: DatasetCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    _get_file(db, payload.file_id)
    ds = models.BIDataset(
        id=str(uuid.uuid4()),
        file_id=payload.file_id,
        name=payload.name,
        datasource_id=payload.datasource_id,
        source_table=payload.source_table,
        source_query=payload.source_query,
        incremental_column=payload.incremental_column,
    )
    db.add(ds)
    transform = models.BIDatasetTransformation(
        id=str(uuid.uuid4()),
        dataset_id=ds.id,
        name="Query",
        steps=[],
    )
    db.add(transform)
    db.commit()
    db.refresh(ds)
    log_action(db, "dataset.create", "dataset", ds.id, payload.file_id)
    return {"id": ds.id, "name": ds.name}


# ── Transformations (Query Editor) ───────────────────────────────────────────

@router.get("/transformations/{file_id}")
def get_transformation_state(file_id: str, db: Session = Depends(get_db)):
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    steps = transform.steps or []
    return {
        "dataset_id": dataset.id,
        "transformation_id": transform.id,
        "name": transform.name,
        "steps": steps,
        "applied_steps_index": transform.applied_steps_index,
        "version": transform.version,
        "supported_steps": sorted(SUPPORTED_STEPS),
        "history": [describe_step(s) for s in steps],
    }


@router.get("/transformations/{file_id}/preview")
def preview_transformed_data(
    file_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    up_to_step: Optional[int] = None,
    db: Session = Depends(get_db),
):
    cache_key = f"{file_id}:{offset}:{limit}:{up_to_step}"
    cached = get_cached("transform_preview", cache_key)
    if cached:
        return cached

    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    df = _load_df_for_dataset(db, dataset)
    steps = transform.steps or []
    idx = up_to_step if up_to_step is not None else (len(steps) - 1 if steps else -1)
    if idx >= 0:
        df = apply_pipeline(df, steps, up_to_index=idx)
    result = dataframe_to_preview(df, offset=offset, limit=limit)
    set_cached("transform_preview", cache_key, result, ttl=60)
    return result


@router.post("/transformations/{file_id}/steps")
def add_transform_step(
    file_id: str,
    payload: TransformStepAdd,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    if payload.type not in SUPPORTED_STEPS:
        raise HTTPException(status_code=400, detail=f"Unsupported step type: {payload.type}")
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    steps = list(transform.steps or [])
    undo_stack = list(transform.undo_stack or [])
    undo_stack.append({"steps": steps, "index": transform.applied_steps_index})
    step = make_step(payload.type, payload.config)
    steps.append(step)
    transform.steps = steps
    transform.applied_steps_index = len(steps) - 1
    transform.undo_stack = undo_stack[-50:]
    transform.redo_stack = []
    transform.updated_at = datetime.now(timezone.utc)
    flag_modified(transform, "steps")
    flag_modified(transform, "undo_stack")
    flag_modified(transform, "redo_stack")
    db.commit()
    invalidate("transform_preview", file_id)
    log_action(db, "transform.add_step", "transformation", transform.id, file_id, details={"step": payload.type})
    return {
        "step": step,
        "steps": steps,
        "description": describe_step(step),
        "history": [describe_step(s) for s in steps],
    }


@router.put("/transformations/{file_id}/steps")
def replace_transform_steps(
    file_id: str,
    payload: TransformStepsUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    undo_stack = list(transform.undo_stack or [])
    undo_stack.append({"steps": transform.steps, "index": transform.applied_steps_index})
    transform.steps = payload.steps
    transform.applied_steps_index = len(payload.steps) - 1 if payload.steps else -1
    transform.undo_stack = undo_stack[-50:]
    transform.redo_stack = []
    transform.updated_at = datetime.now(timezone.utc)
    db.commit()
    invalidate("transform_preview", file_id)
    return {"steps": transform.steps}


@router.post("/transformations/{file_id}/undo")
def undo_transform(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    """Remove the last applied step (Power Query style)."""
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    steps = list(transform.steps or [])
    if not steps:
        raise HTTPException(status_code=400, detail="Nothing to undo")

    redo_stack = list(transform.redo_stack or [])
    redo_stack.append({
        "steps": steps,
        "index": transform.applied_steps_index,
    })

    removed = steps.pop()
    transform.steps = steps
    transform.applied_steps_index = len(steps) - 1 if steps else -1
    transform.redo_stack = redo_stack[-50:]
    transform.updated_at = datetime.now(timezone.utc)
    flag_modified(transform, "steps")
    flag_modified(transform, "redo_stack")
    db.commit()
    invalidate("transform_preview", file_id)
    log_action(db, "transform.undo", "transformation", transform.id, file_id, details={"removed": describe_step(removed)})
    return {
        "steps": steps,
        "applied_steps_index": transform.applied_steps_index,
        "removed_step": describe_step(removed),
        "history": [describe_step(s) for s in steps],
    }


@router.post("/transformations/{file_id}/redo")
def redo_transform(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    """Restore the last undone step."""
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    redo_stack = list(transform.redo_stack or [])
    if not redo_stack:
        raise HTTPException(status_code=400, detail="Nothing to redo")

    nxt = redo_stack.pop()
    transform.steps = list(nxt["steps"] or [])
    transform.applied_steps_index = nxt.get("index", len(transform.steps) - 1)
    transform.redo_stack = redo_stack
    transform.updated_at = datetime.now(timezone.utc)
    flag_modified(transform, "steps")
    flag_modified(transform, "redo_stack")
    db.commit()
    invalidate("transform_preview", file_id)
    log_action(db, "transform.redo", "transformation", transform.id, file_id)
    return {
        "steps": transform.steps,
        "applied_steps_index": transform.applied_steps_index,
        "history": [describe_step(s) for s in (transform.steps or [])],
    }


@router.post("/transformations/{file_id}/apply")
def apply_transformations(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    df = _load_df_for_dataset(db, dataset)
    steps = transform.steps or []
    result_df = apply_pipeline(df, steps)
    dataset.schema_snapshot = [{"name": c, "type": str(result_df[c].dtype)} for c in result_df.columns]
    dataset.row_count = len(result_df)
    transform.applied_steps_index = len(steps) - 1 if steps else -1
    transform.is_published = True
    transform.updated_at = datetime.now(timezone.utc)
    db.commit()
    invalidate("transform_preview", file_id)
    log_action(db, "transform.apply", "transformation", transform.id, file_id)
    return {
        "success": True,
        "row_count": len(result_df),
        "columns": dataset.schema_snapshot,
        "steps_applied": len(steps),
    }


@router.post("/transformations/{file_id}/save")
def save_transformation_version(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    transform.version = (transform.version or 1) + 1
    dataset.version = transform.version
    version_row = models.BIDatasetTransformationVersion(
        id=str(uuid.uuid4()),
        transformation_id=transform.id,
        version=transform.version,
        steps=transform.steps or [],
        change_summary=f"Saved version {transform.version}",
    )
    db.add(version_row)
    transform.updated_at = datetime.now(timezone.utc)
    db.commit()
    log_action(db, "transform.save", "transformation", transform.id, file_id, details={"version": transform.version})
    return {"version": transform.version, "transformation_id": transform.id}


@router.get("/transformations/{file_id}/history")
def get_transformation_history(file_id: str, db: Session = Depends(get_db)):
    dataset = _ensure_default_dataset(db, file_id)
    transform = _get_transformation(db, dataset.id)
    versions = db.query(models.BIDatasetTransformationVersion).filter(
        models.BIDatasetTransformationVersion.transformation_id == transform.id
    ).order_by(models.BIDatasetTransformationVersion.version.desc()).limit(20).all()
    steps = transform.steps or []
    return {
        "applied_steps": [{"index": i, "description": describe_step(s), "step": s} for i, s in enumerate(steps)],
        "versions": [{
            "version": v.version, "created_at": v.created_at.isoformat() if v.created_at else None,
            "change_summary": v.change_summary, "steps_count": len(v.steps or []),
        } for v in versions],
    }


# ── Refresh ──────────────────────────────────────────────────────────────────

@router.post("/refresh/{file_id}/now")
def refresh_now(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    _get_file(db, file_id)
    refresh_file_async(file_id, triggered_by="manual")
    log_action(db, "refresh.manual", "file", file_id, file_id)
    return {"success": True, "message": "Refresh started in background"}


@router.post("/refresh/{file_id}/sync")
def refresh_sync(file_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    _get_file(db, file_id)
    result = execute_file_refresh(db, file_id, triggered_by="manual")
    invalidate("transform_preview", file_id)
    log_action(db, "refresh.sync", "file", file_id, file_id)
    return result


@router.get("/refresh/{file_id}/status")
def refresh_status(file_id: str, db: Session = Depends(get_db)):
    stats = get_refresh_stats(db, file_id)
    logs = get_refresh_logs(db, file_id, limit=5)
    return {"stats": stats, "recent_logs": logs}


@router.get("/refresh/{file_id}/logs")
def refresh_logs(file_id: str, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"logs": get_refresh_logs(db, file_id, limit=limit)}


@router.get("/refresh/{file_id}/schedule")
def get_refresh_schedule(file_id: str, db: Session = Depends(get_db)):
    schedule = db.query(models.BIDatasetRefreshSchedule).filter(
        models.BIDatasetRefreshSchedule.file_id == file_id
    ).first()
    stats = get_refresh_stats(db, file_id)
    if not schedule:
        return {"schedule": None, "stats": stats, "refresh_types": sorted(VALID_REFRESH_TYPES)}
    return {
        "schedule": {
            "id": schedule.id,
            "enabled": schedule.enabled,
            "refresh_type": schedule.refresh_type,
            "cron_expression": schedule.cron_expression,
            "timezone": schedule.timezone,
            "incremental_enabled": schedule.incremental_enabled,
            "last_refresh_at": schedule.last_refresh_at.isoformat() if schedule.last_refresh_at else None,
            "next_refresh_at": schedule.next_refresh_at.isoformat() if schedule.next_refresh_at else None,
        },
        "stats": stats,
        "refresh_types": sorted(VALID_REFRESH_TYPES),
    }


@router.put("/refresh/{file_id}/schedule")
def upsert_refresh_schedule(
    file_id: str,
    payload: RefreshSchedulePayload,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    _get_file(db, file_id)
    if payload.refresh_type not in VALID_REFRESH_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid refresh_type: {payload.refresh_type}")
    if payload.refresh_type == "custom_cron" and not (payload.cron_expression or "").strip():
        raise HTTPException(status_code=400, detail="cron_expression required for custom_cron")

    dataset = _ensure_default_dataset(db, file_id)
    schedule = db.query(models.BIDatasetRefreshSchedule).filter(
        models.BIDatasetRefreshSchedule.file_id == file_id
    ).first()

    if schedule:
        schedule.enabled = payload.enabled
        schedule.refresh_type = payload.refresh_type
        schedule.cron_expression = payload.cron_expression
        schedule.timezone = payload.timezone
        schedule.incremental_enabled = payload.incremental_enabled
        schedule.updated_at = datetime.now(timezone.utc)
    else:
        schedule = models.BIDatasetRefreshSchedule(
            id=str(uuid.uuid4()),
            dataset_id=dataset.id,
            file_id=file_id,
            enabled=payload.enabled,
            refresh_type=payload.refresh_type,
            cron_expression=payload.cron_expression,
            timezone=payload.timezone,
            incremental_enabled=payload.incremental_enabled,
        )
        db.add(schedule)

    db.commit()
    db.refresh(schedule)

    if schedule.enabled:
        register_schedule(schedule)
    else:
        unregister_schedule(schedule.id)

    log_action(db, "refresh.schedule", "schedule", schedule.id, file_id)
    return {"schedule": {
        "id": schedule.id, "enabled": schedule.enabled,
        "refresh_type": schedule.refresh_type,
        "next_refresh_at": schedule.next_refresh_at.isoformat() if schedule.next_refresh_at else None,
    }}


# ── Parameters ───────────────────────────────────────────────────────────────

@router.get("/parameters/{file_id}")
def list_parameters(file_id: str, db: Session = Depends(get_db)):
    rows = db.query(models.BIReportParameter).filter(
        models.BIReportParameter.file_id == file_id
    ).order_by(models.BIReportParameter.sort_order).all()
    return {"parameters": [{
        "id": p.id, "name": p.name, "display_name": p.display_name,
        "param_type": p.param_type, "default_value": p.default_value,
        "current_value": p.current_value, "options": p.options,
        "is_required": p.is_required,
    } for p in rows]}


@router.post("/parameters/{file_id}")
def create_parameter(
    file_id: str,
    payload: ParameterCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    _get_file(db, file_id)
    count = db.query(models.BIReportParameter).filter(models.BIReportParameter.file_id == file_id).count()
    param = models.BIReportParameter(
        id=str(uuid.uuid4()),
        file_id=file_id,
        name=payload.name,
        display_name=payload.display_name or payload.name,
        param_type=payload.param_type,
        default_value=payload.default_value,
        current_value=payload.current_value if payload.current_value is not None else payload.default_value,
        options=payload.options,
        validation_rules=payload.validation_rules,
        is_required=payload.is_required,
        sort_order=count,
    )
    db.add(param)
    db.commit()
    _sync_parameters_to_model(db, file_id)
    log_action(db, "parameter.create", "parameter", param.id, file_id)
    return {"id": param.id, "name": param.name}


@router.put("/parameters/{parameter_id}")
def update_parameter(
    parameter_id: str,
    payload: ParameterUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    param = db.query(models.BIReportParameter).filter(models.BIReportParameter.id == parameter_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    if payload.display_name is not None:
        param.display_name = payload.display_name
    if payload.current_value is not None:
        param.current_value = payload.current_value
    if payload.default_value is not None:
        param.default_value = payload.default_value
    if payload.options is not None:
        param.options = payload.options
    param.updated_at = datetime.now(timezone.utc)
    db.commit()
    _sync_parameters_to_model(db, param.file_id)
    log_action(db, "parameter.update", "parameter", param.id, param.file_id)
    return {"success": True}


@router.delete("/parameters/{parameter_id}")
def delete_parameter(
    parameter_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    param = db.query(models.BIReportParameter).filter(models.BIReportParameter.id == parameter_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    file_id = param.file_id
    db.delete(param)
    db.commit()
    _sync_parameters_to_model(db, file_id)
    log_action(db, "parameter.delete", "parameter", parameter_id, file_id)
    return {"success": True}


# ── Variables ────────────────────────────────────────────────────────────────

SYSTEM_VARIABLES = [
    {"name": "CurrentUser", "display_name": "Current User", "variable_type": "system", "expression": "USER()"},
    {"name": "CurrentDate", "display_name": "Current Date", "variable_type": "system", "expression": "TODAY()"},
    {"name": "CurrentFiscalYear", "display_name": "Current Fiscal Year", "variable_type": "system", "expression": "FISCALYEAR(TODAY())"},
    {"name": "TenantId", "display_name": "Tenant ID", "variable_type": "system", "expression": "TENANT()"},
    {"name": "Environment", "display_name": "Environment", "variable_type": "system", "expression": "ENV()"},
    {"name": "Region", "display_name": "Region", "variable_type": "system", "expression": "REGION()"},
]


@router.get("/variables/{file_id}")
def list_variables(file_id: str, db: Session = Depends(get_db)):
    rows = db.query(models.BIReportVariable).filter(
        (models.BIReportVariable.file_id == file_id) | (models.BIReportVariable.scope == "system")
    ).all()
    if not rows:
        for sv in SYSTEM_VARIABLES:
            v = models.BIReportVariable(
                id=str(uuid.uuid4()),
                file_id=file_id,
                name=sv["name"],
                display_name=sv["display_name"],
                variable_type=sv["variable_type"],
                scope="system" if sv["variable_type"] == "system" else "report",
                expression=sv["expression"],
                is_system=True,
                is_editable=False,
            )
            db.add(v)
        db.commit()
        rows = db.query(models.BIReportVariable).filter(
            (models.BIReportVariable.file_id == file_id) | (models.BIReportVariable.scope == "system")
        ).all()
    return {"variables": [{
        "id": v.id, "name": v.name, "display_name": v.display_name,
        "variable_type": v.variable_type, "scope": v.scope,
        "expression": v.expression, "current_value": v.current_value,
        "is_system": v.is_system, "is_editable": v.is_editable,
    } for v in rows]}


@router.post("/variables/{file_id}")
def create_variable(
    file_id: str,
    payload: VariableCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    _get_file(db, file_id)
    var = models.BIReportVariable(
        id=str(uuid.uuid4()),
        file_id=file_id,
        name=payload.name,
        display_name=payload.display_name or payload.name,
        variable_type=payload.variable_type,
        scope=payload.scope,
        expression=payload.expression,
        current_value=payload.current_value,
        is_system=False,
        is_editable=True,
    )
    db.add(var)
    db.commit()
    log_action(db, "variable.create", "variable", var.id, file_id)
    return {"id": var.id, "name": var.name}


@router.put("/variables/{variable_id}")
def update_variable(
    variable_id: str,
    payload: VariableUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    var = db.query(models.BIReportVariable).filter(models.BIReportVariable.id == variable_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Variable not found")
    if var.is_system and not var.is_editable:
        raise HTTPException(status_code=403, detail="System variable is read-only")
    if payload.display_name is not None:
        var.display_name = payload.display_name
    if payload.current_value is not None:
        var.current_value = payload.current_value
    if payload.expression is not None:
        var.expression = payload.expression
    var.updated_at = datetime.now(timezone.utc)
    db.commit()
    log_action(db, "variable.update", "variable", var.id, var.file_id)
    return {"success": True}


@router.get("/audit/{file_id}")
def get_audit_logs(file_id: str, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    logs = db.query(models.BIDataAuditLog).filter(
        models.BIDataAuditLog.file_id == file_id
    ).order_by(models.BIDataAuditLog.created_at.desc()).limit(limit).all()
    return {"logs": [{
        "id": l.id, "action": l.action, "resource_type": l.resource_type,
        "resource_id": l.resource_id, "details": l.details,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    } for l in logs]}
