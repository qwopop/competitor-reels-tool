"""Real Videos through the Instagram Graph API, with the HTTP call faked."""

import pytest
from fastapi.testclient import TestClient

from app.instagram import GraphApiVideoSource
from app.main import create_app


def media(i: int, **overrides) -> dict:
    item = {
        "id": f"1790000000{i}",
        "caption": f"Video number {i}",
        "media_type": "VIDEO",
        "media_product_type": "VIDEOS",
        "permalink": f"https://www.instagram.com/video/DfMPGCguh{i:02d}/",
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
        source = GraphApiVideoSource("TOKEN", "17841400000000000", fetch_json=graph)
        client = TestClient(create_app(f"sqlite:///{tmp_path / 'ig.db'}", video_source=source))
        client.__enter__()
        clients.append(client)
        return client, graph

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


def add(client) -> dict:
    return client.post("/api/competitors", json={"instagramUrl": "https://instagram.com/nick_saraev/"}).json()


def test_fetch_stores_real_videos_with_their_instagram_links(make_client):
    post = media(99, media_type="IMAGE", media_product_type="FEED", permalink="https://www.instagram.com/p/POST/")
    client, graph = make_client(discovery([media(1), post, media(2)]))
    comp = add(client)

    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    assert res.status_code == 200
    videos = res.json()
    assert [r["permalink"] for r in videos] == [
        "https://www.instagram.com/video/DfMPGCguh01/",
        "https://www.instagram.com/video/DfMPGCguh02/",
    ]
    assert videos[0]["shortcode"] == "DfMPGCguh01"
    assert videos[0]["caption"] == "Video number 1"
    assert videos[0]["likeCount"] == 101
    assert videos[0]["commentCount"] == 11
    assert videos[0]["postedAt"] == "2026-10-29T18:04:11.000Z"
    assert "business_discovery.username%28nick_saraev%29" in graph.urls[0]
    assert "access_token=TOKEN" in graph.urls[0]

    competitor = client.get("/api/competitors").json()[0]
    assert competitor["displayName"] == "Nick Saraev"
    assert competitor["avatarUrl"] == "https://scontent.cdninstagram.com/avatar.jpg"


def test_fetch_keeps_at_most_20_videos(make_client):
    client, _ = make_client(discovery([media(i) for i in range(30)]))
    comp = add(client)
    assert len(client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()) == 20


def test_non_business_account_gives_a_clear_error_and_keeps_old_videos(make_client):
    client, graph = make_client(discovery([media(1)]))
    comp = add(client)
    client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    graph.body = {"error": {"message": "Invalid user id", "code": 110}}
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    assert res.status_code == 502
    assert "Business or Creator" in res.json()["detail"]
    assert len(client.get("/api/videos").json()) == 1


def test_expired_token_is_explained(make_client):
    client, _ = make_client({"error": {"message": "Session has expired", "code": 190}})
    comp = add(client)
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert res.status_code == 502
    assert "INSTAGRAM_ACCESS_TOKEN" in res.json()["detail"]


def test_account_without_videos_is_an_error(make_client):
    client, _ = make_client(discovery([]))
    comp = add(client)
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert res.status_code == 502
    assert "no Videos" in res.json()["detail"]


def test_env_vars_switch_on_the_graph_api(monkeypatch, tmp_path):
    monkeypatch.setenv("INSTAGRAM_ACCESS_TOKEN", "abc")
    monkeypatch.setenv("INSTAGRAM_USER_ID", "123")
    app = create_app(f"sqlite:///{tmp_path / 'env.db'}")
    assert isinstance(app.state.video_source, GraphApiVideoSource)

    monkeypatch.delenv("INSTAGRAM_ACCESS_TOKEN")
    assert create_app(f"sqlite:///{tmp_path / 'env2.db'}").state.video_source is None
