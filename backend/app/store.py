"""Data access. Every database read and write goes through these functions."""

from collections.abc import Callable

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import generator
from app.models import ContentPlanRow, CompetitorRow, ReelRow, RemixRow


def _add_or_get(db: Session, row, find: Callable[[], object | None]):
    """Insert `row`. If a unique constraint says another request got there first,
    return that existing row instead. Returns (row, created)."""
    db.add(row)
    try:
        db.commit()
        return row, True
    except IntegrityError:
        db.rollback()
        existing = find()
        if existing is None:
            raise
        return existing, False


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


def add_competitor(db: Session, username: str) -> tuple[CompetitorRow, bool]:
    competitor = generator.build_competitor(username)
    return _add_or_get(db, competitor, lambda: find_competitor_by_username(db, username))


def delete_competitor(db: Session, competitor: CompetitorRow) -> None:
    db.delete(competitor)  # Reels and remixes go with it via ON DELETE CASCADE.
    db.commit()


def replace_reels_for_competitor(db: Session, competitor: CompetitorRow) -> list[ReelRow]:
    """Swap in 20 new Reels, keeping any Reel that has a remix or a plan item.

    Deleting a remixed Reel would cascade to its remix and throw away the
    user's edits, and a planned Reel could no longer be remixed.
    """
    keep_ids = set(db.scalars(select(RemixRow.reel_id))) | set(
        db.scalars(select(ContentPlanRow.reel_id))
    )
    db.execute(
        delete(ReelRow).where(
            ReelRow.competitor_id == competitor.id, ReelRow.id.not_in(keep_ids)
        )
    )
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


def list_remixes(db: Session) -> list[RemixRow]:
    stmt = select(RemixRow).order_by(RemixRow.updated_at.desc())
    return list(db.scalars(stmt))


def add_remix(db: Session, reel: ReelRow, template: str = "default") -> tuple[RemixRow, bool]:
    remix = generator.build_remix(reel, template)
    reel_id = reel.id
    return _add_or_get(db, remix, lambda: get_remix_for_reel(db, reel_id))


def get_remix(db: Session, remix_id: str) -> RemixRow | None:
    return db.get(RemixRow, remix_id)


def apply_remix_template(db: Session, remix: RemixRow, reel: ReelRow, template: str) -> RemixRow:
    return update_remix(db, remix, generator.template_fields(reel, template))


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


def add_plan_item(db: Session, reel: ReelRow) -> tuple[ContentPlanRow, bool]:
    item = generator.build_plan_item(reel)
    reel_id = reel.id
    return _add_or_get(db, item, lambda: get_plan_item_for_reel(db, reel_id))


def update_plan_status(db: Session, item: ContentPlanRow, status: str) -> ContentPlanRow:
    item.status = status
    item.updated_at = generator.now_iso()
    db.commit()
    return item


def delete_plan_item(db: Session, item: ContentPlanRow) -> None:
    db.delete(item)
    db.commit()
