import sqlparse
from sqlparse.sql import Identifier, TokenList, Token
from sqlparse.tokens import Name, Punctuation

sql = """
SELECT *
FROM (
    SELECT customer_id, annual_income
    FROM test.bronze.customer_large
) x;
"""

statements = sqlparse.parse(sql)
print("Number of statements:", len(statements))
stmt = statements[0]

def print_tokens(token_list, depth=0):
    for token in token_list.tokens:
        indent = "  " * depth
        print(f"{indent}{type(token).__name__} [{token.ttype}]: '{token.value}'")
        if token.is_group:
            print_tokens(token, depth + 1)

print_tokens(stmt)
