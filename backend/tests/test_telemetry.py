"""OpenTelemetry: resource, spans, logs and every metric, read from in-memory exporters."""

import json
import logging
import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import ai_writer, store, telemetry
from app.generator import SampleSource
from app.main import create_app
from app.youtube import YouTubeError


class Recorder:
    """A Telemetry with in-memory exporters and a reader."""

    def __init__(self):
        self.spans = InMemorySpanExporter()
        self.reader = InMemoryMetricReader()
        self.logs = InMemoryLogRecordExporter()
        self.telemetry = telemetry.build_telemetry(
            span_processors=[SimpleSpanProcessor(self.spans)],
            metric_readers=[self.reader],
            log_processors=[SimpleLogRecordProcessor(self.logs)],
        )

    def points(self, name):
        """Data points of one metric as a list of (attributes, value-or-histogram-point)."""
        data = self.reader.get_metrics_data()
        found = []
        for resource_metrics in data.resource_metrics if data else []:
            for scope in resource_metrics.scope_metrics:
                for metric in scope.metrics:
                    if metric.name == name:
                        found += [(dict(p.attributes), p) for p in metric.data.data_points]
        return found

    def total(self, name, **attributes):
        """Sum of the counter (or histogram count) points whose attributes include `attributes`."""
        total = 0
        for attrs, point in self.points(name):
            if all(attrs.get(k) == v for k, v in attributes.items()):
                total += getattr(point, "count", None) if hasattr(point, "count") else point.value
        return total


@pytest.fixture(autouse=True)
def app_settings(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("APP_VERSION", "1.2.3")
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)


@pytest.fixture
def recorder():
    return Recorder()


@pytest.fixture
def make_client(database_url, recorder):
    clients = []

    def make(video_source=None):
        app = create_app(database_url, video_source=video_source or SampleSource(), telemetry=recorder.telemetry)
        client = TestClient(app, raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        return client

    yield make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def tclient(make_client):
    return make_client()


def add_competitor(client, handle="creator"):
    return client.post("/api/competitors", json={"channelUrl": f"https://www.youtube.com/@{handle}"})


def first_video(client):
    comp = add_competitor(client).json()
    return client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]


# ---- switch ---------------------------------------------------------------------


def test_nothing_is_created_without_an_endpoint(database_url, monkeypatch):
    def no_network(*args, **kwargs):
        raise AssertionError("telemetry opened a network connection")

    monkeypatch.setattr(socket, "create_connection", no_network)
    threads_before = {t.name for t in threading.enumerate()}
    app = create_app(database_url, video_source=SampleSource())
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        add_competitor(client)
    tel = app.state.telemetry
    assert tel.enabled is False
    assert tel.tracer_provider is None and tel.meter_provider is None and tel.logger_provider is None
    assert not getattr(app, "_is_instrumented_by_opentelemetry", False)
    assert {t.name for t in threading.enumerate()} <= threads_before


def test_blank_endpoint_counts_as_unset():
    assert telemetry.from_env().enabled is False


def test_several_apps_in_one_process_do_not_raise(database_url, tmp_path):
    first, second = Recorder(), Recorder()
    app_a = create_app(database_url, video_source=SampleSource(), telemetry=first.telemetry)
    app_b = create_app(f"sqlite:///{tmp_path / 'b.db'}", video_source=SampleSource(), telemetry=second.telemetry)
    with TestClient(app_a) as a, TestClient(app_b) as b:
        assert add_competitor(a).status_code == 201
        assert add_competitor(b).status_code == 201
    assert first.total("clipremix.competitors.added") == 1
    assert second.total("clipremix.competitors.added") == 1


# ---- resource -------------------------------------------------------------------


def test_resource_is_on_spans_metrics_and_logs(tclient, recorder):
    add_competitor(tclient)
    expected = {"service.name": "clipremix", "deployment.environment": "dev", "service.version": "1.2.3"}

    spans = recorder.spans.get_finished_spans()
    assert spans
    for span in spans:
        assert {k: span.resource.attributes[k] for k in expected} == expected

    data = recorder.reader.get_metrics_data()
    assert data.resource_metrics
    for resource_metrics in data.resource_metrics:
        assert {k: resource_metrics.resource.attributes[k] for k in expected} == expected

    records = recorder.logs.get_finished_logs()
    assert records
    for record in records:
        assert {k: record.resource.attributes[k] for k in expected} == expected


def test_resource_uses_the_version_helper_fallbacks(monkeypatch):
    monkeypatch.delenv("APP_VERSION")
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123")
    monkeypatch.setenv("APP_ENV", "bogus")
    attrs = telemetry.build_resource().attributes
    assert attrs["service.version"] == "abc123"
    assert attrs["deployment.environment"] == "local"


# ---- traces ---------------------------------------------------------------------


def test_requests_and_database_calls_make_spans(tclient, recorder):
    add_competitor(tclient)
    spans = recorder.spans.get_finished_spans()
    server = [s for s in spans if s.parent is None and s.name.startswith("POST")]
    assert server, [s.name for s in spans]
    trace_id = server[0].context.trace_id
    children = [s for s in spans if s.parent is not None and s.context.trace_id == trace_id]
    assert any(s.attributes.get("db.system") or s.attributes.get("db.system.name") for s in children)


def test_health_is_not_traced(tclient, recorder):
    recorder.spans.clear()
    assert tclient.get("/api/health").status_code == 200
    assert recorder.spans.get_finished_spans() == ()


def test_outgoing_urllib_calls_make_spans(tclient, recorder, monkeypatch):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.delenv("no_proxy", raising=False)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}/feed", timeout=5).read()
    finally:
        server.shutdown()
    client_spans = [s for s in recorder.spans.get_finished_spans() if s.kind.name == "CLIENT" and "GET" in s.name]
    assert client_spans


# ---- logs -----------------------------------------------------------------------


def test_logs_are_exported_with_trace_ids_and_still_reach_stdout(make_client, recorder, capsys, monkeypatch):
    monkeypatch.setattr(logging.getLogger(), "handlers", [])  # as under uvicorn: no handler configured yet
    tclient = make_client()
    add_competitor(tclient, "loggy")
    records = [r for r in recorder.logs.get_finished_logs() if "Competitor added" in str(r.log_record.body)]
    assert records
    record = records[0].log_record
    spans = recorder.spans.get_finished_spans()
    server = [s for s in spans if s.parent is None and s.name.startswith("POST")][0]
    assert record.trace_id == server.context.trace_id
    assert record.span_id and record.span_id != 0
    assert "Competitor added: Loggy" in capsys.readouterr().out


# ---- metrics --------------------------------------------------------------------


def test_competitors_added_counts_only_new_competitors(tclient, recorder):
    assert add_competitor(tclient).status_code == 201
    assert add_competitor(tclient).status_code == 200  # already tracked
    assert tclient.post("/api/competitors", json={"channelUrl": "https://twitter.com/x"}).status_code == 400
    assert recorder.total("clipremix.competitors.added") == 1


def test_videos_fetched_success_and_fetch_duration(tclient, recorder):
    first_video(tclient)
    assert recorder.total("clipremix.videos.fetched", outcome="success") == 1
    assert recorder.total("clipremix.videos.fetched", outcome="empty") == 0
    assert recorder.total("clipremix.videos.fetched", outcome="error") == 0
    assert recorder.total("clipremix.fetch.duration", outcome="success") == 1
    [(attrs, point)] = recorder.points("clipremix.fetch.duration")
    assert attrs == {"outcome": "success"} and point.sum >= 0
    # An unknown competitor is not a fetch.
    assert tclient.post("/api/competitors/nope/videos/fetch").status_code == 404
    assert recorder.total("clipremix.videos.fetched") == 1


class EmptySource(SampleSource):
    def fetch_videos(self, competitor):
        return []


class FailingSource(SampleSource):
    def fetch_videos(self, competitor):
        raise YouTubeError("YouTube is down")


def test_videos_fetched_empty_outcome(make_client, recorder):
    client = make_client(EmptySource())
    comp = add_competitor(client).json()
    assert client.post(f"/api/competitors/{comp['id']}/videos/fetch").status_code == 502
    assert recorder.total("clipremix.videos.fetched", outcome="empty") == 1
    assert recorder.total("clipremix.fetch.duration", outcome="empty") == 1
    assert recorder.total("clipremix.videos.fetched", outcome="success") == 0


def test_videos_fetched_error_outcome(make_client, recorder):
    client = make_client(FailingSource())
    comp = add_competitor(client).json()
    assert client.post(f"/api/competitors/{comp['id']}/videos/fetch").status_code == 502
    assert recorder.total("clipremix.videos.fetched", outcome="error") == 1
    assert recorder.total("clipremix.fetch.duration", outcome="error") == 1


def test_remixes_created_counts_only_new_remixes(tclient, recorder):
    video = first_video(tclient)
    assert tclient.post(f"/api/videos/{video['id']}/remix").status_code == 201
    assert tclient.post(f"/api/videos/{video['id']}/remix").status_code == 200  # existing
    assert tclient.post("/api/videos/nope/remix").status_code == 404
    assert recorder.total("clipremix.remixes.created") == 1
    assert recorder.total("clipremix.remix.failures") == 0


def test_plan_items_added_counts_only_new_items(tclient, recorder):
    video = first_video(tclient)
    assert tclient.post("/api/content-plan", json={"videoId": video["id"]}).status_code == 201
    assert tclient.post("/api/content-plan", json={"videoId": video["id"]}).status_code == 200
    assert tclient.post("/api/content-plan", json={"videoId": "nope"}).status_code == 404
    assert recorder.total("clipremix.plan_items.added") == 1


def boom(*args, **kwargs):
    raise RuntimeError("database exploded")


def test_remix_failures_count_unexpected_errors_only(tclient, recorder, monkeypatch):
    video = first_video(tclient)
    remix = tclient.post(f"/api/videos/{video['id']}/remix").json()
    # 4xx are not failures.
    assert tclient.post("/api/videos/nope/remix").status_code == 404
    assert tclient.post("/api/remixes/nope/apply-template", json={"template": "default"}).status_code == 404
    assert tclient.patch("/api/remixes/nope", json={"title": "x"}).status_code == 404
    assert recorder.total("clipremix.remix.failures") == 0

    other = first_video_of_other_channel(tclient)
    monkeypatch.setattr(store, "add_remix", boom)
    assert tclient.post(f"/api/videos/{other['id']}/remix").status_code == 500
    assert recorder.total("clipremix.remix.failures") == 1
    assert recorder.total("clipremix.remixes.created") == 1  # the earlier remix only

    monkeypatch.setattr(store, "apply_remix_template", boom)
    assert tclient.post(f"/api/remixes/{remix['id']}/apply-template", json={"template": "default"}).status_code == 500
    assert recorder.total("clipremix.remix.failures") == 2

    monkeypatch.setattr(store, "update_remix", boom)
    assert tclient.patch(f"/api/remixes/{remix['id']}", json={"hook": "x"}).status_code == 500
    assert recorder.total("clipremix.remix.failures") == 3


def first_video_of_other_channel(client):
    comp = add_competitor(client, "other").json()
    return client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]


def test_metric_attributes_are_bounded(tclient, recorder):
    video = first_video(tclient)
    tclient.post(f"/api/videos/{video['id']}/remix")
    tclient.post("/api/content-plan", json={"videoId": video["id"]})
    names = {
        "clipremix.competitors.added",
        "clipremix.videos.fetched",
        "clipremix.remixes.created",
        "clipremix.remix.failures",
        "clipremix.plan_items.added",
        "clipremix.fetch.duration",
        "clipremix.competitors",
    }  # clipremix.remix.ai_writes has its own test (outcome and model_role)
    for name in names:
        for attrs, _ in recorder.points(name):
            assert set(attrs) <= {"outcome"}
            assert all(v in telemetry.FETCH_OUTCOMES for v in attrs.values())


def test_competitors_gauge_reads_the_database(tclient, recorder):
    assert recorder.total("clipremix.competitors") == 0
    add_competitor(tclient, "one")
    add_competitor(tclient, "two")
    assert recorder.total("clipremix.competitors") == 2
    comp = add_competitor(tclient, "three").json()
    tclient.delete(f"/api/competitors/{comp['id']}")
    assert recorder.total("clipremix.competitors") == 2


def test_gauge_callback_database_error_is_caught(database_url, monkeypatch):
    rec = Recorder()
    monkeypatch.setattr(store, "count_competitors", boom)
    app = create_app(database_url, video_source=SampleSource(), telemetry=rec.telemetry)
    with TestClient(app):
        rec.reader.get_metrics_data()  # must not raise
        assert rec.points("clipremix.competitors") == []  # no data point, no exception


# ---- shutdown and unreachable endpoint -------------------------------------------


def test_shutdown_is_idempotent_and_runs_with_the_app(database_url):
    rec = Recorder()
    app = create_app(database_url, video_source=SampleSource(), telemetry=rec.telemetry)
    with TestClient(app) as client:
        add_competitor(client)
    assert rec.telemetry._closed is True
    rec.telemetry.shutdown()  # a second call is harmless


def unused_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_unreachable_endpoint_does_not_break_or_slow_requests(database_url, monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", f"http://127.0.0.1:{unused_port()}")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Basic%20abc")
    app = create_app(database_url, video_source=SampleSource())
    assert app.state.telemetry.enabled is True
    started = time.perf_counter()
    with TestClient(app) as client:
        for _ in range(5):
            assert add_competitor(client, "unreachable").status_code in (200, 201)
            assert client.get("/api/competitors").status_code == 200
        assert time.perf_counter() - started < 3
        shutdown_started = time.perf_counter()
    assert time.perf_counter() - shutdown_started < 15


# ---- AI writes (Gemini) ----------------------------------------------------------

FAKE_GEMINI_KEY = "FAKE-gemini-key-for-telemetry-0000"


class ScriptedGemini:
    def __init__(self, *script):
        self.script = list(script)

    def generate(self, api_key, model, body, timeout):
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def gemini_answer(**overrides):
    fields = {"title": "T", "hook": "H", "script": "1. a\n2. b\n3. c", "cta": "C", **overrides}
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(fields)}]}}]}


def ai_client(database_url, recorder, gemini):
    app = create_app(database_url, video_source=SampleSource(), telemetry=recorder.telemetry, gemini=gemini)
    return app


@pytest.mark.parametrize(
    "script, key, outcome, role",
    [
        ([gemini_answer()], FAKE_GEMINI_KEY, "success", "primary"),
        ([ai_writer.GeminiHttpError(503), gemini_answer()], FAKE_GEMINI_KEY, "success", "fallback"),
        ([], "", "not_configured", "none"),
        ([ai_writer.GeminiHttpError(429)] * 2, FAKE_GEMINI_KEY, "quota", "fallback"),
        ([ai_writer.GeminiHttpError(503), ai_writer.GeminiTimeout("t")], FAKE_GEMINI_KEY, "upstream_error", "fallback"),
        ([ai_writer.GeminiHttpError(401)], FAKE_GEMINI_KEY, "upstream_error", "primary"),
        ([gemini_answer(cta=""), gemini_answer(script="one line")], FAKE_GEMINI_KEY, "invalid_output", "fallback"),
    ],
    ids=["success", "fallback", "not_configured", "quota", "upstream_error", "rejected_key", "invalid_output"],
)
def test_ai_writes_are_counted_once_by_outcome_and_model_role(
    database_url, recorder, monkeypatch, script, key, outcome, role
):
    monkeypatch.setenv("GEMINI_API_KEY", key)
    with TestClient(ai_client(database_url, recorder, ScriptedGemini(*script))) as client:
        video = first_video(client)
        remix = client.post(f"/api/videos/{video['id']}/remix").json()
        res = client.post(f"/api/remixes/{remix['id']}/ai-draft", json={"voice": "custom", "customVoice": "Me"})
        assert res.status_code in (200, 429, 502, 503)
        # Invalid requests and missing remixes are not AI writes.
        client.post(f"/api/remixes/{remix['id']}/ai-draft", json={"voice": "custom"})
        client.post("/api/remixes/nope/ai-draft", json={"voice": "storyteller"})
    points = recorder.points("clipremix.remix.ai_writes")
    assert [(attrs, p.value) for attrs, p in points] == [({"outcome": outcome, "model_role": role}, 1)]
    assert outcome in telemetry.AI_WRITE_OUTCOMES and role in telemetry.AI_MODEL_ROLES


@pytest.mark.parametrize("limit, successes", [("1", 1), ("0", 0)], ids=["limit-reached", "turned-off"])
def test_a_request_refused_by_the_daily_limit_is_counted_as_daily_limit(
    database_url, recorder, monkeypatch, limit, successes
):
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_GEMINI_KEY)
    monkeypatch.setenv("AI_WRITES_PER_DAY", limit)
    with TestClient(ai_client(database_url, recorder, ScriptedGemini(gemini_answer()))) as client:
        video = first_video(client)
        remix = client.post(f"/api/videos/{video['id']}/remix").json()
        url = f"/api/remixes/{remix['id']}/ai-draft"
        for _ in range(successes):
            assert client.post(url, json={"voice": "storyteller"}).status_code == 200
        assert client.post(url, json={"voice": "storyteller"}).status_code == 429
    points = recorder.points("clipremix.remix.ai_writes")
    expected = [({"outcome": "daily_limit", "model_role": "none"}, 1)]
    if successes:
        expected.insert(0, ({"outcome": "success", "model_role": "primary"}, 1))
    assert sorted((tuple(sorted(a.items())), p.value) for a, p in points) == sorted(
        (tuple(sorted(a.items())), v) for a, v in expected
    )
    assert "daily_limit" in telemetry.AI_WRITE_OUTCOMES


def test_the_gemini_key_is_not_in_any_span_or_log(database_url, recorder, monkeypatch):
    """The real HTTP client against a local stand-in for Gemini: the traced URL has no key."""
    seen = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            seen["key"] = self.headers.get("x-goog-api-key")
            seen["path"] = self.path
            self.rfile.read(int(self.headers["Content-Length"]))
            body = json.dumps(gemini_answer()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.delenv("no_proxy", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_GEMINI_KEY)
    monkeypatch.setattr(ai_writer, "ENDPOINT", f"http://127.0.0.1:{server.server_port}/v1beta/models/{{model}}:generateContent")
    try:
        with TestClient(ai_client(database_url, recorder, ai_writer.HttpGeminiClient())) as client:
            video = first_video(client)
            remix = client.post(f"/api/videos/{video['id']}/remix").json()
            res = client.post(f"/api/remixes/{remix['id']}/ai-draft", json={"voice": "storyteller"})
    finally:
        server.shutdown()
    assert res.status_code == 200 and FAKE_GEMINI_KEY not in res.text
    assert seen["key"] == FAKE_GEMINI_KEY and FAKE_GEMINI_KEY not in seen["path"]
    spans = recorder.spans.get_finished_spans()
    assert any(s.kind.name == "CLIENT" and "POST" in s.name for s in spans)
    for span in spans:
        assert FAKE_GEMINI_KEY not in json.dumps({k: str(v) for k, v in (span.attributes or {}).items()})
        assert FAKE_GEMINI_KEY not in span.name
    for record in recorder.logs.get_finished_logs():
        assert FAKE_GEMINI_KEY not in str(record.log_record.body)
        assert FAKE_GEMINI_KEY not in str(record.log_record.attributes)
