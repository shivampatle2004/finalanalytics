"""
Lightweight HTTP / driver checks for connector test_connection.

Avoids importing optional DLT source packages (pyairtable, stripe, etc.) during tests.
"""

from __future__ import annotations

from typing import Any


def _require_requests():
    try:
        import requests  # noqa: F401
    except ImportError as e:
        raise ImportError("requests library is required for this connector.") from e


def _ok_status(status: int) -> bool:
    return status in (200, 204)


def _api_error(service: str, resp) -> Exception:
    body = (getattr(resp, "text", None) or "")[:300]
    return Exception(f"{service} API returned {resp.status_code}: {body}")


def validate_engine_connection(engine: str, config: dict[str, Any]) -> bool | None:
    """
    Run a minimal connection check when possible.

    Returns:
        True  — validated successfully
        None  — no lightweight check for this engine (caller should use DLT source path)
    Raises:
        Exception — validation failed with a user-visible reason
    """
    import requests

    _require_requests()

    if engine == "airtable":
        access_token = config.get("api_key") or config.get("access_token", "")
        base_id = config.get("base_id", "")
        if not access_token or not base_id:
            raise ValueError("api_key and base_id are required for Airtable.")
        resp = requests.get(
            f"https://api.airtable.com/v0/meta/bases/{base_id}/tables",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("Airtable", resp)

    if engine == "stripe":
        api_key = config.get("api_key", "")
        if not api_key:
            raise ValueError("api_key is required for Stripe.")
        resp = requests.get(
            "https://api.stripe.com/v1/balance",
            auth=(api_key, ""),
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("Stripe", resp)

    if engine == "hubspot":
        api_key = config.get("api_key", "")
        if not api_key:
            raise ValueError("api_key is required for HubSpot.")
        resp = requests.get(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"limit": 1},
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("HubSpot", resp)

    if engine == "notion":
        api_key = config.get("api_key", "")
        if not api_key:
            raise ValueError("api_key is required for Notion.")
        resp = requests.get(
            "https://api.notion.com/v1/users/me",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Notion-Version": "2022-06-28",
            },
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("Notion", resp)

    if engine == "github":
        repository = config.get("repository", "")
        if not repository or "/" not in repository:
            raise ValueError("repository must be in owner/repo format for GitHub.")
        access_token = config.get("access_token", "")
        headers = {"Accept": "application/vnd.github+json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        resp = requests.get(
            f"https://api.github.com/repos/{repository}",
            headers=headers,
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("GitHub", resp)

    if engine == "slack":
        token = config.get("token") or config.get("access_token", "")
        if not token:
            raise ValueError("token is required for Slack.")
        resp = requests.post(
            "https://slack.com/api/auth.test",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code == 200 and data.get("ok"):
            return True
        raise Exception(data.get("error") or _api_error("Slack", resp))

    if engine == "zendesk":
        subdomain = config.get("subdomain", "")
        email = config.get("email", "")
        api_token = config.get("api_token", "")
        if not subdomain or not email or not api_token:
            raise ValueError("subdomain, email, and api_token are required for Zendesk.")
        resp = requests.get(
            f"https://{subdomain}.zendesk.com/api/v2/users/me.json",
            auth=(f"{email}/token", api_token),
            timeout=15,
        )
        if _ok_status(resp.status_code):
            return True
        raise _api_error("Zendesk", resp)

    if engine == "pipedrive":
        domain = config.get("domain", "")
        api_token = config.get("api_token") or config.get("api_key", "")
        if not domain or not api_token:
            raise ValueError("domain and api_token are required for Pipedrive.")
        resp = requests.get(
            f"https://{domain}.pipedrive.com/api/v1/users/me",
            params={"api_token": api_token},
            timeout=15,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code == 200 and data.get("success"):
            return True
        raise _api_error("Pipedrive", resp)

    if engine == "facebook_ads":
        access_token = config.get("access_token", "")
        account_id = str(config.get("account_id", "")).replace("act_", "")
        if not access_token or not account_id:
            raise ValueError("access_token and account_id are required for Facebook Ads.")
        resp = requests.get(
            f"https://graph.facebook.com/v18.0/act_{account_id}",
            params={"access_token": access_token, "fields": "id,name"},
            timeout=15,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code == 200 and "id" in data:
            return True
        err = data.get("error", {}).get("message") if isinstance(data.get("error"), dict) else resp.text[:300]
        raise Exception(f"Facebook Ads API error: {err}")

    if engine == "mongodb":
        connection_url = config.get("connection_url") or config.get("connection_string")
        if not connection_url:
            raise ValueError("connection_string (or connection_url) is required for MongoDB.")
        try:
            from pymongo import MongoClient
        except ImportError as e:
            raise ImportError("pymongo is required for MongoDB.") from e
        database = config.get("database", "")
        client = MongoClient(connection_url, serverSelectionTimeoutMS=10000)
        try:
            if database:
                client[database].command("ping")
            else:
                client.admin.command("ping")
        finally:
            client.close()
        return True

    return None
