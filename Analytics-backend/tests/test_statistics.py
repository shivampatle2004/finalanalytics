import pytest
import pandas as pd

from services.quick_measure_engine import DataUtils, MeasureRegistry, QuickMeasureEngine


def test_smart_numeric_parser_supports_currency_scale_and_accounting():
    series = pd.Series(["₹1,20,000", "$50,000", "6.18M", "2.5B", "1.2K", "(500)"])

    result = DataUtils.clean_numeric(series).tolist()

    assert result == [120000.0, 50000.0, 6180000.0, 2500000000.0, 1200.0, -500.0]


def test_advanced_statistics():
    df = pd.DataFrame({"X": [1, 2, 3, 4], "Y": [2, 4, 6, 8]})

    assert QuickMeasureEngine.execute_measure(df, "percentile", {"value_field": "X", "percentile": "0.5"})["result"] == 2.5
    assert QuickMeasureEngine.execute_measure(df, "quartile", {"value_field": "X", "quartile": "3"})["result"] == 3.25
    assert QuickMeasureEngine.execute_measure(df, "variance_population", {"value_field": "X"})["result"] == 1.25
    assert QuickMeasureEngine.execute_measure(df, "stddev_population", {"value_field": "X"})["result"] == pytest.approx(1.118)
    assert QuickMeasureEngine.execute_measure(df, "covariance", {"field_a": "X", "field_b": "Y"})["result"] == pytest.approx(3.3333)
    assert QuickMeasureEngine.execute_measure(df, "correlation", {"field_a": "X", "field_b": "Y"})["result"] == 1.0


def test_numeric_quick_measure_rejects_text_field():
    df = pd.DataFrame({
        "Product": ["Alpha", "Beta", "Gamma"],
        "Boxes Shipped": [100, 200, 300],
    })

    result = QuickMeasureEngine.execute_measure(
        df,
        "difference",
        {"field_a": "Product", "field_b": "Boxes Shipped"},
    )

    assert result["result"] is None
    assert "must contain numeric values" in result["error"]


def test_measure_chaining_and_circular_reference_detection():
    df = pd.DataFrame({"Sales": [100, 200], "Cost": [40, 80]})
    measures = {
        "SalesMeasure": {"template_id": "sum", "field_mappings": {"value_field": "Sales"}},
        "CostMeasure": {"template_id": "sum", "field_mappings": {"value_field": "Cost"}},
        "Profit": {"expression": "SalesMeasure - CostMeasure"},
        "Margin": {"expression": "DIVIDE(Profit, SalesMeasure, 0)"},
    }

    margin = QuickMeasureEngine.execute_measure(df, "Margin", {"measures": measures})
    assert margin == {"result": 0.6, "error": None}

    circular = QuickMeasureEngine.execute_measure(
        df,
        "A",
        {"measures": {"A": {"expression": "B + 1"}, "B": {"expression": "A + 1"}}},
    )
    assert circular["result"] is None
    assert "Circular measure reference detected" in circular["error"]

    MeasureRegistry.clear()
