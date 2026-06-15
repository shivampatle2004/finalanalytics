import pandas as pd

from services.quick_measure_engine import QuickMeasureEngine


def test_rank_descending_uses_category_totals():
    df = pd.DataFrame({"Category": ["A", "B", "C"], "Sales": [100, 500, 300]})

    result = QuickMeasureEngine.execute_measure(
        df,
        "rank_descending",
        {"category_field": "Category", "value_field": "Sales"},
    )

    assert result == {"result": {"B": 1, "C": 2, "A": 3}, "error": None}


def test_rank_ascending_and_dense_rank():
    df = pd.DataFrame({"Category": ["A", "B", "C", "D"], "Sales": [100, 500, 500, 300]})

    ascending = QuickMeasureEngine.execute_measure(
        df,
        "rank_ascending",
        {"category_field": "Category", "value_field": "Sales"},
    )
    dense = QuickMeasureEngine.execute_measure(
        df,
        "rank_dense",
        {"category_field": "Category", "value_field": "Sales"},
    )

    assert ascending["result"] == {"A": 1, "D": 2, "B": 3, "C": 3}
    assert dense["result"] == {"B": 1, "C": 1, "D": 2, "A": 3}


def test_legacy_rank_now_returns_real_descending_rank():
    df = pd.DataFrame({"Category": ["A", "A", "B", "C"], "Sales": [100, 200, 500, 400]})

    result = QuickMeasureEngine.execute_measure(
        df,
        "rank",
        {"category_field": "Category", "value_field": "Sales"},
    )

    assert result["result"] == {"B": 1, "C": 2, "A": 3}
