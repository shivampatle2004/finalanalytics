"""
Datasource connection management, health checks, and metadata preview.
"""

import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

import models
from services.credentials_crypto import decrypt_secret, encrypt_secret

SUPPORTED_SOURCE_TYPES = {
    "postgresql", "mysql", "sqlserver", "oracle", "snowflake",
    "mongodb", "rest_api", "csv", "excel", "google_sheets",
}

HEALTH_STATUSES = {"connected", "disconnected", "auth_failed", "timeout", "permission_error", "unknown"}


def _build_connection_string(source_type: str, config: Dict, password: str = "") -> Optional[str]:
    host = config.get("host", "localhost")
    port = config.get("port")
    database = config.get("database", "")
    user = config.get("username") or config.get("user", "")
    ssl = config.get("ssl_enabled", True)

    if source_type == "postgresql":
        port = port or 5432
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"
    if source_type == "mysql":
        port = port or 3306
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    if source_type == "sqlserver":
        port = port or 1433
        driver = config.get("driver", "ODBC Driver 17 for SQL Server")
        return f"mssql+pyodbc://{user}:{password}@{host}:{port}/{database}?driver={driver.replace(' ', '+')}"
    if source_type == "oracle":
        port = port or 1521
        service = config.get("service_name") or database
        return f"oracle+cx_oracle://{user}:{password}@{host}:{port}/?service_name={service}"
    if source_type == "snowflake":
        account = config.get("account", host)
        warehouse = config.get("warehouse", "")
        schema = config.get("schema", "PUBLIC")
        return f"snowflake://{user}:{password}@{account}/{database}/{schema}?warehouse={warehouse}"
    return None


def test_connection(source_type: str, config: Dict, password: str = "") -> Tuple[bool, str, List[Dict]]:
    """Test datasource connection and return (success, message, tables)."""
    if source_type in ("csv", "excel"):
        return True, "File-based source — no connection test required", []
    if source_type == "rest_api":
        url = config.get("base_url") or config.get("url", "")
        if not url:
            return False, "REST API base URL is required", []
        try:
            import urllib.request
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status < 400, f"HTTP {resp.status}", []
        except Exception as e:
            return False, str(e), []

    if source_type == "mongodb":
        try:
            from pymongo import MongoClient
            host = config.get("host", "localhost")
            port = config.get("port", 27017)
            client = MongoClient(host=host, port=port, username=config.get("username"),
                                 password=password, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            dbs = client.list_database_names()
            tables = [{"name": db, "type": "database"} for db in dbs[:50]]
            return True, "MongoDB connection successful", tables
        except Exception as e:
            err = str(e).lower()
            if "auth" in err:
                return False, str(e), []
            if "timeout" in err:
                return False, str(e), []
            return False, str(e), []

    conn_str = _build_connection_string(source_type, config, password)
    if not conn_str:
        return False, f"Unsupported source type: {source_type}", []

    try:
        from sqlalchemy import create_engine, inspect, text
        engine = create_engine(conn_str, connect_args={"connect_timeout": 10})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        insp = inspect(engine)
        schema = config.get("schema")
        if schema and hasattr(insp, "get_table_names"):
            table_names = insp.get_table_names(schema=schema)
        else:
            table_names = insp.get_table_names()
        tables = [{"name": t, "type": "table"} for t in table_names[:100]]
        views = []
        try:
            views = [{"name": v, "type": "view"} for v in insp.get_view_names()[:50]]
        except Exception:
            pass
        return True, "Connection successful", tables + views
    except Exception as e:
        err = str(e).lower()
        if "password" in err or "authentication" in err or "login" in err:
            return False, str(e), []
        if "timeout" in err or "timed out" in err:
            return False, str(e), []
        if "permission" in err or "denied" in err:
            return False, str(e), []
        return False, str(e), []


def classify_health_error(message: str) -> str:
    err = (message or "").lower()
    if "auth" in err or "password" in err or "login" in err:
        return "auth_failed"
    if "timeout" in err or "timed out" in err:
        return "timeout"
    if "permission" in err or "denied" in err or "access" in err:
        return "permission_error"
    return "disconnected"


def get_column_metadata(source_type: str, config: Dict, password: str, table_name: str) -> List[Dict]:
    if source_type not in ("postgresql", "mysql", "sqlserver", "oracle", "snowflake"):
        return []
    conn_str = _build_connection_string(source_type, config, password)
    if not conn_str:
        return []
    try:
        from sqlalchemy import create_engine, inspect
        engine = create_engine(conn_str, connect_args={"connect_timeout": 10})
        insp = inspect(engine)
        schema = config.get("schema")
        cols = insp.get_columns(table_name, schema=schema) if schema else insp.get_columns(table_name)
        return [{"name": c["name"], "type": str(c["type"]), "nullable": c.get("nullable", True)} for c in cols]
    except Exception:
        return []


def serialize_datasource(ds: models.BIDatasource, include_config: bool = False) -> Dict[str, Any]:
    result = {
        "id": ds.id,
        "file_id": ds.file_id,
        "name": ds.name,
        "source_type": ds.source_type,
        "ssl_enabled": ds.ssl_enabled,
        "health_status": ds.health_status,
        "last_health_check": ds.last_health_check.isoformat() if ds.last_health_check else None,
        "last_error": ds.last_error,
        "is_active": ds.is_active,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
        "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
    }
    if include_config:
        result["connection_config"] = ds.connection_config or {}
    return result


def decrypt_credentials(ds: models.BIDatasource) -> str:
    if not ds.encrypted_credentials:
        return ""
    try:
        return decrypt_secret(ds.encrypted_credentials)
    except Exception:
        return ""


def update_health_status(db: Session, ds: models.BIDatasource) -> str:
    password = decrypt_credentials(ds)
    ok, msg, _ = test_connection(ds.source_type, ds.connection_config or {}, password)
    ds.health_status = "connected" if ok else classify_health_error(msg)
    ds.last_health_check = datetime.now(timezone.utc)
    ds.last_error = None if ok else msg
    db.commit()
    return ds.health_status
