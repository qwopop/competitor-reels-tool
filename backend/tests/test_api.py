import pytest

from app import generator


def add(client, url="https://www.youtube.com/@creator"):
    return client.post("/api/competitors", json={"channelUrl": url})


def test_add_competitor_returns_camel_case_and_201(client):
    res = add(client, "https://www.youtube.com/@vibecoder")
    assert res.status_code == 201
    body = res.json()
    assert body["username"] == "vibecoder"
    assert body["channelUrl"] == "https://www.youtube.com/@vibecoder"
    assert body["channelId"] == "sample-vibecoder"
    assert body["displayName"] == "Vibecoder"
    assert "addedAt" in body


def test_add_competitor_rejects_non_youtube_url(client):
    res = add(client, "https://twitter.com/foo")
    assert res.status_code == 400
    assert "YouTube channel link" in res.json()["detail"]


def test_add_competitor_does_not_duplicate(client):
    first = add(client, "https://www.youtube.com/@vibecoder").json()
    res = add(client, "@VibeCoder")
    assert res.status_code == 200
    assert res.json()["id"] == first["id"]
    assert len(client.get("/api/competitors").json()) == 1


def test_list_competitors_starts_empty(client):
    assert client.get("/api/competitors").json() == []


def test_remove_competitor_cascades_to_videos_and_remixes(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    client.post(f"/api/videos/{video['id']}/remix")

    assert client.delete(f"/api/competitors/{comp['id']}").status_code == 204
    assert client.get("/api/competitors").json() == []
    assert client.get("/api/videos").json() == []
    assert client.get(f"/api/videos/{video['id']}").status_code == 404


def test_remove_unknown_competitor_is_404(client):
    res = client.delete("/api/competitors/nope")
    assert res.status_code == 404
    assert res.json()["detail"] == "Competitor not found."


def test_fetch_stores_the_latest_videos_and_refetch_replaces_them(client):
    comp = add(client).json()
    first = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert first.status_code == 200
    assert len(first.json()) == generator.VIDEOS_PER_FETCH
    assert first.json()[0]["competitorUsername"] == "creator"
    assert first.json()[0]["permalink"] == "https://www.youtube.com/@creator"

    client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert len(client.get("/api/videos").json()) == generator.VIDEOS_PER_FETCH


def test_fetch_for_unknown_competitor_is_404(client):
    res = client.post("/api/competitors/nope/videos/fetch")
    assert res.status_code == 404


def test_list_videos_is_sorted_newest_first(client):
    comp = add(client).json()
    client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    posted = [r["postedAt"] for r in client.get("/api/videos").json()]
    assert posted == sorted(posted, reverse=True)


def test_get_video_not_found(client):
    assert client.get("/api/videos/nope").status_code == 404


def test_remix_generates_then_returns_existing(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]

    first = client.post(f"/api/videos/{video['id']}/remix")
    assert first.status_code == 201
    remix = first.json()
    assert remix["videoId"] == video["id"]
    assert remix["hook"] and remix["script"] and remix["cta"]

    second = client.post(f"/api/videos/{video['id']}/remix")
    assert second.status_code == 200
    assert second.json()["id"] == remix["id"]

    assert client.get(f"/api/remixes/{remix['id']}").json()["id"] == remix["id"]


def test_remix_unknown_video_is_404(client):
    assert client.post("/api/videos/nope/remix").status_code == 404


def test_patch_remix_updates_only_given_fields(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    remix = client.post(f"/api/videos/{video['id']}/remix").json()

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
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    remix = client.post(f"/api/videos/{video['id']}/remix").json()

    res = client.patch(f"/api/remixes/{remix['id']}", json={"title": None, "hook": "Kept"})
    assert res.status_code == 200
    assert res.json()["title"] == remix["title"]
    assert res.json()["hook"] == "Kept"


def test_patch_unknown_remix_is_404(client):
    assert client.patch("/api/remixes/nope", json={"hook": "x"}).status_code == 404


def test_data_persists_across_app_restarts(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    db_url = f"sqlite:///{tmp_path / 'persist.db'}"
    with TestClient(create_app(db_url)) as client:
        add(client, "https://www.youtube.com/@vibecoder")

    with TestClient(create_app(db_url)) as client:
        competitors = client.get("/api/competitors").json()
        assert [c["username"] for c in competitors] == ["vibecoder"]


def seed_video(client):
    comp = add(client).json()
    return client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]


def test_add_video_to_content_plan_starts_as_not_started(client):
    video = seed_video(client)
    res = client.post("/api/content-plan", json={"videoId": video["id"]})
    assert res.status_code == 201
    item = res.json()
    assert item["videoId"] == video["id"]
    assert item["status"] == "not_started"
    assert item["caption"] == video["caption"]
    assert item["competitorUsername"] == "creator"


def test_adding_the_same_video_twice_returns_existing_item(client):
    video = seed_video(client)
    first = client.post("/api/content-plan", json={"videoId": video["id"]}).json()
    second = client.post("/api/content-plan", json={"videoId": video["id"]})
    assert second.status_code == 200
    assert second.json()["id"] == first["id"]
    assert len(client.get("/api/content-plan").json()) == 1


def test_add_unknown_video_to_plan_is_404(client):
    res = client.post("/api/content-plan", json={"videoId": "nope"})
    assert res.status_code == 404


def test_update_plan_status(client):
    video = seed_video(client)
    item = client.post("/api/content-plan", json={"videoId": video["id"]}).json()
    for status in ["ready", "filmed", "not_started"]:
        res = client.patch(f"/api/content-plan/{item['id']}", json={"status": status})
        assert res.status_code == 200
        assert res.json()["status"] == status


def test_update_plan_status_rejects_unknown_status(client):
    video = seed_video(client)
    item = client.post("/api/content-plan", json={"videoId": video["id"]}).json()
    res = client.patch(f"/api/content-plan/{item['id']}", json={"status": "done"})
    assert res.status_code == 422


def test_remove_from_content_plan(client):
    video = seed_video(client)
    item = client.post("/api/content-plan", json={"videoId": video["id"]}).json()
    assert client.delete(f"/api/content-plan/{item['id']}").status_code == 204
    assert client.get("/api/content-plan").json() == []
    assert client.delete(f"/api/content-plan/{item['id']}").status_code == 404


def test_plan_survives_refetching_the_competitor_videos(client):
    """Refetching replaces Video rows, so plan items must keep their own copy."""
    video = seed_video(client)
    item = client.post("/api/content-plan", json={"videoId": video["id"]}).json()
    comp_id = client.get("/api/competitors").json()[0]["id"]
    client.post(f"/api/competitors/{comp_id}/videos/fetch")
    plan = client.get("/api/content-plan").json()
    assert [p["id"] for p in plan] == [item["id"]]
    assert plan[0]["caption"] == video["caption"]


def test_cors_origins_come_from_environment(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setenv("CORS_ORIGINS", "https://videos.example.com")
    with TestClient(create_app(f"sqlite:///{tmp_path / 'cors.db'}")) as client:
        allowed = client.get("/api/competitors", headers={"Origin": "https://videos.example.com"})
        assert allowed.headers["access-control-allow-origin"] == "https://videos.example.com"
        blocked = client.get("/api/competitors", headers={"Origin": "https://evil.example.com"})
        assert "access-control-allow-origin" not in blocked.headers


def first_video(client):
    comp = add(client).json()
    return client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]


@pytest.mark.parametrize("template", ["default", "educational", "storytelling", "promotional"])
def test_remix_uses_the_chosen_template(client, template):
    video = first_video(client)
    res = client.post(f"/api/videos/{video['id']}/remix", json={"template": template})
    assert res.status_code == 201
    remix = res.json()
    assert remix["title"] and remix["hook"] and remix["script"] and remix["cta"]


def test_each_template_writes_a_different_draft(client):
    video = first_video(client)
    remix = client.post(f"/api/videos/{video['id']}/remix").json()
    hooks = {
        client.post(f"/api/remixes/{remix['id']}/apply-template", json={"template": t}).json()["hook"]
        for t in ["default", "educational", "storytelling", "promotional"]
    }
    assert len(hooks) == 4


def test_remix_rejects_unknown_template(client):
    video = first_video(client)
    assert client.post(f"/api/videos/{video['id']}/remix", json={"template": "pirate"}).status_code == 422


def test_get_remix_for_video_returns_existing_or_404(client):
    video = first_video(client)
    assert client.get(f"/api/videos/{video['id']}/remix/current").status_code == 404
    remix = client.post(f"/api/videos/{video['id']}/remix").json()
    assert client.get(f"/api/videos/{video['id']}/remix/current").json()["id"] == remix["id"]


def test_list_remixes(client):
    video = first_video(client)
    assert client.get("/api/remixes").json() == []
    remix = client.post(f"/api/videos/{video['id']}/remix").json()
    assert [r["id"] for r in client.get("/api/remixes").json()] == [remix["id"]]


def test_apply_template_overwrites_text_fields(client):
    video = first_video(client)
    remix = client.post(f"/api/videos/{video['id']}/remix").json()
    client.patch(f"/api/remixes/{remix['id']}", json={"hook": "my own hook"})
    res = client.post(f"/api/remixes/{remix['id']}/apply-template", json={"template": "promotional"})
    assert res.status_code == 200
    updated = res.json()
    assert updated["title"] != remix["title"]
    assert updated["hook"] != "my own hook"
    assert updated["id"] == remix["id"]


def test_apply_template_unknown_remix_is_404(client):
    res = client.post("/api/remixes/nope/apply-template", json={"template": "default"})
    assert res.status_code == 404


@pytest.mark.parametrize(
    "link",
    [
        "https://www.youtube.com/feed/trending",
        "https://www.youtube.com/results?search_query=ai",
        "https://vimeo.com/@someone",
        "https://www.youtube.com/@vibe coder",
        "@" + "a" * 40,
    ],
)
def test_non_channel_links_are_rejected_and_create_nothing(client, link):
    res = add(client, link)
    assert res.status_code == 400
    assert client.get("/api/competitors").json() == []


@pytest.mark.parametrize("link", ["youtube.com/@scheme_less", "www.youtube.com/@scheme_less/videos"])
def test_links_without_a_scheme_are_accepted(client, link):
    res = add(client, link)
    assert res.status_code == 201
    assert res.json()["username"] == "scheme_less"


def test_refetch_keeps_a_remix_and_its_edits(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    remix = client.post(f"/api/videos/{video['id']}/remix").json()
    client.patch(f"/api/remixes/{remix['id']}", json={"hook": "my hand-edited hook"})

    client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    remixes = client.get("/api/remixes").json()
    assert [r["id"] for r in remixes] == [remix["id"]]
    assert remixes[0]["hook"] == "my hand-edited hook"
    assert client.get(f"/api/videos/{video['id']}").status_code == 200


def test_refetch_keeps_a_planned_video_so_it_can_still_be_remixed(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    item = client.post("/api/content-plan", json={"videoId": video["id"]}).json()

    client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    assert client.post(f"/api/videos/{item['videoId']}/remix").status_code == 201


def test_refetch_replaces_other_videos_and_does_not_keep_growing(client):
    comp = add(client).json()
    first = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()
    kept = first[0]
    client.post(f"/api/videos/{kept['id']}/remix")

    for _ in range(3):
        client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    ids = [r["id"] for r in client.get("/api/videos").json()]
    assert kept["id"] in ids
    assert first[1]["id"] not in ids  # an unremixed Video was replaced
    assert len(ids) == generator.VIDEOS_PER_FETCH + 1  # the new videos plus the one kept
    assert len(ids) == len(set(ids))


def test_removing_a_competitor_still_deletes_its_videos_and_remixes(client):
    comp = add(client).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    client.post(f"/api/videos/{video['id']}/remix")
    client.post(f"/api/competitors/{comp['id']}/videos/fetch")  # keeps the remixed Video

    assert client.delete(f"/api/competitors/{comp['id']}").status_code == 204
    assert client.get("/api/videos").json() == []
    assert client.get("/api/remixes").json() == []


def test_in_memory_mode_works_but_saves_nothing():
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app("sqlite://")) as memory_client:
        assert add(memory_client, "https://www.youtube.com/@ephemeral").status_code == 201
        assert [c["username"] for c in memory_client.get("/api/competitors").json()] == ["ephemeral"]
        comp = memory_client.get("/api/competitors").json()[0]
        assert len(memory_client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()) == generator.VIDEOS_PER_FETCH

    with TestClient(create_app("sqlite://")) as fresh:
        assert fresh.get("/api/competitors").json() == []


# ---- bugs #46 and #47, and the database constraints in the plan (section 3.9)

def test_competitor_usernames_are_stored_lowercase_and_unique(client):
    first = add(client, "@Mixed.Case").json()
    assert first["username"] == "mixed.case"
    again = add(client, "https://www.youtube.com/@MIXED.case")
    assert again.status_code == 200
    assert again.json()["id"] == first["id"]
    assert len(client.get("/api/competitors").json()) == 1


def test_database_rejects_duplicate_channels_and_plan_videos(client):
    from sqlalchemy.exc import IntegrityError

    video = first_video(client)
    session = client.app.state.session_factory()
    from app.youtube import ChannelInfo

    session.add(generator.build_competitor(ChannelInfo("sample-creator", "creator", "Creator", None)))  # already exists
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    video_row = store_get_video(session, video["id"])
    client.post("/api/content-plan", json={"videoId": video["id"]})
    session.add(generator.build_plan_item(video_row))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()
    session.close()


def store_get_video(session, video_id):
    from app import store

    return store.get_video(session, video_id)


def test_add_plan_item_returns_the_existing_item_when_another_request_won(client):
    from app import store

    video = first_video(client)
    first_session = client.app.state.session_factory()
    second_session = client.app.state.session_factory()
    first_video_row = store.get_video(first_session, video["id"])
    second_video_row = store.get_video(second_session, video["id"])  # loaded before the first insert

    first_item, created_first = store.add_plan_item(first_session, first_video_row)
    second_item, created_second = store.add_plan_item(second_session, second_video_row)

    assert created_first is True
    assert created_second is False
    assert second_item.id == first_item.id
    first_session.close()
    second_session.close()


def test_parallel_plan_adds_leave_one_item_and_no_server_error(client):
    from concurrent.futures import ThreadPoolExecutor

    video = first_video(client)
    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(
            pool.map(lambda _: client.post("/api/content-plan", json={"videoId": video["id"]}), range(8))
        )
    assert all(r.status_code < 500 for r in responses)
    assert [r.status_code for r in responses].count(201) == 1
    assert len(client.get("/api/content-plan").json()) == 1


@pytest.mark.parametrize(
    "field, limit", [("title", 500), ("hook", 1000), ("script", 2000), ("cta", 500)]
)
def test_remix_text_limits_match_the_database_columns(client, field, limit):
    video = first_video(client)
    remix = client.post(f"/api/videos/{video['id']}/remix").json()

    at_limit = client.patch(f"/api/remixes/{remix['id']}", json={field: "x" * limit})
    over_limit = client.patch(f"/api/remixes/{remix['id']}", json={field: "x" * (limit + 1)})

    assert at_limit.status_code == 200
    assert over_limit.status_code == 422


def test_an_absurdly_long_link_is_a_validation_error(client):
    res = client.post("/api/competitors", json={"channelUrl": "https://www.youtube.com/@" + "a" * 3000})
    assert res.status_code == 422
