import pytest
import pandas as pd

from services.quick_measure_engine import QuickMeasureEngine


def test_advanced_time_intelligence_measures():
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(
                [
                    "2024-01-15",
                    "2024-02-15",
                    "2024-03-15",
                    "2025-01-15",
                    "2025-02-15",
                    "2025-03-15",
                ]
            ),
            "Sales": [100, 200, 300, 150, 300, 600],
        }
    )
    mappings = {"date_field": "Date", "value_field": "Sales"}

    assert QuickMeasureEngine.execute_measure(df, "same_period_last_year", mappings)["result"] == 300.0
    assert QuickMeasureEngine.execute_measure(df, "month_over_month", mappings)["result"] == 100.0
    assert QuickMeasureEngine.execute_measure(df, "quarter_over_quarter", mappings)["result"] == 0.0
    assert QuickMeasureEngine.execute_measure(df, "rolling_3_month", mappings)["result"] == 1050.0
    assert QuickMeasureEngine.execute_measure(df, "cagr", mappings)["result"] == pytest.approx(75.0)


def test_existing_time_measures_still_work():
    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(["2025-12-01", "2026-01-01", "2026-02-01"]),
            "Sales": [100, 200, 300],
        }
    )
    mappings = {"date_field": "Date", "value_field": "Sales"}

    assert QuickMeasureEngine.execute_measure(df, "mtd", mappings)["result"] == 300.0
    assert QuickMeasureEngine.execute_measure(df, "qtd", mappings)["result"] == 500.0
    assert QuickMeasureEngine.execute_measure(df, "ytd", mappings)["result"] == 500.0
    assert QuickMeasureEngine.execute_measure(df, "previous_month", mappings)["result"] == 200.0
    assert QuickMeasureEngine.execute_measure(df, "previous_year", mappings)["result"] == 100.0
