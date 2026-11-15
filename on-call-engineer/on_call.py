#!/usr/bin/env python3
"""On-call engineer: poll Grafana alerts, wake a headless coding agent, open a pull request.

Standard library only. Subcommands: poll, investigate, open-pr, watch. See docs/on-call.md.

Alert text is never put into a shell command: it reaches the agent through a file piped to its
stdin and reaches `gh` through a body file and argument lists (subprocess without a shell).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALERTS_PATH = "/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false"
DEDUPE_HOURS = 6
SERVICE = "clipremix"
DEFAULT_MODEL = "gemini-3.5-flash"
PROTECTED_BRANCHES = {"main", "master"}
DOCS = "docs/on-call.md"
IDENTITY = {
    "GIT_AUTHOR_NAME": "on-call-engineer",
    "GIT_AUTHOR_EMAIL": "on-call-engineer@users.noreply.github.com",
    "GIT_COMMITTER_NAME": "on-call-engineer",
    "GIT_COMMITTER_EMAIL": "on-call-engineer@users.noreply.github.com",
}


class OnCallError(Exception):
    """A failure with a message fit for an ::error:: line."""


def error(msg: str) -> None:
    print(f"::error::{msg}", file=sys.stderr, flush=True)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "alert"


def branch_prefix(alert: dict) -> str:
    return f"on-call/{alert['slug']}-{slugify(alert['environment'])}"


# ---- poll ---------------------------------------------------------------------------------


def normalize(raw: dict) -> dict:
    labels = {k: str(v) for k, v in (raw.get("labels") or {}).items() if not k.startswith("__")}
    annotations = {k: str(v) for k, v in (raw.get("annotations") or {}).items() if not k.startswith("__")}
    name = labels.get("alertname", "unknown")
    env = labels.get("environment") or labels.get("deployment_environment", "unknown")
    return {
        "alertname": name,
        "slug": slugify(name),
        "environment": env,
        "version": labels.get("version") or labels.get("service_version", ""),
        "fingerprint": str(raw.get("fingerprint", "")),
        "startsAt": raw.get("startsAt", ""),
        "dashboard_url": annotations.get("dashboard_url", ""),
        "labels": labels,
        "annotations": annotations,
    }


def filter_alerts(raw_alerts: list, environments: list[str]) -> list[dict]:
    """Keep firing clipremix alerts of the chosen environments. Resolved, silenced, inhibited and other services are dropped."""
    out = []
    for raw in raw_alerts:
        if not isinstance(raw, dict):
            continue
        status = (raw.get("status") or {}).get("state", "active")
        if status != "active" or (raw.get("status") or {}).get("silencedBy") or (raw.get("status") or {}).get("inhibitedBy"):
            continue
        alert = normalize(raw)
        if alert["labels"].get("service") != SERVICE or alert["environment"] not in environments:
            continue
        out.append(alert)
    return out


def fetch_alerts(url: str, token: str) -> list:
    req = urllib.request.Request(url.rstrip("/") + ALERTS_PATH)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except Exception as exc:  # network, HTTP status, bad JSON
        raise OnCallError(f"Could not read alerts from {url}: {type(exc).__name__}: {exc}") from exc
    if not isinstance(data, list):
        raise OnCallError("The alert API did not return a JSON array.")
    return data


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, **kw)


def gh_pull_requests() -> list[dict]:
    cmd = os.environ.get("GH_CMD", "gh")
    res = run([cmd, "pr", "list", "--state", "all", "--limit", "200", "--json", "headRefName,state,createdAt,closedAt"])
    if res.returncode != 0:
        raise OnCallError(f"`gh pr list` failed, cannot check for duplicates: {res.stderr.strip()}")
    return json.loads(res.stdout or "[]")


def parse_time(text: str) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def is_duplicate(alert: dict, prs: list[dict], now: dt.datetime | None = None) -> bool:
    """A PR with branch prefix on-call/<alertname>-<environment> that is open, or closed within 6 hours."""
    now = now or dt.datetime.now(dt.timezone.utc)
    prefix = branch_prefix(alert) + "-"
    for pr in prs:
        if not str(pr.get("headRefName", "")).startswith(prefix):
            continue
        if str(pr.get("state", "")).upper() == "OPEN":
            return True
        when = parse_time(pr.get("closedAt") or "") or parse_time(pr.get("createdAt") or "")
        if when and now - when < dt.timedelta(hours=DEDUPE_HOURS):
            return True
    return False


def poll(environments, alerts_file=None, dedupe=True, seen=None) -> list[dict]:
    if alerts_file:
        raw = json.loads(Path(alerts_file).read_text())
    else:
        url = os.environ.get("GRAFANA_URL", "")
        if not url:
            raise OnCallError("GRAFANA_URL is not set.")
        raw = fetch_alerts(url, os.environ.get("GRAFANA_ALERT_TOKEN", ""))
    alerts = filter_alerts(raw, environments)
    if seen is not None:
        alerts = [a for a in alerts if a["fingerprint"] not in seen]
    if alerts and dedupe:
        prs = gh_pull_requests()
        alerts = [a for a in alerts if not is_duplicate(a, prs)]
    return alerts


# ---- investigate --------------------------------------------------------------------------


def build_prompt(alert: dict) -> str:
    template = (HERE / "prompt.md").read_text()
    details = json.dumps(
        {k: alert[k] for k in ("alertname", "environment", "version", "fingerprint", "startsAt", "dashboard_url", "labels", "annotations")},
        indent=2,
        ensure_ascii=True,
    )
    assert template.count("<<<ALERT>>>") == 1
    return template.replace("<<<ALERT>>>", details)


def git(repo: Path, *args: str, check=True) -> str:
    res = run(["git", "-C", str(repo), *args], env={**os.environ, **IDENTITY})
    if check and res.returncode != 0:
        raise OnCallError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def agent_command() -> list[str]:
    """GEMINI_CMD overrides the agent (tests use a fake). It is split like a shell would, but never run through one."""
    import shlex

    override = os.environ.get("GEMINI_CMD")
    if override:
        return shlex.split(override)
    # The CLI's default model (gemini-2.5-flash) is retired for new API keys, so the model is always explicit.
    model = os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
    return ["gemini", "-m", model, "--approval-mode", "yolo", "--output-format", "text",
            "-p", "Follow the instructions you were given on stdin."]


def investigate(alert: dict, repo: Path, out: Path, timeout: int | None = None) -> dict:
    timeout = timeout or int(os.environ.get("ON_CALL_AGENT_TIMEOUT", "900"))
    out.mkdir(parents=True, exist_ok=True)
    prompt_file = out / "prompt.txt"
    prompt_file.write_text(build_prompt(alert))
    base = git(repo, "rev-parse", "HEAD").strip()
    env = {**os.environ, **IDENTITY, "GEMINI_CLI_TRUST_WORKSPACE": "true", "ON_CALL_ALERT_FILE": str(out / "alert.json")}
    (out / "alert.json").write_text(json.dumps(alert, indent=2))
    try:
        with prompt_file.open() as stdin:
            # stderr goes to a file and is echoed afterwards, so the job log shows what the agent said even on a timeout.
            with (out / "agent-stderr.txt").open("w") as err:
                res = subprocess.run(agent_command(), cwd=repo, stdin=stdin, stdout=subprocess.PIPE, stderr=err, text=True, env=env, timeout=timeout)
            res.stderr = (out / "agent-stderr.txt").read_text()
    except FileNotFoundError as exc:
        raise OnCallError(f"The agent command was not found ({exc}). Install it: npm install -g @google/gemini-cli.") from exc
    except subprocess.TimeoutExpired as exc:
        tail = (out / "agent-stderr.txt").read_text()[-1500:]
        raise OnCallError(f"The agent did not finish within {timeout} seconds. Last stderr: {tail}") from exc
    if res.stderr.strip():
        print("--- agent stderr (tail) ---\n" + res.stderr[-3000:], flush=True)
    if res.returncode != 0:
        text = (res.stderr + res.stdout).lower()
        quota = any(w in text for w in ("quota", "429", "resource_exhausted", "rate limit"))
        hint = "The Gemini free quota looks exhausted (try again later). " if quota else ""
        raise OnCallError(f"The agent failed with exit code {res.returncode}. {hint}Last stderr: {res.stderr.strip()[-500:]}")
    explanation = res.stdout.strip() or "(the agent printed no explanation)"
    (out / "explanation.md").write_text(explanation + "\n")
    # Commit anything the agent left uncommitted, then export all commits since the base.
    if git(repo, "status", "--porcelain").strip():
        git(repo, "add", "-A")
        git(repo, "commit", "-m", f"Fix for alert {alert['alertname']} ({alert['environment']})")
    patch = git(repo, "format-patch", "--stdout", f"{base}..HEAD")
    (out / "patch.mbox").write_text(patch)
    print(f"Patch: {len(patch)} bytes. Explanation: {len(explanation)} characters.", flush=True)
    return {"patch": patch, "explanation": explanation}


# ---- open-pr ------------------------------------------------------------------------------


def patch_files(patch: str) -> list[str]:
    files = []
    for line in patch.splitlines():
        m = re.match(r"^diff --git a/(.*) b/(.*)$", line)
        if m:
            files += [m.group(1), m.group(2)]
        m = re.match(r"^(?:rename|copy) (?:from|to) (.*)$", line)
        if m:
            files.append(m.group(1))
    return files


def check_patch(patch: str) -> None:
    bad = sorted({f for f in patch_files(patch) if f == ".github" or f.startswith(".github/") or "/.github/" in f})
    if bad:
        raise OnCallError(f"Refusing the patch, it touches .github/: {', '.join(bad)}")


def pr_body(alert: dict, explanation: str) -> str:
    fields = "\n".join(f"- `{k}`: {v}" for k, v in sorted(alert["labels"].items()))
    return (
        f"Opened by the on-call engineer agent for a firing alert. A human must review this before merging.\n\n"
        f"## Agent explanation\n\n{explanation}\n\n"
        f"## Alert\n\n- Alert: {alert['alertname']}\n- Environment: {alert['environment']}\n- Version: {alert['version']}\n"
        f"- Fingerprint: `{alert['fingerprint']}`\n- Started: {alert['startsAt']}\n- Dashboard: {alert['dashboard_url']}\n\n"
        f"Labels:\n{fields}\n\nSee `{DOCS}`.\n"
    )


def summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as fh:
            fh.write(text + "\n")


def open_pr(alert: dict, patch_path: Path, explanation_path: Path, repo: Path, dry_run=False, suffix=None) -> str | None:
    patch = patch_path.read_text() if patch_path.exists() else ""
    explanation = explanation_path.read_text().strip() if explanation_path.exists() else ""
    if not patch.strip():
        msg = f"No code change for '{alert['alertname']}' ({alert['environment']}); no pull request. Agent explanation:\n{explanation}"
        print(msg)
        summary(f"### {alert['alertname']} ({alert['environment']}): no change\n\n{explanation}")
        return None
    check_patch(patch)
    suffix = suffix or os.environ.get("GITHUB_RUN_ID") or time.strftime("%Y%m%d%H%M%S", time.gmtime())
    branch = f"{branch_prefix(alert)}-{suffix}"
    if branch in PROTECTED_BRANCHES or branch.split("/")[0] in PROTECTED_BRANCHES:
        raise OnCallError(f"Refusing to push to {branch}.")
    git(repo, "checkout", "-b", branch)
    res = run(["git", "-C", str(repo), "am", "--3way", str(patch_path.resolve())], env={**os.environ, **IDENTITY})
    if res.returncode != 0:
        run(["git", "-C", str(repo), "am", "--abort"])
        raise OnCallError(f"git am could not apply the patch: {res.stderr.strip()}")
    if dry_run:
        print(f"Dry run: patch applies on branch {branch}; nothing pushed, no pull request.")
        summary(f"### Dry run: patch applies on `{branch}`\n\n{explanation}")
        return branch
    body_file = patch_path.parent / "pr-body.md"
    body_file.write_text(pr_body(alert, explanation))
    git(repo, "push", "origin", f"refs/heads/{branch}:refs/heads/{branch}")
    title = f"On-call: {alert['alertname']} ({alert['environment']})"[:200]
    gh = os.environ.get("GH_CMD", "gh")
    res = run([gh, "pr", "create", "--head", branch, "--base", "main", "--title", title, "--body-file", str(body_file)])
    if res.returncode != 0:
        err = res.stderr.strip()
        if "not permitted to create or approve pull requests" in err or "createPullRequest" in err and "permitted" in err:
            raise OnCallError(
                f"GitHub Actions may not create pull requests in this repository. The branch {branch} was pushed and the patch "
                f"is in the job's artifact. Enable Settings, Actions, General, 'Allow GitHub Actions to create and approve pull requests'. See {DOCS}."
            )
        raise OnCallError(f"`gh pr create` failed: {err}")
    pr_url = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else ""
    print(f"Opened {pr_url}")
    summary(f"### Pull request opened\n\n{pr_url}")
    # PRs created with GITHUB_TOKEN do not start CI themselves.
    res = run([gh, "workflow", "run", "ci.yml", "--ref", branch])
    if res.returncode != 0:
        print(f"::warning::Could not start CI on {branch}: {res.stderr.strip()}")
    return pr_url


# ---- watch --------------------------------------------------------------------------------


def handle_one(alert: dict, out_root: Path, dry_run: bool) -> None:
    out = out_root / f"{alert['slug']}-{alert['environment']}-{int(time.time())}"
    work = Path(tempfile.mkdtemp(prefix="on-call-work-"))
    repo_root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    run(["git", "-C", str(repo_root), "worktree", "add", "--detach", str(work / "repo"), "HEAD"])
    repo = work / "repo"
    result = investigate(alert, repo, out)
    open_pr(alert, out / "patch.mbox", out / "explanation.md", repo, dry_run=dry_run, suffix=str(int(time.time())))
    run(["git", "-C", str(repo_root), "worktree", "remove", "--force", str(repo)])
    _ = result


def watch(args) -> None:
    seen: set[str] = set()
    out_root = Path(args.out)
    while True:
        try:
            for alert in poll(args.environments, args.alerts_file, not args.no_dedupe, seen):
                seen.add(alert["fingerprint"])
                print(f"Alert fired: {alert['alertname']} ({alert['environment']})", flush=True)
                try:
                    handle_one(alert, out_root, args.dry_run)
                except OnCallError as exc:
                    error(str(exc))
            else:
                pass
        except OnCallError as exc:
            error(str(exc))
        if args.once:
            return
        time.sleep(args.interval)


# ---- CLI ----------------------------------------------------------------------------------


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--environments", default="dev,prod", help="comma separated, default dev,prod ('local' for the local stack)")

    sp = sub.add_parser("poll", help="print new firing alerts as JSON")
    common(sp)
    sp.add_argument("--alerts-file", help="read this alert API response instead of calling Grafana (fixture)")
    sp.add_argument("--no-dedupe", action="store_true", help="skip the pull request check")
    sp.add_argument("--out-dir", help="also write alert-<n>.json files here")

    sp = sub.add_parser("investigate", help="run the agent for one alert")
    sp.add_argument("--alert", required=True, help="alert JSON file written by poll")
    sp.add_argument("--repo", default=".", help="checkout the agent works in")
    sp.add_argument("--out", required=True, help="directory for patch.mbox and explanation.md")

    sp = sub.add_parser("open-pr", help="apply the patch on a branch and open a pull request")
    sp.add_argument("--alert", required=True)
    sp.add_argument("--patch", required=True)
    sp.add_argument("--explanation", required=True)
    sp.add_argument("--repo", default=".")
    sp.add_argument("--dry-run", action="store_true", help="check and apply the patch locally, push nothing")

    sp = sub.add_parser("watch", help="loop: poll, investigate, open-pr (local use, make on-call)")
    common(sp)
    sp.add_argument("--interval", type=int, default=60)
    sp.add_argument("--alerts-file")
    sp.add_argument("--no-dedupe", action="store_true")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--once", action="store_true", help="one round, then exit")
    sp.add_argument("--out", default=str(Path(tempfile.gettempdir()) / "on-call-out"))

    args = p.parse_args(argv)
    try:
        if args.cmd == "poll":
            envs = [e.strip() for e in args.environments.split(",") if e.strip()]
            alerts = poll(envs, args.alerts_file, not args.no_dedupe)
            if args.out_dir:
                d = Path(args.out_dir)
                d.mkdir(parents=True, exist_ok=True)
                for i, a in enumerate(alerts):
                    (d / f"alert-{i}.json").write_text(json.dumps(a, indent=2))
            print(json.dumps(alerts, indent=2))
        elif args.cmd == "investigate":
            alert = json.loads(Path(args.alert).read_text())
            investigate(alert, Path(args.repo).resolve(), Path(args.out))
        elif args.cmd == "open-pr":
            alert = json.loads(Path(args.alert).read_text())
            open_pr(alert, Path(args.patch), Path(args.explanation), Path(args.repo).resolve(), args.dry_run)
        elif args.cmd == "watch":
            args.environments = [e.strip() for e in args.environments.split(",") if e.strip()]
            watch(args)
    except OnCallError as exc:
        error(str(exc))
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
