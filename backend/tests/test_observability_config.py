"""The observability stack and Render settings, checked by parsing the files (no Docker needed)."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def load(path):
    return yaml.safe_load((ROOT / path).read_text())


def test_observability_is_its_own_compose_project():
    compose = load("observability/docker-compose.yaml")
    assert compose["name"] == "clipremix-observability"
    assert compose["name"] != load("docker-compose.yaml")["name"]
    assert set(compose["services"]) == {"otel-collector", "prometheus", "loki", "tempo", "grafana"}
    host_ports = {str(p).split(":")[0] for s in compose["services"].values() for p in s.get("ports", [])}
    assert not host_ports & {"8100", "5432"}
    assert {"4318", "3000", "9090", "3100", "3200"} <= host_ports
    for service in compose["services"].values():
        image = service["image"]
        assert ":" in image and not image.endswith(":latest")  # pinned


def test_every_signal_goes_collector_to_its_backend():
    pipelines = load("observability/otel-collector.yaml")["service"]["pipelines"]
    assert pipelines["metrics"]["exporters"] == ["prometheus"]
    assert pipelines["logs"]["exporters"] == ["otlphttp/loki"]
    assert pipelines["traces"]["exporters"] == ["otlp/tempo"]
    scrape = load("observability/prometheus.yml")["scrape_configs"][0]
    assert scrape["static_configs"][0]["targets"] == ["otel-collector:8889"]


def test_grafana_datasources_are_provisioned_and_anonymous_admin_is_on():
    sources = load("observability/grafana/provisioning/datasources/datasources.yaml")["datasources"]
    assert {s["type"] for s in sources} == {"prometheus", "loki", "tempo"}
    env = load("observability/docker-compose.yaml")["services"]["grafana"]["environment"]
    assert env["GF_AUTH_ANONYMOUS_ENABLED"] == "true" and env["GF_AUTH_ANONYMOUS_ORG_ROLE"] == "Admin"


def test_render_services_take_otlp_settings_from_the_owner():
    for service in load("render.yaml")["services"]:
        env = {e["key"]: e for e in service["envVars"]}
        assert env["OTEL_EXPORTER_OTLP_PROTOCOL"]["value"] == "http/protobuf"
        assert env["OTEL_EXPORTER_OTLP_ENDPOINT"] == {"key": "OTEL_EXPORTER_OTLP_ENDPOINT", "sync": False}
        assert env["OTEL_EXPORTER_OTLP_HEADERS"] == {"key": "OTEL_EXPORTER_OTLP_HEADERS", "sync": False}
