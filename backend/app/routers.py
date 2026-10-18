"""HTTP endpoints. Paths and payloads match openapi.yaml at the repository root."""

from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app import generator, store
from app.schemas import (
    AddCompetitorRequest,
    AddToPlanRequest,
    Competitor,
    ContentPlanItem,
    Reel,
    RemixedReel,
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
def add_competitor(payload: AddCompetitorRequest, response: Response, db: Session = Depends(get_db)):
    username = generator.parse_username(payload.instagram_url)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please paste a valid Instagram profile URL like https://instagram.com/username",
        )
    existing = store.find_competitor_by_username(db, username)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    return store.add_competitor(db, username)


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


@router.post("/competitors/{competitor_id}/reels/fetch", response_model=list[Reel])
def fetch_reels_for_competitor(competitor_id: str, db: Session = Depends(get_db)):
    competitor = store.get_competitor(db, competitor_id)
    if not competitor:
        raise not_found("Competitor not found.")
    return store.replace_reels_for_competitor(db, competitor)


@router.get("/reels", response_model=list[Reel])
def list_reels(db: Session = Depends(get_db)):
    return store.list_reels(db)


@router.get("/reels/{reel_id}", response_model=Reel)
def get_reel(reel_id: str, db: Session = Depends(get_db)):
    reel = store.get_reel(db, reel_id)
    if not reel:
        raise not_found("Reel not found.")
    return reel


@router.post(
    "/reels/{reel_id}/remix",
    response_model=RemixedReel,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": RemixedReel, "description": "Existing remix returned"}},
)
def remix_reel(reel_id: str, response: Response, db: Session = Depends(get_db)):
    reel = store.get_reel(db, reel_id)
    if not reel:
        raise not_found("Reel not found.")
    existing = store.get_remix_for_reel(db, reel_id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    return store.add_remix(db, reel)


@router.get("/remixes/{remix_id}", response_model=RemixedReel)
def get_remix(remix_id: str, db: Session = Depends(get_db)):
    remix = store.get_remix(db, remix_id)
    if not remix:
        raise not_found("Remix not found.")
    return remix


@router.patch("/remixes/{remix_id}", response_model=RemixedReel)
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
    responses={200: {"model": ContentPlanItem, "description": "Reel already in the plan"}},
)
def add_to_content_plan(payload: AddToPlanRequest, response: Response, db: Session = Depends(get_db)):
    reel = store.get_reel(db, payload.reel_id)
    if not reel:
        raise not_found("Reel not found.")
    existing = store.get_plan_item_for_reel(db, reel.id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing
    return store.add_plan_item(db, reel)


@router.patch("/content-plan/{plan_item_id}", response_model=ContentPlanItem)
def update_content_plan_item(
    plan_item_id: str, payload: UpdatePlanItemRequest, db: Session = Depends(get_db)
):
    item = store.get_plan_item(db, plan_item_id)
    if not item:
        raise not_found("Plan item not found.")
    return store.update_plan_status(db, item, payload.status)


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
