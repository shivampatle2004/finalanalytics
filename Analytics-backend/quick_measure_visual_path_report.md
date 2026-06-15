# Quick Measure Visualization Path Validation Report

Validated path: UI Payload -> GraphEngine -> Visualization Layer against QuickMeasureEngine.execute_measure().

## Summary

- **Total templates**: 46
- **Total tested**: 46
- **Passed**: 46
- **Failed**: 0
- **GraphEngine mismatches**: 0
- **Visualization mismatches**: 0
- **Missing mappings**: None
- **Unsupported measures**: None

## Results

| Template | GraphEngine Result | QuickMeasure Result | Match | Status |
| -------- | ------------------ | ------------------- | ----- | ------ |
| sum | `1620.0` | `1620.0` | YES | **PASS** |
| average | `67.5` | `67.5` | YES | **PASS** |
| min | `10.0` | `10.0` | YES | **PASS** |
| max | `125.0` | `125.0` | YES | **PASS** |
| count | `24.0` | `24.0` | YES | **PASS** |
| distinct_count | `24.0` | `24.0` | YES | **PASS** |
| median | `67.5` | `67.5` | YES | **PASS** |
| mode | `"A"` | `"A"` | YES | **PASS** |
| std_dev | `35.3553` | `35.3553` | YES | **PASS** |
| weighted_average | `69.1667` | `69.1667` | YES | **PASS** |
| division | `5.0` | `5.0` | YES | **PASS** |
| percentage | `20.0` | `20.0` | YES | **PASS** |
| ratio | `0.2` | `0.2` | YES | **PASS** |
| difference | `120.0` | `120.0` | YES | **PASS** |
| running_total | `1620.0` | `1620.0` | YES | **PASS** |
| mtd | `125.0` | `125.0` | YES | **PASS** |
| qtd | `345.0` | `345.0` | YES | **PASS** |
| ytd | `840.0` | `840.0` | YES | **PASS** |
| previous_month | `115.0` | `115.0` | YES | **PASS** |
| previous_year | `780.0` | `780.0` | YES | **PASS** |
| rolling_average | `115.0` | `115.0` | YES | **PASS** |
| growth_percent | `7.6923` | `7.6923` | YES | **PASS** |
| same_period_last_year | `120.0` | `120.0` | YES | **PASS** |
| month_over_month | `8.6957` | `8.6957` | YES | **PASS** |
| quarter_over_quarter | `35.2941` | `35.2941` | YES | **PASS** |
| rolling_12_month | `840.0` | `840.0` | YES | **PASS** |
| rolling_6_month | `600.0` | `600.0` | YES | **PASS** |
| rolling_3_month | `345.0` | `345.0` | YES | **PASS** |
| cagr | `7.6923` | `7.6923` | YES | **PASS** |
| filtered_aggregation | `750.0` | `750.0` | YES | **PASS** |
| conditional_measure | `750.0` | `750.0` | YES | **PASS** |
| top_n | `{"B": 870.0}` | `{"B": 870.0}` | YES | **PASS** |
| rank | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` | YES | **PASS** |
| rank_dense | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` | YES | **PASS** |
| rank_ascending | `{"A": 1.0, "B": 2.0}` | `{"A": 1.0, "B": 2.0}` | YES | **PASS** |
| rank_descending | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` | YES | **PASS** |
| yoy_change | `60.0` | `60.0` | YES | **PASS** |
| period_comparison | `20.0` | `20.0` | YES | **PASS** |
| variance | `120.0` | `120.0` | YES | **PASS** |
| percentage_change | `50.0` | `50.0` | YES | **PASS** |
| percentile | `113.5` | `113.5` | YES | **PASS** |
| quartile | `67.5` | `67.5` | YES | **PASS** |
| variance_population | `1197.9167` | `1197.9167` | YES | **PASS** |
| stddev_population | `34.6109` | `34.6109` | YES | **PASS** |
| covariance | `2.6087` | `2.6087` | YES | **PASS** |
| correlation | `0.1445` | `0.1445` | YES | **PASS** |

## Aggregation Mapping Coverage

| Mapping | Status |
| --- | --- |
| sum | **PASS** |
| average | **PASS** |
| count | **PASS** |
| distinct_count | **PASS** |
| median | **PASS** |
| mode | **PASS** |
| weighted_average | **PASS** |
| std_dev | **PASS** |
| variance_population | **PASS** |
| stddev_population | **PASS** |
| percentile | **PASS** |
| quartile | **PASS** |
| covariance | **PASS** |
| correlation | **PASS** |
| percentage | **PASS** |
| ratio | **PASS** |
| division | **PASS** |
| variance | **PASS** |
| percentage_change | **PASS** |

## Group-By Behavior

| Behavior | Status | GraphEngine | QuickMeasure | Error |
| --- | --- | --- | --- | --- |
| category grouping | **PASS** | `{"A": 750.0, "B": 870.0}` | `{"A": 750.0, "B": 870.0}` |  |
| ranking | **PASS** | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` |  |
| top_n | **PASS** | `{"B": 870.0}` | `{"B": 870.0}` |  |
| rank_dense | **PASS** | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` |  |
| rank_ascending | **PASS** | `{"A": 1.0, "B": 2.0}` | `{"A": 1.0, "B": 2.0}` |  |
| rank_descending | **PASS** | `{"A": 2.0, "B": 1.0}` | `{"A": 2.0, "B": 1.0}` |  |

## Time Intelligence

| Template | Status |
| --- | --- |
| ytd | **PASS** |
| qtd | **PASS** |
| mtd | **PASS** |
| previous_month | **PASS** |
| previous_year | **PASS** |
| rolling_3_month | **PASS** |
| rolling_6_month | **PASS** |
| rolling_12_month | **PASS** |
| month_over_month | **PASS** |
| quarter_over_quarter | **PASS** |
| same_period_last_year | **PASS** |
| growth_percent | **PASS** |
| yoy_change | **PASS** |
| cagr | **PASS** |
