"""
ArithFlow — MongoDB Connector.

Extract/load data from MongoDB collections.
Uses motor (async MongoDB driver) for O(1) streaming extraction.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator

import polars as pl

from connectors.base import BaseConnector, LoadResult
from connectors.exceptions import ConnectorConnectionError
from utils.logger import get_logger

logger = get_logger("connectors.mongodb")


class MongoDBConnector(BaseConnector):

    def _connection_uri(self) -> str:
        # Prefer connection_string / connection_url if either is present and non-empty (ignoring whitespace)
        conn_str = self.config.get("connection_string")
        if isinstance(conn_str, str) and conn_str.strip():
            return conn_str.strip()
            
        conn_url = self.config.get("connection_url")
        if isinstance(conn_url, str) and conn_url.strip():
            return conn_url.strip()
            
        # If the keys exist but are empty/whitespace, do not silently fallback to localhost
        if "connection_string" in self.config or "connection_url" in self.config:
            val = conn_str or conn_url or ""
            return val.strip() if isinstance(val, str) else val
            
        # Fallback to build URI from host/port/username
        return self._build_uri().strip()

    @staticmethod
    def _friendly_error(exc: Exception, uri: str) -> str:
        msg = str(exc)
        lower = msg.lower()
        if "query name does not exist" in lower or "nameresolution" in lower or "getaddrinfo" in lower:
            host = ""
            try:
                from urllib.parse import urlparse

                probe = uri.replace("mongodb+srv://", "https://", 1).replace("mongodb://", "https://", 1)
                host = urlparse(probe).hostname or ""
            except Exception:
                pass
            host_part = f" ({host})" if host else ""
            return (
                f"Cannot resolve MongoDB cluster hostname{host_part}. "
                "In MongoDB Atlas open Database → Connect → Drivers and copy the full "
                "mongodb+srv:// connection string (cluster name must match your Atlas cluster). "
                "Also add your current IP under Network Access."
            )
        if "authentication failed" in lower or "auth failed" in lower:
            return f"MongoDB authentication failed: {msg}. Check username, password, and authSource."
        if "timed out" in lower or "timeout" in lower:
            return (
                f"MongoDB connection timed out: {msg}. "
                "Allow your IP in Atlas Network Access and confirm the cluster is running."
            )
        return (
            f"MongoDB connection failed: {msg}. "
            "Verify connection string, database, collection, and Atlas network access."
        )

    async def test_connection(self) -> bool:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = self._connection_uri()
        if not uri:
            raise ConnectorConnectionError("Connection string is required.")

        database = (self.config.get("database") or "").strip()
        client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=15000)
        try:
            # Atlas users often lack admin access; ping the target database instead.
            if database:
                await client[database].command("ping")
            else:
                await client.admin.command("ping")
            return True
        except Exception as e:
            logger.error(f"MongoDB connection test failed: {e}")
            raise ConnectorConnectionError(self._friendly_error(e, uri)) from e
        finally:
            client.close()

    def _build_uri(self) -> str:
        import urllib.parse
        host = self.config.get("host", "localhost")
        port = self.config.get("port", 27017)
        username = urllib.parse.quote_plus(self.config.get("username", ""))
        password = urllib.parse.quote_plus(self.config.get("password", ""))
        database = self.config.get("database", "")
        auth_source = self.config.get("auth_source", "admin")

        if username and password:
            return f"mongodb://{username}:{password}@{host}:{port}/{database}?authSource={auth_source}"
        return f"mongodb://{host}:{port}/{database}"

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = self._connection_uri()
        database = self.config.get("database", "")
        collection = self.config.get("collection", "")
        query = self.config.get("query", {})
        projection = self.config.get("projection")
        sort = self.config.get("sort", [])
        limit = self.config.get("limit", 0)
        chunk_size = self.config.get("chunk_size", 1000)

        if not database or not collection:
            raise ValueError("MongoDB extract requires 'database' and 'collection' in config")

        logger.info(f"Extracting from MongoDB: {database}.{collection}")

        client = AsyncIOMotorClient(uri)
        try:
            coll = client[database][collection]
            cursor = coll.find(query, projection=projection)
            if sort:
                cursor = cursor.sort(sort)
            if limit:
                cursor = cursor.limit(limit)

            chunk = []
            async for doc in cursor:
                # Convert ObjectId and other BSON types to JSON-serializable
                doc["_id"] = str(doc["_id"])
                chunk.append(doc)
                if len(chunk) >= chunk_size:
                    yield chunk
                    chunk = []
            if chunk:
                yield chunk
        finally:
            client.close()

        logger.info("MongoDB extraction complete.")

    async def load(self, data: pl.DataFrame) -> LoadResult:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = self._connection_uri()
        database = self.config.get("database", "")
        collection = self.config.get("collection", "")
        if_exists = self.config.get("if_exists", "append")  # append | replace

        if not database or not collection:
            raise ValueError("MongoDB load requires 'database' and 'collection' in config")

        client = AsyncIOMotorClient(uri)
        try:
            coll = client[database][collection]
            if if_exists == "replace":
                await coll.delete_many({})

            records = data.to_dicts()
            if records:
                await coll.insert_many(records)

            logger.info(f"Loaded {len(data)} rows into MongoDB {database}.{collection}")
            return LoadResult(
                success=True,
                rows_loaded=len(data),
                message=f"Loaded into {database}.{collection}",
            )
        except Exception as e:
            logger.error(f"MongoDB load failed: {e}", exc_info=True)
            return LoadResult(success=False, message=str(e))
        finally:
            client.close()

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "connection_string": {
                    "type": "string",
                    "title": "Connection String",
                    "description": "Paste from Atlas → Connect → Drivers (mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/)",
                },
                "database": {"type": "string", "title": "Database"},
                "collection": {"type": "string", "title": "Collection"},
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., mongodb_data.parquet).",
                },
            },
            "required": ["connection_string", "database", "collection", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "MongoDB"

