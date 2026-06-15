"""
Report refresh execution service.
Handles paginated report and BI dashboard scheduled/manual refreshes.
"""

import asyncio
import json
import logging
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from database import SessionLocal
import models
from services.data_engine import DataEngine

logger = logging.getLogger("report_refresh")

_active_lock = threading.Lock()
_active_refreshes: set[str] = set()
MAX_RETRIES = 3
RETRY_DELAY_SEC = 60

REFRESH_TYPE_MINUTES = {
    "every_5_minutes": 5,
    "every_15_minutes": 15,
    "every_30_minutes": 30,
    "every_1_hour": 60,
    "every_6_hours": 360,
    "every_12_hours": 720,
}

REFRESH_TYPE_CRON = {
    "daily": "0 0 * * *",
    "weekly": "0 0 * * 0",
    "monthly": "0 0 1 * *",
}


def resolve_trigger_config(schedule: models.ReportRefreshSchedule) -> Tuple[str, Any]:
    """Return ('interval', minutes) or ('cron', expression) for a schedule."""
    rt = (schedule.refresh_type or "").strip().lower()
    if rt == "custom_cron" and schedule.cron_expression:
        return "cron", schedule.cron_expression.strip()
    if rt in REFRESH_TYPE_MINUTES:
        return "interval", REFRESH_TYPE_MINUTES[rt]
    if rt in REFRESH_TYPE_CRON:
        return "cron", REFRESH_TYPE_CRON[rt]
    if schedule.cron_expression:
        return "cron", schedule.cron_expression.strip()
    return "interval", 60


def _is_resource_active(db, report_id: str, resource_type: str) -> bool:
    if resource_type == "dashboard":
        row = db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
        return row is not None
    row = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    return row is not None


def _refresh_paginated_report(db, report_id: str) -> int:
    report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    if not report:
        raise ValueError(f"Report not found: {report_id}")

    datasource_mapping = report.datasource_mapping or {}
    layout = report.layout_json or {"pages": []}
    records = 0

    results: Dict[str, Any] = {}
    for element_id, config in datasource_mapping.items():
        vault_id = config.get("vault_id")
        if not vault_id:
            continue
        vault_item = db.query(models.DataVaultItem).filter(models.DataVaultItem.id == vault_id).first()
        if not vault_item or not vault_item.table_name:
            continue
        element_data = DataEngine.query_vault_item(
            table_name=vault_item.table_name,
            filters=config.get("filters", []),
            group_by=config.get("group_by", []),
            aggregations=config.get("aggregations", []),
            sort_by=config.get("sort_by"),
            ascending=config.get("ascending", True),
            limit=config.get("limit"),
        )
        results[element_id] = element_data
        rows = element_data.get("rows", []) if isinstance(element_data, dict) else []
        records += len(rows) if isinstance(rows, list) else 0

    for page in layout.get("pages", []):
        for el in page.get("elements", []):
            el_id = el.get("id")
            if el_id not in results:
                continue
            data = results[el_id]
            if isinstance(data, dict) and data.get("error"):
                continue
            cfg = el.setdefault("config", {})
            rows = data.get("rows", []) if isinstance(data, dict) else []
            if el.get("type") == "chart" and rows:
                cfg["chart_data"] = rows
            elif el.get("type") == "table" and rows:
                cfg["table_data"] = rows

    report.layout_json = layout
    report.updated_at = datetime.now(timezone.utc)
    db.commit()
    return records


_UUID_PREFIX_RE = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_",
    re.IGNORECASE,
)


def _resolve_api_connection_id(file_record: models.UploadedFile) -> Optional[str]:
    mc = file_record.model_config or {}
    conn_id = mc.get("api_connection_id")
    if conn_id:
        return str(conn_id)
    if file_record.file_path:
        match = _UUID_PREFIX_RE.match(Path(file_record.file_path).name)
        if match:
            return match.group(1)
    return None


def _refresh_api_connection_sync(db, connection_id: str) -> int:
    """Fetch fresh rows from the REST API connector into api_connector_data."""
    from routers.api_connections import ApiConnectionPayload, _ingest_connection
    from services.api_connector.encryption import decrypt_auth_config

    row = db.query(models.ApiConnection).filter(models.ApiConnection.id == connection_id).first()
    if not row:
        return 0
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
    _, normalized_rows, schema_config, _, _ = asyncio.run(
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
    row.last_refresh_at = datetime.now(timezone.utc)
    row.connection_status = "active"
    db.flush()
    return len(normalized_rows)


def _rematerialize_api_file(db, file_record: models.UploadedFile, connection_id: str) -> int:
    """Rewrite the on-disk dataset snapshot used by BI charts from connector rows."""
    from services.api_connector.delta_processor import load_connector_rows

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

    if not rows:
        return 0

    file_path = Path(file_record.file_path) if file_record.file_path else None
    if file_path:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)

    file_record.row_count = len(rows)
    file_record.column_count = len(rows[0].keys()) if rows else 0
    mc = dict(file_record.model_config or {})
    mc["source_type"] = "api_connector"
    mc["api_connection_id"] = connection_id
    mc["data_version"] = datetime.now(timezone.utc).isoformat()
    file_record.model_config = mc
    db.flush()
    return len(rows)


def _clear_dashboard_caches(file_record: models.UploadedFile) -> None:
    from services.model_engine import ModelEngine
    from services.data_processor import DataProcessor
    from routers.graphs import clear_graph_cache_for_file

    try:
        ModelEngine.clear_cache_for_file(file_record.id)
        with ModelEngine._model_df_cache_lock:
            ModelEngine._model_df_cache.clear()
    except Exception:
        pass
    try:
        clear_graph_cache_for_file(file_record.id)
    except Exception:
        pass
    try:
        if file_record.file_path:
            DataProcessor.clear_cache_for_file(file_record.file_path)
    except Exception:
        pass


def _refresh_dashboard(db, file_id: str) -> Dict[str, Any]:
    from services.model_engine import ModelEngine
    from services.graph_engine import GraphEngine
    from services.data_processor import DataProcessor

    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == file_id).first()
    if not file_record:
        raise ValueError(f"Dashboard not found: {file_id}")

    graphs = db.query(models.GraphDefinition).filter(models.GraphDefinition.file_id == file_id).all()
    api_rows = 0
    connection_id = _resolve_api_connection_id(file_record)
    if connection_id:
        api_rows = _refresh_api_connection_sync(db, connection_id)
        api_rows = max(api_rows, _rematerialize_api_file(db, file_record, connection_id))

    _clear_dashboard_caches(file_record)

    if not graphs:
        db.commit()
        return {"records_processed": api_rows, "graphs_updated": 0, "api_rows_refreshed": api_rows}

    df = ModelEngine.load_report_dataframe(file_id, db)
    if df is None or df.empty:
        if file_record.file_path and file_record.status == "completed":
            df = DataProcessor.read_file(file_record.file_path)
    if df is None or df.empty:
        db.commit()
        return {"records_processed": api_rows, "graphs_updated": 0, "api_rows_refreshed": api_rows}

    records = 0
    graphs_updated = 0
    for graph in graphs:
        try:
            graph.cached_data = None
            semantic_measures = (file_record.model_config or {}).get("measures") or []
            result = GraphEngine.get_aggregated_data(
                df,
                graph.graph_type,
                graph.x_axis,
                graph.y_axis,
                graph.aggregation,
                None,
                None,
                semantic_measures=semantic_measures,
            )
            if isinstance(result, dict) and result.get("labels"):
                graph.cached_data = result
                records += len(result.get("labels", []))
                graphs_updated += 1
        except Exception as exc:
            logger.warning("Failed to refresh graph %s: %s", graph.id, exc)

    sample_hint = None
    if df is not None and not df.empty:
        for col in ("price", "PRICE", "mktcap", "MKTCAP"):
            if col in df.columns:
                sample_hint = {col: df[col].head(3).tolist()}
                break

    db.commit()
    return {
        "records_processed": api_rows if api_rows else records,
        "graphs_updated": graphs_updated,
        "api_rows_refreshed": api_rows,
        "api_connection_id": connection_id,
        "chart_points_recomputed": records,
        "sample_values": sample_hint,
        "live_api_called": bool(connection_id and api_rows > 0),
    }


def execute_refresh(
    report_id: str,
    resource_type: str = "paginated_report",
    triggered_by: str = "schedule",
    retry_attempt: int = 0,
) -> Dict[str, Any]:
    """Execute a refresh job. Returns status dict."""
    lock_key = f"{resource_type}:{report_id}"
    with _active_lock:
        if lock_key in _active_refreshes:
            return {"status": "skipped", "reason": "concurrent_refresh"}
        _active_refreshes.add(lock_key)

    db = SessionLocal()
    history = models.ReportRefreshHistory(
        report_id=report_id,
        refresh_started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(history)
    db.flush()

    try:
        if not _is_resource_active(db, report_id, resource_type):
            history.status = "skipped"
            history.error_message = "Resource inactive or not found"
            history.refresh_completed_at = datetime.now(timezone.utc)
            db.commit()
            return {"status": "skipped", "reason": "inactive"}

        refresh_meta: Dict[str, Any] = {}
        if resource_type == "dashboard":
            refresh_meta = _refresh_dashboard(db, report_id)
            records = int(refresh_meta.get("api_rows_refreshed") or refresh_meta.get("records_processed") or 0)
        else:
            records = _refresh_paginated_report(db, report_id)
            refresh_meta = {"records_processed": records}

        now = datetime.now(timezone.utc)
        history.status = "success"
        history.records_processed = records
        if refresh_meta.get("graphs_updated") is not None:
            history.error_message = json.dumps({
                "graphs_updated": refresh_meta.get("graphs_updated"),
                "live_api_called": refresh_meta.get("live_api_called"),
                "chart_points": refresh_meta.get("chart_points_recomputed"),
            })
        history.refresh_completed_at = now

        schedule = (
            db.query(models.ReportRefreshSchedule)
            .filter(models.ReportRefreshSchedule.report_id == report_id)
            .first()
        )
        if schedule:
            schedule.last_refresh_at = now
            db.commit()
            from services.report_refresh_scheduler import update_next_refresh_at

            update_next_refresh_at(schedule.id)

        db.commit()
        logger.info(
            "Refresh %s for %s (%s) completed: %s records, meta=%s",
            triggered_by,
            report_id,
            resource_type,
            records,
            refresh_meta,
        )
        return {
            "status": "success",
            "records_processed": records,
            "history_id": history.id,
            **refresh_meta,
        }

    except Exception as exc:
        db.rollback()
        logger.error("Refresh failed for %s: %s", report_id, exc)
        try:
            history = db.query(models.ReportRefreshHistory).filter(
                models.ReportRefreshHistory.id == history.id
            ).first()
            if history:
                history.status = "failed"
                history.error_message = str(exc)
                history.refresh_completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            db.rollback()

        if retry_attempt < MAX_RETRIES and triggered_by == "schedule":
            time.sleep(RETRY_DELAY_SEC * (retry_attempt + 1))
            return execute_refresh(
                report_id,
                resource_type,
                triggered_by,
                retry_attempt + 1,
            )
        return {"status": "failed", "error": str(exc)}

    finally:
        with _active_lock:
            _active_refreshes.discard(lock_key)
        db.close()


def get_refresh_stats(db, report_id: str) -> Dict[str, Any]:
    """Return monitoring stats for a report/dashboard."""
    schedule = (
        db.query(models.ReportRefreshSchedule)
        .filter(models.ReportRefreshSchedule.report_id == report_id)
        .first()
    )
    history = (
        db.query(models.ReportRefreshHistory)
        .filter(models.ReportRefreshHistory.report_id == report_id)
        .order_by(models.ReportRefreshHistory.refresh_started_at.desc())
        .limit(50)
        .all()
    )

    success_count = sum(1 for h in history if h.status == "success")
    failure_count = sum(1 for h in history if h.status == "failed")

    last = history[0] if history else None
    duration_sec = None
    if last and last.refresh_started_at and last.refresh_completed_at:
        duration_sec = (last.refresh_completed_at - last.refresh_started_at).total_seconds()

    return {
        "enabled": bool(schedule and schedule.enabled),
        "last_refresh_at": schedule.last_refresh_at.isoformat() if schedule and schedule.last_refresh_at else None,
        "next_refresh_at": schedule.next_refresh_at.isoformat() if schedule and schedule.next_refresh_at else None,
        "last_status": last.status if last else None,
        "last_duration_sec": duration_sec,
        "success_count": success_count,
        "failure_count": failure_count,
        "total_runs": len(history),
    }
