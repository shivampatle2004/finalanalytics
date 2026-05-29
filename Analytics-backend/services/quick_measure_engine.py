"""
quick_measure_engine.py
=======================
Power BI–style Quick Measure formula generation engine.

Generates pandas-compatible measure expressions from template IDs and field mappings.
Also handles validation, type-checking hints, and execution against a DataFrame.
"""

from typing import Any, Dict, List, Optional, Tuple
import pandas as pd


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE CATALOGUE
# ─────────────────────────────────────────────────────────────────────────────

TEMPLATE_CATALOGUE: Dict[str, Dict[str, Any]] = {

    # ── Aggregations ──────────────────────────────────────────────────────────
    "sum": {
        "category": "aggregations",
        "label": "Sum",
        "description": "Total sum of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "sum",
        "formula_template": "SUM({value_field})",
    },
    "average": {
        "category": "aggregations",
        "label": "Average",
        "description": "Average (mean) of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "mean",
        "formula_template": "AVERAGE({value_field})",
    },
    "min": {
        "category": "aggregations",
        "label": "Min",
        "description": "Minimum value of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "min",
        "formula_template": "MIN({value_field})",
    },
    "max": {
        "category": "aggregations",
        "label": "Max",
        "description": "Maximum value of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "max",
        "formula_template": "MAX({value_field})",
    },
    "count": {
        "category": "aggregations",
        "label": "Count",
        "description": "Number of non-null values in a field.",
        "params": [{"key": "value_field", "label": "Field", "type": "any"}],
        "aggregation": "count",
        "formula_template": "COUNT({value_field})",
    },
    "distinct_count": {
        "category": "aggregations",
        "label": "Distinct Count",
        "description": "Number of unique non-null values.",
        "params": [{"key": "value_field", "label": "Field", "type": "any"}],
        "aggregation": "nunique",
        "formula_template": "DISTINCTCOUNT({value_field})",
    },

    # ── Mathematical Operations ───────────────────────────────────────────────
    "division": {
        "category": "mathematical",
        "label": "Division",
        "description": "Divide one numeric field by another (safe — handles zero).",
        "params": [
            {"key": "numerator", "label": "Numerator", "type": "numeric"},
            {"key": "denominator", "label": "Denominator", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "DIVIDE(SUM({numerator}), SUM({denominator}), 0)",
    },
    "percentage": {
        "category": "mathematical",
        "label": "Percentage",
        "description": "Percentage of a value relative to a total.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "total_field", "label": "Total", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "DIVIDE(SUM({value_field}), SUM({total_field}), 0) * 100",
    },
    "ratio": {
        "category": "mathematical",
        "label": "Ratio",
        "description": "Ratio between two numeric fields.",
        "params": [
            {"key": "part_field", "label": "Part", "type": "numeric"},
            {"key": "whole_field", "label": "Whole", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "DIVIDE(SUM({part_field}), SUM({whole_field}), BLANK())",
    },
    "difference": {
        "category": "mathematical",
        "label": "Difference",
        "description": "Arithmetic difference between two numeric fields.",
        "params": [
            {"key": "field_a", "label": "Field A", "type": "numeric"},
            {"key": "field_b", "label": "Field B", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "SUM({field_a}) - SUM({field_b})",
    },
    "running_total": {
        "category": "mathematical",
        "label": "Running Total",
        "description": "Cumulative sum of a field ordered by a date/category column.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date / Order field", "type": "datetime"},
        ],
        "aggregation": "cumsum",
        "formula_template": "RUNNING_TOTAL({value_field}, {date_field})",
    },

    # ── Time Intelligence ─────────────────────────────────────────────────────
    "mtd": {
        "category": "time_intelligence",
        "label": "Month-to-Date",
        "description": "Cumulative sum of a value from the start of the current month.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "mtd",
        "formula_template": "MTD({value_field}, {date_field})",
    },
    "qtd": {
        "category": "time_intelligence",
        "label": "Quarter-to-Date",
        "description": "Cumulative sum from the start of the current quarter.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "qtd",
        "formula_template": "QTD({value_field}, {date_field})",
    },
    "ytd": {
        "category": "time_intelligence",
        "label": "Year-to-Date",
        "description": "Cumulative sum from the start of the current year.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "ytd",
        "formula_template": "YTD({value_field}, {date_field})",
    },
    "previous_month": {
        "category": "time_intelligence",
        "label": "Previous Month",
        "description": "Total of the previous calendar month.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "PREV_MONTH_SUM({value_field}, {date_field})",
    },
    "previous_year": {
        "category": "time_intelligence",
        "label": "Previous Year",
        "description": "Total of the same period in the previous year.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "PREV_YEAR_SUM({value_field}, {date_field})",
    },
    "rolling_average": {
        "category": "time_intelligence",
        "label": "Rolling Average",
        "description": "Moving average over N periods.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
            {"key": "periods", "label": "Periods (N)", "type": "number", "default": "3"},
        ],
        "aggregation": "mean",
        "formula_template": "ROLLING_AVG({value_field}, {date_field}, {periods})",
    },
    "growth_percent": {
        "category": "time_intelligence",
        "label": "Growth %",
        "description": "Percentage growth versus the previous period.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "GROWTH_PCT({value_field}, {date_field})",
    },

    # ── Filtered Values ───────────────────────────────────────────────────────
    "filtered_aggregation": {
        "category": "filtered_values",
        "label": "Filtered Aggregation",
        "description": "Aggregate a field only where a condition column equals a value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "filter_field", "label": "Filter field", "type": "categorical"},
            {"key": "filter_value", "label": "Filter value", "type": "text", "default": ""},
        ],
        "aggregation": "sum",
        "formula_template": "CALCULATE(SUM({value_field}), FILTER({filter_field}, \"{filter_value}\"))",
    },
    "conditional_measure": {
        "category": "filtered_values",
        "label": "Conditional Measure",
        "description": "Return different aggregations based on a condition.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "condition_field", "label": "Condition field", "type": "any"},
            {"key": "condition_value", "label": "Condition value", "type": "text", "default": ""},
            {"key": "true_agg", "label": "Aggregation if true", "type": "text", "default": "SUM"},
        ],
        "aggregation": "sum",
        "formula_template": "IF(HASONEVALUE({condition_field}), {true_agg}({value_field}), BLANK())",
    },
    "top_n": {
        "category": "filtered_values",
        "label": "Top N",
        "description": "Sum of the Top N rows by value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
            {"key": "n", "label": "N (top count)", "type": "number", "default": "5"},
        ],
        "aggregation": "sum",
        "formula_template": "TOP_N_SUM({value_field}, {category_field}, {n})",
    },
    "rank": {
        "category": "filtered_values",
        "label": "Rank",
        "description": "Rank of the current row by a value field (1 = highest).",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
        ],
        "aggregation": "rank",
        "formula_template": "RANKX({category_field}, SUM({value_field}))",
    },

    # ── Comparison Metrics ────────────────────────────────────────────────────
    "yoy_change": {
        "category": "comparison",
        "label": "Year-over-Year Change",
        "description": "Absolute change versus the same period last year.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "YOY_CHANGE({value_field}, {date_field})",
    },
    "period_comparison": {
        "category": "comparison",
        "label": "Period Comparison",
        "description": "Compare current period value against a prior period.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
            {"key": "offset_periods", "label": "Offset (periods)", "type": "number", "default": "1"},
        ],
        "aggregation": "sum",
        "formula_template": "PERIOD_COMPARE({value_field}, {date_field}, {offset_periods})",
    },
    "variance": {
        "category": "comparison",
        "label": "Variance",
        "description": "Variance (actual minus target).",
        "params": [
            {"key": "actual_field", "label": "Actual", "type": "numeric"},
            {"key": "target_field", "label": "Target / Budget", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "SUM({actual_field}) - SUM({target_field})",
    },
    "percentage_change": {
        "category": "comparison",
        "label": "Percentage Change",
        "description": "Percentage change between actual and reference value.",
        "params": [
            {"key": "current_field", "label": "Current value", "type": "numeric"},
            {"key": "prior_field", "label": "Prior / Reference value", "type": "numeric"},
        ],
        "aggregation": "sum",
        "formula_template": "DIVIDE(SUM({current_field}) - SUM({prior_field}), ABS(SUM({prior_field})), 0) * 100",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# FORMULA GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuickMeasureEngine:

    @staticmethod
    def get_templates() -> Dict[str, Any]:
        """Return the full template catalogue grouped by category."""
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for tid, tmpl in TEMPLATE_CATALOGUE.items():
            cat = tmpl["category"]
            if cat not in grouped:
                grouped[cat] = []
            grouped[cat].append({"id": tid, **tmpl})
        return grouped

    @staticmethod
    def get_template(template_id: str) -> Optional[Dict[str, Any]]:
        return TEMPLATE_CATALOGUE.get(template_id)

    @staticmethod
    def generate_formula(template_id: str, field_mappings: Dict[str, str]) -> Tuple[str, List[str]]:
        """
        Generate a formula string from a template and field mappings.

        Returns (formula_str, validation_errors).
        """
        tmpl = TEMPLATE_CATALOGUE.get(template_id)
        if not tmpl:
            return "", [f"Unknown template: {template_id}"]

        errors: List[str] = []
        formula = tmpl["formula_template"]

        # Validate required params
        for param in tmpl.get("params", []):
            key = param["key"]
            ptype = param.get("type", "any")
            # Optional numeric params (like periods/N) may have defaults
            if key in field_mappings and field_mappings[key]:
                value = field_mappings[key]
                formula = formula.replace(f"{{{key}}}", value)
            elif "default" in param:
                formula = formula.replace(f"{{{key}}}", str(param["default"]))
            else:
                errors.append(f"Missing required field: {param['label']}")
                formula = formula.replace(f"{{{key}}}", f"<{param['label']}>")

        return formula, errors

    @staticmethod
    def validate_fields(template_id: str, field_mappings: Dict[str, str], schema: List[Dict]) -> List[str]:
        """
        Validate field types against template parameter expectations.

        schema items: {column_name, data_type}
        """
        tmpl = TEMPLATE_CATALOGUE.get(template_id)
        if not tmpl:
            return [f"Unknown template: {template_id}"]

        schema_map = {col["column_name"]: col.get("data_type", "text") for col in schema}
        errors: List[str] = []

        NUMERIC_TYPES = {"numeric", "integer", "float", "int", "decimal", "double", "real", "number"}
        DATETIME_TYPES = {"datetime", "date", "timestamp", "time"}

        for param in tmpl.get("params", []):
            key = param["key"]
            expected = param.get("type", "any")
            if expected == "any" or expected in ("text", "number"):
                continue

            col_name = field_mappings.get(key, "")
            if not col_name:
                continue

            actual_type = schema_map.get(col_name, "").lower()

            if expected == "numeric":
                if not any(t in actual_type for t in NUMERIC_TYPES):
                    errors.append(
                        f"Field '{col_name}' (used for '{param['label']}') should be numeric. "
                        f"Detected type: {actual_type or 'unknown'}."
                    )
            elif expected == "datetime":
                if not any(t in actual_type for t in DATETIME_TYPES):
                    errors.append(
                        f"Field '{col_name}' (used for '{param['label']}') should be a date/datetime column. "
                        f"Detected type: {actual_type or 'unknown'}."
                    )

        return errors

    @staticmethod
    def execute_measure(
        df: pd.DataFrame,
        template_id: str,
        field_mappings: Dict[str, str],
        group_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the measure against a DataFrame and return a scalar or grouped result.
        Returns {"result": value, "error": None} or {"result": None, "error": "..."}.
        """
        tmpl = TEMPLATE_CATALOGUE.get(template_id)
        if not tmpl:
            return {"result": None, "error": f"Unknown template: {template_id}"}

        try:
            agg = tmpl.get("aggregation", "sum")
            
            # ── Helper: clean currency and convert series to numeric ──────────
            def to_numeric_clean(col_name):
                if col_name not in df.columns:
                    return None
                s = df[col_name]
                if s.dtype == 'object':
                    s = pd.to_numeric(s.astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    s = pd.to_numeric(s, errors='coerce')
                return s

            def col_sum(col_name):
                s = to_numeric_clean(col_name)
                return float(s.sum()) if s is not None else 0.0

            def col_mean(col_name):
                s = to_numeric_clean(col_name)
                return float(s.mean()) if s is not None else 0.0

            # ── Handle templates that DON'T need a primary value_field ────────
            # Ratio: part_field / whole_field
            if template_id == "ratio":
                part = col_sum(field_mappings.get("part_field", ""))
                whole = col_sum(field_mappings.get("whole_field", ""))
                result_val = (part / whole) if whole else 0.0
                return {"result": round(result_val, 6), "error": None}

            # Division: numerator / denominator
            if template_id == "division":
                num = col_sum(field_mappings.get("numerator", ""))
                den = col_sum(field_mappings.get("denominator", ""))
                result_val = (num / den) if den else 0.0
                return {"result": round(result_val, 4), "error": None}

            # Percentage: (value / total) * 100
            if template_id == "percentage":
                val = col_sum(field_mappings.get("value_field", ""))
                total = col_sum(field_mappings.get("total_field", ""))
                result_val = (val / total * 100) if total else 0.0
                return {"result": round(result_val, 4), "error": None}

            # Difference: field_a - field_b
            if template_id == "difference":
                a = col_sum(field_mappings.get("field_a", ""))
                b = col_sum(field_mappings.get("field_b", ""))
                return {"result": round(a - b, 4), "error": None}

            # Variance: actual - target
            if template_id == "variance":
                actual = col_sum(field_mappings.get("actual_field", ""))
                target = col_sum(field_mappings.get("target_field", ""))
                return {"result": round(actual - target, 4), "error": None}

            # Percentage Change: (current - prior) / |prior| * 100
            if template_id == "percentage_change":
                current = col_sum(field_mappings.get("current_field", ""))
                prior = col_sum(field_mappings.get("prior_field", ""))
                result_val = ((current - prior) / abs(prior) * 100) if prior else 0.0
                return {"result": round(result_val, 4), "error": None}

            # Conditional Measure: SUM(value) WHERE condition_field == condition_value
            if template_id == "conditional_measure":
                value_col = field_mappings.get("value_field", "")
                cond_col = field_mappings.get("condition_field", "")
                cond_val = str(field_mappings.get("condition_value", "")).strip()
                if value_col in df.columns and cond_col in df.columns and cond_val:
                    col_str = df[cond_col].astype(str).str.strip()
                    mask = col_str == cond_val
                    if mask.sum() == 0:
                        mask = col_str.str.lower() == cond_val.lower()
                    if mask.sum() == 0:
                        mask = col_str.str.lower().str.contains(cond_val.lower(), na=False)
                    filtered_df = df[mask]
                    result_val = float(
                        pd.to_numeric(filtered_df[value_col].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce').sum()
                    )
                    return {"result": round(result_val, 4), "error": None}
                elif value_col in df.columns:
                    # No condition value provided — return full sum
                    return {"result": round(float(to_numeric_clean(value_col).sum()), 4), "error": None}
                return {"result": 0.0, "error": None}

            # Filtered Aggregation: SUM(value) WHERE filter_field == filter_value
            if template_id == "filtered_aggregation":
                value_col = field_mappings.get("value_field", "")
                filter_col = field_mappings.get("filter_field", "")
                filter_val = str(field_mappings.get("filter_value", "")).strip()
                if value_col in df.columns and filter_col in df.columns:
                    col_str = df[filter_col].astype(str).str.strip()
                    # Try exact match first, then case-insensitive, then partial contains
                    mask = col_str == filter_val
                    if mask.sum() == 0:
                        mask = col_str.str.lower() == filter_val.lower()
                    if mask.sum() == 0:
                        mask = col_str.str.lower().str.contains(filter_val.lower(), na=False)
                    filtered_df = df[mask]
                    result_val = float(
                        pd.to_numeric(filtered_df[value_col].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce').sum()
                    )
                    return {"result": round(result_val, 4), "error": None}
                return {"result": 0.0, "error": None}

            # Top N: sum of top N rows by value
            if template_id == "top_n":
                value_col = field_mappings.get("value_field", "")
                n = int(field_mappings.get("n", 5))
                if value_col in df.columns:
                    s = to_numeric_clean(value_col)
                    result_val = float(s.nlargest(n).sum())
                    return {"result": round(result_val, 4), "error": None}
                return {"result": 0.0, "error": None}

            # Rank: not a scalar — return count of unique values as proxy
            if template_id == "rank":
                value_col = field_mappings.get("value_field", "")
                if value_col in df.columns:
                    return {"result": float(df[value_col].nunique()), "error": None}
                return {"result": 0.0, "error": None}

            # ── Primary value_field for remaining templates ────────────────────
            value_field = (field_mappings.get("value_field") or 
                          field_mappings.get("numerator") or 
                          field_mappings.get("actual_field") or 
                          field_mappings.get("current_field") or
                          field_mappings.get("part_field"))
            date_field = field_mappings.get("date_field")

            if not value_field or value_field not in df.columns:
                return {"result": None, "error": "Value field not found in dataset."}

            series = to_numeric_clean(value_field).dropna()

            # Time-intelligence aggregations
            if agg in ("ytd", "mtd", "qtd") and date_field and date_field in df.columns:
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                # Clean currency symbols before converting to numeric
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(
                        work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True),
                        errors='coerce'
                    )
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                work = work.dropna(subset=[date_field])
                now = work[date_field].max()
                if pd.isna(now):
                    return {"result": None, "error": "Date field has no valid dates."}
                if agg == "ytd":
                    mask = work[date_field].dt.year == now.year
                elif agg == "mtd":
                    mask = (work[date_field].dt.year == now.year) & (work[date_field].dt.month == now.month)
                elif agg == "qtd":
                    mask = (work[date_field].dt.year == now.year) & (work[date_field].dt.quarter == now.quarter)
                result_val = float(work.loc[mask, value_field].sum())
                return {"result": round(result_val, 4), "error": None}

            # Previous month
            if template_id == "previous_month" and date_field and date_field in df.columns:
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                now = work[date_field].max()
                if not pd.isna(now):
                    prev = now - pd.DateOffset(months=1)
                    mask = (work[date_field].dt.year == prev.year) & (work[date_field].dt.month == prev.month)
                    return {"result": float(work.loc[mask, value_field].sum()), "error": None}

            # Previous year
            if template_id == "previous_year" and date_field and date_field in df.columns:
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                now = work[date_field].max()
                if not pd.isna(now):
                    mask = work[date_field].dt.year == (now.year - 1)
                    return {"result": float(work.loc[mask, value_field].sum()), "error": None}

            # Rolling average
            if template_id == "rolling_average" and date_field and date_field in df.columns:
                periods = int(field_mappings.get("periods", 3))
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                work = work.sort_values(date_field)
                result_val = float(work[value_field].rolling(periods).mean().iloc[-1])
                return {"result": round(result_val, 4), "error": None}

            # Growth %
            if template_id == "growth_percent" and date_field and date_field in df.columns:
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                now = work[date_field].max()
                if not pd.isna(now):
                    curr_mask = work[date_field].dt.year == now.year
                    prev_mask = work[date_field].dt.year == (now.year - 1)
                    curr_val = float(work.loc[curr_mask, value_field].sum())
                    prev_val = float(work.loc[prev_mask, value_field].sum())
                    result_val = ((curr_val - prev_val) / abs(prev_val) * 100) if prev_val else 0.0
                    return {"result": round(result_val, 4), "error": None}

            # YoY Change
            if template_id == "yoy_change" and date_field and date_field in df.columns:
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                now = work[date_field].max()
                if not pd.isna(now):
                    curr_val = float(work.loc[work[date_field].dt.year == now.year, value_field].sum())
                    prev_val = float(work.loc[work[date_field].dt.year == (now.year - 1), value_field].sum())
                    return {"result": round(curr_val - prev_val, 4), "error": None}

            # Period Comparison
            if template_id == "period_comparison" and date_field and date_field in df.columns:
                offset = int(field_mappings.get("offset_periods", 1))
                work = df[[date_field, value_field]].copy()
                work[date_field] = pd.to_datetime(work[date_field], errors="coerce")
                if work[value_field].dtype == 'object':
                    work[value_field] = pd.to_numeric(work[value_field].astype(str).str.replace(r'[$€£¥,\s]', '', regex=True), errors='coerce')
                else:
                    work[value_field] = pd.to_numeric(work[value_field], errors='coerce')
                now = work[date_field].max()
                if not pd.isna(now):
                    prev = now - pd.DateOffset(months=offset)
                    curr_val = float(work.loc[work[date_field].dt.month == now.month, value_field].sum())
                    prev_val = float(work.loc[work[date_field].dt.month == prev.month, value_field].sum())
                    return {"result": round(curr_val - prev_val, 4), "error": None}

            # Running Total
            if template_id == "running_total":
                result_val = float(series.cumsum().iloc[-1]) if not series.empty else 0.0
                return {"result": round(result_val, 4), "error": None}

            # Standard aggregations fallback
            if agg == "sum":
                result_val = float(series.sum())
            elif agg in ("mean", "average"):
                result_val = float(series.mean())
            elif agg == "min":
                result_val = float(series.min())
            elif agg == "max":
                result_val = float(series.max())
            elif agg == "count":
                result_val = float(df[value_field].count())
            elif agg == "nunique":
                result_val = float(df[value_field].nunique())
            else:
                result_val = float(series.sum())

            return {"result": round(result_val, 4) if result_val is not None else None, "error": None}

        except Exception as exc:
            return {"result": None, "error": str(exc)}

    @staticmethod
    def suggest_measures(schema: List[Dict]) -> List[Dict[str, str]]:
        """
        Heuristically suggest relevant quick measure templates based on column types.
        Returns a list of {template_id, reason}.
        """
        suggestions = []
        has_numeric = any(
            any(t in (col.get("data_type") or "").lower() for t in ["int", "float", "decimal", "numeric", "real", "double"])
            for col in schema
        )
        has_datetime = any(
            any(t in (col.get("data_type") or "").lower() for t in ["date", "time"])
            for col in schema
        )
        has_categorical = any(
            any(t in (col.get("data_type") or "").lower() for t in ["text", "varchar", "string", "char", "object"])
            for col in schema
        )

        if has_numeric:
            suggestions.append({"template_id": "sum", "reason": "Numeric fields detected — Sum is the most common measure."})
            suggestions.append({"template_id": "average", "reason": "Average gives a normalized view across categories."})
        if has_numeric and has_datetime:
            suggestions.append({"template_id": "ytd", "reason": "Date + numeric columns — Year-to-Date is ideal for trend tracking."})
            suggestions.append({"template_id": "growth_percent", "reason": "Measure period-over-period growth automatically."})
            suggestions.append({"template_id": "rolling_average", "reason": "Smooth out noise with a rolling average."})
        if has_numeric and len([c for c in schema if "numeric" in (c.get("data_type") or "").lower()]) >= 2:
            suggestions.append({"template_id": "percentage_change", "reason": "Compare two numeric fields as % change."})
            suggestions.append({"template_id": "variance", "reason": "Track actual vs budget/target variance."})
        if has_categorical and has_numeric:
            suggestions.append({"template_id": "top_n", "reason": "Categorical + numeric — find your Top N performers."})
            suggestions.append({"template_id": "rank", "reason": "Rank categories by their metric value."})

        return suggestions[:6]  # Cap at 6 suggestions
