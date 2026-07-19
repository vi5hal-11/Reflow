"""Pydantic models for the scheduler API (CLAUDE.md §5 inputs/outputs)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EnergyTag = Literal["deep", "shallow", "admin"]


class FixedBlock(BaseModel):
    id: str
    title: str
    start: datetime
    end: datetime


class FlexibleTask(BaseModel):
    id: str
    title: str
    estimated_minutes: int = Field(gt=0)
    energy_tag: EnergyTag | None = None
    priority: int = Field(default=2, ge=1, le=3)
    deadline: datetime | None = None
    is_big3: bool = False


class ScheduleRequest(BaseModel):
    now: datetime
    working_window_start: datetime
    working_window_end: datetime
    fixed_blocks: list[FixedBlock] = []
    flexible_tasks: list[FlexibleTask] = []
    energy_profile: dict[EnergyTag, list[str]] = {}
    default_buffer_minutes: int = Field(default=10, ge=0, le=120)


class PlacedBlock(BaseModel):
    task_id: str
    start: datetime
    end: datetime


class ScheduleResponse(BaseModel):
    placed: list[PlacedBlock]
    overflow: list[str]
    """Task ids that did not fit anywhere (not a failure — see §5.5)."""
