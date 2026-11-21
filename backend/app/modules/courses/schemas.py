import uuid
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

Locale = Literal["es", "en"]


def _https_url(v: str | None) -> str | None:
    """Enlaces de fotos/grabaciones: solo https y con servidor (nada de javascript:, data: ni http sin cifrar)."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    u = urlparse(v)
    if u.scheme != "https" or not u.netloc or len(v) > 500:
        raise ValueError("Debe ser un enlace https:// válido (máximo 500 caracteres)")
    return v


class CategoryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str


class VenueOut(BaseModel):
    name: str
    address: str
    city: str
    latitude: float | None = None
    longitude: float | None = None
    maps_url: str | None = None


class CourseSummary(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    short_description: str
    category: CategoryOut
    starts_at: datetime
    ends_at: datetime
    timezone: str
    price_minor: int = Field(description="Precio en la unidad monetaria mínima (centavos). Nunca float.")
    currency: str
    language: str
    capacity: int
    seats_available: int
    is_full: bool
    cover_image_url: str | None = None
    cover_image_alt: str | None = None
    status: str


class CourseDetail(CourseSummary):
    description: str
    materials: str | None
    requirements: str | None
    venue: VenueOut
    is_recorded: bool
    requires_approval: bool
    is_finished: bool
    booking_open: bool
    alternates: dict[str, str] = Field(description="slug por idioma, para hreflang/selector de idioma")


class CoursePage(BaseModel):
    items: list[CourseSummary]
    total: int
    limit: int
    offset: int


class Availability(BaseModel):
    course_id: uuid.UUID
    capacity: int
    seats_taken: int
    seats_available: int
    is_full: bool
    booking_open: bool


class TranslationIn(BaseModel):
    name: Annotated[str, Field(min_length=3, max_length=160)]
    short_description: Annotated[str, Field(min_length=3, max_length=300)]
    description: Annotated[str, Field(min_length=3)]
    materials: str | None = None
    requirements: str | None = None


class CourseCreate(BaseModel):
    category_id: uuid.UUID
    venue_id: uuid.UUID
    instructor_id: uuid.UUID | None = None
    starts_at: datetime
    ends_at: datetime
    timezone: str = "America/Bogota"
    capacity: Annotated[int, Field(gt=0, le=500)]
    price_minor: Annotated[int, Field(ge=0)]
    currency: Annotated[str, Field(pattern="^[A-Z]{3}$")] = "COP"
    language: Locale = "es"
    requires_approval: bool = True
    is_recorded: bool = False
    cover_image_url: str | None = None
    cover_image_alt: str | None = None
    translations: dict[Locale, TranslationIn]

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("La fecha debe incluir zona horaria (p. ej. 2026-12-05T09:00:00-05:00)")
        return v

    @field_validator("cover_image_url")
    @classmethod
    def _cover_https(cls, v: str | None) -> str | None:
        return _https_url(v)

    @model_validator(mode="after")
    def _check(self) -> "CourseCreate":
        if "es" not in self.translations:
            raise ValueError("La traducción en español es obligatoria")
        return self


class CourseUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    venue_id: uuid.UUID | None = None
    instructor_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    capacity: Annotated[int | None, Field(gt=0, le=500)] = None
    price_minor: Annotated[int | None, Field(ge=0)] = None
    requires_approval: bool | None = None
    is_recorded: bool | None = None
    recording_status: Literal["NONE", "PLANNED", "PROCESSING", "PUBLISHED"] | None = None
    recording_url: str | None = None
    cover_image_url: str | None = None
    cover_image_alt: str | None = None
    translations: dict[Locale, TranslationIn] | None = None

    @field_validator("cover_image_url", "recording_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:
        return _https_url(v)  # "" o null => quitar el valor

    @model_validator(mode="after")
    def _not_null_where_required(self) -> "CourseUpdate":
        required = (
            "category_id",
            "venue_id",
            "starts_at",
            "ends_at",
            "capacity",
            "price_minor",
            "requires_approval",
            "is_recorded",
            "recording_status",
        )
        for f in required:
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} no puede ser nulo")
        return self


class AdminCourse(CourseSummary):
    seats_taken: int
    requires_approval: bool
    is_recorded: bool
    recording_status: str
    recording_url: str | None
    translations_available: list[str]


class AdminCourseDetail(AdminCourse):
    """Todo lo editable de un curso (para el formulario de edición del panel)."""

    venue_id: uuid.UUID
    instructor_id: uuid.UUID | None
    translations: dict[Locale, TranslationIn]


class AdminCoursePage(BaseModel):
    items: list[AdminCourse]
    total: int
    limit: int
    offset: int


class CategoryCreate(BaseModel):
    slug: Annotated[str, Field(pattern="^[a-z0-9-]{2,80}$")]
    names: dict[Locale, Annotated[str, Field(min_length=2, max_length=120)]]


class VenueCreate(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=160)]
    address: Annotated[str, Field(min_length=3, max_length=255)]
    city: str = "Bogotá"
    latitude: float | None = None
    longitude: float | None = None
    maps_url: str | None = None


class VenueAdminOut(VenueOut):
    id: uuid.UUID
