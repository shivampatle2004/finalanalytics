"""
ArithFlow — MySQL Connector.

Read / write to MySQL databases using aiomysql.
"""

from __future__ import annotations

import urllib.parse
from typing import Any

import polars as pl

from connectors.base import BaseConnector, LoadResult
from connectors.exceptions import ConnectorConnectionError
from utils.logger import get_logger

logger = get_logger("connectors.mysql")


class MySQLConnector(BaseConnector):

    def _mysql_connect_kwargs(self) -> dict[str, Any]:
        ssl_mode = self.config.get("ssl_mode", "disable")
        kwargs: dict[str, Any] = {
            "host": self.config.get("host", "localhost"),
            "port": int(self.config.get("port", 3306)),
            "db": self.config.get("database", ""),
            "user": self.config.get("username") or self.config.get("user", ""),
            "password": self.config.get("password", ""),
        }
        if ssl_mode and ssl_mode != "disable":
            kwargs["ssl"] = True
        return kwargs

    async def test_connection(self) -> bool:
        import aiomysql

        try:
            async with aiomysql.connect(**self._mysql_connect_kwargs()) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
            return True
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            raise ConnectorConnectionError(
                f"MySQL connection failed: {e}. "
                "Verify host, port, database, username, password, and SSL mode."
            ) from e

    async def extract(self):
        host = self.config.get("host", "localhost")
        port = self.config.get("port", 3306)
        database = self.config.get("database", "")
        username = urllib.parse.quote_plus(
            self.config.get("username") or self.config.get("user", "")
        )
        password = urllib.parse.quote_plus(self.config.get("password", ""))
        table = self.config.get("table")
        query = self.config.get("query")
        chunk_size = self.config.get("chunk_size", 5000)
        conn_str = f"mysql://{username}:{password}@{host}:{port}/{database}"
        ssl_mode = self.config.get("ssl_mode", "disable")
        if ssl_mode and ssl_mode != "disable":
            conn_str += f"?ssl_mode={ssl_mode}"

        if query:
            sql = query
        elif table:
            columns = self.config.get("columns", "*")
            if isinstance(columns, list):
                columns = ", ".join(columns)
            where = self.config.get("where", "")
            sql = f"SELECT {columns} FROM {table}"
            if where:
                sql += f" WHERE {where}"
        else:
            raise ValueError("MySQL connector requires 'table' or 'query' in config")

        logger.info(f"Extracting from MySQL: {sql[:100]}...")
        
        import asyncio
        def _read():
            return pl.read_database_uri(sql, conn_str)

        loop = asyncio.get_running_loop()
        df = await loop.run_in_executor(None, _read)
        
        for i in range(0, len(df), chunk_size):
            yield df.slice(i, chunk_size).to_dicts()

    async def load(self, data: pl.DataFrame) -> LoadResult:
        table = self.config.get("table")
        if not table:
            raise ValueError("MySQL load requires 'table' in config")

        try:
            import aiomysql
            async with aiomysql.connect(**self._mysql_connect_kwargs()) as conn:
                columns = data.columns
                col_names = ", ".join(columns)
                placeholders = ", ".join(["%s"] * len(columns))
                insert_sql = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"

                async with conn.cursor() as cur:
                    rows = data.rows()
                    await cur.executemany(insert_sql, rows)
                    await conn.commit()

            logger.info(f"Loaded {len(data)} rows into MySQL table: {table}")
            return LoadResult(success=True, rows_loaded=len(data), message=f"Loaded into {table}")
        except Exception as e:
            logger.error(f"MySQL load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=str(e))

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "host": {"type": "string", "title": "Host", "description": "Hostname or IP (e.g. db.example.com or 192.168.1.50)"},
                "port": {"type": "integer", "title": "Port", "default": 3306},
                "database": {"type": "string", "title": "Database Name"},
                "username": {"type": "string", "title": "Username"},
                "password": {"type": "string", "title": "Password", "format": "password", "secret": True},
                "ssl_mode": {
                    "type": "string", 
                    "title": "SSL Mode", 
                    "enum": ["disable", "require", "verify-full"], 
                    "default": "disable"
                },
                "table": {"type": "string"},
                "query": {"type": "string"},
                "columns": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "array", "items": {"type": "string"}},
                    ],
                    "default": "*",
                },
                "where": {"type": "string"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., mysql_data.parquet).",
                },
            },
            "required": ["host", "database", "username", "password", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "MySQL"
