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
    if req.file_id:
        from routers.graphs import clear_graph_cache_for_file
        clear_graph_cache_for_file(req.file_id)
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
    if file_id:
        from routers.graphs import clear_graph_cache_for_file
        clear_graph_cache_for_file(file_id)
    return {"status": "deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# SEMANTIC MEASURES ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

import uuid
from typing import Dict, Any, List
from models import SemanticMeasure, UploadedFile, GraphDefinition, PaginatedReport, SemanticMeasureVersion
from services.semantic_measure_engine import SemanticMeasureEngine

class SemanticMeasureCreateRequest(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: str
    expression: str
    format: Optional[str] = "General"
    file_id: str
    
    uuid: Optional[str] = None
    version: Optional[int] = 1
    status: Optional[str] = "Active"
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    business_definition: Optional[str] = None
    tags: Optional[List[str]] = None
    referenced_measures: Optional[List[str]] = None
    referenced_columns: Optional[List[str]] = None
    currency: Optional[str] = None
    decimal_places: Optional[int] = 2
    color_rules: Optional[Dict[str, Any]] = None
    display_units: Optional[str] = "None"
    owner: Optional[str] = None
    steward: Optional[str] = None
    certification_status: Optional[str] = "Uncertified"
    approval_status: Optional[str] = "Draft"

class SemanticMeasureUpdateRequest(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    expression: Optional[str] = None
    format: Optional[str] = None
    status: Optional[str] = None
    modified_by: Optional[str] = None
    business_definition: Optional[str] = None
    tags: Optional[List[str]] = None
    referenced_measures: Optional[List[str]] = None
    referenced_columns: Optional[List[str]] = None
    currency: Optional[str] = None
    decimal_places: Optional[int] = None
    color_rules: Optional[Dict[str, Any]] = None
    display_units: Optional[str] = None
    owner: Optional[str] = None
    steward: Optional[str] = None
    certification_status: Optional[str] = None
    approval_status: Optional[str] = None

class MeasureValidateRequest(BaseModel):
    name: str
    expression: str
    file_id: str

class MeasurePreviewRequest(BaseModel):
    name: str
    expression: str
    file_id: str
    format_type: Optional[str] = "General"
    group_by: Optional[str] = None
    decimal_places: Optional[int] = 2
    currency: Optional[str] = None
    display_units: Optional[str] = "None"

class SemanticMeasureResponse(BaseModel):
    id: str
    file_id: Optional[str]
    user_id: Optional[int]
    name: str
    display_name: Optional[str]
    description: Optional[str]
    category: str
    expression: str
    format: Optional[str]
    dependencies: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    
    uuid: Optional[str] = None
    version: Optional[int] = 1
    status: Optional[str] = "Active"
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    business_definition: Optional[str] = None
    tags: Optional[List[str]] = None
    referenced_measures: Optional[List[str]] = None
    referenced_columns: Optional[List[str]] = None
    currency: Optional[str] = None
    decimal_places: Optional[int] = 2
    color_rules: Optional[Dict[str, Any]] = None
    display_units: Optional[str] = "None"
    owner: Optional[str] = None
    steward: Optional[str] = None
    certification_status: Optional[str] = "Uncertified"
    approval_status: Optional[str] = "Draft"
    usage_count: Optional[int] = 0
    last_used_at: Optional[datetime] = None
    dashboards_using: Optional[List[str]] = None
    reports_using: Optional[List[str]] = None
    visuals_using: Optional[List[str]] = None

    class Config:
        from_attributes = True

class SemanticMeasureVersionResponse(BaseModel):
    id: str
    measure_id: str
    version: int
    expression: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    format: Optional[str] = None
    modified_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

def _populate_measure_usage(measure: SemanticMeasure, db: Session):
    """Dynamically scan visual graphs and reports to populate count and linkage lists."""
    if not measure or not measure.file_id:
        return
    visuals = db.query(GraphDefinition).filter(GraphDefinition.file_id == measure.file_id).all()
    visuals_using = []
    dashboards_using = []
    
    for vis in visuals:
        is_used = False
        if vis.y_axis == measure.name:
            is_used = True
        elif vis.options:
            opts = vis.options
            mfields = opts.get("measure_fields") or []
            if any(isinstance(mf, dict) and mf.get("column") == measure.name for mf in mfields):
                is_used = True
            elif opts.get("y_axis") == measure.name:
                is_used = True
                
        if is_used:
            vis_name = (vis.options or {}).get("title") or f"{vis.graph_type.capitalize()} Visual"
            visuals_using.append(vis_name)
            page_name = (vis.options or {}).get("pageName") or (vis.options or {}).get("pageId") or "Default Dashboard"
            if page_name not in dashboards_using:
                dashboards_using.append(page_name)
                
    # Search reports
    reports = db.query(PaginatedReport).all()
    reports_using = []
    for rep in reports:
        rep_str = str(rep.layout_json or "") + str(rep.datasource_mapping or "")
        if f"'{measure.name}'" in rep_str or f'"{measure.name}"' in rep_str or f'[{measure.name}]' in rep_str or measure.name in rep_str:
            reports_using.append(rep.name)
            
    measure.usage_count = len(visuals_using) + len(reports_using)
    measure.visuals_using = visuals_using
    measure.dashboards_using = dashboards_using
    measure.reports_using = reports_using
    if measure.usage_count > 0:
        measure.last_used_at = measure.updated_at or datetime.utcnow()

def sync_measures_to_model_config(file_id: str, db: Session):
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record:
        return
    measures = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
    mc = dict(file_record.model_config or {})
    mc["measures"] = [
        {
            "id": m.id,
            "name": m.name,
            "display_name": m.display_name,
            "description": m.description,
            "category": m.category,
            "expression": m.expression,
            "format": m.format,
            "dependencies": m.dependencies,
            
            "uuid": m.uuid,
            "version": m.version,
            "status": m.status,
            "created_by": m.created_by,
            "modified_by": m.modified_by,
            "business_definition": m.business_definition,
            "tags": m.tags,
            "referenced_measures": m.referenced_measures,
            "referenced_columns": m.referenced_columns,
            "currency": m.currency,
            "decimal_places": m.decimal_places,
            "color_rules": m.color_rules,
            "display_units": m.display_units,
            "owner": m.owner,
            "steward": m.steward,
            "certification_status": m.certification_status,
            "approval_status": m.approval_status,
            
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None
        } for m in measures
    ]
    file_record.model_config = mc
    db.commit()

@router.post("/measures/validate")
def validate_measure(req: MeasureValidateRequest, db: Session = Depends(get_db)):
    """Validate a custom measure formula expression, reference, syntax, and check circular dependency."""
    try:
        existing_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == req.file_id).all()
        existing_measures = [{"name": m.name, "expression": m.expression} for m in existing_measures_db]
        
        validation = SemanticMeasureEngine.validate_measure(
            name=req.name,
            expression=req.expression,
            file_id=req.file_id,
            measures=existing_measures,
            db=db
        )
        return validation
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/measures/preview")
def preview_measure(req: MeasurePreviewRequest, db: Session = Depends(get_db)):
    """Evaluate a custom measure formula and return a preview result value."""
    try:
        existing_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == req.file_id).all()
        existing_measures = [
            {"id": m.id, "name": m.name, "expression": m.expression, "category": m.category}
            for m in existing_measures_db
        ]
        
        preview = SemanticMeasureEngine.calculate_preview(
            name=req.name,
            expression=req.expression,
            file_id=req.file_id,
            measures=existing_measures,
            format_type=req.format_type or "General",
            group_by=req.group_by,
            db=db,
            decimal_places=req.decimal_places if req.decimal_places is not None else 2,
            currency=req.currency,
            display_units=req.display_units or "None"
        )
        return preview
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/measures", response_model=SemanticMeasureResponse)
def create_semantic_measure(req: SemanticMeasureCreateRequest, db: Session = Depends(get_db)):
    """Create a new custom semantic measure with validation and sync."""
    # Check if a measure with the same name already exists for this file
    dup = db.query(SemanticMeasure).filter(
        SemanticMeasure.file_id == req.file_id,
        SemanticMeasure.name == req.name
    ).first()
    if dup:
        raise HTTPException(status_code=400, detail=f"A measure named '{req.name}' already exists.")

    existing_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == req.file_id).all()
    existing_measures = [{"name": m.name, "expression": m.expression} for m in existing_measures_db]
    
    validation = SemanticMeasureEngine.validate_measure(
        name=req.name,
        expression=req.expression,
        file_id=req.file_id,
        measures=existing_measures,
        db=db
    )
    if not validation["is_valid"]:
        raise HTTPException(status_code=400, detail=validation["errors"][0])

    new_measure = SemanticMeasure(
        file_id=req.file_id,
        name=req.name,
        display_name=req.display_name or req.name,
        description=req.description,
        category=req.category,
        expression=req.expression,
        format=req.format or "General",
        dependencies=validation.get("dependencies", {"fields": [], "measures": []}),
        
        uuid=req.uuid or str(uuid.uuid4()),
        version=req.version or 1,
        status=req.status or "Active",
        created_by=req.created_by,
        modified_by=req.modified_by,
        business_definition=req.business_definition,
        tags=req.tags,
        referenced_measures=validation.get("dependencies", {}).get("measures", []),
        referenced_columns=validation.get("dependencies", {}).get("fields", []),
        currency=req.currency,
        decimal_places=req.decimal_places if req.decimal_places is not None else 2,
        color_rules=req.color_rules,
        display_units=req.display_units or "None",
        owner=req.owner,
        steward=req.steward,
        certification_status=req.certification_status or "Uncertified",
        approval_status=req.approval_status or "Draft"
    )
    db.add(new_measure)
    db.commit()
    db.refresh(new_measure)

    # Save initial version history
    new_version = SemanticMeasureVersion(
        measure_id=new_measure.id,
        version=new_measure.version or 1,
        expression=new_measure.expression,
        display_name=new_measure.display_name,
        description=new_measure.description,
        category=new_measure.category,
        format=new_measure.format,
        modified_by=new_measure.created_by or "System"
    )
    db.add(new_version)
    db.commit()
    
    # Sync to model_config
    sync_measures_to_model_config(req.file_id, db)
    _populate_measure_usage(new_measure, db)
    from routers.graphs import clear_graph_cache_for_file
    clear_graph_cache_for_file(req.file_id)
    return new_measure

@router.get("/measures", response_model=List[SemanticMeasureResponse])
def list_semantic_measures(file_id: str, db: Session = Depends(get_db)):
    """List all custom semantic measures for a given file/model."""
    measures = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).order_by(SemanticMeasure.name).all()
    for m in measures:
        _populate_measure_usage(m, db)
    return measures

@router.get("/measures/{measure_id}", response_model=SemanticMeasureResponse)
def get_semantic_measure(measure_id: str, db: Session = Depends(get_db)):
    """Get details of a single custom semantic measure."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
    _populate_measure_usage(measure, db)
    return measure

@router.put("/measures/{measure_id}", response_model=SemanticMeasureResponse)
def update_semantic_measure(measure_id: str, req: SemanticMeasureUpdateRequest, db: Session = Depends(get_db)):
    """Update custom semantic measure fields with validation and sync."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
    
    file_id = measure.file_id
    
    if req.name is not None:
        # Check duplicate name if renamed
        if req.name != measure.name:
            dup = db.query(SemanticMeasure).filter(
                SemanticMeasure.file_id == file_id,
                SemanticMeasure.name == req.name
            ).first()
            if dup:
                raise HTTPException(status_code=400, detail=f"A measure named '{req.name}' already exists.")
            measure.name = req.name

    if req.display_name is not None:
        measure.display_name = req.display_name
    if req.description is not None:
        measure.description = req.description
    if req.category is not None:
        measure.category = req.category
    if req.format is not None:
        measure.format = req.format
    if req.status is not None:
        measure.status = req.status
    if req.modified_by is not None:
        measure.modified_by = req.modified_by
    if req.business_definition is not None:
        measure.business_definition = req.business_definition
    if req.tags is not None:
        measure.tags = req.tags
    if req.currency is not None:
        measure.currency = req.currency
    if req.decimal_places is not None:
        measure.decimal_places = req.decimal_places
    if req.color_rules is not None:
        measure.color_rules = req.color_rules
    if req.display_units is not None:
        measure.display_units = req.display_units
    if req.owner is not None:
        measure.owner = req.owner
    if req.steward is not None:
        measure.steward = req.steward
    if req.certification_status is not None:
        measure.certification_status = req.certification_status
    if req.approval_status is not None:
        measure.approval_status = req.approval_status

    expr_changed = False
    if req.expression is not None and req.expression != measure.expression:
        measure.expression = req.expression
        # Increment version on expression update
        measure.version = (measure.version or 1) + 1
        expr_changed = True

    # Validate again with new settings
    existing_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
    existing_measures = [{"name": m.name, "expression": m.expression} for m in existing_measures_db if m.id != measure_id]
    
    validation = SemanticMeasureEngine.validate_measure(
        name=measure.name,
        expression=measure.expression,
        file_id=file_id,
        measures=existing_measures,
        db=db
    )
    if not validation["is_valid"]:
        raise HTTPException(status_code=400, detail=validation["errors"][0])
    
    measure.dependencies = validation.get("dependencies", {"fields": [], "measures": []})
    measure.referenced_measures = validation.get("dependencies", {}).get("measures", [])
    measure.referenced_columns = validation.get("dependencies", {}).get("fields", [])
    
    db.commit()
    db.refresh(measure)

    if expr_changed:
        new_version = SemanticMeasureVersion(
            measure_id=measure.id,
            version=measure.version or 1,
            expression=measure.expression,
            display_name=measure.display_name,
            description=measure.description,
            category=measure.category,
            format=measure.format,
            modified_by=measure.modified_by or "System"
        )
        db.add(new_version)
        db.commit()
        db.refresh(measure)
    
    # Sync to model_config
    sync_measures_to_model_config(file_id, db)
    _populate_measure_usage(measure, db)
    from routers.graphs import clear_graph_cache_for_file
    clear_graph_cache_for_file(file_id)
    
    return measure

@router.post("/measures/{measure_id}/duplicate", response_model=SemanticMeasureResponse)
def duplicate_semantic_measure(measure_id: str, db: Session = Depends(get_db)):
    """Clone an existing measure under a unique name."""
    orig = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not orig:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
        
    # Find a unique name
    base_name = f"{orig.name}_copy"
    idx = 1
    new_name = base_name
    while db.query(SemanticMeasure).filter(SemanticMeasure.file_id == orig.file_id, SemanticMeasure.name == new_name).first():
        new_name = f"{base_name}_{idx}"
        idx += 1
        
    new_measure = SemanticMeasure(
        file_id=orig.file_id,
        user_id=orig.user_id,
        name=new_name,
        display_name=f"{orig.display_name or orig.name} (Copy)",
        description=orig.description,
        category=orig.category,
        expression=orig.expression,
        format=orig.format,
        dependencies=orig.dependencies,
        
        uuid=str(uuid.uuid4()),
        version=1,
        status="Active",
        created_by="System",
        modified_by="System",
        business_definition=orig.business_definition,
        tags=orig.tags,
        referenced_measures=orig.referenced_measures,
        referenced_columns=orig.referenced_columns,
        currency=orig.currency,
        decimal_places=orig.decimal_places,
        color_rules=orig.color_rules,
        display_units=orig.display_units,
        owner=orig.owner,
        steward=orig.steward,
        certification_status="Uncertified",
        approval_status="Draft"
    )
    db.add(new_measure)
    db.commit()
    db.refresh(new_measure)
    
    sync_measures_to_model_config(orig.file_id, db)
    _populate_measure_usage(new_measure, db)
    from routers.graphs import clear_graph_cache_for_file
    clear_graph_cache_for_file(orig.file_id)
    return new_measure

@router.get("/measures/{measure_id}/versions", response_model=List[SemanticMeasureVersionResponse])
def get_measure_versions(measure_id: str, db: Session = Depends(get_db)):
    """Retrieve all historical versions of a measure, sorted by version descending."""
    versions = db.query(SemanticMeasureVersion).filter(SemanticMeasureVersion.measure_id == measure_id).order_by(SemanticMeasureVersion.version.desc()).all()
    return versions

@router.post("/measures/{measure_id}/versions/{version_num}/rollback", response_model=SemanticMeasureResponse)
def rollback_measure_version(measure_id: str, version_num: int, db: Session = Depends(get_db)):
    """Roll back a custom measure logic and settings to an older version."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
        
    version_record = db.query(SemanticMeasureVersion).filter(
        SemanticMeasureVersion.measure_id == measure_id,
        SemanticMeasureVersion.version == version_num
    ).first()
    if not version_record:
        raise HTTPException(status_code=404, detail="Requested measure version not found")
        
    # Revert measure fields
    measure.expression = version_record.expression
    if version_record.display_name:
        measure.display_name = version_record.display_name
    if version_record.description is not None:
        measure.description = version_record.description
    if version_record.category:
        measure.category = version_record.category
    if version_record.format:
        measure.format = version_record.format
        
    # Increment version counter
    measure.version = (measure.version or 1) + 1
    measure.modified_by = f"Rollback to V{version_num}"
    
    # Run AST validation on rolled back expression
    file_id = measure.file_id
    existing_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
    existing_measures = [{"name": m.name, "expression": m.expression} for m in existing_measures_db if m.id != measure_id]
    
    validation = SemanticMeasureEngine.validate_measure(
        name=measure.name,
        expression=measure.expression,
        file_id=file_id,
        measures=existing_measures,
        db=db
    )
    if not validation["is_valid"]:
        raise HTTPException(status_code=400, detail="Cannot roll back: version formula validation failed: " + validation["errors"][0])
        
    measure.dependencies = validation.get("dependencies", {"fields": [], "measures": []})
    measure.referenced_measures = validation.get("dependencies", {}).get("measures", [])
    measure.referenced_columns = validation.get("dependencies", {}).get("fields", [])
    
    db.commit()
    db.refresh(measure)
    
    # Create new version entry representing this rolled back state
    new_version = SemanticMeasureVersion(
        measure_id=measure.id,
        version=measure.version,
        expression=measure.expression,
        display_name=measure.display_name,
        description=measure.description,
        category=measure.category,
        format=measure.format,
        modified_by=f"Rollback to V{version_num}"
    )
    db.add(new_version)
    db.commit()
    db.refresh(measure)
    
    # Sync to config
    sync_measures_to_model_config(file_id, db)
    _populate_measure_usage(measure, db)
    from routers.graphs import clear_graph_cache_for_file
    clear_graph_cache_for_file(file_id)
    
    return measure

@router.get("/measures/{measure_id}/lineage")
def get_measure_lineage(measure_id: str, db: Session = Depends(get_db)):
    """Retrieve parent (used columns/measures) and child (dependent measures) lineage."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
        
    file_id = measure.file_id
    
    parents = []
    for m_name in (measure.referenced_measures or []):
        parents.append({"name": m_name, "type": "measure"})
    for col_name in (measure.referenced_columns or []):
        parents.append({"name": col_name, "type": "column"})
        
    children = []
    all_measures = db.query(SemanticMeasure).filter(
        SemanticMeasure.file_id == file_id,
        SemanticMeasure.id != measure_id
    ).all()
    for m in all_measures:
        if measure.name in (m.referenced_measures or []):
            children.append({"name": m.name, "type": "measure"})
            
    return {
        "measure_name": measure.name,
        "parents": parents,
        "children": children
    }

@router.get("/measures/{measure_id}/impact")
def get_measure_delete_impact(measure_id: str, db: Session = Depends(get_db)):
    """Check where this measure is used before deletion to prevent breakage."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
    
    file_id = measure.file_id
    
    # Load all measures for the file
    all_measures_db = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
    all_measures = [
        {"name": m.name, "expression": m.expression} for m in all_measures_db
    ]
    
    # Load all GraphDefinitions (visuals) for the file
    visuals_db = db.query(GraphDefinition).filter(GraphDefinition.file_id == file_id).all()
    visuals = []
    for vis in visuals_db:
        opts = vis.options or {}
        measure_fields = opts.get("measure_fields") or []
        if vis.y_axis == measure.name:
            if not any(mf.get("column") == measure.name for mf in measure_fields):
                measure_fields.append({"column": measure.name})
                
        opts_copy = dict(opts)
        opts_copy["measure_fields"] = measure_fields
        
        visuals.append({
            "options": opts_copy,
            "graph_type": vis.graph_type
        })
        
    dashboards = [{"graphs": visuals}]
    
    from services.semantic_measure_engine import DependencyGraph
    impact = DependencyGraph.get_impacted_objects(
        measure_name=measure.name,
        measures=all_measures,
        dashboards=dashboards
    )
    
    # Search reports for deletion impact
    reports = db.query(PaginatedReport).all()
    for rep in reports:
        rep_str = str(rep.layout_json or "") + str(rep.datasource_mapping or "")
        if f"'{measure.name}'" in rep_str or f'"{measure.name}"' in rep_str or f'[{measure.name}]' in rep_str or measure.name in rep_str:
            impact.append({
                "type": "report",
                "name": rep.name,
                "details": f"Used in Paginated Report '{rep.name}'"
            })
            
    return {
        "measure_name": measure.name,
        "impact": impact,
        "is_critical": len(impact) > 0
    }

@router.delete("/measures/{measure_id}")
def delete_semantic_measure(measure_id: str, db: Session = Depends(get_db)):
    """Delete a custom semantic measure and sync."""
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.id == measure_id).first()
    if not measure:
        raise HTTPException(status_code=404, detail="Semantic measure not found")
    
    file_id = measure.file_id
    db.delete(measure)
    db.commit()
    
    # Sync to model_config
    sync_measures_to_model_config(file_id, db)
    from routers.graphs import clear_graph_cache_for_file
    clear_graph_cache_for_file(file_id)
    
    return {"status": "deleted"}
