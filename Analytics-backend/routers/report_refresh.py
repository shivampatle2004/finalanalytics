"""
API endpoints for scheduled report/dashboard refresh configuration.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal
import models
from services.report_refresh_service import execute_refresh, get_refresh_stats
from services.report_refresh_scheduler import register_schedule, unregister_schedule
from utils.logger import get_logger

logger = get_logger("routers.report_refresh")

router = APIRouter(prefix="/api/refresh", tags=["report-refresh"])

VALID_REFRESH_TYPES = {
    "every_5_minutes",
    "every_15_minutes",
    "every_30_minutes",
    "every_1_hour",
    "every_6_hours",
    "every_12_hours",
    "daily",
    "weekly",
    "monthly",
    "custom_cron",
}

COMMON_TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RefreshSchedulePayload(BaseModel):
    enabled: bool = False
    refresh_type: str = "every_30_minutes"
    cron_expression: Optional[str] = None
    timezone: str = "UTC"
    start_at: Optional[str] = None
    resource_type: str = "paginated_report"
    created_by: Optional[str] = None


def _parse_start_at(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_at datetime format")


def _serialize_schedule(schedule: models.ReportRefreshSchedule) -> Dict[str, Any]:
    return {
        "id": schedule.id,
        "report_id": schedule.report_id,
        "resource_type": schedule.resource_type,
        "enabled": schedule.enabled,
        "refresh_type": schedule.refresh_type,
        "cron_expression": schedule.cron_expression,
        "timezone": schedule.timezone,
        "start_at": schedule.start_at.isoformat() if schedule.start_at else None,
        "last_refresh_at": schedule.last_refresh_at.isoformat() if schedule.last_refresh_at else None,
        "next_refresh_at": schedule.next_refresh_at.isoformat() if schedule.next_refresh_at else None,
        "created_by": schedule.created_by,
        "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
        "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None,
    }


def _validate_resource(db: Session, report_id: str, resource_type: str):
    if resource_type == "dashboard":
        row = db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
    else:
        row = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"{resource_type} not found")


@router.get("/timezones")
def list_timezones():
    return {"timezones": COMMON_TIMEZONES}


@router.get("/{report_id}/schedule")
def get_refresh_schedule(
    report_id: str,
    resource_type: str = "paginated_report",
    db: Session = Depends(get_db),
):
    schedule = (
        db.query(models.ReportRefreshSchedule)
        .filter(
            models.ReportRefreshSchedule.report_id == report_id,
            models.ReportRefreshSchedule.resource_type == resource_type,
        )
        .first()
    )
    stats = get_refresh_stats(db, report_id)
    if not schedule:
        return {
            "schedule": None,
            "stats": stats,
            "refresh_types": sorted(VALID_REFRESH_TYPES),
        }
    return {
        "schedule": _serialize_schedule(schedule),
        "stats": stats,
        "refresh_types": sorted(VALID_REFRESH_TYPES),
    }


@router.put("/{report_id}/schedule")
def upsert_refresh_schedule(
    report_id: str,
    payload: RefreshSchedulePayload,
    db: Session = Depends(get_db),
):
    if payload.resource_type not in ("paginated_report", "dashboard"):
        raise HTTPException(status_code=400, detail="resource_type must be paginated_report or dashboard")
    if payload.refresh_type not in VALID_REFRESH_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid refresh_type: {payload.refresh_type}")
    if payload.refresh_type == "custom_cron" and not (payload.cron_expression or "").strip():
        raise HTTPException(status_code=400, detail="cron_expression required for custom_cron")

    _validate_resource(db, report_id, payload.resource_type)
    start_at = _parse_start_at(payload.start_at)

    schedule = (
        db.query(models.ReportRefreshSchedule)
        .filter(
            models.ReportRefreshSchedule.report_id == report_id,
            models.ReportRefreshSchedule.resource_type == payload.resource_type,
        )
        .first()
    )

    if schedule:
        schedule.enabled = payload.enabled
        schedule.refresh_type = payload.refresh_type
        schedule.cron_expression = payload.cron_expression
        schedule.timezone = payload.timezone or "UTC"
        schedule.start_at = start_at
        if payload.created_by:
            schedule.created_by = payload.created_by
        schedule.updated_at = datetime.now(timezone.utc)
    else:
        schedule = models.ReportRefreshSchedule(
            report_id=report_id,
            resource_type=payload.resource_type,
            enabled=payload.enabled,
            refresh_type=payload.refresh_type,
            cron_expression=payload.cron_expression,
            timezone=payload.timezone or "UTC",
            start_at=start_at,
            created_by=payload.created_by,
        )
        db.add(schedule)

    db.commit()
    db.refresh(schedule)

    if schedule.enabled:
        register_schedule(schedule)
    else:
        unregister_schedule(schedule.id)

    db.refresh(schedule)
    return {
        "schedule": _serialize_schedule(schedule),
        "stats": get_refresh_stats(db, report_id),
    }


@router.post("/{report_id}/refresh")
def trigger_manual_refresh(
    report_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
):
    resource_type = payload.get("resource_type", "paginated_report")
    _validate_resource(db, report_id, resource_type)
    result = execute_refresh(report_id, resource_type, triggered_by="manual")
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("error", "Refresh failed"))
    return result


@router.get("/{report_id}/history")
def get_refresh_history(
    report_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    rows = (
        db.query(models.ReportRefreshHistory)
        .filter(models.ReportRefreshHistory.report_id == report_id)
        .order_by(models.ReportRefreshHistory.refresh_started_at.desc())
        .limit(limit)
        .all()
    )
    def _history_row(h):
        meta = {}
        if h.error_message and h.status == "success":
            try:
                import json as _json
                meta = _json.loads(h.error_message)
            except Exception:
                meta = {}
        duration = (
            (h.refresh_completed_at - h.refresh_started_at).total_seconds()
            if h.refresh_started_at and h.refresh_completed_at
            else None
        )
        return {
            "id": h.id,
            "report_id": h.report_id,
            "refresh_started_at": h.refresh_started_at.isoformat() if h.refresh_started_at else None,
            "refresh_completed_at": h.refresh_completed_at.isoformat() if h.refresh_completed_at else None,
            "status": h.status,
            "records_processed": h.records_processed,
            "api_rows_refreshed": h.records_processed if meta.get("live_api_called") else None,
            "graphs_updated": meta.get("graphs_updated"),
            "live_api_called": meta.get("live_api_called"),
            "error_message": h.error_message if h.status != "success" else None,
            "duration_sec": duration,
            "possibly_stale": duration is not None and duration < 0.3 and not meta.get("live_api_called"),
        }

    return {
        "history": [_history_row(h) for h in rows],
        "stats": get_refresh_stats(db, report_id),
    }


@router.get("/{report_id}/status")
def get_refresh_status(report_id: str, db: Session = Depends(get_db)):
    return get_refresh_stats(db, report_id)
