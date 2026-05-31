import psycopg2

conn = psycopg2.connect(dbname='onestop_platform', user='postgres', password='chikku', host='127.0.0.1')
cur = conn.cursor()

print("Testing status-summary SQL directly...")
try:
    cur.execute("""
        SELECT
            j.pipeline_id,
            j.id           AS job_id,
            j.status       AS job_status,
            j.started_at,
            j.finished_at,
            j.rows_processed,
            COUNT(jr.id)                                                        AS total_runs,
            SUM(CASE WHEN jr.status IN ('success','failed') THEN 1 ELSE 0 END) AS done_runs,
            SUM(CASE WHEN jr.status = 'running'             THEN 1 ELSE 0 END) AS running_runs
        FROM etl.jobs j
        LEFT JOIN etl.job_runs jr ON jr.job_id = j.id
        WHERE j.id IN (
            SELECT DISTINCT ON (pipeline_id) id
            FROM etl.jobs
            WHERE pipeline_id IS NOT NULL
            ORDER BY pipeline_id, created_at DESC
        )
        GROUP BY j.pipeline_id, j.id, j.status, j.started_at, j.finished_at, j.rows_processed
    """)
    rows = cur.fetchall()
    print(f"Query OK! Got {len(rows)} rows:")
    for r in rows:
        print(f"  pipeline={str(r[0])[:8]} job={str(r[1])[:8]} status={r[2]} total_runs={r[6]} done={r[7]}")
except Exception as e:
    print(f"QUERY FAILED: {e}")
    # Try simpler version
    try:
        cur.execute("SELECT COUNT(*) FROM etl.jobs")
        print(f"etl.jobs count: {cur.fetchone()[0]}")
    except Exception as e2:
        print(f"Basic count failed: {e2}")

conn.close()
