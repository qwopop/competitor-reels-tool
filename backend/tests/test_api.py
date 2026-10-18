import pytest

from app import generator


def add(client, url="https://instagram.com/creator"):
    return client.post("/api/competitors", json={"instagramUrl": url})


def test_add_competitor_returns_camel_case_and_201(client):
    res = add(client, "https://instagram.com/vibecoder")
    assert res.status_code == 201
    body = res.json()
    assert body["username"] == "vibecoder"
    assert body["instagramUrl"] == "https://www.instagram.com/vibecoder/"
    assert body["displayName"] == "Vibecoder"
    assert "addedAt" in body


def test_add_competitor_rejects_non_instagram_url(client):
    res = add(client, "https://twitter.com/foo")
    assert res.status_code == 400
    assert "valid Instagram" in res.json()["detail"]


def test_add_competitor_does_not_duplicate(client):
    first = add(client, "https://instagram.com/vibecoder").json()
    res = add(client, "@VibeCoder")
    assert res.status_code == 200
    assert res.json()["id"] == first["id"]
    assert len(client.get("/api/competitors").json()) == 1


def test_list_competitors_starts_empty(client):
    assert client.get("/api/competitors").json() == []


def test_remove_competitor_cascades_to_reels_and_remixes(client):
    comp = add(client).json()
    reel = client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]
    client.post(f"/api/reels/{reel['id']}/remix")

    assert client.delete(f"/api/competitors/{comp['id']}").status_code == 204
    assert client.get("/api/competitors").json() == []
    assert client.get("/api/reels").json() == []
    assert client.get(f"/api/reels/{reel['id']}").status_code == 404


def test_remove_unknown_competitor_is_404(client):
    res = client.delete("/api/competitors/nope")
    assert res.status_code == 404
    assert res.json()["detail"] == "Competitor not found."


def test_fetch_stores_exactly_20_reels_and_refetch_replaces_them(client):
    comp = add(client).json()
    first = client.post(f"/api/competitors/{comp['id']}/reels/fetch")
    assert first.status_code == 200
    assert len(first.json()) == generator.REELS_PER_FETCH
    assert first.json()[0]["competitorUsername"] == "creator"
    assert first.json()[0]["permalink"] == "https://www.instagram.com/creator/"

    client.post(f"/api/competitors/{comp['id']}/reels/fetch")
    assert len(client.get("/api/reels").json()) == generator.REELS_PER_FETCH


def test_fetch_for_unknown_competitor_is_404(client):
    res = client.post("/api/competitors/nope/reels/fetch")
    assert res.status_code == 404


def test_list_reels_is_sorted_newest_first(client):
    comp = add(client).json()
    client.post(f"/api/competitors/{comp['id']}/reels/fetch")
    posted = [r["postedAt"] for r in client.get("/api/reels").json()]
    assert posted == sorted(posted, reverse=True)


def test_get_reel_not_found(client):
    assert client.get("/api/reels/nope").status_code == 404


def test_remix_generates_then_returns_existing(client):
    comp = add(client).json()
    reel = client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]

    first = client.post(f"/api/reels/{reel['id']}/remix")
    assert first.status_code == 201
    remix = first.json()
    assert remix["reelId"] == reel["id"]
    assert remix["hook"] and remix["script"] and remix["cta"]

    second = client.post(f"/api/reels/{reel['id']}/remix")
    assert second.status_code == 200
    assert second.json()["id"] == remix["id"]

    assert client.get(f"/api/remixes/{remix['id']}").json()["id"] == remix["id"]


def test_remix_unknown_reel_is_404(client):
    assert client.post("/api/reels/nope/remix").status_code == 404


def test_patch_remix_updates_only_given_fields(client):
    comp = add(client).json()
    reel = client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]
    remix = client.post(f"/api/reels/{reel['id']}/remix").json()

    res = client.patch(f"/api/remixes/{remix['id']}", json={"hook": "My new hook", "cta": "Follow me"})
    assert res.status_code == 200
    updated = res.json()
    assert updated["hook"] == "My new hook"
    assert updated["cta"] == "Follow me"
    assert updated["script"] == remix["script"]
    assert updated["title"] == remix["title"]
    assert updated["updatedAt"] >= remix["updatedAt"]


def test_patch_remix_ignores_explicit_nulls(client):
    comp = add(client).json()
    reel = client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]
    remix = client.post(f"/api/reels/{reel['id']}/remix").json()

    res = client.patch(f"/api/remixes/{remix['id']}", json={"title": None, "hook": "Kept"})
    assert res.status_code == 200
    assert res.json()["title"] == remix["title"]
    assert res.json()["hook"] == "Kept"


def test_patch_unknown_remix_is_404(client):
    assert client.patch("/api/remixes/nope", json={"hook": "x"}).status_code == 404


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://instagram.com/vibecoder", "vibecoder"),
        ("https://www.instagram.com/vibecoder/", "vibecoder"),
        ("@vibecoder", "vibecoder"),
        ("vibecoder", "vibecoder"),
        ("https://twitter.com/vibecoder", None),
        ("   ", None),
        ("https://instagram.com/", None),
    ],
)
def test_parse_username(raw, expected):
    assert generator.parse_username(raw) == expected


def test_data_persists_across_app_restarts(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    db_url = f"sqlite:///{tmp_path / 'persist.db'}"
    with TestClient(create_app(db_url)) as client:
        add(client, "https://instagram.com/vibecoder")

    with TestClient(create_app(db_url)) as client:
        competitors = client.get("/api/competitors").json()
        assert [c["username"] for c in competitors] == ["vibecoder"]


def seed_reel(client):
    comp = add(client).json()
    return client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]


def test_add_reel_to_content_plan_starts_as_not_started(client):
    reel = seed_reel(client)
    res = client.post("/api/content-plan", json={"reelId": reel["id"]})
    assert res.status_code == 201
    item = res.json()
    assert item["reelId"] == reel["id"]
    assert item["status"] == "not_started"
    assert item["caption"] == reel["caption"]
    assert item["competitorUsername"] == "creator"


def test_adding_the_same_reel_twice_returns_existing_item(client):
    reel = seed_reel(client)
    first = client.post("/api/content-plan", json={"reelId": reel["id"]}).json()
    second = client.post("/api/content-plan", json={"reelId": reel["id"]})
    assert second.status_code == 200
    assert second.json()["id"] == first["id"]
    assert len(client.get("/api/content-plan").json()) == 1


def test_add_unknown_reel_to_plan_is_404(client):
    res = client.post("/api/content-plan", json={"reelId": "nope"})
    assert res.status_code == 404


def test_update_plan_status(client):
    reel = seed_reel(client)
    item = client.post("/api/content-plan", json={"reelId": reel["id"]}).json()
    for status in ["ready", "filmed", "not_started"]:
        res = client.patch(f"/api/content-plan/{item['id']}", json={"status": status})
        assert res.status_code == 200
        assert res.json()["status"] == status


def test_update_plan_status_rejects_unknown_status(client):
    reel = seed_reel(client)
    item = client.post("/api/content-plan", json={"reelId": reel["id"]}).json()
    res = client.patch(f"/api/content-plan/{item['id']}", json={"status": "done"})
    assert res.status_code == 422


def test_remove_from_content_plan(client):
    reel = seed_reel(client)
    item = client.post("/api/content-plan", json={"reelId": reel["id"]}).json()
    assert client.delete(f"/api/content-plan/{item['id']}").status_code == 204
    assert client.get("/api/content-plan").json() == []
    assert client.delete(f"/api/content-plan/{item['id']}").status_code == 404


def test_plan_survives_refetching_the_competitor_reels(client):
    """Refetching replaces Reel rows, so plan items must keep their own copy."""
    reel = seed_reel(client)
    item = client.post("/api/content-plan", json={"reelId": reel["id"]}).json()
    comp_id = client.get("/api/competitors").json()[0]["id"]
    client.post(f"/api/competitors/{comp_id}/reels/fetch")
    plan = client.get("/api/content-plan").json()
    assert [p["id"] for p in plan] == [item["id"]]
    assert plan[0]["caption"] == reel["caption"]


def test_cors_origins_come_from_environment(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setenv("CORS_ORIGINS", "https://reels.example.com")
    with TestClient(create_app(f"sqlite:///{tmp_path / 'cors.db'}")) as client:
        allowed = client.get("/api/competitors", headers={"Origin": "https://reels.example.com"})
        assert allowed.headers["access-control-allow-origin"] == "https://reels.example.com"
        blocked = client.get("/api/competitors", headers={"Origin": "https://evil.example.com"})
        assert "access-control-allow-origin" not in blocked.headers


def first_reel(client):
    comp = add(client).json()
    return client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()[0]


@pytest.mark.parametrize("template", ["default", "educational", "storytelling", "promotional"])
def test_remix_uses_the_chosen_template(client, template):
    reel = first_reel(client)
    res = client.post(f"/api/reels/{reel['id']}/remix", json={"template": template})
    assert res.status_code == 201
    remix = res.json()
    assert remix["title"].startswith(generator.TEMPLATE_BANKS[template]["title"])
    assert remix["hook"] and remix["script"] and remix["cta"]


def test_remix_rejects_unknown_template(client):
    reel = first_reel(client)
    assert client.post(f"/api/reels/{reel['id']}/remix", json={"template": "pirate"}).status_code == 422


def test_get_remix_for_reel_returns_existing_or_404(client):
    reel = first_reel(client)
    assert client.get(f"/api/reels/{reel['id']}/remix/current").status_code == 404
    remix = client.post(f"/api/reels/{reel['id']}/remix").json()
    assert client.get(f"/api/reels/{reel['id']}/remix/current").json()["id"] == remix["id"]


def test_list_remixes(client):
    reel = first_reel(client)
    assert client.get("/api/remixes").json() == []
    remix = client.post(f"/api/reels/{reel['id']}/remix").json()
    assert [r["id"] for r in client.get("/api/remixes").json()] == [remix["id"]]


def test_apply_template_overwrites_text_fields(client):
    reel = first_reel(client)
    remix = client.post(f"/api/reels/{reel['id']}/remix").json()
    client.patch(f"/api/remixes/{remix['id']}", json={"hook": "my own hook"})
    res = client.post(f"/api/remixes/{remix['id']}/apply-template", json={"template": "promotional"})
    assert res.status_code == 200
    updated = res.json()
    assert updated["title"].startswith("Promo:")
    assert updated["hook"] != "my own hook"
    assert updated["id"] == remix["id"]


def test_apply_template_unknown_remix_is_404(client):
    res = client.post("/api/remixes/nope/apply-template", json={"template": "default"})
    assert res.status_code == 404
