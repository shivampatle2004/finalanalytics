"""
Calculated table expression engine — DAX-like functions executed via pandas.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

SUPPORTED_FUNCTIONS = [
    "FILTER", "SUMMARIZE", "DISTINCT", "UNION", "ADDCOLUMNS",
    "SELECTCOLUMNS", "CALENDAR", "GENERATESERIES",
]

_UNSAFE_PATTERNS = re.compile(
    r"(import\s|exec\s*\(|eval\s*\(|__\w+__|subprocess|os\.|sys\.|open\s*\(|"
    r"DROP\s|DELETE\s|INSERT\s|UPDATE\s|ALTER\s|TRUNCATE\s|;\s*--)",
    re.IGNORECASE,
)

_FUNC_RE = re.compile(
    r"^\s*(?:[\w\s]+\s*=\s*)?(FILTER|SUMMARIZE|DISTINCT|UNION|ADDCOLUMNS|SELECTCOLUMNS|CALENDAR|GENERATESERIES)\s*\(",
    re.IGNORECASE,
)


def validate_expression(expression: str) -> Tuple[bool, List[str]]:
    """Validate formula safety and basic syntax."""
    errors: List[str] = []
    if not expression or not str(expression).strip():
        errors.append("Expression is required")
        return False, errors
    expr = str(expression).strip()
    if _UNSAFE_PATTERNS.search(expr):
        errors.append("Expression contains disallowed tokens (SQL/system commands)")
        return False, errors
    if not _FUNC_RE.match(expr):
        errors.append(
            f"Expression must start with a supported function: {', '.join(SUPPORTED_FUNCTIONS)}"
        )
        return False, errors
    return True, errors


def infer_column_types(df: pd.DataFrame) -> List[Dict[str, str]]:
    cols = []
    for name in df.columns:
        dtype = str(df[name].dtype)
        if "int" in dtype or "float" in dtype:
            data_type = "number"
        elif "datetime" in dtype or "date" in dtype:
            data_type = "date"
        elif "bool" in dtype:
            data_type = "boolean"
        else:
            data_type = "text"
        cols.append({"column_name": str(name), "data_type": data_type})
    return cols


def dataframe_preview(df: pd.DataFrame, limit: int = 100) -> Dict[str, Any]:
    preview_df = df.head(limit)
    rows = preview_df.replace({np.nan: None}).to_dict(orient="records")
    columns = infer_column_types(df)
    return {
        "columns": columns,
        "rows": rows,
        "total_rows": len(df),
        "total_columns": len(df.columns),
    }


def _split_top_level_args(inner: str) -> List[str]:
    parts: List[str] = []
    depth = 0
    in_str = False
    quote = ""
    buf: List[str] = []
    for ch in inner:
        if in_str:
            buf.append(ch)
            if ch == quote:
                in_str = False
            continue
        if ch in ("'", '"'):
            in_str = True
            quote = ch
            buf.append(ch)
            continue
        if ch == "(":
            depth += 1
            buf.append(ch)
            continue
        if ch == ")":
            depth -= 1
            buf.append(ch)
            continue
        if ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())
    return parts


def _extract_function_call(expression: str) -> Tuple[str, List[str]]:
    expr = str(expression).strip()
    if "=" in expr.split("(")[0]:
        expr = expr.split("=", 1)[1].strip()
    m = re.match(r"^(\w+)\s*\((.*)\)\s*$", expr, re.DOTALL | re.IGNORECASE)
    if not m:
        raise ValueError("Invalid function syntax — expected NAME(arg1, arg2, ...)")
    func = m.group(1).upper()
    args = _split_top_level_args(m.group(2))
    return func, args


def _resolve_table(name: str, tables: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    key = str(name).strip().strip('"').strip("'")
    if key in tables:
        return tables[key].copy()
    lower_map = {k.lower(): v for k, v in tables.items()}
    if key.lower() in lower_map:
        return lower_map[key.lower()].copy()
    raise ValueError(f"Table '{key}' not found. Available: {', '.join(sorted(set(tables.keys())))}")


def _col_name(token: str) -> str:
    token = token.strip()
    m = re.match(r"\[([^\]]+)\]", token)
    if m:
        return m.group(1).strip()
    return token.strip('"').strip("'")


def _parse_filter_condition(df: pd.DataFrame, condition: str) -> pd.DataFrame:
    cond = condition.strip()
    ops = [
        (r"^(.+?)\s*>=\s*(.+)$", ">="),
        (r"^(.+?)\s*<=\s*(.+)$", "<="),
        (r"^(.+?)\s*!=\s*(.+)$", "!="),
        (r"^(.+?)\s*<>\s*(.+)$", "!="),
        (r"^(.+?)\s*>\s*(.+)$", ">"),
        (r"^(.+?)\s*<\s*(.+)$", "<"),
        (r"^(.+?)\s*=\s*(.+)$", "=="),
    ]
    for pattern, op in ops:
        m = re.match(pattern, cond, re.IGNORECASE)
        if not m:
            continue
        col = _col_name(m.group(1))
        raw_val = m.group(2).strip().strip('"').strip("'")
        if col not in df.columns:
            raise ValueError(f"Column '{col}' not found for filter")
        series = df[col]
        if op in (">", ">=", "<", "<="):
            try:
                val = float(raw_val)
                num = pd.to_numeric(series, errors="coerce")
                if op == ">":
                    return df[num > val]
                if op == ">=":
                    return df[num >= val]
                if op == "<":
                    return df[num < val]
                return df[num <= val]
            except ValueError:
                pass
        if op == "==":
            return df[series.astype(str) == raw_val]
        return df[series.astype(str) != raw_val]
    raise ValueError(f"Unsupported filter condition: {condition}")


def _parse_date_literal(token: str) -> datetime:
    token = token.strip()
    m = re.match(r"DATE\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", token, re.I)
    if m:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(token.strip('"').strip("'"), fmt)
        except ValueError:
            continue
    raise ValueError(f"Invalid date literal: {token}")


def evaluate_formula(expression: str, tables: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    ok, errs = validate_expression(expression)
    if not ok:
        raise ValueError("; ".join(errs))
    func, args = _extract_function_call(expression)

    if func == "FILTER":
        if len(args) < 2:
            raise ValueError("FILTER requires table and condition")
        df = _resolve_table(args[0], tables)
        return _parse_filter_condition(df, args[1])

    if func == "DISTINCT":
        if len(args) < 2:
            raise ValueError("DISTINCT requires table and column(s)")
        df = _resolve_table(args[0], tables)
        cols = [_col_name(a) for a in args[1:]]
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ValueError(f"Columns not found: {', '.join(missing)}")
        return df[cols].drop_duplicates().reset_index(drop=True)

    if func == "UNION":
        if len(args) < 2:
            raise ValueError("UNION requires at least two tables")
        frames = [_resolve_table(a, tables) for a in args]
        return pd.concat(frames, ignore_index=True)

    if func == "SELECTCOLUMNS":
        if len(args) < 3 or len(args[1:]) % 2 != 0:
            raise ValueError("SELECTCOLUMNS requires table and name/value pairs")
        df = _resolve_table(args[0], tables)
        out = pd.DataFrame()
        for i in range(1, len(args), 2):
            new_name = args[i].strip().strip('"').strip("'")
            src = _col_name(args[i + 1])
            if src not in df.columns:
                raise ValueError(f"Column '{src}' not found")
            out[new_name] = df[src]
        return out

    if func == "ADDCOLUMNS":
        if len(args) < 3 or len(args[1:]) % 2 != 0:
            raise ValueError("ADDCOLUMNS requires table and name/expression pairs")
        df = _resolve_table(args[0], tables)
        out = df.copy()
        for i in range(1, len(args), 2):
            new_name = args[i].strip().strip('"').strip("'")
            expr = args[i + 1].strip()
            col = _col_name(expr)
            if col in out.columns and expr.startswith("["):
                out[new_name] = out[col]
            else:
                m = re.match(r"\[([^\]]+)\]\s*\*\s*([\d.]+)", expr)
                if m and m.group(1) in out.columns:
                    out[new_name] = pd.to_numeric(out[m.group(1)], errors="coerce") * float(m.group(2))
                else:
                    raise ValueError(f"Unsupported ADDCOLUMNS expression: {expr}")
        return out

    if func == "SUMMARIZE":
        if len(args) < 2:
            raise ValueError("SUMMARIZE requires table and group column(s)")
        df = _resolve_table(args[0], tables)
        group_cols = [_col_name(a) for a in args[1:] if not re.search(r"\(", a)]
        agg_args = [a for a in args[1:] if re.search(r"\(", a)]
        if not group_cols:
            raise ValueError("SUMMARIZE requires at least one group column")
        missing = [c for c in group_cols if c not in df.columns]
        if missing:
            raise ValueError(f"Group columns not found: {', '.join(missing)}")
        grouped = df.groupby(group_cols, dropna=False)
        if agg_args:
            result = grouped.size().reset_index(name="Count")
        else:
            result = grouped.size().reset_index(name="Count")
        return result

    if func == "CALENDAR":
        if len(args) < 2:
            raise ValueError("CALENDAR requires start and end dates")
        start = _parse_date_literal(args[0])
        end = _parse_date_literal(args[1])
        if end < start:
            raise ValueError("CALENDAR end date must be on or after start date")
        dates = pd.date_range(start=start, end=end, freq="D")
        return pd.DataFrame({"Date": dates})

    if func == "GENERATESERIES":
        if len(args) < 3:
            raise ValueError("GENERATESERIES requires start, end, and step")
        start = float(args[0].strip())
        end = float(args[1].strip())
        step = float(args[2].strip())
        if step == 0:
            raise ValueError("GENERATESERIES step cannot be zero")
        values = []
        v = start
        if step > 0:
            while v <= end + 1e-9:
                values.append(v)
                v += step
        else:
            while v >= end - 1e-9:
                values.append(v)
                v += step
        return pd.DataFrame({"Value": values})

    raise ValueError(f"Unsupported function: {func}")


def evaluate_query_builder(config: Dict[str, Any], tables: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    source = config.get("source_table") or "main"
    df = _resolve_table(source, tables)
    columns = config.get("columns") or []
    if columns:
        valid = [c for c in columns if c in df.columns]
        if valid:
            df = df[valid].copy()

    for f in config.get("filters") or []:
        col = f.get("column")
        op = f.get("operator", "==")
        val = f.get("value")
        if not col or col not in df.columns:
            continue
        series = df[col]
        if op in (">", ">=", "<", "<="):
            num = pd.to_numeric(series, errors="coerce")
            val_num = float(val)
            if op == ">":
                df = df[num > val_num]
            elif op == ">=":
                df = df[num >= val_num]
            elif op == "<":
                df = df[num < val_num]
            else:
                df = df[num <= val_num]
        elif op == "!=":
            df = df[series.astype(str) != str(val)]
        else:
            df = df[series.astype(str) == str(val)]

    group_by = config.get("group_by") or []
    aggregations = config.get("aggregations") or {}
    if group_by:
        valid_groups = [c for c in group_by if c in df.columns]
        if valid_groups:
            agg_map = {}
            for col, fn in aggregations.items():
                if col not in df.columns:
                    continue
                fn_l = str(fn).lower()
                if fn_l in ("sum", "mean", "avg", "min", "max", "count"):
                    agg_map[col] = "sum" if fn_l == "sum" else ("mean" if fn_l in ("mean", "avg") else fn_l)
            if agg_map:
                df = df.groupby(valid_groups, dropna=False).agg(agg_map).reset_index()
            else:
                df = df.groupby(valid_groups, dropna=False).size().reset_index(name="Count")

    for calc in config.get("calculated_columns") or []:
        name = calc.get("name")
        formula = calc.get("formula") or ""
        if not name:
            continue
        m = re.match(r"\[([^\]]+)\]\s*\*\s*([\d.]+)", formula.strip())
        if m and m.group(1) in df.columns:
            df[name] = pd.to_numeric(df[m.group(1)], errors="coerce") * float(m.group(2))
        elif formula.strip().startswith("[") and formula.strip().endswith("]"):
            src = _col_name(formula)
            if src in df.columns:
                df[name] = df[src]

    return df.reset_index(drop=True)


def evaluate_manual(manual_data: Dict[str, Any]) -> pd.DataFrame:
    columns = manual_data.get("columns") or []
    rows = manual_data.get("rows") or []
    if not columns:
        raise ValueError("Manual table requires at least one column")
    col_names = [c.get("name") for c in columns if c.get("name")]
    if not col_names:
        raise ValueError("Manual table columns must have names")
    df = pd.DataFrame(rows, columns=col_names)
    for col_def in columns:
        name = col_def.get("name")
        dtype = str(col_def.get("type", "text")).lower()
        if name not in df.columns:
            continue
        if dtype == "number":
            df[name] = pd.to_numeric(df[name], errors="coerce")
        elif dtype == "boolean":
            df[name] = df[name].astype(bool)
    return df


def execute_calculated_table(
    method: str,
    expression: Optional[str],
    builder_config: Optional[Dict],
    manual_data: Optional[Dict],
    tables: Dict[str, pd.DataFrame],
) -> pd.DataFrame:
    method = (method or "formula").lower()
    if method == "formula":
        if not expression:
            raise ValueError("Expression is required for formula-based tables")
        return evaluate_formula(expression, tables)
    if method == "query_builder":
        return evaluate_query_builder(builder_config or {}, tables)
    if method == "manual":
        return evaluate_manual(manual_data or {})
    raise ValueError(f"Unknown table creation method: {method}")
