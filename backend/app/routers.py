"""HTTP endpoints. Paths and payloads match openapi.yaml at the repository root."""

import logging
import time
from collections.abc import Iterator

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import ai_writer, store
from app.config import app_environment, app_version
from app.telemetry import untraced
from app.youtube import YouTubeError, parse_channel_input
from app.schemas import (
    AddCompetitorRequest,
    AiDraft,
    AiDraftRequest,
    AddToPlanRequest,
    Competitor,
    ContentPlanItem,
    Video,
    RemixedVideo,
    RemixRequest,
    UpdatePlanItemRequest,
    UpdateRemixRequest,
)

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """For load balancers, Docker and CI: is the app up, and can it reach its database?

    `version` is the deployed git commit (see app.config.app_version) so CI can
    tell when a new deploy is live; `environment` is APP_ENV (dev, prod or local).
    """
    try:
        with untraced():  # polled every few seconds: keep it out of the traces
            db.execute(text("SELECT 1"))
    except Exception as err:  # any database failure means "not healthy"
        raise HTTPException(status_code=503, detail="Database unavailable.") from err
    return {"status": "ok", "database": "ok", "version": app_version(), "environment": app_environment()}


def not_found(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)


@router.get("/competitors", response_model=list[Competitor])
def list_competitors(db: Session = Depends(get_db)):
    return store.list_competitors(db)


@router.post(
    "/competitors",
    response_model=Competitor,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": Competitor, "description": "Competitor already tracked"}},
)
def add_competitor(
    payload: AddCompetitorRequest, request: Request, response: Response, db: Session = Depends(get_db)
):
    ref = parse_channel_input(payload.channel_url)
    if not ref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please paste a YouTube channel link like https://www.youtube.com/@mkbhd, an @handle, or a video link",
        )
    # Skip the network when the channel is clearly tracked already.
    if ref.kind == "id":
        existing = store.find_competitor_by_channel_id(db, ref.value)
    elif ref.kind == "handle":
        existing = store.find_competitor_by_username(db, ref.value)
    else:
        existing = None
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    try:
        info = request.app.state.video_source.resolve_channel(ref)
    except YouTubeError as err:
        raise HTTPException(status_code=err.status, detail=str(err)) from err
    existing = store.find_competitor_by_channel_id(db, info.channel_id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    competitor, created = store.add_competitor(db, info)
    if not created:
        response.status_code = status.HTTP_200_OK
    else:
        request.app.state.telemetry.competitors_added.add(1)
        log.info("Competitor added: %s", competitor.display_name)
    return competitor


@router.delete(
    "/competitors/{competitor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def remove_competitor(competitor_id: str, db: Session = Depends(get_db)):
    competitor = store.get_competitor(db, competitor_id)
    if not competitor:
        raise not_found("Competitor not found.")
    store.delete_competitor(db, competitor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/competitors/{competitor_id}/videos/fetch", response_model=list[Video])
def fetch_videos_for_competitor(competitor_id: str, request: Request, db: Session = Depends(get_db)):
    competitor = store.get_competitor(db, competitor_id)
    if not competitor:
        raise not_found("Competitor not found.")
    telemetry = request.app.state.telemetry
    started = time.perf_counter()
    try:
        videos = request.app.state.video_source.fetch_videos(competitor)
    except Exception as err:  # any source failure is outcome=error
        telemetry.record_fetch("error", time.perf_counter() - started)
        log.warning("Fetching videos failed: %s", err)
        if isinstance(err, YouTubeError):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(err)) from err
        raise
    if not videos:
        telemetry.record_fetch("empty", time.perf_counter() - started)
        log.info("Fetched no videos for %s", competitor.display_name)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{competitor.display_name} has no public videos on YouTube yet.",
        )
    telemetry.record_fetch("success", time.perf_counter() - started)
    log.info("Fetched %d videos for %s", len(videos), competitor.display_name)
    return store.replace_videos_for_competitor(db, competitor, videos)


@router.get("/videos", response_model=list[Video])
def list_videos(db: Session = Depends(get_db)):
    return store.list_videos(db)


@router.get("/videos/{video_id}", response_model=Video)
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = store.get_video(db, video_id)
    if not video:
        raise not_found("Video not found.")
    return video


@router.post(
    "/videos/{video_id}/remix",
    response_model=RemixedVideo,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": RemixedVideo, "description": "Existing remix returned"}},
)
def remix_video(
    video_id: str,
    request: Request,
    response: Response,
    payload: RemixRequest | None = Body(default=None),
    db: Session = Depends(get_db),
):
    video = store.get_video(db, video_id)
    if not video:
        raise not_found("Video not found.")
    existing = store.get_remix_for_video(db, video_id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    template = payload.template if payload else "default"
    telemetry = request.app.state.telemetry
    with telemetry.remix_failure_guard():
        remix, created = store.add_remix(db, video, template)
    if not created:
        response.status_code = status.HTTP_200_OK
    else:
        telemetry.remixes_created.add(1)
        log.info("Remix created with template %s", template)
    return remix


@router.get("/videos/{video_id}/remix/current", response_model=RemixedVideo)
def get_remix_for_video(video_id: str, db: Session = Depends(get_db)):
    remix = store.get_remix_for_video(db, video_id)
    if not remix:
        raise not_found("No remix for this video yet.")
    return remix


@router.get("/remixes", response_model=list[RemixedVideo])
def list_remixes(db: Session = Depends(get_db)):
    return store.list_remixes(db)


@router.post("/remixes/{remix_id}/apply-template", response_model=RemixedVideo)
def apply_remix_template(
    remix_id: str, payload: RemixRequest, request: Request, db: Session = Depends(get_db)
):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    video = store.get_video(db, remix.video_id)
    if not video:
        raise not_found("Video not found.")
    with request.app.state.telemetry.remix_failure_guard():
        return store.apply_remix_template(db, remix, video, payload.template)


@router.post(
    "/remixes/{remix_id}/ai-draft",
    response_model=AiDraft,
    responses={code: {"description": text} for code, text in (
        (404, "Remix or source video not found"),
        (429, "Gemini's quota is used up"),
        (502, "Gemini failed"),
        (503, "AI writing is not configured"),
    )},
)
def write_remix_with_ai(
    remix_id: str, payload: AiDraftRequest, request: Request, db: Session = Depends(get_db)
):
    """A Gemini draft in the chosen voice. Returned only: the remix itself is not changed."""
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    video = store.get_video(db, remix.video_id)
    if not video:
        raise not_found("Video not found.")
    facts = ai_writer.facts_from_video(video, store.channel_name(db, video))
    voice = ai_writer.voice_text(payload.voice, payload.custom_voice)
    model = ai_writer.model_from_env()
    telemetry = request.app.state.telemetry
    started = time.perf_counter()
    try:
        draft = ai_writer.write_draft(
            request.app.state.gemini, ai_writer.api_key_from_env(), model, facts, voice, payload.instructions
        )
    except ai_writer.AiWriteError as err:
        # One line per AI write: outcome, model and duration, never the prompt, voice or output.
        log.warning(
            "AI write failed: outcome=%s model_role=%s model=%s duration=%.2fs attempts=[%s]",
            err.outcome, err.model_role, err.model,
            time.perf_counter() - started, "; ".join(err.attempts),
        )
        telemetry.record_ai_write(err.outcome, err.model_role)
        raise HTTPException(status_code=err.status, detail=err.detail) from None
    log.info(
        "AI write: outcome=success model_role=%s model=%s duration=%.2fs",
        draft.model_role, draft.model, time.perf_counter() - started,
    )
    telemetry.record_ai_write("success", draft.model_role)
    return AiDraft(**draft.fields, model=draft.model)


@router.get("/remixes/{remix_id}", response_model=RemixedVideo)
def get_remix(remix_id: str, db: Session = Depends(get_db)):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    return remix


@router.patch("/remixes/{remix_id}", response_model=RemixedVideo)
def update_remix(
    remix_id: str, payload: UpdateRemixRequest, request: Request, db: Session = Depends(get_db)
):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    with request.app.state.telemetry.remix_failure_guard():
        return store.update_remix(db, remix, changes)


@router.get("/content-plan", response_model=list[ContentPlanItem])
def list_content_plan(db: Session = Depends(get_db)):
    return store.list_plan_items(db)


@router.post(
    "/content-plan",
    response_model=ContentPlanItem,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": ContentPlanItem, "description": "Video already in the plan"}},
)
def add_to_content_plan(
    payload: AddToPlanRequest, request: Request, response: Response, db: Session = Depends(get_db)
):
    video = store.get_video(db, payload.video_id)
    if not video:
        raise not_found("Video not found.")
    existing = store.get_plan_item_for_video(db, video.id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    item, created = store.add_plan_item(db, video)
    if not created:
        response.status_code = status.HTTP_200_OK
    else:
        request.app.state.telemetry.plan_items_added.add(1)
        log.info("Plan item added")
    return item


@router.patch("/content-plan/{plan_item_id}", response_model=ContentPlanItem)
def update_content_plan_item(
    plan_item_id: str, payload: UpdatePlanItemRequest, db: Session = Depends(get_db)
):
    item = store.get_plan_item(db, plan_item_id)
    if not item:
        raise not_found("Plan item not found.")
    changes = {
        name: (value.isoformat() if hasattr(value, "isoformat") else value)
        for name, value in payload.model_dump(exclude_unset=True, by_alias=False).items()
    }
    return store.update_plan_item(db, item, changes)


@router.delete(
    "/content-plan/{plan_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def remove_from_content_plan(plan_item_id: str, db: Session = Depends(get_db)):
    item = store.get_plan_item(db, plan_item_id)
    if not item:
        raise not_found("Plan item not found.")
    store.delete_plan_item(db, item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
