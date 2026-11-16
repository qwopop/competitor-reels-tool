"""The daily limit of AI writes (AI_WRITES_PER_DAY), always with a fake Gemini client and a fixed clock."""

import json
import logging
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import ai_writer, store
from app.generator import SampleSource
from app.main import create_app

FAKE_KEY = "FAKE-gemini-key-for-limit-tests-0000"
FIELDS = {"title": "T", "hook": "H", "script": "1. a\n2. b\n3. c", "cta": "C"}


def answer():
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(FIELDS)}]}}]}


class FakeGemini:
    """Answers each call with the next scripted item (a response or an exception), then good answers."""

    def __init__(self, *script):
        self.script = list(script)
        self.calls = 0

    def generate(self, api_key, model, body, timeout):
        self.calls += 1
        item = self.script.pop(0) if self.script else answer()
        if isinstance(item, BaseException):
            raise item
        return item


class Clock:
    def __init__(self, now: datetime):
        self.now = now

    def __call__(self):
        return self.now


def at(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


@pytest.fixture
def make(database_url, monkeypatch):
    """make(*script, limit="3", now="2026-11-16T12:00:00") → (client, fake, remix, clock)."""
    clients = []

    def build(*script, limit="3", now="2026-11-16T12:00:00", key=FAKE_KEY, new_remix=True):
        monkeypatch.setenv("GEMINI_API_KEY", key)
        if limit is not None:
            monkeypatch.setenv("AI_WRITES_PER_DAY", limit)
        fake = FakeGemini(*script)
        clock = Clock(at(now))
        client = TestClient(create_app(database_url, video_source=SampleSource(), gemini=fake, clock=clock))
        client.__enter__()
        clients.append(client)
        remix = None
        if new_remix:
            comp = client.post("/api/competitors", json={"channelUrl": "@limit"}).json()
            video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
            remix = client.post(f"/api/videos/{video['id']}/remix").json()
        return client, fake, remix, clock

    yield build
    for client in clients:
        client.__exit__(None, None, None)


def draft(client, remix, **payload):
    payload.setdefault("voice", "storyteller")
    return client.post(f"/api/remixes/{remix['id']}/ai-draft", json=payload)


# ---- the limit -------------------------------------------------------------------


def test_three_writes_then_the_limit_with_the_exact_message_and_retry_after(make):
    client, fake, remix, _ = make(limit="3", now="2026-11-16T20:40:00")
    lefts = []
    for _ in range(3):
        res = draft(client, remix)
        assert res.status_code == 200
        assert res.json()["writesPerDay"] == 3
        lefts.append(res.json()["writesLeftToday"])
    assert lefts == [2, 1, 0]
    res = draft(client, remix)
    assert res.status_code == 429
    assert res.json() == {
        "detail": "Today's limit of 3 AI writes is used up. It resets at midnight UTC, in 3 h 20 min. "
        "Templates still work."
    }
    assert res.headers["Retry-After"] == str(3 * 3600 + 20 * 60)
    assert fake.calls == 3
    assert client.get(f"/api/remixes/{remix['id']}").json() == remix


def test_the_default_limit_is_50(make):
    client, fake, remix, _ = make(limit=None)
    body = draft(client, remix).json()
    assert (body["writesLeftToday"], body["writesPerDay"]) == (49, 50)


@pytest.mark.parametrize("value", ["", "   ", "abc", "-1", "2.5"])
def test_an_empty_or_invalid_limit_is_50(make, value):
    client, fake, remix, _ = make(limit=value)
    body = draft(client, remix).json()
    assert (body["writesLeftToday"], body["writesPerDay"]) == (49, 50)


def test_an_invalid_limit_is_warned_about_once_per_process(make, monkeypatch, caplog):
    monkeypatch.setattr(ai_writer, "_warned_invalid_writes_per_day", False)
    client, fake, remix, _ = make(limit="abc")
    with caplog.at_level(logging.WARNING, logger="app.ai_writer"):
        draft(client, remix)
        draft(client, remix)
    warnings = [r.getMessage() for r in caplog.records if "AI_WRITES_PER_DAY" in r.getMessage()]
    assert warnings == ["AI_WRITES_PER_DAY is not a whole number ≥ 0; using 50."]


def test_zero_turns_ai_writing_off_and_gemini_is_never_called(make):
    client, fake, remix, _ = make(limit="0")
    for _ in range(2):
        res = draft(client, remix)
        assert res.status_code == 429
        assert res.json() == {"detail": "AI writing is turned off on this server for now. Templates still work."}
    assert fake.calls == 0


def test_the_daily_limit_message_differs_from_geminis_own_quota(make):
    client, fake, remix, _ = make(ai_writer.GeminiHttpError(429), ai_writer.GeminiHttpError(429), limit="1")
    gemini_quota = draft(client, remix)
    assert gemini_quota.status_code == 429
    assert gemini_quota.json()["detail"] == ai_writer.QUOTA
    assert "Retry-After" not in gemini_quota.headers
    daily = draft(client, remix)
    assert daily.status_code == 429
    assert daily.json()["detail"].startswith("Today's limit of 1 AI writes is used up.")


# ---- what counts ---------------------------------------------------------------------


def test_a_gemini_failure_and_a_gemini_429_each_use_up_one_write(make):
    client, fake, remix, _ = make(
        ai_writer.GeminiHttpError(503), ai_writer.GeminiTimeout("t"),  # 502 after the fallback
        ai_writer.GeminiHttpError(429), ai_writer.GeminiHttpError(429),  # Gemini's 429
        limit="3",
    )
    assert draft(client, remix).status_code == 502
    assert draft(client, remix).status_code == 429
    assert draft(client, remix).json()["writesLeftToday"] == 0
    assert fake.calls == 5  # two calls each for the failures (fallback) count as one write each
    assert draft(client, remix).status_code == 429
    assert fake.calls == 5


def test_422_404_and_503_do_not_use_up_a_write(make, monkeypatch):
    client, fake, remix, _ = make(limit="1")
    assert draft(client, remix, voice="pirate").status_code == 422
    assert client.post("/api/remixes/nope/ai-draft", json={"voice": "storyteller"}).status_code == 404
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert draft(client, remix).status_code == 503
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    res = draft(client, remix)
    assert res.status_code == 200 and res.json()["writesLeftToday"] == 0


def test_without_a_key_it_is_503_even_when_the_limit_is_used_up(make, monkeypatch):
    client, fake, remix, _ = make(limit="0")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert draft(client, remix).status_code == 503


# ---- the day ---------------------------------------------------------------------


def test_the_count_starts_again_at_midnight_utc(make):
    client, fake, remix, clock = make(limit="2", now="2026-11-16T23:59:00")
    assert draft(client, remix).status_code == 200
    assert draft(client, remix).status_code == 200
    res = draft(client, remix)
    assert res.status_code == 429
    assert res.headers["Retry-After"] == "60"
    assert "in 1 min." in res.json()["detail"]
    clock.now = at("2026-11-17T00:00:00")
    res = draft(client, remix)
    assert res.status_code == 200
    assert res.json()["writesLeftToday"] == 1


def test_the_day_is_the_utc_day_whatever_the_clocks_zone(make):
    from datetime import timedelta

    client, fake, remix, clock = make(limit="1", now="2026-11-16T23:30:00")
    assert draft(client, remix).status_code == 200
    # 01:30 the next day in UTC+2 is still 23:30 on the 16th in UTC.
    clock.now = at("2026-11-16T23:30:00").astimezone(timezone(timedelta(hours=2)))
    assert draft(client, remix).status_code == 429


@pytest.mark.parametrize(
    "now, text",
    [
        ("2026-11-16T23:59:30", "1 min"),
        ("2026-11-16T20:40:00", "3 h 20 min"),
        ("2026-11-16T23:00:00", "1 h"),
        ("2026-11-16T00:00:00", "24 h"),
        ("2026-11-16T23:15:00", "45 min"),
        ("2026-11-16T20:39:59", "3 h 21 min"),
    ],
)
def test_the_time_left_text(now, text):
    seconds = ai_writer.seconds_until_utc_midnight(at(now))
    assert ai_writer.time_left_text(seconds) == text


def test_retry_after_is_whole_seconds_and_at_least_one():
    assert ai_writer.seconds_until_utc_midnight(at("2026-11-16T23:59:59.500000")) == 1
    assert ai_writer.seconds_until_utc_midnight(at("2026-11-16T00:00:00")) == 86400


# ---- storage -----------------------------------------------------------------------


def test_the_count_survives_a_restart(make):
    client, fake, remix, _ = make(limit="5")
    assert draft(client, remix).json()["writesLeftToday"] == 4
    assert draft(client, remix).json()["writesLeftToday"] == 3
    client.__exit__(None, None, None)
    again, fake2, _, _ = make(limit="5", new_remix=False)
    assert draft(again, remix).json()["writesLeftToday"] == 2


def test_reserve_never_gives_more_than_the_limit(make):
    client, fake, remix, _ = make(limit="2")
    db = client.app.state.session_factory()
    try:
        results = [store.reserve_ai_write(db, "2026-01-01", 2) for _ in range(4)]
        assert results == [1, 0, None, None]
        assert store.reserve_ai_write(db, "2026-01-02", 2) == 1
        assert store.reserve_ai_write(db, "2026-01-03", 0) is None
    finally:
        db.close()


def test_reserve_retries_the_update_when_another_request_inserted_the_day_first(make, monkeypatch):
    """The day's row appears between the existence check and the INSERT: the unique key
    conflict is caught and the conditional UPDATE is tried once."""
    client, fake, remix, _ = make(limit="3")
    factory = client.app.state.session_factory
    other = factory()
    assert store.reserve_ai_write(other, "2026-02-02", 3) == 2  # the other request's row
    other.close()
    db = factory()
    real_scalar = db.scalar
    calls = {"n": 0}

    def first_check_misses(stmt, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # as if the row did not exist yet when this request looked
        return real_scalar(stmt, *args, **kwargs)

    monkeypatch.setattr(db, "scalar", first_check_misses)
    try:
        assert store.reserve_ai_write(db, "2026-02-02", 3) == 1
    finally:
        db.close()


def test_the_log_line_covers_the_daily_limit_without_prompt_or_voice(make, caplog):
    client, fake, remix, _ = make(limit="0")
    with caplog.at_level(logging.INFO, logger="app.routers"):
        draft(client, remix, voice="custom", customVoice="SECRET-VOICE", instructions="SECRET-INSTR")
    lines = [r.getMessage() for r in caplog.records if r.name == "app.routers"]
    assert len(lines) == 1
    assert "outcome=daily_limit" in lines[0] and "model_role=none" in lines[0]
    assert "SECRET" not in lines[0]


def test_concurrent_reserves_never_take_more_than_the_limit(make):
    """Many requests at the same moment: exactly `limit` of them get a write."""
    import threading

    client, fake, remix, _ = make(limit="3")
    factory = client.app.state.session_factory
    results, barrier = [], threading.Barrier(8)

    def reserve():
        db = factory()
        try:
            barrier.wait()
            results.append(store.reserve_ai_write(db, "2026-03-03", 3))
        finally:
            db.close()

    threads = [threading.Thread(target=reserve) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(r for r in results if r is not None) == [0, 1, 2]
    assert results.count(None) == 5
