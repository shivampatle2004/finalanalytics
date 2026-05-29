import ipaddress
import socket
from urllib.parse import urlparse


ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTS = {"localhost"}


def _is_private_or_loopback(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except ValueError:
        try:
            resolved = socket.gethostbyname(host)
            ip = ipaddress.ip_address(resolved)
            return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        except Exception:
            return False


def validate_url(url: str) -> None:
    if not url:
        raise ValueError("URL is required")
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("Only http and https URLs are allowed")
    if not parsed.netloc:
        raise ValueError("Invalid URL")
    host = (parsed.hostname or "").strip().lower()
    if host in BLOCKED_HOSTS:
        raise ValueError("Localhost is not allowed")
    if host == "127.0.0.1":
        raise ValueError("Loopback addresses are not allowed")
    if _is_private_or_loopback(host):
        raise ValueError("Internal/private IP ranges are not allowed")


def validate_http_method(method: str) -> str:
    allowed = {"GET", "POST", "PUT", "DELETE"}
    normalized = (method or "").strip().upper()
    if normalized not in allowed:
        raise ValueError(f"Unsupported HTTP method: {method}")
    return normalized

