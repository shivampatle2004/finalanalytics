import sqlglot
from sqlglot import exp

def rewrite_three_level_names(sql: str) -> str:
    if not sql or not sql.strip():
        return sql
    
    try:
        statements = sqlglot.parse(sql, read="postgres")
        rewritten_statements = []
        for stmt in statements:
            if stmt:
                def transform(node):
                    if isinstance(node, exp.Table):
                        if node.catalog and node.db:
                            catalog = node.catalog
                            db = node.db
                            table = node.name
                            
                            combined_schema = f"{catalog}_{db}"
                            
                            catalog_quoted = node.args.get("catalog", exp.to_identifier("")).args.get("quoted", False)
                            db_quoted = node.args.get("db", exp.to_identifier("")).args.get("quoted", False)
                            was_quoted = catalog_quoted or db_quoted
                            
                            new_table = exp.Table(
                                this=exp.to_identifier(table, quoted=node.this.args.get("quoted", False)),
                                db=exp.to_identifier(combined_schema, quoted=was_quoted)
                            )
                            return new_table
                    return node
                
                transformed = stmt.transform(transform)
                rewritten_statements.append(transformed.sql(dialect="postgres"))
        
        return ";\n".join(rewritten_statements)
    except Exception as e:
        return sql

# Test multi statement query
sql = """
SELECT * FROM test.bronze.customer_large;
SELECT customer_id FROM test.silver.orders;
"""

print("Original SQL:")
print(sql.strip())
print("\nRewritten:")
print(rewrite_three_level_names(sql).strip())
