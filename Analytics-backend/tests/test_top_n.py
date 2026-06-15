import pandas as pd

from services.quick_measure_engine import QuickMeasureEngine


def test_top_n_uses_category_aggregation_not_rows():
    df = pd.DataFrame(
        {
            "Product": ["A", "A", "B", "C"],
            "Sales": [100, 200, 500, 400],
        }
    )

    result = QuickMeasureEngine.execute_measure(
        df,
        "top_n",
        {"category_field": "Product", "value_field": "Sales", "n": "2"},
    )

    assert result == {"result": {"B": 500.0, "C": 400.0}, "error": None}


def test_top_n_respects_filter_context():
    df = pd.DataFrame(
        {
            "Region": ["North", "North", "South", "South"],
            "Product": ["A", "B", "A", "B"],
            "Sales": [100, 500, 900, 300],
        }
    )

    result = QuickMeasureEngine.execute_measure(
        df,
        "top_n",
        {"category_field": "Product", "value_field": "Sales", "n": "1", "filters": {"Region": "North"}},
    )

    assert result["result"] == {"B": 500.0}


def test_calculate_filters_can_overwrite_or_keep_base_filters():
    df = pd.DataFrame(
        {
            "Region": ["North", "South", "West"],
            "Year": [2025, 2025, 2026],
            "Sales": [100, 800, 500],
        }
    )

    overwritten = QuickMeasureEngine.execute_measure(
        df,
        "sum",
        {
            "value_field": "Sales",
            "filters": {"Region": "North"},
            "calculate_filters": {"Region": "South"},
            "keepfilters": False,
        },
    )
    kept = QuickMeasureEngine.execute_measure(
        df,
        "sum",
        {
            "value_field": "Sales",
            "filters": {"Region": "North"},
            "calculate_filters": {"Region": "South"},
            "keepfilters": True,
        },
    )

    assert overwritten["result"] == 800.0
    assert kept["result"] == 0.0
