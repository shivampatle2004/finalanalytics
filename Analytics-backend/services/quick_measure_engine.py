"""
quick_measure_engine.py
=======================
Power BI-style Quick Measure formula generation engine.

Generates pandas-compatible measure expressions from template IDs and field mappings.
Also handles validation, filter context, type-checking hints, measure chaining, and
execution against a DataFrame.
"""

import ast
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import pandas as pd


# -----------------------------------------------------------------------------
# TEMPLATE CATALOGUE
# -----------------------------------------------------------------------------

TEMPLATE_CATALOGUE: Dict[str, Dict[str, Any]] = {
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
    "median": {
        "category": "aggregations",
        "label": "Median",
        "description": "Median value of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "median",
        "formula_template": "MEDIAN({value_field})",
    },
    "mode": {
        "category": "aggregations",
        "label": "Mode",
        "description": "Most frequently occurring value in a field.",
        "params": [{"key": "value_field", "label": "Field", "type": "any"}],
        "aggregation": "mode",
        "formula_template": "MODE({value_field})",
    },
    "std_dev": {
        "category": "aggregations",
        "label": "Standard Deviation",
        "description": "Sample standard deviation of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "std",
        "formula_template": "STDEV({value_field})",
    },
    "weighted_average": {
        "category": "aggregations",
        "label": "Weighted Average",
        "description": "Weighted average of a numeric value by a numeric weight.",
        "params": [
            {"key": "value_field", "label": "Value field", "type": "numeric"},
            {"key": "weight_field", "label": "Weight field", "type": "numeric"},
        ],
        "aggregation": "weighted_average",
        "formula_template": "DIVIDE(SUMX({value_field} * {weight_field}), SUM({weight_field}), 0)",
    },
    "division": {
        "category": "mathematical",
        "label": "Division",
        "description": "Divide one numeric field by another (safe - handles zero).",
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
    "same_period_last_year": {
        "category": "time_intelligence",
        "label": "Same Period Last Year",
        "description": "Total for the matching current month in the prior year.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "SAMEPERIODLASTYEAR({value_field}, {date_field})",
    },
    "month_over_month": {
        "category": "time_intelligence",
        "label": "Month-over-Month %",
        "description": "Percent change from the previous month to the current month.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "MOM_PCT({value_field}, {date_field})",
    },
    "quarter_over_quarter": {
        "category": "time_intelligence",
        "label": "Quarter-over-Quarter %",
        "description": "Percent change from the previous quarter to the current quarter.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "QOQ_PCT({value_field}, {date_field})",
    },
    "rolling_12_month": {
        "category": "time_intelligence",
        "label": "Rolling 12 Month",
        "description": "Trailing 12-month total ending at the latest date.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "ROLLING_12_MONTH({value_field}, {date_field})",
    },
    "rolling_6_month": {
        "category": "time_intelligence",
        "label": "Rolling 6 Month",
        "description": "Trailing 6-month total ending at the latest date.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "ROLLING_6_MONTH({value_field}, {date_field})",
    },
    "rolling_3_month": {
        "category": "time_intelligence",
        "label": "Rolling 3 Month",
        "description": "Trailing 3-month total ending at the latest date.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "ROLLING_3_MONTH({value_field}, {date_field})",
    },
    "cagr": {
        "category": "time_intelligence",
        "label": "CAGR",
        "description": "Compound annual growth rate between the first and latest years.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "date_field", "label": "Date column", "type": "datetime"},
        ],
        "aggregation": "sum",
        "formula_template": "CAGR({value_field}, {date_field})",
    },
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
        "description": "Sum of the Top N categories by value.",
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
        "description": "Descending rank of categories by total value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
        ],
        "aggregation": "rank",
        "formula_template": "RANKX({category_field}, SUM({value_field}))",
    },
    "rank_dense": {
        "category": "filtered_values",
        "label": "Dense Rank",
        "description": "Dense descending rank of categories by total value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
        ],
        "aggregation": "rank",
        "formula_template": "RANKX({category_field}, SUM({value_field}), DESC, DENSE)",
    },
    "rank_ascending": {
        "category": "filtered_values",
        "label": "Rank Ascending",
        "description": "Ascending rank of categories by total value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
        ],
        "aggregation": "rank",
        "formula_template": "RANKX({category_field}, SUM({value_field}), ASC)",
    },
    "rank_descending": {
        "category": "filtered_values",
        "label": "Rank Descending",
        "description": "Descending rank of categories by total value.",
        "params": [
            {"key": "value_field", "label": "Value", "type": "numeric"},
            {"key": "category_field", "label": "Category", "type": "categorical"},
        ],
        "aggregation": "rank",
        "formula_template": "RANKX({category_field}, SUM({value_field}), DESC)",
    },
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
    "percentile": {
        "category": "statistics",
        "label": "Percentile",
        "description": "Percentile of a numeric field.",
        "params": [
            {"key": "value_field", "label": "Value field", "type": "numeric"},
            {"key": "percentile", "label": "Percentile", "type": "number", "default": "0.9"},
        ],
        "aggregation": "percentile",
        "formula_template": "PERCENTILE({value_field}, {percentile})",
    },
    "quartile": {
        "category": "statistics",
        "label": "Quartile",
        "description": "Quartile of a numeric field.",
        "params": [
            {"key": "value_field", "label": "Value field", "type": "numeric"},
            {"key": "quartile", "label": "Quartile", "type": "number", "default": "2"},
        ],
        "aggregation": "quartile",
        "formula_template": "QUARTILE({value_field}, {quartile})",
    },
    "variance_population": {
        "category": "statistics",
        "label": "Population Variance",
        "description": "Population variance of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "varp",
        "formula_template": "VAR.P({value_field})",
    },
    "stddev_population": {
        "category": "statistics",
        "label": "Population Standard Deviation",
        "description": "Population standard deviation of a numeric field.",
        "params": [{"key": "value_field", "label": "Value field", "type": "numeric"}],
        "aggregation": "stdp",
        "formula_template": "STDEV.P({value_field})",
    },
    "covariance": {
        "category": "statistics",
        "label": "Covariance",
        "description": "Sample covariance between two numeric fields.",
        "params": [
            {"key": "field_a", "label": "Field A", "type": "numeric"},
            {"key": "field_b", "label": "Field B", "type": "numeric"},
        ],
        "aggregation": "cov",
        "formula_template": "COVARIANCE.S({field_a}, {field_b})",
    },
    "correlation": {
        "category": "statistics",
        "label": "Correlation",
        "description": "Pearson correlation between two numeric fields.",
        "params": [
            {"key": "field_a", "label": "Field A", "type": "numeric"},
            {"key": "field_b", "label": "Field B", "type": "numeric"},
        ],
        "aggregation": "corr",
        "formula_template": "CORREL({field_a}, {field_b})",
    },
}


MeasureResult = Dict[str, Any]
Executor = Callable[[pd.DataFrame, Dict[str, Any], Optional[str]], Any]


class DataUtils:
    """Shared data cleaning, parsing, caching, and validation helpers."""

    _numeric_cache: Dict[Tuple[int, str, int, int], pd.Series] = {}
    _datetime_cache: Dict[Tuple[int, str, int, int], pd.Series] = {}

    @staticmethod
    def clean_numeric(series: pd.Series) -> pd.Series:
        """Convert a Series to numeric values with currency, scale, and accounting support."""
        if not pd.api.types.is_object_dtype(series) and not pd.api.types.is_string_dtype(series):
            return pd.to_numeric(series, errors="coerce")

        raw = series.astype("string").str.strip()
        upper = raw.str.upper()
        cleaned = upper.str.replace(r"[^0-9.\-()KMBT]", "", regex=True)

        negative = cleaned.str.match(r"^\(.*\)$", na=False) | cleaned.str.startswith("-", na=False)
        multiplier = pd.Series(1.0, index=series.index)
        multiplier = multiplier.mask(cleaned.str.endswith("K", na=False), 1_000.0)
        multiplier = multiplier.mask(cleaned.str.endswith("M", na=False), 1_000_000.0)
        multiplier = multiplier.mask(cleaned.str.endswith("B", na=False), 1_000_000_000.0)
        multiplier = multiplier.mask(cleaned.str.endswith("T", na=False), 1_000_000_000_000.0)

        numeric_text = cleaned.str.replace(r"[()KMBT\-]", "", regex=True)
        parsed = pd.to_numeric(numeric_text, errors="coerce") * multiplier
        return parsed.mask(negative, -parsed)

    @classmethod
    def clean_numeric_cached(cls, df: pd.DataFrame, column: str) -> pd.Series:
        """Return a cached cleaned numeric column for repeated executor use."""
        cls.validate_column(df, column)
        source = df[column]
        key = (id(df), column, id(source), len(source))
        cached = cls._numeric_cache.get(key)
        if cached is None:
            cached = cls.clean_numeric(source)
            cls._numeric_cache[key] = cached
        return cached

    @staticmethod
    def clean_datetime(series: pd.Series) -> pd.Series:
        """Convert a Series to pandas datetime values with invalid values coerced to NaT."""
        return pd.to_datetime(series, errors="coerce")

    @classmethod
    def clean_datetime_cached(cls, df: pd.DataFrame, column: str) -> pd.Series:
        """Return a cached cleaned datetime column for repeated executor use."""
        cls.validate_column(df, column)
        source = df[column]
        key = (id(df), column, id(source), len(source))
        cached = cls._datetime_cache.get(key)
        if cached is None:
            cached = cls.clean_datetime(source)
            cls._datetime_cache[key] = cached
        return cached

    @staticmethod
    def safe_divide(a: float, b: float, default: float = 0) -> float:
        """Divide safely and return default when the denominator is zero or missing."""
        if pd.isna(b) or b == 0:
            return float(default)
        return float(a) / float(b)

    @staticmethod
    def validate_column(df: pd.DataFrame, column: str) -> None:
        """Raise a ValueError when a required DataFrame column is missing."""
        if not column or column not in df.columns:
            raise ValueError(f"Column '{column}' not found in dataset.")

    @classmethod
    def clear_cache(cls) -> None:
        """Clear cached cleaned columns."""
        cls._numeric_cache.clear()
        cls._datetime_cache.clear()


class FilterContext:
    """Power BI-style filter context helpers for CALCULATE, FILTER, and KEEPFILTERS."""

    @staticmethod
    def apply_filters(df: pd.DataFrame, filters: Any = None) -> pd.DataFrame:
        """Apply scalar, iterable, range, and operator-based filters to a DataFrame."""
        normalized = list(FilterContext._iter_filters(filters))
        if not normalized:
            return df

        mask = pd.Series(True, index=df.index)
        for column, criteria in normalized:
            DataUtils.validate_column(df, column)
            mask &= FilterContext._mask(df[column], criteria)
        return df.loc[mask]

    @staticmethod
    def calculate(
        df: pd.DataFrame,
        base_filters: Any = None,
        calculate_filters: Any = None,
        keep_filters: bool = True,
    ) -> pd.DataFrame:
        """Apply CALCULATE filter semantics with optional KEEPFILTERS intersection."""
        if keep_filters:
            return FilterContext.apply_filters(FilterContext.apply_filters(df, base_filters), calculate_filters)

        merged = FilterContext._merge_overwrite(base_filters, calculate_filters)
        return FilterContext.apply_filters(df, merged)

    @staticmethod
    def keepfilters(base_filters: Any, additional_filters: Any) -> List[Tuple[str, Any]]:
        """Return filters that should be intersected, matching Power BI KEEPFILTERS intent."""
        return list(FilterContext._iter_filters(base_filters)) + list(FilterContext._iter_filters(additional_filters))

    @staticmethod
    def _iter_filters(filters: Any) -> Iterable[Tuple[str, Any]]:
        if not filters:
            return
        if isinstance(filters, tuple) and len(filters) == 2 and isinstance(filters[0], str):
            yield filters[0], filters[1]
            return
        if isinstance(filters, Mapping):
            if "column" in filters and ("value" in filters or "values" in filters):
                yield str(filters["column"]), filters.get("value", filters.get("values"))
                return
            for column, criteria in filters.items():
                yield str(column), criteria
            return
        if isinstance(filters, Sequence) and not isinstance(filters, (str, bytes)):
            for item in filters:
                yield from FilterContext._iter_filters(item)

    @staticmethod
    def _merge_overwrite(base_filters: Any, calculate_filters: Any) -> Dict[str, Any]:
        merged: Dict[str, Any] = {}
        for column, criteria in FilterContext._iter_filters(base_filters):
            merged[column] = criteria
        for column, criteria in FilterContext._iter_filters(calculate_filters):
            merged[column] = criteria
        return merged

    @staticmethod
    def _mask(series: pd.Series, criteria: Any) -> pd.Series:
        if callable(criteria):
            return series.apply(criteria).fillna(False).astype(bool)

        if isinstance(criteria, Mapping):
            op = str(criteria.get("op", criteria.get("operator", "eq"))).lower()
            value = criteria.get("value", criteria.get("values"))
            if op in {"eq", "=", "=="}:
                return FilterContext._equals(series, value)
            if op in {"ne", "!=", "<>"}:
                return ~FilterContext._equals(series, value)
            if op in {"in", "isin"}:
                return series.isin(list(value if isinstance(value, Iterable) and not isinstance(value, str) else [value]))
            if op in {"not_in", "notin"}:
                return ~series.isin(list(value if isinstance(value, Iterable) and not isinstance(value, str) else [value]))
            if op in {"gt", ">"}:
                return series > value
            if op in {"gte", ">="}:
                return series >= value
            if op in {"lt", "<"}:
                return series < value
            if op in {"lte", "<="}:
                return series <= value
            if op == "between":
                low, high = value
                return (series >= low) & (series <= high)
            if op == "contains":
                return series.astype(str).str.contains(str(value), case=False, na=False)
            raise ValueError(f"Unsupported filter operator: {op}")

        if isinstance(criteria, tuple) and len(criteria) == 2:
            low, high = criteria
            mask = pd.Series(True, index=series.index)
            if low is not None:
                mask &= series >= low
            if high is not None:
                mask &= series <= high
            return mask

        if isinstance(criteria, (list, set, frozenset)):
            return series.isin(list(criteria))

        return FilterContext._equals(series, criteria)

    @staticmethod
    def _equals(series: pd.Series, value: Any) -> pd.Series:
        mask = series == value
        if mask.any() or not isinstance(value, str):
            return mask.fillna(False)
        return (series.astype(str).str.strip().str.lower() == value.strip().lower()).fillna(False)

    CALCULATE = calculate
    FILTER = apply_filters
    KEEPFILTERS = keepfilters


def _round(value: Any, digits: int = 4) -> Any:
    """Round numeric scalar results while preserving non-numeric values."""
    if value is None:
        return None
    if isinstance(value, pd.Series):
        return value.round(digits)
    if isinstance(value, dict):
        return {key: _round(val, digits) for key, val in value.items()}
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (int, float)):
        return round(float(value), digits)
    return _to_python(value)


def _to_python(value: Any) -> Any:
    """Convert pandas/numpy scalars and nested structures to Python-native values."""
    if isinstance(value, dict):
        return {_to_key(key): _to_python(val) for key, val in value.items()}
    if isinstance(value, pd.Series):
        return _to_python(value.to_dict())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            return value
    return value


def _to_key(value: Any) -> Any:
    """Normalize result dictionary keys."""
    if pd.isna(value):
        return None
    return _to_python(value)


def _numeric(df: pd.DataFrame, column: str) -> pd.Series:
    """Return a cached cleaned numeric Series for an existing column."""
    return DataUtils.clean_numeric_cached(df, column)


def _datetime(df: pd.DataFrame, column: str) -> pd.Series:
    """Return a cached cleaned datetime Series for an existing column."""
    return DataUtils.clean_datetime_cached(df, column)


def _sum(df: pd.DataFrame, column: str) -> float:
    """Return the numeric sum for a column."""
    return float(_numeric(df, column).sum())


def _mean(df: pd.DataFrame, column: str) -> float:
    """Return the numeric mean for a column."""
    return float(_numeric(df, column).mean())


def _int_param(field_mappings: Mapping[str, Any], key: str, default: int) -> int:
    """Read an integer parameter from field mappings with a sane default."""
    try:
        return int(field_mappings.get(key, default))
    except (TypeError, ValueError):
        return default


def _float_param(field_mappings: Mapping[str, Any], key: str, default: float) -> float:
    """Read a float parameter from field mappings with a sane default."""
    try:
        return float(field_mappings.get(key, default))
    except (TypeError, ValueError):
        return default


def _bool_param(value: Any, default: bool = True) -> bool:
    """Parse common boolean values."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in {"false", "0", "no", "off"}


def _value_field(field_mappings: Mapping[str, Any]) -> str:
    """Resolve the primary value field used by most scalar executors."""
    return str(
        field_mappings.get("value_field")
        or field_mappings.get("numerator")
        or field_mappings.get("actual_field")
        or field_mappings.get("current_field")
        or field_mappings.get("part_field")
        or ""
    )


def _grouped_numeric(df: pd.DataFrame, value_field: str, group_by: Optional[str], aggregation: str) -> Optional[Dict[Any, Any]]:
    """Run a grouped numeric aggregation when group context is present."""
    if not group_by:
        return None
    DataUtils.validate_column(df, group_by)
    series = _numeric(df, value_field)
    grouped = series.groupby(df[group_by], dropna=False)
    if aggregation == "sum":
        result = grouped.sum()
    elif aggregation in {"mean", "average"}:
        result = grouped.mean()
    elif aggregation == "min":
        result = grouped.min()
    elif aggregation == "max":
        result = grouped.max()
    elif aggregation == "median":
        result = grouped.median()
    elif aggregation == "std":
        result = grouped.std()
    elif aggregation == "varp":
        result = grouped.var(ddof=0)
    elif aggregation == "stdp":
        result = grouped.std(ddof=0)
    else:
        raise ValueError(f"Unsupported grouped numeric aggregation: {aggregation}")
    return _round({_to_key(key): val for key, val in result.items()})


def _grouped_count(df: pd.DataFrame, value_field: str, group_by: Optional[str], distinct: bool = False) -> Optional[Dict[Any, Any]]:
    """Run grouped count or distinct count when group context is present."""
    if not group_by:
        return None
    DataUtils.validate_column(df, value_field)
    DataUtils.validate_column(df, group_by)
    grouped = df[value_field].groupby(df[group_by], dropna=False)
    result = grouped.nunique() if distinct else grouped.count()
    return {_to_key(key): float(val) for key, val in result.items()}


def _grouped_mode(df: pd.DataFrame, value_field: str, group_by: Optional[str]) -> Optional[Dict[Any, Any]]:
    """Run grouped mode when group context is present."""
    if not group_by:
        return None
    DataUtils.validate_column(df, value_field)
    DataUtils.validate_column(df, group_by)
    result: Dict[Any, Any] = {}
    for key, group in df.groupby(group_by, dropna=False):
        modes = group[value_field].dropna().mode()
        result[_to_key(key)] = None if modes.empty else _to_python(modes.iloc[0])
    return result


def _category_totals(df: pd.DataFrame, category_field: str, value_field: str) -> pd.Series:
    """Aggregate value totals by category."""
    DataUtils.validate_column(df, category_field)
    values = _numeric(df, value_field)
    return values.groupby(df[category_field], dropna=False).sum()


def _filtered_frame(df: pd.DataFrame, column: str, raw_value: Any) -> pd.DataFrame:
    """Filter a DataFrame by exact, case-insensitive, then contains matching."""
    DataUtils.validate_column(df, column)
    filter_value = str(raw_value or "").strip()
    col_str = df[column].astype(str).str.strip()
    mask = col_str == filter_value
    if mask.sum() == 0:
        mask = col_str.str.lower() == filter_value.lower()
    if mask.sum() == 0 and filter_value:
        mask = col_str.str.lower().str.contains(filter_value.lower(), na=False)
    return df.loc[mask]


def _time_series(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> Tuple[pd.Series, pd.Series]:
    """Return aligned cleaned value and date Series for time-intelligence measures."""
    value_field = _value_field(field_mappings)
    date_field = str(field_mappings.get("date_field", ""))
    values = _numeric(df, value_field)
    dates = _datetime(df, date_field)
    valid = dates.notna()
    if not valid.any():
        raise ValueError("Date field has no valid dates.")
    return values.loc[valid], dates.loc[valid]


def _period_mask(dates: pd.Series, year: int, month: Optional[int] = None, quarter: Optional[int] = None) -> pd.Series:
    """Build a period mask over a datetime Series."""
    mask = dates.dt.year == year
    if month is not None:
        mask &= dates.dt.month == month
    if quarter is not None:
        mask &= dates.dt.quarter == quarter
    return mask


def _monthly_total(values: pd.Series, dates: pd.Series, timestamp: pd.Timestamp) -> float:
    """Return total for a calendar month."""
    mask = _period_mask(dates, timestamp.year, month=timestamp.month)
    return float(values.loc[mask].sum())


class TimeIntelligence:
    """Power BI-style time-intelligence calculations over cleaned pandas data."""

    @staticmethod
    def ytd(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return year-to-date total based on the latest date in the data."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        start = pd.Timestamp(year=latest.year, month=1, day=1)
        return float(values.loc[(dates >= start) & (dates <= latest)].sum())

    @staticmethod
    def mtd(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return month-to-date total based on the latest date in the data."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        start = pd.Timestamp(year=latest.year, month=latest.month, day=1)
        return float(values.loc[(dates >= start) & (dates <= latest)].sum())

    @staticmethod
    def qtd(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return quarter-to-date total based on the latest date in the data."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        quarter_start_month = ((latest.month - 1) // 3) * 3 + 1
        start = pd.Timestamp(year=latest.year, month=quarter_start_month, day=1)
        return float(values.loc[(dates >= start) & (dates <= latest)].sum())

    @staticmethod
    def previous_month(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return the total for the calendar month before the latest date."""
        values, dates = _time_series(df, field_mappings)
        previous = dates.max() - pd.DateOffset(months=1)
        return _monthly_total(values, dates, previous)

    @staticmethod
    def previous_year(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return the total for the full year before the latest date's year."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        return float(values.loc[dates.dt.year == latest.year - 1].sum())

    @staticmethod
    def rolling_average(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return the latest row-based rolling average over the requested number of periods."""
        periods = max(_int_param(field_mappings, "periods", 3), 1)
        values, dates = _time_series(df, field_mappings)
        ordered = values.loc[dates.sort_values().index]
        result = ordered.rolling(periods).mean().iloc[-1] if not ordered.empty else 0.0
        return float(0.0 if pd.isna(result) else result)

    @staticmethod
    def growth_percent(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return percent growth from the prior year to the latest year."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        current = float(values.loc[dates.dt.year == latest.year].sum())
        prior = float(values.loc[dates.dt.year == latest.year - 1].sum())
        return DataUtils.safe_divide(current - prior, abs(prior), 0) * 100

    @staticmethod
    def yoy_change(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return absolute year-over-year change for the latest year."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        current = float(values.loc[dates.dt.year == latest.year].sum())
        prior = float(values.loc[dates.dt.year == latest.year - 1].sum())
        return current - prior

    @staticmethod
    def period_comparison(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return current month total minus the month offset by offset_periods."""
        offset = max(_int_param(field_mappings, "offset_periods", 1), 1)
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        previous = latest - pd.DateOffset(months=offset)
        return _monthly_total(values, dates, latest) - _monthly_total(values, dates, previous)

    @staticmethod
    def same_period_last_year(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return total for the latest month shifted one year back."""
        values, dates = _time_series(df, field_mappings)
        previous_year_period = dates.max() - pd.DateOffset(years=1)
        return _monthly_total(values, dates, previous_year_period)

    @staticmethod
    def month_over_month(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return percentage change from previous month to latest month."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        current = _monthly_total(values, dates, latest)
        previous = _monthly_total(values, dates, latest - pd.DateOffset(months=1))
        return DataUtils.safe_divide(current - previous, abs(previous), 0) * 100

    @staticmethod
    def quarter_over_quarter(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return percentage change from previous quarter to latest quarter."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        current_mask = _period_mask(dates, latest.year, quarter=latest.quarter)
        previous = latest - pd.DateOffset(months=3)
        previous_mask = _period_mask(dates, previous.year, quarter=previous.quarter)
        current_total = float(values.loc[current_mask].sum())
        previous_total = float(values.loc[previous_mask].sum())
        return DataUtils.safe_divide(current_total - previous_total, abs(previous_total), 0) * 100

    @staticmethod
    def rolling_month(df: pd.DataFrame, field_mappings: Mapping[str, Any], months: int) -> float:
        """Return trailing N-month total ending at the latest date."""
        values, dates = _time_series(df, field_mappings)
        latest = dates.max()
        start = latest - pd.DateOffset(months=months - 1)
        start = pd.Timestamp(year=start.year, month=start.month, day=1)
        return float(values.loc[(dates >= start) & (dates <= latest)].sum())

    @staticmethod
    def cagr(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> float:
        """Return compound annual growth rate using first and latest annual totals."""
        values, dates = _time_series(df, field_mappings)
        yearly = values.groupby(dates.dt.year).sum().sort_index()
        if len(yearly) < 2:
            return 0.0
        start_value = float(yearly.iloc[0])
        end_value = float(yearly.iloc[-1])
        years = int(yearly.index[-1] - yearly.index[0])
        if start_value <= 0 or years <= 0:
            return 0.0
        return ((end_value / start_value) ** (1 / years) - 1) * 100


def _extract_filters(field_mappings: Mapping[str, Any]) -> Tuple[Any, Any, bool]:
    """Extract base filters, CALCULATE filters, and KEEPFILTERS behavior."""
    base_filters = FilterContext.keepfilters(field_mappings.get("filters"), field_mappings.get("filter_context"))
    base_filters = FilterContext.keepfilters(base_filters, field_mappings.get("FILTER"))
    calculate_filters = (
        field_mappings.get("calculate_filters")
        or field_mappings.get("calculate")
        or field_mappings.get("CALCULATE")
    )
    keep_filters = _bool_param(
        field_mappings.get("keepfilters", field_mappings.get("keep_filters", field_mappings.get("KEEPFILTERS"))),
        True,
    )
    return base_filters, calculate_filters, keep_filters


def _apply_filter_context(df: pd.DataFrame, field_mappings: Mapping[str, Any]) -> pd.DataFrame:
    """Apply Power BI-style filter context before measure execution."""
    base_filters, calculate_filters, keep_filters = _extract_filters(field_mappings)
    return FilterContext.calculate(df, base_filters, calculate_filters, keep_filters)


def _validate_execution_schema(df: pd.DataFrame, tmpl: Dict[str, Any], field_mappings: Mapping[str, Any]) -> None:
    """Validate required mapped DataFrame columns before an executor runs."""
    for param in tmpl.get("params", []):
        key = param["key"]
        expected = param.get("type", "any")
        value = field_mappings.get(key) or param.get("default")

        if value in (None, "") and "default" not in param:
            raise ValueError(f"Missing required field: {param['label']}")

        if expected in {"text", "number"}:
            continue

        DataUtils.validate_column(df, str(value))
        if expected == "numeric":
            if df.empty:
                continue
            numeric = DataUtils.clean_numeric_cached(df, str(value))
            non_empty = df[str(value)].notna() & (df[str(value)].astype("string").str.strip() != "")
            populated_count = int(non_empty.sum())
            numeric_count = int(numeric.notna().sum())
            if populated_count == 0 or numeric_count == 0:
                raise ValueError(f"Field '{value}' (used for '{param['label']}') must contain numeric values.")
            if numeric_count / populated_count < 0.8:
                raise ValueError(f"Field '{value}' (used for '{param['label']}') is not numeric enough for this measure.")


def _success(value: Any) -> MeasureResult:
    """Create a standardized successful API response."""
    return {"result": _to_python(value), "error": None}


def _failure(message: str) -> MeasureResult:
    """Create a standardized failed API response."""
    return {"result": None, "error": message}


MEASURE_REGISTRY: Dict[str, Any] = {}


class MeasureRegistry:
    """Registry for reusable calculated measures and expression-based measure chains."""

    @classmethod
    def register(cls, name: str, definition: Any) -> None:
        """Register a named measure definition."""
        if not name:
            raise ValueError("Measure name is required.")
        MEASURE_REGISTRY[str(name)] = definition

    @classmethod
    def register_many(cls, definitions: Mapping[str, Any]) -> None:
        """Register multiple named measures."""
        for name, definition in definitions.items():
            cls.register(str(name), definition)

    @classmethod
    def clear(cls) -> None:
        """Remove all registered measures."""
        MEASURE_REGISTRY.clear()

    @classmethod
    def has(cls, name: str, local_measures: Optional[Mapping[str, Any]] = None) -> bool:
        """Return whether a measure exists in local or global scope."""
        return (local_measures is not None and name in local_measures) or name in MEASURE_REGISTRY

    @classmethod
    def resolve(
        cls,
        name: str,
        df: pd.DataFrame,
        field_mappings: Mapping[str, Any],
        group_by: Optional[str] = None,
        stack: Optional[List[str]] = None,
        row_wise: bool = False,
    ) -> Any:
        """Resolve a measure, its dependencies, and circular reference errors."""
        stack = stack or []
        if name in stack:
            chain = " -> ".join(stack + [name])
            raise ValueError(f"Circular measure reference detected: {chain}")

        local_measures = _local_measures(field_mappings)
        definition = local_measures.get(name, MEASURE_REGISTRY.get(name))
        if definition is None:
            raise ValueError(f"Unknown measure: {name}")

        return cls._resolve_definition(name, definition, df, field_mappings, group_by, stack + [name], row_wise=row_wise)

    @classmethod
    def _resolve_definition(
        cls,
        name: str,
        definition: Any,
        df: pd.DataFrame,
        field_mappings: Mapping[str, Any],
        group_by: Optional[str],
        stack: List[str],
        row_wise: bool = False,
    ) -> Any:
        if isinstance(definition, (int, float)):
            return float(definition)

        if isinstance(definition, str):
            return _evaluate_measure_expression(definition, df, field_mappings, group_by, stack, row_wise=row_wise)

        if not isinstance(definition, Mapping):
            raise ValueError(f"Invalid measure definition for '{name}'.")

        merged_mappings: Dict[str, Any] = dict(field_mappings)
        merged_mappings.update(definition.get("field_mappings", {}))
        if "measures" in field_mappings and "measures" not in merged_mappings:
            merged_mappings["measures"] = field_mappings["measures"]

        if "expression" in definition:
            measure_df = _apply_filter_context(df, merged_mappings)
            return _evaluate_measure_expression(str(definition["expression"]), measure_df, merged_mappings, group_by, stack, row_wise=row_wise)

        template_id = definition.get("template_id")
        if template_id:
            measure_df = _apply_filter_context(df, merged_mappings)
            return _execute_template_internal(measure_df, str(template_id), merged_mappings, group_by)

        raise ValueError(f"Invalid measure definition for '{name}'.")


def _local_measures(field_mappings: Mapping[str, Any]) -> Mapping[str, Any]:
    """Return local measure definitions provided in field mappings."""
    measures = field_mappings.get("measures") or field_mappings.get("measure_registry") or {}
    if isinstance(measures, Mapping):
        return measures
    return {}


class _MeasureExpressionEvaluator(ast.NodeVisitor):
    """Safe arithmetic evaluator for chained measure expressions."""

    def __init__(
        self,
        df: pd.DataFrame,
        field_mappings: Mapping[str, Any],
        group_by: Optional[str],
        stack: List[str],
        mappings: Optional[Dict[str, str]] = None,
        row_wise: bool = False,
    ) -> None:
        self.df = df
        self.field_mappings = field_mappings
        self.group_by = group_by
        self.stack = stack
        self.mappings = mappings or {}
        self.row_wise = row_wise

    def visit_Expression(self, node: ast.Expression) -> Any:
        return self.visit(node.body)

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        left = self.visit(node.left)
        right = self.visit(node.right)
        if isinstance(node.op, ast.Add):
            return _binary(left, right, lambda a, b: a + b)
        if isinstance(node.op, ast.Sub):
            return _binary(left, right, lambda a, b: a - b)
        if isinstance(node.op, ast.Mult):
            return _binary(left, right, lambda a, b: a * b)
        if isinstance(node.op, ast.Div):
            return _binary(left, right, lambda a, b: DataUtils.safe_divide(a, b, 0), is_div=True, default=0.0)
        raise ValueError("Unsupported measure expression operator.")

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        value = self.visit(node.operand)
        if isinstance(node.op, ast.USub):
            return _binary(0, value, lambda a, b: a - b)
        if isinstance(node.op, ast.UAdd):
            return value
        raise ValueError("Unsupported unary operator.")

    def visit_Name(self, node: ast.Name) -> Any:
        name = node.id
        if self.mappings and name in self.mappings:
            name = self.mappings[name]
        if MeasureRegistry.has(name, _local_measures(self.field_mappings)):
            return MeasureRegistry.resolve(name, self.df, self.field_mappings, self.group_by, self.stack, row_wise=self.row_wise)
        if name in self.df.columns:
            if self.group_by:
                grouped = _grouped_numeric(self.df, name, self.group_by, "sum")
                return grouped or {}
            if self.row_wise:
                return self.df[name]
            return _sum(self.df, name)
        raise ValueError(f"Unknown measure or column reference: {name}")

    def visit_Constant(self, node: ast.Constant) -> Any:
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("Only numeric constants are supported in measure expressions.")

    def visit_Call(self, node: ast.Call) -> Any:
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only simple function calls are supported in measure expressions.")
        
        func_name = node.func.id.upper()
        if func_name == "DIVIDE":
            if len(node.args) not in {2, 3}:
                raise ValueError("DIVIDE() expects two or three arguments.")
            numerator = self.visit(node.args[0])
            denominator = self.visit(node.args[1])
            default = self.visit(node.args[2]) if len(node.args) == 3 else 0.0
            return _binary(numerator, denominator, lambda a, b: DataUtils.safe_divide(a, b, default), is_div=True, default=default)
        
        if func_name in ("SUM", "AVG", "AVERAGE", "MIN", "MAX", "MEDIAN", "MODE", "COUNT"):
            if len(node.args) != 1:
                raise ValueError(f"{func_name}() expects exactly one argument.")
            arg = node.args[0]
            
            # Resolve the argument if it's a field or measure reference
            if isinstance(arg, ast.Name):
                name = arg.id
                if self.mappings and name in self.mappings:
                    name = self.mappings[name]
                
                if MeasureRegistry.has(name, _local_measures(self.field_mappings)):
                    return MeasureRegistry.resolve(name, self.df, self.field_mappings, self.group_by, self.stack, row_wise=self.row_wise)
                
                if name in self.df.columns:
                    agg_map = {
                        "SUM": "sum",
                        "AVG": "mean",
                        "AVERAGE": "mean",
                        "MIN": "min",
                        "MAX": "max",
                        "MEDIAN": "median",
                        "MODE": "mode",
                        "COUNT": "count"
                    }
                    agg_method = agg_map[func_name]
                    if self.group_by:
                        if agg_method == "count":
                            return _grouped_count(self.df, name, self.group_by) or {}
                        elif agg_method == "mode":
                            return _grouped_mode(self.df, name, self.group_by) or {}
                        else:
                            grouped = _grouped_numeric(self.df, name, self.group_by, agg_method)
                            return grouped or {}
                    if self.row_wise:
                        return self.df[name]
                    
                    if agg_method == "sum":
                        return _sum(self.df, name)
                    elif agg_method in ("mean", "average"):
                        return _mean(self.df, name)
                    elif agg_method == "min":
                        return float(_numeric(self.df, name).min())
                    elif agg_method == "max":
                        return float(_numeric(self.df, name).max())
                    elif agg_method == "median":
                        return float(_numeric(self.df, name).median())
                    elif agg_method == "mode":
                        mode_series = _numeric(self.df, name).mode()
                        return float(mode_series.iloc[0]) if not mode_series.empty else 0.0
                    elif agg_method == "count":
                        return float(self.df[name].count())
            
            return self.visit(arg)
            
        raise ValueError(f"Unsupported function call: {func_name}() in measure expressions.")

    def generic_visit(self, node: ast.AST) -> Any:
        raise ValueError(f"Unsupported measure expression syntax: {type(node).__name__}")


def _evaluate_measure_expression(
    expression: str,
    df: pd.DataFrame,
    field_mappings: Mapping[str, Any],
    group_by: Optional[str],
    stack: List[str],
    row_wise: bool = False,
) -> Any:
    """Evaluate a safe arithmetic expression that references measures or columns."""
    import re
    bracket_pattern = re.compile(r'\[([^\]]+)\]')
    mappings = {}
    normalized_expr = expression
    
    bracketed_terms = bracket_pattern.findall(expression)
    for idx, term in enumerate(bracketed_terms):
        safe_id = f"__safe_ref_{idx}"
        mappings[safe_id] = term
        normalized_expr = normalized_expr.replace(f"[{term}]", safe_id)
        
    tree = ast.parse(normalized_expr, mode="eval")
    result = _MeasureExpressionEvaluator(df, field_mappings, group_by, stack, mappings, row_wise=row_wise).visit(tree)
    return _round(result)


def _safe_divide_series(a: Any, b: Any, default: float = 0.0) -> Any:
    import pandas as pd
    import numpy as np
    a_ser = a if isinstance(a, pd.Series) else pd.Series(a, index=b.index if isinstance(b, pd.Series) else None)
    b_ser = b if isinstance(b, pd.Series) else pd.Series(b, index=a.index if isinstance(a, pd.Series) else None)
    denominator = b_ser.astype(float)
    numerator = a_ser.astype(float)
    mask = (denominator == 0) | denominator.isna() | numerator.isna()
    result = np.where(mask, float(default), numerator / denominator)
    return pd.Series(result, index=a_ser.index)


def _binary(left: Any, right: Any, operation: Callable[[float, float], float], is_div: bool = False, default: float = 0.0) -> Any:
    """Apply a binary numeric operation to scalars, series or aligned dictionaries."""
    import pandas as pd
    if isinstance(left, pd.Series) or isinstance(right, pd.Series):
        if is_div:
            return _safe_divide_series(left, right, default)
        return operation(left, right)
    if isinstance(left, Mapping) or isinstance(right, Mapping):
        left_dict = left if isinstance(left, Mapping) else {}
        right_dict = right if isinstance(right, Mapping) else {}
        keys = set(left_dict.keys()) | set(right_dict.keys())
        return {
            key: _round(operation(float(left_dict.get(key, left if not isinstance(left, Mapping) else 0) or 0), float(right_dict.get(key, right if not isinstance(right, Mapping) else 0) or 0)))
            for key in keys
        }
    return _round(operation(float(left or 0), float(right or 0)))


def _execute_template_internal(
    df: pd.DataFrame,
    template_id: str,
    field_mappings: Mapping[str, Any],
    group_by: Optional[str] = None,
) -> Any:
    """Validate and execute a registered template without applying external filters."""
    tmpl = TEMPLATE_CATALOGUE.get(template_id)
    if not tmpl:
        raise ValueError(f"Unknown template: {template_id}")
    executor = EXECUTOR_REGISTRY.get(template_id)
    if not executor:
        raise ValueError(f"No executor registered for template: {template_id}")
    _validate_execution_schema(df, tmpl, field_mappings)
    return executor(df, dict(field_mappings), group_by)


def execute_sum(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a sum aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "sum")
    return grouped if grouped is not None else _round(_sum(df, str(field_mappings.get("value_field", ""))))


def execute_average(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute an average aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "mean")
    return grouped if grouped is not None else _round(_mean(df, str(field_mappings.get("value_field", ""))))


def execute_min(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a minimum aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "min")
    return grouped if grouped is not None else _round(float(_numeric(df, str(field_mappings.get("value_field", ""))).min()))


def execute_max(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a maximum aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "max")
    return grouped if grouped is not None else _round(float(_numeric(df, str(field_mappings.get("value_field", ""))).max()))


def execute_count(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a non-null count aggregation."""
    column = str(field_mappings.get("value_field", ""))
    grouped = _grouped_count(df, column, group_by)
    if grouped is not None:
        return grouped
    DataUtils.validate_column(df, column)
    return float(df[column].count())


def execute_distinct_count(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a distinct non-null count aggregation."""
    column = str(field_mappings.get("value_field", ""))
    grouped = _grouped_count(df, column, group_by, distinct=True)
    if grouped is not None:
        return grouped
    DataUtils.validate_column(df, column)
    return float(df[column].nunique())


def execute_median(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a median aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "median")
    return grouped if grouped is not None else _round(float(_numeric(df, str(field_mappings.get("value_field", ""))).median()))


def execute_mode(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a mode aggregation and return the first mode value."""
    column = str(field_mappings.get("value_field", ""))
    grouped = _grouped_mode(df, column, group_by)
    if grouped is not None:
        return grouped
    DataUtils.validate_column(df, column)
    modes = df[column].dropna().mode()
    return None if modes.empty else _to_python(modes.iloc[0])


def execute_std_dev(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a sample standard deviation aggregation."""
    grouped = _grouped_numeric(df, str(field_mappings.get("value_field", "")), group_by, "std")
    return grouped if grouped is not None else _round(float(_numeric(df, str(field_mappings.get("value_field", ""))).std()))


def execute_weighted_average(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a weighted average aggregation."""
    value_field = str(field_mappings.get("value_field", ""))
    weight_field = str(field_mappings.get("weight_field", ""))
    values = _numeric(df, value_field)
    weights = _numeric(df, weight_field)
    valid = values.notna() & weights.notna()

    if group_by:
        DataUtils.validate_column(df, group_by)
        numerator = (values[valid] * weights[valid]).groupby(df.loc[valid, group_by], dropna=False).sum()
        denominator = weights[valid].groupby(df.loc[valid, group_by], dropna=False).sum()
        return {
            _to_key(key): _round(DataUtils.safe_divide(float(numerator.get(key, 0.0)), float(denominator.get(key, 0.0)), 0))
            for key in denominator.index
        }

    numerator = float((values[valid] * weights[valid]).sum())
    denominator = float(weights[valid].sum())
    return _round(DataUtils.safe_divide(numerator, denominator, 0))


def execute_division(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(numerator) divided by sum(denominator)."""
    numerator_field = str(field_mappings.get("numerator", ""))
    denominator_field = str(field_mappings.get("denominator", ""))
    if group_by:
        numerator = _grouped_numeric(df, numerator_field, group_by, "sum") or {}
        denominator = _grouped_numeric(df, denominator_field, group_by, "sum") or {}
        return _binary(numerator, denominator, lambda a, b: DataUtils.safe_divide(a, b, 0))
    return _round(DataUtils.safe_divide(_sum(df, numerator_field), _sum(df, denominator_field), 0))


def execute_percentage(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(value) divided by sum(total), expressed as a percentage."""
    value_field = str(field_mappings.get("value_field", ""))
    total_field = str(field_mappings.get("total_field", ""))
    if group_by:
        value = _grouped_numeric(df, value_field, group_by, "sum") or {}
        total = _grouped_numeric(df, total_field, group_by, "sum") or {}
        return _binary(value, total, lambda a, b: DataUtils.safe_divide(a, b, 0) * 100)
    return _round(DataUtils.safe_divide(_sum(df, value_field), _sum(df, total_field), 0) * 100)


def execute_ratio(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(part) divided by sum(whole)."""
    part_field = str(field_mappings.get("part_field", ""))
    whole_field = str(field_mappings.get("whole_field", ""))
    if group_by:
        part = _grouped_numeric(df, part_field, group_by, "sum") or {}
        whole = _grouped_numeric(df, whole_field, group_by, "sum") or {}
        return _binary(part, whole, lambda a, b: round(DataUtils.safe_divide(a, b, 0), 6))
    return round(DataUtils.safe_divide(_sum(df, part_field), _sum(df, whole_field), 0), 6)


def execute_difference(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(field_a) minus sum(field_b)."""
    field_a = str(field_mappings.get("field_a", ""))
    field_b = str(field_mappings.get("field_b", ""))
    if group_by:
        return _binary(_grouped_numeric(df, field_a, group_by, "sum") or {}, _grouped_numeric(df, field_b, group_by, "sum") or {}, lambda a, b: a - b)
    return _round(_sum(df, field_a) - _sum(df, field_b))


def execute_variance(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(actual) minus sum(target)."""
    field_a = str(field_mappings.get("actual_field", ""))
    field_b = str(field_mappings.get("target_field", ""))
    if group_by:
        return _binary(_grouped_numeric(df, field_a, group_by, "sum") or {}, _grouped_numeric(df, field_b, group_by, "sum") or {}, lambda a, b: a - b)
    return _round(_sum(df, field_a) - _sum(df, field_b))


def execute_percentage_change(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute percentage change from prior/reference value to current value."""
    current_field = str(field_mappings.get("current_field", ""))
    prior_field = str(field_mappings.get("prior_field", ""))
    if group_by:
        current = _grouped_numeric(df, current_field, group_by, "sum") or {}
        prior = _grouped_numeric(df, prior_field, group_by, "sum") or {}
        return _binary(current, prior, lambda a, b: DataUtils.safe_divide(a - b, abs(b), 0) * 100)
    current = _sum(df, current_field)
    prior = _sum(df, prior_field)
    return _round(DataUtils.safe_divide(current - prior, abs(prior), 0) * 100)


def execute_running_total(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute a running total and return the final cumulative value."""
    value_field = str(field_mappings.get("value_field", ""))
    date_field = str(field_mappings.get("date_field", ""))
    series = _numeric(df, value_field)
    if group_by:
        DataUtils.validate_column(df, group_by)
        totals = series.groupby(df[group_by], dropna=False).sum()
        return _round({_to_key(key): value for key, value in totals.items()})
    if date_field in df.columns:
        series = series.loc[_datetime(df, date_field).sort_values().index]
    series = series.dropna()
    return _round(float(series.cumsum().iloc[-1]) if not series.empty else 0.0)


def execute_filtered_aggregation(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(value) for rows matching filter_field/filter_value."""
    filtered = _filtered_frame(df, str(field_mappings.get("filter_field", "")), field_mappings.get("filter_value", ""))
    return execute_sum(filtered, field_mappings, group_by)


def execute_conditional_measure(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sum(value) for rows matching condition_field/condition_value."""
    value_field = str(field_mappings.get("value_field", ""))
    condition_value = str(field_mappings.get("condition_value", "")).strip()
    DataUtils.validate_column(df, value_field)
    if not condition_value:
        return execute_sum(df, field_mappings, group_by)
    filtered = _filtered_frame(df, str(field_mappings.get("condition_field", "")), condition_value)
    return execute_sum(filtered, field_mappings, group_by)


def execute_top_n(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Dict[Any, float]:
    """Execute sum of the top N categories by aggregated value."""
    n = max(_int_param(field_mappings, "n", 5), 0)
    totals = _category_totals(df, str(field_mappings.get("category_field", "")), str(field_mappings.get("value_field", "")))
    top = totals.sort_values(ascending=False).head(n)
    return _round({_to_key(key): value for key, value in top.items()})


def _execute_rank(df: pd.DataFrame, field_mappings: Dict[str, Any], ascending: bool, method: str) -> Dict[Any, int]:
    """Rank categories by aggregated value."""
    totals = _category_totals(df, str(field_mappings.get("category_field", "")), str(field_mappings.get("value_field", "")))
    ranks = totals.rank(method=method, ascending=ascending).astype(int)
    order = ranks.sort_values(kind="stable")
    return {_to_key(key): int(ranks.loc[key]) for key in order.index}


def execute_rank(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Dict[Any, int]:
    """Execute descending rank of categories by total value."""
    return _execute_rank(df, field_mappings, ascending=False, method="min")


def execute_rank_dense(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Dict[Any, int]:
    """Execute dense descending rank of categories by total value."""
    return _execute_rank(df, field_mappings, ascending=False, method="dense")


def execute_rank_ascending(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Dict[Any, int]:
    """Execute ascending rank of categories by total value."""
    return _execute_rank(df, field_mappings, ascending=True, method="min")


def execute_rank_descending(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Dict[Any, int]:
    """Execute descending rank of categories by total value."""
    return _execute_rank(df, field_mappings, ascending=False, method="min")


def execute_mtd(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute month-to-date total."""
    return _round(TimeIntelligence.mtd(df, field_mappings))


def execute_qtd(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute quarter-to-date total."""
    return _round(TimeIntelligence.qtd(df, field_mappings))


def execute_ytd(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute year-to-date total."""
    return _round(TimeIntelligence.ytd(df, field_mappings))


def execute_previous_month(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute previous-month total."""
    return _round(TimeIntelligence.previous_month(df, field_mappings))


def execute_previous_year(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute previous-year total."""
    return _round(TimeIntelligence.previous_year(df, field_mappings))


def execute_rolling_average(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute rolling average."""
    return _round(TimeIntelligence.rolling_average(df, field_mappings))


def execute_growth_percent(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute growth percentage."""
    return _round(TimeIntelligence.growth_percent(df, field_mappings))


def execute_yoy_change(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute year-over-year absolute change."""
    return _round(TimeIntelligence.yoy_change(df, field_mappings))


def execute_period_comparison(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute current-period minus offset-period comparison."""
    return _round(TimeIntelligence.period_comparison(df, field_mappings))


def execute_same_period_last_year(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute same-period-last-year total."""
    return _round(TimeIntelligence.same_period_last_year(df, field_mappings))


def execute_month_over_month(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute month-over-month percentage change."""
    return _round(TimeIntelligence.month_over_month(df, field_mappings))


def execute_quarter_over_quarter(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute quarter-over-quarter percentage change."""
    return _round(TimeIntelligence.quarter_over_quarter(df, field_mappings))


def execute_rolling_12_month(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute trailing 12-month total."""
    return _round(TimeIntelligence.rolling_month(df, field_mappings, 12))


def execute_rolling_6_month(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute trailing 6-month total."""
    return _round(TimeIntelligence.rolling_month(df, field_mappings, 6))


def execute_rolling_3_month(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute trailing 3-month total."""
    return _round(TimeIntelligence.rolling_month(df, field_mappings, 3))


def execute_cagr(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> float:
    """Execute compound annual growth rate."""
    return _round(TimeIntelligence.cagr(df, field_mappings))


def execute_percentile(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute percentile aggregation."""
    value_field = str(field_mappings.get("value_field", ""))
    q = _float_param(field_mappings, "percentile", 0.9)
    q = q / 100 if q > 1 else q
    if not 0 <= q <= 1:
        raise ValueError("Percentile must be between 0 and 1, or 0 and 100.")
    if group_by:
        DataUtils.validate_column(df, group_by)
        result = _numeric(df, value_field).groupby(df[group_by], dropna=False).quantile(q)
        return _round({_to_key(key): value for key, value in result.items()})
    return _round(float(_numeric(df, value_field).quantile(q)))


def execute_quartile(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute quartile aggregation."""
    quartile = _int_param(field_mappings, "quartile", 2)
    quartile_map = {0: 0.0, 1: 0.25, 2: 0.5, 3: 0.75, 4: 1.0}
    if quartile not in quartile_map:
        raise ValueError("Quartile must be one of 0, 1, 2, 3, or 4.")
    return execute_percentile(df, {"value_field": field_mappings.get("value_field", ""), "percentile": quartile_map[quartile]}, group_by)


def execute_variance_population(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute population variance aggregation."""
    value_field = str(field_mappings.get("value_field", ""))
    grouped = _grouped_numeric(df, value_field, group_by, "varp")
    return grouped if grouped is not None else _round(float(_numeric(df, value_field).var(ddof=0)))


def execute_stddev_population(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute population standard deviation aggregation."""
    value_field = str(field_mappings.get("value_field", ""))
    grouped = _grouped_numeric(df, value_field, group_by, "stdp")
    return grouped if grouped is not None else _round(float(_numeric(df, value_field).std(ddof=0)))


def execute_covariance(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute sample covariance between two numeric fields."""
    field_a = str(field_mappings.get("field_a", ""))
    field_b = str(field_mappings.get("field_b", ""))
    a = _numeric(df, field_a)
    b = _numeric(df, field_b)
    valid = a.notna() & b.notna()
    if group_by:
        DataUtils.validate_column(df, group_by)
        result: Dict[Any, Any] = {}
        for key, idx in df.loc[valid].groupby(group_by, dropna=False).groups.items():
            result[_to_key(key)] = _round(float(a.loc[idx].cov(b.loc[idx])))
        return result
    return _round(float(a.loc[valid].cov(b.loc[valid])))


def execute_correlation(df: pd.DataFrame, field_mappings: Dict[str, Any], group_by: Optional[str] = None) -> Any:
    """Execute Pearson correlation between two numeric fields."""
    field_a = str(field_mappings.get("field_a", ""))
    field_b = str(field_mappings.get("field_b", ""))
    a = _numeric(df, field_a)
    b = _numeric(df, field_b)
    valid = a.notna() & b.notna()
    if group_by:
        DataUtils.validate_column(df, group_by)
        result: Dict[Any, Any] = {}
        for key, idx in df.loc[valid].groupby(group_by, dropna=False).groups.items():
            result[_to_key(key)] = _round(float(a.loc[idx].corr(b.loc[idx])))
        return result
    return _round(float(a.loc[valid].corr(b.loc[valid])))


EXECUTOR_REGISTRY: Dict[str, Executor] = {
    "sum": execute_sum,
    "average": execute_average,
    "min": execute_min,
    "max": execute_max,
    "count": execute_count,
    "distinct_count": execute_distinct_count,
    "median": execute_median,
    "mode": execute_mode,
    "std_dev": execute_std_dev,
    "weighted_average": execute_weighted_average,
    "division": execute_division,
    "percentage": execute_percentage,
    "ratio": execute_ratio,
    "difference": execute_difference,
    "variance": execute_variance,
    "percentage_change": execute_percentage_change,
    "running_total": execute_running_total,
    "filtered_aggregation": execute_filtered_aggregation,
    "conditional_measure": execute_conditional_measure,
    "top_n": execute_top_n,
    "rank": execute_rank,
    "rank_dense": execute_rank_dense,
    "rank_ascending": execute_rank_ascending,
    "rank_descending": execute_rank_descending,
    "mtd": execute_mtd,
    "qtd": execute_qtd,
    "ytd": execute_ytd,
    "previous_month": execute_previous_month,
    "previous_year": execute_previous_year,
    "rolling_average": execute_rolling_average,
    "growth_percent": execute_growth_percent,
    "yoy_change": execute_yoy_change,
    "period_comparison": execute_period_comparison,
    "same_period_last_year": execute_same_period_last_year,
    "month_over_month": execute_month_over_month,
    "quarter_over_quarter": execute_quarter_over_quarter,
    "rolling_12_month": execute_rolling_12_month,
    "rolling_6_month": execute_rolling_6_month,
    "rolling_3_month": execute_rolling_3_month,
    "cagr": execute_cagr,
    "percentile": execute_percentile,
    "quartile": execute_quartile,
    "variance_population": execute_variance_population,
    "stddev_population": execute_stddev_population,
    "covariance": execute_covariance,
    "correlation": execute_correlation,
}


class QuickMeasureEngine:
    """Public quick measure engine API."""

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
        """Return a single template by ID."""
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

        for param in tmpl.get("params", []):
            key = param["key"]
            if key in field_mappings and field_mappings[key]:
                value = str(field_mappings[key])
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

        numeric_types = {"numeric", "integer", "float", "int", "decimal", "double", "real", "number"}
        datetime_types = {"datetime", "date", "timestamp", "time"}

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
                if not any(t in actual_type for t in numeric_types):
                    errors.append(
                        f"Field '{col_name}' (used for '{param['label']}') should be numeric. "
                        f"Detected type: {actual_type or 'unknown'}."
                    )
            elif expected == "datetime":
                if not any(t in actual_type for t in datetime_types):
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
        Execute a quick measure through the executor registry.

        Returns {"result": value, "error": None} or {"result": None, "error": "..."}.
        """
        try:
            execution_df = _apply_filter_context(df, field_mappings)
            local_measures = _local_measures(field_mappings)
            if template_id not in TEMPLATE_CATALOGUE and MeasureRegistry.has(template_id, local_measures):
                output = _success(MeasureRegistry.resolve(template_id, execution_df, field_mappings, group_by, []))
            else:
                output = _success(_execute_template_internal(execution_df, template_id, field_mappings, group_by))
            return output
        except Exception as exc:
            return _failure(str(exc))

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
            suggestions.append({"template_id": "sum", "reason": "Numeric fields detected - Sum is the most common measure."})
            suggestions.append({"template_id": "average", "reason": "Average gives a normalized view across categories."})
        if has_numeric and has_datetime:
            suggestions.append({"template_id": "ytd", "reason": "Date + numeric columns - Year-to-Date is ideal for trend tracking."})
            suggestions.append({"template_id": "growth_percent", "reason": "Measure period-over-period growth automatically."})
            suggestions.append({"template_id": "rolling_average", "reason": "Smooth out noise with a rolling average."})
        numeric_count = sum(
            any(t in (col.get("data_type") or "").lower() for t in ["int", "float", "decimal", "numeric", "real", "double", "number"])
            for col in schema
        )
        if has_numeric and numeric_count >= 2:
            suggestions.append({"template_id": "percentage_change", "reason": "Compare two numeric fields as % change."})
            suggestions.append({"template_id": "variance", "reason": "Track actual vs budget/target variance."})
        if has_categorical and has_numeric:
            suggestions.append({"template_id": "top_n", "reason": "Categorical + numeric - find your Top N performers."})
            suggestions.append({"template_id": "rank_descending", "reason": "Rank categories by their metric value."})

        return suggestions[:6]
