"""Pydantic models that define the JSON shape of the API (camelCase on the wire)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Competitor(ApiModel):
    id: str
    channel_id: str
    username: str
    channel_url: str
    display_name: str
    avatar_url: str
    added_at: str


class AddCompetitorRequest(ApiModel):
    channel_url: str = Field(max_length=2048, examples=["https://www.youtube.com/@mkbhd"])


class Video(ApiModel):
    id: str
    competitor_id: str
    competitor_username: str
    youtube_id: str
    permalink: str
    caption: str
    description: str = ""
    thumbnail_url: str
    view_count: int
    like_count: int
    comment_count: int
    posted_at: str
    fetched_at: str


class RemixedVideo(ApiModel):
    id: str
    video_id: str
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
    video_id: str
    status: PlanStatus
    competitor_username: str
    caption: str
    thumbnail_url: str
    permalink: str
    posted_at: str
    added_at: str
    updated_at: str
    film_date: str | None = None
    publish_date: str | None = None
    script_done: bool = False
    recording_done: bool = False
    caption_done: bool = False
    published_done: bool = False


class AddToPlanRequest(ApiModel):
    video_id: str


class UpdatePlanItemRequest(ApiModel):
    """Only the fields sent are changed. Send a date as null to clear it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    status: PlanStatus | None = None
    film_date: date | None = None
    publish_date: date | None = None
    script_done: bool | None = None
    recording_done: bool | None = None
    caption_done: bool | None = None
    published_done: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self):
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        for name in ("status", "script_done", "recording_done", "caption_done", "published_done"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{to_camel(name)} cannot be null.")
        return self


class RemixRequest(ApiModel):
    template: RemixTemplate = "default"


class UpdateRemixRequest(ApiModel):
    # Keep these in step with the column lengths in models.RemixRow.
    title: str | None = Field(default=None, max_length=500)
    hook: str | None = Field(default=None, max_length=1000)
    script: str | None = Field(default=None, max_length=2000)
    cta: str | None = Field(default=None, max_length=500)
