import base64
import json
import time
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx

from services.api_connector.validators import validate_http_method, validate_url

DEFAULT_TIMEOUT_SECONDS = 20
MAX_RESPONSE_BYTES = 5 * 1024 * 1024


class APIRequestError(Exception):
    pass


def _build_url(base_url: str, endpoint: str, query_params: dict | None) -> str:
    """
    Supports both patterns:
    1) base_url = host, endpoint = path
    2) base_url = full API URL (with optional path/query), endpoint optional
    """
    raw_base = (base_url or "").strip()
    raw_endpoint = (endpoint or "").strip()

    if raw_endpoint:
        clean_base = raw_base.rstrip("/") + "/"
        clean_endpoint = raw_endpoint.lstrip("/")
        final = urljoin(clean_base, clean_endpoint)
    else:
        final = raw_base

    parsed = urlparse(final)
    existing_qs = dict(parse_qsl(parsed.query, keep_blank_values=True))
    merged_qs = {**existing_qs, **(query_params or {})}
    if merged_qs:
        new_query = urlencode(merged_qs, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    return final


def _apply_auth(headers: dict, auth_type: str | None, auth_config: dict | None):
    at = (auth_type or "none").lower()
    cfg = auth_config or {}
    if at == "api_key":
        key_name = cfg.get("api_key_name", "X-API-Key")
        headers[key_name] = str(cfg.get("api_key_value", ""))
    elif at == "bearer":
        headers["Authorization"] = f"Bearer {cfg.get('token', '')}"
    elif at == "basic":
        raw = f"{cfg.get('username', '')}:{cfg.get('password', '')}".encode("utf-8")
        headers["Authorization"] = f"Basic {base64.b64encode(raw).decode('utf-8')}"


async def fetch_api_data(
    *,
    base_url: str,
    endpoint: str,
    method: str,
    headers: dict | None,
    query_params: dict | None,
    auth_type: str | None,
    auth_config: dict | None,
    request_body: dict | None,
):
    validate_url(base_url)
    method = validate_http_method(method)
    final_url = _build_url(base_url, endpoint, query_params)
    validate_url(final_url)

    req_headers = {str(k): str(v) for k, v in (headers or {}).items()}
    _apply_auth(req_headers, auth_type, auth_config)

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS, follow_redirects=False) as client:
            resp = await client.request(
                method=method,
                url=final_url,
                headers=req_headers,
                json=request_body if method in {"POST", "PUT", "DELETE"} else None,
            )
    except httpx.ConnectTimeout:
        raise APIRequestError("Timeout")
    except httpx.InvalidURL:
        raise APIRequestError("Invalid URL")
    except httpx.ConnectError as exc:
        msg = str(exc).lower()
        if "name or service not known" in msg or "nodename nor servname" in msg:
            raise APIRequestError("DNS failure")
        raise APIRequestError("Connection failed")

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if resp.status_code == 401:
        raise APIRequestError("Unauthorized")
    if resp.status_code == 403:
        raise APIRequestError("Forbidden")
    if resp.status_code == 429:
        raise APIRequestError("Rate limit exceeded")

    body = resp.content
    if len(body) > MAX_RESPONSE_BYTES:
        raise APIRequestError("Large response")

    try:
        parsed = resp.json()
    except json.JSONDecodeError:
        raise APIRequestError("Invalid JSON")

    return {
        "status_code": resp.status_code,
        "response_time": elapsed_ms,
        "data": parsed,
        "url": final_url,
    }

