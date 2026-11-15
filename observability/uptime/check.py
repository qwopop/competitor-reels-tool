"""Uptime check of a deployed ClipRemix service: GET <url>/api/health, patient enough for a Render free cold start.

    python3 -I observability/uptime/check.py URL [URL ...] [--attempts 6] [--timeout 100] [--pause 30]

A Render free web service sleeps after 15 minutes without traffic and needs about a minute to wake up on the
next request (the first requests then hang or return 502/503). That is normal, so the check is patient:
each attempt waits up to --timeout seconds, a failed attempt is retried after --pause seconds, and the URL is
reported DOWN only when no attempt returned HTTP 200 with {"status": "ok", "database": "ok"}, which with the
defaults is after roughly 6 x 100 s + 5 x 30 s = 12 minutes at most. A success after a slow or failed first
attempt is reported as "woke from sleep" and is not a failure. The check never sets a header that could
identify a person and prints no secret. Exit code 1 when any URL is DOWN. Standard library only.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def probe(url, timeout):
    """One attempt. Returns (ok, seconds, detail)."""
    started = time.monotonic()
    req = urllib.request.Request(url.rstrip("/") + "/api/health", headers={"User-Agent": "clipremix-uptime-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = json.loads(res.read().decode() or "null")
            took = time.monotonic() - started
            if res.status == 200 and isinstance(body, dict) and body.get("status") == "ok" and body.get("database") == "ok":
                return True, took, f"HTTP 200, version {body.get('version')}, environment {body.get('environment')}"
            return False, took, f"HTTP {res.status} with unexpected body {str(body)[:120]}"
    except urllib.error.HTTPError as err:
        return False, time.monotonic() - started, f"HTTP {err.code}"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as err:
        return False, time.monotonic() - started, f"{type(err).__name__}: {err}"


def check(url, attempts, timeout, pause, sleep=time.sleep, probe_fn=probe, log=print):
    """Returns (state, attempts_used): state is 'up', 'woke' (needed more than one attempt or over 10 s) or 'down'."""
    for n in range(1, attempts + 1):
        ok, took, detail = probe_fn(url, timeout)
        log(f"{url} attempt {n}/{attempts}: {'ok' if ok else 'not ok'} after {took:.1f}s ({detail})")
        if ok:
            return ("up" if n == 1 and took < 10 else "woke"), n
        if n < attempts:
            sleep(pause)
    return "down", attempts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--attempts", type=int, default=6)
    ap.add_argument("--timeout", type=float, default=100)
    ap.add_argument("--pause", type=float, default=30)
    args = ap.parse_args(argv)
    down = []
    for url in args.urls:
        state, used = check(url, args.attempts, args.timeout, args.pause)
        print(f"RESULT {url}: {state.upper()} (attempts used: {used})", flush=True)
        if state == "woke":
            print(f"::notice::{url} was asleep or slow and answered after {used} attempt(s); a cold start is not an incident.")
        if state == "down":
            print(f"::error::{url} did not answer /api/health with ok in {args.attempts} attempts")
            down.append(url)
    return 1 if down else 0


if __name__ == "__main__":
    sys.exit(main())
