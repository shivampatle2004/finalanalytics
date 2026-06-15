"""
Power Query service — query CRUD, step management, and execution engine.
"""

import copy
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

import models
from services.transformation_engine import (
    apply_pipeline, load_source_dataframe, dataframe_to_preview,
    describe_step, make_step, SUPPORTED_STEPS,
)
from routers.files import resolve_stored_file_path


def _serialize_query(q: models.QueryMaster, step_count: int = 0) -> Dict[str, Any]:
    return {
        "id": q.id,
        "report_id": q.report_id,
        "query_name": q.query_name,
        "source_type": q.source_type,
        "source_config": q.source_config or {},
        "created_by": q.created_by,
        "is_active": q.is_active,
        "step_count": step_count,
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
    }


def _serialize_step(s: models.QueryStep) -> Dict[str, Any]:
    return {
        "id": s.id,
        "query_id": s.query_id,
        "step_order": s.step_order,
        "operation_type": s.operation_type,
        "operation_config": s.operation_config or {},
        "enabled": s.enabled,
        "description": describe_step({
            "type": s.operation_type,
            "config": s.operation_config or {},
        }),
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _steps_to_pipeline(step_rows: List[models.QueryStep]) -> List[Dict]:
    return [{
        "id": s.id,
        "type": s.operation_type,
        "config": s.operation_config or {},
        "enabled": s.enabled,
    } for s in sorted(step_rows, key=lambda x: x.step_order)]


def _migrate_legacy_steps(db: Session, report_id: str, query: models.QueryMaster):
    """Import steps from bi_dataset_transformations if query has none."""
    if db.query(models.QueryStep).filter(models.QueryStep.query_id == query.id).count() > 0:
        return
    dataset = db.query(models.BIDataset).filter(
        models.BIDataset.file_id == report_id,
        models.BIDataset.is_active == True,
    ).first()
    if not dataset:
        return
    transform = db.query(models.BIDatasetTransformation).filter(
        models.BIDatasetTransformation.dataset_id == dataset.id
    ).order_by(models.BIDatasetTransformation.updated_at.desc()).first()
    if not transform or not transform.steps:
        return
    for i, step in enumerate(transform.steps or []):
        row = models.QueryStep(
            id=str(uuid.uuid4()),
            query_id=query.id,
            step_order=i,
            operation_type=step.get("type", "unknown"),
            operation_config=step.get("config") or {},
            enabled=step.get("enabled", True),
        )
        db.add(row)
    db.commit()


def ensure_primary_query(db: Session, report_id: str, user_id: Optional[int] = None) -> models.QueryMaster:
    """Ensure at least one query exists for the report."""
    existing = db.query(models.QueryMaster).filter(
        models.QueryMaster.report_id == report_id,
        models.QueryMaster.is_active == True,
    ).order_by(models.QueryMaster.created_at).first()
    if existing:
        _migrate_legacy_steps(db, report_id, existing)
        return existing

    file_row = db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
    if not file_row:
        raise ValueError("Report not found")

    path = resolve_stored_file_path(file_row)
    ext = (file_row.file_name or "").rsplit(".", 1)[-1].lower() if file_row.file_name else "csv"
    source_type = ext if ext in ("csv", "xlsx", "xls", "json") else "csv"

    query = models.QueryMaster(
        id=str(uuid.uuid4()),
        report_id=report_id,
        query_name=file_row.file_name or "Primary Query",
        source_type=source_type,
        source_config={"file_path": path, "file_name": file_row.file_name},
        created_by=user_id,
    )
    db.add(query)
    db.commit()
    db.refresh(query)
    _migrate_legacy_steps(db, report_id, query)
    return query


def list_queries(db: Session, report_id: str) -> List[Dict]:
    ensure_primary_query(db, report_id)
    rows = db.query(models.QueryMaster).filter(
        models.QueryMaster.report_id == report_id,
        models.QueryMaster.is_active == True,
    ).order_by(models.QueryMaster.created_at).all()
    result = []
    for q in rows:
        cnt = db.query(models.QueryStep).filter(models.QueryStep.query_id == q.id).count()
        result.append(_serialize_query(q, cnt))
    return result


def create_query(
    db: Session,
    report_id: str,
    query_name: str,
    source_type: str = "csv",
    source_config: Optional[Dict] = None,
    user_id: Optional[int] = None,
) -> Dict:
    primary = ensure_primary_query(db, report_id)
    query = models.QueryMaster(
        id=str(uuid.uuid4()),
        report_id=report_id,
        query_name=query_name,
        source_type=source_type,
        source_config=source_config or copy.deepcopy(primary.source_config or {}),
        created_by=user_id,
    )
    db.add(query)
    db.commit()
    db.refresh(query)
    return _serialize_query(query, 0)


def duplicate_query(db: Session, query_id: str) -> Dict:
    src = db.query(models.QueryMaster).filter(models.QueryMaster.id == query_id).first()
    if not src:
        raise ValueError("Query not found")
    dup = models.QueryMaster(
        id=str(uuid.uuid4()),
        report_id=src.report_id,
        query_name=f"{src.query_name} (Copy)",
        source_type=src.source_type,
        source_config=copy.deepcopy(src.source_config or {}),
        created_by=src.created_by,
    )
    db.add(dup)
    db.flush()
    steps = db.query(models.QueryStep).filter(models.QueryStep.query_id == query_id).order_by(models.QueryStep.step_order).all()
    for s in steps:
        db.add(models.QueryStep(
            id=str(uuid.uuid4()),
            query_id=dup.id,
            step_order=s.step_order,
            operation_type=s.operation_type,
            operation_config=copy.deepcopy(s.operation_config or {}),
            enabled=s.enabled,
        ))
    db.commit()
    db.refresh(dup)
    return _serialize_query(dup, len(steps))


def rename_query(db: Session, query_id: str, query_name: str) -> Dict:
    q = db.query(models.QueryMaster).filter(models.QueryMaster.id == query_id).first()
    if not q:
        raise ValueError("Query not found")
    q.query_name = query_name
    q.updated_at = datetime.now(timezone.utc)
    db.commit()
    cnt = db.query(models.QueryStep).filter(models.QueryStep.query_id == query_id).count()
    return _serialize_query(q, cnt)


def delete_query(db: Session, query_id: str):
    q = db.query(models.QueryMaster).filter(models.QueryMaster.id == query_id).first()
    if not q:
        raise ValueError("Query not found")
    active_count = db.query(models.QueryMaster).filter(
        models.QueryMaster.report_id == q.report_id,
        models.QueryMaster.is_active == True,
    ).count()
    if active_count <= 1:
        raise ValueError("Cannot delete the only query")
    q.is_active = False
    db.commit()


def get_query_steps(db: Session, query_id: str) -> List[Dict]:
    rows = db.query(models.QueryStep).filter(
        models.QueryStep.query_id == query_id
    ).order_by(models.QueryStep.step_order).all()
    return [_serialize_step(s) for s in rows]


def _next_step_order(db: Session, query_id: str) -> int:
    last = db.query(models.QueryStep).filter(
        models.QueryStep.query_id == query_id
    ).order_by(models.QueryStep.step_order.desc()).first()
    return (last.step_order + 1) if last else 0


def add_step(
    db: Session,
    query_id: str,
    operation_type: str,
    config: Dict,
    *,
    clear_redo: bool = True,
) -> Dict:
    if operation_type not in SUPPORTED_STEPS:
        raise ValueError(f"Unsupported operation: {operation_type}")
    q = db.query(models.QueryMaster).filter(models.QueryMaster.id == query_id).first()
    if not q:
        raise ValueError("Query not found")
    if operation_type == "merge_join":
        other_id = config.get("query_id")
        join_col = config.get("on") or config.get("keys")
        if not other_id:
            raise ValueError("Select a second query to merge with")
        if other_id == query_id:
            raise ValueError("Cannot merge a query with itself — duplicate the query or add another data source")
        if not join_col:
            raise ValueError("Select a join column shared by both queries")
        other = db.query(models.QueryMaster).filter(
            models.QueryMaster.id == other_id,
            models.QueryMaster.is_active == True,
        ).first()
        if not other:
            raise ValueError("Second query not found")
    elif operation_type == "append":
        other_id = config.get("query_id")
        if not other_id:
            raise ValueError("Select a query to append")
        if other_id == query_id:
            raise ValueError("Cannot append a query to itself")
        other = db.query(models.QueryMaster).filter(
            models.QueryMaster.id == other_id,
            models.QueryMaster.is_active == True,
        ).first()
        if not other:
            raise ValueError("Second query not found")
    step = models.QueryStep(
        id=str(uuid.uuid4()),
        query_id=query_id,
        step_order=_next_step_order(db, query_id),
        operation_type=operation_type,
        operation_config=config,
        enabled=True,
    )
    db.add(step)
    q.updated_at = datetime.now(timezone.utc)
    if clear_redo:
        _clear_redo_stack(query_id)
    db.commit()
    db.refresh(step)
    return _serialize_step(step)


def delete_step(db: Session, step_id: str):
    step = db.query(models.QueryStep).filter(models.QueryStep.id == step_id).first()
    if not step:
        raise ValueError("Step not found")
    query_id = step.query_id
    db.delete(step)
    db.commit()
    _reindex_steps(db, query_id)


def toggle_step(db: Session, step_id: str, enabled: bool) -> Dict:
    step = db.query(models.QueryStep).filter(models.QueryStep.id == step_id).first()
    if not step:
        raise ValueError("Step not found")
    step.enabled = enabled
    db.commit()
    db.refresh(step)
    return _serialize_step(step)


def update_step_config(db: Session, step_id: str, config: Dict) -> Dict:
    step = db.query(models.QueryStep).filter(models.QueryStep.id == step_id).first()
    if not step:
        raise ValueError("Step not found")
    step.operation_config = config
    db.commit()
    db.refresh(step)
    return _serialize_step(step)


def reorder_steps(db: Session, query_id: str, step_ids: List[str]) -> List[Dict]:
    steps = db.query(models.QueryStep).filter(models.QueryStep.query_id == query_id).all()
    by_id = {s.id: s for s in steps}
    for order, sid in enumerate(step_ids):
        if sid in by_id:
            by_id[sid].step_order = order
    db.commit()
    return get_query_steps(db, query_id)


def _reindex_steps(db: Session, query_id: str):
    steps = db.query(models.QueryStep).filter(
        models.QueryStep.query_id == query_id
    ).order_by(models.QueryStep.step_order).all()
    for i, s in enumerate(steps):
        s.step_order = i
    db.commit()


def load_query_source(db: Session, query: models.QueryMaster, skip_cache: bool = False) -> pd.DataFrame:
    cfg = query.source_config or {}
    path = cfg.get("file_path")
    if not path and query.report_id:
        file_row = db.query(models.UploadedFile).filter(models.UploadedFile.id == query.report_id).first()
        if file_row:
            path = resolve_stored_file_path(file_row)
    if not path:
        raise ValueError("No source data found for query")
    return load_source_dataframe(path, skip_cache=skip_cache)


def _resolve_join_data(db: Session, config: Dict) -> List[Dict]:
    """Load rows from another query for merge/append operations."""
    other_query_id = config.get("query_id")
    if not other_query_id:
        return config.get("data", [])
    other_df = execute_query(db, other_query_id, skip_cache=True)
    return other_df.to_dict(orient="records")


def execute_query(db: Session, query_id: str, up_to_step: Optional[int] = None, skip_cache: bool = False) -> pd.DataFrame:
    """Execute all steps for a query in sequence."""
    query = db.query(models.QueryMaster).filter(models.QueryMaster.id == query_id).first()
    if not query:
        raise ValueError("Query not found")
    df = load_query_source(db, query, skip_cache=skip_cache)
    step_rows = db.query(models.QueryStep).filter(
        models.QueryStep.query_id == query_id
    ).order_by(models.QueryStep.step_order).all()
    pipeline = _steps_to_pipeline(step_rows)

    enriched = []
    for step in pipeline:
        s = dict(step)
        if s["type"] in ("merge_join", "append") and s.get("config", {}).get("query_id"):
            cfg = dict(s["config"])
            cfg["data"] = _resolve_join_data(db, cfg)
            s["config"] = cfg
        enriched.append(s)

    return apply_pipeline(df, enriched, up_to_index=up_to_step)


def preview_query(
    db: Session,
    query_id: str,
    offset: int = 0,
    limit: int = 100,
    up_to_step: Optional[int] = None,
) -> Dict[str, Any]:
    df = execute_query(db, query_id, up_to_step=up_to_step)
    return dataframe_to_preview(df, offset=offset, limit=limit)


def execute_report_queries(db: Session, report_id: str) -> Dict[str, Any]:
    """Run all active queries for a report (used during refresh)."""
    queries = db.query(models.QueryMaster).filter(
        models.QueryMaster.report_id == report_id,
        models.QueryMaster.is_active == True,
    ).all()
    results = []
    for q in queries:
        try:
            df = execute_query(db, q.id, skip_cache=True)
            results.append({
                "query_id": q.id,
                "query_name": q.query_name,
                "row_count": len(df),
                "success": True,
            })
        except Exception as e:
            results.append({
                "query_id": q.id,
                "query_name": q.query_name,
                "success": False,
                "error": str(e),
            })
    return {"queries": results}


# In-memory redo stack stores removed step payloads per query
_redo_stacks: Dict[str, List[Dict]] = {}


def _clear_redo_stack(query_id: str) -> None:
    _redo_stacks.pop(query_id, None)


def query_history_state(db: Session, query_id: str) -> Dict[str, Any]:
    steps = get_query_steps(db, query_id)
    return {
        "steps": steps,
        "can_undo": len(steps) > 0,
        "can_redo": bool(_redo_stacks.get(query_id)),
    }


def undo_last_step(db: Session, query_id: str) -> Tuple[List[Dict], Optional[str], bool]:
    """Remove the last transformation step. Source is implicit and never stored."""
    steps = db.query(models.QueryStep).filter(
        models.QueryStep.query_id == query_id
    ).order_by(models.QueryStep.step_order).all()
    if not steps:
        return get_query_steps(db, query_id), None, False
    removed = steps[-1]
    desc = describe_step({"type": removed.operation_type, "config": removed.operation_config or {}})
    _redo_stacks.setdefault(query_id, []).append({
        "operation_type": removed.operation_type,
        "operation_config": copy.deepcopy(removed.operation_config or {}),
        "enabled": removed.enabled,
    })
    db.delete(removed)
    db.commit()
    _reindex_steps(db, query_id)
    return get_query_steps(db, query_id), desc, True


def redo_last_undo(db: Session, query_id: str) -> Tuple[List[Dict], Optional[Dict], bool]:
    stack = _redo_stacks.get(query_id, [])
    if not stack:
        return get_query_steps(db, query_id), None, False
    payload = stack.pop()
    step = add_step(
        db,
        query_id,
        payload["operation_type"],
        payload["operation_config"],
        clear_redo=False,
    )
    if not payload.get("enabled", True):
        toggle_step(db, step["id"], False)
        step = _serialize_step(db.query(models.QueryStep).filter(models.QueryStep.id == step["id"]).first())
    return get_query_steps(db, query_id), step, True
