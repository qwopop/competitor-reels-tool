"""HTTP endpoints. Paths and payloads match openapi.yaml at the repository root."""

from collections.abc import Iterator

import os

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import store
from app.youtube import YouTubeError, parse_channel_input
from app.schemas import (
    AddCompetitorRequest,
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


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """For load balancers, Docker and CI: is the app up, and can it reach its database?

    `version` is the deployed git commit (Render sets RENDER_GIT_COMMIT; the
    Dockerfile can set APP_VERSION), so CI can tell when a new deploy is live.
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception as err:  # any database failure means "not healthy"
        raise HTTPException(status_code=503, detail="Database unavailable.") from err
    version = os.getenv("RENDER_GIT_COMMIT") or os.getenv("APP_VERSION") or "dev"
    return {"status": "ok", "database": "ok", "version": version}


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
    try:
        videos = request.app.state.video_source.fetch_videos(competitor)
    except YouTubeError as err:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(err)) from err
    if not videos:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{competitor.display_name} has no public videos on YouTube yet.",
        )
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
    remix, created = store.add_remix(db, video, template)
    if not created:
        response.status_code = status.HTTP_200_OK
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
def apply_remix_template(remix_id: str, payload: RemixRequest, db: Session = Depends(get_db)):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    video = store.get_video(db, remix.video_id)
    if not video:
        raise not_found("Video not found.")
    return store.apply_remix_template(db, remix, video, payload.template)


@router.get("/remixes/{remix_id}", response_model=RemixedVideo)
def get_remix(remix_id: str, db: Session = Depends(get_db)):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    return remix


@router.patch("/remixes/{remix_id}", response_model=RemixedVideo)
def update_remix(remix_id: str, payload: UpdateRemixRequest, db: Session = Depends(get_db)):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
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
def add_to_content_plan(payload: AddToPlanRequest, response: Response, db: Session = Depends(get_db)):
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
