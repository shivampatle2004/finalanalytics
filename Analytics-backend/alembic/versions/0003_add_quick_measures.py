"""Add quick_measures table

Revision ID: 0003_add_quick_measures
Revises: 0002_worksheet_arch
Create Date: 2026-05-24

"""
from alembic import op

revision = '0003_add_quick_measures'
down_revision = '0002_worksheet_arch'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS so re-running on an existing DB doesn't crash
    op.execute("""
        CREATE TABLE IF NOT EXISTS quick_measures (
            id VARCHAR NOT NULL,
            file_id VARCHAR REFERENCES uploaded_files(id),
            user_id INTEGER REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(100) NOT NULL,
            template_id VARCHAR(100) NOT NULL,
            template_label VARCHAR(255),
            field_mappings JSON NOT NULL,
            formula TEXT NOT NULL,
            aggregation VARCHAR(50),
            format_type VARCHAR(50),
            is_valid BOOLEAN,
            validation_errors JSON,
            cached_result FLOAT,
            cached_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_qm_file_id ON quick_measures (file_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_qm_user_id ON quick_measures (user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_qm_user_id")
    op.execute("DROP INDEX IF EXISTS idx_qm_file_id")
    op.execute("DROP TABLE IF EXISTS quick_measures")
