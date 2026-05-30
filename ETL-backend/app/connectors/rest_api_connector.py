"""
ArithFlow — REST API / HTTP Connector (Source Only).

Extract data from paginated REST APIs using O(1) memory streaming generators.
Supports multiple auth modes: none, api_key, bearer, basic.
Supports cursor-based pagination in addition to page-number pagination.
"""

from __future__ import annotations

import base64
import json
from typing import Any, AsyncGenerator

import httpx
import polars as pl

from app.connectors.base import BaseConnector, LoadResult
from app.utils.logger import get_logger

logger = get_logger("connectors.rest_api")


class RestAPIConnector(BaseConnector):

    @staticmethod
    def _parse_json_or_dict(value: Any, default: Any) -> Any:
        """Parse a value that may be a JSON string or already a dict/list."""
        if value is None:
            return default
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return default
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                return default
        return default

    def _build_auth_headers(self) -> dict[str, str]:
        """Build authentication headers based on auth_type config."""
        auth_type = self.config.get("auth_type", "none").lower()
        # headers may arrive as a JSON string from the textarea in DynamicForm
        raw_headers = self.config.get("headers", {})
        headers = dict(self._parse_json_or_dict(raw_headers, {}))

        if auth_type == "bearer":
            token = self.config.get("api_key") or self.config.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "api_key":
            key = self.config.get("api_key", "")
            key_header = self.config.get("api_key_header", "X-API-Key")
            if key:
                headers[key_header] = key

        elif auth_type == "basic":
            username = self.config.get("username", "")
            password = self.config.get("password", "")
            if username:
                creds = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {creds}"

        elif auth_type == "oauth_token":
            # Pre-existing OAuth token (manual)
            token = self.config.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"

        return headers

    async def test_connection(self) -> bool:
        url = self.config.get("url", "")
        if not url:
            return False
        headers = self._build_auth_headers()
        method = self.config.get("method", "GET").upper()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                if method == "POST":
                    body = self._parse_json_or_dict(self.config.get("body", {}), {})
                    resp = await client.post(url, headers=headers, json=body)
                else:
                    resp = await client.get(url, headers=headers)
                return resp.status_code < 400
        except Exception as e:
            logger.error(f"REST API test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        url = self.config.get("url", "")
        if not url:
            raise ValueError("REST API connector requires a 'url' configuration.")
        headers = self._build_auth_headers()
        method = self.config.get("method", "GET").upper()
        data_path = self.config.get("data_path", "")
        # params may arrive as JSON string from the form
        params = dict(self._parse_json_or_dict(self.config.get("params", {}), {}))

        # Pagination configuration — may arrive as a JSON string from DynamicForm object field
        raw_pagination = self.config.get("pagination", {})
        pagination = self._parse_json_or_dict(raw_pagination, {})
        if not isinstance(pagination, dict):
            pagination = {}
        pagination_type = pagination.get("type") or self.config.get("pagination_type", "page")
        page_param = pagination.get("page_param") or self.config.get("page_param", "page")
        per_page_param = pagination.get("per_page_param") or self.config.get("per_page_param", "per_page")
        per_page = pagination.get("per_page") or int(self.config.get("per_page", 100))
        max_pages = pagination.get("max_pages") or int(self.config.get("max_pages", 50))
        cursor_path = pagination.get("cursor_path") or self.config.get("cursor_path", "next_cursor")
        next_url_path = pagination.get("next_url_path") or self.config.get("next_url_path", "")

        logger.info(f"REST API extraction from: {url} ({method}, pagination: {pagination_type})")

        async with httpx.AsyncClient(timeout=30) as client:

            if pagination_type == "none":
                # Single request
                resp = await self._make_request(client, method, url, headers, params)
                data = resp.json()
                records = self._extract_data(data, data_path)
                if records:
                    yield records
                return

            elif pagination_type == "cursor":
                # Cursor-based pagination (e.g. GitHub, Stripe)
                page_num = 0
                cursor_value = None
                while page_num < max_pages:
                    page_num += 1
                    req_params = {**params, per_page_param: per_page}
                    if cursor_value:
                        req_params[page_param] = cursor_value

                    resp = await self._make_request(client, method, url, headers, req_params)
                    data = resp.json()
                    records = self._extract_data(data, data_path)

                    if not records:
                        break
                    yield records
                    logger.debug(f"REST API cursor page {page_num}: {len(records)} records")

                    # Get next cursor
                    cursor_value = self._resolve_path(data, cursor_path)
                    if not cursor_value:
                        break

            elif next_url_path:
                # Link-header or next URL in response body
                current_url: str | None = url
                page_num = 0
                req_params = {**params, per_page_param: per_page}
                while current_url and page_num < max_pages:
                    page_num += 1
                    if page_num == 1:
                        resp = await self._make_request(client, method, current_url, headers, req_params)
                    else:
                        resp = await self._make_request(client, method, current_url, headers, {})
                    data = resp.json()
                    records = self._extract_data(data, data_path)
                    if not records:
                        break
                    yield records
                    logger.debug(f"REST API next-url page {page_num}: {len(records)} records")
                    current_url = self._resolve_path(data, next_url_path)

            else:
                # Default: page-number pagination
                for page in range(1, max_pages + 1):
                    req_params = {**params, page_param: page, per_page_param: per_page}

                    resp = await self._make_request(client, method, url, headers, req_params)
                    data = resp.json()
                    records = self._extract_data(data, data_path)

                    if not records:
                        break

                    yield records
                    logger.debug(f"REST API page {page}: {len(records)} records")

                    if len(records) < per_page:
                        break  # Last page

        logger.info("REST API extraction complete.")

    async def _make_request(
        self, client: httpx.AsyncClient, method: str, url: str, headers: dict, params: dict
    ) -> httpx.Response:
        if method == "GET":
            resp = await client.get(url, headers=headers, params=params)
        elif method == "POST":
            # body may arrive as JSON string from the form textarea
            body = self._parse_json_or_dict(self.config.get("body", {}), {})
            resp = await client.post(url, headers=headers, json=body, params=params)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        resp.raise_for_status()
        return resp

    def _extract_data(self, data: Any, data_path: str) -> list[dict]:
        """Navigate dot-path in the response JSON to find the records list."""
        if data_path:
            for key in data_path.split("."):
                if isinstance(data, dict):
                    data = data.get(key, [])
                else:
                    break
        else:
            # Maximum UX: Auto-detect common wrapping keys if the user forgot the data_path
            if isinstance(data, dict):
                for guess_key in ["data", "results", "items", "records", "value"]:
                    if guess_key in data and isinstance(data[guess_key], list):
                        logger.info(f"Auto-detected data path '{guess_key}' in REST API response.")
                        data = data[guess_key]
                        break

        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return [data]
        return []

    def _resolve_path(self, data: Any, path: str) -> Any:
        """Resolve a dot-separated path in a dict."""
        if not path:
            return None
        for key in path.split("."):
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return None
        return data

    async def load(self, data: pl.DataFrame) -> LoadResult:
        """REST API is source-only."""
        return LoadResult(success=False, message="REST API connector is source-only")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "title": "API Endpoint URL",
                    "description": "Full URL of the REST API endpoint",
                },
                "method": {
                    "type": "string",
                    "title": "HTTP Method",
                    "enum": ["GET", "POST"],
                    "default": "GET",
                },
                "auth_type": {
                    "type": "string",
                    "title": "Authentication Type",
                    "enum": ["none", "bearer", "api_key", "basic", "oauth_token"],
                    "default": "none",
                    "description": "Authentication method to use",
                },
                "api_key": {
                    "type": "string",
                    "title": "API Key / Bearer Token",
                    "description": "Token for Bearer or API Key auth",
                },
                "api_key_header": {
                    "type": "string",
                    "title": "API Key Header Name",
                    "default": "X-API-Key",
                    "description": "Header name for API key (default: X-API-Key)",
                },
                "username": {
                    "type": "string",
                    "title": "Username (Basic Auth)",
                },
                "password": {
                    "type": "string",
                    "title": "Password (Basic Auth)",
                    "format": "password",
                },
                "headers": {
                    "type": "object",
                    "title": "Extra Headers (JSON)",
                    "description": 'Additional request headers as JSON object, e.g. {"X-Tenant": "acme"}',
                    "format": "json",
                },
                "params": {
                    "type": "object",
                    "title": "Query Parameters (JSON)",
                    "description": 'Static query parameters as JSON object, e.g. {"limit": 100}',
                    "format": "json",
                },
                "body": {
                    "type": "object",
                    "title": "Request Body / POST JSON",
                    "description": "JSON body for POST requests",
                    "format": "json",
                },
                "data_path": {
                    "type": "string",
                    "title": "Data Path",
                    "description": "Dot-separated path to records array in response (e.g. data.results)",
                },
                # Flattened pagination fields — avoids DynamicForm nested-object rendering issues
                "pagination_type": {
                    "type": "string",
                    "title": "Pagination Type",
                    "enum": ["page", "cursor", "none"],
                    "default": "page",
                },
                "page_param": {"type": "string", "title": "Page Parameter Name", "default": "page"},
                "per_page_param": {"type": "string", "title": "Per-Page Parameter Name", "default": "per_page"},
                "per_page": {"type": "integer", "title": "Records Per Page", "default": 100},
                "max_pages": {"type": "integer", "title": "Max Pages to Fetch", "default": 50},
                "cursor_path": {
                    "type": "string",
                    "title": "Cursor Path (cursor pagination)",
                    "description": "Dot-path to cursor value in response body",
                },
                "next_url_path": {
                    "type": "string",
                    "title": "Next URL Path (link pagination)",
                    "description": "Dot-path to the next-page URL in response body",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name / Result Name",
                    "description": "Unique name for the raw data buffer (e.g., api_raw)."
                },
                "save_to_vault": {
                    "type": "boolean",
                    "title": "Save configurations for quick extraction",
                    "default": False
                },
            },
            "required": ["url", "output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "REST / HTTP API"
