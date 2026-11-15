import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ghcr_cleanup as g  # noqa: E402

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


def tag_for(i):
    return f"2026{(i // 28) % 12 + 1:02d}{i % 28 + 1:02d}-100000-{i:07x}"


def ver(i, tags=(), days_old=None, digest=None):
    created = NOW - timedelta(days=days_old if days_old is not None else 100 - i)
    return {"id": i, "name": digest or f"sha256:{i:064x}", "created_at": created.isoformat().replace("+00:00", "Z"),
            "metadata": {"container": {"tags": list(tags)}}}


def tagged(n):
    # id i is newer for larger i
    return [ver(i, [tag_for(i)]) for i in range(1, n + 1)]


def ids(items):
    return sorted(v["id"] for v in items)


def test_keeps_newest_n_and_deletes_rest():
    vs = tagged(30)
    plan = g.select_versions(vs, {tag_for(30)}, 20, NOW, referenced_digests=set())
    assert ids(plan["delete"]) == list(range(1, 11))


def test_protected_tags_survive_even_when_old():
    vs = tagged(30)
    plan = g.select_versions(vs, {tag_for(1), tag_for(2)}, 5, NOW, referenced_digests=set())
    deleted = ids(plan["delete"])
    assert 1 not in deleted and 2 not in deleted
    assert deleted == list(range(3, 26))


def test_keep_larger_than_available_deletes_nothing():
    plan = g.select_versions(tagged(3), {tag_for(3)}, 20, NOW, referenced_digests=set())
    assert plan["delete"] == []


def test_non_image_tag_is_kept():
    vs = tagged(10) + [ver(99, ["latest"], days_old=500)]
    plan = g.select_versions(vs, {tag_for(10)}, 2, NOW, referenced_digests=set())
    assert 99 not in ids(plan["delete"])


def test_untagged_rules():
    vs = tagged(3) + [ver(50, days_old=30, digest="sha256:old"), ver(51, days_old=30, digest="sha256:child"),
                      ver(52, days_old=1, digest="sha256:young")]
    plan = g.select_versions(vs, {tag_for(3)}, 5, NOW, referenced_digests={"sha256:child"})
    assert ids(plan["delete"]) == [50]


def test_untagged_kept_when_references_unknown():
    vs = tagged(2) + [ver(50, days_old=30)]
    plan = g.select_versions(vs, {tag_for(2)}, 5, NOW, referenced_digests=None)
    assert plan["delete"] == []


@pytest.mark.parametrize("protected", [set(), {"dev"}, {"latest", tag_for(1)}])
def test_fails_closed_without_valid_protected_tags(protected):
    with pytest.raises(g.FailClosed):
        g.select_versions(tagged(5), protected, 2, NOW, referenced_digests=set())


def test_fails_closed_on_bad_keep():
    with pytest.raises(g.FailClosed):
        g.select_versions(tagged(5), {tag_for(1)}, 0, NOW, referenced_digests=set())


def test_validate_health():
    t = tag_for(3)
    assert g.validate_health("dev", json.dumps({"environment": "dev", "version": t})) == t
    for body in ["", "not json", "[]", json.dumps({"environment": "prod", "version": t}),
                 json.dumps({"environment": "dev", "version": "dev"}),
                 json.dumps({"environment": "dev"})]:
        with pytest.raises(g.FailClosed):
            g.validate_health("dev", body)


def test_referenced_by_collects_children_and_fails_closed():
    kept = [(ver(1, ["a"]), "x"), (ver(2, ["b"]), "x")]
    assert g.referenced_by(kept, lambda t: [f"sha256:{t}1", f"sha256:{t}2"]) == {"sha256:a1", "sha256:a2", "sha256:b1", "sha256:b2"}

    def boom(tag):
        raise OSError("down")
    with pytest.raises(g.FailClosed):
        g.referenced_by(kept, boom)


def test_fetch_health_unreachable_fails_closed(monkeypatch):
    def boom(*a, **k):
        raise OSError("refused")
    monkeypatch.setattr(g, "http", boom)
    with pytest.raises(g.FailClosed):
        g.fetch_health("http://dev.invalid")


def test_delete_refuses_protected_plan(tmp_path, monkeypatch):
    plan = tmp_path / "plan.json"
    t = tag_for(1)
    plan.write_text(json.dumps({"protected": [t], "keep": 1, "delete": [{"id": 1, "digest": "d", "tags": [t], "created_at": "x"}]}))
    deleted = []

    class FakeApi:
        def __init__(self, *a): pass
        def list_versions(self): return []
        def delete(self, i): deleted.append(i)
    monkeypatch.setattr(g, "Api", FakeApi)
    monkeypatch.setenv("GITHUB_TOKEN", "x")
    assert g.main(["delete", "--owner", "o", "--plan", str(plan)]) == 1
    assert deleted == []
