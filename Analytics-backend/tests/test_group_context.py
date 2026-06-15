import pytest
import pandas as pd

from services.quick_measure_engine import QuickMeasureEngine


def test_group_context_for_core_aggregations():
    df = pd.DataFrame(
        {
            "Region": ["North", "North", "South", "South", "West"],
            "Sales": [100, 200, 800, 0, 500],
            "Item": ["A", "A", "B", "C", None],
        }
    )

    mappings = {"value_field": "Sales"}

    assert QuickMeasureEngine.execute_measure(df, "sum", mappings, "Region")["result"] == {
        "North": 300.0,
        "South": 800.0,
        "West": 500.0,
    }
    assert QuickMeasureEngine.execute_measure(df, "average", mappings, "Region")["result"] == {
        "North": 150.0,
        "South": 400.0,
        "West": 500.0,
    }
    assert QuickMeasureEngine.execute_measure(df, "min", mappings, "Region")["result"] == {
        "North": 100.0,
        "South": 0.0,
        "West": 500.0,
    }
    assert QuickMeasureEngine.execute_measure(df, "max", mappings, "Region")["result"] == {
        "North": 200.0,
        "South": 800.0,
        "West": 500.0,
    }
    assert QuickMeasureEngine.execute_measure(df, "median", mappings, "Region")["result"] == {
        "North": 150.0,
        "South": 400.0,
        "West": 500.0,
    }

    std_result = QuickMeasureEngine.execute_measure(df, "std_dev", mappings, "Region")["result"]
    assert std_result["North"] == pytest.approx(70.7107)
    assert std_result["South"] == pytest.approx(565.6854)
    assert std_result["West"] is None


def test_group_context_for_count_and_distinct_count():
    df = pd.DataFrame(
        {
            "Region": ["North", "North", "South", "South", "West"],
            "Item": ["A", "A", "B", "C", None],
        }
    )

    result = QuickMeasureEngine.execute_measure(df, "count", {"value_field": "Item"}, "Region")
    assert result == {"result": {"North": 2.0, "South": 2.0, "West": 0.0}, "error": None}

    result = QuickMeasureEngine.execute_measure(df, "distinct_count", {"value_field": "Item"}, "Region")
    assert result == {"result": {"North": 1.0, "South": 2.0, "West": 0.0}, "error": None}
