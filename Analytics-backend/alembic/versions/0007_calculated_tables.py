"""0007 calculated tables

Revision ID: 0007_calculated_tables
Revises: 0006_query_master
Create Date: 2026-06-10
"""
from alembic import op

revision = '0007_calculated_tables'
down_revision = '0006_query_master'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS calculated_tables (
            id VARCHAR NOT NULL PRIMARY KEY,
            report_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            table_name VARCHAR(255) NOT NULL,
            description TEXT,
            method VARCHAR(50) NOT NULL DEFAULT 'formula',
            expression TEXT,
            builder_config JSON DEFAULT '{}',
            manual_data JSON DEFAULT '{}',
            source_tables JSON DEFAULT '[]',
            model_table_id VARCHAR,
            row_count INTEGER DEFAULT 0,
            is_valid BOOLEAN DEFAULT TRUE,
            validation_errors JSON,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_calc_tables_report ON calculated_tables (report_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS calculated_table_columns (
            id VARCHAR NOT NULL PRIMARY KEY,
            calculated_table_id VARCHAR NOT NULL REFERENCES calculated_tables(id) ON DELETE CASCADE,
            column_name VARCHAR(255) NOT NULL,
            data_type VARCHAR(50) DEFAULT 'text',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_calc_table_cols ON calculated_table_columns (calculated_table_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calculated_table_columns")
    op.execute("DROP TABLE IF EXISTS calculated_tables")
