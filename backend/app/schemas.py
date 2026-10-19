"""Pydantic models that define the JSON shape of the API (camelCase on the wire)."""

from typing import Literal

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
    instagram_url: str = Field(max_length=2048, examples=["https://instagram.com/vibecoder"])


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


PlanStatus = Literal["not_started", "ready", "filmed"]
RemixTemplate = Literal["default", "educational", "storytelling", "promotional"]


class ContentPlanItem(ApiModel):
    id: str
    reel_id: str
    status: PlanStatus
    competitor_username: str
    caption: str
    thumbnail_url: str
    permalink: str
    posted_at: str
    added_at: str
    updated_at: str


class AddToPlanRequest(ApiModel):
    reel_id: str


class UpdatePlanItemRequest(ApiModel):
    status: PlanStatus


class RemixRequest(ApiModel):
    template: RemixTemplate = "default"


class UpdateRemixRequest(ApiModel):
    # Keep these in step with the column lengths in models.RemixRow.
    title: str | None = Field(default=None, max_length=500)
    hook: str | None = Field(default=None, max_length=1000)
    script: str | None = Field(default=None, max_length=2000)
    cta: str | None = Field(default=None, max_length=500)
