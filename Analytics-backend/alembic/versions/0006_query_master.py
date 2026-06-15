"""Add query_master and query_steps tables

Revision ID: 0006_query_master
Revises: 0005_data_management
Create Date: 2026-06-10

"""
from alembic import op

revision = '0006_query_master'
down_revision = '0005_data_management'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS query_master (
            id VARCHAR NOT NULL PRIMARY KEY,
            report_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            query_name VARCHAR(255) NOT NULL,
            source_type VARCHAR(50) NOT NULL DEFAULT 'csv',
            source_config JSON DEFAULT '{}',
            created_by INTEGER REFERENCES users(id),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_query_master_report ON query_master (report_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS query_steps (
            id VARCHAR NOT NULL PRIMARY KEY,
            query_id VARCHAR NOT NULL REFERENCES query_master(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL DEFAULT 0,
            operation_type VARCHAR(50) NOT NULL,
            operation_config JSON NOT NULL DEFAULT '{}',
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_query_steps_query ON query_steps (query_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_query_steps_order ON query_steps (query_id, step_order)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS query_steps")
    op.execute("DROP TABLE IF EXISTS query_master")
