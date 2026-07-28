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
    # Current placement, if any. Stable re-flow (§5) keeps still-valid
    # placements instead of reshuffling blocks the user is committed to.
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    created_at: datetime | None = None
    """FIFO tiebreak after big3/deadline/priority ranking."""

    # Per-task timing rules. Resolved by the caller against the plan's local day
    # (same contract as EnergyWindow), so the engine stays timezone-agnostic.
    # Unlike energy windows these are HARD: a task is never placed outside them.
    earliest_start: datetime | None = None
    """Never start before this ("not before 10am")."""
    latest_end: datetime | None = None
    """Must be finished by this ("done before school pickup")."""


class EnergyWindow(BaseModel):
    """A concrete time range where a given energy tag is preferred.

    The caller (web BFF) resolves the profile's clock-string energy_profile
    against the plan's local day; the engine stays timezone-agnostic.
    """

    tag: EnergyTag
    start: datetime
    end: datetime


class ScheduleRequest(BaseModel):
    now: datetime
    working_window_start: datetime
    working_window_end: datetime
    fixed_blocks: list[FixedBlock] = []
    flexible_tasks: list[FlexibleTask] = []
    energy_windows: list[EnergyWindow] = []
    default_buffer_minutes: int = Field(default=10, ge=0, le=120)
    wildcard_count: int = Field(default=1, ge=0, le=2)
    wildcard_minutes: int = Field(default=30, gt=0)

    # Daily ceilings so a day can't be stuffed. None = no cap.
    # Big 3 are deliberately exempt: §5 makes them the day's definition of a win
    # and guarantees they are placed before anything else. A cap protects the
    # *rest* of the day from over-commitment, it doesn't veto your three.
    max_deep_minutes: int | None = Field(default=None, ge=0)
    max_scheduled_minutes: int | None = Field(default=None, ge=0)


class PlacedBlock(BaseModel):
    task_id: str
    start: datetime
    end: datetime
    kept: bool = False
    """True when this is a pre-existing placement the re-flow preserved."""


class WildcardBlock(BaseModel):
    start: datetime
    end: datetime


class ScheduleResponse(BaseModel):
    placed: list[PlacedBlock]
    wildcards: list[WildcardBlock] = []
    overflow: list[str]
    """Task ids that did not fit anywhere (not a failure — see §5.5)."""
