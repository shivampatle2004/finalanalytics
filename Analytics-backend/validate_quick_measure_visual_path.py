"""Validate Quick Measure UI payloads through GraphEngine and card rendering.

This checks the path used when BIQuickMeasurePanel adds a KPI card:
UI payload -> GraphEngine.get_aggregated_data() -> DynamicChart KPI value handling.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from validate_quick_measures import FIELD_MAPPINGS, build_test_data, normalize
from services.graph_engine import GraphEngine
from services.quick_measure_engine import QuickMeasureEngine, TEMPLATE_CATALOGUE


REPORT_PATH = Path(__file__).with_name("quick_measure_visual_path_report.md")

REQUIRED_AGGREGATION_MAPPINGS = [
    "sum",
    "average",
    "count",
    "distinct_count",
    "median",
    "mode",
    "weighted_average",
    "std_dev",
    "variance_population",
    "stddev_population",
    "percentile",
    "quartile",
    "covariance",
    "correlation",
    "percentage",
    "ratio",
    "division",
    "variance",
    "percentage_change",
]

REQUIRED_GROUP_BEHAVIOR = [
    "category grouping",
    "ranking",
    "top_n",
    "rank_dense",
    "rank_ascending",
    "rank_descending",
]

REQUIRED_TIME_INTELLIGENCE = [
    "ytd",
    "qtd",
    "mtd",
    "previous_month",
    "previous_year",
    "rolling_3_month",
    "rolling_6_month",
    "rolling_12_month",
    "month_over_month",
    "quarter_over_quarter",
    "same_period_last_year",
    "growth_percent",
    "yoy_change",
    "cagr",
]

CATEGORY_OUTPUT_TEMPLATES = {
    "top_n",
    "rank",
    "rank_dense",
    "rank_ascending",
    "rank_descending",
}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)):
            return None
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return to_jsonable(value.item())
        except Exception:
            pass
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def markdown_value(value: Any) -> str:
    text = json.dumps(to_jsonable(normalize(value)), sort_keys=True, default=str)
    return "`" + text.replace("|", "\\|") + "`"


def primary_field_from_ui_config(config: Dict[str, Any]) -> str:
    """Mirror BIWorkspace.jsx onAddMeasure primary-field extraction."""
    for key in ["value_field", "numerator", "actual_field", "current_field", "part_field", "field"]:
        value = config.get(key)
        if value:
            return str(value)

    for key, value in config.items():
        if key != "date_field" and value and isinstance(value, str):
            return value

    values = list(config.values())
    return str(values[0]) if values else ""


def build_ui_measure(template_id: str, mapping: Dict[str, Any]) -> Dict[str, Any]:
    tmpl = TEMPLATE_CATALOGUE[template_id]
    formula, _ = QuickMeasureEngine.generate_formula(template_id, mapping)
    return {
        "id": f"qm-{template_id}",
        "name": f"Quick {tmpl['label']}",
        "formula": formula,
        "type": "quick_measure",
        "aggregation": tmpl.get("aggregation", "sum"),
        "template_id": template_id,
        "config": dict(mapping),
    }


def build_ui_visual_payload(template_id: str, mapping: Dict[str, Any]) -> Dict[str, Any]:
    measure = build_ui_measure(template_id, mapping)
    primary_field = primary_field_from_ui_config(measure["config"])
    category_field = str(measure["config"].get("category_field") or "")
    renders_by_category = template_id in CATEGORY_OUTPUT_TEMPLATES and bool(category_field)
    measure_fields = []
    if primary_field:
        measure_fields.append(
            {
                "column": primary_field,
                "aggregation": str(measure.get("aggregation") or "sum").upper(),
                "template_id": measure["template_id"],
                "field_mappings": measure["config"],
            }
        )

    return {
        "id": f"graph-{template_id}",
        "graph_type": "bar" if renders_by_category else "kpiCard",
        "x_axis": category_field if renders_by_category else "",
        "y_axis": primary_field,
        "aggregation": measure.get("aggregation") or "sum",
        "options": {
            "title": measure["name"],
            "measureName": measure["name"],
            "measureFormula": measure["formula"],
            **({"dimension_fields": [category_field]} if renders_by_category else {}),
            "measure_fields": measure_fields,
        },
        "cached_data": None,
    }


def execute_graph_path(df: pd.DataFrame, payload: Dict[str, Any]) -> Dict[str, Any]:
    return GraphEngine.get_aggregated_data(
        df,
        payload["graph_type"],
        payload["x_axis"],
        payload["y_axis"],
        payload["aggregation"],
        payload["options"].get("dimension_fields", []),
        payload["options"].get("measure_fields", []),
    )


def extract_graph_measure_result(graph_output: Dict[str, Any]) -> Any:
    values = graph_output.get("values")
    if isinstance(values, list) and len(values) == 1:
        labels = graph_output.get("labels") or []
        if labels and labels[0] != "Total":
            return {str(labels[0]): values[0]}
        return values[0]
    if isinstance(values, list):
        labels = graph_output.get("labels") or []
        return {str(label): value for label, value in zip(labels, values)}
    return None


def dynamic_chart_kpi_total_value(graph_output: Dict[str, Any]) -> Any:
    """Simulate DynamicChart.jsx KPI totalValue reducer for cached labels/values."""
    labels = graph_output.get("labels") or []
    values = graph_output.get("values") or []
    chart_data = [{"name": label, "value": values[i] if i < len(values) else None} for i, label in enumerate(labels)]
    if len(chart_data) > 1:
        return {str(entry.get("name")): entry.get("value") for entry in chart_data}
    if len(chart_data) == 1:
        if str(chart_data[0].get("name")) != "Total":
            return {str(chart_data[0].get("name")): chart_data[0].get("value")}
        return chart_data[0].get("value")
    total: Any = 0
    for entry in chart_data:
        value = entry.get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            total += value
    return total


def is_render_value_valid(expected: Any, rendered: Any) -> bool:
    return normalize(expected) == normalize(rendered)


def result_matches(expected: Any, actual: Any) -> bool:
    return normalize(expected) == normalize(actual)


def group_by_check(df: pd.DataFrame, template_id: str, mapping: Dict[str, Any]) -> Dict[str, Any]:
    qm = QuickMeasureEngine.execute_measure(df, template_id, mapping, "Category")
    if qm.get("error"):
        return {"status": "FAIL", "error": qm["error"], "quick_measure": None, "graph_engine": None}

    graph = GraphEngine.get_aggregated_data(
        df,
        "bar",
        "Category",
        primary_field_from_ui_config(mapping),
        TEMPLATE_CATALOGUE[template_id].get("aggregation", "sum"),
        ["Category"],
        [
            {
                "column": primary_field_from_ui_config(mapping),
                "aggregation": str(TEMPLATE_CATALOGUE[template_id].get("aggregation", "sum")).upper(),
                "template_id": template_id,
                "field_mappings": mapping,
            }
        ],
    )
    graph_result = extract_graph_measure_result(graph)
    match = result_matches(qm.get("result"), graph_result)
    return {
        "status": "PASS" if match else "FAIL",
        "error": None if match else "Grouped GraphEngine path does not match grouped QuickMeasureEngine output.",
        "quick_measure": qm.get("result"),
        "graph_engine": graph_result,
    }


def root_cause(template_id: str, expected: Any, graph_result: Any, graph_output: Dict[str, Any], render_ok: bool) -> str:
    if graph_output.get("error"):
        return f"GraphEngine returned error: {graph_output['error']}"
    if not result_matches(expected, graph_result):
        return "GraphEngine output does not preserve the QuickMeasureEngine calculated result."
    if isinstance(expected, dict) and not render_ok:
        return "DynamicChart KPI card sums cached values numerically; dictionary quick-measure results render as a raw object/string instead of category/value rows."
    if not render_ok:
        return "DynamicChart KPI card rendered value does not match the calculated measure result."
    return ""


def fix_for(template_id: str, expected: Any, render_ok: bool) -> str:
    if isinstance(expected, dict) and not render_ok:
        return (
            "When QuickMeasureEngine returns a dict, GraphEngine should emit labels/values per key "
            "or the UI should render a table/ranking visual instead of a scalar KPI card."
        )
    if not render_ok:
        return "Keep card rendering on the GraphEngine calculated value, not raw source values or a fallback sum."
    return ""


def run_validation() -> int:
    df = build_test_data()
    rows: List[Dict[str, Any]] = []
    details: List[Dict[str, Any]] = []
    unsupported: List[str] = []
    missing_mappings: List[str] = []
    graph_mismatches = 0
    visual_mismatches = 0
    passed = 0
    failed = 0

    for template_id in TEMPLATE_CATALOGUE:
        mapping = FIELD_MAPPINGS.get(template_id)
        if mapping is None:
            missing_mappings.append(template_id)
            failed += 1
            rows.append(
                {
                    "template": template_id,
                    "graph_result": None,
                    "quick_result": None,
                    "match": False,
                    "status": "MISSING_MAPPING",
                }
            )
            continue

        payload = build_ui_visual_payload(template_id, mapping)
        quick = QuickMeasureEngine.execute_measure(df, template_id, mapping)
        graph_output = execute_graph_path(df, payload)
        quick_result = quick.get("result")
        graph_result = extract_graph_measure_result(graph_output)
        graph_match = quick.get("error") is None and result_matches(quick_result, graph_result)

        rendered_value: Any = None
        render_error: Optional[str] = None
        try:
            rendered_value = dynamic_chart_kpi_total_value(graph_output)
            render_ok = graph_match and is_render_value_valid(quick_result, rendered_value)
        except Exception as exc:
            render_error = str(exc)
            render_ok = False

        status = "PASS" if graph_match and render_ok else "FAIL"
        if status == "PASS":
            passed += 1
        else:
            failed += 1
        if not graph_match:
            graph_mismatches += 1
        if not render_ok:
            visual_mismatches += 1

        if quick.get("error"):
            unsupported.append(template_id)

        row = {
            "template": template_id,
            "graph_result": graph_result,
            "quick_result": quick_result,
            "match": graph_match and render_ok,
            "status": status,
        }
        rows.append(row)

        if status != "PASS":
            details.append(
                {
                    "template": template_id,
                    "payload": payload,
                    "graph_output": graph_output,
                    "quick_output": quick,
                    "rendered_value": rendered_value,
                    "render_error": render_error,
                    "root_cause": root_cause(template_id, quick_result, graph_result, graph_output, render_ok),
                    "fix": fix_for(template_id, quick_result, render_ok),
                }
            )

    aggregation_status = {
        agg: "PASS" if agg in TEMPLATE_CATALOGUE and agg not in missing_mappings and agg not in unsupported else "FAIL"
        for agg in REQUIRED_AGGREGATION_MAPPINGS
    }

    group_checks = {
        "category grouping": group_by_check(df, "sum", FIELD_MAPPINGS["sum"]),
        "ranking": group_by_check(df, "rank", FIELD_MAPPINGS["rank"]),
        "top_n": group_by_check(df, "top_n", FIELD_MAPPINGS["top_n"]),
        "rank_dense": group_by_check(df, "rank_dense", FIELD_MAPPINGS["rank_dense"]),
        "rank_ascending": group_by_check(df, "rank_ascending", FIELD_MAPPINGS["rank_ascending"]),
        "rank_descending": group_by_check(df, "rank_descending", FIELD_MAPPINGS["rank_descending"]),
    }

    time_status = {
        tid: rows[[r["template"] for r in rows].index(tid)]["status"] if tid in TEMPLATE_CATALOGUE else "MISSING"
        for tid in REQUIRED_TIME_INTELLIGENCE
    }

    lines = [
        "# Quick Measure Visualization Path Validation Report",
        "",
        "Validated path: UI Payload -> GraphEngine -> Visualization Layer against QuickMeasureEngine.execute_measure().",
        "",
        "## Summary",
        "",
        f"- **Total templates**: {len(TEMPLATE_CATALOGUE)}",
        f"- **Total tested**: {len(rows) - len(missing_mappings)}",
        f"- **Passed**: {passed}",
        f"- **Failed**: {failed}",
        f"- **GraphEngine mismatches**: {graph_mismatches}",
        f"- **Visualization mismatches**: {visual_mismatches}",
        f"- **Missing mappings**: {', '.join(missing_mappings) if missing_mappings else 'None'}",
        f"- **Unsupported measures**: {', '.join(unsupported) if unsupported else 'None'}",
        "",
        "## Results",
        "",
        "| Template | GraphEngine Result | QuickMeasure Result | Match | Status |",
        "| -------- | ------------------ | ------------------- | ----- | ------ |",
    ]
    for row in rows:
        lines.append(
            f"| {row['template']} | {markdown_value(row['graph_result'])} | {markdown_value(row['quick_result'])} "
            f"| {'YES' if row['match'] else 'NO'} | **{row['status']}** |"
        )

    lines.extend(["", "## Aggregation Mapping Coverage", "", "| Mapping | Status |", "| --- | --- |"])
    for agg in REQUIRED_AGGREGATION_MAPPINGS:
        lines.append(f"| {agg} | **{aggregation_status[agg]}** |")

    lines.extend(["", "## Group-By Behavior", "", "| Behavior | Status | GraphEngine | QuickMeasure | Error |", "| --- | --- | --- | --- | --- |"])
    for behavior in REQUIRED_GROUP_BEHAVIOR:
        check = group_checks[behavior]
        lines.append(
            f"| {behavior} | **{check['status']}** | {markdown_value(check['graph_engine'])} | "
            f"{markdown_value(check['quick_measure'])} | {check['error'] or ''} |"
        )

    lines.extend(["", "## Time Intelligence", "", "| Template | Status |", "| --- | --- |"])
    for tid in REQUIRED_TIME_INTELLIGENCE:
        lines.append(f"| {tid} | **{time_status[tid]}** |")

    if details:
        lines.extend(["", "## Mismatch Details"])
        for detail in details:
            lines.extend(
                [
                    "",
                    f"### {detail['template']}",
                    "",
                    f"- **Root cause**: {detail['root_cause']}",
                    f"- **Fix**: {detail['fix']}",
                    f"- **Rendered KPI value**: {markdown_value(detail['rendered_value'])}",
                    f"- **Render error**: {detail['render_error'] or 'None'}",
                    "",
                    "**Payload**",
                    "",
                    "```json",
                    json.dumps(to_jsonable(detail["payload"]), indent=2, sort_keys=True, default=str),
                    "```",
                    "",
                    "**GraphEngine output**",
                    "",
                    "```json",
                    json.dumps(to_jsonable(detail["graph_output"]), indent=2, sort_keys=True, default=str),
                    "```",
                    "",
                    "**QuickMeasureEngine output**",
                    "",
                    "```json",
                    json.dumps(to_jsonable(detail["quick_output"]), indent=2, sort_keys=True, default=str),
                    "```",
                ]
            )

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Total templates: {len(TEMPLATE_CATALOGUE)}")
    print(f"Total tested: {len(rows) - len(missing_mappings)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"GraphEngine mismatches: {graph_mismatches}")
    print(f"Visualization mismatches: {visual_mismatches}")
    print(f"Missing mappings: {', '.join(missing_mappings) if missing_mappings else 'None'}")
    print(f"Unsupported measures: {', '.join(unsupported) if unsupported else 'None'}")
    print(f"Markdown report: {REPORT_PATH}")

    group_failures = [name for name, check in group_checks.items() if check["status"] != "PASS"]
    return 1 if failed or group_failures else 0


if __name__ == "__main__":
    sys.exit(run_validation())
