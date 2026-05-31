import sys
import os

# Add parent directory to path
sys.path.append(os.getcwd())

from app.services.execution_engine import execution_engine

query1 = """
SELECT *
FROM (
    SELECT customer_id, annual_income
    FROM test.bronze.customer_large
) x;
"""

query2 = """
SELECT *
FROM test.bronze.customer_large
WHERE annual_income >
(
    SELECT 500000
);
"""

print("Executing query 1 via execution_engine:")
res1 = execution_engine.execute("sql", query1, {"engine": "postgres", "schema": "public"})
print("Success:", res1["success"])
print("Message:", res1["message"])
if res1["success"]:
    print("Row count:", len(res1["rows"]))

print("\nExecuting query 2 via execution_engine:")
res2 = execution_engine.execute("sql", query2, {"engine": "postgres", "schema": "public"})
print("Success:", res2["success"])
print("Message:", res2["message"])
if res2["success"]:
    print("Row count:", len(res2["rows"]))
