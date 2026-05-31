import psycopg2
from datetime import datetime, timezone

conn = psycopg2.connect(dbname='onestop_platform', user='postgres', password='chikku', host='127.0.0.1')
cur = conn.cursor()

# Mark stuck 'running' jobs as 'failed' so pipelines can be re-run cleanly
cur.execute("""
    UPDATE etl.jobs 
    SET status = 'failed',
        finished_at = NOW(),
        error_message = 'Job interrupted: server was restarted while job was running'
    WHERE status = 'running'
    RETURNING id, pipeline_id
""")
stuck = cur.fetchall()
print(f"Fixed {len(stuck)} stuck running jobs:")
for j in stuck:
    print(f"  job={str(j[0])[:8]} pipeline={str(j[1])[:8]}")

conn.commit()
conn.close()
print("Done.")
