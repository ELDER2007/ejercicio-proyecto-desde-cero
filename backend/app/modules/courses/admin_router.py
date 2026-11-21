import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.auth.dependencies import Principal, require_permission
from app.modules.courses import service
from app.modules.courses.models import CourseStatus, Venue
from app.modules.courses.schemas import (
    AdminCourse,
    AdminCourseDetail,
    AdminCoursePage,
    CategoryCreate,
    CategoryOut,
    CourseCreate,
    CourseUpdate,
    VenueAdminOut,
    VenueCreate,
)

router = APIRouter(prefix="/admin", tags=["admin-courses"])
Staff = Depends(require_permission("course:write"))


@router.get("/courses", response_model=AdminCoursePage, summary="Todos los cursos (cualquier estado)")
async def list_courses(
    status: Literal["DRAFT", "ACTIVE", "INACTIVE", "CANCELLED"] | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: Principal = Staff,
    session: AsyncSession = Depends(get_session),
) -> AdminCoursePage:
    items, total = await service.admin_list_courses(session, status=status, limit=limit, offset=offset)
    return AdminCoursePage(items=items, total=total, limit=limit, offset=offset)


@router.get("/courses/{course_id}", response_model=AdminCourseDetail, summary="Un curso con todo lo editable")
async def get_course(
    course_id: uuid.UUID, _: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> AdminCourseDetail:
    return await service.admin_get_course(session, course_id)


@router.post("/courses", response_model=AdminCourse, status_code=201, summary="Crear curso (queda en borrador)")
async def create_course(
    body: CourseCreate, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> AdminCourse:
    return await service.create_course(session, body, principal.user.id)


@router.patch("/courses/{course_id}", response_model=AdminCourse, summary="Modificar curso")
async def update_course(
    course_id: uuid.UUID, body: CourseUpdate, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> AdminCourse:
    return await service.update_course(session, course_id, body, principal.user.id)


@router.post("/courses/{course_id}/activate", response_model=AdminCourse)
async def activate(
    course_id: uuid.UUID, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> AdminCourse:
    return await service.set_course_status(session, course_id, CourseStatus.ACTIVE, principal.user.id)


@router.post("/courses/{course_id}/deactivate", response_model=AdminCourse)
async def deactivate(
    course_id: uuid.UUID, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> AdminCourse:
    return await service.set_course_status(session, course_id, CourseStatus.INACTIVE, principal.user.id)


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    body: CategoryCreate, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> CategoryOut:
    return await service.create_category(session, body, principal.user.id)


@router.get("/venues", response_model=list[VenueAdminOut])
async def venues(_: Principal = Staff, session: AsyncSession = Depends(get_session)) -> list[VenueAdminOut]:
    rows = (await session.execute(select(Venue).order_by(Venue.name))).scalars().all()
    return [
        VenueAdminOut(
            id=v.id,
            name=v.name,
            address=v.address,
            city=v.city,
            maps_url=v.maps_url,
            latitude=float(v.latitude) if v.latitude is not None else None,
            longitude=float(v.longitude) if v.longitude is not None else None,
        )
        for v in rows
    ]


@router.post("/venues", response_model=VenueAdminOut, status_code=201)
async def create_venue(
    body: VenueCreate, principal: Principal = Staff, session: AsyncSession = Depends(get_session)
) -> VenueAdminOut:
    v = await service.create_venue(session, body, principal.user.id)
    return VenueAdminOut(
        id=v.id,
        name=v.name,
        address=v.address,
        city=v.city,
        maps_url=v.maps_url,
        latitude=body.latitude,
        longitude=body.longitude,
    )
