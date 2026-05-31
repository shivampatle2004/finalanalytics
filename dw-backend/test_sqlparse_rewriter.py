import sqlparse
from sqlparse.sql import Identifier, TokenList, Token
from sqlparse.tokens import Name, Punctuation, String, Keyword, DML

def process_identifier(token):
    """
    Check if an Identifier token represents a 3-level or 4-level name
    (e.g., catalog.schema.table or catalog.schema.table.column).
    If so, rewrites it to catalog_schema.table[.column].
    """
    # Get all non-whitespace tokens inside the identifier
    flat_tokens = [t for t in token.tokens if not t.is_whitespace]
    
    # Robust check: if the identifier contains Keywords, DML, or sub-groups that are not Identifiers (like Parenthesis),
    # it is a complex query block or subquery and NOT a simple table/column reference identifier.
    for t in flat_tokens:
        if t.is_group and not isinstance(t, Identifier):
            return token
        if t.ttype in (Keyword, DML):
            return token

    # We expect a pattern of name/symbol, dot, name/symbol, dot, name/symbol...
    # Let's check how many dot punctuations we have
    dots = [i for i, t in enumerate(flat_tokens) if t.ttype == Punctuation and t.value == '.']
    
    # If we have 2 dots, it's a 3-level name (catalog.schema.table)
    # If we have 3 dots, it could be a 4-level name (catalog.schema.table.column)
    if len(dots) >= 2:
        # Reconstruct the parts
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
            
        print("Detected multi-level identifier parts:", parts)
        
        # We need to rewrite the first two parts into a single part Combined with '_'
        p0 = parts[0].strip('"').strip('`').strip('[]')
        p1 = parts[1].strip('"').strip('`').strip('[]')
        
        was_quoted = (parts[0].startswith('"') or parts[1].startswith('"'))
        combined_schema = f'"{p0}_{p1}"' if was_quoted else f"{p0}_{p1}"
        
        rewritten_parts = [combined_schema] + parts[2:]
        new_val = ".".join(rewritten_parts)
        
        # Return a new Token or Identifier representation
        new_parsed = sqlparse.parse(new_val)[0].tokens[0]
        return new_parsed
        
    return token

def walk_and_rewrite(token_list):
    """Recursively walk the token list and rewrite matching identifiers."""
    for i, token in enumerate(token_list.tokens):
        if isinstance(token, Identifier):
            # First, recursively walk the child tokens of the identifier
            # so that nested subqueries or identifiers inside parentheses are processed!
            walk_and_rewrite(token)
            # Now, process the identifier itself at this level
            token_list.tokens[i] = process_identifier(token_list.tokens[i])
        elif token.is_group:
            walk_and_rewrite(token)

def rewrite_sql(sql):
    parsed = sqlparse.parse(sql)
    for stmt in parsed:
        walk_and_rewrite(stmt)
    return "".join(str(stmt) for stmt in parsed)

# Test cases
test_queries = [
    # 1. Simple query
    "SELECT * FROM test.bronze.customer_large;",
    # 2. Quoted query
    'SELECT * FROM "test"."bronze"."customer_large";',
    # 3. Subquery
    """
    SELECT *
    FROM (
        SELECT customer_id, annual_income
        FROM test.bronze.customer_large
    ) x;
    """,
    # 4. CTE
    """
    WITH cte AS (
        SELECT * FROM test.bronze.customer_large
    )
    SELECT * FROM cte;
    """,
    # 5. Column references
    "SELECT test.bronze.customer_large.customer_id FROM test.bronze.customer_large;"
]

for idx, q in enumerate(test_queries, 1):
    print(f"\n--- Test Case {idx} ---")
    print("Original:")
    print(q.strip())
    rewritten = rewrite_sql(q)
    print("Rewritten:")
    print(rewritten.strip())
