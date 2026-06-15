"""
Power Query-style transformation execution engine.
Applies JSON step definitions to pandas DataFrames without modifying source data.
"""

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from services.data_processor import DataProcessor

SUPPORTED_STEPS = {
    "rename_column", "change_type", "remove_column", "duplicate_column",
    "merge_columns", "split_column", "replace_values", "filter_rows",
    "sort_rows", "remove_duplicates", "remove_null_values", "group_by",
    "pivot", "unpivot", "calculated_column", "append", "merge_join",
}

TYPE_MAP = {
    "text": "string", "string": "string", "str": "string",
    "number": "float64", "numeric": "float64", "float": "float64", "int": "Int64",
    "integer": "Int64", "boolean": "bool", "bool": "bool",
    "date": "datetime64[ns]", "datetime": "datetime64[ns]",
    "categorical": "category",
}


def _coerce_type(series: pd.Series, dtype: str) -> pd.Series:
    target = TYPE_MAP.get((dtype or "").lower(), dtype)
    if target in ("string", "str"):
        return series.astype("string")
    if target == "bool":
        return series.map(lambda v: str(v).lower() in ("true", "1", "yes", "y") if pd.notna(v) else pd.NA).astype("boolean")
    if target.startswith("datetime"):
        return pd.to_datetime(series, errors="coerce")
    if target == "Int64":
        return pd.to_numeric(series, errors="coerce").astype("Int64")
    if target == "float64":
        return pd.to_numeric(series, errors="coerce")
    if target == "category":
        return series.astype("category")
    return series.astype(target)


def _eval_filter(df: pd.DataFrame, config: Dict) -> pd.DataFrame:
    col = config.get("column")
    op = config.get("operator", "==")
    val = config.get("value")
    if col not in df.columns:
        return df
    s = df[col]
    ops = {
        "==": s == val, "!=": s != val,
        ">": pd.to_numeric(s, errors="coerce") > float(val),
        ">=": pd.to_numeric(s, errors="coerce") >= float(val),
        "<": pd.to_numeric(s, errors="coerce") < float(val),
        "<=": pd.to_numeric(s, errors="coerce") <= float(val),
        "contains": s.astype(str).str.contains(str(val), case=False, na=False),
        "not_contains": ~s.astype(str).str.contains(str(val), case=False, na=False),
        "starts_with": s.astype(str).str.startswith(str(val), na=False),
        "ends_with": s.astype(str).str.endswith(str(val), na=False),
        "is_null": s.isna(),
        "is_not_null": s.notna(),
    }
    mask = ops.get(op, s == val)
    return df[mask]


def apply_step(df: pd.DataFrame, step: Dict[str, Any]) -> pd.DataFrame:
    """Apply a single transformation step to a DataFrame."""
    stype = step.get("type") or step.get("step_type")
    cfg = step.get("config") or step
    if not stype:
        return df

    if stype == "rename_column":
        old, new = cfg.get("column"), cfg.get("new_name")
        if old in df.columns and new:
            return df.rename(columns={old: new})

    elif stype == "change_type":
        col, dtype = cfg.get("column"), cfg.get("data_type") or cfg.get("new_type")
        if col in df.columns and dtype:
            out = df.copy()
            out[col] = _coerce_type(out[col], dtype)
            return out

    elif stype == "remove_column":
        cols = cfg.get("columns") or [cfg.get("column")]
        return df.drop(columns=[c for c in cols if c and c in df.columns], errors="ignore")

    elif stype == "duplicate_column":
        col, new_name = cfg.get("column"), cfg.get("new_name")
        if col in df.columns and new_name:
            out = df.copy()
            out[new_name] = out[col]
            return out

    elif stype == "merge_columns":
        cols = cfg.get("columns", [])
        sep = cfg.get("separator", " ")
        new_name = cfg.get("new_name", "Merged")
        valid = [c for c in cols if c in df.columns]
        if valid:
            out = df.copy()
            out[new_name] = out[valid].astype(str).agg(sep.join, axis=1)
            return out

    elif stype == "split_column":
        col = cfg.get("column")
        sep = cfg.get("separator", ",")
        new_cols = cfg.get("new_columns", [])
        if col in df.columns:
            parts = df[col].astype(str).str.split(sep, expand=True)
            out = df.copy()
            for i, nc in enumerate(new_cols):
                out[nc] = parts[i] if i < parts.shape[1] else None
            return out

    elif stype == "replace_values":
        col = cfg.get("column")
        old_val, new_val = cfg.get("old_value"), cfg.get("new_value")
        if col in df.columns:
            out = df.copy()
            out[col] = out[col].replace(old_val, new_val)
            return out

    elif stype == "filter_rows":
        return _eval_filter(df, cfg)

    elif stype == "sort_rows":
        cols = cfg.get("columns") or [cfg.get("column")]
        ascending = cfg.get("ascending", True)
        if isinstance(ascending, bool):
            ascending = [ascending] * len(cols)
        valid = [c for c in cols if c in df.columns]
        if valid:
            return df.sort_values(by=valid, ascending=ascending[:len(valid)])

    elif stype == "remove_duplicates":
        subset = cfg.get("columns")
        return df.drop_duplicates(subset=subset or None, keep=cfg.get("keep", "first"))

    elif stype == "remove_null_values":
        cols = cfg.get("columns")
        if cols:
            valid = [c for c in cols if c in df.columns]
            return df.dropna(subset=valid) if valid else df.dropna()
        return df.dropna()

    elif stype == "group_by":
        group_cols = cfg.get("group_columns", [])
        agg = cfg.get("aggregations", {})
        valid = [c for c in group_cols if c in df.columns]
        if valid and agg:
            return df.groupby(valid, as_index=False).agg(agg)

    elif stype == "pivot":
        index = cfg.get("index")
        columns = cfg.get("columns")
        values = cfg.get("values")
        if index in df.columns and columns in df.columns and values in df.columns:
            return df.pivot_table(index=index, columns=columns, values=values, aggfunc=cfg.get("aggfunc", "sum")).reset_index()

    elif stype == "unpivot":
        id_vars = [c for c in (cfg.get("id_columns") or []) if c in df.columns]
        value_vars = cfg.get("value_columns")
        if not value_vars:
            value_vars = [c for c in df.columns if c not in id_vars]
        return pd.melt(df, id_vars=id_vars, value_vars=value_vars,
                       var_name=cfg.get("var_name", "Attribute"),
                       value_name=cfg.get("value_name", "Value"))

    elif stype == "calculated_column":
        name = cfg.get("name") or cfg.get("new_name")
        formula = cfg.get("formula", "")
        if name and formula:
            out = df.copy()
            try:
                local = {c: out[c] for c in out.columns}
                local["np"] = np
                local["pd"] = pd
                out[name] = eval(formula, {"__builtins__": {}}, local)
            except Exception:
                out[name] = formula
            return out

    elif stype == "merge_join":
        other_data = cfg.get("data", [])
        on = cfg.get("on") or cfg.get("keys")
        how = cfg.get("how", "inner")
        if not other_data:
            raise ValueError("Could not load the second query for merge — check that it exists and has data")
        if not on:
            raise ValueError("Join column is required for merge")
        join_map = {"full": "outer", "full_outer": "outer"}
        how = join_map.get(how, how)
        other_df = pd.DataFrame(other_data)
        keys = on if isinstance(on, list) else [on]
        missing_left = [k for k in keys if k not in df.columns]
        missing_right = [k for k in keys if k not in other_df.columns]
        if missing_left or missing_right:
            parts = []
            if missing_left:
                parts.append(f"missing in current query: {', '.join(missing_left)}")
            if missing_right:
                parts.append(f"missing in second query: {', '.join(missing_right)}")
            raise ValueError(f"Join column not found ({'; '.join(parts)})")
        return df.merge(other_df, on=keys, how=how)

    elif stype == "append":
        other_data = cfg.get("data", [])
        if not other_data:
            raise ValueError("Could not load the second query for append — check that it exists and has data")
        other_df = pd.DataFrame(other_data)
        return pd.concat([df, other_df], ignore_index=True)

    return df


def apply_pipeline(df: pd.DataFrame, steps: List[Dict], up_to_index: Optional[int] = None) -> pd.DataFrame:
    """Apply transformation steps in order."""
    result = df.copy()
    limit = len(steps) if up_to_index is None else min(up_to_index + 1, len(steps))
    for i in range(limit):
        step = steps[i]
        if step.get("enabled", True) is False:
            continue
        result = apply_step(result, step)
    return result


def load_source_dataframe(file_path: str, skip_cache: bool = False) -> pd.DataFrame:
    return DataProcessor.read_file(file_path, skip_cache=skip_cache)


def dataframe_to_preview(df: pd.DataFrame, offset: int = 0, limit: int = 100) -> Dict[str, Any]:
    """Convert DataFrame to paginated preview payload."""
    total = len(df)
    slice_df = df.iloc[offset:offset + limit]
    records = []
    for _, row in slice_df.iterrows():
        rec = {}
        for k, v in row.items():
            if pd.isna(v):
                rec[k] = None
            elif isinstance(v, (np.integer,)):
                rec[k] = int(v)
            elif isinstance(v, (np.floating,)):
                rec[k] = float(v) if not np.isnan(v) else None
            elif isinstance(v, (datetime, pd.Timestamp)):
                rec[k] = v.isoformat()
            else:
                rec[k] = str(v) if not isinstance(v, (bool, int, float, str)) else v
        records.append(rec)
    return {
        "columns": [{"name": c, "type": str(df[c].dtype)} for c in df.columns],
        "rows": records,
        "total_rows": total,
        "offset": offset,
        "limit": limit,
    }


def make_step(step_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": step_type,
        "config": config,
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    }


def describe_step(step: Dict) -> str:
    stype = step.get("type", "unknown")
    cfg = step.get("config") or step
    descriptions = {
        "rename_column": lambda: f'Renamed "{cfg.get("column")}" to "{cfg.get("new_name")}"',
        "change_type": lambda: f'Changed type of "{cfg.get("column")}" to {cfg.get("data_type")}',
        "remove_column": lambda: f'Removed column "{cfg.get("column")}"',
        "duplicate_column": lambda: f'Duplicated "{cfg.get("column")}" as "{cfg.get("new_name")}"',
        "filter_rows": lambda: f'Filtered rows where {cfg.get("column")} {cfg.get("operator")} {cfg.get("value")}',
        "sort_rows": lambda: f'Sorted by {cfg.get("column") or cfg.get("columns")}',
        "remove_duplicates": lambda: "Removed duplicate rows",
        "remove_null_values": lambda: f'Removed null rows' + (f' in {cfg.get("columns")}' if cfg.get("columns") else ""),
        "group_by": lambda: f'Grouped by {cfg.get("group_columns")}',
        "pivot": lambda: f'Pivoted on {cfg.get("columns")}',
        "unpivot": lambda: "Unpivoted columns",
        "calculated_column": lambda: f'Added column "{cfg.get("name")}"',
        "replace_values": lambda: f'Replaced values in "{cfg.get("column")}"',
        "merge_columns": lambda: f'Merged columns into "{cfg.get("new_name")}"',
        "split_column": lambda: f'Split column "{cfg.get("column")}"',
        "append": lambda: "Appended dataset (UNION)",
        "merge_join": lambda: f'Merged dataset ({cfg.get("how", "inner")} JOIN)',
    }
    fn = descriptions.get(stype, lambda: stype)
    try:
        return fn()
    except Exception:
        return stype
