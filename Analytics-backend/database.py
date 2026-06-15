import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Database configuration from environment variables
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Sarvesh10")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "onestopanalytics")

# Construct the URL if individual components are provided
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# We'll use SQLite as a fallback if the connection fails or if requested
try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 2})
    engine.connect()
    _HAS_PSYCOPG2 = True
    print("SUCCESS: Connected to PostgreSQL.")
except Exception as e:
    print(f"WARNING: PostgreSQL connection failed ({e}). Falling back to SQLite for local development.")
    DATABASE_URL = "sqlite:///./analytics.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    _HAS_PSYCOPG2 = False

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Async engine and session for async operations (like seed_connectors)
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("sqlite://", "sqlite+aiosqlite://")
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


def create_database_if_not_exists():
    if not _HAS_PSYCOPG2:
        return
    try:
        conn = psycopg2.connect(
            user=DB_USER, password=DB_PASSWORD,
            host=DB_HOST, port=DB_PORT, database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{DB_NAME}'")
        exists = cur.fetchone()
        if not exists:
            cur.execute(f"CREATE DATABASE {DB_NAME}")
            print(f"Database '{DB_NAME}' created successfully!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not create database automatically. Error: {e}")


def _ensure_remote_connection_profile_columns():
    """Add is_favorite / last_used_at if table existed before new columns."""
    try:
        insp = inspect(engine)
        if "remote_connection_profiles" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("remote_connection_profiles")}
        dialect = engine.dialect.name
        with engine.begin() as conn:
            if "is_favorite" not in cols:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN is_favorite BOOLEAN DEFAULT 0"))
                else:
                    conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE"))
            if "last_used_at" not in cols:
                conn.execute(text("ALTER TABLE remote_connection_profiles ADD COLUMN last_used_at TIMESTAMP"))
        print("remote_connection_profiles columns verified.")
    except Exception as ex:
        print(f"Note: could not migrate remote_connection_profiles columns: {ex}")


def _ensure_quick_measures_table():
    """Create quick_measures table if it doesn't exist (safety net for existing DBs)."""
    try:
        insp = inspect(engine)
        if "quick_measures" not in insp.get_table_names():
            from models import QuickMeasure
            QuickMeasure.__table__.create(bind=engine, checkfirst=True)
            print("quick_measures table created successfully.")
        else:
            print("quick_measures table already exists.")
    except Exception as ex:
        print(f"Note: could not ensure quick_measures table: {ex}")


def _ensure_data_management_tables():
    """Create Power BI data management tables if missing."""
    try:
        insp = inspect(engine)
        if "bi_datasources" not in insp.get_table_names():
            from models import (
                BIDatasource, BIDataset, BIDatasetTransformation, BIDatasetTransformationVersion,
                BIDatasetRefreshSchedule, BIDatasetRefreshLog, BIReportParameter,
                BIReportVariable, BIDataAuditLog, QueryMaster, QueryStep,
            )
            for model in (
                BIDatasource, BIDataset, BIDatasetTransformation, BIDatasetTransformationVersion,
                BIDatasetRefreshSchedule, BIDatasetRefreshLog, BIReportParameter,
                BIReportVariable, BIDataAuditLog, QueryMaster, QueryStep,
            ):
                model.__table__.create(bind=engine, checkfirst=True)
            print("Data management tables created successfully.")
        else:
            print("Data management tables already exist.")
    except Exception as ex:
        print(f"Note: could not ensure data management tables: {ex}")


def _ensure_calculated_tables():
    """Create calculated_tables tables if missing."""
    try:
        insp = inspect(engine)
        if "calculated_tables" not in insp.get_table_names():
            from models import CalculatedTable, CalculatedTableColumn
            CalculatedTable.__table__.create(bind=engine, checkfirst=True)
            CalculatedTableColumn.__table__.create(bind=engine, checkfirst=True)
            print("calculated_tables tables created successfully.")
    except Exception as ex:
        print(f"Note: could not ensure calculated_tables: {ex}")


def _ensure_semantic_measures_columns():
    """Ensure all semantic_measures columns exist for the governance & metadata system."""
    try:
        insp = inspect(engine)
        if "semantic_measures" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("semantic_measures")}
        dialect = engine.dialect.name
        
        new_cols = {
            "uuid": ("VARCHAR(50)", "NULL"),
            "version": ("INTEGER", "DEFAULT 1"),
            "status": ("VARCHAR(50)", "DEFAULT 'Active'"),
            "created_by": ("VARCHAR(100)", "NULL"),
            "modified_by": ("VARCHAR(100)", "NULL"),
            "business_definition": ("TEXT", "NULL"),
            "tags": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "referenced_measures": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "referenced_columns": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "currency": ("VARCHAR(10)", "NULL"),
            "decimal_places": ("INTEGER", "DEFAULT 2"),
            "color_rules": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "display_units": ("VARCHAR(20)", "DEFAULT 'None'"),
            "owner": ("VARCHAR(100)", "NULL"),
            "steward": ("VARCHAR(100)", "NULL"),
            "certification_status": ("VARCHAR(50)", "DEFAULT 'Uncertified'"),
            "approval_status": ("VARCHAR(50)", "DEFAULT 'Draft'"),
            "usage_count": ("INTEGER", "DEFAULT 0"),
            "last_used_at": ("TIMESTAMP", "NULL"),
            "dashboards_using": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "reports_using": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
            "visuals_using": ("JSON" if dialect != "sqlite" else "TEXT", "NULL"),
        }
        
        with engine.begin() as conn:
            for col_name, (col_type, col_default) in new_cols.items():
                if col_name not in cols:
                    query = f"ALTER TABLE semantic_measures ADD COLUMN {col_name} {col_type} {col_default}"
                    conn.execute(text(query))
                    print(f"semantic_measures column added: {col_name}")
        print("semantic_measures columns verified.")
    except Exception as ex:
        print(f"Note: could not migrate semantic_measures columns: {ex}")


def _ensure_api_schema_tables():
    """Add schema_config column and api_connector_data table for REST API normalization."""
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        dialect = engine.dialect.name

        if "api_connections" in tables:
            cols = {c["name"] for c in insp.get_columns("api_connections")}
            if "schema_config" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE api_connections ADD COLUMN schema_config JSON"))
                print("api_connections.schema_config column added.")

        if "api_connector_data" not in tables:
            from models import ApiConnectorData
            ApiConnectorData.__table__.create(bind=engine, checkfirst=True)
            print("api_connector_data table created successfully.")
        else:
            print("api_connector_data table already exists.")
    except Exception as ex:
        print(f"Note: could not migrate API schema tables: {ex}")


def _ensure_semantic_measure_versions_table():
    """Create semantic_measure_versions table if it doesn't exist (safety net for existing DBs)."""
    try:
        insp = inspect(engine)
        if "semantic_measure_versions" not in insp.get_table_names():
            from models import SemanticMeasureVersion
            SemanticMeasureVersion.__table__.create(bind=engine, checkfirst=True)
            print("semantic_measure_versions table created successfully.")
        else:
            print("semantic_measure_versions table already exists.")
    except Exception as ex:
        print(f"Note: could not ensure semantic_measure_versions table: {ex}")


def init_db():
    if _HAS_PSYCOPG2:
        create_database_if_not_exists()

    from models import (User, UploadedFile, FileColumn, ColumnStatistic, GraphDefinition,
                        UserDatabaseConnection, RemoteConnectionProfile, ETLConnection, ETLPipeline, ETLPipelineVersion,
                        ETLWorkflowNode, ETLWorkflowEdge, ETLTransformRule, ETLSchedule,
                        ETLJob, ETLJobStep, ETLJobLog, ETLDataQualityCheck, AuditLog, UserRole, ConnectorCatalog,
                        PaginatedReport, AutomateWorkflow, AutomateAction, DateTable, ChangeDetectionConfig, RLSRole, RLSRule,
                        SemanticMeasure, SemanticMeasureVersion)

    try:
        from map_model import MapData, GeocodingCache
        Base.metadata.create_all(bind=engine)
        print("Database tables verified/created successfully!")
        _ensure_remote_connection_profile_columns()
        _ensure_quick_measures_table()
        _ensure_api_schema_tables()
        _ensure_data_management_tables()
        _ensure_calculated_tables()
        _ensure_semantic_measures_columns()
        _ensure_semantic_measure_versions_table()
        try:
            import asyncio
            from connectors.registry import seed_connectors
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            if loop.is_running():
                asyncio.create_task(seed_connectors())
                print("Connector registry synchronization scheduled.")
            else:
                result = loop.run_until_complete(seed_connectors())
                if result is not None:
                    print("Connector registry synchronized with database.")
        except Exception as se:
            print(f"WARNING: Connector seed failed (non-fatal): {se}")
    except Exception as e:
        print(f"Error creating tables: {e}")


if __name__ == "__main__":
    init_db()


def get_db():
    from sqlalchemy.orm import Session
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
