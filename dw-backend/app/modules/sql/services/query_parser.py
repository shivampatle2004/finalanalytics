"""
SQL query parsing and wrapping utilities for safe pagination.
Uses sqlglot for AST-based catalog/schema/table rewriting and sqlparse-era
helpers for pagination clause detection.
"""
import logging
import re

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)


def _table_parts(node: exp.Table) -> tuple[str | None, str | None, str]:
    """Return (catalog, schema/db, table) from a sqlglot Table node."""
    catalog = node.catalog
    schema = node.db
    table = node.name or ""
    return catalog, schema, table


def _logical_table_path(node: exp.Table) -> str | None:
    """Dotted logical name for a table reference, or None if unqualified."""
    catalog, schema, table = _table_parts(node)
    if not table:
        return None
    if catalog and schema:
        return f"{catalog}.{schema}.{table}"
    if schema:
        return f"{schema}.{table}"
    return table


def _identifier_quoted(node: exp.Expression | None) -> bool:
    if node is None:
        return False
    return bool(node.args.get("quoted"))


def iter_table_paths(sql: str) -> list[str]:
    """
    Return unique logical table paths found anywhere in the SQL (including subqueries).
    Examples: test.bronze.customer_large, public.users
    """
    if not sql or not sql.strip():
        return []

    paths: list[str] = []
    seen: set[str] = set()
    try:
        for stmt in sqlglot.parse(sql, read="postgres"):
            if not stmt:
                continue
            for node in stmt.find_all(exp.Table):
                path = _logical_table_path(node)
                if path and path not in seen:
                    seen.add(path)
                    paths.append(path)
    except Exception as exc:
        logger.warning("iter_table_paths parse failed: %s", exc)
    return paths


def to_pg_physical_table_name(logical_path: str) -> str:
    """
    Map logical catalog.schema.table to physical catalog_schema.table.
    Two-level schema.table is returned unchanged.
    """
    parts = logical_path.split(".")
    if len(parts) == 3:
        return f"{parts[0]}_{parts[1]}.{parts[2]}"
    return logical_path


def rewrite_three_level_names(sql: str) -> str:
    """
    Parse the query using sqlglot, find exp.Table nodes,
    and combine logical 3-level name catalog.schema.table to physical catalog_schema.table.
    Supports multi-statement queries and falls back gracefully to original SQL if parsing fails.
    """
    if not sql or not sql.strip():
        return sql

    try:
        statements = sqlglot.parse(sql, read="postgres")
        rewritten_statements = []
        for stmt in statements:
            if not stmt:
                continue

            def transform(node: exp.Expression) -> exp.Expression:
                if isinstance(node, exp.Table):
                    catalog, schema, table = _table_parts(node)
                    if catalog and schema:
                        combined_schema = f"{catalog}_{schema}"
                        was_quoted = (
                            _identifier_quoted(node.args.get("catalog"))
                            or _identifier_quoted(node.args.get("db"))
                        )
                        new_table = exp.Table(
                            this=exp.to_identifier(
                                table,
                                quoted=_identifier_quoted(node.this),
                            ),
                            db=exp.to_identifier(combined_schema, quoted=was_quoted),
                        )
                        if node.alias:
                            new_table.set("alias", node.args["alias"])
                        return new_table
                return node

            transformed = stmt.transform(transform)
            rewritten_statements.append(transformed.sql(dialect="postgres"))

        return ";\n".join(rewritten_statements)
    except Exception as exc:
        logger.warning(
            "sqlglot parsing failed: %s. Using original query.", exc
        )
        return sql


def rewrite_spark_table_names(sql: str) -> str:
    """
    Rewrite qualified table references to Spark-safe flat names (dots -> underscores).
    Used after PG tables are registered as temp views.
    """
    if not sql or not sql.strip():
        return sql

    try:
        statements = sqlglot.parse(sql, read="postgres")
        rewritten_statements = []
        for stmt in statements:
            if not stmt:
                continue

            def transform(node: exp.Expression) -> exp.Expression:
                if isinstance(node, exp.Table):
                    catalog, schema, table = _table_parts(node)
                    parts = [p for p in (catalog, schema, table) if p]
                    if len(parts) >= 2:
                        flat = "_".join(parts)
                        new_table = exp.Table(
                            this=exp.to_identifier(
                                flat,
                                quoted=_identifier_quoted(node.this),
                            )
                        )
                        if node.alias:
                            new_table.set("alias", node.args["alias"])
                        return new_table
                return node

            transformed = stmt.transform(transform)
            rewritten_statements.append(transformed.sql(dialect="postgres"))

        return ";\n".join(rewritten_statements)
    except Exception as exc:
        logger.warning(
            "spark table rewrite failed: %s. Using original query.", exc
        )
        return sql


def clean_query(sql: str) -> str:
    """Strip comments, trailing semicolons, and normalize whitespace."""
    sql = re.sub(r'--[^\n]*', '', sql)
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    sql = sql.strip().rstrip(';').strip()
    return sql


def validate_sql_structure(sql: str) -> tuple[bool, str]:
    """Reject obviously truncated SQL (e.g. split nested subqueries)."""
    depth = 0
    in_single = in_double = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        prev = sql[i - 1] if i else ""
        if ch == "'" and not in_double and prev != "\\":
            in_single = not in_single
        elif ch == '"' and not in_single and prev != "\\":
            in_double = not in_double
        elif not in_single and not in_double:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
        i += 1

    if depth != 0:
        return (
            False,
            "Query has unbalanced parentheses. A nested SELECT may have been "
            "split into a separate statement. Run the full query together.",
        )

    stripped = sql.rstrip()
    if re.search(r"\bFROM\s*\(\s*$", stripped, re.IGNORECASE):
        return (
            False,
            "Query ends with an incomplete subquery (FROM (). Run the entire "
            "query as one statement.",
        )

    return True, ""


def _normalized(sql: str) -> str:
    """Return a lowered, whitespace-collapsed version for pattern matching."""
    return re.sub(r'\s+', ' ', sql.lower().strip())


def has_order_by(sql: str) -> bool:
    """Detect if the outermost query has an ORDER BY clause."""
    normalized = _normalized(sql)
    depth = 0
    outer = []
    for char in normalized:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif depth == 0:
            outer.append(char)
    outer_sql = ''.join(outer)
    return 'order by' in outer_sql


def has_limit(sql: str) -> bool:
    """Detect if the outermost query already has a LIMIT clause."""
    normalized = _normalized(sql)
    depth = 0
    outer = []
    for char in normalized:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif depth == 0:
            outer.append(char)
    outer_sql = ''.join(outer)
    return bool(re.search(r'\blimit\b', outer_sql))


def is_aggregate_query(sql: str) -> bool:
    """Detect GROUP BY or aggregate functions (COUNT, SUM, AVG, etc.)."""
    normalized = _normalized(sql)
    if re.search(r'\bgroup\s+by\b', normalized):
        return True
    if re.search(r'\b(count|sum|avg|min|max)\s*\(', normalized):
        return True
    return False


def is_cte_query(sql: str) -> bool:
    """Check if the query starts with a WITH clause (CTE)."""
    return _normalized(sql).startswith('with ')


def add_default_order(sql: str) -> str:
    """
    Passthrough: We no longer arbitrarily add ORDER BY 1, as it confuses users
    and can break on unsortable columns.
    """
    return sql


def wrap_with_pagination(sql: str, limit: int, offset: int) -> tuple:
    """
    Wrap the user query safely and apply LIMIT/OFFSET.
    Returns (wrapped_sql, params_dict).
    Uses parameterized values for LIMIT and OFFSET.
    """
    wrapped = (
        f"SELECT * FROM (\n{sql}\n) AS _user_query\n"
        f"LIMIT :_pg_limit OFFSET :_pg_offset"
    )
    params = {"_pg_limit": limit, "_pg_offset": offset}
    return wrapped, params


def wrap_with_cursor(
    sql: str,
    cursor_column: str,
    cursor_value: str,
    limit: int,
    direction: str = "next",
) -> tuple:
    """
    Wrap the user query with keyset/cursor-based pagination.
    Returns (wrapped_sql, params_dict).
    """
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', cursor_column):
        raise ValueError(f"Invalid cursor column name: {cursor_column}")

    if direction == "next":
        op = ">"
    else:
        op = "<"

    wrapped = (
        f"SELECT * FROM (\n{sql}\n) AS _user_query\n"
        f"WHERE {cursor_column} {op} :_pg_cursor_val\n"
        f"ORDER BY {cursor_column}\n"
        f"LIMIT :_pg_limit"
    )
    params = {"_pg_cursor_val": cursor_value, "_pg_limit": limit}
    return wrapped, params


def build_count_query(sql: str) -> str:
    """
    Build a COUNT(*) query that wraps the user's query.
    Uses CTE approach to safely handle any query shape.
    """
    return f"SELECT COUNT(*) AS total FROM (\n{sql}\n) AS _count_subquery"


def strip_existing_limit(sql: str) -> str:
    """
    Remove any existing LIMIT/OFFSET from the outer level of the query.
    Needed so our pagination wrapper doesn't conflict.
    """
    normalized = _normalized(sql)
    depth = 0
    outer_limit_pos = -1

    i = 0
    while i < len(normalized):
        if normalized[i] == '(':
            depth += 1
        elif normalized[i] == ')':
            depth -= 1
        elif depth == 0:
            remaining = normalized[i:]
            match = re.match(r'\blimit\b', remaining)
            if match:
                outer_limit_pos = i
                break
        i += 1

    if outer_limit_pos == -1:
        return sql

    return sql[:outer_limit_pos].rstrip()
