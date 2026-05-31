import re

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

table_pattern = r"(?:FROM|JOIN)\s+([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*){2})"

def rewrite(query):
    matches = re.findall(table_pattern, query, re.IGNORECASE)
    print("Matches:", matches)
    processed_query = query
    for full_path in set(matches):
        parts = full_path.split(".")
        physical_name = f"{parts[0]}_{parts[1]}.{parts[2]}"
        processed_query = re.sub(
            r"\b" + re.escape(full_path) + r"\b",
            physical_name,
            processed_query,
            flags=re.IGNORECASE
        )
    return processed_query

print("=== Query 1 ===")
print(rewrite(query1))
print("=== Query 2 ===")
print(rewrite(query2))
