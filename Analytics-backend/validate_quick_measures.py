"""Validate every quick measure template against deterministic expectations."""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List

import numpy as np
import pandas as pd

from services.quick_measure_engine import QuickMeasureEngine, TEMPLATE_CATALOGUE


REPORT_PATH = Path(__file__).with_name("quick_measure_validation_report.md")
ROUND_DIGITS = 4


def build_test_data() -> pd.DataFrame:
    """Build deterministic data that exercises every quick measure template."""
    return pd.DataFrame(
        {
            "Date": pd.to_datetime(
                [
                    "2023-01-15",
                    "2023-02-15",
                    "2023-03-15",
                    "2023-04-15",
                    "2023-05-15",
                    "2023-06-15",
                    "2023-07-15",
                    "2023-08-15",
                    "2023-09-15",
                    "2023-10-15",
                    "2023-11-15",
                    "2023-12-15",
                    "2024-01-15",
                    "2024-02-15",
                    "2024-03-15",
                    "2024-04-15",
                    "2024-05-15",
                    "2024-06-15",
                    "2024-07-15",
                    "2024-08-15",
                    "2024-09-15",
                    "2024-10-15",
                    "2024-11-15",
                    "2024-12-15",
                ]
            ),
            "Value": [
                10.0,
                20.0,
                30.0,
                40.0,
                50.0,
                60.0,
                70.0,
                80.0,
                90.0,
                100.0,
                110.0,
                120.0,
                15.0,
                25.0,
                35.0,
                45.0,
                55.0,
                65.0,
                75.0,
                85.0,
                95.0,
                105.0,
                115.0,
                125.0,
            ],
            "Weight": [
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
                1.0,
                2.0,
            ],
            "Category": [
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
                "A",
                "B",
            ],
            "Actual": [
                15.0,
                25.0,
                35.0,
                45.0,
                55.0,
                65.0,
                75.0,
                85.0,
                95.0,
                105.0,
                115.0,
                125.0,
                20.0,
                30.0,
                40.0,
                50.0,
                60.0,
                70.0,
                80.0,
                90.0,
                100.0,
                110.0,
                120.0,
                130.0,
            ],
            "Target": [
                10.0,
                20.0,
                30.0,
                40.0,
                50.0,
                60.0,
                70.0,
                80.0,
                90.0,
                100.0,
                110.0,
                120.0,
                15.0,
                25.0,
                35.0,
                45.0,
                55.0,
                65.0,
                75.0,
                85.0,
                95.0,
                105.0,
                115.0,
                125.0,
            ],
            "Numerator": [50.0] * 24,
            "Denominator": [10.0] * 24,
            "Part": [20.0] * 24,
            "Whole": [100.0] * 24,
            "FieldA": [10.0] * 24,
            "FieldB": [5.0] * 24,
            "Current": [150.0] * 24,
            "Prior": [100.0] * 24,
        }
    )


FIELD_MAPPINGS: Dict[str, Dict[str, Any]] = {
    "sum": {"value_field": "Value"},
    "average": {"value_field": "Value"},
    "min": {"value_field": "Value"},
    "max": {"value_field": "Value"},
    "count": {"value_field": "Value"},
    "distinct_count": {"value_field": "Value"},
    "median": {"value_field": "Value"},
    "mode": {"value_field": "Category"},
    "std_dev": {"value_field": "Value"},
    "weighted_average": {"value_field": "Value", "weight_field": "Weight"},
    "division": {"numerator": "Numerator", "denominator": "Denominator"},
    "percentage": {"value_field": "Part", "total_field": "Whole"},
    "ratio": {"part_field": "Part", "whole_field": "Whole"},
    "difference": {"field_a": "FieldA", "field_b": "FieldB"},
    "running_total": {"value_field": "Value", "date_field": "Date"},
    "mtd": {"value_field": "Value", "date_field": "Date"},
    "qtd": {"value_field": "Value", "date_field": "Date"},
    "ytd": {"value_field": "Value", "date_field": "Date"},
    "previous_month": {"value_field": "Value", "date_field": "Date"},
    "previous_year": {"value_field": "Value", "date_field": "Date"},
    "rolling_average": {"value_field": "Value", "date_field": "Date", "periods": 3},
    "growth_percent": {"value_field": "Value", "date_field": "Date"},
    "same_period_last_year": {"value_field": "Value", "date_field": "Date"},
    "month_over_month": {"value_field": "Value", "date_field": "Date"},
    "quarter_over_quarter": {"value_field": "Value", "date_field": "Date"},
    "rolling_12_month": {"value_field": "Value", "date_field": "Date"},
    "rolling_6_month": {"value_field": "Value", "date_field": "Date"},
    "rolling_3_month": {"value_field": "Value", "date_field": "Date"},
    "cagr": {"value_field": "Value", "date_field": "Date"},
    "filtered_aggregation": {"value_field": "Value", "filter_field": "Category", "filter_value": "A"},
    "conditional_measure": {
        "value_field": "Value",
        "condition_field": "Category",
        "condition_value": "A",
        "true_agg": "SUM",
    },
    "top_n": {"value_field": "Value", "category_field": "Category", "n": 1},
    "rank": {"value_field": "Value", "category_field": "Category"},
    "rank_dense": {"value_field": "Value", "category_field": "Category"},
    "rank_ascending": {"value_field": "Value", "category_field": "Category"},
    "rank_descending": {"value_field": "Value", "category_field": "Category"},
    "yoy_change": {"value_field": "Value", "date_field": "Date"},
    "period_comparison": {"value_field": "Value", "date_field": "Date", "offset_periods": 2},
    "variance": {"actual_field": "Actual", "target_field": "Target"},
    "percentage_change": {"current_field": "Current", "prior_field": "Prior"},
    "percentile": {"value_field": "Value", "percentile": 0.9},
    "quartile": {"value_field": "Value", "quartile": 2},
    "variance_population": {"value_field": "Value"},
    "stddev_population": {"value_field": "Value"},
    "covariance": {"field_a": "Value", "field_b": "Weight"},
    "correlation": {"field_a": "Value", "field_b": "Weight"},
}


def _latest(df: pd.DataFrame) -> pd.Timestamp:
    return df["Date"].max()


def _sum_for_month(df: pd.DataFrame, date: pd.Timestamp) -> float:
    mask = (df["Date"].dt.year == date.year) & (df["Date"].dt.month == date.month)
    return float(df.loc[mask, "Value"].sum())


def _manual_rank(df: pd.DataFrame, ascending: bool, method: str) -> Dict[str, int]:
    totals = df.groupby("Category")["Value"].sum()
    ranks = totals.rank(method=method, ascending=ascending).astype(int)
    return {str(key): int(ranks.loc[key]) for key in ranks.sort_values(kind="stable").index}


def _manual_rolling_month(df: pd.DataFrame, months: int) -> float:
    latest = _latest(df)
    start = latest - pd.DateOffset(months=months - 1)
    start = pd.Timestamp(year=start.year, month=start.month, day=1)
    return float(df.loc[(df["Date"] >= start) & (df["Date"] <= latest), "Value"].sum())


def _manual_correlation(df: pd.DataFrame) -> Any:
    result = df["Value"].corr(df["Weight"])
    return None if pd.isna(result) else float(result)


ExpectedCalculator = Callable[[pd.DataFrame], Any]

EXPECTED_CALCULATORS: Dict[str, ExpectedCalculator] = {
    "sum": lambda df: float(df["Value"].sum()),
    "average": lambda df: float(df["Value"].mean()),
    "min": lambda df: float(df["Value"].min()),
    "max": lambda df: float(df["Value"].max()),
    "count": lambda df: float(df["Value"].count()),
    "distinct_count": lambda df: float(df["Value"].nunique()),
    "median": lambda df: float(df["Value"].median()),
    "mode": lambda df: df["Category"].dropna().mode().iloc[0],
    "std_dev": lambda df: float(df["Value"].std()),
    "weighted_average": lambda df: float((df["Value"] * df["Weight"]).sum() / df["Weight"].sum()),
    "division": lambda df: float(df["Numerator"].sum() / df["Denominator"].sum()),
    "percentage": lambda df: float(df["Part"].sum() / df["Whole"].sum() * 100),
    "ratio": lambda df: float(df["Part"].sum() / df["Whole"].sum()),
    "difference": lambda df: float(df["FieldA"].sum() - df["FieldB"].sum()),
    "running_total": lambda df: float(df.sort_values("Date")["Value"].cumsum().iloc[-1]),
    "mtd": lambda df: _sum_for_month(df, _latest(df)),
    "qtd": lambda df: float(
        df.loc[
            (df["Date"].dt.year == _latest(df).year)
            & (df["Date"].dt.quarter == _latest(df).quarter)
            & (df["Date"] <= _latest(df)),
            "Value",
        ].sum()
    ),
    "ytd": lambda df: float(df.loc[(df["Date"].dt.year == _latest(df).year) & (df["Date"] <= _latest(df)), "Value"].sum()),
    "previous_month": lambda df: _sum_for_month(df, _latest(df) - pd.DateOffset(months=1)),
    "previous_year": lambda df: float(df.loc[df["Date"].dt.year == _latest(df).year - 1, "Value"].sum()),
    "rolling_average": lambda df: float(df.sort_values("Date")["Value"].rolling(3).mean().iloc[-1]),
    "growth_percent": lambda df: float(
        (
            df.loc[df["Date"].dt.year == _latest(df).year, "Value"].sum()
            - df.loc[df["Date"].dt.year == _latest(df).year - 1, "Value"].sum()
        )
        / df.loc[df["Date"].dt.year == _latest(df).year - 1, "Value"].sum()
        * 100
    ),
    "same_period_last_year": lambda df: _sum_for_month(df, _latest(df) - pd.DateOffset(years=1)),
    "month_over_month": lambda df: float(
        (_sum_for_month(df, _latest(df)) - _sum_for_month(df, _latest(df) - pd.DateOffset(months=1)))
        / _sum_for_month(df, _latest(df) - pd.DateOffset(months=1))
        * 100
    ),
    "quarter_over_quarter": lambda df: float(
        (
            df.loc[(df["Date"].dt.year == _latest(df).year) & (df["Date"].dt.quarter == _latest(df).quarter), "Value"].sum()
            - df.loc[
                (df["Date"].dt.year == (_latest(df) - pd.DateOffset(months=3)).year)
                & (df["Date"].dt.quarter == (_latest(df) - pd.DateOffset(months=3)).quarter),
                "Value",
            ].sum()
        )
        / df.loc[
            (df["Date"].dt.year == (_latest(df) - pd.DateOffset(months=3)).year)
            & (df["Date"].dt.quarter == (_latest(df) - pd.DateOffset(months=3)).quarter),
            "Value",
        ].sum()
        * 100
    ),
    "rolling_12_month": lambda df: _manual_rolling_month(df, 12),
    "rolling_6_month": lambda df: _manual_rolling_month(df, 6),
    "rolling_3_month": lambda df: _manual_rolling_month(df, 3),
    "cagr": lambda df: float(
        (
            (
                df.groupby(df["Date"].dt.year)["Value"].sum().iloc[-1]
                / df.groupby(df["Date"].dt.year)["Value"].sum().iloc[0]
            )
            ** (1 / (df["Date"].dt.year.max() - df["Date"].dt.year.min()))
            - 1
        )
        * 100
    ),
    "filtered_aggregation": lambda df: float(df.loc[df["Category"] == "A", "Value"].sum()),
    "conditional_measure": lambda df: float(df.loc[df["Category"] == "A", "Value"].sum()),
    "top_n": lambda df: {str(k): float(v) for k, v in df.groupby("Category")["Value"].sum().sort_values(ascending=False).head(1).items()},
    "rank": lambda df: _manual_rank(df, ascending=False, method="min"),
    "rank_dense": lambda df: _manual_rank(df, ascending=False, method="dense"),
    "rank_ascending": lambda df: _manual_rank(df, ascending=True, method="min"),
    "rank_descending": lambda df: _manual_rank(df, ascending=False, method="min"),
    "yoy_change": lambda df: float(
        df.loc[df["Date"].dt.year == _latest(df).year, "Value"].sum()
        - df.loc[df["Date"].dt.year == _latest(df).year - 1, "Value"].sum()
    ),
    "period_comparison": lambda df: float(_sum_for_month(df, _latest(df)) - _sum_for_month(df, _latest(df) - pd.DateOffset(months=2))),
    "variance": lambda df: float(df["Actual"].sum() - df["Target"].sum()),
    "percentage_change": lambda df: float((df["Current"].sum() - df["Prior"].sum()) / abs(df["Prior"].sum()) * 100),
    "percentile": lambda df: float(df["Value"].quantile(0.9)),
    "quartile": lambda df: float(df["Value"].quantile(0.5)),
    "variance_population": lambda df: float(df["Value"].var(ddof=0)),
    "stddev_population": lambda df: float(df["Value"].std(ddof=0)),
    "covariance": lambda df: float(df["Value"].cov(df["Weight"])),
    "correlation": _manual_correlation,
}


def normalize(value: Any) -> Any:
    """Normalize engine/manual values for stable comparison and reporting."""
    if isinstance(value, dict):
        return {str(key): normalize(val) for key, val in value.items()}
    if isinstance(value, (np.integer, int)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, (np.floating, float)):
        if math.isnan(float(value)):
            return None
        return round(float(value), ROUND_DIGITS)
    return value


def values_match(expected: Any, actual: Any) -> bool:
    return normalize(expected) == normalize(actual)


def markdown_value(value: Any) -> str:
    return "`" + str(normalize(value)).replace("|", "\\|") + "`"


def generate_report(rows: List[Dict[str, Any]], totals: Dict[str, Any]) -> str:
    missing = ", ".join(totals["missing_templates"]) if totals["missing_templates"] else "None"
    lines = [
        "# Quick Measure Templates Validation Report",
        "",
        f"- **Total templates found**: {totals['total_found']}",
        f"- **Total tested**: {totals['total_tested']}",
        f"- **Passed**: {totals['passed']}",
        f"- **Failed**: {totals['failed']}",
        f"- **Missing templates**: {missing}",
        "",
        "## Results",
        "",
        "| Template | Expected | Actual | Status | Error |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['template']} | {markdown_value(row['expected'])} | {markdown_value(row['actual'])} "
            f"| **{row['status']}** | {row['error'] or ''} |"
        )
    return "\n".join(lines) + "\n"


def run_validation() -> int:
    df = build_test_data()
    rows: List[Dict[str, Any]] = []
    passed = 0
    failed = 0
    tested = 0
    missing_templates: List[str] = []

    for template_id in TEMPLATE_CATALOGUE:
        mapping = FIELD_MAPPINGS.get(template_id)
        calculator = EXPECTED_CALCULATORS.get(template_id)
        if mapping is None or calculator is None:
            missing_templates.append(template_id)
            rows.append(
                {
                    "template": template_id,
                    "expected": None,
                    "actual": None,
                    "status": "MISSING",
                    "error": "Missing field mapping or expected-result calculator.",
                }
            )
            continue

        tested += 1
        expected = calculator(df)
        response = QuickMeasureEngine.execute_measure(df, template_id, mapping)
        actual = response.get("result")
        error = response.get("error")
        passed_template = error is None and values_match(expected, actual)

        if passed_template:
            passed += 1
            status = "PASS"
        else:
            failed += 1
            status = "FAIL"

        rows.append(
            {
                "template": template_id,
                "expected": expected,
                "actual": actual,
                "status": status,
                "error": error,
            }
        )

    totals = {
        "total_found": len(TEMPLATE_CATALOGUE),
        "total_tested": tested,
        "passed": passed,
        "failed": failed,
        "missing_templates": missing_templates,
    }
    REPORT_PATH.write_text(generate_report(rows, totals), encoding="utf-8")

    print(f"Total templates found: {totals['total_found']}")
    print(f"Total tested: {totals['total_tested']}")
    print(f"Passed: {totals['passed']}")
    print(f"Failed: {totals['failed']}")
    print(f"Missing templates: {', '.join(missing_templates) if missing_templates else 'None'}")
    print(f"Markdown report: {REPORT_PATH}")

    return 1 if failed or missing_templates else 0


if __name__ == "__main__":
    sys.exit(run_validation())
