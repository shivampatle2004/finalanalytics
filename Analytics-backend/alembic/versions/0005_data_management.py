"""Add Power BI data management tables

Revision ID: 0005_data_management
Revises: 0004_report_refresh
Create Date: 2026-06-10

"""
from alembic import op

revision = '0005_data_management'
down_revision = '0004_report_refresh'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_datasources (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR REFERENCES uploaded_files(id),
            user_id INTEGER REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            source_type VARCHAR(50) NOT NULL,
            connection_config JSON DEFAULT '{}',
            encrypted_credentials TEXT,
            ssl_enabled BOOLEAN DEFAULT TRUE,
            health_status VARCHAR(50) DEFAULT 'unknown',
            last_health_check TIMESTAMP WITH TIME ZONE,
            last_error TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_ds_file_id ON bi_datasources (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_datasets (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            datasource_id VARCHAR REFERENCES bi_datasources(id),
            name VARCHAR(255) NOT NULL,
            source_table VARCHAR(255),
            source_query TEXT,
            schema_snapshot JSON DEFAULT '[]',
            row_count INTEGER DEFAULT 0,
            incremental_column VARCHAR(255),
            last_incremental_value VARCHAR(512),
            version INTEGER DEFAULT 1,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_dataset_file_id ON bi_datasets (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_dataset_transformations (
            id VARCHAR NOT NULL PRIMARY KEY,
            dataset_id VARCHAR NOT NULL REFERENCES bi_datasets(id),
            name VARCHAR(255) NOT NULL DEFAULT 'Query',
            steps JSON NOT NULL DEFAULT '[]',
            applied_steps_index INTEGER DEFAULT -1,
            undo_stack JSON DEFAULT '[]',
            redo_stack JSON DEFAULT '[]',
            version INTEGER DEFAULT 1,
            is_published BOOLEAN DEFAULT FALSE,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_transform_dataset ON bi_dataset_transformations (dataset_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_dataset_transformation_versions (
            id VARCHAR NOT NULL PRIMARY KEY,
            transformation_id VARCHAR NOT NULL REFERENCES bi_dataset_transformations(id),
            version INTEGER NOT NULL,
            steps JSON NOT NULL DEFAULT '[]',
            change_summary VARCHAR(500),
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_dataset_refresh_schedules (
            id VARCHAR NOT NULL PRIMARY KEY,
            dataset_id VARCHAR NOT NULL REFERENCES bi_datasets(id),
            file_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            enabled BOOLEAN DEFAULT FALSE,
            refresh_type VARCHAR(50) DEFAULT 'every_30_minutes',
            cron_expression TEXT,
            timezone VARCHAR(100) DEFAULT 'UTC',
            incremental_enabled BOOLEAN DEFAULT FALSE,
            last_refresh_at TIMESTAMP WITH TIME ZONE,
            next_refresh_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_refresh_file ON bi_dataset_refresh_schedules (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_dataset_refresh_logs (
            id VARCHAR NOT NULL PRIMARY KEY,
            dataset_id VARCHAR REFERENCES bi_datasets(id),
            file_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            status VARCHAR(50) DEFAULT 'running',
            refresh_type VARCHAR(50),
            records_fetched INTEGER DEFAULT 0,
            records_processed INTEGER DEFAULT 0,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            completed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            details JSON DEFAULT '{}'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_refresh_log_file ON bi_dataset_refresh_logs (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_report_parameters (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR NOT NULL REFERENCES uploaded_files(id),
            name VARCHAR(255) NOT NULL,
            display_name VARCHAR(255),
            param_type VARCHAR(50) NOT NULL,
            default_value JSON,
            current_value JSON,
            options JSON DEFAULT '[]',
            validation_rules JSON DEFAULT '{}',
            is_required BOOLEAN DEFAULT FALSE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_param_file ON bi_report_parameters (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_report_variables (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR REFERENCES uploaded_files(id),
            name VARCHAR(255) NOT NULL,
            display_name VARCHAR(255),
            variable_type VARCHAR(50) NOT NULL,
            scope VARCHAR(50) DEFAULT 'report',
            expression TEXT,
            current_value JSON,
            is_system BOOLEAN DEFAULT FALSE,
            is_editable BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_var_file ON bi_report_variables (file_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS bi_data_audit_logs (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR REFERENCES uploaded_files(id),
            user_id INTEGER REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(50),
            resource_id VARCHAR,
            details JSON DEFAULT '{}',
            ip_address VARCHAR(50),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bi_audit_file ON bi_data_audit_logs (file_id)")


def downgrade() -> None:
    for tbl in [
        "bi_data_audit_logs", "bi_report_variables", "bi_report_parameters",
        "bi_dataset_refresh_logs", "bi_dataset_refresh_schedules",
        "bi_dataset_transformation_versions", "bi_dataset_transformations",
        "bi_datasets", "bi_datasources",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
