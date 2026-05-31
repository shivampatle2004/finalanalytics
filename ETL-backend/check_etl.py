import psycopg2

conn = psycopg2.connect(dbname='onestop_platform', user='postgres', password='chikku', host='127.0.0.1')
cur = conn.cursor()

print("=== ETL SCHEMA TABLES ===")
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='etl' ORDER BY table_name")
for t in cur.fetchall():
    print(f"  etl.{t[0]}")

print()
print("=== etl.pipelines ===")
cur.execute("SELECT id, name, status FROM etl.pipelines ORDER BY created_at DESC LIMIT 10")
for p in cur.fetchall():
    print(f"  id={str(p[0])[:8]} name={p[1]!r} status={p[2]}")

print()
print("=== etl.jobs ===")
cur.execute("SELECT id, pipeline_id, status, started_at, finished_at, error_message FROM etl.jobs ORDER BY created_at DESC LIMIT 10")
for j in cur.fetchall():
    pid = str(j[1])[:8] if j[1] else 'None'
    err = str(j[5])[:120] if j[5] else None
    print(f"  job={str(j[0])[:8]} pipe={pid} status={j[2]} started={j[3]} done={j[4]}")
    if err:
        print(f"    ERR: {err}")

print()
print("=== STATUS SUMMARY (latest job per pipeline) ===")
cur.execute("""
    SELECT p.name, p.id, j.status, j.started_at, j.finished_at
    FROM etl.pipelines p
    LEFT JOIN LATERAL (
        SELECT status, started_at, finished_at
        FROM etl.jobs
        WHERE pipeline_id = p.id
        ORDER BY created_at DESC LIMIT 1
    ) j ON true
    ORDER BY p.name
""")
for r in cur.fetchall():
    print(f"  pipeline={r[0]!r} last_job_status={r[2]} started={r[3]} done={r[4]}")

print()
print("=== ALL SCHEMAS & TABLES (non-system) ===")
cur.execute("""
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
      AND table_schema NOT LIKE 'pg_%'
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
""")
for t in cur.fetchall():
    if not t[1].startswith(('alembic','pg_')):
        print(f"  {t[0]}.{t[1]}")

conn.close()
