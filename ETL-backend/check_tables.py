import psycopg2

conn = psycopg2.connect(dbname='onestop_platform', user='postgres', password='chikku', host='127.0.0.1')
cur = conn.cursor()

print("=== ETL_PIPELINES (old table) ===")
cur.execute("SELECT id, name, status FROM etl_pipelines ORDER BY id DESC LIMIT 10")
for p in cur.fetchall():
    print(f"  id={str(p[0])[:12]} name={p[1]} status={p[2]}")

print()
print("=== ETL_JOBS (old table) ===")
cur.execute("SELECT id, pipeline_id, status, created_at FROM etl_jobs ORDER BY created_at DESC LIMIT 10")
for j in cur.fetchall():
    print(f"  id={str(j[0])[:12]} pipeline={str(j[1])[:12] if j[1] else None} status={j[2]} created={j[3]}")

print()
print("=== JOBS (new table) ===")
cur.execute("SELECT COUNT(*) FROM jobs")
print(f"  count = {cur.fetchone()[0]}")

print()
print("=== PIPELINES (new table) ===")
cur.execute("SELECT COUNT(*) FROM pipelines")
print(f"  count = {cur.fetchone()[0]}")

conn.close()
