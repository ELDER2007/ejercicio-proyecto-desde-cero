"""Catálogo público y administración de cursos."""

import uuid
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.core.text import slugify
from app.modules.audit import service as audit
from app.modules.bookings.availability import seats_taken, taken_subquery
from app.modules.courses.models import (
    Category,
    CategoryTranslation,
    Course,
    CourseStatus,
    CourseTranslation,
    Venue,
)
from app.modules.courses.schemas import (
    AdminCourse,
    AdminCourseDetail,
    Availability,
    CategoryCreate,
    CategoryOut,
    CourseCreate,
    CourseDetail,
    CourseSummary,
    CourseUpdate,
    TranslationIn,
    VenueCreate,
    VenueOut,
)

PUBLIC_STATUSES = (CourseStatus.ACTIVE.value, CourseStatus.CANCELLED.value)


def booking_is_open(course: Course, seats_left: int, now: datetime) -> bool:
    """¿Se puede reservar ahora? (RN-03 + RN-04). Las reglas completas se re-validan en el servicio de reservas."""
    cutoff = timedelta(hours=get_settings().booking_cutoff_hours)
    return course.status == CourseStatus.ACTIVE.value and seats_left > 0 and course.starts_at - now > cutoff


def _tr(course: Course, locale: str) -> CourseTranslation:
    for t in course.translations:
        if t.locale == locale:
            return t
    raise NotFoundError("Curso no disponible en este idioma.")  # pragma: no cover


def _category_out(cat: Category, locale: str) -> CategoryOut:
    names = {t.locale: t for t in cat.translations}
    t = names.get(locale) or names.get("es")
    return CategoryOut(id=cat.id, slug=t.slug if t else cat.slug, name=t.name if t else cat.slug)


def _summary(course: Course, locale: str, taken: int) -> CourseSummary:
    return _summary_from(course, _tr(course, locale), max(course.capacity - taken, 0))


async def list_categories(session: AsyncSession, locale: str) -> list[CategoryOut]:
    cats = (
        (
            await session.execute(
                select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.slug)
            )
        )
        .scalars()
        .all()
    )
    return [_category_out(c, locale) for c in cats]


async def search_courses(
    session: AsyncSession,
    *,
    locale: str,
    q: str | None,
    category: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    min_price: int | None,
    max_price: int | None,
    language: str | None,
    available_only: bool,
    sort: str,
    limit: int,
    offset: int,
) -> tuple[list[CourseSummary], int]:
    now = clock.now()
    taken = taken_subquery(now)
    stmt = (
        select(Course)
        .join(CourseTranslation, (CourseTranslation.course_id == Course.id) & (CourseTranslation.locale == locale))
        .where(Course.status == CourseStatus.ACTIVE.value, Course.ends_at > now)  # solo activos y no finalizados
    )
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            func.lower(CourseTranslation.name).like(like) | func.lower(CourseTranslation.short_description).like(like)
        )
    if category:
        stmt = (
            stmt.join(Category, Category.id == Course.category_id)
            .join(
                CategoryTranslation,
                (CategoryTranslation.category_id == Category.id) & (CategoryTranslation.locale == locale),
            )
            .where(CategoryTranslation.slug == category)
        )
    if date_from:
        stmt = stmt.where(Course.starts_at >= date_from)
    if date_to:
        stmt = stmt.where(Course.starts_at <= date_to)
    if min_price is not None:
        stmt = stmt.where(Course.price_minor >= min_price)
    if max_price is not None:
        stmt = stmt.where(Course.price_minor <= max_price)
    if language:
        stmt = stmt.where(Course.language == language)
    if available_only:
        stmt = stmt.where(Course.capacity > taken)
    orders: dict[str, ColumnElement[Any]] = {
        "date": Course.starts_at.asc(),
        "price_asc": Course.price_minor.asc(),
        "price_desc": Course.price_minor.desc(),
        "newest": Course.created_at.desc(),
    }
    order = orders[sort]
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    courses = (
        (await session.execute(stmt.order_by(order, Course.id).limit(limit).offset(offset))).scalars().unique().all()
    )
    counts = await seats_taken(session, [c.id for c in courses], now)
    return [_summary(c, locale, counts[c.id]) for c in courses], total


async def get_course_by_slug(session: AsyncSession, slug: str, locale: str) -> CourseDetail:
    course = (
        (
            await session.execute(
                select(Course)
                .join(CourseTranslation, CourseTranslation.course_id == Course.id)
                .where(
                    CourseTranslation.slug == slug,
                    CourseTranslation.locale == locale,
                    Course.status.in_(PUBLIC_STATUSES),
                )
            )
        )
        .scalars()
        .unique()
        .one_or_none()
    )
    if course is None:
        raise NotFoundError("Curso no encontrado.")
    now = clock.now()
    taken = (await seats_taken(session, [course.id], now))[course.id]
    base = _summary(course, locale, taken)
    t = _tr(course, locale)
    v = course.venue
    return CourseDetail(
        **base.model_dump(),
        description=t.description,
        materials=t.materials,
        requirements=t.requirements,
        venue=VenueOut(
            name=v.name,
            address=v.address,
            city=v.city,
            maps_url=v.maps_url,
            latitude=float(v.latitude) if v.latitude is not None else None,
            longitude=float(v.longitude) if v.longitude is not None else None,
        ),
        is_recorded=course.is_recorded,
        requires_approval=course.requires_approval,
        is_finished=course.ends_at <= now,
        booking_open=booking_is_open(course, base.seats_available, now),
        alternates={x.locale: x.slug for x in course.translations},
    )


async def get_availability(session: AsyncSession, course_id: uuid.UUID) -> Availability:
    course = await session.get(Course, course_id)
    if course is None or course.status not in PUBLIC_STATUSES:
        raise NotFoundError("Curso no encontrado.")
    now = clock.now()
    taken = (await seats_taken(session, [course_id], now))[course_id]
    left = max(course.capacity - taken, 0)
    return Availability(
        course_id=course_id,
        capacity=course.capacity,
        seats_taken=taken,
        seats_available=left,
        is_full=left == 0,
        booking_open=booking_is_open(course, left, now),
    )


# ---------------------------------------------------------------- administración


def _validate_one_day(starts: datetime, ends: datetime, tz_name: str) -> None:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError as exc:
        raise BusinessRuleError("Zona horaria no válida.", code="INVALID_TIMEZONE") from exc
    if ends <= starts:
        raise BusinessRuleError("La hora de fin debe ser posterior a la de inicio.", code="INVALID_SCHEDULE")
    if starts.astimezone(tz).date() != ends.astimezone(tz).date():
        raise BusinessRuleError("Los cursos son de un solo día.", code="MULTI_DAY_NOT_ALLOWED")


async def _unique_slug(session: AsyncSession, locale: str, name: str, exclude_course: uuid.UUID | None = None) -> str:
    base = slugify(name)
    candidate, n = base, 2
    while True:
        stmt = select(CourseTranslation.course_id).where(
            CourseTranslation.locale == locale, CourseTranslation.slug == candidate
        )
        found = (await session.execute(stmt)).scalar_one_or_none()
        if found is None or found == exclude_course:
            return candidate
        candidate, n = f"{base}-{n}", n + 1


def _translation(course_id: uuid.UUID, locale: str, data: TranslationIn, slug: str) -> CourseTranslation:
    return CourseTranslation(course_id=course_id, locale=locale, slug=slug, **data.model_dump())


async def _admin_view(session: AsyncSession, course: Course) -> AdminCourse:
    now = clock.now()
    taken = (await seats_taken(session, [course.id], now))[course.id]
    es = next((t for t in course.translations if t.locale == "es"), course.translations[0])
    left = max(course.capacity - taken, 0)
    base = _summary_from(course, es, left)
    return AdminCourse(
        **base.model_dump(),
        seats_taken=taken,
        requires_approval=course.requires_approval,
        is_recorded=course.is_recorded,
        recording_status=course.recording_status,
        recording_url=course.recording_url,
        translations_available=sorted(t.locale for t in course.translations),
    )


def _summary_from(course: Course, t: CourseTranslation, left: int) -> CourseSummary:
    return CourseSummary(
        id=course.id,
        slug=t.slug,
        name=t.name,
        short_description=t.short_description,
        category=_category_out(course.category, t.locale),
        starts_at=course.starts_at,
        ends_at=course.ends_at,
        timezone=course.timezone,
        price_minor=course.price_minor,
        currency=course.currency,
        language=course.language,
        capacity=course.capacity,
        seats_available=left,
        is_full=left == 0,
        cover_image_url=course.cover_image_url,
        cover_image_alt=course.cover_image_alt,
        status=course.status,
    )


async def admin_get_course(session: AsyncSession, course_id: uuid.UUID) -> AdminCourseDetail:
    course = (
        (await session.execute(select(Course).where(Course.id == course_id).execution_options(populate_existing=True)))
        .scalars()
        .unique()
        .one_or_none()
    )
    if course is None:
        raise NotFoundError("Curso no encontrado.")
    base = await _admin_view(session, course)
    return AdminCourseDetail(
        **base.model_dump(),
        venue_id=course.venue_id,
        instructor_id=course.instructor_id,
        translations={
            t.locale: TranslationIn(
                name=t.name,
                short_description=t.short_description,
                description=t.description,
                materials=t.materials,
                requirements=t.requirements,
            )
            for t in course.translations
        },
    )


async def admin_list_courses(
    session: AsyncSession, *, status: str | None, limit: int, offset: int
) -> tuple[list[AdminCourse], int]:
    stmt = select(Course)
    if status:
        stmt = stmt.where(Course.status == status)
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        (await session.execute(stmt.order_by(Course.starts_at.desc()).limit(limit).offset(offset)))
        .scalars()
        .unique()
        .all()
    )
    return [await _admin_view(session, c) for c in rows], total


async def create_course(session: AsyncSession, data: CourseCreate, actor_id: uuid.UUID) -> AdminCourse:
    if data.starts_at <= clock.now():
        raise BusinessRuleError("La fecha de inicio debe ser futura.", code="START_IN_PAST")
    _validate_one_day(data.starts_at, data.ends_at, data.timezone)
    if await session.get(Category, data.category_id) is None or await session.get(Venue, data.venue_id) is None:
        raise NotFoundError("Categoría o sede no encontrada.")
    course = Course(
        **data.model_dump(exclude={"translations"}), status=CourseStatus.DRAFT.value, recording_status="NONE"
    )
    session.add(course)
    await session.flush()
    for locale, tr in data.translations.items():
        session.add(_translation(course.id, locale, tr, await _unique_slug(session, locale, tr.name)))
    await audit.record(
        session,
        actor_id=actor_id,
        action="course.created",
        resource_type="course",
        resource_id=course.id,
        changes={"capacity": data.capacity, "price_minor": data.price_minor, "starts_at": data.starts_at.isoformat()},
    )
    await session.commit()
    return await _admin_view(session, await _fresh(session, course.id))


async def _fresh(session: AsyncSession, course_id: uuid.UUID) -> Course:
    """Recarga el curso con TODAS sus relaciones (en async no hay carga perezosa implícita)."""
    return (
        (await session.execute(select(Course).where(Course.id == course_id).execution_options(populate_existing=True)))
        .scalars()
        .unique()
        .one()
    )


async def _locked_course(session: AsyncSession, course_id: uuid.UUID) -> Course:
    course = (
        (await session.execute(select(Course).where(Course.id == course_id).with_for_update(of=Course)))
        .scalars()
        .unique()
        .one_or_none()
    )
    if course is None:
        raise NotFoundError("Curso no encontrado.")
    return course


async def update_course(
    session: AsyncSession, course_id: uuid.UUID, data: CourseUpdate, actor_id: uuid.UUID
) -> AdminCourse:
    course = await _locked_course(session, course_id)  # bloqueo: serializa con reservas concurrentes
    if course.status == CourseStatus.CANCELLED.value:
        raise ConflictError("Un curso cancelado no se puede modificar.", code="COURSE_CANCELLED")
    changes = data.model_dump(exclude_unset=True, exclude={"translations"})
    if "capacity" in changes and changes["capacity"] is not None:
        taken = (await seats_taken(session, [course.id], clock.now()))[course.id]
        if changes["capacity"] < taken:  # RN-16
            raise BusinessRuleError(
                f"No puedes reducir la capacidad por debajo de las plazas ocupadas ({taken}).",
                code="CAPACITY_BELOW_BOOKINGS",
            )
    starts = changes.get("starts_at", course.starts_at)
    ends = changes.get("ends_at", course.ends_at)
    if "starts_at" in changes or "ends_at" in changes:
        _validate_one_day(starts, ends, course.timezone)
    audited: dict[str, Any] = {}
    for k, v in changes.items():
        if getattr(course, k) == v:
            continue  # el formulario envía el curso entero: solo se anota lo que de verdad cambió
        if k in ("recording_url", "cover_image_url"):
            audited[k] = "changed"
        else:
            audited[k] = v.isoformat() if isinstance(v, datetime) else (str(v) if isinstance(v, uuid.UUID) else v)
        setattr(course, k, v)
    if data.translations:
        existing = {t.locale: t for t in course.translations}
        translated: list[str] = []
        for locale, tr in data.translations.items():
            if locale in existing:
                new_values = tr.model_dump()
                if any((getattr(existing[locale], f) or None) != (val or None) for f, val in new_values.items()):
                    translated.append(locale)
                    for f, val in new_values.items():
                        setattr(existing[locale], f, val)  # el slug NO cambia (URLs estables para SEO)
            else:
                session.add(_translation(course.id, locale, tr, await _unique_slug(session, locale, tr.name)))
                translated.append(locale)
        if translated:
            audited["translations"] = sorted(translated)
    if audited:  # un guardado sin cambios no deja rastro
        await audit.record(
            session,
            actor_id=actor_id,
            action="course.updated",
            resource_type="course",
            resource_id=course.id,
            changes=audited,
        )
    await session.commit()
    return await _admin_view(session, await _fresh(session, course.id))


async def set_course_status(
    session: AsyncSession, course_id: uuid.UUID, new_status: CourseStatus, actor_id: uuid.UUID
) -> AdminCourse:
    course = await _locked_course(session, course_id)
    if course.status == CourseStatus.CANCELLED.value:
        raise ConflictError("Un curso cancelado no se puede reactivar.", code="COURSE_CANCELLED")
    if new_status == CourseStatus.ACTIVE:
        if course.ends_at <= clock.now():
            raise BusinessRuleError("No se puede activar un curso ya finalizado.", code="COURSE_FINISHED")
        if not any(t.locale == "es" for t in course.translations):
            raise BusinessRuleError("Falta la traducción en español.", code="MISSING_TRANSLATION")
    previous = course.status
    course.status = new_status.value
    await audit.record(
        session,
        actor_id=actor_id,
        action=f"course.{new_status.value.lower()}",
        resource_type="course",
        resource_id=course.id,
        changes={"from": previous, "to": new_status.value},
    )
    await session.commit()
    return await _admin_view(session, await _fresh(session, course.id))


async def create_category(session: AsyncSession, data: CategoryCreate, actor_id: uuid.UUID) -> CategoryOut:
    if (await session.execute(select(Category.id).where(Category.slug == data.slug))).scalar_one_or_none():
        raise ConflictError("La categoría ya existe.", code="CATEGORY_EXISTS")
    cat = Category(slug=data.slug)
    cat.translations = [
        CategoryTranslation(locale=loc, name=name, slug=slugify(name)) for loc, name in data.names.items()
    ]
    session.add(cat)
    await audit.record(
        session, actor_id=actor_id, action="category.created", resource_type="category", resource_id=data.slug
    )
    await session.commit()
    return _category_out(cat, "es")


async def create_venue(session: AsyncSession, data: VenueCreate, actor_id: uuid.UUID) -> Venue:
    venue = Venue(**data.model_dump())
    session.add(venue)
    await session.flush()
    await audit.record(session, actor_id=actor_id, action="venue.created", resource_type="venue", resource_id=venue.id)
    await session.commit()
    return venue


async def record_view(session: AsyncSession, course_id: uuid.UUID) -> None:
    """Evento `course_viewed` para analítica. Sin IP, sin usuario: solo qué curso se vio y cuándo."""
    from app.modules.core_events import service as events

    course = await session.get(Course, course_id)
    if course is None or course.status not in PUBLIC_STATUSES:
        raise NotFoundError("Curso no encontrado.")
    events.emit(session, "course_viewed", "course", course_id, {"course_id": str(course_id)})
    await session.commit()
