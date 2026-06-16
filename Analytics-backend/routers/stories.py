"""
stories.py — Story Mode API Router
Tableau-style analytical narrative system.

Endpoints:
  GET    /api/stories                  List all stories (optionally by file_id)
  POST   /api/stories                  Create a story
  GET    /api/stories/{id}             Get single story with all points
  PUT    /api/stories/{id}             Update story metadata
  DELETE /api/stories/{id}             Delete story + all points

  GET    /api/stories/{id}/points      List story points (ordered)
  POST   /api/stories/{id}/points      Add a new story point
  PUT    /api/stories/{id}/points/{pid}  Update a story point
  DELETE /api/stories/{id}/points/{pid}  Delete a story point
  POST   /api/stories/{id}/points/reorder  Reorder all points

  POST   /api/stories/{id}/export/pdf   Export story as PDF
  POST   /api/stories/{id}/export/pptx  Export story as PowerPoint
  GET    /api/stories/{id}/present      Fetch presentation-ready payload
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from datetime import datetime
import io
import uuid

from database import SessionLocal
import models
from models import Story, StoryPoint

router = APIRouter(prefix="/api/stories", tags=["stories"])


# ── DB dependency ─────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Serialisers ───────────────────────────────────────────────────────────────

def _point_dict(p: StoryPoint) -> Dict[str, Any]:
    return {
        "id": p.id,
        "story_id": p.story_id,
        "title": p.title,
        "description": p.description,
        "narrative": p.narrative,
        "sort_order": p.sort_order,
        "dashboard_id": p.dashboard_id,
        "page_id": p.page_id,
        "bookmark_id": p.bookmark_id,
        "filters": p.filters or [],
        "slicers": p.slicers or {},
        "drill_state": p.drill_state or {},
        "visual_selections": p.visual_selections or {},
        "active_visuals": p.active_visuals or [],
        "snapshot_url": p.snapshot_url,
        "snapshot_data": p.snapshot_data or {},
        "transition": p.transition or "fade",
        "duration": p.duration or 3000,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _story_dict(s: Story, include_points: bool = True) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "id": s.id,
        "file_id": s.file_id,
        "user_id": s.user_id,
        "name": s.name,
        "description": s.description,
        "tags": s.tags or [],
        "theme": s.theme or "default",
        "is_published": s.is_published or False,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "point_count": len(s.points) if s.points is not None else 0,
    }
    if include_points:
        data["points"] = [_point_dict(p) for p in sorted(s.points, key=lambda x: x.sort_order)]
    return data


# ── Story CRUD ────────────────────────────────────────────────────────────────

@router.get("")
def list_stories(
    file_id: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """List all stories, optionally filtered by file or user."""
    q = db.query(Story)
    if file_id:
        q = q.filter(Story.file_id == file_id)
    if user_id:
        q = q.filter(Story.user_id == user_id)
    stories = q.order_by(Story.updated_at.desc()).all()
    return {"stories": [_story_dict(s, include_points=False) for s in stories], "total": len(stories)}


@router.post("", status_code=201)
def create_story(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Create a new story. Optionally seed with first story point."""
    if not payload.get("name", "").strip():
        raise HTTPException(status_code=400, detail="Story name is required.")

    story = Story(
        id=str(uuid.uuid4()),
        file_id=payload.get("file_id"),
        user_id=payload.get("user_id"),
        name=payload["name"].strip(),
        description=payload.get("description"),
        tags=payload.get("tags", []),
        theme=payload.get("theme", "default"),
        is_published=bool(payload.get("is_published", False)),
    )
    db.add(story)

    # Optional: seed with initial story point from payload
    initial_point = payload.get("initial_point")
    if initial_point and isinstance(initial_point, dict):
        sp = StoryPoint(
            id=str(uuid.uuid4()),
            story_id=story.id,
            title=initial_point.get("title", "Introduction"),
            description=initial_point.get("description"),
            narrative=initial_point.get("narrative"),
            sort_order=0,
            dashboard_id=initial_point.get("dashboard_id"),
            page_id=initial_point.get("page_id"),
            bookmark_id=initial_point.get("bookmark_id"),
            filters=initial_point.get("filters", []),
            slicers=initial_point.get("slicers", {}),
            drill_state=initial_point.get("drill_state", {}),
            visual_selections=initial_point.get("visual_selections", {}),
            active_visuals=initial_point.get("active_visuals", []),
            snapshot_url=initial_point.get("snapshot_url"),
            snapshot_data=initial_point.get("snapshot_data", {}),
            transition=initial_point.get("transition", "fade"),
            duration=initial_point.get("duration", 3000),
        )
        db.add(sp)

    db.commit()
    db.refresh(story)
    return _story_dict(story)


@router.get("/{story_id}")
def get_story(story_id: str, db: Session = Depends(get_db)):
    """Get a single story with all its story points."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return _story_dict(story)


@router.put("/{story_id}")
def update_story(story_id: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Update story metadata (name, description, tags, theme, is_published)."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if "name" in payload and payload["name"].strip():
        story.name = payload["name"].strip()
    if "description" in payload:
        story.description = payload["description"]
    if "tags" in payload:
        story.tags = payload["tags"]
    if "theme" in payload:
        story.theme = payload["theme"]
    if "is_published" in payload:
        story.is_published = bool(payload["is_published"])

    db.commit()
    db.refresh(story)
    return _story_dict(story)


@router.delete("/{story_id}")
def delete_story(story_id: str, db: Session = Depends(get_db)):
    """Delete a story and all its story points (CASCADE)."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    db.delete(story)
    db.commit()
    return {"deleted": True, "id": story_id}


# ── Story Point CRUD ──────────────────────────────────────────────────────────

@router.get("/{story_id}/points")
def list_story_points(story_id: str, db: Session = Depends(get_db)):
    """List all story points for a story, ordered by sort_order."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    points = sorted(story.points, key=lambda p: p.sort_order)
    return {"points": [_point_dict(p) for p in points]}


@router.post("/{story_id}/points", status_code=201)
def add_story_point(story_id: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Add a new story point. sort_order defaults to last position."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Determine next sort_order
    existing_orders = [p.sort_order for p in story.points]
    next_order = (max(existing_orders) + 1) if existing_orders else 0

    sp = StoryPoint(
        id=str(uuid.uuid4()),
        story_id=story_id,
        title=payload.get("title", f"Story Point {next_order + 1}"),
        description=payload.get("description"),
        narrative=payload.get("narrative"),
        sort_order=payload.get("sort_order", next_order),
        dashboard_id=payload.get("dashboard_id"),
        page_id=payload.get("page_id"),
        bookmark_id=payload.get("bookmark_id"),
        filters=payload.get("filters", []),
        slicers=payload.get("slicers", {}),
        drill_state=payload.get("drill_state", {}),
        visual_selections=payload.get("visual_selections", {}),
        active_visuals=payload.get("active_visuals", []),
        snapshot_url=payload.get("snapshot_url"),
        snapshot_data=payload.get("snapshot_data", {}),
        transition=payload.get("transition", "fade"),
        duration=payload.get("duration", 3000),
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return _point_dict(sp)


@router.put("/{story_id}/points/{point_id}")
def update_story_point(
    story_id: str, point_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Update any fields of a story point."""
    sp = db.query(StoryPoint).filter(
        StoryPoint.id == point_id,
        StoryPoint.story_id == story_id
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Story point not found")

    updatable = [
        "title", "description", "narrative", "sort_order", "dashboard_id",
        "page_id", "bookmark_id", "filters", "slicers", "drill_state",
        "visual_selections", "active_visuals", "snapshot_url", "snapshot_data",
        "transition", "duration",
    ]
    for field in updatable:
        if field in payload:
            setattr(sp, field, payload[field])

    db.commit()
    db.refresh(sp)
    return _point_dict(sp)


@router.delete("/{story_id}/points/{point_id}")
def delete_story_point(story_id: str, point_id: str, db: Session = Depends(get_db)):
    """Delete a single story point."""
    sp = db.query(StoryPoint).filter(
        StoryPoint.id == point_id,
        StoryPoint.story_id == story_id
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Story point not found")
    db.delete(sp)
    db.commit()
    return {"deleted": True, "id": point_id}


@router.post("/{story_id}/points/reorder")
def reorder_story_points(
    story_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """
    Reorder story points.
    Payload: { "order": ["point_id_1", "point_id_2", ...] }
    """
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    order: List[str] = payload.get("order", [])
    if not order:
        raise HTTPException(status_code=400, detail="order array is required")

    points_map = {p.id: p for p in story.points}
    for idx, pid in enumerate(order):
        if pid in points_map:
            points_map[pid].sort_order = idx

    db.commit()

    # Return updated points
    points = sorted(story.points, key=lambda p: p.sort_order)
    return {"points": [_point_dict(p) for p in points]}


@router.post("/{story_id}/points/{point_id}/duplicate")
def duplicate_story_point(story_id: str, point_id: str, db: Session = Depends(get_db)):
    """Duplicate a story point, inserting it right after the original."""
    original = db.query(StoryPoint).filter(
        StoryPoint.id == point_id,
        StoryPoint.story_id == story_id
    ).first()
    if not original:
        raise HTTPException(status_code=404, detail="Story point not found")

    # Shift all points after original down by 1
    db.query(StoryPoint).filter(
        StoryPoint.story_id == story_id,
        StoryPoint.sort_order > original.sort_order
    ).update({"sort_order": StoryPoint.sort_order + 1}, synchronize_session=False)

    copy = StoryPoint(
        id=str(uuid.uuid4()),
        story_id=story_id,
        title=f"{original.title} (Copy)",
        description=original.description,
        narrative=original.narrative,
        sort_order=original.sort_order + 1,
        dashboard_id=original.dashboard_id,
        page_id=original.page_id,
        bookmark_id=original.bookmark_id,
        filters=original.filters,
        slicers=original.slicers,
        drill_state=original.drill_state,
        visual_selections=original.visual_selections,
        active_visuals=original.active_visuals,
        snapshot_url=original.snapshot_url,
        snapshot_data=original.snapshot_data,
        transition=original.transition,
        duration=original.duration,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _point_dict(copy)


# ── Presentation payload ──────────────────────────────────────────────────────

@router.get("/{story_id}/present")
def get_presentation_payload(story_id: str, db: Session = Depends(get_db)):
    """
    Return a presentation-ready payload with all story points ordered,
    including their full analytical state for restoring on the dashboard.
    """
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    points = sorted(story.points, key=lambda p: p.sort_order)
    return {
        "story": {
            "id": story.id,
            "name": story.name,
            "description": story.description,
            "theme": story.theme,
            "total_points": len(points),
        },
        "points": [_point_dict(p) for p in points],
    }


# ── Export: PDF ───────────────────────────────────────────────────────────────

@router.post("/{story_id}/export/pdf")
def export_story_pdf(
    story_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Export a Story as a PDF — one page per story point.
    Uses the existing PaginatedReportEngine.
    Payload options: { orientation, page_size }
    """
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    points = sorted(story.points, key=lambda p: p.sort_order)

    try:
        from services.paginated_report_engine import PaginatedReportEngine

        orientation = payload.get("orientation", "landscape")
        page_size = payload.get("page_size", "A4")

        elements = []
        for idx, pt in enumerate(points):
            # Title block
            elements.append({
                "type": "text",
                "config_json": {
                    "content": pt.title or f"Point {idx + 1}",
                    "font_size": 18,
                    "bold": True,
                    "one_per_page": True,
                },
            })
            # Narrative text
            if pt.narrative:
                elements.append({
                    "type": "text",
                    "config_json": {
                        "content": pt.narrative,
                        "font_size": 11,
                        "one_per_page": False,
                    },
                })
            # Snapshot image (if captured)
            if pt.snapshot_url and pt.snapshot_url.startswith("data:image"):
                # Strip prefix
                b64_data = pt.snapshot_url.split(",", 1)[-1]
                import base64
                img_bytes = base64.b64decode(b64_data)
                elements.append({
                    "type": "visual",
                    "config_json": {
                        "title": pt.title,
                        "image_bytes": img_bytes,
                        "one_per_page": False,
                        "max_height": 5.6 * 72,  # Allow story snapshots to fill the page
                    },
                })

        config = {
            "page_size": page_size,
            "orientation": orientation,
            "header_text": story.name,
            "include_summary": False,
            "include_chart": False,
            "rows_per_page": 50,
        }

        def null_provider(_):
            return []

        pdf_bytes = PaginatedReportEngine.generate_pdf(config, elements, null_provider)

        if not pdf_bytes or len(pdf_bytes) < 100:
            return JSONResponse(status_code=500, content={"error": "PDF generation failed."})

        safe_name = story.name.replace(" ", "_").replace("/", "-")
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


# ── Export: PPTX ──────────────────────────────────────────────────────────────

@router.post("/{story_id}/export/pptx")
def export_story_pptx(
    story_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Export a Story as a PowerPoint file — one slide per story point.
    Uses python-pptx if available, otherwise falls back to PDF.
    """
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    points = sorted(story.points, key=lambda p: p.sort_order)

    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt, Emu
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN
        import base64

        prs = Presentation()
        prs.slide_width = Inches(13.33)
        prs.slide_height = Inches(7.5)

        # Brand colors
        PURPLE = RGBColor(0x7A, 0x1E, 0x3A)
        WHITE = RGBColor(0xFF, 0xFF, 0xFF)
        LIGHT_GRAY = RGBColor(0xF5, 0xF5, 0xF5)
        DARK_TEXT = RGBColor(0x33, 0x33, 0x33)

        blank_layout = prs.slide_layouts[6]  # completely blank

        # ── Title slide ──────────────────────────────────────────────────────
        slide = prs.slides.add_slide(blank_layout)

        # Background rectangle
        bg = slide.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = PURPLE
        bg.line.fill.background()

        # Story title
        title_box = slide.shapes.add_textbox(Inches(1), Inches(2.5), Inches(11.33), Inches(1.5))
        tf = title_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = story.name
        run.font.size = Pt(40)
        run.font.color.rgb = WHITE
        run.font.bold = True

        if story.description:
            desc_box = slide.shapes.add_textbox(Inches(2), Inches(4.2), Inches(9.33), Inches(1))
            tf2 = desc_box.text_frame
            tf2.word_wrap = True
            p2 = tf2.paragraphs[0]
            p2.alignment = PP_ALIGN.CENTER
            run2 = p2.add_run()
            run2.text = story.description
            run2.font.size = Pt(16)
            run2.font.color.rgb = RGBColor(0xCC, 0xAA, 0xBB)

        # Total points indicator
        count_box = slide.shapes.add_textbox(Inches(5), Inches(5.5), Inches(3.33), Inches(0.5))
        tf3 = count_box.text_frame
        p3 = tf3.paragraphs[0]
        p3.alignment = PP_ALIGN.CENTER
        run3 = p3.add_run()
        run3.text = f"{len(points)} story point{'s' if len(points) != 1 else ''}"
        run3.font.size = Pt(13)
        run3.font.color.rgb = RGBColor(0xDD, 0xCC, 0xDD)

        # ── One slide per story point ────────────────────────────────────────
        for idx, pt in enumerate(points):
            slide = prs.slides.add_slide(blank_layout)

            # Light background
            bg = slide.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
            bg.fill.solid()
            bg.fill.fore_color.rgb = LIGHT_GRAY
            bg.line.fill.background()

            # Purple header bar
            header_bar = slide.shapes.add_shape(1, 0, 0, prs.slide_width, Inches(1.1))
            header_bar.fill.solid()
            header_bar.fill.fore_color.rgb = PURPLE
            header_bar.line.fill.background()

            # Slide number
            num_box = slide.shapes.add_textbox(Inches(11.5), Inches(0.15), Inches(1.5), Inches(0.6))
            tf = num_box.text_frame
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT
            run = p.add_run()
            run.text = f"{idx + 1} / {len(points)}"
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(0xCC, 0xAA, 0xBB)

            # Story name (sub-label)
            storyname_box = slide.shapes.add_textbox(Inches(0.3), Inches(0.15), Inches(7), Inches(0.4))
            tf_sn = storyname_box.text_frame
            p_sn = tf_sn.paragraphs[0]
            run_sn = p_sn.add_run()
            run_sn.text = story.name
            run_sn.font.size = Pt(10)
            run_sn.font.color.rgb = RGBColor(0xDD, 0xBB, 0xCC)

            # Point title
            title_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.3), Inches(10), Inches(0.7))
            tf_t = title_box.text_frame
            p_t = tf_t.paragraphs[0]
            run_t = p_t.add_run()
            run_t.text = pt.title or f"Point {idx + 1}"
            run_t.font.size = Pt(24)
            run_t.font.bold = True
            run_t.font.color.rgb = WHITE

            has_snapshot = bool(pt.snapshot_url and pt.snapshot_url.startswith("data:image"))

            if has_snapshot:
                # Image on right two-thirds
                b64_data = pt.snapshot_url.split(",", 1)[-1]
                img_bytes = base64.b64decode(b64_data)
                img_stream = io.BytesIO(img_bytes)
                slide.shapes.add_picture(img_stream, Inches(4.5), Inches(1.3), Inches(8.5), Inches(5.8))

                # Narrative on left third
                if pt.narrative:
                    narr_box = slide.shapes.add_textbox(Inches(0.3), Inches(1.3), Inches(3.8), Inches(5.8))
                    tf_n = narr_box.text_frame
                    tf_n.word_wrap = True
                    p_n = tf_n.paragraphs[0]
                    run_n = p_n.add_run()
                    run_n.text = pt.narrative
                    run_n.font.size = Pt(12)
                    run_n.font.color.rgb = DARK_TEXT
            else:
                # Full-width narrative
                if pt.narrative:
                    narr_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.4), Inches(12.3), Inches(5.5))
                    tf_n = narr_box.text_frame
                    tf_n.word_wrap = True
                    p_n = tf_n.paragraphs[0]
                    run_n = p_n.add_run()
                    run_n.text = pt.narrative
                    run_n.font.size = Pt(14)
                    run_n.font.color.rgb = DARK_TEXT

            # Filters metadata strip at bottom
            if pt.filters:
                filter_strs = []
                for f in pt.filters[:4]:
                    col = f.get("column", "")
                    op = f.get("operator", "=")
                    val = f.get("value", "")
                    filter_strs.append(f"{col} {op} {val}")
                filter_label = "  ·  ".join(filter_strs)
                meta_box = slide.shapes.add_textbox(Inches(0.3), Inches(7.1), Inches(12.7), Inches(0.3))
                tf_m = meta_box.text_frame
                p_m = tf_m.paragraphs[0]
                run_m = p_m.add_run()
                run_m.text = f"Filters: {filter_label}"
                run_m.font.size = Pt(9)
                run_m.font.color.rgb = RGBColor(0x88, 0x88, 0x88)

        # ── Save to bytes buffer ─────────────────────────────────────────────
        buf = io.BytesIO()
        prs.save(buf)
        buf.seek(0)

        safe_name = story.name.replace(" ", "_").replace("/", "-")
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pptx"'},
        )

    except ImportError:
        # python-pptx not installed — fall back to PDF
        return JSONResponse(
            status_code=501,
            content={"error": "python-pptx is not installed. Install it with: pip install python-pptx"},
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
