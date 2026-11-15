#!/usr/bin/env python3
"""Plan and run the GHCR image cleanup (issue #85).

Pure selection logic (`select_versions`) plus a small CLI used by
.github/workflows/ghcr-cleanup.yml. Standard library only.

    plan   read /api/health of dev and prod, list package versions, print the
           plan, write plan.json. Never deletes.
    delete read plan.json and delete the planned versions (the workflow only
           calls this when `confirm` is "delete" and dry_run is false).

Safety rules (every one fails closed, i.e. nothing is deleted):
  * dev and prod must both answer /api/health with the right environment and a
    version that is an image tag (YYYYMMDD-HHMMSS-shortsha);
  * those two tags are never deleted, nor the newest N tagged versions;
  * a version carrying any tag that is not an image tag (for example "latest")
    is kept;
  * untagged versions are the per-platform manifests and attestations that a
    kept multi-arch index refers to. They are deleted only if no kept version
    refers to them (read from the registry), and only when older than
    --untagged-days. If a kept manifest cannot be read, nothing is deleted.
"""
import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

TAG_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$")
INDEX_TYPES = (
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
)
ACCEPT = ", ".join(INDEX_TYPES + (
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))


class FailClosed(Exception):
    """Something needed for a safe decision is missing: delete nothing."""


def tags_of(version):
    return list(((version.get("metadata") or {}).get("container") or {}).get("tags") or [])


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_health(name, body):
    """Return the image tag an environment runs, or raise FailClosed."""
    try:
        data = json.loads(body) if isinstance(body, str) else body
    except ValueError:
        raise FailClosed(f"{name}: /api/health did not return JSON")
    if not isinstance(data, dict):
        raise FailClosed(f"{name}: /api/health did not return a JSON object")
    if data.get("environment") != name:
        raise FailClosed(f'{name}: /api/health reports environment "{data.get("environment")}", expected "{name}"')
    tag = data.get("version") or ""
    if not TAG_RE.match(tag):
        raise FailClosed(f'{name}: /api/health reports version "{tag}", which is not an image tag')
    return tag


def select_versions(versions, protected, keep, now, untagged_days=7, referenced_digests=None):
    """Decide what to delete. Returns {"delete": [...], "keep": [(version, reason)]}.

    versions: package-version dicts from the API (id, name=digest, created_at, metadata.container.tags).
    protected: tags that must never be deleted (dev and prod).
    keep: number of newest tagged versions to keep.
    referenced_digests: digests that kept manifests point to, or None if unknown
                        (then no untagged version is deleted).
    """
    if keep < 1:
        raise FailClosed("keep must be at least 1")
    protected = set(protected)
    if not protected or not all(TAG_RE.match(t) for t in protected):
        raise FailClosed("no valid protected tags")
    cutoff = now - timedelta(days=untagged_days)
    tagged = [v for v in versions if tags_of(v)]
    tagged.sort(key=lambda v: (parse_time(v["created_at"]), v["id"]), reverse=True)
    newest = {v["id"] for v in tagged[:keep]}

    kept, doomed = [], []
    for v in sorted(versions, key=lambda v: (parse_time(v["created_at"]), v["id"]), reverse=True):
        tags = tags_of(v)
        if tags:
            if protected & set(tags):
                kept.append((v, "protected: runs in dev or prod"))
            elif v["id"] in newest:
                kept.append((v, f"one of the newest {keep} tagged versions"))
            elif not all(TAG_RE.match(t) for t in tags):
                kept.append((v, "carries a tag that is not an image tag"))
            else:
                doomed.append(v)
        else:
            if referenced_digests is None:
                kept.append((v, "untagged, references unknown"))
            elif v.get("name") in referenced_digests:
                kept.append((v, "untagged, referenced by a kept image"))
            elif parse_time(v["created_at"]) > cutoff:
                kept.append((v, f"untagged, younger than {untagged_days} days"))
            else:
                doomed.append(v)
    return {"delete": doomed, "keep": kept}


# ---------------------------------------------------------------- network ---

def http(url, headers=None, method="GET", timeout=60):
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, dict(resp.headers), resp.read()


def fetch_health(url):
    last = None
    for _ in range(3):
        try:
            _, _, body = http(url.rstrip("/") + "/api/health", timeout=90)
            return body.decode()
        except Exception as exc:  # noqa: BLE001 - any failure means "cannot read"
            last = exc
    raise FailClosed(f"{url}/api/health unreachable: {last}")


class Api:
    def __init__(self, owner, package, token):
        self.owner, self.package, self.token = owner, package, token
        self.base = None

    def _h(self):
        return {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"}

    def list_versions(self):
        """All versions, or None when the package does not exist (yet)."""
        for kind in ("orgs", "users"):
            base = f"https://api.github.com/{kind}/{self.owner}/packages/container/{self.package}/versions"
            out, page = [], 1
            try:
                while True:
                    _, _, body = http(f"{base}?per_page=100&page={page}&state=active", self._h())
                    chunk = json.loads(body)
                    out += chunk
                    if len(chunk) < 100:
                        self.base = base
                        return out
                    page += 1
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    continue
                raise FailClosed(f"listing package versions failed: HTTP {exc.code}")
        return None

    def delete(self, version_id):
        http(f"{self.base}/{version_id}", self._h(), method="DELETE")


def registry_children(owner, package, token, actor, tag):
    """Digests of the manifests an image tag refers to (empty for a single manifest)."""
    repo = f"{owner}/{package}"
    basic = base64.b64encode(f"{actor}:{token}".encode()).decode()
    _, _, body = http(f"https://ghcr.io/token?scope=repository:{repo}:pull&service=ghcr.io",
                      {"Authorization": f"Basic {basic}"})
    bearer = json.loads(body)["token"]
    _, headers, body = http(f"https://ghcr.io/v2/{repo}/manifests/{tag}",
                            {"Authorization": f"Bearer {bearer}", "Accept": ACCEPT})
    doc = json.loads(body)
    return [m["digest"] for m in doc.get("manifests", [])]


def referenced_by(kept_versions, children_of):
    digests = set()
    for v, _ in kept_versions:
        for tag in tags_of(v):
            try:
                digests.update(children_of(tag))
            except Exception as exc:  # noqa: BLE001
                raise FailClosed(f"cannot read the manifest of kept tag {tag}: {exc}")
    return digests


# ------------------------------------------------------------------- CLI ---

def notice(msg):
    print(f"::notice::{msg}")


def write_plan(path, plan, protected, keep):
    doc = {"protected": sorted(protected), "keep": keep,
           "delete": [{"id": v["id"], "digest": v.get("name"), "tags": tags_of(v), "created_at": v["created_at"]}
                      for v in plan["delete"]]}
    with open(path, "w") as fh:
        json.dump(doc, fh, indent=2)


def print_plan(plan, protected, keep):
    print(f"Protected tags (dev and prod): {', '.join(sorted(protected))}")
    print(f"Keeping the newest {keep} tagged versions.")
    print(f"Versions kept: {len(plan['keep'])}")
    for v, why in plan["keep"]:
        print(f"  keep   {v['id']} {','.join(tags_of(v)) or '(untagged)'} - {why}")
    print(f"Versions that would be deleted: {len(plan['delete'])}")
    for v in plan["delete"]:
        print(f"  DELETE {v['id']} {','.join(tags_of(v)) or '(untagged ' + str(v.get('name')) + ')'} created {v['created_at']}")


def cmd_plan(args):
    out = os.environ.get("GITHUB_OUTPUT")

    def setout(k, v):
        if out:
            with open(out, "a") as fh:
                fh.write(f"{k}={v}\n")

    setout("ready", "false")
    setout("count", "0")
    dev_url, prod_url = os.environ.get("DEV_APP_URL", ""), os.environ.get("PROD_APP_URL", "")
    if not dev_url or not prod_url:
        notice("Image cleanup skipped: set the repository variables DEV_APP_URL and PROD_APP_URL (docs/deploy.md, Image retention). "
               "Without both, the running tags are unknown and nothing is deleted.")
        return 0
    token = os.environ["GITHUB_TOKEN"]
    api = Api(args.owner, args.package, token)
    versions = api.list_versions()
    if versions is None:
        notice(f"Image cleanup skipped: package ghcr.io/{args.owner}/{args.package} does not exist yet (no image has been pushed).")
        return 0
    try:
        protected = {validate_health("dev", fetch_health(dev_url)), validate_health("prod", fetch_health(prod_url))}
        now = datetime.now(timezone.utc)
        first = select_versions(versions, protected, args.keep, now, args.untagged_days, referenced_digests=None)
        refs = referenced_by(first["keep"], lambda t: registry_children(args.owner, args.package, token, args.actor, t))
        plan = select_versions(versions, protected, args.keep, now, args.untagged_days, referenced_digests=refs)
    except FailClosed as exc:
        print(f"::error::Image cleanup failed closed, nothing will be deleted: {exc}")
        return 1
    for t in protected:
        if not any(t in tags_of(v) for v in versions):
            print(f"::warning::Running tag {t} is not among the package versions.")
    print_plan(plan, protected, args.keep)
    write_plan(args.plan, plan, protected, args.keep)
    setout("count", str(len(plan["delete"])))
    setout("ready", "true")
    return 0


def cmd_delete(args):
    with open(args.plan) as fh:
        doc = json.load(fh)
    protected = set(doc["protected"])
    api = Api(args.owner, args.package, os.environ["GITHUB_TOKEN"])
    if api.list_versions() is None:
        print("::error::Package vanished.")
        return 1
    failed = 0
    for item in doc["delete"]:
        if protected & set(item["tags"]):  # belt and braces: re-check at delete time
            print(f"::error::Refusing to delete {item['id']}: it carries a protected tag.")
            return 1
    for item in doc["delete"]:
        try:
            api.delete(item["id"])
            print(f"deleted {item['id']} {','.join(item['tags']) or item['digest']}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"::warning::could not delete {item['id']}: {exc}")
    print(f"Deleted {len(doc['delete']) - failed} of {len(doc['delete'])} versions.")
    return 1 if failed else 0


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["plan", "delete"])
    p.add_argument("--owner", required=True)
    p.add_argument("--package", default="clipremix")
    p.add_argument("--keep", type=int, default=20)
    p.add_argument("--untagged-days", type=int, default=7)
    p.add_argument("--actor", default=os.environ.get("GITHUB_ACTOR", "token"))
    p.add_argument("--plan", default="plan.json")
    args = p.parse_args(argv)
    args.owner = args.owner.lower()
    return cmd_plan(args) if args.command == "plan" else cmd_delete(args)


if __name__ == "__main__":
    sys.exit(main())
