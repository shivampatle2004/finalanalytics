"""
APScheduler integration for report/dashboard auto-refresh.
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from services.etl_scheduler import get_scheduler
from services.report_refresh_service import resolve_trigger_config, execute_refresh
from database import SessionLocal
import models

logger = logging.getLogger("report_refresh_scheduler")

try:
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    from apscheduler.triggers.date import DateTrigger
    _TRIGGERS_AVAILABLE = True
except ImportError:
    _TRIGGERS_AVAILABLE = False


def _job_id(schedule_id: str) -> str:
    return f"report_refresh_{schedule_id}"


def _run_refresh_thread(report_id: str, resource_type: str, schedule_id: str):
    def _target():
        db = SessionLocal()
        try:
            schedule = db.query(models.ReportRefreshSchedule).filter(
                models.ReportRefreshSchedule.id == schedule_id
            ).first()
            if not schedule or not schedule.enabled:
                return
            execute_refresh(report_id, resource_type, triggered_by="schedule")
        finally:
            db.close()

    t = threading.Thread(target=_target, daemon=True)
    t.start()


def _make_trigger(schedule: models.ReportRefreshSchedule):
    if not _TRIGGERS_AVAILABLE:
        raise RuntimeError("APScheduler triggers unavailable")

    tz = schedule.timezone or "UTC"
    kind, value = resolve_trigger_config(schedule)

    if schedule.start_at:
        start = schedule.start_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if start > now:
            return DateTrigger(run_date=start, timezone=tz)

    if kind == "interval":
        return IntervalTrigger(minutes=int(value), timezone=tz)
    parts = str(value).strip().split()
    if len(parts) == 5:
        minute, hour, day, month, dow = parts
        return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow, timezone=tz)
    return CronTrigger.from_crontab(str(value), timezone=tz)


def update_next_refresh_at(schedule_id: str):
    scheduler = get_scheduler()
    if not scheduler:
        return
    job = scheduler.get_job(_job_id(schedule_id))
    if not job or not job.next_run_time:
        return
    db = SessionLocal()
    try:
        schedule = db.query(models.ReportRefreshSchedule).filter(
            models.ReportRefreshSchedule.id == schedule_id
        ).first()
        if schedule:
            schedule.next_refresh_at = job.next_run_time
            db.commit()
    finally:
        db.close()


def register_schedule(schedule: models.ReportRefreshSchedule) -> bool:
    scheduler = get_scheduler()
    if not scheduler or not _TRIGGERS_AVAILABLE:
        return False

    job_id = _job_id(schedule.id)
    if not schedule.enabled:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        return True

    try:
        trigger = _make_trigger(schedule)
        if scheduler.get_job(job_id):
            scheduler.reschedule_job(job_id, trigger=trigger)
        else:
            scheduler.add_job(
                _run_refresh_thread,
                trigger=trigger,
                id=job_id,
                args=[schedule.report_id, schedule.resource_type, schedule.id],
                replace_existing=True,
                max_instances=1,
                misfire_grace_time=300,
            )
        job = scheduler.get_job(job_id)
        if job and job.next_run_time:
            db = SessionLocal()
            try:
                row = db.query(models.ReportRefreshSchedule).filter(
                    models.ReportRefreshSchedule.id == schedule.id
                ).first()
                if row:
                    row.next_refresh_at = job.next_run_time
                    db.commit()
            finally:
                db.close()
        logger.info("Registered refresh schedule %s for report %s", schedule.id, schedule.report_id)
        return True
    except Exception as exc:
        logger.error("Failed to register schedule %s: %s", schedule.id, exc)
        return False


def unregister_schedule(schedule_id: str) -> bool:
    scheduler = get_scheduler()
    if not scheduler:
        return False
    try:
        job_id = _job_id(schedule_id)
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        return True
    except Exception as exc:
        logger.error("Failed to unregister schedule %s: %s", schedule_id, exc)
        return False


def load_report_refresh_schedules():
    scheduler = get_scheduler()
    if not scheduler:
        return
    db = SessionLocal()
    try:
        schedules = db.query(models.ReportRefreshSchedule).filter(
            models.ReportRefreshSchedule.enabled == True
        ).all()
        for s in schedules:
            register_schedule(s)
        logger.info("Loaded %s report refresh schedules", len(schedules))
    finally:
        db.close()
