"""Calculated table CRUD, model sync, and materialization."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy.orm import Session

import models
from services.calculated_table_engine import (
    SUPPORTED_FUNCTIONS,
    dataframe_preview,
    execute_calculated_table,
    infer_column_types,
    validate_expression,
)
from services.model_data_loader import load_table_dataframe
from services.model_engine import ModelEngine


def _base_table_name(file_record: models.UploadedFile) -> str:
    if file_record.file_name:
        return file_record.file_name.rsplit(".", 1)[0]
    return "Data"


def load_report_tables(db: Session, report_id: str) -> Dict[str, pd.DataFrame]:
    """Load all named tables available for calculated table expressions."""
    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
    if not file_record:
        raise ValueError("Report not found")

    tables: Dict[str, pd.DataFrame] = {}
    try:
        df_main = ModelEngine.load_report_dataframe(report_id, db)
        if df_main is not None and len(df_main.columns) > 0:
            base = _base_table_name(file_record)
            tables["main"] = df_main.copy()
            tables[base] = df_main.copy()
    except Exception:
        pass

    mc = file_record.model_config or {}
    for t in mc.get("tables") or []:
        tid = t.get("id")
        tname = (t.get("name") or tid or "").strip()
        if not tid:
            continue
        try:
            df = load_table_dataframe(t, db)
            if df is not None and len(df.columns) > 0:
                tables[tname] = df.copy()
                tables[tid] = df.copy()
        except Exception:
            continue

    if not tables:
        raise ValueError("No source tables found for this report")
    return tables


def list_source_tables(db: Session, report_id: str) -> List[Dict[str, Any]]:
    tables_map = load_report_tables(db, report_id)
    seen = set()
    result = []
    for name, df in tables_map.items():
        if name in seen or name == "main":
            continue
        seen.add(name)
        result.append({
            "name": name,
            "columns": [{"name": str(c), "type": str(df[c].dtype)} for c in df.columns],
            "row_count": len(df),
        })
    if "main" in tables_map:
        df = tables_map["main"]
        base = _base_table_name(
            db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
        )
        if base not in seen:
            result.insert(0, {
                "name": base,
                "columns": [{"name": str(c), "type": str(df[c].dtype)} for c in df.columns],
                "row_count": len(df),
            })
    return result


def _serialize_table(row: models.CalculatedTable) -> Dict[str, Any]:
    return {
        "id": row.id,
        "report_id": row.report_id,
        "table_name": row.table_name,
        "description": row.description,
        "method": row.method,
        "expression": row.expression,
        "builder_config": row.builder_config or {},
        "manual_data": row.manual_data or {},
        "source_tables": row.source_tables or [],
        "model_table_id": row.model_table_id,
        "row_count": row.row_count or 0,
        "is_valid": row.is_valid,
        "validation_errors": row.validation_errors or [],
        "columns": [
            {"id": c.id, "column_name": c.column_name, "data_type": c.data_type}
            for c in (row.columns or [])
        ],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def preview_calculated_table(
    db: Session,
    report_id: str,
    method: str,
    expression: Optional[str] = None,
    builder_config: Optional[Dict] = None,
    manual_data: Optional[Dict] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    tables = load_report_tables(db, report_id)
    if method == "formula" and expression:
        ok, errs = validate_expression(expression)
        if not ok:
            raise ValueError("; ".join(errs))
    df = execute_calculated_table(method, expression, builder_config, manual_data, tables)
    preview = dataframe_preview(df, limit=limit)
    preview["source_tables"] = list({k for k in tables.keys() if k != "main"})
    return preview


def _sync_columns(db: Session, calc: models.CalculatedTable, df: pd.DataFrame):
    db.query(models.CalculatedTableColumn).filter(
        models.CalculatedTableColumn.calculated_table_id == calc.id
    ).delete(synchronize_session=False)
    for col in infer_column_types(df):
        db.add(models.CalculatedTableColumn(
            id=str(uuid.uuid4()),
            calculated_table_id=calc.id,
            column_name=col["column_name"],
            data_type=col["data_type"],
        ))


def _materialize_to_worksheet(db: Session, calc: models.CalculatedTable, df: pd.DataFrame, owner_id: Optional[int]):
    from services import worksheet_service as ws_svc

    table_id = calc.model_table_id or f"calc-{calc.id}"
    calc.model_table_id = table_id
    ws = ws_svc.get_worksheet_for_file(db, table_id)
    if not ws:
        ws = ws_svc.create_worksheet(
            db=db,
            name=calc.table_name[:200],
            owner_id=owner_id,
            source_type="calculated_table",
            source_id=table_id,
        )
    ws_svc.import_data_from_dataframe(df, ws.id, db=db)


def sync_to_model_config(db: Session, calc: models.CalculatedTable, df: pd.DataFrame):
    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == calc.report_id).first()
    if not file_record:
        raise ValueError("Report not found")

    mc = copy.deepcopy(file_record.model_config or {"tables": [], "relationships": []})
    tables = list(mc.get("tables") or [])
    table_id = calc.model_table_id or f"calc-{calc.id}"
    calc.model_table_id = table_id

    col_defs = [
        {"name": c["column_name"], "type": c["data_type"], "isPrimary": False}
        for c in infer_column_types(df)
    ]
    entry = {
        "id": table_id,
        "name": calc.table_name,
        "columns": col_defs,
        "source": {
            "type": "calculated",
            "calculated_table_id": calc.id,
            "method": calc.method,
        },
        "x": 100 + (len(tables) % 5) * 220,
        "y": 100 + (len(tables) // 5) * 160,
        "colorIndex": len(tables) % 8,
    }
    replaced = False
    for i, t in enumerate(tables):
        if t.get("id") == table_id:
            tables[i] = {**t, **entry}
            replaced = True
            break
    if not replaced:
        tables.append(entry)

    calc_tables_meta = list(mc.get("calculated_tables") or [])
    meta = {
        "id": calc.id,
        "table_name": calc.table_name,
        "model_table_id": table_id,
        "method": calc.method,
    }
    calc_tables_meta = [m for m in calc_tables_meta if m.get("id") != calc.id]
    calc_tables_meta.append(meta)
    mc["tables"] = tables
    mc["calculated_tables"] = calc_tables_meta
    file_record.model_config = mc
    db.commit()


def create_calculated_table(
    db: Session,
    report_id: str,
    table_name: str,
    method: str,
    expression: Optional[str] = None,
    description: Optional[str] = None,
    builder_config: Optional[Dict] = None,
    manual_data: Optional[Dict] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    if not table_name or not table_name.strip():
        raise ValueError("Table name is required")

    tables = load_report_tables(db, report_id)
    source_names = sorted({k for k in tables.keys() if k != "main"})

    try:
        df = execute_calculated_table(method, expression, builder_config, manual_data, tables)
        validation_errors: List[str] = []
        is_valid = True
    except Exception as e:
        raise ValueError(str(e))

    calc = models.CalculatedTable(
        id=str(uuid.uuid4()),
        report_id=report_id,
        table_name=table_name.strip(),
        description=description,
        method=method,
        expression=expression,
        builder_config=builder_config or {},
        manual_data=manual_data or {},
        source_tables=source_names,
        model_table_id=f"calc-{uuid.uuid4()}",
        row_count=len(df),
        is_valid=is_valid,
        validation_errors=validation_errors,
        created_by=user_id,
    )
    db.add(calc)
    db.flush()
    _sync_columns(db, calc, df)
    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == report_id).first()
    _materialize_to_worksheet(db, calc, df, file_record.user_id if file_record else user_id)
    sync_to_model_config(db, calc, df)
    ModelEngine.clear_cache_for_file(report_id)
    db.commit()
    db.refresh(calc)
    return _serialize_table(calc)


def update_calculated_table(
    db: Session,
    calc_id: str,
    **kwargs,
) -> Dict[str, Any]:
    calc = db.query(models.CalculatedTable).filter(models.CalculatedTable.id == calc_id).first()
    if not calc:
        raise ValueError("Calculated table not found")

    for key in ("table_name", "description", "method", "expression", "builder_config", "manual_data"):
        if key in kwargs and kwargs[key] is not None:
            setattr(calc, key, kwargs[key])
    calc.updated_at = datetime.now(timezone.utc)

    tables = load_report_tables(db, calc.report_id)
    df = execute_calculated_table(
        calc.method, calc.expression, calc.builder_config, calc.manual_data, tables
    )
    calc.row_count = len(df)
    calc.is_valid = True
    calc.validation_errors = []
    calc.source_tables = sorted({k for k in tables.keys() if k != "main"})

    _sync_columns(db, calc, df)
    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == calc.report_id).first()
    _materialize_to_worksheet(db, calc, df, file_record.user_id if file_record else None)
    sync_to_model_config(db, calc, df)
    ModelEngine.clear_cache_for_file(calc.report_id)
    db.commit()
    db.refresh(calc)
    return _serialize_table(calc)


def refresh_calculated_table(db: Session, calc_id: str) -> Dict[str, Any]:
    return update_calculated_table(db, calc_id)


def list_calculated_tables(db: Session, report_id: str) -> List[Dict[str, Any]]:
    rows = db.query(models.CalculatedTable).filter(
        models.CalculatedTable.report_id == report_id
    ).order_by(models.CalculatedTable.created_at).all()
    return [_serialize_table(r) for r in rows]


def get_calculated_table(db: Session, calc_id: str) -> Dict[str, Any]:
    row = db.query(models.CalculatedTable).filter(models.CalculatedTable.id == calc_id).first()
    if not row:
        raise ValueError("Calculated table not found")
    return _serialize_table(row)


def delete_calculated_table(db: Session, calc_id: str):
    calc = db.query(models.CalculatedTable).filter(models.CalculatedTable.id == calc_id).first()
    if not calc:
        raise ValueError("Calculated table not found")

    file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == calc.report_id).first()
    if file_record:
        mc = copy.deepcopy(file_record.model_config or {})
        tid = calc.model_table_id
        mc["tables"] = [t for t in (mc.get("tables") or []) if t.get("id") != tid]
        mc["calculated_tables"] = [m for m in (mc.get("calculated_tables") or []) if m.get("id") != calc.id]
        file_record.model_config = mc

    db.delete(calc)
    db.commit()
    ModelEngine.clear_cache_for_file(calc.report_id)


def get_autocomplete_context(db: Session, report_id: str) -> Dict[str, Any]:
    sources = list_source_tables(db, report_id)
    return {
        "functions": SUPPORTED_FUNCTIONS,
        "tables": [s["name"] for s in sources],
        "columns": {s["name"]: [c["name"] for c in s["columns"]] for s in sources},
    }
