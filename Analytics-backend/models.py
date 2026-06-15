import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, JSON, Table, Text, Boolean, Index, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# Wrapper for UUID dealing with SQLite's lack of native UUID type
def get_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    files = relationship("UploadedFile", back_populates="owner")
    db_connections = relationship("UserDatabaseConnection", back_populates="owner", cascade="all, delete-orphan")

class UserDatabaseConnection(Base):
    __tablename__ = "user_db_connections"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    connection_name = Column(String, nullable=False)
    db_type = Column(String, default="postgresql")
    host = Column(String, nullable=False)
    port = Column(Integer, default=5432)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=False) # In a real app, this should be encrypted
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="db_connections")


class RemoteConnectionProfile(Base):
    """Saved remote DB connections (password encrypted at rest)."""
    __tablename__ = "remote_connection_profiles"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    connection_name = Column(String, nullable=False)
    db_type = Column(String, default="postgresql")
    host = Column(String, nullable=False)
    port = Column(Integer, default=5432)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    encrypted_password = Column(Text, nullable=False)
    ssl_enabled = Column(Boolean, default=True)
    ssl_mode = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_favorite = Column(Boolean, default=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    status = Column(String, default="pending") # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)
    model_config = Column(JSON, nullable=True) # stores { tables: [], relationships: [] }
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="files")
    columns = relationship("FileColumn", back_populates="file", cascade="all, delete-orphan")
    graphs = relationship("GraphDefinition", back_populates="file", cascade="all, delete-orphan")

class FileColumn(Base):
    __tablename__ = "file_columns"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"))
    column_name = Column(String, nullable=False)
    data_type = Column(String, nullable=False) # numeric, categorical, datetime, etc.
    null_count = Column(Integer, default=0)
    unique_count = Column(Integer, default=0)

    file = relationship("UploadedFile", back_populates="columns")
    statistics = relationship("ColumnStatistic", uselist=False, back_populates="column", cascade="all, delete-orphan")

class ColumnStatistic(Base):
    __tablename__ = "column_statistics"

    id = Column(String, primary_key=True, default=get_uuid)
    column_id = Column(String, ForeignKey("file_columns.id"), unique=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    mean_value = Column(Float, nullable=True)
    median_value = Column(Float, nullable=True)
    std_dev = Column(Float, nullable=True)
    top_values = Column(JSON, nullable=True) # Use generic JSON for compatibility

    column = relationship("FileColumn", back_populates="statistics")

class GraphDefinition(Base):
    __tablename__ = "graph_definitions"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"))
    graph_type = Column(String, nullable=False) # bar, scatter, line, histogram, etc.
    x_axis = Column(String, nullable=False)
    y_axis = Column(String, nullable=True)
    aggregation = Column(String, nullable=True) # sum, mean, count, none
    cached_data = Column(JSON, nullable=True) # Store pre-calculated result {labels: [], values: []}
    options = Column(JSON, nullable=True) # Store formatting options {mainColor, title, showXAxis, etc.}

    file = relationship("UploadedFile", back_populates="graphs")


# ─────────────────────────────────────────────────────────────────────────────
# ETL SYSTEM MODELS
# ─────────────────────────────────────────────────────────────────────────────

class ETLConnection(Base):
    """Source or target connection config. Credentials stored encrypted."""
    __tablename__ = "etl_connections"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    conn_type = Column(String, nullable=False)  # postgresql, mysql, mssql, oracle, csv, excel, json, cloud
    host = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    database = Column(String, nullable=True)
    username = Column(String, nullable=True)
    encrypted_password = Column(Text, nullable=True)
    extra_config = Column(JSON, nullable=True)   # OAuth tokens, cloud paths, JDBC options
    environment = Column(String, default="dev")  # dev, test, prod
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ETLPipeline(Base):
    """Metadata-driven pipeline definition."""
    __tablename__ = "etl_pipelines"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    environment = Column(String, default="dev")  # dev, test, prod
    status = Column(String, default="draft")      # draft, active, archived
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    nodes = relationship("ETLWorkflowNode", back_populates="pipeline", cascade="all, delete-orphan")
    edges = relationship("ETLWorkflowEdge", back_populates="pipeline", cascade="all, delete-orphan")
    schedules = relationship("ETLSchedule", back_populates="pipeline", cascade="all, delete-orphan")
    jobs = relationship("ETLJob", back_populates="pipeline", cascade="all, delete-orphan")
    versions = relationship("ETLPipelineVersion", back_populates="pipeline", cascade="all, delete-orphan")


class ETLPipelineVersion(Base):
    """Snapshot of a pipeline at a specific version for rollback support."""
    __tablename__ = "etl_pipeline_versions"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False)   # Full serialized pipeline definition
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    pipeline = relationship("ETLPipeline", back_populates="versions")


class ETLWorkflowNode(Base):
    """A DAG node: Extract / Transform / Load."""
    __tablename__ = "etl_workflow_nodes"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    node_type = Column(String, nullable=False)  # extract, transform, load
    label = Column(String, nullable=False)
    config = Column(JSON, nullable=True)         # Source/target conn, query, transforms, etc.
    position_x = Column(Float, default=0)
    position_y = Column(Float, default=0)
    retry_count = Column(Integer, default=0)
    retry_delay_sec = Column(Integer, default=30)
    fail_fast = Column(String, default="true")

    pipeline = relationship("ETLPipeline", back_populates="nodes")


class ETLWorkflowEdge(Base):
    """Directed edge between two DAG nodes."""
    __tablename__ = "etl_workflow_edges"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    source_node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=False)
    target_node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=False)
    condition = Column(String, nullable=True)    # e.g., "on_success", "on_failure", "always"

    pipeline = relationship("ETLPipeline", back_populates="edges")


class ETLTransformRule(Base):
    """Column or table-level transformation rule with versioning."""
    __tablename__ = "etl_transform_rules"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=True)
    rule_type = Column(String, nullable=False)   # column, table
    scope = Column(String, nullable=True)        # column name or "*"
    operation = Column(String, nullable=False)   # cast, formula, replace_null, filter, sql_rule, etc.
    params = Column(JSON, nullable=True)         # {"formula": "col_a * 2", "cast_to": "int", ...}
    version = Column(Integer, default=1)
    is_valid = Column(String, default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ETLSchedule(Base):
    """Job scheduling config for a pipeline."""
    __tablename__ = "etl_schedules"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    schedule_type = Column(String, nullable=False)  # cron, daily, hourly, interval
    cron_expression = Column(String, nullable=True) # e.g., "0 8 * * *"
    interval_minutes = Column(Integer, nullable=True)
    enabled = Column(String, default="true")
    retry_attempts = Column(Integer, default=3)
    retry_delay_sec = Column(Integer, default=60)
    retry_backoff = Column(String, default="exponential")  # fixed, exponential
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline = relationship("ETLPipeline", back_populates="schedules")


class ETLJob(Base):
    """A single job execution run for a pipeline."""
    __tablename__ = "etl_jobs"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    triggered_by = Column(String, default="manual")  # manual, schedule, api
    status = Column(String, default="pending")        # pending, running, success, failed, partial
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    total_rows_extracted = Column(Integer, default=0)
    total_rows_loaded = Column(Integer, default=0)
    total_rows_rejected = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline = relationship("ETLPipeline", back_populates="jobs")
    steps = relationship("ETLJobStep", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("ETLJobLog", back_populates="job", cascade="all, delete-orphan")


class ETLJobStep(Base):
    """Per-node step execution record within a job."""
    __tablename__ = "etl_job_steps"

    id = Column(String, primary_key=True, default=get_uuid)
    job_id = Column(String, ForeignKey("etl_jobs.id"), nullable=False)
    node_id = Column(String, ForeignKey("etl_workflow_nodes.id"), nullable=True)
    node_label = Column(String, nullable=True)
    node_type = Column(String, nullable=True)
    status = Column(String, default="pending")   # pending, running, success, failed, skipped
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    rows_in = Column(Integer, default=0)
    rows_out = Column(Integer, default=0)
    rows_rejected = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    attempt = Column(Integer, default=1)

    job = relationship("ETLJob", back_populates="steps")


class ETLJobLog(Base):
    """Line-level log entries for a job execution."""
    __tablename__ = "etl_job_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    job_id = Column(String, ForeignKey("etl_jobs.id"), nullable=False)
    step_id = Column(String, ForeignKey("etl_job_steps.id"), nullable=True)
    level = Column(String, default="INFO")   # INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("ETLJob", back_populates="logs")


class ETLDataQualityCheck(Base):
    """Pre/post load data quality validation rules."""
    __tablename__ = "etl_data_quality_checks"

    id = Column(String, primary_key=True, default=get_uuid)
    pipeline_id = Column(String, ForeignKey("etl_pipelines.id"), nullable=False)
    check_type = Column(String, nullable=False)  # pre_load, post_load
    rule_type = Column(String, nullable=False)   # not_null, type_check, range, regex, custom_sql
    column_name = Column(String, nullable=True)
    params = Column(JSON, nullable=True)          # {"min": 0, "max": 100, "pattern": "...", ...}
    on_failure = Column(String, default="reject_row")  # reject_row, stop, warn
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Audit trail for all user and system actions."""
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)       # create_pipeline, run_job, delete_connection, etc.
    resource_type = Column(String, nullable=True) # pipeline, job, connection, schedule
    resource_id = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class UserRole(Base):
    """Role-based access control: Admin, Developer, Operator, Viewer."""
    __tablename__ = "user_roles"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    role = Column(String, nullable=False, default="viewer")  # admin, developer, operator, viewer
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─────────────────────────────────────────────────────────────────────────────
# CONNECTOR CATALOG — DLT-powered connector registry (35+ sources)
# ─────────────────────────────────────────────────────────────────────────────


class ConnectorCatalog(Base):
    """Registry of all available data connectors with their JSON config schemas.

    Seeded at startup by seed_connectors() in connectors/registry.py.
    Drives the DynamicForm in the frontend for schema-driven connector config.
    """
    __tablename__ = "connector_catalog"

    id = Column(String, primary_key=True, default=get_uuid)
    name = Column(String(255), nullable=False)               # e.g. "PostgreSQL", "Shopify"
    engine = Column(String(100), unique=True, nullable=False) # e.g. "postgres", "shopify"
    connector_type = Column(
        SAEnum("source", "destination", "both", name="connector_type_enum"),
        nullable=False,
        default="both"
    )
    # JSON Schema describing config fields rendered by the frontend DynamicForm
    config_schema = Column(JSON, nullable=False, default=dict)
    icon_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    priority = Column(Integer, default=0, nullable=False)  # Higher = shown first in UI
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ConnectorCatalog(engine='{self.engine}', type='{self.connector_type}')>"


# ─────────────────────────────────────────────────────────────────────────────
# DATA VAULT MODELS
# ─────────────────────────────────────────────────────────────────────────────

class DataVaultItem(Base):
    """Central storage layer for datasets fetched from connectors or uploads."""
    __tablename__ = "data_vault_items"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Optional for now
    name = Column(String(255), nullable=False)
    source_name = Column(String(100), nullable=False) # e.g. 'mysql', 'excel', 'csv'
    dataset_type = Column(String(50), nullable=False) # 'file' or 'table'
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True)
    table_name = Column(String(255), nullable=True)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")
    file = relationship("UploadedFile")

# ─────────────────────────────────────────────────────────────────────────────
# PAGINATED REPORTS MODELS
# ─────────────────────────────────────────────────────────────────────────────

class PaginatedReport(Base):
    """Stores metadata-driven paginated report definitions (pixel-perfect layouts)."""
    __tablename__ = "paginated_reports"

    id = Column(String, primary_key=True, default=get_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # Stores the full layout structure: pages, elements (tables, charts, text), 
    # absolute positions, styles, header/footer configuration.
    layout_json = Column(JSON, nullable=False, default=dict)
    # Maps report elements to DataVault IDs and query configurations (aggregations, etc.)
    datasource_mapping = Column(JSON, nullable=False, default=dict)
    # Parameter definitions for user input (dropdowns, dates)
    parameters = Column(JSON, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")


class ReportRefreshSchedule(Base):
    """Scheduled auto-refresh configuration for reports and dashboards."""
    __tablename__ = "report_refresh_schedule"

    id = Column(String, primary_key=True, default=get_uuid)
    report_id = Column(String, nullable=False, index=True)
    resource_type = Column(String(50), nullable=False, default="paginated_report")  # paginated_report | dashboard
    enabled = Column(Boolean, nullable=False, default=False)
    refresh_type = Column(String(50), nullable=True)  # every_5_minutes, daily, custom_cron, etc.
    cron_expression = Column(Text, nullable=True)
    timezone = Column(String(100), nullable=False, default="UTC")
    start_at = Column(DateTime(timezone=True), nullable=True)
    last_refresh_at = Column(DateTime(timezone=True), nullable=True)
    next_refresh_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ReportRefreshHistory(Base):
    """Audit log for report/dashboard refresh executions."""
    __tablename__ = "report_refresh_history"

    id = Column(String, primary_key=True, default=get_uuid)
    report_id = Column(String, nullable=False, index=True)
    refresh_started_at = Column(DateTime(timezone=True), nullable=True)
    refresh_completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), nullable=True)  # running, success, failed, skipped
    records_processed = Column(Integer, nullable=True, default=0)
    error_message = Column(Text, nullable=True)


# ─────────────────────────────────────────────────────────────────────────────
# POWER AUTOMATE WORKFLOW MODELS
# ─────────────────────────────────────────────────────────────────────────────

class AutomateWorkflow(Base):
    """
    Represents a saved Power Automate-like workflow definition.
    Each workflow has a name, a trigger type, a status, and links to
    multiple actions that form its execution pipeline.
    """
    __tablename__ = "automate_workflows"

    id = Column(String, primary_key=True, default=get_uuid)
    name = Column(String(255), nullable=False)
    # The event that fires this workflow, e.g. 'button_click', 'schedule', 'data_change'
    trigger_type = Column(String(100), nullable=False, default="button_click")
    # Track execution state: 'idle', 'running', 'success', 'failed'
    status = Column(String(50), nullable=False, default="idle")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    # The URL of the dashboard page to capture as a PDF snapshot
    snapshot_url = Column(String(1000), nullable=True)
    # Filesystem path to the generated PDF (set after generate_report completes)
    export_path = Column(String(1000), nullable=True)

    # Each workflow owns many ordered actions
    actions = relationship("AutomateAction", back_populates="workflow",
                           cascade="all, delete-orphan", order_by="AutomateAction.execute_order")


class AutomateAction(Base):
    """
    Represents a single automation step within a workflow.
    Actions execute in order (execute_order) and can carry a JSON config
    holding step-specific parameters (e.g. recipient email for send_email).
    """
    __tablename__ = "automate_actions"

    id = Column(String, primary_key=True, default=get_uuid)
    workflow_id = Column(String, ForeignKey("automate_workflows.id"), nullable=False)
    # e.g. 'save_to_db', 'send_email', 'generate_report', 'webhook'
    action_type = Column(String(100), nullable=False)
    # Human-readable label shown in the UI
    label = Column(String(255), nullable=False)
    # Step position in the pipeline (1-indexed)
    execute_order = Column(Integer, nullable=False, default=1)
    # Optional JSON config, e.g. { "recipient": "user@example.com" }
    config = Column(JSON, nullable=True, default=dict)
    # Outcome of the last execution: 'pending', 'success', 'failed'
    last_status = Column(String(50), nullable=False, default="pending")

    workflow = relationship("AutomateWorkflow", back_populates="actions")


# ─────────────────────────────────────────────────────────────────────────────
# MODELING LAYER MODELS (Date Table & Change Detection)
# ─────────────────────────────────────────────────────────────────────────────

class DateTable(Base):
    """Marks a table/dataset as a valid Date Table to enable time intelligence features."""
    __tablename__ = "date_tables"

    id = Column(String, primary_key=True, default=get_uuid)
    # the ID of the dataset/file or purely a logical name for physical DB tables
    table_name = Column(String(255), nullable=False)
    date_column = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChangeDetectionConfig(Base):
    """Configures periodic background monitoring of specific columns in datasets."""
    __tablename__ = "change_detection"

    id = Column(String, primary_key=True, default=get_uuid)
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)
    last_value = Column(String, nullable=True)     # Hash or scalar value
    last_checked = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="Monitoring")  # "Monitoring", "Changed", "Error"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
# ROW-LEVEL SECURITY (RLS) MODELS
# ─────────────────────────────────────────────────────────────────────────────

class RLSRole(Base):
    """
    A named security role scoped to a specific dataset (file_id).
    Each role owns one or more RLSRule rows that define column filters.
    """
    __tablename__ = "rls_roles"

    id = Column(String, primary_key=True, default=get_uuid)
    # Link to the UploadedFile / DataVault dataset this role governs
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    # Friendly identifiers
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    permission = Column(String(50), nullable=False, default="view")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    rules = relationship("RLSRule", back_populates="role", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<RLSRole(name='{self.name}', file_id='{self.file_id}')>"


class RLSRule(Base):
    """
    One filter condition belonging to an RLSRole.

    How AND/OR logic works:
    - Rules with the same `logic_group` integer are combined with `group_operator` (AND / OR).
    - Different logic_group values are combined with AND between groups.
    - Example:
        group 0: Region = 'West' OR Region = 'East'   → group_operator='OR', logic_group=0
        group 1: Year > 2020                           → group_operator='AND', logic_group=1
      Result SQL equivalent: (Region='West' OR Region='East') AND (Year>2020)
    """
    __tablename__ = "rls_rules"

    id = Column(String, primary_key=True, default=get_uuid)
    role_id = Column(String, ForeignKey("rls_roles.id"), nullable=False, index=True)

    # Target: which table/column this filter applies to
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)

    # Operator: =, !=, >, <, >=, <=, IN, NOT IN, CONTAINS, STARTS_WITH, ENDS_WITH
    operator = Column(String(50), nullable=False, default="=")

    # Value as a string; comma-separated for IN / NOT IN
    value = Column(Text, nullable=False)

    # Logic grouping: rules in same group are joined by group_operator
    logic_group = Column(Integer, default=0)
    # How this rule connects to others in the same group: AND | OR
    group_operator = Column(String(10), default="AND")

    # Display order within the role editor
    display_order = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    role = relationship("RLSRole", back_populates="rules")

    def __repr__(self):
        return f"<RLSRule({self.table_name}.{self.column_name} {self.operator} '{self.value}')>"


# ─────────────────────────────────────────────────────────────────────────────
# NEW DATA STORAGE MODELS - PostgreSQL-Based Worksheet Architecture
# Replaces memory-based caching with persistent database storage
# ─────────────────────────────────────────────────────────────────────────────

class Worksheet(Base):
    """
    A persistent worksheet (dataset) stored in PostgreSQL.
    Replaces memory-based storage model.
    Can be created from: file upload, connector extraction, SQL query result
    """
    __tablename__ = "worksheets"

    id = Column(String, primary_key=True, default=get_uuid)
    
    # Metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Owner and access control
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_shared = Column(Boolean, default=False, index=True)
    sharing_type = Column(String(50), default="private")  # private, organization, public
    
    # Source information
    source_type = Column(String(50))  # file_upload, connector, sql_query, etl_output
    source_id = Column(String(255))   # uploaded_files.id, connector_id, etc
    
    # Data statistics
    total_rows = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    size_bytes = Column(Integer, default=0)
    
    # Status
    status = Column(String(50), default="pending")  # pending, processing, ready, failed
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    owner = relationship("User")
    columns = relationship("WorksheetColumn", back_populates="worksheet", cascade="all, delete-orphan")
    permissions = relationship("WorksheetPermission", back_populates="worksheet", cascade="all, delete-orphan")
    import_queue = relationship("DataImportQueue", back_populates="worksheet", uselist=False, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Worksheet(id='{self.id}', name='{self.name}', rows={self.total_rows})>"


class WorksheetColumn(Base):
    """
    Schema definition for a column in a worksheet.
    Stores column metadata and statistics.
    """
    __tablename__ = "worksheet_columns"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Column metadata
    column_name = Column(String(255), nullable=False)
    display_name = Column(String(255))
    data_type = Column(String(50))  # integer, string, float, date, boolean, json, etc
    
    # Statistics
    null_count = Column(Integer, default=0)
    unique_count = Column(Integer, default=0)
    min_value = Column(Text, nullable=True)  # Stored as string for flexibility
    max_value = Column(Text, nullable=True)
    
    # Optimization
    column_order = Column(Integer)
    is_indexed = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    worksheet = relationship("Worksheet", back_populates="columns")
    
    __table_args__ = (
        Index('idx_ws_col', 'worksheet_id', 'column_name'),
    )
    
    def __repr__(self):
        return f"<WorksheetColumn(worksheet={self.worksheet_id}, name='{self.column_name}')>"


class WorksheetData(Base):
    """
    Actual data rows for a worksheet.
    Uses flexible schema: JSON storage for all column values.
    Supports 10M+ rows efficiently through partitioning.
    """
    __tablename__ = "worksheet_data"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)  # For ordering without relying on ID
    
    # Flexible data storage - JSON format: { col_name: value, ... }
    data_json = Column(JSON)  # Main data storage
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_ws_data_ws', 'worksheet_id'),
        Index('idx_ws_data_row', 'worksheet_id', 'row_number'),
    )
    
    def __repr__(self):
        return f"<WorksheetData(worksheet={self.worksheet_id}, row={self.row_number})>"


class WorksheetPermission(Base):
    """
    Access control for worksheets.
    Defines who can access which worksheet and what they can do.
    """
    __tablename__ = "worksheet_permissions"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Who has access
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = org-wide
    
    # What they can do
    permission_level = Column(String(50), default="view")  # view, edit, admin
    can_export = Column(Boolean, default=True)
    can_share = Column(Boolean, default=False)
    
    # Audit
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    worksheet = relationship("Worksheet", back_populates="permissions")
    
    __table_args__ = (
        Index('idx_perm_user', 'user_id'),
        Index('idx_perm_ws', 'worksheet_id'),
    )
    
    def __repr__(self):
        return f"<WorksheetPermission(ws={self.worksheet_id}, user={self.user_id}, level={self.permission_level})>"


class DataImportQueue(Base):
    """
    Tracks progress of large data imports.
    One entry per worksheet during import process.
    """
    __tablename__ = "data_import_queue"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, unique=True, index=True)
    
    # Progress tracking
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    progress_percent = Column(Integer, default=0)
    rows_processed = Column(Integer, default=0)
    rows_failed = Column(Integer, default=0)
    
    # Error tracking
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    worksheet = relationship("Worksheet", back_populates="import_queue")
    
    def __repr__(self):
        return f"<DataImportQueue(ws={self.worksheet_id}, status={self.status}, progress={self.progress_percent}%)>"


class WorksheetTransformation(Base):
    """
    Stores transformation operations applied to a worksheet.
    For staging data before applying transformations permanently.
    """
    __tablename__ = "worksheet_transformations"

    id = Column(String, primary_key=True, default=get_uuid)
    worksheet_id = Column(String, ForeignKey("worksheets.id"), nullable=False, index=True)
    
    # Transformation details
    transformation_type = Column(String(50))  # filter, group_by, aggregate, join, etc
    transformation_config = Column(JSON)  # Configuration for this transformation
    
    # Results
    result_row_count = Column(Integer)
    is_applied = Column(Boolean, default=False)
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    def __repr__(self):
        return f"<WorksheetTransformation(ws={self.worksheet_id}, type={self.transformation_type})>"


# ─────────────────────────────────────────────────────────────────────────────
# QUICK MEASURE MODEL — Power BI–style guided calculation storage
# ─────────────────────────────────────────────────────────────────────────────

class QuickMeasure(Base):
    """
    Persists a user-defined Quick Measure created via the Quick Measure panel.
    Each measure has a name, category, template id, field mappings, and a
    generated formula expression that can be applied to any visual.
    """
    __tablename__ = "quick_measures"

    id = Column(String, primary_key=True, default=get_uuid)

    # Owner / workspace scope
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Measure identity
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Template information
    category = Column(String(100), nullable=False)           # e.g. "aggregations", "time_intelligence"
    template_id = Column(String(100), nullable=False)        # e.g. "sum", "ytd", "yoy_change"
    template_label = Column(String(255), nullable=True)      # Human-readable label

    # Field mappings — stores {param_key: column_name} JSON
    field_mappings = Column(JSON, nullable=False, default=dict)

    # Generated formula (the Python/pandas-compatible expression)
    formula = Column(Text, nullable=False)

    # Display / execution metadata
    aggregation = Column(String(50), nullable=True)          # sum, avg, count, etc.
    format_type = Column(String(50), default="General")      # General, Currency, Percentage, etc.
    is_valid = Column(Boolean, default=True)
    validation_errors = Column(JSON, nullable=True)

    # Execution cache (optional pre-computed result for KPI cards)
    cached_result = Column(Float, nullable=True)
    cached_at = Column(DateTime(timezone=True), nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<QuickMeasure(name='{self.name}', template='{self.template_id}', file='{self.file_id}')>"


# ─────────────────────────────────────────────────────────────────────────────
# REST API DATASOURCE MODELS
# ─────────────────────────────────────────────────────────────────────────────

class ApiConnection(Base):
    __tablename__ = "api_connections"

    id = Column(String, primary_key=True, default=get_uuid)
    name = Column(String(255), nullable=False)
    base_url = Column(Text, nullable=False)
    endpoint = Column(Text, nullable=False, default="")
    http_method = Column(String(20), default="GET")
    headers = Column(JSON, nullable=True)
    query_params = Column(JSON, nullable=True)
    request_body = Column(JSON, nullable=True)
    auth_type = Column(String(50), nullable=True)
    auth_config = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_refresh_at = Column(DateTime(timezone=True), nullable=True)
    refresh_interval = Column(String(50), nullable=True)
    connection_status = Column(String(50), nullable=True)
    schema_config = Column(JSON, nullable=True)

    __table_args__ = (
        Index("idx_api_connections_created_by", "created_by"),
        Index("idx_api_connections_status", "connection_status"),
    )


class ApiDataset(Base):
    __tablename__ = "api_datasets"

    id = Column(String, primary_key=True, default=get_uuid)
    connection_id = Column(String, ForeignKey("api_connections.id"), nullable=False, index=True)
    dataset_name = Column(String(255), nullable=True)
    raw_response = Column(JSON, nullable=True)
    flattened_sample = Column(JSON, nullable=True)
    row_count = Column(Integer, default=0)
    schema_detected = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ApiDatasetField(Base):
    __tablename__ = "api_dataset_fields"

    id = Column(String, primary_key=True, default=get_uuid)
    dataset_id = Column(String, ForeignKey("api_datasets.id"), nullable=False, index=True)
    field_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    data_type = Column(String(50), nullable=True)
    field_category = Column(String(50), nullable=True)
    is_dimension = Column(Boolean, default=False)
    is_measure = Column(Boolean, default=False)
    is_date_field = Column(Boolean, default=False)
    sample_value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ApiRefreshLog(Base):
    __tablename__ = "api_refresh_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    connection_id = Column(String, ForeignKey("api_connections.id"), nullable=False, index=True)
    refresh_status = Column(String(50), nullable=True)
    rows_fetched = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ApiCache(Base):
    __tablename__ = "api_cache"

    id = Column(String, primary_key=True, default=get_uuid)
    connection_id = Column(String, ForeignKey("api_connections.id"), nullable=False, index=True)
    cached_response = Column(JSON, nullable=True)
    cache_created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)


class ApiConnectorData(Base):
    """One normalized entity per row (coin, order, customer, etc.) for BI charts."""
    __tablename__ = "api_connector_data"

    id = Column(String, primary_key=True, default=get_uuid)
    connection_id = Column(String, ForeignKey("api_connections.id"), nullable=False, index=True)
    entity_id = Column(String(255), nullable=False, index=True)
    primary_key = Column(String(512), nullable=True, index=True)
    instrument = Column(String(255), nullable=True)
    price = Column(Float, nullable=True)
    data = Column(JSON, nullable=False, default=dict)
    checksum = Column(String(64), nullable=True, index=True)
    delta_type = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_api_connector_data_conn_entity", "connection_id", "entity_id", unique=True),
    )


class SemanticMeasure(Base):
    """Stores reusable calculated measures at the semantic model level."""
    __tablename__ = "semantic_measures"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False)           # e.g., Financial, Sales, Marketing, Operations, HR, Custom
    expression = Column(Text, nullable=False)
    format = Column(String(100), nullable=True)              # e.g., Currency, Percentage, Whole Number, Decimal Number, Custom Format
    dependencies = Column(JSON, nullable=True)               # stores {"fields": [], "measures": []}

    # Governance & Metadata Extensions
    uuid = Column(String(50), nullable=True)
    version = Column(Integer, default=1)
    status = Column(String(50), default="Active")            # Active, Archived, Deprecated
    created_by = Column(String(100), nullable=True)
    modified_by = Column(String(100), nullable=True)

    business_definition = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)                       # list of tags e.g. ["KPI", "Executive"]

    referenced_measures = Column(JSON, nullable=True)         # list of measure names used by this
    referenced_columns = Column(JSON, nullable=True)          # list of schema columns used by this

    currency = Column(String(10), nullable=True)             # currency symbol (e.g. ₹, $)
    decimal_places = Column(Integer, default=2)
    color_rules = Column(JSON, nullable=True)                 # conditional formatting Rules
    display_units = Column(String(20), default="None")       # None, Thousands, Millions, Billions

    owner = Column(String(100), nullable=True)
    steward = Column(String(100), nullable=True)
    certification_status = Column(String(50), default="Uncertified")  # Uncertified, Under Review, Certified
    approval_status = Column(String(50), default="Draft")             # Draft, Under Review, Approved, Rejected

    usage_count = Column(Integer, default=0)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    dashboards_using = Column(JSON, nullable=True)            # dashboards referencing this
    reports_using = Column(JSON, nullable=True)               # reports referencing this
    visuals_using = Column(JSON, nullable=True)               # visuals referencing this

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    def __repr__(self):
        return f"<SemanticMeasure(name='{self.name}', file='{self.file_id}')>"


class SemanticMeasureVersion(Base):
    """Stores historical versions of calculations for the governance system."""
    __tablename__ = "semantic_measure_versions"

    id = Column(String, primary_key=True, default=get_uuid)
    measure_id = Column(String, ForeignKey("semantic_measures.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    expression = Column(Text, nullable=False)
    display_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    format = Column(String(100), nullable=True)
    modified_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<SemanticMeasureVersion(measure='{self.measure_id}', version={self.version})>"


# ─────────────────────────────────────────────────────────────────────────────
# POWER BI DATA MANAGEMENT MODELS
# ─────────────────────────────────────────────────────────────────────────────

class BIDatasource(Base):
    """Unified datasource registry for the reporting platform."""
    __tablename__ = "bi_datasources"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False)  # postgresql, mysql, sqlserver, oracle, snowflake, mongodb, rest_api, csv, excel, google_sheets
    connection_config = Column(JSON, nullable=False, default=dict)
    encrypted_credentials = Column(Text, nullable=True)
    ssl_enabled = Column(Boolean, default=True)
    health_status = Column(String(50), default="unknown")  # connected, disconnected, auth_failed, timeout, permission_error
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    datasets = relationship("BIDataset", back_populates="datasource", cascade="all, delete-orphan")


class BIDataset(Base):
    """Logical dataset within a report workspace."""
    __tablename__ = "bi_datasets"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    datasource_id = Column(String, ForeignKey("bi_datasources.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    source_table = Column(String(255), nullable=True)
    source_query = Column(Text, nullable=True)
    schema_snapshot = Column(JSON, nullable=True, default=list)
    row_count = Column(Integer, default=0)
    incremental_column = Column(String(255), nullable=True)
    last_incremental_value = Column(String(512), nullable=True)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    datasource = relationship("BIDatasource", back_populates="datasets")
    transformations = relationship("BIDatasetTransformation", back_populates="dataset", cascade="all, delete-orphan")
    refresh_schedules = relationship("BIDatasetRefreshSchedule", back_populates="dataset", cascade="all, delete-orphan")


class BIDatasetTransformation(Base):
    """Transformation pipeline stored as JSONB steps (Power Query style)."""
    __tablename__ = "bi_dataset_transformations"

    id = Column(String, primary_key=True, default=get_uuid)
    dataset_id = Column(String, ForeignKey("bi_datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, default="Query")
    steps = Column(JSON, nullable=False, default=list)
    applied_steps_index = Column(Integer, default=-1)
    undo_stack = Column(JSON, nullable=True, default=list)
    redo_stack = Column(JSON, nullable=True, default=list)
    version = Column(Integer, default=1)
    is_published = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    dataset = relationship("BIDataset", back_populates="transformations")
    versions = relationship("BIDatasetTransformationVersion", back_populates="transformation", cascade="all, delete-orphan")


class BIDatasetTransformationVersion(Base):
    """Version history for transformation pipelines."""
    __tablename__ = "bi_dataset_transformation_versions"

    id = Column(String, primary_key=True, default=get_uuid)
    transformation_id = Column(String, ForeignKey("bi_dataset_transformations.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    steps = Column(JSON, nullable=False, default=list)
    change_summary = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transformation = relationship("BIDatasetTransformation", back_populates="versions")


class BIDatasetRefreshSchedule(Base):
    """Scheduled refresh for individual datasets."""
    __tablename__ = "bi_dataset_refresh_schedules"

    id = Column(String, primary_key=True, default=get_uuid)
    dataset_id = Column(String, ForeignKey("bi_datasets.id"), nullable=False, index=True)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    enabled = Column(Boolean, default=False)
    refresh_type = Column(String(50), default="every_30_minutes")
    cron_expression = Column(Text, nullable=True)
    timezone = Column(String(100), default="UTC")
    incremental_enabled = Column(Boolean, default=False)
    last_refresh_at = Column(DateTime(timezone=True), nullable=True)
    next_refresh_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    dataset = relationship("BIDataset", back_populates="refresh_schedules")


class BIDatasetRefreshLog(Base):
    """Refresh execution logs for datasets."""
    __tablename__ = "bi_dataset_refresh_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    dataset_id = Column(String, ForeignKey("bi_datasets.id"), nullable=True, index=True)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    status = Column(String(50), default="running")  # running, success, failed, skipped
    refresh_type = Column(String(50), nullable=True)  # manual, scheduled, incremental
    records_fetched = Column(Integer, default=0)
    records_processed = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    details = Column(JSON, nullable=True, default=dict)


class BIReportParameter(Base):
    """Dynamic report parameters (Power BI style)."""
    __tablename__ = "bi_report_parameters"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    param_type = Column(String(50), nullable=False)  # text, number, date, datetime, boolean, dropdown, multi_select
    default_value = Column(JSON, nullable=True)
    current_value = Column(JSON, nullable=True)
    options = Column(JSON, nullable=True, default=list)
    validation_rules = Column(JSON, nullable=True, default=dict)
    is_required = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class BIReportVariable(Base):
    """Report-level and system-level variables."""
    __tablename__ = "bi_report_variables"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    variable_type = Column(String(50), nullable=False)  # user, system, custom
    scope = Column(String(50), default="report")  # report, system, tenant
    expression = Column(Text, nullable=True)
    current_value = Column(JSON, nullable=True)
    is_system = Column(Boolean, default=False)
    is_editable = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class QueryMaster(Base):
    """Power Query master — one logical query per report dataset."""
    __tablename__ = "query_master"

    id = Column(String, primary_key=True, default=get_uuid)
    report_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    query_name = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False, default="csv")  # csv, excel, sql, api, database
    source_config = Column(JSON, nullable=True, default=dict)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    steps = relationship("QueryStep", back_populates="query", cascade="all, delete-orphan", order_by="QueryStep.step_order")


class QueryStep(Base):
    """Sequential transformation step for a query."""
    __tablename__ = "query_steps"

    id = Column(String, primary_key=True, default=get_uuid)
    query_id = Column(String, ForeignKey("query_master.id"), nullable=False, index=True)
    step_order = Column(Integer, nullable=False, default=0)
    operation_type = Column(String(50), nullable=False)
    operation_config = Column(JSON, nullable=False, default=dict)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    query = relationship("QueryMaster", back_populates="steps")


class BIDataAuditLog(Base):
    """Audit trail for data management actions."""
    __tablename__ = "bi_data_audit_logs"

    id = Column(String, primary_key=True, default=get_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String, nullable=True)
    details = Column(JSON, nullable=True, default=dict)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CalculatedTable(Base):
    """User-defined calculated table (DAX-like formula, query builder, or manual)."""
    __tablename__ = "calculated_tables"

    id = Column(String, primary_key=True, default=get_uuid)
    report_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    table_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    method = Column(String(50), nullable=False, default="formula")
    expression = Column(Text, nullable=True)
    builder_config = Column(JSON, nullable=True, default=dict)
    manual_data = Column(JSON, nullable=True, default=dict)
    source_tables = Column(JSON, nullable=True, default=list)
    model_table_id = Column(String, nullable=True, index=True)
    row_count = Column(Integer, default=0)
    is_valid = Column(Boolean, default=True)
    validation_errors = Column(JSON, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    columns = relationship("CalculatedTableColumn", back_populates="calculated_table", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_calc_tables_report", "report_id"),
    )


class CalculatedTableColumn(Base):
    """Column metadata for a calculated table."""
    __tablename__ = "calculated_table_columns"

    id = Column(String, primary_key=True, default=get_uuid)
    calculated_table_id = Column(String, ForeignKey("calculated_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    column_name = Column(String(255), nullable=False)
    data_type = Column(String(50), default="text")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    calculated_table = relationship("CalculatedTable", back_populates="columns")

