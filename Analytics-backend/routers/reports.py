from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Dict
from database import SessionLocal
import models
from utils.logger import get_logger
from services.data_engine import DataEngine
from services.report_pdf_service import sync_generate_pdf
from services.paginated_report_engine import PaginatedReportEngine
from services.report_visual_renderer import ReportVisualRenderer
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
import os
import io


logger = get_logger("routers.reports")

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _cap_row_list(data_list, cap: int):
    """Limit list length for PDF charts / fallbacks (matches Rows per page setting)."""
    if not isinstance(data_list, list) or not data_list:
        return data_list
    cap = max(1, min(int(cap), 50_000))
    if len(data_list) <= cap:
        return data_list
    return data_list[:cap]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("")
def list_reports(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    """List all paginated reports."""
    try:
        query = db.query(models.PaginatedReport)
        if user_id:
            query = query.filter(models.PaginatedReport.user_id == user_id)
        reports = query.order_by(models.PaginatedReport.created_at.desc()).all()
        return {"reports": reports, "total": len(reports)}
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-pdf-direct")
def generate_pdf_direct(payload: Dict[str, Any] = Body(...)):
    """Generate PDF directly from elements with inline data."""
    try:
        from pydantic import BaseModel
        from services.model_engine import ModelEngine
        from database import SessionLocal
        
        class ElementWithData(BaseModel):
            type: str
            config: Dict[str, Any] = {}
            data: Optional[List[Dict[str, Any]]] = None
        
        title = payload.get("title", "Report")
        page_size = payload.get("page_size", "A4")
        orientation = payload.get("orientation", "portrait")
        elements_data = payload.get("elements", [])
        file_id = payload.get("file_id")
        include_summary = bool(payload.get("include_summary", False))
        rows_per_page_req = max(1, min(int(payload.get("rows_per_page", 30) or 30), 50_000))
        dataset_row_count = payload.get("dataset_row_count")
        selected_columns_count = payload.get("selected_columns_count")
        row_cap = rows_per_page_req

        config = {
            "page_size": page_size,
            "orientation": orientation,
            "header_text": title,
            "include_summary": include_summary,
            "include_chart": False,
            "rows_per_page": rows_per_page_req,
            "dataset_row_count": dataset_row_count,
            "selected_columns_count": selected_columns_count,
        }
        
        db = SessionLocal()
        all_data = []
        
        try:
            if file_id:
                df = ModelEngine.load_report_dataframe(file_id, db)
                if df is not None:
                    df = df.where(df.notnull(), None)
                    all_data = df.to_dict(orient="records")
        finally:
            db.close()
        
        elements = []
        logger.info(
            "Processing %s incoming elements (row_cap=%s), dataframe rows: %s",
            len(elements_data),
            row_cap,
            len(all_data),
        )

        for el in elements_data:
            config_json = dict(el.get("config", {}) or {})
            el_type = el.get("type", "text")
            if isinstance(el_type, str):
                el_type = el_type.strip().lower()
            inline_data = el.get("data")

            logger.info(f"Element type: {el_type}, has inline data: {inline_data is not None}")

            # ── Image snapshot: frontend captured a live chart screenshot ──
            if el_type == "image_snapshot":
                # config already has title + image_b64; pass straight through
                elements.append({
                    "type": "image_snapshot",
                    "config_json": config_json,
                })
                continue

            # ── Charts: modal sends type "chart" with chartType inside config ──
            if el_type == "chart":
                ct = (config_json.get("chartType") or config_json.get("chart_type") or "bar").lower()
                if ct == "column":
                    ct = "bar"
                config_json["chart_type"] = ct
                chart_data = inline_data
                if chart_data:
                    config_json["chart_data"] = _cap_row_list(chart_data, row_cap)
                elif all_data:
                    config_json["chart_data"] = _cap_row_list(all_data, row_cap)
            elif el_type in ("bar", "line", "pie", "area", "column", "donut"):
                ct = el_type if el_type != "column" else "bar"
                config_json["chart_type"] = config_json.get("chartType") or ct
                chart_data = inline_data
                if chart_data:
                    config_json["chart_data"] = _cap_row_list(chart_data, row_cap)
                elif all_data and (config_json.get("xField") or config_json.get("x_axis") or config_json.get("yField") or config_json.get("y_axis")):
                    config_json["chart_data"] = _cap_row_list(all_data, row_cap)
                elif all_data:
                    config_json["chart_data"] = _cap_row_list(all_data, row_cap)

            if el_type == "table":
                table_rows = inline_data
                if not table_rows and all_data:
                    table_rows = all_data
                col_specs = config_json.get("columns") or []
                col_names = []
                for c in col_specs:
                    if isinstance(c, dict):
                        n = c.get("name") or c.get("header")
                        if n:
                            col_names.append(n)
                    elif isinstance(c, str):
                        col_names.append(c)
                if table_rows and col_names:
                    table_rows = [{k: row.get(k) for k in col_names} for row in table_rows]
                if table_rows:
                    config_json["table_data"] = _cap_row_list(table_rows, row_cap)
                config_json["rows_per_page"] = config_json.get("rows_per_page", rows_per_page_req)
                if not config_json.get("columns") and table_rows:
                    config_json["columns"] = [{"name": c, "header": c} for c in list(table_rows[0].keys())[:20]]

            if el_type == "text":
                config_json["content"] = config_json.get("content", config_json.get("title", ""))

            elements.append({
                "type": el_type,
                "config_json": config_json,
            })

        logger.info("Built %s PDF elements: %s", len(elements), [e.get("type") for e in elements])

        def inline_data_provider(ds_index):
            return all_data if all_data else []

        pdf_bytes = PaginatedReportEngine.generate_pdf(config, elements, inline_data_provider)
        
        if not pdf_bytes or len(pdf_bytes) < 100:
            return JSONResponse(
                status_code=500,
                content={"error": "PDF generation failed"}
            )
        
        pdf_buffer = io.BytesIO(pdf_bytes)
        pdf_buffer.seek(0)
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={title}.pdf"}
        )
    except Exception as e:
        logger.error(f"Direct PDF generation error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


# ─── Power BI-Level Report Visual PDF ────────────────────────────────────────

@router.post("/generate-visual-pdf")
def generate_visual_pdf(payload: Dict[str, Any] = Body(...)):
    """
    Power BI Paginated Report style PDF generation.

    Accepts full visual state (graphDefinition + reportConfig) per visual.
    Re-applies all filters, drill state, and transforms via ReportVisualRenderer.
    Never uses screenshots — charts are re-rendered from data specifically for print.

    Payload schema:
    {
        "title":           str,
        "page_size":       "A4" | "LETTER",
        "orientation":     "portrait" | "landscape",
        "file_id":         str,
        "include_summary": bool,
        "rows_per_page":   int,
        "visuals": [
            {
                "id":              str,
                "title":           str,
                "visualType":      str,
                "graphDefinition": { ... },
                "reportConfig":    { ... }
            }
        ],
        "table_columns":   [str]
    }
    """
    try:
        title          = payload.get("title", "Report")
        page_size      = payload.get("page_size", "A4")
        orientation    = payload.get("orientation", "portrait")
        file_id        = payload.get("file_id")
        include_summary = bool(payload.get("include_summary", False))
        rows_per_page   = max(1, min(int(payload.get("rows_per_page", 30) or 30), 50_000))
        visuals         = payload.get("visuals") or []
        table_columns   = payload.get("table_columns") or []

        logger.info(
            "[VisualPDF] Generating report '%s': %d visuals, %d table columns, file_id=%s",
            title, len(visuals), len(table_columns), file_id
        )

        # ── Load master dataset ───────────────────────────────────────────────
        df = None
        semantic_dict = {}
        measures_meta = {}
        db_session = SessionLocal()
        try:
            if file_id:
                from services.model_engine import ModelEngine
                df = ModelEngine.load_report_dataframe(file_id, db_session)
                if df is not None:
                    import numpy as np
                    df = df.replace([np.inf, -np.inf], None)
                    df = df.where(df.notnull(), None)
                    logger.info("[VisualPDF] Loaded %d rows × %d cols from file_id=%s",
                                len(df), len(df.columns), file_id)

                # Fetch custom semantic measures from database
                from models import SemanticMeasure
                semantic_measures_list = db_session.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
                semantic_dict = {m.name: m.expression for m in semantic_measures_list}
                for m in semantic_measures_list:
                    measures_meta[m.name] = {
                        "display_name": m.display_name or m.name,
                        "format": m.format or "General",
                        "currency": m.currency or "₹",
                        "decimal_places": m.decimal_places if m.decimal_places is not None else 2,
                        "display_units": m.display_units or "None"
                    }
        except Exception as df_exc:
            logger.error("[VisualPDF] Dataset load error: %s", df_exc)
        finally:
            db_session.close()

        # ── Render each visual → PNG bytes ────────────────────────────────────
        elements = []

        for idx, vis in enumerate(visuals):
            vis_title   = vis.get("title") or f"Visual {idx + 1}"
            vis_type    = str(vis.get("visualType") or "bar").lower()
            graph_def   = vis.get("graphDefinition") or {}
            report_cfg  = vis.get("reportConfig") or {}
            one_per_page = bool(report_cfg.get("oneChartPerPage", True))

            # Apply display name matching to visual title
            y_axis = graph_def.get("y_axis")
            if y_axis in measures_meta:
                meta = measures_meta[y_axis]
                if not vis.get("title") or vis.get("title") == f"Visual {idx + 1}" or vis.get("title").lower() == y_axis.lower():
                    vis_title = meta["display_name"]
                vis = dict(vis)
                vis["title"] = vis_title
                vis["measure_meta"] = meta

            logger.info("[VisualPDF] Rendering visual %d/%d: '%s' (%s)",
                        idx + 1, len(visuals), vis_title, vis_type)

            # Tables are handled separately via the table builder
            if vis_type == "table":
                table_data = None
                valid_cols = []
                if df is not None and not df.empty:
                    dim_fields  = (graph_def.get("options") or {}).get("dimension_fields") or []
                    meas_fields = (graph_def.get("options") or {}).get("measure_fields") or []
                    cols_wanted = [m.get("column") for m in meas_fields if isinstance(m, dict) and m.get("column")]
                    all_cols    = list(dict.fromkeys(dim_fields + cols_wanted))

                    # Evaluate semantic measures if they are in all_cols
                    if semantic_dict:
                        from services.quick_measure_engine import MeasureRegistry
                        for col_name in all_cols:
                            if col_name in semantic_dict and col_name not in df.columns:
                                try:
                                    val = MeasureRegistry.resolve(col_name, df, {"measures": semantic_dict}, row_wise=True)
                                    df[col_name] = val
                                except Exception as ex:
                                    logger.warning("[VisualPDF] Failed to evaluate semantic measure %s in visual table: %s", col_name, ex)
                                    df[col_name] = None

                    valid_cols  = [c for c in all_cols if c in df.columns] or list(df.columns[:10])
                    
                    # Format each row's cells if they represent semantic measures
                    table_data = []
                    for row in df.to_dict("records"):
                        formatted_row = {}
                        for c in valid_cols:
                            raw_val = row.get(c)
                            if c in measures_meta:
                                from services.semantic_measure_engine import SemanticMeasureEngine
                                meta = measures_meta[c]
                                formatted_val = SemanticMeasureEngine.format_result(
                                    raw_val,
                                    format_type=meta["format"],
                                    decimal_places=meta["decimal_places"],
                                    currency=meta["currency"],
                                    display_units=meta["display_units"]
                                )
                                formatted_row[c] = "" if formatted_val == "BLANK" else formatted_val
                            else:
                                formatted_row[c] = raw_val
                        table_data.append(formatted_row)
                    table_data  = table_data[:rows_per_page]

                col_specs = []
                for c in (valid_cols if table_data else []):
                    header_name = c
                    if c in measures_meta:
                        header_name = measures_meta[c]["display_name"]
                    col_specs.append({"name": c, "header": header_name})

                elements.append({
                    "type": "table",
                    "config_json": {
                        "title":        vis_title,
                        "table_data":   table_data or [],
                        "columns":      col_specs,
                        "rows_per_page": rows_per_page,
                        "show_header":   True,
                    },
                    "one_per_page": one_per_page,
                })
                continue

            # Skip non-chart types
            SKIP_TYPES = {"slicer", "text", "shape", "button", "image", "kpicards"}
            if vis_type in SKIP_TYPES:
                logger.info("[VisualPDF] Skipping non-chart type: %s", vis_type)
                continue

            # Render via dedicated report renderer
            print(f"CHART START - index: {idx}, title: {vis_title}")
            print(f"CHART TYPE: {vis_type}")
            logger.info("CHART START - index: %d, title: %s", idx, vis_title)
            logger.info("CHART TYPE: %s", vis_type)

            img_bytes = None
            if df is not None and not df.empty:
                print(f"PAYLOAD SIZE: df rows={len(df)}")
                logger.info("PAYLOAD SIZE: df rows=%d", len(df))
                try:
                    # Ensure file_id is always present in graph_def (both snake_case and camelCase)
                    # so _aggregate_df can always resolve semantic measures.
                    if file_id and not graph_def.get("file_id") and not graph_def.get("fileId"):
                        vis = dict(vis)
                        vis["graphDefinition"] = dict(graph_def)
                        vis["graphDefinition"]["file_id"] = file_id
                    elif file_id and not graph_def.get("file_id"):
                        vis = dict(vis)
                        vis["graphDefinition"] = dict(graph_def)
                        vis["graphDefinition"]["file_id"] = file_id

                    img_bytes = ReportVisualRenderer.render(df, vis)
                    if img_bytes:
                        print("RENDER SUCCESS")
                        logger.info("RENDER SUCCESS")
                    else:
                        print("RENDER FAILURE - renderer returned None")
                        logger.info("RENDER FAILURE - renderer returned None")
                except Exception as render_err:
                    print(f"RENDER FAILURE: {render_err}")
                    logger.error("RENDER FAILURE: %s", render_err, exc_info=True)
            else:
                print("RENDER FAILURE - df is empty or None")
                logger.warning("[VisualPDF] No dataframe available for visual '%s'", vis_title)

            if img_bytes:
                elements.append({
                    "type": "visual",
                    "config_json": {
                        "title":       vis_title,
                        "image_bytes": img_bytes,
                    },
                    "one_per_page": one_per_page,
                })
                print("FLOWABLE ADDED")
                logger.info("FLOWABLE ADDED")
                # Optionally add data table below the chart
                if bool(report_cfg.get("includeDataTable")) and df is not None and not df.empty:
                    rows_for_table = ReportVisualRenderer.render.__func__ if False else None
                    # Get aggregated rows for the data table
                    try:
                        from services.report_visual_renderer import (
                            _apply_filter_rules, _apply_drill_state,
                            _aggregate_df
                        )
                        options     = graph_def.get("options") or {}
                        work_df     = _apply_filter_rules(df.copy(), options.get("filters") or [])
                        work_df     = _apply_drill_state(work_df, options)
                        table_rows  = _aggregate_df(work_df, graph_def)
                        if table_rows:
                            table_rows = table_rows[:rows_per_page]
                            
                            col_specs = []
                            first_row = table_rows[0]
                            for k in first_row.keys():
                                header_name = k
                                if k in measures_meta:
                                    header_name = measures_meta[k]["display_name"]
                                col_specs.append({"name": k, "header": header_name})
                                
                            formatted_table_rows = []
                            for row in table_rows:
                                formatted_row = {}
                                for k, v in row.items():
                                    if k in measures_meta:
                                        from services.semantic_measure_engine import SemanticMeasureEngine
                                        meta = measures_meta[k]
                                        formatted_val = SemanticMeasureEngine.format_result(
                                            v,
                                            format_type=meta["format"],
                                            decimal_places=meta["decimal_places"],
                                            currency=meta["currency"],
                                            display_units=meta["display_units"]
                                        )
                                        formatted_row[k] = "" if formatted_val == "BLANK" else formatted_val
                                    else:
                                        formatted_row[k] = v
                                formatted_table_rows.append(formatted_row)

                            elements.append({
                                "type": "table",
                                "config_json": {
                                    "title":        f"{vis_title} — Data",
                                    "table_data":   formatted_table_rows,
                                    "columns":      col_specs,
                                    "rows_per_page": rows_per_page,
                                    "show_header":   True,
                                },
                                "one_per_page": False,
                            })
                    except Exception as tbl_exc:
                        logger.warning("[VisualPDF] Data table for visual '%s' failed: %s", vis_title, tbl_exc)
            else:
                logger.warning("[VisualPDF] Render returned no image for '%s'; adding placeholder", vis_title)

        # ── Evaluate semantic measures in table_columns ────────────────────────
        if table_columns and df is not None and not df.empty and semantic_dict:
            from services.quick_measure_engine import MeasureRegistry
            for col_name in table_columns:
                if col_name in semantic_dict and col_name not in df.columns:
                    try:
                        val = MeasureRegistry.resolve(col_name, df, {"measures": semantic_dict}, row_wise=True)
                        df[col_name] = val
                    except Exception as ex:
                        logger.warning("[VisualPDF] Failed to evaluate semantic measure %s: %s", col_name, ex)
                        df[col_name] = None

        # ── Data table section (manually selected columns) ────────────────────
        if table_columns and df is not None and not df.empty:
            valid_table_cols = [c for c in table_columns if c in df.columns]
            if valid_table_cols:
                col_specs = []
                for c in valid_table_cols:
                    header_name = c
                    if c in measures_meta:
                        header_name = measures_meta[c]["display_name"]
                    col_specs.append({"name": c, "header": header_name})
                    
                all_data = []
                for row in df[valid_table_cols].to_dict("records"):
                    formatted_row = {}
                    for c in valid_table_cols:
                        raw_val = row.get(c)
                        if c in measures_meta:
                            from services.semantic_measure_engine import SemanticMeasureEngine
                            meta = measures_meta[c]
                            formatted_val = SemanticMeasureEngine.format_result(
                                raw_val,
                                format_type=meta["format"],
                                decimal_places=meta["decimal_places"],
                                currency=meta["currency"],
                                display_units=meta["display_units"]
                            )
                            formatted_row[c] = "" if formatted_val == "BLANK" else formatted_val
                        else:
                            formatted_row[c] = raw_val
                    all_data.append(formatted_row)
                all_data     = all_data[:rows_per_page]
                elements.append({
                    "type": "table",
                    "config_json": {
                        "table_data":    all_data,
                        "columns":       col_specs,
                        "rows_per_page": rows_per_page,
                        "show_header":   True,
                    },
                    "one_per_page": False,
                })

        # ── Flatten to engine format (one_per_page injected into config_json) ─
        engine_elements = []
        for el in elements:
            cfg = dict(el.get("config_json") or {})
            cfg["one_per_page"] = el.get("one_per_page", False)
            engine_elements.append({"type": el["type"], "config_json": cfg})

        logger.info("[VisualPDF] Built %d PDF elements", len(engine_elements))

        if not engine_elements:
            return JSONResponse(status_code=422, content={"error": "No renderable visuals in the report."})

        # ── Data provider (used for summary KPIs) ─────────────────────────────
        all_data_rows = df.to_dict("records") if df is not None and not df.empty else []

        def data_provider(_ds_index):
            return all_data_rows

        report_config = {
            "page_size":       page_size,
            "orientation":     orientation,
            "header_text":     title,
            "include_summary": include_summary,
            "include_chart":   False,
            "rows_per_page":   rows_per_page,
        }

        pdf_bytes = PaginatedReportEngine.generate_pdf(report_config, engine_elements, data_provider)

        if not pdf_bytes or len(pdf_bytes) < 100:
            return JSONResponse(status_code=500, content={"error": "PDF generation produced an empty file."})

        pdf_buffer = io.BytesIO(pdf_bytes)
        pdf_buffer.seek(0)
        safe_name  = title.replace(" ", "_").replace("/", "-")

        logger.info("[VisualPDF] Done — %d bytes", len(pdf_bytes))
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
        )

    except Exception as exc:
        logger.error("[VisualPDF] Error: %s", exc, exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.post("", status_code=201)
@router.post("/create", status_code=201)
def create_report(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Create a new paginated report definition.
    Supports both the new 'layout' format and the legacy 'elements'/'data_sources' format.
    """
    try:
        logger.info("📝 [CREATE] Received report creation request")
        logger.debug(f"📝 [CREATE] Payload keys: {list(payload.keys())}")
        
        # Detect legacy format and translate to new layout_json structure
        layout = payload.get("layout", {})
        datasource_mapping = payload.get("datasource_mapping", {})
        
        if not layout and "elements" in payload:
            logger.info("📝 [CREATE] Legacy format detected, translating...")
            # Legacy format detected
            layout = {
                "pages": [
                    {
                        "id": "page-1",
                        "elements": payload.get("elements", []),
                        "settings": {
                            "size": payload.get("page_size", "A4"),
                            "orientation": payload.get("orientation", "portrait")
                        }
                    }
                ]
            }
            
            # Map legacy data_sources to datasource_mapping
            if "data_sources" in payload:
                for idx, ds in enumerate(payload["data_sources"]):
                    pass
        
        # Analyze what we're storing
        total_elements = sum(len(page.get("elements", [])) for page in layout.get("pages", []))
        charts_with_inline_data = 0
        total_inline_rows = 0
        
        for page in layout.get("pages", []):
            for el in page.get("elements", []):
                if el.get("type") == "chart" and el.get("config", {}).get("chart_data"):
                    charts_with_inline_data += 1
                    total_inline_rows += len(el.get("config", {}).get("chart_data", []))
        
        layout_json_size = len(str(layout)) / 1024  # KB
        
        logger.info(f"📝 [CREATE] Report structure:")
        logger.info(f"  - Pages: {len(layout.get('pages', []))}")
        logger.info(f"  - Total elements: {total_elements}")
        logger.info(f"  - Charts with inline data: {charts_with_inline_data}")
        logger.info(f"  - Total inline data rows: {total_inline_rows}")
        logger.info(f"  - Layout JSON size: {layout_json_size:.2f} KB")
        logger.info(f"  - Vault mappings: {len(datasource_mapping)}")
        
        report = models.PaginatedReport(
            name=payload.get("name", "Untitled Report"),
            description=payload.get("description"),
            user_id=payload.get("user_id"),
            layout_json=layout,
            datasource_mapping=datasource_mapping,
            parameters=payload.get("parameters", [])
        )

        db.add(report)
        db.commit()
        db.refresh(report)
        
        logger.info(f"✅ [CREATE] Report created successfully: ID={report.id}")
        
        # Verify data was stored
        verify_layout = report.layout_json
        verify_charts = sum(
            1 for p in verify_layout.get("pages", [])
            for e in p.get("elements", [])
            if e.get("type") == "chart" and e.get("config", {}).get("chart_data")
        )
        logger.info(f"✅ [CREATE] Verification - Charts with data in DB: {verify_charts}")
        
        return report
    except Exception as e:
        logger.error(f"❌ [CREATE] Error creating report: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get a single report definition."""
    logger.info(f"🔍 [RETRIEVE] Fetching report: {report_id}")
    
    report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    if not report:
        logger.warning(f"❌ [RETRIEVE] Report not found: {report_id}")
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Log what we're returning
    pages = report.layout_json.get("pages", [])
    total_elements = sum(len(p.get("elements", [])) for p in pages)
    charts_with_data = sum(
        1 for p in pages
        for e in p.get("elements", [])
        if e.get("type") == "chart" and e.get("config", {}).get("chart_data")
    )
    total_inline_rows = sum(
        len(e.get("config", {}).get("chart_data", []))
        for p in pages
        for e in p.get("elements", [])
        if e.get("type") == "chart" and e.get("config", {}).get("chart_data")
    )
    
    logger.info(f"✅ [RETRIEVE] Report found:")
    logger.info(f"  - Pages: {len(pages)}")
    logger.info(f"  - Total elements: {total_elements}")
    logger.info(f"  - Charts with inline data: {charts_with_data}")
    logger.info(f"  - Total inline rows: {total_inline_rows}")
    logger.info(f"  - Vault mappings: {len(report.datasource_mapping or {})}")
    
    return report

@router.put("/{report_id}")
def update_report(report_id: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Update an existing report definition."""
    try:
        logger.info(f"📝 [UPDATE] Updating report: {report_id}")
        
        report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
        if not report:
            logger.warning(f"❌ [UPDATE] Report not found: {report_id}")
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Log what fields are being updated
        fields_to_update = [k for k in ["name", "description", "layout", "datasource_mapping", "parameters"] if k in payload]
        logger.info(f"📝 [UPDATE] Fields to update: {fields_to_update}")
        
        if "name" in payload:
            logger.info(f"📝 [UPDATE] Name: {payload['name']}")
            report.name = payload["name"]
        
        if "description" in payload:
            report.description = payload["description"]
        
        if "layout" in payload:
            layout = payload["layout"]
            charts_with_data = sum(
                1 for p in layout.get("pages", [])
                for e in p.get("elements", [])
                if e.get("type") == "chart" and e.get("config", {}).get("chart_data")
            )
            layout_size = len(str(layout)) / 1024
            logger.info(f"📝 [UPDATE] Layout: {len(layout.get('pages', []))} pages, {charts_with_data} charts with inline data, size {layout_size:.2f} KB")
            report.layout_json = layout
        
        if "datasource_mapping" in payload:
            logger.info(f"📝 [UPDATE] Vault mappings: {len(payload['datasource_mapping'])}")
            report.datasource_mapping = payload["datasource_mapping"]
        
        if "parameters" in payload:
            logger.info(f"📝 [UPDATE] Parameters: {len(payload.get('parameters', []))}")
            report.parameters = payload["parameters"]
        
        db.commit()
        db.refresh(report)
        
        # Verify data was saved
        verify_charts = sum(
            1 for p in report.layout_json.get("pages", [])
            for e in p.get("elements", [])
            if e.get("type") == "chart" and e.get("config", {}).get("chart_data")
        )
        logger.info(f"✅ [UPDATE] Report updated successfully. Verified charts with data: {verify_charts}")
        
        return report
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [UPDATE] Error updating report {report_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Delete a report definition."""
    try:
        report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        db.delete(report)
        db.commit()
        return {"deleted": True, "id": report_id}
    except Exception as e:
        logger.error(f"Error deleting report {report_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ─── Data Binding Endpoints (Advanced Querying) ──────────────────────────────

@router.post("/{report_id}/render-data")
def get_report_data(
    report_id: str, 
    payload: Dict[str, Any] = Body(default={}), 
    db: Session = Depends(get_db)
):
    """
    Execute all associated queries for the report elements.
    Applies report parameters to the queries dynamically.
    
    Expected payload: {
        "parameters": { "param1": "val1" },
        "element_id": "optional_specific_element",
        "config": { ... } # Optional config for temp report resolution
    }
    """
    datasource_mapping = {}
    
    if report_id == "temp-id":
        element_id = payload.get("element_id")
        config = payload.get("config")
        if element_id and config:
            datasource_mapping = {element_id: config}
    else:
        report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        datasource_mapping = report.datasource_mapping or {}
        
    results = {}
    
    # Process element mappings
    for element_id, config in datasource_mapping.items():
        if payload.get("element_id") and element_id != payload.get("element_id"):
            continue
            
        vault_id = config.get("vault_id")
        if not vault_id: continue
        
        # Get vault item for table name
        vault_item = db.query(models.DataVaultItem).filter(models.DataVaultItem.id == vault_id).first()
        if not vault_item or not vault_item.table_name: continue
        
        try:
            # Execute query via DataEngine
            element_data = DataEngine.query_vault_item(
                table_name=vault_item.table_name,
                filters=config.get("filters", []),
                group_by=config.get("group_by", []),
                aggregations=config.get("aggregations", []),
                sort_by=config.get("sort_by"),
                ascending=config.get("ascending", True),
                limit=config.get("limit")
            )
            results[element_id] = element_data
        except Exception as e:
            logger.error(f"Failed to fetch data for element {element_id} in report {report_id}: {e}")
            results[element_id] = {"error": str(e)}

    return {
        "report_id": report_id,
        "results": results
    }

@router.post("/{report_id}/export/pdf")
@router.post("/{report_id}/generate-pdf")
def export_report_pdf(report_id: str, db: Session = Depends(get_db)):

    """Trigger server-side PDF generation for a report."""
    report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    try:
        # Playwright opens the SPA preview; origin must match where the app is served.
        base_url = os.getenv("REPORT_PDF_BASE_URL", "http://127.0.0.1:8000")
        pdf_path = sync_generate_pdf(report_id, base_url)
        
        if os.path.exists(pdf_path):
            return FileResponse(
                path=pdf_path, 
                filename=f"{report.name.replace(' ', '_')}.pdf",
                media_type="application/pdf"
            )
        else:
            raise HTTPException(status_code=500, detail="PDF generation failed - file not created")
            
    except Exception as e:
        logger.error(f"PDF Export failed for report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── DIAGNOSTIC ENDPOINTS ────────────────────────────────────────────────────

@router.get("/diagnose/cache-stats")
def get_cache_stats():
    """🔍 Get current data cache statistics."""
    logger.info("🔍 [CACHE] Retrieving cache statistics")
    from services.data_processor import DataProcessor
    stats = DataProcessor.get_cache_stats()
    logger.info(f"🔍 [CACHE] Stats: {stats}")
    return {
        "status": "ok",
        "cache": stats,
        "info": "Cache stores DataFrames from uploaded files in memory for faster access"
    }

@router.post("/diagnose/cache-clear")
def clear_cache_endpoint(file_id: Optional[str] = None, db: Session = Depends(get_db)):
    """🔍 Clear data cache (optionally for a specific file)."""
    from services.data_processor import DataProcessor
    
    if file_id:
        # Find the file path from database
        try:
            file_record = db.query(models.UploadedFile).filter(models.UploadedFile.id == file_id).first()
            if file_record:
                from routers.files import resolve_stored_file_path
                file_path = resolve_stored_file_path(file_record)
                if file_path:
                    logger.info(f"🔍 [CACHE] Clearing cache for file: {file_id}")
                    result = DataProcessor.clear_cache_for_file(file_path)
                    return {
                        "status": "cleared",
                        "file_id": file_id,
                        "result": result
                    }
        except Exception as e:
            logger.error(f"🔍 [CACHE] Error clearing file cache: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        logger.info("🔍 [CACHE] Clearing all cache")
        result = DataProcessor.clear_cache()
        return {
            "status": "cleared",
            "result": result,
            "info": "All cached DataFrames have been removed from memory"
        }

@router.get("/{report_id}/diagnose")
def diagnose_report(report_id: str, db: Session = Depends(get_db)):
    """
    🔍 Diagnostic endpoint to inspect raw report data in database.
    Helps troubleshoot data persistence issues.
    """
    logger.info(f"🔍 [DIAGNOSE] Starting diagnostic for report: {report_id}")
    
    report = db.query(models.PaginatedReport).filter(models.PaginatedReport.id == report_id).first()
    if not report:
        logger.warning(f"🔍 [DIAGNOSE] Report not found: {report_id}")
        raise HTTPException(status_code=404, detail="Report not found")
    
    try:
        # Analyze layout_json
        layout = report.layout_json or {}
        pages = layout.get("pages", [])
        
        all_elements = []
        for page_idx, page in enumerate(pages):
            for el_idx, el in enumerate(page.get("elements", [])):
                all_elements.append({
                    "page": page_idx,
                    "index": el_idx,
                    "id": el.get("id"),
                    "type": el.get("type"),
                    "title": el.get("config", {}).get("title"),
                    "has_chart_data": bool(el.get("config", {}).get("chart_data")),
                    "chart_data_rows": len(el.get("config", {}).get("chart_data", [])),
                    "chart_data_size_kb": len(str(el.get("config", {}).get("chart_data", []))) / 1024,
                    "has_vault_id": bool(el.get("config", {}).get("vault_id")),
                    "vault_id": el.get("config", {}).get("vault_id"),
                })
        
        diagnosis = {
            "report_id": report.id,
            "name": report.name,
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.updated_at.isoformat() if report.updated_at else None,
            "layout_json_size_kb": len(str(report.layout_json)) / 1024,
            "datasource_mapping_size_kb": len(str(report.datasource_mapping)) / 1024,
            "pages_count": len(pages),
            "total_elements": len(all_elements),
            "elements": all_elements,
            "charts_summary": {
                "total_charts": sum(1 for el in all_elements if el["type"] == "chart"),
                "charts_with_inline_data": sum(1 for el in all_elements if el["type"] == "chart" and el["has_chart_data"]),
                "charts_with_vault_id": sum(1 for el in all_elements if el["type"] == "chart" and el["has_vault_id"]),
                "total_inline_rows": sum(el["chart_data_rows"] for el in all_elements if el["has_chart_data"]),
                "total_inline_data_size_kb": sum(el["chart_data_size_kb"] for el in all_elements if el["has_chart_data"]),
            },
            "vault_mappings_count": len(report.datasource_mapping or {}),
            "parameters_count": len(report.parameters or []),
        }
        
        logger.info(f"✅ [DIAGNOSE] Diagnostic complete for {report_id}")
        logger.info(f"📊 [DIAGNOSE] Summary: {diagnosis['charts_summary']}")
        
        return diagnosis
    
    except Exception as e:
        logger.error(f"❌ [DIAGNOSE] Error during diagnosis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Diagnostic failed: {str(e)}")
