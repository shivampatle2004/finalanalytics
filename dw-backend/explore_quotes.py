import sqlparse

sql = 'SELECT * FROM "test"."bronze"."customer_large";'
stmt = sqlparse.parse(sql)[0]

def print_tokens(token_list, depth=0):
    for token in token_list.tokens:
        indent = "  " * depth
        print(f"{indent}{type(token).__name__} [{token.ttype}]: '{token.value}'")
        if token.is_group:
            print_tokens(token, depth + 1)

print_tokens(stmt)
