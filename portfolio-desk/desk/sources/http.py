"""Shared HTTP plumbing: session reuse, rate limiting, retries, day-scoped cache.

The important distinction this module draws is between

* `SourceUnavailable` — we could not ask (network blocked, timeout, rate limit,
  5xx). The caller must report "unknown", never "bad".
* a returned response with a 404 — we asked and the thing does not exist.

Mixing the two is how a brief ends up claiming a good ticker is broken because
the network was down.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Mapping

import requests

from .. import config

log = logging.getLogger(__name__)

# Treated as "ask again later" rather than an answer about the data.
RETRY_STATUS = frozenset({403, 407, 408, 425, 429, 500, 502, 503, 504})


class SourceUnavailable(RuntimeError):
    """A source could not be reached or refused to answer."""

    def __init__(self, source: str, detail: str) -> None:
        super().__init__(f"{source}: {detail}")
        self.source = source
        self.detail = detail


@dataclass
class Response:
    status: int
    payload: Any
    from_cache: bool = False

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


class DayCache:
    """Caches responses under data/cache/<YYYY-MM-DD>/ so a re-run is cheap."""

    def __init__(self, namespace: str, *, day: date | None = None, root: Path | None = None) -> None:
        self.day = day or date.today()
        self.dir = (root or config.CACHE_DIR) / self.day.isoformat() / namespace
        self.enabled = True

    def _path(self, key: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-._" else "_" for c in key)[:120]
        return self.dir / f"{safe}.json"

    def get(self, key: str) -> Any | None:
        if not self.enabled:
            return None
        path = self._path(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def put(self, key: str, value: Any) -> None:
        if not self.enabled:
            return
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            self._path(key).write_text(json.dumps(value), encoding="utf-8")
        except OSError as exc:  # a read-only checkout should not fail a run
            log.debug("cache write failed for %s: %s", key, exc)


class HttpClient:
    """One session per source, with a floor on the gap between requests."""

    def __init__(
        self,
        source: str,
        *,
        min_interval: float = 0.0,
        headers: Mapping[str, str] | None = None,
        cache: DayCache | None = None,
    ) -> None:
        self.source = source
        self.min_interval = min_interval
        self.cache = cache
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": config.USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-IN,en;q=0.9",
                **(headers or {}),
            }
        )
        self._last_request = 0.0
        self.failures: list[str] = []

    def _throttle(self) -> None:
        if self.min_interval <= 0:
            return
        gap = time.monotonic() - self._last_request
        if gap < self.min_interval:
            time.sleep(self.min_interval - gap)

    def get_json(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        cache_key: str | None = None,
        retries: int | None = None,
    ) -> Response:
        """GET and decode JSON.

        Raises SourceUnavailable when the source could not answer. Returns a
        Response (possibly with a 4xx status) when it did.
        """
        if cache_key and self.cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return Response(status=cached["status"], payload=cached["payload"], from_cache=True)

        attempts = retries if retries is not None else config.MAX_RETRIES
        last_detail = "no attempt made"
        for attempt in range(1, attempts + 1):
            self._throttle()
            try:
                response = self.session.get(
                    url, params=params, timeout=config.REQUEST_TIMEOUT_SECONDS
                )
            except requests.RequestException as exc:
                last_detail = _short_reason(exc)
            else:
                if response.status_code in RETRY_STATUS:
                    last_detail = f"HTTP {response.status_code}"
                else:
                    try:
                        payload = response.json() if response.content else None
                    except ValueError:
                        payload = None
                    result = Response(status=response.status_code, payload=payload)
                    if cache_key and self.cache:
                        self.cache.put(cache_key, {"status": result.status, "payload": result.payload})
                    return result
            finally:
                self._last_request = time.monotonic()

            if attempt < attempts:
                time.sleep(min(2 ** (attempt - 1), 8))

        self.failures.append(f"{_describe(url, params)}: {last_detail}")
        log.warning("%s unavailable (%s): %s", self.source, _describe(url, params), last_detail)
        raise SourceUnavailable(self.source, last_detail)


# "Max retries exceeded with url: ... (Caused by ProxyError('Unable to connect
# to proxy', OSError('Tunnel connection failed: 403 Forbidden')))" is three
# layers of wrapper around one fact. Keep the fact.
_CAUSE = re.compile(r"Caused by \w+\((?:'[^']*',\s*)?\w*\(?'([^']+)'")


def _short_reason(exc: Exception) -> str:
    text = str(exc)
    match = _CAUSE.search(text)
    detail = match.group(1) if match else text.split("\n")[0]
    if len(detail) > 120:
        detail = detail[:117] + "..."
    return f"{type(exc).__name__}: {detail}"


def _describe(url: str, params: Mapping[str, Any] | None) -> str:
    if not params:
        return url
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{url}?{query}"
