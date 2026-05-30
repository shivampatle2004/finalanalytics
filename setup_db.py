import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

passwords = ['Chikku@123', 'chikku']
conn = None
correct_password = None

for pwd in passwords:
    try:
        conn = psycopg2.connect(
            dbname='postgres',
            user='postgres',
            password=pwd,
            host='localhost',
            port=5432
        )
        correct_password = pwd
        break
    except Exception as e:
        pass

if not conn:
    print("Could not connect to PostgreSQL with any of the known passwords.")
    exit(1)

print(f"Connected to PostgreSQL successfully using password: {correct_password}")
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cursor = conn.cursor()

# Check if db exists
cursor.execute("SELECT 1 FROM pg_database WHERE datname = 'onestop_platform'")
if not cursor.fetchone():
    print("Creating database onestop_platform...")
    cursor.execute('CREATE DATABASE onestop_platform')
else:
    print("Database onestop_platform already exists.")

cursor.close()
conn.close()

# Connect to the new database to create schemas
print("Connecting to onestop_platform...")
conn_new = psycopg2.connect(
    dbname='onestop_platform',
    user='postgres',
    password=correct_password,
    host='localhost',
    port=5432
)
conn_new.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur_new = conn_new.cursor()

schemas = ['etl', 'analytics', 'workflow', 'history']
for schema in schemas:
    print(f"Creating schema {schema}...")
    cur_new.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")

print("Database and schemas setup successfully.")
cur_new.close()
conn_new.close()

# Print correct password so we can update env files
print(f"CORRECT_PWD={correct_password}")
