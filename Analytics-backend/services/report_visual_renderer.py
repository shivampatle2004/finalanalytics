"""
Report Visual Renderer
======================
Dedicated rendering engine for paginated reports.

SEPARATE from the dashboard renderer.  Charts produced here are
optimised for print: correct label rotation, no overlap, no clipped
legends, no unreadable axis text.

Entry point
-----------
ReportVisualRenderer.render(df, visual_item) -> bytes | None

visual_item = {
    "id":              str,
    "title":           str,
    "visualType":      str,         # bar | line | area | pie | donut | scatter | …
    "graphDefinition": { … },       # full live graphDefinition from the dashboard
    "reportConfig":    { … },       # per-visual report overrides
}
"""

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("report_visual_renderer")

# ─── Palette (matches dashboard theme) ──────────────────────────────────────

_PRIMARY   = "#78176b"
_PALETTE   = [
    "#78176b", "#9b4d8c", "#b87aa8", "#6d28d9",
    "#0ea5e9", "#64748b", "#f59e0b", "#10b981",
    "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899",
]

# ─── Category threshold ──────────────────────────────────────────────────────

DEFAULT_CATEGORY_THRESHOLD = 20   # more than this → auto Top-N warning
DEFAULT_TOP_N               = 20

# ─── Print dimensions ────────────────────────────────────────────────────────

FULL_PAGE_W  = 10.0   # inches — A4 landscape inner width ≈ 10.5"
FULL_PAGE_H  = 5.5    # inches
HALF_PAGE_W  = 10.0
HALF_PAGE_H  = 3.2
PRINT_DPI    = 150


# ════════════════════════════════════════════════════════════════════════════
#  Low-level helpers
# ════════════════════════════════════════════════════════════════════════════

def _short(text: str, max_len: int = 16) -> str:
    s = str(text).strip().replace("\n", " ")
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


def _human_val(val) -> str:
    """Compact axis labels: 1.2B / 560M / 39K."""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return str(val)
    sign = "−" if n < 0 else ""
    n = abs(n)
    if n >= 1e12: return f"{sign}{n/1e12:.1f}T"
    if n >= 1e9:  return f"{sign}{n/1e9:.1f}B"
    if n >= 1e6:  return f"{sign}{n/1e6:.1f}M"
    if n >= 1e3:  return f"{sign}{n/1e3:.1f}K"
    if n >= 100:  return f"{sign}{n:,.0f}"
    if n >= 1:    return f"{sign}{n:,.1f}".rstrip("0").rstrip(".")
    return f"{sign}{n:.2f}"


def _apply_bi_style(ax, fig, *, grid: bool = True):
    ax.set_facecolor("#f8fafc")
    fig.patch.set_facecolor("#ffffff")
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.spines["bottom"].set_color("#e2e8f0")
    ax.spines["left"].set_color("#e2e8f0")
    ax.tick_params(axis="both", colors="#64748b", labelsize=9)
    if grid:
        ax.yaxis.grid(True, color="#e2e8f0", linestyle="-", linewidth=0.9, alpha=1)
        ax.set_axisbelow(True)
    ax.xaxis.grid(False)


# ════════════════════════════════════════════════════════════════════════════
#  Filter / drill application
# ════════════════════════════════════════════════════════════════════════════

def _apply_filter_rules(df: Any, filter_rules: List[Dict]) -> Any:
    """Apply visual filter rules (same format as frontend FilterContext)."""
    import pandas as pd
    if df is None or df.empty or not filter_rules:
        return df
    try:
        mask = pd.Series([True] * len(df), index=df.index)
        for rule in filter_rules:
            field   = rule.get("field") or rule.get("column")
            op      = str(rule.get("operator") or rule.get("condition") or "eq").lower()
            value   = rule.get("value")
            if not field or field not in df.columns or value is None:
                continue
            col = df[field]
            if op in ("eq", "=", "equals", "is"):
                mask &= col.astype(str) == str(value)
            elif op in ("neq", "!=", "not_equals", "is_not"):
                mask &= col.astype(str) != str(value)
            elif op in ("gt", ">"):
                mask &= pd.to_numeric(col, errors="coerce") > float(value)
            elif op in ("gte", ">="):
                mask &= pd.to_numeric(col, errors="coerce") >= float(value)
            elif op in ("lt", "<"):
                mask &= pd.to_numeric(col, errors="coerce") < float(value)
            elif op in ("lte", "<="):
                mask &= pd.to_numeric(col, errors="coerce") <= float(value)
            elif op in ("in", "contains"):
                vals = value if isinstance(value, list) else [value]
                mask &= col.astype(str).isin([str(v) for v in vals])
            elif op in ("not_in",):
                vals = value if isinstance(value, list) else [value]
                mask &= ~col.astype(str).isin([str(v) for v in vals])
            elif op in ("between",):
                if isinstance(value, (list, tuple)) and len(value) == 2:
                    num = pd.to_numeric(col, errors="coerce")
                    mask &= (num >= float(value[0])) & (num <= float(value[1]))
            elif op in ("startswith", "begins_with"):
                mask &= col.astype(str).str.startswith(str(value), na=False)
            elif op in ("endswith", "ends_with"):
                mask &= col.astype(str).str.endswith(str(value), na=False)
        return df[mask].copy()
    except Exception as exc:
        logger.warning("Filter application failed: %s", exc)
        return df


def _apply_drill_state(df: Any, options: Dict) -> Any:
    """Restrict the dataframe to the drill-into values."""
    import pandas as pd
    if df is None or df.empty:
        return df

    drill_path  = options.get("drillPath") or []
    drill_level = int(options.get("drillLevelIndex") or 0)
    dim_fields  = options.get("dimension_fields") or []

    if not drill_path or not dim_fields or drill_level == 0:
        return df

    try:
        for level_idx, drill_value in enumerate(drill_path):
            if level_idx >= len(dim_fields):
                break
            field = dim_fields[level_idx]
            if field in df.columns:
                df = df[df[field].astype(str) == str(drill_value)].copy()
    except Exception as exc:
        logger.warning("Drill state application failed: %s", exc)

    return df


def _apply_date_range(df: Any, date_range: Optional[Dict]) -> Any:
    """Apply a date range filter from reportConfig."""
    import pandas as pd
    if df is None or df.empty or not date_range:
        return df
    field = date_range.get("field")
    start = date_range.get("start")
    end   = date_range.get("end")
    if not field or field not in df.columns:
        return df
    try:
        col = pd.to_datetime(df[field], errors="coerce")
        mask = pd.Series([True] * len(df), index=df.index)
        if start:
            mask &= col >= pd.to_datetime(start)
        if end:
            mask &= col <= pd.to_datetime(end)
        return df[mask].copy()
    except Exception as exc:
        logger.warning("Date range filter failed: %s", exc)
        return df


def _apply_custom_filter(df: Any, custom_filter) -> Any:
    """Apply a custom filter from reportConfig (same rule format as filter_rules)."""
    if not custom_filter:
        return df
    rules = custom_filter if isinstance(custom_filter, list) else [custom_filter]
    return _apply_filter_rules(df, rules)


# ════════════════════════════════════════════════════════════════════════════
#  Aggregation via GraphEngine
# ════════════════════════════════════════════════════════════════════════════

def _aggregate_df(df: Any, graph_def: Dict) -> List[Dict]:
    """Run GraphEngine aggregation and return chart rows [{name, value, …}]."""
    try:
        from services.graph_engine import GraphEngine
        graph_type  = (graph_def.get("graph_type") or "bar").lower()
        options     = graph_def.get("options") or {}
        dim_fields  = options.get("dimension_fields") or []
        meas_fields = options.get("measure_fields") or []
        x_axis      = graph_def.get("x_axis") or (dim_fields[0] if dim_fields else None)
        y_axis      = graph_def.get("y_axis")
        aggregation = graph_def.get("aggregation") or "sum"

        # Auto-detect x_axis from dataframe columns if not explicitly set
        if not x_axis and df is not None and not df.empty:
            import pandas as pd
            # Prefer string/object columns for grouping (category axis)
            str_cols = [c for c in df.columns if df[c].dtype == object or str(df[c].dtype).startswith("str")]
            if str_cols:
                x_axis = str_cols[0]
                dim_fields = [x_axis]
            else:
                # Fall back to first column
                x_axis = df.columns[0]
                dim_fields = [x_axis]
            logger.info("_aggregate_df: auto-selected x_axis='%s' from dataframe", x_axis)

        file_id = graph_def.get("file_id") or graph_def.get("fileId")
        semantic_measures = []
        if file_id:
            try:
                from database import SessionLocal
                from models import UploadedFile, SemanticMeasure
                db = SessionLocal()
                # Primary: load from SemanticMeasure dedicated table
                sm_records = db.query(SemanticMeasure).filter(SemanticMeasure.file_id == file_id).all()
                if sm_records:
                    semantic_measures = [{"name": m.name, "expression": m.expression} for m in sm_records]
                else:
                    # Fallback: legacy model_config path
                    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
                    if file_record:
                        semantic_measures = (file_record.model_config or {}).get("measures") or []
                db.close()
            except Exception as e:
                logger.error(f"Error loading semantic measures for rendering: {e}")

        result = GraphEngine.get_aggregated_data(
            df,
            graph_type,
            x=x_axis,
            y=y_axis,
            aggregation=aggregation,
            dimension_fields=dim_fields or None,
            measure_fields=meas_fields or None,
            semantic_measures=semantic_measures,
        )

        labels = result.get("labels") or []
        values = result.get("values") or []

        rows = []
        for l, v in zip(labels, values):
            try:
                val_float = float(v) if v is not None else 0.0
            except (ValueError, TypeError):
                val_float = 0.0

            row = {
                "name": str(l) if l is not None else "",
                "value": val_float,
                "y": val_float
            }

            try:
                row["x"] = float(l) if l is not None else 0.0
            except (ValueError, TypeError):
                row["x"] = str(l) if l is not None else ""

            rows.append(row)

        return rows
    except Exception as exc:
        logger.error("GraphEngine aggregation failed: %s", exc)
        return []


# ════════════════════════════════════════════════════════════════════════════
#  Top-N / Bottom-N slicing
# ════════════════════════════════════════════════════════════════════════════

def _slice_top_bottom(
    rows: List[Dict],
    report_cfg: Dict,
) -> Tuple[List[Dict], Optional[str]]:
    """
    Apply Top-N or Bottom-N from reportConfig.
    Returns (sliced_rows, annotation_string | None).
    """
    total = len(rows)
    mode  = str(report_cfg.get("mode") or "current_state").lower()
    group = bool(report_cfg.get("groupRemaining", True))
    annotation = None

    if mode == "top_n":
        n = int(report_cfg.get("topN") or DEFAULT_TOP_N)
        n = max(1, min(n, total))
        top    = sorted(rows, key=lambda r: float(r.get("value") or 0), reverse=True)[:n]
        others = sorted(rows, key=lambda r: float(r.get("value") or 0), reverse=True)[n:]
        if others and group:
            others_val = sum(float(r.get("value") or 0) for r in others)
            top.append({"name": f"Others ({len(others)})", "value": others_val, "__others": True})
        annotation = f"Top {n} of {total} categories"
        return top, annotation

    if mode == "bottom_n":
        n = int(report_cfg.get("bottomN") or DEFAULT_TOP_N)
        n = max(1, min(n, total))
        bottom = sorted(rows, key=lambda r: float(r.get("value") or 0))[:n]
        annotation = f"Bottom {n} of {total} categories"
        return bottom, annotation

    # current_state or custom_filter — still auto-cap at threshold if overflowing
    threshold = int(report_cfg.get("categoryThreshold") or DEFAULT_CATEGORY_THRESHOLD)
    if total > threshold:
        top = sorted(rows, key=lambda r: float(r.get("value") or 0), reverse=True)[:threshold]
        others = sorted(rows, key=lambda r: float(r.get("value") or 0), reverse=True)[threshold:]
        if others and group:
            others_val = sum(float(r.get("value") or 0) for r in others)
            top.append({"name": f"Others ({len(others)})", "value": others_val, "__others": True})
        annotation = f"Top {threshold} of {total} shown — too many categories for print"
        return top, annotation

    return rows, None


def _apply_sort(rows: List[Dict], report_cfg: Dict) -> List[Dict]:
    sort_order = str(report_cfg.get("sortOrder") or "desc").lower()
    try:
        return sorted(rows, key=lambda r: float(r.get("value") or 0), reverse=(sort_order == "desc"))
    except Exception:
        return rows


# ════════════════════════════════════════════════════════════════════════════
#  Print-optimized label layout helpers
# ════════════════════════════════════════════════════════════════════════════

def _compute_x_label_rotation(labels: List[str], fig_w_in: float) -> int:
    """Choose label rotation so nothing overlaps — 0, 30, 45, or 60."""
    if not labels:
        return 0
    n      = len(labels)
    max_ch = max(len(str(l)) for l in labels)
    slot_w = fig_w_in * 72 / max(n, 1)   # points per slot
    char_w = 6                             # ~6pt per char at size 8
    if max_ch * char_w <= slot_w:
        return 0
    if max_ch * char_w * 0.71 <= slot_w:  # cos(45°)
        return 30
    if max_ch * char_w * 0.5 <= slot_w:
        return 45
    return 60


def _auto_truncate(labels: List[str], max_ch: int) -> List[str]:
    return [_short(l, max_ch) for l in labels]


# ════════════════════════════════════════════════════════════════════════════
#  Chart renderers
# ════════════════════════════════════════════════════════════════════════════

def _render_bar(rows, title, cfg, fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H, measure_meta=None) -> Optional[bytes]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib import ticker as mt

        # Formatter helper
        def format_val(v):
            if measure_meta:
                from services.semantic_measure_engine import SemanticMeasureEngine
                formatted = SemanticMeasureEngine.format_result(
                    v,
                    format_type=measure_meta.get("format", "General"),
                    decimal_places=measure_meta.get("decimal_places", 2),
                    currency=measure_meta.get("currency", "₹"),
                    display_units=measure_meta.get("display_units", "None")
                )
                return "" if formatted == "BLANK" else formatted
            else:
                return _human_val(v)

        labels = [str(r.get("name", "")) for r in rows]
        values = [float(r.get("value") or 0) for r in rows]
        n      = len(labels)

        rotation = _compute_x_label_rotation(labels, fig_w)
        max_ch   = max(6, int(fig_w * 72 / max(n, 1) / 6))
        disp_labels = _auto_truncate(labels, max_ch)

        # Increase fig height when rotation is large
        extra_h = 0.4 if rotation >= 45 else (0.2 if rotation else 0)
        fig, ax = plt.subplots(figsize=(fig_w, fig_h + extra_h), dpi=PRINT_DPI)
        _apply_bi_style(ax, fig)

        colors = [_PALETTE[i % len(_PALETTE)] for i in range(n)]
        # "Others" bars get a muted grey
        for i, r in enumerate(rows):
            if r.get("__others"):
                colors[i] = "#94a3b8"

        x_idx = list(range(n))
        ax.bar(x_idx, values, color=colors, edgecolor="white", linewidth=0.7, width=0.72, alpha=0.92)

        ax.set_xticks(x_idx)
        ax.set_xticklabels(disp_labels, rotation=rotation, ha="right" if rotation else "center", fontsize=8)
        ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda v, _: format_val(v)))

        if title:
            ax.set_title(title, fontsize=12, fontweight="600", color=_PRIMARY, pad=10)

        # Value labels on top of bars (skip if too many)
        if n <= 25:
            for xi, v in zip(x_idx, values):
                ax.text(xi, v + max(values) * 0.01, format_val(v),
                        ha="center", va="bottom", fontsize=7, color="#334155")

        fig.subplots_adjust(bottom=0.18 + extra_h * 0.1, left=0.10, right=0.97, top=0.90)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("Bar render failed: %s", exc)
        return None


def _render_line_area(rows, title, cfg, graph_type="line", fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H, measure_meta=None) -> Optional[bytes]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib import ticker as mt

        # Formatter helper
        def format_val(v):
            if measure_meta:
                from services.semantic_measure_engine import SemanticMeasureEngine
                formatted = SemanticMeasureEngine.format_result(
                    v,
                    format_type=measure_meta.get("format", "General"),
                    decimal_places=measure_meta.get("decimal_places", 2),
                    currency=measure_meta.get("currency", "₹"),
                    display_units=measure_meta.get("display_units", "None")
                )
                return "" if formatted == "BLANK" else formatted
            else:
                return _human_val(v)

        labels = [str(r.get("name", "")) for r in rows]
        values = [float(r.get("value") or 0) for r in rows]
        n      = len(labels)

        rotation = _compute_x_label_rotation(labels, fig_w)
        disp_labels = _auto_truncate(labels, max(6, int(fig_w * 72 / max(n, 1) / 6)))

        extra_h = 0.3 if rotation >= 45 else 0
        fig, ax = plt.subplots(figsize=(fig_w, fig_h + extra_h), dpi=PRINT_DPI)
        _apply_bi_style(ax, fig)

        x_idx = list(range(n))

        if graph_type == "area":
            ax.fill_between(x_idx, values, alpha=0.18, color=_PRIMARY)
            ax.plot(x_idx, values, color=_PRIMARY, linewidth=2, marker="o", markersize=4,
                    markerfacecolor="white", markeredgewidth=1.5, markeredgecolor=_PRIMARY)
        elif graph_type == "step":
            ax.step(x_idx, values, where="post", color=_PRIMARY, linewidth=2)
        else:
            ax.plot(x_idx, values, color=_PRIMARY, linewidth=2, marker="o", markersize=4,
                    markerfacecolor="white", markeredgewidth=1.5, markeredgecolor=_PRIMARY)

        ax.set_xticks(x_idx)
        ax.set_xticklabels(disp_labels, rotation=rotation, ha="right" if rotation else "center", fontsize=8)
        ax.yaxis.set_major_formatter(mt.FuncFormatter(lambda v, _: format_val(v)))

        if title:
            ax.set_title(title, fontsize=12, fontweight="600", color=_PRIMARY, pad=10)

        fig.subplots_adjust(bottom=0.18 + extra_h * 0.1, left=0.10, right=0.97, top=0.90)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("Line/area render failed: %s", exc)
        return None


def _render_pie_donut(rows, title, cfg, graph_type="pie", fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H, measure_meta=None) -> Optional[bytes]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        # Formatter helper
        def format_val(v):
            if measure_meta:
                from services.semantic_measure_engine import SemanticMeasureEngine
                formatted = SemanticMeasureEngine.format_result(
                    v,
                    format_type=measure_meta.get("format", "General"),
                    decimal_places=measure_meta.get("decimal_places", 2),
                    currency=measure_meta.get("currency", "₹"),
                    display_units=measure_meta.get("display_units", "None")
                )
                return "" if formatted == "BLANK" else formatted
            else:
                return _human_val(v)

        labels = [str(r.get("name", "")) for r in rows]
        values = [max(0.0, float(r.get("value") or 0)) for r in rows]

        # Filter zero-value slices for readability
        paired = [(l, v) for l, v in zip(labels, values) if v > 0]
        if not paired:
            return None
        labels, values = zip(*paired)

        colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(labels))]

        # Pie needs square-ish layout
        sq = min(fig_w, fig_h + 1.0)
        fig, ax = plt.subplots(figsize=(sq, sq), dpi=PRINT_DPI)
        fig.patch.set_facecolor("#ffffff")

        wedge_props = dict(edgecolor="white", linewidth=1.2)
        total = sum(values)
        autopct_fn = lambda pct: f"{pct:.1f}%\n({format_val(pct/100*total)})" if pct >= 3 else ""

        wedges, texts, autotexts = ax.pie(
            values,
            labels=None,
            autopct=autopct_fn,
            colors=colors,
            wedgeprops=wedge_props,
            startangle=90,
            pctdistance=0.80 if graph_type == "donut" else 0.75,
        )
        for at in autotexts:
            at.set_fontsize(7)
            at.set_color("#1e293b")

        if graph_type == "donut":
            circle = plt.Circle((0, 0), 0.60, fc="white")
            ax.add_artist(circle)

        ax.axis("equal")

        # Legend (outside, right side) — never overlapping
        ax.legend(
            wedges,
            [_short(l, 22) for l in labels],
            loc="center left",
            bbox_to_anchor=(1.02, 0.5),
            fontsize=7,
            frameon=False,
        )

        if title:
            ax.set_title(title, fontsize=12, fontweight="600", color=_PRIMARY, pad=10)

        fig.subplots_adjust(left=0.05, right=0.72, top=0.90, bottom=0.05)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("Pie/donut render failed: %s", exc)
        return None


def _render_radar(rows, title, cfg, fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H) -> Optional[bytes]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        labels = [str(r.get("name", "")) for r in rows]
        values = [float(r.get("value") or 0) for r in rows]
        n      = len(labels)
        if n == 0:
            return None

        # Closed loop
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
        values_closed = values + [values[0]]
        angles_closed = angles + [angles[0]]

        sq = min(fig_w, fig_h + 1.0)
        fig, ax = plt.subplots(figsize=(sq, sq), subplot_kw=dict(polar=True), dpi=PRINT_DPI)
        fig.patch.set_facecolor("#ffffff")
        ax.set_facecolor("#f8fafc")

        # Customizing axes
        plt.xticks(angles, [_short(l, 14) for l in labels], color='#64748b', size=8)
        ax.tick_params(colors="#64748b", labelsize=8)
        ax.set_rlabel_position(0)

        # Plot/Fill data
        ax.plot(angles_closed, values_closed, color=_PRIMARY, linewidth=2, linestyle='solid')
        ax.fill(angles_closed, values_closed, color=_PRIMARY, alpha=0.25)

        if title:
            ax.set_title(title, fontsize=12, fontweight="600", color=_PRIMARY, pad=10)

        fig.subplots_adjust(left=0.10, right=0.90, top=0.90, bottom=0.10)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("Radar render failed: %s", exc)
        return None


def _render_scatter(rows, title, cfg, fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H) -> Optional[bytes]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        xs = [float(r.get("x") or r.get("value") or 0) for r in rows]
        ys = [float(r.get("y") or r.get("value2") or 0) for r in rows]

        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=PRINT_DPI)
        _apply_bi_style(ax, fig)
        ax.scatter(xs, ys, color=_PRIMARY, alpha=0.72, s=40, edgecolors="white", linewidth=0.5)

        if title:
            ax.set_title(title, fontsize=12, fontweight="600", color=_PRIMARY, pad=10)
        fig.subplots_adjust(bottom=0.12, left=0.10, right=0.97, top=0.90)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("Scatter render failed: %s", exc)
        return None


def _render_no_data(title: str, reason: str, fig_w=FULL_PAGE_W, fig_h=FULL_PAGE_H) -> Optional[bytes]:
    """Render a placeholder explaining why the chart is empty."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=PRINT_DPI)
        fig.patch.set_facecolor("#ffffff")
        ax.set_facecolor("#f8fafc")
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.tick_params(left=False, bottom=False)
        ax.set_xticks([])
        ax.set_yticks([])
        ax.text(0.5, 0.55, title or "Chart", ha="center", va="center",
                fontsize=13, fontweight="600", color=_PRIMARY, transform=ax.transAxes)
        ax.text(0.5, 0.40, reason, ha="center", va="center",
                fontsize=9, color="#64748b", transform=ax.transAxes)
        return _fig_to_bytes(fig)
    except Exception as exc:
        logger.error("No-data placeholder render failed: %s", exc)
        return None


def _fig_to_bytes(fig) -> bytes:
    import matplotlib.pyplot as plt
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=PRINT_DPI, bbox_inches="tight",
                facecolor=fig.get_facecolor(), pad_inches=0.18)
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


# ════════════════════════════════════════════════════════════════════════════
#  Public API
# ════════════════════════════════════════════════════════════════════════════

class ReportVisualRenderer:
    """
    Dedicated report rendering engine.

    Usage::

        img_bytes = ReportVisualRenderer.render(df, visual_item)
        # img_bytes is a PNG or None on failure.

    visual_item schema::

        {
            "id":              str,
            "title":           str,
            "visualType":      str,       # bar|line|area|pie|donut|scatter|…
            "graphDefinition": { … },     # full live graphDefinition
            "reportConfig":    { … },     # per-visual report overrides
        }

    reportConfig keys::

        mode:               "current_state"|"top_n"|"bottom_n"|"custom_filter"|"date_range"
        topN:               int (default 20)
        bottomN:            int
        groupRemaining:     bool (default True)
        customFilter:       list[FilterRule] | None
        dateRange:          { field, start, end } | None
        sortOrder:          "asc"|"desc"
        pageLayout:         "full_page"|"half_page"|"chart_table"|"kpi_chart"
        landscapeMode:      bool
        categoryThreshold:  int (default 20)
    """

    @staticmethod
    def render(df: Any, visual_item: Dict) -> Optional[bytes]:
        """
        Full pipeline:
          1. Apply visual filters from graphDefinition.options.filters
          2. Apply drill state
          3. Apply date range / custom filter from reportConfig
          4. Aggregate via GraphEngine
          5. Apply sort + Top-N / Bottom-N
          6. Render print-optimised chart
        """
        if df is None:
            logger.warning("render: df is None")
            return None

        graph_def   = visual_item.get("graphDefinition") or {}
        report_cfg  = visual_item.get("reportConfig") or {}
        options     = graph_def.get("options") or {}
        title       = visual_item.get("title") or graph_def.get("options", {}).get("title") or ""
        visual_type = str(visual_item.get("visualType") or graph_def.get("graph_type") or "bar").lower()

        # ── 1. Visual filter rules ──────────────────────────────────────────
        filter_rules = options.get("filters") or []
        work_df = _apply_filter_rules(df.copy(), filter_rules)

        # ── 2. Drill state ─────────────────────────────────────────────────
        work_df = _apply_drill_state(work_df, options)

        # ── 3. Report config overrides ─────────────────────────────────────
        mode = str(report_cfg.get("mode") or "current_state").lower()
        if mode == "date_range":
            work_df = _apply_date_range(work_df, report_cfg.get("dateRange"))
        elif mode == "custom_filter":
            work_df = _apply_custom_filter(work_df, report_cfg.get("customFilter"))

        # ── 4. Aggregate ────────────────────────────────────────────────────
        rows = _aggregate_df(work_df, graph_def)

        if not rows:
            logger.warning("render: no data rows for visual '%s'", title)
            return _render_no_data(title, "No data after applying filters and drill state.")

        # ── 5. Sort + Top-N/Bottom-N ────────────────────────────────────────
        sort_order = str(report_cfg.get("sortOrder") or "desc").lower()
        # Sort unless the chart type implies a natural order (line/step/area = time series)
        if visual_type not in ("line", "step", "area"):
            rows = _apply_sort(rows, report_cfg)

        rows, annotation = _slice_top_bottom(rows, report_cfg)

        if annotation:
            logger.info("render: annotation for '%s' — %s", title, annotation)

        # If annotated title needed, append note to title
        display_title = title
        if annotation:
            display_title = f"{title}\n({annotation})" if title else annotation

        # ── 6. Page dimensions ──────────────────────────────────────────────
        page_layout     = str(report_cfg.get("pageLayout") or "full_page").lower()
        landscape_mode  = bool(report_cfg.get("landscapeMode", False))
        if page_layout == "half_page":
            fig_w, fig_h = HALF_PAGE_W, HALF_PAGE_H
        else:
            fig_w, fig_h = FULL_PAGE_W, FULL_PAGE_H
        if landscape_mode:
            fig_w, fig_h = max(fig_w, 12.0), max(fig_h, 7.0)

        measure_meta = visual_item.get("measure_meta")

        # ── 7. Dispatch to type-specific renderer ───────────────────────────
        if visual_type in ("bar", "column"):
            return _render_bar(rows, display_title, report_cfg, fig_w, fig_h, measure_meta=measure_meta)

        if visual_type in ("line",):
            return _render_line_area(rows, display_title, report_cfg, "line", fig_w, fig_h, measure_meta=measure_meta)

        if visual_type == "step":
            return _render_line_area(rows, display_title, report_cfg, "step", fig_w, fig_h, measure_meta=measure_meta)

        if visual_type == "area":
            return _render_line_area(rows, display_title, report_cfg, "area", fig_w, fig_h, measure_meta=measure_meta)

        if visual_type == "pie":
            return _render_pie_donut(rows, display_title, report_cfg, "pie", fig_w, fig_h, measure_meta=measure_meta)

        if visual_type == "donut":
            return _render_pie_donut(rows, display_title, report_cfg, "donut", fig_w, fig_h, measure_meta=measure_meta)

        if visual_type == "scatter":
            return _render_scatter(rows, display_title, report_cfg, fig_w, fig_h)

        if visual_type == "radar":
            return _render_radar(rows, display_title, report_cfg, fig_w, fig_h)

        # Histogram, treemap, waterfall, etc. → fall back to bar
        logger.info("render: '%s' type not specialised — falling back to bar", visual_type)
        return _render_bar(rows, display_title, report_cfg, fig_w, fig_h, measure_meta=measure_meta)

    @staticmethod
    def has_large_dataset(df: Any, visual_item: Dict) -> bool:
        """
        Quick pre-check: does this visual exceed the category threshold?
        Useful for frontend warnings before PDF generation.
        """
        graph_def = visual_item.get("graphDefinition") or {}
        report_cfg = visual_item.get("reportConfig") or {}
        threshold = int(report_cfg.get("categoryThreshold") or DEFAULT_CATEGORY_THRESHOLD)
        try:
            options   = graph_def.get("options") or {}
            dim       = (options.get("dimension_fields") or [graph_def.get("x_axis")])[0]
            if dim and dim in df.columns:
                n = df[dim].nunique()
                return n > threshold
        except Exception:
            pass
        return False
