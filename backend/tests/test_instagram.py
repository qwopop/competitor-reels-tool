"""Real Reels through the Instagram Graph API, with the HTTP call faked."""

import pytest
from fastapi.testclient import TestClient

from app.instagram import GraphApiReelSource
from app.main import create_app


def media(i: int, **overrides) -> dict:
    item = {
        "id": f"1790000000{i}",
        "caption": f"Reel number {i}",
        "media_type": "VIDEO",
        "media_product_type": "REELS",
        "permalink": f"https://www.instagram.com/reel/DfMPGCguh{i:02d}/",
        "thumbnail_url": f"https://scontent.cdninstagram.com/thumb{i}.jpg",
        "like_count": 100 + i,
        "comments_count": 10 + i,
        "timestamp": f"2026-10-{30 - i % 28:02d}T18:04:11+0000",
    }
    item.update(overrides)
    return item


def discovery(items: list[dict]) -> dict:
    return {
        "business_discovery": {
            "username": "nick_saraev",
            "name": "Nick Saraev",
            "profile_picture_url": "https://scontent.cdninstagram.com/avatar.jpg",
            "media": {"data": items},
        }
    }


class FakeGraph:
    def __init__(self, body: dict):
        self.body = body
        self.urls: list[str] = []

    def __call__(self, url: str) -> dict:
        self.urls.append(url)
        return self.body


@pytest.fixture
def make_client(tmp_path):
    clients = []

    def _make(body: dict):
        graph = FakeGraph(body)
        source = GraphApiReelSource("TOKEN", "17841400000000000", fetch_json=graph)
        client = TestClient(create_app(f"sqlite:///{tmp_path / 'ig.db'}", reel_source=source))
        client.__enter__()
        clients.append(client)
        return client, graph

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


def add(client) -> dict:
    return client.post("/api/competitors", json={"instagramUrl": "https://instagram.com/nick_saraev/"}).json()


def test_fetch_stores_real_reels_with_their_instagram_links(make_client):
    post = media(99, media_type="IMAGE", media_product_type="FEED", permalink="https://www.instagram.com/p/POST/")
    client, graph = make_client(discovery([media(1), post, media(2)]))
    comp = add(client)

    res = client.post(f"/api/competitors/{comp['id']}/reels/fetch")

    assert res.status_code == 200
    reels = res.json()
    assert [r["permalink"] for r in reels] == [
        "https://www.instagram.com/reel/DfMPGCguh01/",
        "https://www.instagram.com/reel/DfMPGCguh02/",
    ]
    assert reels[0]["shortcode"] == "DfMPGCguh01"
    assert reels[0]["caption"] == "Reel number 1"
    assert reels[0]["likeCount"] == 101
    assert reels[0]["commentCount"] == 11
    assert reels[0]["postedAt"] == "2026-10-29T18:04:11.000Z"
    assert "business_discovery.username%28nick_saraev%29" in graph.urls[0]
    assert "access_token=TOKEN" in graph.urls[0]

    competitor = client.get("/api/competitors").json()[0]
    assert competitor["displayName"] == "Nick Saraev"
    assert competitor["avatarUrl"] == "https://scontent.cdninstagram.com/avatar.jpg"


def test_fetch_keeps_at_most_20_reels(make_client):
    client, _ = make_client(discovery([media(i) for i in range(30)]))
    comp = add(client)
    assert len(client.post(f"/api/competitors/{comp['id']}/reels/fetch").json()) == 20


def test_non_business_account_gives_a_clear_error_and_keeps_old_reels(make_client):
    client, graph = make_client(discovery([media(1)]))
    comp = add(client)
    client.post(f"/api/competitors/{comp['id']}/reels/fetch")

    graph.body = {"error": {"message": "Invalid user id", "code": 110}}
    res = client.post(f"/api/competitors/{comp['id']}/reels/fetch")

    assert res.status_code == 502
    assert "Business or Creator" in res.json()["detail"]
    assert len(client.get("/api/reels").json()) == 1


def test_expired_token_is_explained(make_client):
    client, _ = make_client({"error": {"message": "Session has expired", "code": 190}})
    comp = add(client)
    res = client.post(f"/api/competitors/{comp['id']}/reels/fetch")
    assert res.status_code == 502
    assert "INSTAGRAM_ACCESS_TOKEN" in res.json()["detail"]


def test_account_without_reels_is_an_error(make_client):
    client, _ = make_client(discovery([]))
    comp = add(client)
    res = client.post(f"/api/competitors/{comp['id']}/reels/fetch")
    assert res.status_code == 502
    assert "no Reels" in res.json()["detail"]


def test_env_vars_switch_on_the_graph_api(monkeypatch, tmp_path):
    monkeypatch.setenv("INSTAGRAM_ACCESS_TOKEN", "abc")
    monkeypatch.setenv("INSTAGRAM_USER_ID", "123")
    app = create_app(f"sqlite:///{tmp_path / 'env.db'}")
    assert isinstance(app.state.reel_source, GraphApiReelSource)

    monkeypatch.delenv("INSTAGRAM_ACCESS_TOKEN")
    assert create_app(f"sqlite:///{tmp_path / 'env2.db'}").state.reel_source is None
