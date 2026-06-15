"""
Power BI Edit Queries API — query_master / query_steps management.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal
from routers.files import verify_write_permission
from services.query_service import (
    ensure_primary_query, list_queries, create_query, duplicate_query,
    rename_query, delete_query, get_query_steps, add_step, delete_step,
    toggle_step, update_step_config, reorder_steps, preview_query,
    undo_last_step, redo_last_undo, execute_report_queries, query_history_state,
)
from services.transformation_engine import SUPPORTED_STEPS

router = APIRouter(prefix="/api/queries", tags=["edit-queries"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class QueryCreate(BaseModel):
    query_name: str
    source_type: str = "csv"
    source_config: Optional[Dict[str, Any]] = None


class QueryRename(BaseModel):
    query_name: str


class StepAdd(BaseModel):
    operation_type: str
    operation_config: Dict[str, Any] = {}


class StepUpdate(BaseModel):
    operation_config: Dict[str, Any]


class StepToggle(BaseModel):
    enabled: bool


class StepReorder(BaseModel):
    step_ids: List[str]


@router.get("/report/{report_id}")
def get_report_queries(report_id: str, db: Session = Depends(get_db)):
    return {"queries": list_queries(db, report_id), "supported_operations": sorted(SUPPORTED_STEPS)}


@router.post("/report/{report_id}")
def create_report_query(
    report_id: str,
    payload: QueryCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return create_query(db, report_id, payload.query_name, payload.source_type, payload.source_config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/report/{report_id}/ensure")
def ensure_query(report_id: str, db: Session = Depends(get_db)):
    q = ensure_primary_query(db, report_id)
    from services.query_service import _serialize_query
    cnt = len(get_query_steps(db, q.id))
    return _serialize_query(q, cnt)


@router.put("/{query_id}/rename")
def rename_query_endpoint(
    query_id: str,
    payload: QueryRename,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return rename_query(db, query_id, payload.query_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{query_id}/duplicate")
def duplicate_query_endpoint(query_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    try:
        return duplicate_query(db, query_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{query_id}")
def delete_query_endpoint(query_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    try:
        delete_query(db, query_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{query_id}/steps")
def list_steps(query_id: str, db: Session = Depends(get_db)):
    return query_history_state(db, query_id)


@router.post("/{query_id}/steps")
def add_query_step(
    query_id: str,
    payload: StepAdd,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        step = add_step(db, query_id, payload.operation_type, payload.operation_config)
        return {"step": step, **query_history_state(db, query_id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{query_id}/steps/{step_id}")
def update_query_step(
    query_id: str,
    step_id: str,
    payload: StepUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return {"step": update_step_config(db, step_id, payload.operation_config)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{query_id}/steps/{step_id}")
def remove_query_step(
    query_id: str,
    step_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        delete_step(db, step_id)
        return {"steps": get_query_steps(db, query_id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{query_id}/steps/{step_id}/toggle")
def toggle_query_step(
    query_id: str,
    step_id: str,
    payload: StepToggle,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return {"step": toggle_step(db, step_id, payload.enabled), "steps": get_query_steps(db, query_id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{query_id}/steps/reorder")
def reorder_query_steps(
    query_id: str,
    payload: StepReorder,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    return {"steps": reorder_steps(db, query_id, payload.step_ids)}


@router.get("/{query_id}/preview")
def preview_query_data(
    query_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    up_to_step: Optional[int] = None,
    db: Session = Depends(get_db),
):
    try:
        return preview_query(db, query_id, offset=offset, limit=limit, up_to_step=up_to_step)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{query_id}/refresh-preview")
def refresh_preview(query_id: str, db: Session = Depends(get_db)):
    try:
        return preview_query(db, query_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{query_id}/undo")
def undo_query_step(query_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    steps, removed, changed = undo_last_step(db, query_id)
    meta = query_history_state(db, query_id)
    return {
        **meta,
        "removed_step": removed,
        "changed": changed,
        "message": None if changed else "Nothing to undo",
        "history": [s["description"] for s in meta["steps"]],
    }


@router.post("/{query_id}/redo")
def redo_query_step(query_id: str, db: Session = Depends(get_db), _: None = Depends(verify_write_permission)):
    steps, restored, changed = redo_last_undo(db, query_id)
    meta = query_history_state(db, query_id)
    return {
        **meta,
        "restored_step": restored,
        "changed": changed,
        "message": None if changed else "Nothing to redo",
        "history": [s["description"] for s in meta["steps"]],
    }


@router.post("/report/{report_id}/execute")
def execute_all_queries(report_id: str, db: Session = Depends(get_db)):
    """Execute all queries for refresh pipeline."""
    return execute_report_queries(db, report_id)
