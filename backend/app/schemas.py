"""Pydantic models that define the JSON shape of the API (camelCase on the wire)."""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Competitor(ApiModel):
    id: str
    username: str
    instagram_url: str
    display_name: str
    avatar_url: str
    added_at: str


class AddCompetitorRequest(ApiModel):
    instagram_url: str = Field(examples=["https://instagram.com/vibecoder"])


class Reel(ApiModel):
    id: str
    competitor_id: str
    competitor_username: str
    shortcode: str
    permalink: str
    caption: str
    thumbnail_url: str
    view_count: int
    like_count: int
    comment_count: int
    posted_at: str
    fetched_at: str


class RemixedReel(ApiModel):
    id: str
    reel_id: str
    title: str
    hook: str
    script: str
    cta: str
    created_at: str
    updated_at: str


class UpdateRemixRequest(ApiModel):
    title: str | None = None
    hook: str | None = None
    script: str | None = None
    cta: str | None = None
