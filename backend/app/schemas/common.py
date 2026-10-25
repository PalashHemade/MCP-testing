import enum
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class CompletenessStatus(str, enum.Enum):
    """Whether a result set is known to be the full answer.

    COMPLETE: every matching record was retrieved (no more pages, no
    unresolved filters).
    PARTIAL: more records exist (pagination) or some inputs were
    unresolved (e.g. ambiguous driver name) - callers (planner/validator)
    must not treat a PARTIAL result as exhaustive.
    UNKNOWN: completeness could not be determined (e.g. upstream failure).
    """

    COMPLETE = "complete"
    PARTIAL = "partial"
    UNKNOWN = "unknown"


class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class PageInfo(BaseModel):
    limit: int
    offset: int
    returned_count: int
    total_count: int | None = None
    has_more: bool


class DateRangeFilter(BaseModel):
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "DateRangeFilter":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class ToolError(BaseModel):
    code: str
    message: str


Money = Decimal
