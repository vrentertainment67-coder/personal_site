"""The HTTP layer's job: say "could not ask" and "asked, got no such thing" differently."""

import json

import pytest
import requests

from desk.sources.http import DayCache, HttpClient, SourceUnavailable


class FakeResponse:
    def __init__(self, status, payload=None):
        self.status_code = status
        self._payload = payload
        self.content = b"{}" if payload is not None else b""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeSession:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.headers = {}
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        outcome = self.outcomes.pop(0) if self.outcomes else FakeResponse(200, {})
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def client(session, **kwargs):
    http = HttpClient("test", **kwargs)
    http.session = session
    return http


def test_a_404_is_an_answer_not_a_failure():
    http = client(FakeSession(FakeResponse(404)))
    response = http.get_json("https://example.test/x")
    assert response.status == 404
    assert response.ok is False
    assert http.failures == []


def test_a_connection_error_raises_source_unavailable_after_retries():
    session = FakeSession(*[requests.ConnectionError("CONNECT tunnel failed")] * 3)
    http = client(session)
    with pytest.raises(SourceUnavailable) as exc:
        http.get_json("https://example.test/x", retries=3)
    assert "CONNECT tunnel failed" in exc.value.detail
    assert len(session.calls) == 3
    assert http.failures


def test_a_policy_denial_is_retried_then_reported_as_unavailable():
    session = FakeSession(FakeResponse(403), FakeResponse(403))
    with pytest.raises(SourceUnavailable, match="HTTP 403"):
        client(session).get_json("https://example.test/x", retries=2)


def test_a_retryable_status_can_still_succeed():
    session = FakeSession(FakeResponse(503), FakeResponse(200, {"ok": True}))
    response = client(session).get_json("https://example.test/x", retries=3)
    assert response.payload == {"ok": True}


def test_responses_are_cached_for_the_day(tmp_path):
    cache = DayCache("test", root=tmp_path)
    session = FakeSession(FakeResponse(200, {"n": 1}))
    http = client(session, cache=cache)
    first = http.get_json("https://example.test/x", cache_key="x")
    second = http.get_json("https://example.test/x", cache_key="x")
    assert first.payload == second.payload == {"n": 1}
    assert second.from_cache is True
    assert len(session.calls) == 1


def test_a_corrupt_cache_entry_is_ignored(tmp_path):
    cache = DayCache("test", root=tmp_path)
    cache.put("x", {"status": 200, "payload": {"n": 1}})
    path = cache._path("x")
    path.write_text("{not json", encoding="utf-8")
    session = FakeSession(FakeResponse(200, {"n": 2}))
    response = client(session, cache=cache).get_json("https://example.test/x", cache_key="x")
    assert response.payload == {"n": 2}
    assert json.loads(path.read_text())["payload"] == {"n": 2}


def test_wrapped_proxy_errors_are_condensed_to_the_actual_reason():
    from desk.sources.http import _short_reason

    exc = requests.exceptions.ProxyError(
        "HTTPSConnectionPool(host='query1.finance.yahoo.com', port=443): Max retries "
        "exceeded with url: /v8/finance/chart/LML.NS (Caused by ProxyError("
        "'Unable to connect to proxy', OSError('Tunnel connection failed: 403 Forbidden')))"
    )
    assert _short_reason(exc) == "ProxyError: Tunnel connection failed: 403 Forbidden"


def test_failures_name_the_query_so_two_symbols_do_not_collapse():
    session = FakeSession(*[requests.ConnectionError("down")] * 2)
    http = client(session)
    with pytest.raises(SourceUnavailable):
        http.get_json("https://example.test/q", params={"symbol": "LML"}, retries=2)
    assert http.failures == ["https://example.test/q?symbol=LML: ConnectionError: down"]
