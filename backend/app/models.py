"""SQLAlchemy tables. The database URL is configured from the environment."""

from sqlalchemy import ForeignKey, Integer, String, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CompetitorRow(Base):
    __tablename__ = "competitors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True)
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


def make_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)

    if database_url.startswith("sqlite"):
        # SQLite ignores foreign keys unless asked, and we rely on ON DELETE CASCADE.
        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine
