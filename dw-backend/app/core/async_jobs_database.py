"""
Async database engine and session factory for the Jobs & Pipelines system.

Used exclusively by the orchestrator and scheduler to avoid blocking the
FastAPI event loop. All other code continues using the synchronous
jobs_database.py sessions.

IMPORTANT: This module must connect to the SAME database as the sync layer
(jobs_database.py / database.py) so that job records created via the API
are visible to the async orchestrator. The sync URL (postgresql://) is
converted to an asyncpg URL (postgresql+asyncpg://).

Driver: asyncpg (pure-Python async PostgreSQL driver)
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Guarantee .env is loaded first
from app.core.config import settings  # noqa: F401

# ── Derive async URL from the same DATABASE_URL the sync layer uses ──────────
# This ensures both sync and async sessions talk to the same database (OnStopDW).
_sync_url = settings.DATABASE_URL  # e.g. postgresql://user:pass@host:port/OnStopDW

# Convert postgresql:// → postgresql+asyncpg://
if _sync_url.startswith("postgresql://"):
    ASYNC_JOBS_DATABASE_URL = _sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _sync_url.startswith("postgresql+psycopg2://"):
    ASYNC_JOBS_DATABASE_URL = _sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
else:
    # Fallback: assume it's a standard postgresql:// URL
    ASYNC_JOBS_DATABASE_URL = "postgresql+asyncpg://" + _sync_url.split("://", 1)[-1]

print(f"DEBUG [async_jobs_database]: Async URL -> {ASYNC_JOBS_DATABASE_URL.split('@')[-1]}")

async_jobs_engine = create_async_engine(
    ASYNC_JOBS_DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncJobsSession = async_sessionmaker(
    bind=async_jobs_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
