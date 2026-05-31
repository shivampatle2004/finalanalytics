import asyncio
import sys
sys.path.insert(0, '.')

from app.database import async_session
from sqlalchemy import text

async def check():
    async with async_session() as s:
        r = await s.execute(text('SELECT c.name as catalog_name, ls.name as schema_name, ls.physical_schema_name FROM catalogs c JOIN logical_schemas ls ON ls.catalog_id = c.id ORDER BY c.name, ls.name'))
        rows = r.fetchall()
        if not rows:
            print('NO CATALOGS/SCHEMAS FOUND!')
        for row in rows:
            print(f'Catalog={row[0]}, Schema={row[1]}, Physical={row[2]}')
        
        # Also check recent jobs
        r2 = await s.execute(text("SELECT id, status, error_message, created_at FROM etl.jobs ORDER BY created_at DESC LIMIT 5"))
        rows2 = r2.fetchall()
        print('\n--- Recent Jobs ---')
        for row in rows2:
            print(f'Job={row[0]}, status={row[1]}, error={str(row[2])[:100]}, created={row[3]}')

asyncio.run(check())
