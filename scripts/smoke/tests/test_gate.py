"""Tests the promote gate and the status recorder against a mock `gh` (no network)."""
import json
import os
import stat
import subprocess
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
TAG = "20261115-153000-a1b2c3d"
SHA = "a1b2c3d" + "0" * 33


def mock_gh(tmp_path: Path, statuses=None, exit_code=0, raw=None) -> dict:
    """A fake `gh` that prints canned JSON (or fails) and logs its arguments."""
    log = tmp_path / "gh.log"
    body = raw if raw is not None else json.dumps(statuses or [])
    script = tmp_path / "bin" / "gh"
    script.parent.mkdir(exist_ok=True)
    script.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            echo "$@" >> {log}
            if [ {exit_code} != 0 ]; then exit {exit_code}; fi
            cat <<'JSON'
            {body}
            JSON
            """
        )
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return {**os.environ, "PATH": f"{script.parent}:{os.environ['PATH']}", "REPO": "o/r", "SHA": SHA, "TAG": TAG}


def gate(env):
    r = subprocess.run(["bash", str(HERE / "check_gate.sh")], env=env, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def st(state, tag=TAG, context="dev-smoke"):
    return {"context": context, "state": state, "description": f"{tag} smoke {state}", "target_url": "https://x/run/1"}


def test_pass(tmp_path):
    code, out = gate(mock_gh(tmp_path, [st("success")]))
    assert code == 0 and "dev-smoke passed" in out


def test_fail(tmp_path):
    code, out = gate(mock_gh(tmp_path, [st("failure")]))
    assert code == 1 and "::error::Promotion refused" in out and "did not pass" in out


def test_pending_is_refused(tmp_path):
    code, out = gate(mock_gh(tmp_path, [st("pending")]))
    assert code == 1 and "not finished" in out


def test_missing(tmp_path):
    code, out = gate(mock_gh(tmp_path, [st("success", context="ci/other")]))
    assert code == 1 and "no dev-smoke status" in out
    code, out = gate(mock_gh(tmp_path, []))
    assert code == 1 and "no dev-smoke status" in out


def test_stale_status_for_another_tag(tmp_path):
    code, out = gate(mock_gh(tmp_path, [st("success", tag="20261114-100000-a1b2c3d")]))
    assert code == 1 and "another image" in out


def test_newest_status_wins(tmp_path):
    # GitHub lists newest first: a later failure beats an earlier success, and the reverse.
    assert gate(mock_gh(tmp_path, [st("failure"), st("success")]))[0] == 1
    assert gate(mock_gh(tmp_path, [st("success"), st("failure")]))[0] == 0


def test_tag_prefix_is_not_a_match(tmp_path):
    longer = TAG + "x"
    code, _ = gate(mock_gh(tmp_path, [st("success", tag=longer)]))
    assert code == 1


def test_api_error_fails_closed(tmp_path):
    code, out = gate(mock_gh(tmp_path, exit_code=1))
    assert code == 1 and "could not read" in out


def test_garbage_answer_fails_closed(tmp_path):
    code, out = gate(mock_gh(tmp_path, raw='{"message":"Bad credentials"}'))
    assert code == 1 and "unexpected answer" in out


def test_record_status_posts_context_and_tag(tmp_path):
    env = mock_gh(tmp_path, [])
    env.update(STATE="success", TARGET_URL="https://x/run/9")
    r = subprocess.run(["bash", str(HERE / "record_status.sh")], env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    call = (tmp_path / "gh.log").read_text()
    assert f"repos/o/r/statuses/{SHA}" in call
    assert "state=success" in call and "context=dev-smoke" in call and f"description={TAG} smoke passed" in call


def test_record_status_rejects_unknown_state(tmp_path):
    env = mock_gh(tmp_path, [])
    env.update(STATE="bogus")
    r = subprocess.run(["bash", str(HERE / "record_status.sh")], env=env, capture_output=True, text=True)
    assert r.returncode == 2
