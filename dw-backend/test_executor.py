import sys
import os

# Add parent directory to path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.modules.sql.services.paginated_executor import run_paginated_query

db = SessionLocal()

query = """
SELECT *
FROM (
    SELECT customer_id, annual_income
    FROM test.bronze.customer_large
) x;
"""

print("Executing run_paginated_query with query:")
print(query)

res = run_paginated_query(db, query, schema_name="public")
print("\n--- Response ---")
print("Success:", res.success)
print("Message:", res.message)
if res.success:
    print("Columns:", res.columns)
    print("Rows count:", len(res.rows))
