"""Calculated tables API — Power BI New Table feature."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from routers.files import verify_write_permission
from services.calculated_table_engine import SUPPORTED_FUNCTIONS
from services import calculated_table_service as svc

router = APIRouter(prefix="/api/calculated-tables", tags=["calculated-tables"])


class CalculatedTablePreviewRequest(BaseModel):
    report_id: str
    method: str = "formula"
    expression: Optional[str] = None
    builder_config: Optional[Dict[str, Any]] = None
    manual_data: Optional[Dict[str, Any]] = None
    limit: int = Field(default=100, ge=1, le=1000)


class CalculatedTableCreateRequest(BaseModel):
    report_id: str
    table_name: str
    description: Optional[str] = None
    method: str = "formula"
    expression: Optional[str] = None
    builder_config: Optional[Dict[str, Any]] = None
    manual_data: Optional[Dict[str, Any]] = None


class CalculatedTableUpdateRequest(BaseModel):
    table_name: Optional[str] = None
    description: Optional[str] = None
    method: Optional[str] = None
    expression: Optional[str] = None
    builder_config: Optional[Dict[str, Any]] = None
    manual_data: Optional[Dict[str, Any]] = None


@router.get("/functions")
def list_functions():
    return {"functions": SUPPORTED_FUNCTIONS}


@router.get("/report/{report_id}/sources")
def get_source_tables(report_id: str, db: Session = Depends(get_db)):
    try:
        return {"sources": svc.list_source_tables(db, report_id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/report/{report_id}/autocomplete")
def get_autocomplete(report_id: str, db: Session = Depends(get_db)):
    try:
        return svc.get_autocomplete_context(db, report_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/report/{report_id}")
def list_tables(report_id: str, db: Session = Depends(get_db)):
    return {"calculated_tables": svc.list_calculated_tables(db, report_id)}


@router.get("/{calc_id}")
def get_table(calc_id: str, db: Session = Depends(get_db)):
    try:
        return svc.get_calculated_table(db, calc_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/preview")
def preview_table(payload: CalculatedTablePreviewRequest, db: Session = Depends(get_db)):
    try:
        return svc.preview_calculated_table(
            db,
            payload.report_id,
            payload.method,
            expression=payload.expression,
            builder_config=payload.builder_config,
            manual_data=payload.manual_data,
            limit=payload.limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("")
def create_table(
    payload: CalculatedTableCreateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return svc.create_calculated_table(
            db,
            payload.report_id,
            payload.table_name,
            payload.method,
            expression=payload.expression,
            description=payload.description,
            builder_config=payload.builder_config,
            manual_data=payload.manual_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{calc_id}")
def update_table(
    calc_id: str,
    payload: CalculatedTableUpdateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return svc.update_calculated_table(db, calc_id, **payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{calc_id}/refresh")
def refresh_table(
    calc_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        return svc.refresh_calculated_table(db, calc_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{calc_id}")
def delete_table(
    calc_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_write_permission),
):
    try:
        svc.delete_calculated_table(db, calc_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
