"""
Dataset refresh service with incremental support and background execution.
"""

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import models
from services.data_processor import DataProcessor
from services.transformation_engine import apply_pipeline, load_source_dataframe
from services.datasource_service import decrypt_credentials, test_connection

logger = logging.getLogger("data_refresh_service")

VALID_REFRESH_TYPES = {
    "every_15_minutes", "every_30_minutes", "every_1_hour",
    "hourly", "daily", "weekly", "custom_cron",
}

REFRESH_INTERVALS = {
    "every_15_minutes": 15,
    "every_30_minutes": 30,
    "every_1_hour": 60,
    "hourly": 60,
}


def _resolve_trigger_config(schedule: models.BIDatasetRefreshSchedule):
    rt = schedule.refresh_type or "every_30_minutes"
    if rt == "custom_cron":
        return "cron", schedule.cron_expression or "0 */30 * * *"
    if rt in REFRESH_INTERVALS:
        return "interval", REFRESH_INTERVALS[rt]
    if rt == "daily":
        return "cron", "0 0 * * *"
    if rt == "weekly":
        return "cron", "0 0 * * 0"
    return "interval", 30


def execute_dataset_refresh(
    db: Session,
    dataset_id: str,
    triggered_by: str = "manual",
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Refresh a dataset: re-fetch source data, re-apply transformations."""
    dataset = db.query(models.BIDataset).filter(models.BIDataset.id == dataset_id).first()
    if not dataset:
        return {"success": False, "error": "Dataset not found"}

    log = models.BIDatasetRefreshLog(
        id=str(uuid.uuid4()),
        dataset_id=dataset_id,
        file_id=dataset.file_id,
        status="running",
        refresh_type=triggered_by,
    )
    db.add(log)
    db.commit()

    try:
        records_fetched = 0
        df = None

        if dataset.datasource_id:
            ds = db.query(models.BIDatasource).filter(models.BIDatasource.id == dataset.datasource_id).first()
            if ds:
                password = decrypt_credentials(ds)
                ok, msg, tables = test_connection(ds.source_type, ds.connection_config or {}, password)
                if not ok:
                    raise RuntimeError(f"Datasource connection failed: {msg}")
                ds.health_status = "connected"
                ds.last_health_check = datetime.now(timezone.utc)

        file_row = db.query(models.UploadedFile).filter(models.UploadedFile.id == dataset.file_id).first()
        if file_row:
            from routers.files import resolve_stored_file_path
            path = resolve_stored_file_path(file_row)
            if path:
                incremental = dataset.incremental_column and triggered_by == "incremental"
                df = load_source_dataframe(path, skip_cache=True)
                records_fetched = len(df)

                if incremental and dataset.incremental_column in df.columns:
                    last_val = dataset.last_incremental_value
                    if last_val is not None:
                        col = df[dataset.incremental_column]
                        df = df[col.astype(str) > str(last_val)]
                    if len(df) > 0:
                        dataset.last_incremental_value = str(df[dataset.incremental_column].max())

        records_processed = records_fetched
        if df is not None and file_row:
            try:
                from services.query_service import execute_report_queries, preview_query, ensure_primary_query
                ensure_primary_query(db, file_row.id)
                primary = db.query(models.QueryMaster).filter(
                    models.QueryMaster.report_id == file_row.id,
                    models.QueryMaster.is_active == True,
                ).order_by(models.QueryMaster.created_at).first()
                if primary:
                    from services.query_service import execute_query
                    df = execute_query(db, primary.id, skip_cache=True)
                    records_processed = len(df)
            except Exception:
                transformation = (
                    db.query(models.BIDatasetTransformation)
                    .filter(models.BIDatasetTransformation.dataset_id == dataset_id)
                    .order_by(models.BIDatasetTransformation.updated_at.desc())
                    .first()
                )
                if transformation and transformation.steps:
                    df = apply_pipeline(df, transformation.steps)
                    records_processed = len(df)
            if df is not None:
                dataset.schema_snapshot = [{"name": c, "type": str(df[c].dtype)} for c in df.columns]

        dataset.row_count = records_processed
        dataset.updated_at = datetime.now(timezone.utc)

        schedule = (
            db.query(models.BIDatasetRefreshSchedule)
            .filter(models.BIDatasetRefreshSchedule.dataset_id == dataset_id)
            .first()
        )
        if schedule:
            schedule.last_refresh_at = datetime.now(timezone.utc)

        log.status = "success"
        log.records_fetched = records_fetched
        log.records_processed = records_processed
        log.completed_at = datetime.now(timezone.utc)
        db.commit()

        DataProcessor.clear_cache()
        return {
            "success": True,
            "log_id": log.id,
            "records_fetched": records_fetched,
            "records_processed": records_processed,
            "dataset_id": dataset_id,
            "file_id": dataset.file_id,
        }
    except Exception as e:
        logger.exception("Dataset refresh failed: %s", e)
        log.status = "failed"
        log.error_message = str(e)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {"success": False, "error": str(e), "log_id": log.id}


def execute_file_refresh(db: Session, file_id: str, triggered_by: str = "manual") -> Dict[str, Any]:
    """Refresh all datasets for a report file."""
    datasets = db.query(models.BIDataset).filter(
        models.BIDataset.file_id == file_id,
        models.BIDataset.is_active == True,
    ).all()
    results = []
    for ds in datasets:
        results.append(execute_dataset_refresh(db, ds.id, triggered_by=triggered_by))
    if not datasets:
        DataProcessor.clear_cache()
        log = models.BIDatasetRefreshLog(
            id=str(uuid.uuid4()),
            file_id=file_id,
            status="success",
            refresh_type=triggered_by,
            records_processed=0,
            completed_at=datetime.now(timezone.utc),
            details={"message": "No datasets registered; cache cleared"},
        )
        db.add(log)
        db.commit()
        return {"success": True, "results": [], "log_id": log.id}
    all_ok = all(r.get("success") for r in results)
    return {"success": all_ok, "results": results}


def refresh_file_async(file_id: str, triggered_by: str = "manual"):
    """Run file refresh in a background thread."""
    from database import SessionLocal

    def _target():
        db = SessionLocal()
        try:
            execute_file_refresh(db, file_id, triggered_by)
        finally:
            db.close()

    t = threading.Thread(target=_target, daemon=True)
    t.start()


def get_refresh_stats(db: Session, file_id: str) -> Dict[str, Any]:
    schedule = (
        db.query(models.BIDatasetRefreshSchedule)
        .filter(models.BIDatasetRefreshSchedule.file_id == file_id)
        .first()
    )
    last_log = (
        db.query(models.BIDatasetRefreshLog)
        .filter(models.BIDatasetRefreshLog.file_id == file_id)
        .order_by(models.BIDatasetRefreshLog.started_at.desc())
        .first()
    )
    return {
        "last_refresh_at": schedule.last_refresh_at.isoformat() if schedule and schedule.last_refresh_at else (
            last_log.completed_at.isoformat() if last_log and last_log.completed_at else None
        ),
        "next_refresh_at": schedule.next_refresh_at.isoformat() if schedule and schedule.next_refresh_at else None,
        "status": last_log.status if last_log else "never",
        "schedule_enabled": schedule.enabled if schedule else False,
    }


def get_refresh_logs(db: Session, file_id: str, limit: int = 20) -> List[Dict]:
    logs = (
        db.query(models.BIDatasetRefreshLog)
        .filter(models.BIDatasetRefreshLog.file_id == file_id)
        .order_by(models.BIDatasetRefreshLog.started_at.desc())
        .limit(limit)
        .all()
    )
    return [{
        "id": l.id,
        "dataset_id": l.dataset_id,
        "status": l.status,
        "refresh_type": l.refresh_type,
        "records_fetched": l.records_fetched,
        "records_processed": l.records_processed,
        "started_at": l.started_at.isoformat() if l.started_at else None,
        "completed_at": l.completed_at.isoformat() if l.completed_at else None,
        "error_message": l.error_message,
    } for l in logs]
