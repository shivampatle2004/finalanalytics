import asyncio
from datetime import datetime, timezone
import threading

from services.etl_scheduler import get_scheduler
from database import SessionLocal
import models


def _interval_to_minutes(value: str | None):
    v = (value or "manual").strip().lower()
    return {
        "1 min": 1,
        "5 mins": 5,
        "15 mins": 15,
        "hourly": 60,
        "daily": 1440,
    }.get(v)


def _run_refresh(connection_id: str):
    from routers.api_connections import ApiConnectionPayload, _ingest_connection
    from services.api_connector.cache_manager import write_cache
    from services.api_connector.encryption import decrypt_auth_config

    db = SessionLocal()
    try:
        row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
        if not row or not row.is_active:
            return
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
        log = models.ApiRefreshLog(
            connection_id=connection_id,
            refresh_status="running",
            started_at=datetime.now(timezone.utc),
        )
        db.add(log)
        db.flush()
        result, normalized_rows, schema_config, _, delta_stats = asyncio.run(
            _ingest_connection(
                db,
                connection_id=row.id,
                connection_name=row.name,
                payload=payload,
                schema_config=row.schema_config,
            )
        )
        if not row.schema_config:
            row.schema_config = schema_config
        write_cache(db, row.id, result["data"], row.refresh_interval)
        row.last_refresh_at = datetime.now(timezone.utc)
        row.connection_status = "active"
        log.refresh_status = "success"
        log.rows_fetched = len(normalized_rows)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            db.add(
                models.ApiRefreshLog(
                    connection_id=connection_id,
                    refresh_status="failed",
                    error_message=str(exc),
                    started_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _run_refresh_thread(connection_id: str):
    t = threading.Thread(target=_run_refresh, args=(connection_id,), daemon=True)
    t.start()


def load_api_refresh_schedules():
    scheduler = get_scheduler()
    if not scheduler:
        return
    db = SessionLocal()
    try:
        conns = db.query(models.ApiConnection).filter(models.ApiConnection.is_active == True).all()
        for conn in conns:
            mins = _interval_to_minutes(conn.refresh_interval)
            job_id = f"api_refresh_{conn.id}"
            if not mins:
                if scheduler.get_job(job_id):
                    scheduler.remove_job(job_id)
                continue
            scheduler.add_job(
                _run_refresh_thread,
                "interval",
                minutes=mins,
                id=job_id,
                args=[conn.id],
                replace_existing=True,
                max_instances=1,
            )
    finally:
        db.close()
