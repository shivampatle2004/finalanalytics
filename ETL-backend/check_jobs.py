import psycopg2

conn = psycopg2.connect(dbname='onestop_platform', user='postgres', password='chikku', host='127.0.0.1')
cur = conn.cursor()

print("=== RECENT JOBS ===")
cur.execute("SELECT id, pipeline_id, status, started_at, finished_at, error_message FROM jobs ORDER BY created_at DESC LIMIT 10")
for j in cur.fetchall():
    pid = str(j[1])[:8] if j[1] else 'None'
    err = str(j[5])[:100] if j[5] else None
    print(f"  job={str(j[0])[:8]} pipe={pid} status={j[2]} started={j[3]} done={j[4]} err={err}")

print()
print("=== PIPELINES ===")
cur.execute("SELECT id, name, status FROM pipelines ORDER BY created_at DESC LIMIT 10")
for p in cur.fetchall():
    print(f"  id={str(p[0])[:8]} name={p[1]} status={p[2]}")

print()
print("=== ETL SCHEMAS IN DB ===")
cur.execute("SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_%' ORDER BY nspname")
for s in cur.fetchall():
    print(f"  schema: {s[0]}")

print()
print("=== TABLES IN ETL SCHEMAS ===")
cur.execute("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema LIKE 'etl_%' OR table_schema = 'public' ORDER BY table_schema, table_name")
for t in cur.fetchall():
    print(f"  {t[0]}.{t[1]}")

conn.close()
