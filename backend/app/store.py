"""Data access. Every database read and write goes through these functions."""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import generator
from app.models import ContentPlanRow, CompetitorRow, ReelRow, RemixRow


def list_competitors(db: Session) -> list[CompetitorRow]:
    stmt = select(CompetitorRow).order_by(CompetitorRow.added_at.desc())
    return list(db.scalars(stmt))


def get_competitor(db: Session, competitor_id: str) -> CompetitorRow | None:
    return db.get(CompetitorRow, competitor_id)


def find_competitor_by_username(db: Session, username: str) -> CompetitorRow | None:
    stmt = select(CompetitorRow).where(
        func.lower(CompetitorRow.username) == username.lower()
    )
    return db.scalars(stmt).first()


def add_competitor(db: Session, username: str) -> CompetitorRow:
    competitor = generator.build_competitor(username)
    db.add(competitor)
    db.commit()
    return competitor


def delete_competitor(db: Session, competitor: CompetitorRow) -> None:
    db.delete(competitor)  # Reels and remixes go with it via ON DELETE CASCADE.
    db.commit()


def replace_reels_for_competitor(db: Session, competitor: CompetitorRow) -> list[ReelRow]:
    db.execute(delete(ReelRow).where(ReelRow.competitor_id == competitor.id))
    reels = generator.build_reels(competitor)
    db.add_all(reels)
    db.commit()
    return reels


def list_reels(db: Session) -> list[ReelRow]:
    stmt = select(ReelRow).order_by(ReelRow.posted_at.desc())
    return list(db.scalars(stmt))


def get_reel(db: Session, reel_id: str) -> ReelRow | None:
    return db.get(ReelRow, reel_id)


def get_remix_for_reel(db: Session, reel_id: str) -> RemixRow | None:
    return db.scalars(select(RemixRow).where(RemixRow.reel_id == reel_id)).first()


def add_remix(db: Session, reel: ReelRow) -> RemixRow:
    remix = generator.build_remix(reel)
    db.add(remix)
    db.commit()
    return remix


def get_remix(db: Session, remix_id: str) -> RemixRow | None:
    return db.get(RemixRow, remix_id)


def update_remix(db: Session, remix: RemixRow, changes: dict[str, str]) -> RemixRow:
    for field, value in changes.items():
        setattr(remix, field, value)
    remix.updated_at = generator.now_iso()
    db.commit()
    return remix


def list_plan_items(db: Session) -> list[ContentPlanRow]:
    stmt = select(ContentPlanRow).order_by(ContentPlanRow.added_at.desc())
    return list(db.scalars(stmt))


def get_plan_item(db: Session, item_id: str) -> ContentPlanRow | None:
    return db.get(ContentPlanRow, item_id)


def get_plan_item_for_reel(db: Session, reel_id: str) -> ContentPlanRow | None:
    return db.scalars(select(ContentPlanRow).where(ContentPlanRow.reel_id == reel_id)).first()


def add_plan_item(db: Session, reel: ReelRow) -> ContentPlanRow:
    item = generator.build_plan_item(reel)
    db.add(item)
    db.commit()
    return item


def update_plan_status(db: Session, item: ContentPlanRow, status: str) -> ContentPlanRow:
    item.status = status
    item.updated_at = generator.now_iso()
    db.commit()
    return item


def delete_plan_item(db: Session, item: ContentPlanRow) -> None:
    db.delete(item)
    db.commit()
