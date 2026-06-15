"""Add report refresh schedule and history tables

Revision ID: 0004_report_refresh
Revises: 0003_add_quick_measures
Create Date: 2026-06-09

"""
from alembic import op

revision = '0004_report_refresh'
down_revision = '0003_add_quick_measures'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS report_refresh_schedule (
            id VARCHAR NOT NULL,
            report_id VARCHAR NOT NULL,
            resource_type VARCHAR(50) NOT NULL DEFAULT 'paginated_report',
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            refresh_type VARCHAR(50),
            cron_expression TEXT,
            timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
            start_at TIMESTAMP WITH TIME ZONE,
            last_refresh_at TIMESTAMP WITH TIME ZONE,
            next_refresh_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE,
            PRIMARY KEY (id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_rrs_report_id ON report_refresh_schedule (report_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rrs_enabled ON report_refresh_schedule (enabled)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rrs_next_refresh ON report_refresh_schedule (next_refresh_at)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS report_refresh_history (
            id VARCHAR NOT NULL,
            report_id VARCHAR NOT NULL,
            refresh_started_at TIMESTAMP WITH TIME ZONE,
            refresh_completed_at TIMESTAMP WITH TIME ZONE,
            status VARCHAR(50),
            records_processed INTEGER DEFAULT 0,
            error_message TEXT,
            PRIMARY KEY (id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_rrh_report_id ON report_refresh_history (report_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rrh_started_at ON report_refresh_history (refresh_started_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_rrh_started_at")
    op.execute("DROP INDEX IF EXISTS idx_rrh_report_id")
    op.execute("DROP TABLE IF EXISTS report_refresh_history")
    op.execute("DROP INDEX IF EXISTS idx_rrs_next_refresh")
    op.execute("DROP INDEX IF EXISTS idx_rrs_enabled")
    op.execute("DROP INDEX IF EXISTS idx_rrs_report_id")
    op.execute("DROP TABLE IF EXISTS report_refresh_schedule")
