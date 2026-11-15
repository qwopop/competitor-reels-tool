"""Run by scripts/bugs/apply-and-test.sh on a scratch copy of backend/, never as part of the
normal suite. It proves what remix-intermittent-failure.patch does:

- with the patch, POST /api/videos/{id}/remix returns 500 for videos whose title contains an
  acronym that the patch does not know (CRUD, LLM, CSS, RAG, SQL, MVP), 201 for all others
- every such 500 is an unexpected error, so clipremix.remix.failures increments
- without the patch the same requests all return 201 (the test then fails: it detects the patch)
"""

import os

import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app
from test_telemetry import Recorder

pytestmark = pytest.mark.skipif(not os.getenv("BUG_PATCH_APPLIED"), reason="only run by scripts/bugs/apply-and-test.sh")


def test_remix_fails_for_a_reproducible_subset_and_counts_failures(database_url):
    recorder = Recorder()
    app = create_app(database_url, video_source=SampleSource(), telemetry=recorder.telemetry)
    with TestClient(app, raise_server_exceptions=False) as client:
        comp = client.post("/api/competitors", json={"channelUrl": "https://www.youtube.com/@creator"}).json()
        videos = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()
        statuses = {v["id"]: client.post(f"/api/videos/{v['id']}/remix").status_code for v in videos}
        # Reproducible: the same video fails again, the same videos succeed again.
        again = {v["id"]: client.post(f"/api/videos/{v['id']}/remix").status_code for v in videos}

    failed = [i for i, s in statuses.items() if s == 500]
    ok = [i for i, s in statuses.items() if s == 201]
    assert failed and ok, f"expected a mix of 500 and 201, got {sorted(statuses.values())}"
    assert set(statuses.values()) <= {201, 500}
    assert [i for i, s in again.items() if s == 500] == failed
    assert {i: s for i, s in again.items() if i in ok} == {i: 200 for i in ok}  # existing remix returned
    assert recorder.total("clipremix.remix.failures") == 2 * len(failed)
    # The deterministic condition sits in the video's caption (the title the remix is written from).
    assert all(any(a in v["caption"] for a in ("CRUD", "LLM", "CSS", "RAG", "SQL", "MVP")) for v in videos if v["id"] in failed)
