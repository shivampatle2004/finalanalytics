from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import DateTable, ChangeDetectionConfig
from services.modeling_service import ModelingService

router = APIRouter(prefix="/api/modeling", tags=["Modeling"])


class MarkDateTableRequest(BaseModel):
    table_name: str
    column_name: str

class DateTableResponse(BaseModel):
    id: str
    table_name: str
    date_column: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChangeDetectionSetupRequest(BaseModel):
    table_name: str
    column_name: str

class ChangeDetectionStatusResponse(BaseModel):
    id: str
    table_name: str
    column_name: str
    last_checked: Optional[datetime]
    status: str
    is_active: bool
    
    class Config:
        from_attributes = True


@router.post("/mark-date-table", response_model=DateTableResponse)
def mark_date_table(request: MarkDateTableRequest, db: Session = Depends(get_db)):
    try:
        # Validate that the column meets Date Table criteria
        ModelingService.validate_date_table(request.table_name, request.column_name, db)
        
        # Check if dataset already marked
        existing = db.query(DateTable).filter(DateTable.table_name == request.table_name).first()
        if existing:
            existing.date_column = request.column_name
            db.commit()
            db.refresh(existing)
            return existing
            
        new_dt = DateTable(
            table_name=request.table_name,
            date_column=request.column_name
        )
        db.add(new_dt)
        db.commit()
        db.refresh(new_dt)
        return new_dt
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/date-table/{table}", response_model=Optional[DateTableResponse])
def get_date_table(table: str, db: Session = Depends(get_db)):
    dt = db.query(DateTable).filter(DateTable.table_name == table).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Date table mapping not found")
    return dt

@router.get("/date-tables", response_model=List[DateTableResponse])
def get_all_date_tables(db: Session = Depends(get_db)):
    return db.query(DateTable).all()


@router.post("/change-detection/setup", response_model=ChangeDetectionStatusResponse)
def setup_change_detection(request: ChangeDetectionSetupRequest, db: Session = Depends(get_db)):
    try:
        config = ModelingService.setup_change_detection(request.table_name, request.column_name, db)
        return config
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/change-detection/status", response_model=List[ChangeDetectionStatusResponse])
def get_change_detection_status(db: Session = Depends(get_db)):
    configs = db.query(ChangeDetectionConfig).all()
    return configs


@router.post("/change-detection/reset/{config_id}")
def reset_change_detection(config_id: str, db: Session = Depends(get_db)):
    config = db.query(ChangeDetectionConfig).filter(ChangeDetectionConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    config.status = "Monitoring"
    db.commit()
    return {"status": "success", "message": "Change detection reset to Monitoring"}


@router.get("/date-hierarchy/{file_id}")
def get_date_hierarchy(file_id: str, db: Session = Depends(get_db)):
    empty_hierarchy = {"years": [], "months": [], "quarters": []}
    dt = db.query(DateTable).filter(DateTable.table_name == file_id).first()
    if not dt:
        return empty_hierarchy
        
    from services.modeling_service import ModelingService
    from services.time_intelligence import TimeIntelligence
    
    try:
        df = ModelingService.get_dataset_dataframe(file_id, db)
        hierarchy = TimeIntelligence.get_date_hierarchy(df, dt.date_column)
        return hierarchy
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# QUICK MEASURE ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

from models import QuickMeasure
from services.quick_measure_engine import QuickMeasureEngine
from typing import Dict, Any


class QuickMeasureCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    category: str
    template_id: str
    template_label: Optional[str] = None
    field_mappings: Dict[str, str]
    formula: str
    aggregation: Optional[str] = None
    format_type: Optional[str] = "General"
    file_id: Optional[str] = None


class QuickMeasureResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category: str
    template_id: str
    template_label: Optional[str]
    field_mappings: Dict[str, Any]
    formula: str
    aggregation: Optional[str]
    format_type: Optional[str]
    is_valid: bool
    validation_errors: Optional[List[Any]]
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateFormulaRequest(BaseModel):
    template_id: str
    field_mappings: Dict[str, str]
    columns: Optional[List[Dict[str, Any]]] = []


class ExecuteMeasureRequest(BaseModel):
    template_id: str
    field_mappings: Dict[str, str]
    file_id: str
    group_by: Optional[str] = None


@router.get("/quick-measures/templates")
def get_quick_measure_templates():
    """Return all Quick Measure templates grouped by category."""
    return QuickMeasureEngine.get_templates()


@router.post("/quick-measures/generate-formula")
def generate_formula(req: GenerateFormulaRequest):
    """Generate a formula string and validate field types against a schema."""
    formula, errors = QuickMeasureEngine.generate_formula(req.template_id, req.field_mappings)
    type_errors = QuickMeasureEngine.validate_fields(req.template_id, req.field_mappings, req.columns or [])
    all_errors = errors + type_errors
    return {
        "formula": formula,
        "is_valid": len(all_errors) == 0,
        "errors": all_errors,
    }


@router.post("/quick-measures/execute")
def execute_measure(req: ExecuteMeasureRequest, db: Session = Depends(get_db)):
    """Execute a Quick Measure against a file's dataset and return the scalar result."""
    try:
        from services.modeling_service import ModelingService
        df = ModelingService.get_dataset_dataframe(req.file_id, db)
        result = QuickMeasureEngine.execute_measure(df, req.template_id, req.field_mappings, req.group_by)
        return result
    except Exception as e:
        return {"result": None, "error": str(e)}


class SuggestMeasuresRequest(BaseModel):
    columns: List[Dict[str, Any]] = []


@router.post("/quick-measures/suggest")
def suggest_measures(req: SuggestMeasuresRequest):
    """Return heuristic Quick Measure suggestions based on column schema."""
    return QuickMeasureEngine.suggest_measures(req.columns)


@router.post("/quick-measures/suggest-raw")
def suggest_measures_raw(schema: List[Dict[str, Any]]):
    """Alternative endpoint accepting a raw JSON array body."""
    return QuickMeasureEngine.suggest_measures(schema)


@router.post("/quick-measures", response_model=QuickMeasureResponse)
def create_quick_measure(req: QuickMeasureCreateRequest, db: Session = Depends(get_db)):
    """Persist a new Quick Measure."""
    formula, errors = QuickMeasureEngine.generate_formula(req.template_id, req.field_mappings)
    # Use provided formula if given (user may have edited)
    final_formula = req.formula or formula

    qm = QuickMeasure(
        name=req.name,
        description=req.description,
        category=req.category,
        template_id=req.template_id,
        template_label=req.template_label,
        field_mappings=req.field_mappings,
        formula=final_formula,
        aggregation=req.aggregation,
        format_type=req.format_type or "General",
        file_id=req.file_id,
        is_valid=len(errors) == 0,
        validation_errors=errors or None,
    )
    db.add(qm)
    db.commit()
    db.refresh(qm)
    return qm


@router.get("/quick-measures", response_model=List[QuickMeasureResponse])
def list_quick_measures(file_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List all Quick Measures, optionally filtered by file."""
    q = db.query(QuickMeasure)
    if file_id:
        q = q.filter(QuickMeasure.file_id == file_id)
    return q.order_by(QuickMeasure.created_at.desc()).all()


@router.get("/quick-measures/{measure_id}", response_model=QuickMeasureResponse)
def get_quick_measure(measure_id: str, db: Session = Depends(get_db)):
    qm = db.query(QuickMeasure).filter(QuickMeasure.id == measure_id).first()
    if not qm:
        raise HTTPException(status_code=404, detail="Quick Measure not found")
    return qm


@router.delete("/quick-measures/{measure_id}")
def delete_quick_measure(measure_id: str, db: Session = Depends(get_db)):
    qm = db.query(QuickMeasure).filter(QuickMeasure.id == measure_id).first()
    if not qm:
        raise HTTPException(status_code=404, detail="Quick Measure not found")
    db.delete(qm)
    db.commit()
    return {"status": "deleted"}
