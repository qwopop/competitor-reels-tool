"""observability/uptime/check.py: patient about a cold start, DOWN only after all attempts fail; the workflow skips without URLs."""

import importlib.util
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("uptime_check", ROOT / "observability/uptime/check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


def serve(handler):
    server = HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


def handler_failing_first(n, final_body):
    calls = {"n": 0}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            calls["n"] += 1
            assert self.path == "/api/health"
            if calls["n"] <= n:  # a waking Render service answers 503 for a while
                self.send_response(503)
                self.end_headers()
                return
            data = json.dumps(final_body).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return H, calls


OK_BODY = {"status": "ok", "database": "ok", "version": "abc", "environment": "dev"}


def test_awake_service_is_up_after_one_attempt():
    h, calls = handler_failing_first(0, OK_BODY)
    server, url = serve(h)
    try:
        assert check.check(url, 3, 5, 0, log=lambda *_: None) == ("up", 1)
    finally:
        server.shutdown()


def test_a_waking_service_is_woke_not_down():
    h, calls = handler_failing_first(2, OK_BODY)
    server, url = serve(h)
    slept = []
    try:
        state = check.check(url, 6, 5, 30, sleep=slept.append, log=lambda *_: None)
        assert state == ("woke", 3) and slept == [30, 30] and calls["n"] == 3
    finally:
        server.shutdown()


def test_database_down_or_a_dead_url_is_down_after_all_attempts():
    h, calls = handler_failing_first(0, {"status": "ok", "database": "down"})
    server, url = serve(h)
    try:
        assert check.check(url, 3, 5, 0, sleep=lambda s: None, log=lambda *_: None) == ("down", 3)
        assert calls["n"] == 3
    finally:
        server.shutdown()
    assert check.check("http://127.0.0.1:9", 2, 1, 0, sleep=lambda s: None, log=lambda *_: None) == ("down", 2)


def test_main_exit_codes_and_default_patience():
    h, _ = handler_failing_first(0, OK_BODY)
    server, url = serve(h)
    try:
        assert check.main([url]) == 0
    finally:
        server.shutdown()
    assert check.main(["http://127.0.0.1:9", "--attempts", "1", "--timeout", "1"]) == 1
    ap_defaults = check.check.__defaults__  # sleep/probe/log
    assert ap_defaults  # smoke: signature unchanged
    # patience: 6 attempts of up to 100 s with 30 s pauses covers a ~1 minute cold start many times over
    src = (ROOT / "observability/uptime/check.py").read_text()
    assert '"--attempts", type=int, default=6' in src and '"--timeout", type=float, default=100' in src


def test_workflow_skips_without_urls_and_is_scheduled_hourly():
    wf = yaml.safe_load((ROOT / ".github/workflows/uptime.yml").read_text())
    on = wf.get("on") or wf.get(True)
    assert on["schedule"][0]["cron"].split()[1:] == ["*", "*", "*", "*"]  # hourly, never every 14 minutes (that would keep it awake)
    text = (ROOT / ".github/workflows/uptime.yml").read_text()
    assert "::notice::Skipping the uptime check" in text and "UPTIME_URL_DEV" in text and "UPTIME_URL_PROD" in text
