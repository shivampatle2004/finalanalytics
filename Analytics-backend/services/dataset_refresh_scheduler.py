"""
APScheduler integration for dataset-level auto-refresh.
"""

import logging
import threading
from datetime import datetime, timezone

from database import SessionLocal
import models
from services.etl_scheduler import get_scheduler
from services.data_refresh_service import _resolve_trigger_config, execute_dataset_refresh

logger = logging.getLogger("dataset_refresh_scheduler")

try:
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    _TRIGGERS_AVAILABLE = True
except ImportError:
    _TRIGGERS_AVAILABLE = False


def _job_id(schedule_id: str) -> str:
    return f"dataset_refresh_{schedule_id}"


def _run_refresh_thread(dataset_id: str, schedule_id: str):
    def _target():
        db = SessionLocal()
        try:
            schedule = db.query(models.BIDatasetRefreshSchedule).filter(
                models.BIDatasetRefreshSchedule.id == schedule_id
            ).first()
            if not schedule or not schedule.enabled:
                return
            refresh_type = "incremental" if schedule.incremental_enabled else "scheduled"
            execute_dataset_refresh(db, dataset_id, triggered_by=refresh_type)
        finally:
            db.close()

    threading.Thread(target=_target, daemon=True).start()


def _make_trigger(schedule: models.BIDatasetRefreshSchedule):
    if not _TRIGGERS_AVAILABLE:
        raise RuntimeError("APScheduler triggers unavailable")
    tz = schedule.timezone or "UTC"
    kind, value = _resolve_trigger_config(schedule)
    if kind == "interval":
        return IntervalTrigger(minutes=int(value), timezone=tz)
    parts = str(value).strip().split()
    if len(parts) == 5:
        minute, hour, day, month, dow = parts
        return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow, timezone=tz)
    return CronTrigger.from_crontab(str(value), timezone=tz)


def register_schedule(schedule: models.BIDatasetRefreshSchedule) -> bool:
    scheduler = get_scheduler()
    if not scheduler or not schedule.enabled:
        return False
    try:
        trigger = _make_trigger(schedule)
        scheduler.add_job(
            _run_refresh_thread,
            trigger=trigger,
            id=_job_id(schedule.id),
            args=[schedule.dataset_id, schedule.id],
            replace_existing=True,
        )
        job = scheduler.get_job(_job_id(schedule.id))
        if job and job.next_run_time:
            db = SessionLocal()
            try:
                row = db.query(models.BIDatasetRefreshSchedule).filter(
                    models.BIDatasetRefreshSchedule.id == schedule.id
                ).first()
                if row:
                    row.next_refresh_at = job.next_run_time
                    db.commit()
            finally:
                db.close()
        return True
    except Exception as e:
        logger.error("Failed to register dataset refresh schedule %s: %s", schedule.id, e)
        return False


def unregister_schedule(schedule_id: str):
    scheduler = get_scheduler()
    if scheduler:
        try:
            scheduler.remove_job(_job_id(schedule_id))
        except Exception:
            pass


def load_all_schedules():
    db = SessionLocal()
    try:
        schedules = db.query(models.BIDatasetRefreshSchedule).filter(
            models.BIDatasetRefreshSchedule.enabled == True
        ).all()
        for s in schedules:
            register_schedule(s)
        logger.info("Loaded %d dataset refresh schedules", len(schedules))
    finally:
        db.close()
