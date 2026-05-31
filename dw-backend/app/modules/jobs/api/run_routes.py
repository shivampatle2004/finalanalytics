"""
Global Runs API — cross-job run monitoring endpoints.
Provides listing, filtering, stats aggregation, and detail views.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.jobs_database import get_jobs_db
from app.modules.jobs.models.job_models import Job, JobRun
from app.modules.jobs.schemas.job_serializers import (
    serialize_global_run, serialize_task_run,
)

router = APIRouter(prefix="/dw/runs", tags=["Runs"])


@router.get("")
def list_all_runs(
    status: Optional[str] = None,
    job_name: Optional[str] = None,
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    hours: Optional[int] = Query(None, description="Filter runs from the last N hours"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_jobs_db),
):
    """List all runs across all jobs with optional filters (DW + ETL)."""
    
    # Base CTEs bridging DW and ETL schemas
    base_sql = """
    WITH dw_runs AS (
        SELECT 
            jr.id as run_id,
            jr.job_id as job_id,
            j.name as job_name,
            j.type::text as job_type,
            jr.status::text as status,
            jr.trigger_type::text as trigger_type,
            jr.started_at as started_at,
            jr.ended_at as ended_at,
            'dw' as source,
            (SELECT tr.error_message FROM workflow.task_runs tr WHERE tr.job_run_id = jr.id AND tr.status = 'Failed' LIMIT 1) as error_message
        FROM workflow.job_runs jr
        JOIN workflow.jobs j ON jr.job_id = j.id
    ),
    etl_runs AS (
        SELECT
            ej.id as run_id,
            ep.id as job_id,
            ep.name as job_name,
            'ETL Pipeline' as job_type,
            ej.status::text as status,
            ej.trigger::text as trigger_type,
            ej.started_at as started_at,
            ej.finished_at as ended_at,
            'etl' as source,
            ej.error_message as error_message
        FROM etl.jobs ej
        JOIN etl.pipelines ep ON ej.pipeline_id = ep.id
    ),
    all_runs AS (
        SELECT * FROM dw_runs
        UNION ALL
        SELECT * FROM etl_runs
    )
    SELECT * FROM all_runs WHERE 1=1
    """
    
    params = {}
    where_clauses = []
    
    if status:
        where_clauses.append("status ILIKE :status")
        params["status"] = status
    if job_name:
        where_clauses.append("job_name ILIKE :job_name")
        params["job_name"] = f"%{job_name}%"
    if type:
        if type == "Jobs":
            where_clauses.append("job_type = 'Job'")
        elif type == "Pipelines":
            where_clauses.append("job_type = 'Pipeline' AND job_name NOT ILIKE '%ingest%'")
        elif type == "ETL Pipelines":
            where_clauses.append("job_type = 'ETL Pipeline'")
            
    if start_date:
        where_clauses.append("started_at >= :start_date")
        params["start_date"] = start_date.replace('Z', '+00:00')
    if end_date:
        where_clauses.append("started_at <= :end_date")
        params["end_date"] = end_date.replace('Z', '+00:00')
        
    if hours and not (start_date or end_date):
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        where_clauses.append("started_at >= :cutoff")
        params["cutoff"] = cutoff
        
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    count_sql = f"SELECT COUNT(*) FROM ({base_sql} AND {where_sql}) AS filtered"
    total = db.execute(text(count_sql), params).scalar() or 0
    
    final_sql = f"{base_sql} AND {where_sql} ORDER BY started_at DESC NULLS LAST LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
    rows = db.execute(text(final_sql), params).fetchall()
    
    def format_row(r):
        st = r.status.capitalize() if r.status else "Pending"
        if st.lower() == "cancelled":
            st = "Failed"
            
        tt = r.trigger_type.capitalize() if r.trigger_type else "Manual"
        if tt.lower() in ("scheduled", "schedule"): tt = "Schedule"
        elif tt.lower() == "webhook": tt = "Manual"
        
        err = ""
        if st == "Failed":
            msg = r.error_message or ""
            if ":" in msg:
                err = msg.split(":")[0].strip()
            else:
                err = msg[:30] + "..." if len(msg) > 30 else msg
            if not err:
                err = "UnknownError"
                
        dur = None
        if r.started_at and r.ended_at:
            dur = round((r.ended_at - r.started_at).total_seconds(), 1)
            
        return {
            "id": str(r.run_id),
            "job_id": str(r.job_id),
            "job_name": r.job_name,
            "status": st,
            "trigger_type": tt,
            "parameters": [],
            "started_at": (r.started_at.isoformat() + "Z") if r.started_at else None,
            "ended_at": (r.ended_at.isoformat() + "Z") if r.ended_at else None,
            "duration_seconds": dur,
            "task_runs": [],
            "error_code": err,
            "source": r.source,
            "type": r.job_type
        }
    
    return {
        "runs": [format_row(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats")
def run_stats(
    days: int = Query(7, le=90, description="Number of days to aggregate"),
    db: Session = Depends(get_jobs_db),
):
    """Aggregated success/failure counts grouped by date for chart display (DW + ETL)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    sql = """
    WITH all_runs AS (
        SELECT status::text as status, started_at FROM workflow.job_runs
        UNION ALL
        SELECT status::text as status, started_at FROM etl.jobs
    )
    SELECT 
        DATE(started_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status ILIKE 'Success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status ILIKE 'Failed' OR status ILIKE 'cancelled' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status ILIKE 'Running' THEN 1 ELSE 0 END) as running
    FROM all_runs
    WHERE started_at >= :cutoff
    GROUP BY DATE(started_at)
    ORDER BY DATE(started_at)
    """
    
    rows = db.execute(text(sql), {"cutoff": cutoff}).fetchall()
    
    return [
        {
            "date": str(r.date) if r.date else "",
            "total": r.total or 0,
            "success": r.success or 0,
            "failed": r.failed or 0,
            "running": r.running or 0,
        }
        for r in rows
    ]


@router.get("/{run_id}")
def get_run_detail(run_id: str, db: Session = Depends(get_jobs_db)):
    """Get full run details with task statuses and logs."""
    # First try DW
    run = db.query(JobRun).filter(JobRun.id == run_id).first()
    if run:
        job = db.query(Job).filter(Job.id == run.job_id).first()
        return serialize_global_run(run, job.name if job else "")
        
    # If not in DW, check ETL
    sql = """
        SELECT ej.id, ej.pipeline_id, ep.name, ej.status, ej.trigger, ej.started_at, ej.finished_at, ej.error_message
        FROM etl.jobs ej
        JOIN etl.pipelines ep ON ej.pipeline_id = ep.id
        WHERE ej.id = :run_id
    """
    row = db.execute(text(sql), {"run_id": run_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    dur = None
    if row.started_at and row.finished_at:
        dur = round((row.finished_at - row.started_at).total_seconds(), 1)
        
    st = row.status.capitalize() if row.status else "Pending"
    if st.lower() == "cancelled": st = "Failed"
    
    tt = row.trigger.capitalize() if row.trigger else "Manual"
    if tt.lower() in ("scheduled", "schedule"): tt = "Schedule"
    elif tt.lower() == "webhook": tt = "Manual"
    
    return {
        "id": str(row.id),
        "job_id": str(row.pipeline_id),
        "job_name": row.name,
        "status": st,
        "trigger_type": tt,
        "parameters": [],
        "started_at": (row.started_at.isoformat() + "Z") if row.started_at else None,
        "ended_at": (row.finished_at.isoformat() + "Z") if row.finished_at else None,
        "duration_seconds": dur,
        "task_runs": [],
        "error_code": row.error_message or "",
        "source": "etl"
    }


@router.get("/{run_id}/tasks")
def get_run_tasks(run_id: str, db: Session = Depends(get_jobs_db)):
    """Get task-level run details for a specific run."""
    # First try DW
    run = db.query(JobRun).filter(JobRun.id == run_id).first()
    if run:
        return [serialize_task_run(tr) for tr in (run.task_runs or [])]
        
    # If not in DW, fetch from etl.job_runs
    sql = "SELECT id as task_id, status, started_at, finished_at, error_detail FROM etl.job_runs WHERE job_id = :run_id ORDER BY started_at ASC"
    rows = db.execute(text(sql), {"run_id": run_id}).fetchall()
    
    return [
        {
            "id": str(r.task_id),
            "task_id": str(r.task_id),
            "status": r.status.capitalize() if r.status else "Pending",
            "error_message": r.error_detail or "",
            "started_at": (r.started_at.isoformat() + "Z") if r.started_at else None,
            "ended_at": (r.finished_at.isoformat() + "Z") if r.finished_at else None,
            "logs": [],
            "outputs": []
        }
        for r in rows
    ]
