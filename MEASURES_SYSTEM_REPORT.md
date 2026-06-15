# OneStopAnalytics — Measures System: Complete Technical Report

> Generated: June 15, 2026  
> Covers: Quick Measures, Semantic Measures, Calculated Tables — full stack (DB → API → Engine → UI)

---

## 1. Overview

The platform has **three measure types**, each serving a different level of complexity:

| Type | Purpose | Storage Table | UI Entry Point |
|---|---|---|---|
| **Quick Measure** | Template-guided, no-code aggregations | `quick_measures` | `BIQuickMeasurePanel` |
| **Semantic Measure** | Custom formula expressions with governance | `semantic_measures` | `BIMeasureDesignerModal` |
| **Calculated Table** | DAX-like computed tables from existing data | `calculated_tables` | `BINewTableModal` |

All three types integrate with the graph cache invalidation system and are synced into `uploaded_files.model_config` so visuals can pick them up as drag-and-drop fields.

---

## 2. Database Schema

### 2.1 `quick_measures` (Migration: `0003_add_quick_measures`)

```
id              VARCHAR  PK
file_id         → uploaded_files.id
user_id         → users.id
name            VARCHAR(255)  NOT NULL
description     TEXT
category        VARCHAR(100)  e.g. "aggregations", "time_intelligence"
template_id     VARCHAR(100)  e.g. "ytd", "rank"
template_label  VARCHAR(255)
field_mappings  JSON          { "value_field": "Revenue", "date_field": "OrderDate" }
formula         TEXT          generated formula string
aggregation     VARCHAR(50)   sum | mean | count | ...
format_type     VARCHAR(50)   General | Currency | Percentage | ...
is_valid        BOOLEAN
validation_errors JSON
cached_result   FLOAT
cached_at       TIMESTAMP
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### 2.2 `semantic_measures` (Created by SQLAlchemy `create_all()`)

```
id                   VARCHAR  PK
file_id              → uploaded_files.id
user_id              → users.id
name                 VARCHAR(255)   internal identifier (no spaces)
display_name         VARCHAR(255)   human-readable label
description          TEXT
category             VARCHAR(100)   Financial | Sales | Marketing | Operations | HR | Custom
expression           TEXT           formula: e.g. "DIVIDE([Revenue] - [Cost], [Revenue])"
format               VARCHAR(100)   General | Currency | Percentage | ...
dependencies         JSON           { "fields": [...], "measures": [...] }

-- Governance metadata
uuid                 VARCHAR(50)
version              INTEGER        increments on expression change
status               VARCHAR(50)    Active | Archived | Deprecated
created_by / modified_by  VARCHAR
business_definition  TEXT
tags                 JSON           ["KPI", "Executive"]
referenced_measures  JSON
referenced_columns   JSON
currency             VARCHAR(10)    ₹ | $ | € | ...
decimal_places       INTEGER
color_rules          JSON           { minThreshold, minColor, maxThreshold, maxColor }
display_units        VARCHAR(20)    None | Thousands | Millions | Billions
owner / steward      VARCHAR(100)
certification_status VARCHAR(50)    Uncertified | Under Review | Certified
approval_status      VARCHAR(50)    Draft | Under Review | Approved | Rejected

-- Usage tracking (computed at query time)
usage_count          INTEGER
last_used_at         TIMESTAMP
dashboards_using     JSON
reports_using        JSON
visuals_using        JSON
created_at / updated_at  TIMESTAMP
```

### 2.3 `semantic_measure_versions` (Version history)

```
id           VARCHAR  PK
measure_id   → semantic_measures.id  ON DELETE CASCADE
version      INTEGER
expression   TEXT       snapshot of the formula at this version
display_name, description, category, format, modified_by  (snapshot)
created_at   TIMESTAMP
```

### 2.4 `calculated_tables` + `calculated_table_columns` (Migration: `0007_calculated_tables`)

```
calculated_tables:
  id, report_id (→ uploaded_files), table_name, description
  method        formula | query_builder | manual
  expression    TEXT      (for formula method)
  builder_config JSON     (for query_builder method)
  manual_data   JSON      (for manual method)
  source_tables JSON      list of referenced table names
  row_count, is_valid, validation_errors
  created_by → users.id, created_at, updated_at

calculated_table_columns:
  id, calculated_table_id (CASCADE), column_name, data_type, created_at
```

---

## 3. API Endpoints

All routes are under base path: `/analytics/api/modeling/`

### 3.1 Quick Measure Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/quick-measures/templates` | All 45+ templates grouped by category |
| POST | `/quick-measures/generate-formula` | Build formula string from template + field mappings |
| POST | `/quick-measures/execute` | Run measure against live dataset, return scalar/grouped result |
| POST | `/quick-measures/suggest` | AI heuristic suggestions based on column schema |
| POST | `/quick-measures/suggest-raw` | Same, accepts raw JSON array body |
| POST | `/quick-measures` | Create & persist a Quick Measure |
| GET | `/quick-measures?file_id=...` | List all Quick Measures for a file |
| GET | `/quick-measures/{id}` | Get single Quick Measure |
| DELETE | `/quick-measures/{id}` | Delete Quick Measure |

### 3.2 Semantic Measure Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/measures/validate` | Syntax + reference + circular dependency check |
| POST | `/measures/preview` | Evaluate formula, return result + formatted value |
| POST | `/measures` | Create new Semantic Measure (validates first) |
| GET | `/measures?file_id=...` | List all Semantic Measures for a file |
| GET | `/measures/{id}` | Get single measure (with live usage population) |
| PUT | `/measures/{id}` | Update measure (increments version if expression changes) |
| DELETE | `/measures/{id}` | Delete measure + sync model config |
| POST | `/measures/{id}/duplicate` | Clone with unique name |
| GET | `/measures/{id}/versions` | Version history (desc order) |
| POST | `/measures/{id}/versions/{n}/rollback` | Rollback to version N |
| GET | `/measures/{id}/lineage` | Parent columns/measures + child measures |
| GET | `/measures/{id}/impact` | What would break if this measure is deleted |

---

## 4. Quick Measure Engine (`services/quick_measure_engine.py`)

### 4.1 Template Catalogue

45 templates across 7 categories:

**Aggregations** (10): Sum, Average, Min, Max, Count, Distinct Count, Median, Mode, Std Dev, Weighted Average

**Mathematical** (5): Division, Percentage, Ratio, Difference, Running Total

**Time Intelligence** (13): MTD, QTD, YTD, Previous Month, Previous Year, Rolling Average (N periods), Growth %, Same Period Last Year, Month-over-Month %, Quarter-over-Quarter %, Rolling 3/6/12 Month, CAGR

**Filtered Values** (6): Filtered Aggregation, Conditional Measure, Top N, Rank, Dense Rank, Ascending/Descending Rank

**Comparison** (4): YoY Change, Period Comparison, Variance (Actual vs Target), Percentage Change

**Statistics** (6): Percentile, Quartile, Population Variance, Population Std Dev, Covariance, Correlation

Each template defines:
```python
{
  "category": "time_intelligence",
  "label": "Year-to-Date",
  "description": "...",
  "params": [
    { "key": "value_field", "label": "Value", "type": "numeric" },
    { "key": "date_field",  "label": "Date column", "type": "datetime" }
  ],
  "aggregation": "ytd",
  "formula_template": "YTD({value_field}, {date_field})"
}
```

### 4.2 Execution Pipeline

```
API call: POST /quick-measures/execute
    ↓
QuickMeasureEngine.execute_measure(df, template_id, field_mappings, group_by)
    ↓
_apply_filter_context(df, field_mappings)     ← CALCULATE/FILTER/KEEPFILTERS
    ↓
_execute_template_internal(df, template_id, field_mappings, group_by)
    ↓
_validate_execution_schema(df, tmpl, field_mappings)   ← type check, column existence
    ↓
EXECUTOR_REGISTRY[template_id](df, field_mappings, group_by)
    ↓
returns {"result": value, "error": None}  or  {"result": None, "error": "..."}
```

### 4.3 DataUtils — Data Cleaning

`DataUtils.clean_numeric(series)` handles:
- Currency strings (`$1,234.56` → `1234.56`)
- Scale suffixes (`12.5K` → `12500`, `3.2M` → `3200000`, `1.5B` → `1500000000`)
- Accounting negatives (`(500)` → `-500`)
- Caches results by `(id(df), column, id(series), len(series))` to avoid redundant cleaning

`DataUtils.clean_datetime(series)` — coerces to pandas datetime with NaT for invalid values

### 4.4 FilterContext — Power BI Filter Semantics

```python
FilterContext.CALCULATE(df, base_filters, calculate_filters, keep_filters=True)
  # KEEPFILTERS=True → intersect both filter sets
  # KEEPFILTERS=False → calculate_filters overwrite base_filters per column

FilterContext.FILTER(df, filters)
  # filters can be:
  #   dict: {"column": "Region", "value": "North"}
  #   tuple: ("Region", "North")
  #   list: [("Region", "North"), ("Year", {"op": ">=", "value": 2023})]
  #   callable: lambda x: x > 100

# Supported operators in filter dicts:
# eq, ne, in, not_in, gt, gte, lt, lte, between, contains
```

### 4.5 TimeIntelligence Class

All methods take `(df, field_mappings)` where field_mappings contains `value_field` and `date_field`.

```
ytd()               → sum from Jan 1 of latest year to latest date
mtd()               → sum from 1st of latest month to latest date
qtd()               → sum from start of latest quarter to latest date
previous_month()    → total for the calendar month before latest date
previous_year()     → total for the full prior year
rolling_average()   → pd.Series.rolling(N).mean().iloc[-1]
growth_percent()    → (current_year - prior_year) / abs(prior_year) * 100
yoy_change()        → current_year_total - prior_year_total
period_comparison() → current_month - month(latest - N months)
same_period_last_year() → total for latest month shifted -1 year
month_over_month()  → (current_month - prev_month) / abs(prev_month) * 100
quarter_over_quarter() → same logic at quarter granularity
rolling_month(N)    → trailing N months total
cagr()              → (end/start)^(1/years) - 1, yearly grouped
```

### 4.6 MeasureRegistry — Chained Measures

Allows one measure to reference another by name:
```python
MeasureRegistry.register("Gross_Profit", "Revenue - COGS")
MeasureRegistry.register("Net_Margin", "DIVIDE(Gross_Profit, Revenue, 0)")

# Resolves circular detection at runtime via stack list:
# Net_Margin → Gross_Profit → Revenue (no cycle)
# A → B → A  ← raises ValueError: "Circular measure reference: A → B → A"
```

### 4.7 Expression Evaluator

`_MeasureExpressionEvaluator` is a Python AST visitor:
- Handles: `+`, `-`, `*`, `/`, unary `-/+`
- Built-in functions: `SUM()`, `AVG()`, `AVERAGE()`, `COUNT()`, `MIN()`, `MAX()`, `MEDIAN()`, `MODE()`, `DIVIDE(a, b, default)`
- Bracket references: `[Column Name]` → normalized to `__safe_ref_0` before AST parsing
- Column references resolve via `_sum(df, col)` (or grouped if `group_by` is set)
- Measure references resolve via `MeasureRegistry.resolve(name, ...)`

### 4.8 Suggest Measures

`QuickMeasureEngine.suggest_measures(schema)` returns up to 6 suggestions:
```
has_numeric                → suggest: sum, average
has_numeric + has_datetime → suggest: ytd, growth_percent, rolling_average
has_numeric × 2+           → suggest: percentage_change, variance
has_categorical + numeric  → suggest: top_n, rank_descending
```

---

## 5. Semantic Measure Engine (`services/semantic_measure_engine.py`)

### 5.1 Validation Pipeline

```
POST /measures/validate
    ↓
ValidationEngine.validate(name, expression, file_id, measures, db)
    ↓
1. Name check: not empty, regex ^[a-zA-Z_][a-zA-Z0-9_\s]*$
2. Load schema from DB via get_file_schema(file_id, db)
3. AST syntax check (normalize brackets first, then ast.parse(mode="eval"))
4. FormulaParser.extract_references(expression, schema_cols, measure_names)
   → finds [bracket] terms + plain word identifiers
   → classifies each as column or measure
5. Unknown reference check (error if not in schema or known measures)
6. Type mismatch check (warning if non-numeric column used in math)
7. DependencyGraph.detect_cycle(name, expression, all_measures_dict, schema_cols)
   → DFS traversal, raises if cycle found

Returns: { is_valid, errors, warnings, dependencies: { fields, measures } }
```

### 5.2 FormulaParser — Reference Extraction

```python
# Bracket references (highest priority):
[Revenue]  → column or measure named "Revenue"
[Profit Margin]  → measure "Profit Margin"

# Plain word references:
Revenue - Cost  → both "Revenue" and "Cost" identified
# Ignored keywords: DIVIDE, SUM, AVG, MIN, MAX, etc.
```

### 5.3 DependencyGraph — Cycle Detection

Uses DFS with a visited set and a stack set:
```
detect_cycle("Net_Margin", "DIVIDE([Gross], [Revenue], 0)", measures_dict, cols)
  → visits Net_Margin, checks refs: [Gross], [Revenue]
  → if Gross is a measure, recurse into it
  → if Gross references Net_Margin → stack contains Net_Margin → CYCLE FOUND
  → returns ["Net_Margin", "Gross", "Net_Margin"]
```

### 5.4 Preview Execution

```
POST /measures/preview
    ↓
SemanticMeasureEngine.calculate_preview(name, expression, file_id, measures, ...)
    ↓
1. ValidationEngine.validate(...)   ← fail fast
2. ModelEngine.load_report_dataframe(file_id, db)
3. Build measures_dict: { measure_name: expression } for all + current
4. MeasureRegistry.resolve(name, df, {"measures": measures_dict}, group_by)
5. format_result(result, format_type, decimal_places, currency, display_units)

Returns: { result: raw_value, formatted: "₹1,23,456.00", error: null }
```

### 5.5 format_result

```
format_type = "Currency"   → "₹12,345.00" (with display_units suffix K/M/B)
format_type = "Percentage" → "67.23%"
format_type = "Growth Rate"→ "+12.50%" or "-3.20%"
format_type = "Whole Number" → "12,345"
format_type = "General"    → "12,345.23" (with optional currency prefix)

display_units:
  Thousands → divide by 1,000, append "K"
  Millions  → divide by 1,000,000, append "M"
  Billions  → divide by 1,000,000,000, append "B"
  (Percentage/Growth Rate types are exempt from scaling)
```

### 5.6 Usage Population (`_populate_measure_usage`)

Called on every GET/list, scans live DB:
- Queries all `GraphDefinition` rows for the file
- Checks `y_axis == measure.name` or `options.measure_fields[].column == measure.name`
- Queries all `PaginatedReport`, searches layout_json string for measure name
- Fills `usage_count`, `visuals_using`, `dashboards_using`, `reports_using`

### 5.7 Model Config Sync (`sync_measures_to_model_config`)

Called after every create/update/delete:
- Loads `UploadedFile.model_config` (JSON column)
- Replaces `model_config["measures"]` with full list of all SemanticMeasures for the file
- Saves back to DB
- This makes measures available to the graph rendering engine without a separate lookup

---

## 6. Calculated Table Engine (`services/calculated_table_engine.py`)

### 6.1 Supported Functions

| Function | Signature | Description |
|---|---|---|
| `FILTER` | `FILTER(table, condition)` | Filter rows by condition |
| `DISTINCT` | `DISTINCT(table, col1, col2)` | Unique values of columns |
| `UNION` | `UNION(table1, table2, ...)` | Stack tables vertically |
| `SELECTCOLUMNS` | `SELECTCOLUMNS(table, "NewName", [col], ...)` | Rename/select columns |
| `ADDCOLUMNS` | `ADDCOLUMNS(table, "NewCol", [expr], ...)` | Add computed columns |
| `SUMMARIZE` | `SUMMARIZE(table, groupCol1, ...)` | Group and count |
| `CALENDAR` | `CALENDAR(DATE(2020,1,1), DATE(2024,12,31))` | Generate date range |
| `GENERATESERIES` | `GENERATESERIES(1, 100, 1)` | Numeric sequence |

### 6.2 Creation Methods

```
method = "formula"        → evaluate_formula(expression, tables)
method = "query_builder"  → evaluate_query_builder(builder_config, tables)
method = "manual"         → evaluate_manual(manual_data)
```

### 6.3 Safety Validation

`validate_expression()` blocks:
- `import `, `exec(`, `eval(`, `__*__`, `subprocess`, `os.`, `sys.`, `open(`
- SQL: `DROP`, `DELETE`, `INSERT`, `UPDATE`, `ALTER`, `TRUNCATE`, `; --`
- Expression must start with one of the 8 supported function names

---

## 7. Frontend Components

### 7.1 BIQuickMeasurePanel (sidebar, `BIQuickMeasurePanel.jsx`)

3-step guided workflow:

**Step 1 — Select Template**
- Fetches templates from `/quick-measures/templates` (falls back to `QUICK_MEASURE_TEMPLATE_FALLBACK`)
- Accordion by category, search filter
- AI Suggestions chips (from `/quick-measures/suggest`)

**Step 2 — Configure Mappings**
- Measure name input
- Per-param field mapping: dropdowns filtered by param type (`numeric` → only numeric columns, `datetime` → only date columns, `categorical` → only text columns)
- Auto-generates formula preview on each change via `/quick-measures/generate-formula`

**Step 3 — Formula & Validation**
- Shows generated formula (DAX-style string)
- Validation error list or green success message
- "Evaluate Preview" button → calls `/quick-measures/execute` → shows scalar result

**Save** → POST `/quick-measures` → calls `onAddMeasure(measure)` → emits to parent → closes

### 7.2 BIMeasureDesignerModal (full modal, `BIMeasureDesignerModal.jsx`)

4-tab enterprise measure platform:

**Tab 1 — Metric Library**
- Browse all existing semantic measures (search, category filter, sort by name/category)
- Click a card to load it into the editor
- "Create Metric" button → navigates to Visual Builder

**Tab 2 — Visual Builder**
- No-code: select template (Sum/Average/Count/Min/Max), pick column, set name/category/format
- "Save & Build Metric" → generates expression e.g. `SUM([Revenue])` → saves via POST/PUT

**Tab 3 — Advanced Formula Editor**
- Monaco editor with custom `semanticFormula` language
- Syntax highlighting: `[brackets]` = light blue, keywords = indigo, numbers = amber
- Autocomplete: `[` triggers suggestions for columns and existing measures
- Live debounced validation (600ms) via `/measures/validate`
- Dependency View panel shows referenced fields and measures
- Live Preview panel: KPI Card / Scalar / Table / Chart tabs
  - Group-by context selector
  - Calls `/measures/preview` → shows formatted result
  - KPI card color based on `color_rules` thresholds
  - Chart: BarChart for grouped results, LineChart for scalars
- Left Properties panel: name, display name, category, description, formatting options, governance fields
- Right Schema panel: click column/measure/function to insert into editor

**Tab 4 — AI Copilot**
- Chat interface, rule-based formula generator
- Matches column names from schema in user message
- Detects aggregation keywords (average, count, min, max)
- Special patterns: "profit margin" → `DIVIDE([Revenue]-[Cost],[Revenue])`
- "Apply to Formula Editor" button copies formula to editor tab

**Version History + Rollback** (shown when editing existing measure):
- `GET /measures/{id}/versions` → list all versions
- `POST /measures/{id}/versions/{n}/rollback` → revert expression + update state
- Lineage panel: parents (fields/measures used) + children (measures that use this one)
- Impact panel: visuals, dashboards, reports that would break

**Save flow:**
1. Validates name, expression, `isValid` state
2. Builds payload with all metadata fields
3. POST (new) or PUT (edit) to `/measures`
4. On success → `onSave(saved)` + shows summary screen

---

## 8. Data Flow: Creating a Semantic Measure

```
User types formula in Monaco editor
    ↓ (600ms debounce)
POST /analytics/api/modeling/measures/validate
    → ValidationEngine.validate(name, expression, file_id, measures, db)
    → returns { is_valid, errors, warnings, dependencies }
    ↓
UI shows green/red validation panel + dependency graph

User clicks "Refresh Preview"
    ↓
POST /analytics/api/modeling/measures/preview
    → SemanticMeasureEngine.calculate_preview(...)
    → ModelEngine.load_report_dataframe(file_id, db)
    → MeasureRegistry.resolve(name, df, {measures: {...}}, group_by)
    → format_result(result, format_type, ...)
    → returns { result, formatted, error }
    ↓
UI renders KPI Card / Table / Chart

User clicks "Save Measure"
    ↓
POST /analytics/api/modeling/measures
    → Duplicate name check
    → ValidationEngine.validate(...)
    → INSERT INTO semantic_measures
    → INSERT INTO semantic_measure_versions (version 1)
    → sync_measures_to_model_config(file_id, db)
    → clear_graph_cache_for_file(file_id)
    ↓
Summary screen shown → onSave(measure) callback
    ↓
Measure appears in Fields pane as draggable measure field
```

---

## 9. Data Flow: Quick Measure

```
User selects template "YTD"
    ↓
Field mapping UI shows: "Value field" (numeric), "Date column" (datetime)
User selects column mappings

    ↓ (on each mapping change)
POST /quick-measures/generate-formula
    → QuickMeasureEngine.generate_formula("ytd", { value_field: "Revenue", date_field: "Date" })
    → returns { formula: "YTD(Revenue, Date)", is_valid: true, errors: [] }
    ↓
Formula preview shown in UI

User clicks "Evaluate Preview"
    ↓
POST /quick-measures/execute
    → ModelingService.get_dataset_dataframe(file_id, db)
    → QuickMeasureEngine.execute_measure(df, "ytd", field_mappings, group_by)
    → TimeIntelligence.ytd(df, field_mappings)
    → returns { result: 485230.0, error: null }
    ↓
Preview result shown in panel

User clicks "Add Measure"
    ↓
POST /quick-measures
    → INSERT INTO quick_measures
    → clear_graph_cache_for_file(file_id)
    ↓
onAddMeasure({ id, name, formula, type: "quick_measure", aggregation, template_id }) callback
    ↓
Measure added to Fields pane
```

---

## 10. Integration with Visuals

When a chart is configured in the fields pane:
- Measure fields appear alongside raw columns
- `measure_fields: [{ column: "Profit_Margin", aggregation: "Calculated" }]` stored in `GraphDefinition.options`
- During graph data fetch, the backend checks `model_config["measures"]` for any referenced measures
- `SemanticMeasureEngine.calculate_preview()` (or the equivalent graph data endpoint) evaluates the expression using `MeasureRegistry.resolve()`
- Result replaces what would have been a raw DB aggregation

Cache invalidation: every create/update/delete to any measure type calls:
```python
from routers.graphs import clear_graph_cache_for_file
clear_graph_cache_for_file(file_id)
```
This forces all charts for the file to re-fetch data on the next render.

---

## 11. Known Issues / Bugs

### Bug: `delete_quick_measure` uses undefined `file_id`

In `routers/modeling.py`, the delete endpoint:
```python
@router.delete("/quick-measures/{measure_id}")
def delete_quick_measure(measure_id: str, db: Session = Depends(get_db)):
    qm = db.query(QuickMeasure)...
    db.delete(qm)
    db.commit()
    if file_id:                              # ← `file_id` is not defined here
        clear_graph_cache_for_file(file_id)  # ← will raise NameError
```
**Fix needed:** capture `file_id = qm.file_id` before deletion.

### Bug: `semantic_measures` table has no Alembic migration

The `semantic_measures` and `semantic_measure_versions` tables are created via `init_db()` → `Base.metadata.create_all()` at startup. This works on a fresh DB but does not handle schema changes or production upgrades safely.
**Fix needed:** add `0008_add_semantic_measures.py` migration.

---

## 12. Template Count Summary

| Category | Count |
|---|---|
| Aggregations | 10 |
| Mathematical | 5 |
| Time Intelligence | 13 |
| Filtered Values | 6 |
| Comparison | 4 |
| Statistics | 6 |
| **Total** | **44** |

---

## 13. API Quick Reference

```bash
# Templates
GET  /analytics/api/modeling/quick-measures/templates

# Quick Measure lifecycle
POST /analytics/api/modeling/quick-measures/generate-formula
POST /analytics/api/modeling/quick-measures/execute
POST /analytics/api/modeling/quick-measures/suggest
POST /analytics/api/modeling/quick-measures
GET  /analytics/api/modeling/quick-measures?file_id=<id>
DELETE /analytics/api/modeling/quick-measures/<id>

# Semantic Measure lifecycle
POST /analytics/api/modeling/measures/validate
POST /analytics/api/modeling/measures/preview
POST /analytics/api/modeling/measures
GET  /analytics/api/modeling/measures?file_id=<id>
GET  /analytics/api/modeling/measures/<id>
PUT  /analytics/api/modeling/measures/<id>
DELETE /analytics/api/modeling/measures/<id>

# Governance
POST /analytics/api/modeling/measures/<id>/duplicate
GET  /analytics/api/modeling/measures/<id>/versions
POST /analytics/api/modeling/measures/<id>/versions/<n>/rollback
GET  /analytics/api/modeling/measures/<id>/lineage
GET  /analytics/api/modeling/measures/<id>/impact
```

---

*End of report — generated from live source code analysis.*
