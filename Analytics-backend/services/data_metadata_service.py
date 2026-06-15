"""
Metadata caching for datasets and transformations.
"""

import threading
import time
from typing import Any, Dict, Optional

_cache: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()
_DEFAULT_TTL = 300  # 5 minutes


def _key(namespace: str, resource_id: str) -> str:
    return f"{namespace}:{resource_id}"


def get_cached(namespace: str, resource_id: str) -> Optional[Any]:
    with _lock:
        entry = _cache.get(_key(namespace, resource_id))
        if not entry:
            return None
        if time.time() - entry["ts"] > entry.get("ttl", _DEFAULT_TTL):
            del _cache[_key(namespace, resource_id)]
            return None
        return entry["data"]


def set_cached(namespace: str, resource_id: str, data: Any, ttl: int = _DEFAULT_TTL):
    with _lock:
        _cache[_key(namespace, resource_id)] = {"data": data, "ts": time.time(), "ttl": ttl}


def invalidate(namespace: str, resource_id: Optional[str] = None):
    with _lock:
        if resource_id:
            _cache.pop(_key(namespace, resource_id), None)
        else:
            keys = [k for k in _cache if k.startswith(f"{namespace}:")]
            for k in keys:
                del _cache[k]


def cache_stats() -> Dict[str, Any]:
    with _lock:
        return {"entries": len(_cache), "keys": list(_cache.keys())[:50]}
