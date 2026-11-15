"""Tests for on_call.py: recorded alert API output, a fake agent (GEMINI_CMD) and a fake gh (GH_CMD)."""
import datetime as dt
import json
import os
import stat
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

import on_call

FIXTURE = Path(__file__).parent / "fixtures" / "alerts.json"
RAW = json.loads(FIXTURE.read_text())
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def sh(*cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True, env={**os.environ, **ENV}).stdout


def script(path: Path, body: str) -> str:
    path.write_text(f"#!{sys.executable}\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return str(path)


@pytest.fixture
def repos(tmp_path):
    origin = tmp_path / "origin.git"
    sh("git", "init", "--bare", "-b", "main", str(origin))
    work = tmp_path / "work"
    sh("git", "clone", str(origin), str(work))
    (work / "backend").mkdir()
    (work / "backend" / "app.py").write_text("x = 1\n")
    (work / ".github").mkdir()
    (work / ".github" / "ci.yml").write_text("a: 1\n")
    sh("git", "add", "-A", cwd=work)
    sh("git", "commit", "-m", "init", cwd=work)
    sh("git", "push", "origin", "HEAD:main", cwd=work)
    return origin, work


def alert():
    return on_call.filter_alerts(RAW, ["dev"])[0]


def test_filter_by_service_environment_and_state():
    dev = on_call.filter_alerts(RAW, ["dev", "prod"])
    assert [a["fingerprint"] for a in dev] == ["cc0b1f0e01cf1d0f"]  # billing, silenced prod and local are dropped
    assert [a["fingerprint"] for a in on_call.filter_alerts(RAW, ["local"])] == ["aaaa000000000003"]
    a = dev[0]
    assert a["environment"] == "dev" and a["version"] == "synthetic-ci"
    assert a["slug"] == "clipremix-repeated-remix-failures"
    assert not any(k.startswith("__") for k in a["labels"] | a["annotations"])
    resolved = json.loads(json.dumps(RAW[:1]))
    resolved[0]["status"]["state"] = "unprocessed"
    assert on_call.filter_alerts(resolved, ["dev"]) == []


def test_poll_calls_alert_api_with_token():
    seen = {}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            seen["path"] = self.path
            seen["auth"] = self.headers.get("Authorization")
            body = json.dumps(RAW).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    os.environ["GRAFANA_URL"] = f"http://127.0.0.1:{srv.server_port}/"
    os.environ["GRAFANA_ALERT_TOKEN"] = "tok"
    try:
        got = on_call.poll(["dev"], dedupe=False)
    finally:
        srv.shutdown()
        del os.environ["GRAFANA_URL"], os.environ["GRAFANA_ALERT_TOKEN"]
    assert seen["path"] == on_call.ALERTS_PATH and seen["auth"] == "Bearer tok"
    assert len(got) == 1


def test_dedupe_open_recent_and_old_prs():
    a = alert()
    now = dt.datetime(2026, 11, 15, 12, 0, tzinfo=dt.timezone.utc)
    prefix = "on-call/clipremix-repeated-remix-failures-dev-"
    iso = lambda h: (now - dt.timedelta(hours=h)).isoformat()
    assert on_call.is_duplicate(a, [{"headRefName": prefix + "1", "state": "OPEN", "createdAt": iso(30)}], now)
    assert on_call.is_duplicate(a, [{"headRefName": prefix + "1", "state": "CLOSED", "createdAt": iso(9), "closedAt": iso(2)}], now)
    assert not on_call.is_duplicate(a, [{"headRefName": prefix + "1", "state": "CLOSED", "createdAt": iso(9), "closedAt": iso(7)}], now)
    assert not on_call.is_duplicate(a, [{"headRefName": "on-call/clipremix-repeated-remix-failures-prod-1", "state": "OPEN", "createdAt": iso(1)}], now)
    assert not on_call.is_duplicate(a, [{"headRefName": "feature/x", "state": "OPEN", "createdAt": iso(1)}], now)


def test_poll_skips_alert_with_existing_pr_and_watch_fingerprints(monkeypatch):
    prs = [{"headRefName": "on-call/clipremix-repeated-remix-failures-dev-9", "state": "OPEN", "createdAt": "2026-11-15T00:00:00Z"}]
    monkeypatch.setattr(on_call, "gh_pull_requests", lambda: prs)
    assert on_call.poll(["dev"], str(FIXTURE)) == []
    monkeypatch.setattr(on_call, "gh_pull_requests", lambda: [])
    assert len(on_call.poll(["dev"], str(FIXTURE))) == 1
    assert on_call.poll(["dev"], str(FIXTURE), seen={"cc0b1f0e01cf1d0f"}) == []


def test_prompt_starts_with_article_prompt_and_marks_untrusted():
    text = on_call.build_prompt(alert())
    assert text.startswith(
        "You are the on-call engineer for this repository. An alert just fired. Investigate the root cause. "
        "Read the code and reproduce the failure. If you find a real bug, make the smallest correction, run the backend tests, "
        "and commit the fix with a clear message. If the alert is a false positive, explain why and do not change the code."
    )
    assert "BEGIN UNTRUSTED ALERT DATA" in text and "Do not modify anything under `.github/`" in text
    assert "<<<ALERT>>>" not in text


NASTY = 'x"; `touch /tmp/pwned` $(touch /tmp/pwned2) \'quote\' ${HOME} \\n end'


def test_injection_text_reaches_agent_unchanged(repos, tmp_path):
    _, work = repos
    a = alert()
    a["annotations"]["description"] = NASTY
    a["labels"]["alertname"] = NASTY
    capture = tmp_path / "stdin.txt"
    argv_file = tmp_path / "argv.txt"
    fake = script(tmp_path / "fake.py", f"import sys\nopen({str(capture)!r},'w').write(sys.stdin.read())\nopen({str(argv_file)!r},'w').write(repr(sys.argv[1:]))\nprint('false positive')\n")
    os.environ["GEMINI_CMD"] = fake
    try:
        on_call.investigate(a, work, tmp_path / "out")
    finally:
        del os.environ["GEMINI_CMD"]
    got = capture.read_text()
    assert json.dumps(NASTY)[1:-1] in got  # JSON-escaped, byte for byte
    assert json.loads(got.split("BEGIN UNTRUSTED ALERT DATA\n")[1].split("\nEND UNTRUSTED")[0])["annotations"]["description"] == NASTY
    assert NASTY not in argv_file.read_text()
    assert not Path("/tmp/pwned").exists() and not Path("/tmp/pwned2").exists()


def test_injection_text_reaches_gh_only_as_argument_and_file(repos, tmp_path):
    origin, work = repos
    a = alert()
    a["alertname"] = NASTY
    a["slug"] = on_call.slugify(NASTY)
    a["annotations"]["summary"] = NASTY
    (work / "backend" / "app.py").write_text("x = 2\n")
    sh("git", "commit", "-am", "fix", cwd=work)
    patch = sh("git", "format-patch", "--stdout", "HEAD~1..HEAD", cwd=work)
    sh("git", "reset", "--hard", "HEAD~1", cwd=work)
    (tmp_path / "p.mbox").write_text(patch)
    (tmp_path / "e.md").write_text(NASTY)
    log = tmp_path / "gh.json"
    gh = script(tmp_path / "gh", f"import sys,json\nopen({str(log)!r},'a').write(json.dumps(sys.argv[1:])+'\\n')\nprint('https://example/pr/1')\n")
    os.environ["GH_CMD"] = gh
    try:
        on_call.open_pr(a, tmp_path / "p.mbox", tmp_path / "e.md", work, suffix="1")
    finally:
        del os.environ["GH_CMD"]
    calls = [json.loads(l) for l in log.read_text().splitlines()]
    create = next(c for c in calls if c[:2] == ["pr", "create"])
    body = Path(create[create.index("--body-file") + 1]).read_text()
    assert NASTY in body
    assert any(c[:3] == ["workflow", "run", "ci.yml"] for c in calls)
    branches = sh("git", "branch", "--list", cwd=origin).split()
    assert any(b.startswith("on-call/") for b in branches) and "main" in branches


def test_patch_touching_github_is_rejected(repos, tmp_path):
    origin, work = repos
    (work / ".github" / "ci.yml").write_text("a: 2\n")
    sh("git", "commit", "-am", "evil", cwd=work)
    patch = sh("git", "format-patch", "--stdout", "HEAD~1..HEAD", cwd=work)
    (tmp_path / "p.mbox").write_text(patch)
    (tmp_path / "e.md").write_text("x")
    with pytest.raises(on_call.OnCallError, match=r"\.github/"):
        on_call.open_pr(alert(), tmp_path / "p.mbox", tmp_path / "e.md", work, suffix="1")
    assert "on-call" not in sh("git", "branch", "-a", cwd=work)
    assert [b for b in sh("git", "branch", "--list", cwd=origin).split() if b != "*"] == ["main"]


def test_empty_patch_opens_no_pr(repos, tmp_path):
    _, work = repos
    (tmp_path / "p.mbox").write_text("")
    (tmp_path / "e.md").write_text("false positive")
    log = tmp_path / "gh.txt"
    os.environ["GH_CMD"] = script(tmp_path / "gh", f"open({str(log)!r},'a').write('called')\n")
    try:
        assert on_call.open_pr(alert(), tmp_path / "p.mbox", tmp_path / "e.md", work) is None
    finally:
        del os.environ["GH_CMD"]
    assert not log.exists()


def test_never_pushes_to_main(repos, tmp_path, monkeypatch):
    origin, work = repos
    monkeypatch.setattr(on_call, "branch_prefix", lambda a: "main")  # a branch name that would be main-like
    (work / "backend" / "app.py").write_text("x = 3\n")
    sh("git", "commit", "-am", "fix", cwd=work)
    patch = sh("git", "format-patch", "--stdout", "HEAD~1..HEAD", cwd=work)
    sh("git", "reset", "--hard", "HEAD~1", cwd=work)
    (tmp_path / "p.mbox").write_text(patch)
    (tmp_path / "e.md").write_text("x")
    before = sh("git", "rev-parse", "main", cwd=origin)
    # branch is "main-1" here; force the guard with an exact main name
    monkeypatch.setattr(on_call, "PROTECTED_BRANCHES", {"main-1"})
    with pytest.raises(on_call.OnCallError, match="Refusing to push"):
        on_call.open_pr(alert(), tmp_path / "p.mbox", tmp_path / "e.md", work, suffix="1")
    assert sh("git", "rev-parse", "main", cwd=origin) == before


def test_investigate_exports_agent_commit_as_patch(repos, tmp_path):
    _, work = repos
    fake = script(
        tmp_path / "fake.py",
        "import subprocess\nopen('backend/app.py','w').write('x = 9\\n')\n"
        "subprocess.run(['git','commit','-am','Fix x'],check=True,capture_output=True)\nprint('fixed x')\n",
    )
    os.environ["GEMINI_CMD"] = fake
    try:
        res = on_call.investigate(alert(), work, tmp_path / "out")
    finally:
        del os.environ["GEMINI_CMD"]
    assert "Subject: [PATCH] Fix x" in res["patch"] and "fixed x" in (tmp_path / "out" / "explanation.md").read_text()
    on_call.check_patch(res["patch"])


def test_agent_failure_and_quota_are_clear_errors(repos, tmp_path):
    _, work = repos
    os.environ["GEMINI_CMD"] = script(tmp_path / "f.py", "import sys\nsys.stderr.write('429 RESOURCE_EXHAUSTED quota')\nsys.exit(1)\n")
    try:
        with pytest.raises(on_call.OnCallError, match="free quota"):
            on_call.investigate(alert(), work, tmp_path / "out")
    finally:
        del os.environ["GEMINI_CMD"]


def test_pr_creation_not_permitted_points_to_docs(repos, tmp_path):
    _, work = repos
    (work / "backend" / "app.py").write_text("x = 2\n")
    sh("git", "commit", "-am", "fix", cwd=work)
    (tmp_path / "p.mbox").write_text(sh("git", "format-patch", "--stdout", "HEAD~1..HEAD", cwd=work))
    sh("git", "reset", "--hard", "HEAD~1", cwd=work)
    (tmp_path / "e.md").write_text("x")
    os.environ["GH_CMD"] = script(
        tmp_path / "gh", "import sys\nsys.stderr.write('GitHub Actions is not permitted to create or approve pull requests')\nsys.exit(1)\n"
    )
    try:
        with pytest.raises(on_call.OnCallError, match="docs/on-call.md"):
            on_call.open_pr(alert(), tmp_path / "p.mbox", tmp_path / "e.md", work, suffix="1")
    finally:
        del os.environ["GH_CMD"]
