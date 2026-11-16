"""OpenTelemetry traces, metrics and logs for the API.

Export is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set: without it `from_env()`
returns a disabled Telemetry, which creates no provider, exporter, background
thread or network connection, and whose instruments are no-ops. With it, the
standard OTEL_EXPORTER_OTLP_* variables (endpoint, headers, timeout) configure
the OTLP HTTP exporters (protocol http/protobuf).

Every Telemetry owns its own providers and installs nothing global, so several
apps in one process (as in the tests) never install providers twice. The only
process-wide piece is the urllib instrumentation, which is re-pointed at the
newest provider.

Every signal carries the resource service.name=clipremix, deployment.environment
(APP_ENV) and service.version (APP_VERSION, see app.config).
"""

import logging
import os
import sys
import threading
import time
from collections.abc import Callable, Iterable, Iterator
from contextlib import contextmanager

from opentelemetry import metrics, trace
from opentelemetry.metrics import CallbackOptions, Observation
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags

from app.config import app_environment, app_version

log = logging.getLogger(__name__)

SERVICE_NAME = "clipremix"
HEALTH_PATH = "/api/health"
FETCH_OUTCOMES = ("success", "empty", "error")
AI_WRITE_OUTCOMES = ("success", "not_configured", "daily_limit", "quota", "upstream_error", "invalid_output")
AI_MODEL_ROLES = ("primary", "fallback", "none")
# Fetches take from milliseconds (sample source) to many seconds (YouTube).
FETCH_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30]
SHUTDOWN_WAIT_SECONDS = 6


def otlp_endpoint() -> str:
    return os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()


def build_resource() -> Resource:
    return Resource.create(
        {
            "service.name": SERVICE_NAME,
            "deployment.environment": app_environment(),
            "service.version": app_version(),
        }
    )


@contextmanager
def untraced() -> Iterator[None]:
    """Run a block whose spans (database calls, for example) must not be recorded.

    A non-sampled parent makes the SDK's default parent-based sampler drop every
    child span. Used for the health check and the gauge callback, which would
    otherwise produce one orphan trace each time they run.
    """
    from opentelemetry.sdk.trace.id_generator import RandomIdGenerator

    ids = RandomIdGenerator()
    parent = SpanContext(
        trace_id=ids.generate_trace_id(),
        span_id=ids.generate_span_id(),
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.DEFAULT),
    )
    with trace.use_span(NonRecordingSpan(parent), end_on_exit=False):
        yield


class Telemetry:
    """The three providers of one app, plus its metric instruments."""

    def __init__(self, tracer_provider=None, meter_provider=None, logger_provider=None):
        self.tracer_provider = tracer_provider
        self.meter_provider = meter_provider
        self.logger_provider = logger_provider
        self.enabled = tracer_provider is not None
        self._log_handlers: list[logging.Handler] = []
        self._closed = False
        self._app = None

        meter = (meter_provider or metrics.NoOpMeterProvider()).get_meter(SERVICE_NAME)
        self._meter = meter
        self.competitors_added = meter.create_counter(
            "clipremix.competitors.added", description="Competitors newly created (HTTP 201)."
        )
        self.videos_fetched = meter.create_counter(
            "clipremix.videos.fetched",
            description="Video fetch requests, by outcome (success, empty, error).",
        )
        self.remixes_created = meter.create_counter(
            "clipremix.remixes.created", description="Remixes newly created (HTTP 201)."
        )
        self.remix_failures = meter.create_counter(
            "clipremix.remix.failures",
            description="Remix create, apply-template or update requests that failed with an unexpected error (HTTP 500).",
        )
        self.remix_ai_writes = meter.create_counter(
            "clipremix.remix.ai_writes",
            description="AI draft requests (Gemini), by outcome and by which model answered or failed last "
            "(model_role: primary, fallback, none).",
        )
        self.plan_items_added = meter.create_counter(
            "clipremix.plan_items.added", description="Content plan items newly created (HTTP 201)."
        )
        self.fetch_duration = meter.create_histogram(
            "clipremix.fetch.duration",
            unit="s",
            description="Seconds spent fetching videos from the video source, by outcome.",
            explicit_bucket_boundaries_advisory=FETCH_BUCKETS,
        )

    # ---- recording helpers used by the routers --------------------------------

    def record_fetch(self, outcome: str, seconds: float) -> None:
        """One fetch request. `outcome` is one of FETCH_OUTCOMES, never an id or URL."""
        self.videos_fetched.add(1, {"outcome": outcome})
        self.fetch_duration.record(seconds, {"outcome": outcome})

    def record_ai_write(self, outcome: str, model_role: str) -> None:
        """One AI draft request. Only these two bounded attributes, never ids, voice text or model names."""
        self.remix_ai_writes.add(1, {"outcome": outcome, "model_role": model_role})

    @contextmanager
    def remix_failure_guard(self) -> Iterator[None]:
        """Count unexpected errors (they become HTTP 500) before they propagate.

        HTTPException (404 and other 4xx) is a handled outcome and is not counted.
        """
        from fastapi import HTTPException

        try:
            yield
        except HTTPException:
            raise
        except Exception:
            self.remix_failures.add(1)
            raise

    # ---- wiring ----------------------------------------------------------------

    def instrument(self, app, engine, session_factory, count_competitors: Callable) -> None:
        """Trace requests, database calls and outgoing HTTP, and observe the competitor count."""
        if not self.enabled:
            return
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.logging.handler import LoggingHandler
        from opentelemetry.instrumentation.sqlalchemy.engine import EngineTracer
        from opentelemetry.instrumentation.urllib import URLLibInstrumentor
        from opentelemetry.semconv.metrics import MetricInstruments
        from opentelemetry.trace import get_tracer

        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=self.tracer_provider,
            meter_provider=self.meter_provider,
            excluded_urls=HEALTH_PATH,
        )
        tracer = get_tracer("opentelemetry.instrumentation.sqlalchemy", tracer_provider=self.tracer_provider)
        connections = self._meter.create_up_down_counter(
            MetricInstruments.DB_CLIENT_CONNECTIONS_USAGE, unit="connections"
        )
        EngineTracer(tracer, engine, connections)

        # Outgoing YouTube calls use urllib (app/youtube.py). The patch is process-wide:
        # re-point it at this app's provider.
        urllib_instrumentor = URLLibInstrumentor()
        if urllib_instrumentor.is_instrumented_by_opentelemetry:
            urllib_instrumentor.uninstrument()
        urllib_instrumentor.instrument(tracer_provider=self.tracer_provider, meter_provider=self.meter_provider)

        def competitors(_options: CallbackOptions) -> Iterable[Observation]:
            try:
                with untraced():
                    db = session_factory()
                    try:
                        return [Observation(count_competitors(db))]
                    finally:
                        db.close()
            except Exception:  # a database error must not break the metric reader
                log.warning("Could not read the competitor count for the gauge", exc_info=True)
                return []

        self._meter.create_observable_gauge(
            "clipremix.competitors",
            callbacks=[competitors],
            description="Competitors currently tracked, read from the database.",
        )

        # Log records go to the OTel handler and still to stdout.
        root = logging.getLogger()
        if not root.handlers:
            stdout = logging.StreamHandler(sys.stdout)
            stdout.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
            root.addHandler(stdout)
            self._log_handlers.append(stdout)
        if root.level == logging.NOTSET or root.level > logging.INFO:
            logging.getLogger("app").setLevel(logging.INFO)
        handler = LoggingHandler(level=logging.INFO, logger_provider=self.logger_provider)
        root.addHandler(handler)
        self._log_handlers.append(handler)
        self._app = app

    def shutdown(self) -> None:
        """Flush and stop all providers. Safe to call twice."""
        if self._closed or not self.enabled:
            return
        self._closed = True
        root = logging.getLogger()
        for handler in self._log_handlers:
            root.removeHandler(handler)
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            if self._app is not None:
                FastAPIInstrumentor.uninstrument_app(self._app)
        except Exception:
            log.debug("Could not uninstrument the app", exc_info=True)
        try:
            from opentelemetry.instrumentation.urllib import URLLibInstrumentor

            URLLibInstrumentor().uninstrument()
        except Exception:
            log.debug("Could not uninstrument urllib", exc_info=True)
        # Shutdown flushes first. With an unreachable collector each provider retries until its
        # export timeout, so stop them in parallel and wait at most SHUTDOWN_WAIT_SECONDS.
        threads = [
            threading.Thread(target=self._stop, args=(provider,), daemon=True)
            for provider in (self.tracer_provider, self.meter_provider, self.logger_provider)
        ]
        for thread in threads:
            thread.start()
        deadline = time.monotonic() + SHUTDOWN_WAIT_SECONDS
        for thread in threads:
            thread.join(max(0.0, deadline - time.monotonic()))

    @staticmethod
    def _stop(provider) -> None:
        try:
            provider.shutdown()
        except Exception:
            log.warning("Telemetry provider did not shut down cleanly", exc_info=True)


def build_telemetry(span_processors=(), metric_readers=(), log_processors=()) -> Telemetry:
    """Providers with the given processors, readers and exporters (OTLP in production, in-memory in tests)."""
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.trace import TracerProvider

    resource = build_resource()
    tracer_provider = TracerProvider(resource=resource)
    for processor in span_processors:
        tracer_provider.add_span_processor(processor)
    meter_provider = MeterProvider(resource=resource, metric_readers=list(metric_readers))
    logger_provider = LoggerProvider(resource=resource)
    for processor in log_processors:
        logger_provider.add_log_record_processor(processor)
    return Telemetry(tracer_provider, meter_provider, logger_provider)


def from_env() -> Telemetry:
    """OTLP over HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is set, otherwise disabled."""
    if not otlp_endpoint():
        return Telemetry()
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    return build_telemetry(
        span_processors=[BatchSpanProcessor(OTLPSpanExporter())],
        metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())],
        log_processors=[BatchLogRecordProcessor(OTLPLogExporter())],
    )


def timer() -> float:
    return time.perf_counter()
