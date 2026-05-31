import sys
import os

sys.path.append(os.getcwd())

# Test cases
derived_table_sql = """
SELECT *
FROM (
    SELECT customer_id
    FROM test.bronze.customer_large
) x;
"""

scalar_subquery_sql = """
SELECT *
FROM test.bronze.customer_large
WHERE annual_income >
(
    SELECT 500000
);
"""

cte_sql = """
WITH cte AS (
    SELECT *
    FROM test.bronze.customer_large
)
SELECT *
FROM cte;
"""

exists_sql = """
SELECT *
FROM test.bronze.customer_large c
WHERE EXISTS (
    SELECT 1
    FROM test.silver.orders o
    WHERE o.customer_id = c.customer_id
);
"""

# --- sqlparse Implementation ---
import sqlparse
from sqlparse.sql import Identifier
from sqlparse.tokens import Punctuation, Keyword, DML

def rewrite_sqlparse(sql):
    def process_identifier(token):
        flat_tokens = [t for t in token.tokens if not t.is_whitespace]
        for t in flat_tokens:
            if t.is_group and not isinstance(t, Identifier):
                return token
            if t.ttype in (Keyword, DML):
                return token
        dots = [i for i, t in enumerate(flat_tokens) if t.ttype == Punctuation and t.value == '.']
        if len(dots) >= 2:
            parts = []
            current_part = []
            for t in flat_tokens:
                if t.ttype == Punctuation and t.value == '.':
                    parts.append("".join(x.value for x in current_part))
                    current_part = []
                else:
                    current_part.append(t)
            if current_part:
                parts.append("".join(x.value for x in current_part))
            
            p0 = parts[0].strip('"').strip('`').strip('[]')
            p1 = parts[1].strip('"').strip('`').strip('[]')
            was_quoted = (parts[0].startswith('"') or parts[1].startswith('"'))
            combined_schema = f'"{p0}_{p1}"' if was_quoted else f"{p0}_{p1}"
            rewritten_parts = [combined_schema] + parts[2:]
            new_val = ".".join(rewritten_parts)
            return sqlparse.parse(new_val)[0].tokens[0]
        return token

    def walk_and_rewrite(token_list):
        for i, token in enumerate(token_list.tokens):
            if isinstance(token, Identifier):
                walk_and_rewrite(token)
                token_list.tokens[i] = process_identifier(token_list.tokens[i])
            elif token.is_group:
                walk_and_rewrite(token)

    parsed = sqlparse.parse(sql)
    for stmt in parsed:
        walk_and_rewrite(stmt)
    return "".join(str(stmt) for stmt in parsed)


# --- sqlglot Implementation ---
import sqlglot
from sqlglot import exp

def rewrite_sqlglot(sql):
    parsed = sqlglot.parse_one(sql, read="postgres")
    
    def transform(node):
        if isinstance(node, exp.Table):
            if node.catalog and node.db:
                catalog = node.catalog
                db = node.db
                table = node.name
                
                combined_schema = f"{catalog}_{db}"
                
                # Check quoting
                catalog_quoted = node.args.get("catalog", exp.to_identifier("")).args.get("quoted", False)
                db_quoted = node.args.get("db", exp.to_identifier("")).args.get("quoted", False)
                was_quoted = catalog_quoted or db_quoted
                
                new_table = exp.Table(
                    this=exp.to_identifier(table, quoted=node.this.args.get("quoted", False)),
                    db=exp.to_identifier(combined_schema, quoted=was_quoted)
                )
                return new_table
        return node

    transformed = parsed.transform(transform)
    return transformed.sql(dialect="postgres", pretty=True)

# Helper to print sqlparse tokens visited
def print_sqlparse_details(sql):
    parsed = sqlparse.parse(sql)[0]
    visited = []
    identifiers = []
    
    def walk(token_list):
        for token in token_list.tokens:
            val = token.value.strip().replace('\n', ' ')
            visited.append(f"{type(token).__name__} [{val}]")
            if isinstance(token, Identifier):
                flat = [t for t in token.tokens if not t.is_whitespace]
                dots = [t for t in flat if t.ttype == Punctuation and t.value == '.']
                if len(dots) >= 2:
                    identifiers.append(token.value)
                walk(token)
            elif token.is_group:
                walk(token)
    walk(parsed)
    return visited, identifiers

# Run tests
test_cases = [
    ("Derived Table", derived_table_sql),
    ("Scalar Subquery", scalar_subquery_sql),
    ("CTE", cte_sql),
    ("EXISTS", exists_sql),
]

for name, q in test_cases:
    print(f"\n========================================\nTEST CASE: {name}\n========================================")
    print("--- 1. Original SQL ---")
    print(q.strip())
    
    print("\n--- 2. AST Structure & Token Visited ---")
    visited, ids = print_sqlparse_details(q)
    print("First 20 Visited Tokens:")
    for v in visited[:20]:
        print(f"  {v}")
    
    print("\n--- 3. Identifiers Found (before rewrite) ---")
    for i in ids:
        print(f"  - {i}")
        
    print("\n--- 4. sqlparse Rewrite ---")
    rewritten_parse = rewrite_sqlparse(q)
    print(rewritten_parse.strip())
    
    print("\n--- 5. sqlglot Rewrite ---")
    try:
        rewritten_glot = rewrite_sqlglot(q)
        print(rewritten_glot.strip())
    except Exception as e:
        print("sqlglot failed:", e)
