"""Data access. Every database read and write goes through these functions."""

from collections.abc import Callable

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import generator
from app.models import AiWriteUsageRow, ContentPlanRow, CompetitorRow, VideoRow, RemixRow
from app.youtube import ChannelInfo


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


def _take_ai_write(db: Session, day: str, limit: int) -> int | None:
    """The conditional UPDATE: count + 1 only while below the limit. Returns the new count, or None."""
    result = db.execute(
        update(AiWriteUsageRow)
        .where(AiWriteUsageRow.day == day, AiWriteUsageRow.count < limit)
        .values(count=AiWriteUsageRow.count + 1)
    )
    if result.rowcount != 1:
        db.rollback()
        return None
    # Read before the commit: the updated row is still locked by this transaction, so this is our count.
    count = db.scalar(select(AiWriteUsageRow.count).where(AiWriteUsageRow.day == day))
    db.commit()
    return count


def reserve_ai_write(db: Session, day: str, limit: int) -> int | None:
    """Take one AI write for `day` (YYYY-MM-DD, UTC). Returns the writes left after it, or None
    when the day's limit is reached.

    Atomic on SQLite and PostgreSQL: the count only goes up through a conditional UPDATE
    (`count < limit` in the WHERE clause), so two requests can never both take the last write.
    The day's first write INSERTs the row; if another request inserted it first, the
    unique-key conflict is caught and the conditional UPDATE is tried once more.
    """
    if limit <= 0:
        return None
    exists = db.scalar(select(AiWriteUsageRow.day).where(AiWriteUsageRow.day == day))
    if exists is None:
        db.add(AiWriteUsageRow(day=day, count=1))
        try:
            db.commit()
            return limit - 1
        except IntegrityError:
            db.rollback()
    count = _take_ai_write(db, day, limit)
    return None if count is None else max(limit - count, 0)


def list_competitors(db: Session) -> list[CompetitorRow]:
    stmt = select(CompetitorRow).order_by(CompetitorRow.added_at.desc())
    return list(db.scalars(stmt))


def count_competitors(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(CompetitorRow)) or 0


def get_competitor(db: Session, competitor_id: str) -> CompetitorRow | None:
    return db.get(CompetitorRow, competitor_id)


def find_competitor_by_username(db: Session, username: str) -> CompetitorRow | None:
    stmt = select(CompetitorRow).where(
        func.lower(CompetitorRow.username) == username.lower()
    )
    return db.scalars(stmt).first()


def find_competitor_by_channel_id(db: Session, channel_id: str) -> CompetitorRow | None:
    stmt = select(CompetitorRow).where(CompetitorRow.channel_id == channel_id)
    return db.scalars(stmt).first()


def add_competitor(db: Session, info: ChannelInfo) -> tuple[CompetitorRow, bool]:
    competitor = generator.build_competitor(info)
    return _add_or_get(db, competitor, lambda: find_competitor_by_channel_id(db, info.channel_id))


def delete_competitor(db: Session, competitor: CompetitorRow) -> None:
    db.delete(competitor)  # Videos and remixes go with it via ON DELETE CASCADE.
    db.commit()


def replace_videos_for_competitor(
    db: Session, competitor: CompetitorRow, videos: list[VideoRow]
) -> list[VideoRow]:
    """Swap in freshly fetched videos, keeping any video that has a remix or a plan item.

    Deleting a remixed video would cascade to its remix and throw away the
    user's edits, and a planned video could no longer be remixed.
    """
    keep_ids = set(db.scalars(select(RemixRow.video_id))) | set(
        db.scalars(select(ContentPlanRow.video_id))
    )
    db.execute(
        delete(VideoRow).where(
            VideoRow.competitor_id == competitor.id, VideoRow.id.not_in(keep_ids)
        )
    )
    db.add_all(videos)
    db.commit()
    return videos


def list_videos(db: Session) -> list[VideoRow]:
    stmt = select(VideoRow).order_by(VideoRow.posted_at.desc())
    return list(db.scalars(stmt))


def get_video(db: Session, video_id: str) -> VideoRow | None:
    return db.get(VideoRow, video_id)


def get_remix_for_video(db: Session, video_id: str) -> RemixRow | None:
    return db.scalars(select(RemixRow).where(RemixRow.video_id == video_id)).first()


def list_remixes(db: Session) -> list[RemixRow]:
    stmt = select(RemixRow).order_by(RemixRow.updated_at.desc())
    return list(db.scalars(stmt))


def channel_name(db: Session, video: VideoRow) -> str | None:
    competitor = db.get(CompetitorRow, video.competitor_id)
    return competitor.display_name if competitor else None


def add_remix(db: Session, video: VideoRow, template: str = "default") -> tuple[RemixRow, bool]:
    remix = generator.build_remix(video, template, channel_name(db, video))
    video_id = video.id
    return _add_or_get(db, remix, lambda: get_remix_for_video(db, video_id))


def get_remix(db: Session, remix_id: str) -> RemixRow | None:
    return db.get(RemixRow, remix_id)


def apply_remix_template(db: Session, remix: RemixRow, video: VideoRow, template: str) -> RemixRow:
    return update_remix(db, remix, generator.template_fields(video, template, channel_name(db, video)))


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


def get_plan_item_for_video(db: Session, video_id: str) -> ContentPlanRow | None:
    return db.scalars(select(ContentPlanRow).where(ContentPlanRow.video_id == video_id)).first()


def add_plan_item(db: Session, video: VideoRow) -> tuple[ContentPlanRow, bool]:
    item = generator.build_plan_item(video)
    video_id = video.id
    return _add_or_get(db, item, lambda: get_plan_item_for_video(db, video_id))


def update_plan_item(db: Session, item: ContentPlanRow, changes: dict) -> ContentPlanRow:
    """Apply status, dates (YYYY-MM-DD or None) and checklist ticks."""
    for field, value in changes.items():
        setattr(item, field, value)
    item.updated_at = generator.now_iso()
    db.commit()
    return item


def delete_plan_item(db: Session, item: ContentPlanRow) -> None:
    db.delete(item)
    db.commit()
