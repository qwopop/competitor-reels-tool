"""SQLAlchemy tables. The database URL is configured from the environment."""

from sqlalchemy import ForeignKey, Integer, String, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


class CompetitorRow(Base):
    __tablename__ = "competitors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Stored lowercase: Instagram usernames are case-insensitive, so a plain unique constraint works on any database.
    username: Mapped[str] = mapped_column(String(64), unique=True)
    instagram_url: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(128))
    avatar_url: Mapped[str] = mapped_column(String(512))
    added_at: Mapped[str] = mapped_column(String(40))


class ReelRow(Base):
    __tablename__ = "reels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    competitor_id: Mapped[str] = mapped_column(
        ForeignKey("competitors.id", ondelete="CASCADE"), index=True
    )
    competitor_username: Mapped[str] = mapped_column(String(64))
    shortcode: Mapped[str] = mapped_column(String(32))
    permalink: Mapped[str] = mapped_column(String(255))
    caption: Mapped[str] = mapped_column(String(500))
    thumbnail_url: Mapped[str] = mapped_column(String(512))
    view_count: Mapped[int] = mapped_column(Integer)
    like_count: Mapped[int] = mapped_column(Integer)
    comment_count: Mapped[int] = mapped_column(Integer)
    posted_at: Mapped[str] = mapped_column(String(40), index=True)
    fetched_at: Mapped[str] = mapped_column(String(40))


class RemixRow(Base):
    __tablename__ = "remixes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reel_id: Mapped[str] = mapped_column(
        ForeignKey("reels.id", ondelete="CASCADE"), unique=True
    )
    title: Mapped[str] = mapped_column(String(500))
    hook: Mapped[str] = mapped_column(String(1000))
    script: Mapped[str] = mapped_column(String(2000))
    cta: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class ContentPlanRow(Base):
    """A Reel queued for filming. Fields are copied from the Reel, not linked to it.

    Re-fetching a competitor replaces their Reels with new rows. Keeping a
    snapshot here means the filming list survives those refreshes.
    """

    __tablename__ = "content_plan"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # One plan item per source Reel. Not a foreign key: plan items outlive their Reel.
    reel_id: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    competitor_username: Mapped[str] = mapped_column(String(64))
    caption: Mapped[str] = mapped_column(String(500))
    thumbnail_url: Mapped[str] = mapped_column(String(512))
    permalink: Mapped[str] = mapped_column(String(255))
    posted_at: Mapped[str] = mapped_column(String(40))
    added_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


IN_MEMORY_URLS = ("sqlite://", "sqlite:///:memory:")


def make_engine(database_url: str) -> Engine:
    """Build the engine. `DATABASE_URL=sqlite://` keeps everything in memory (nothing is saved)."""
    kwargs: dict = {}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if database_url in IN_MEMORY_URLS:
            # One shared connection, otherwise every connection would see its own empty database.
            kwargs["poolclass"] = StaticPool
    engine = create_engine(database_url, **kwargs)

    if database_url.startswith("sqlite"):
        # SQLite ignores foreign keys unless asked, and we rely on ON DELETE CASCADE.
        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine
