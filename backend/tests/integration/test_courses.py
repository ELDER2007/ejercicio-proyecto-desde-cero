from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.modules.audit.models import AuditLog
from app.modules.bookings.models import Booking
from app.modules.courses.models import Category, CategoryTranslation, CourseTranslation, Venue
from tests.factories import make_course, make_user
from tests.integration.conftest import REGISTER, csrf_headers
from tests.integration.test_rbac import login, make_staff

API = "/api/v1"


def payload(category_id, venue_id, **over):
    start = datetime.now(UTC) + timedelta(days=10)
    body = {
        "category_id": str(category_id),
        "venue_id": str(venue_id),
        "starts_at": start.replace(hour=14, minute=0, second=0, microsecond=0).isoformat(),
        "ends_at": start.replace(hour=18, minute=0, second=0, microsecond=0).isoformat(),
        "capacity": 5,
        "price_minor": 12_000_000,
        "currency": "COP",
        "translations": {
            "es": {
                "name": "Cerámica para principiantes",
                "short_description": "Torno y modelado",
                "description": "Largo",
            },
            "en": {"name": "Beginner Ceramics", "short_description": "Wheel and hand-building", "description": "Long"},
        },
    }
    return body | over


async def admin_client(client, session):
    await make_staff(session, "admin@tallerya.co", "ADMIN")
    await login(client, "admin@tallerya.co")


async def base_refs(session):
    cat = Category(slug="ceramica")
    cat.translations = [
        CategoryTranslation(locale="es", name="Cerámica", slug="ceramica"),
        CategoryTranslation(locale="en", name="Ceramics", slug="ceramics"),
    ]
    venue = Venue(name="Sede Chapinero", address="Cra 7 # 45-10")
    session.add_all([cat, venue])
    await session.commit()
    return cat, venue


async def test_catalog_only_shows_active_future_courses(client, session):
    active = await make_course(session, status="ACTIVE", slug="activo")
    await make_course(session, status="DRAFT", slug="borrador")
    await make_course(session, status="INACTIVE", slug="inactivo")
    await make_course(session, status="CANCELLED", slug="cancelado")
    await session.commit()
    r = await client.get(f"{API}/courses")
    assert r.status_code == 200
    assert [i["slug"] for i in r.json()["items"]] == ["activo"] and r.json()["total"] == 1
    assert r.json()["items"][0]["id"] == str(active.id)


async def test_search_filters_and_sort(client, session):
    await make_course(session, price_minor=5_000_000, slug="barato")
    await make_course(session, price_minor=20_000_000, slug="caro")
    await session.commit()
    r = await client.get(f"{API}/courses?min_price=10000000")
    assert [i["slug"] for i in r.json()["items"]] == ["caro"]
    r = await client.get(f"{API}/courses?sort=price_desc")
    assert [i["slug"] for i in r.json()["items"]] == ["caro", "barato"]
    r = await client.get(f"{API}/courses?q=principiantes")
    assert r.json()["total"] == 2
    assert (await client.get(f"{API}/courses?q=zzz")).json()["total"] == 0


async def test_i18n_detail_and_alternates(client, session):
    c = await make_course(session, slug="ceramica-principiantes")
    session.add(
        CourseTranslation(
            course_id=c.id,
            locale="en",
            slug="beginner-ceramics",
            name="Beginner Ceramics",
            short_description="Learn the basics",
            description="Full",
        )
    )
    await session.commit()
    es = (await client.get(f"{API}/courses/ceramica-principiantes?locale=es")).json()
    en = (await client.get(f"{API}/courses/beginner-ceramics?locale=en")).json()
    assert es["name"] == "Cerámica para principiantes" and en["name"] == "Beginner Ceramics"
    assert es["alternates"] == {"es": "ceramica-principiantes", "en": "beginner-ceramics"}
    assert (await client.get(f"{API}/courses/beginner-ceramics?locale=es")).status_code == 404  # slug de otro idioma


async def test_draft_course_is_not_public(client, session):
    await make_course(session, status="DRAFT", slug="oculto")
    await session.commit()
    assert (await client.get(f"{API}/courses/oculto")).status_code == 404


async def test_availability_counts_only_seat_holding_bookings(client, session):
    c = await make_course(session, capacity=3)
    u1, u2, u3, u4 = [await make_user(session) for _ in range(4)]
    future = datetime.now(UTC) + timedelta(hours=5)
    past = datetime.now(UTC) - timedelta(hours=1)
    session.add_all(
        [
            Booking(course_id=c.id, user_id=u1.id, status="CONFIRMED", price_minor=1, currency="COP"),
            Booking(
                course_id=c.id,
                user_id=u2.id,
                status="PENDING_PAYMENT",
                expires_at=future,
                price_minor=1,
                currency="COP",
            ),
            # hold vencido: NO ocupa plaza aunque el job aún no lo haya marcado EXPIRED
            Booking(
                course_id=c.id, user_id=u3.id, status="PENDING_PAYMENT", expires_at=past, price_minor=1, currency="COP"
            ),
            Booking(course_id=c.id, user_id=u4.id, status="CANCELLED", price_minor=1, currency="COP"),
        ]
    )
    await session.commit()
    a = (await client.get(f"{API}/courses/{c.id}/availability")).json()
    assert a["seats_taken"] == 2 and a["seats_available"] == 1 and a["is_full"] is False and a["booking_open"] is True


async def test_full_course_is_flagged_and_filterable(client, session):
    c = await make_course(session, capacity=1, slug="lleno")
    await make_course(session, capacity=5, slug="libre")
    u = await make_user(session)
    session.add(Booking(course_id=c.id, user_id=u.id, status="CONFIRMED", price_minor=1, currency="COP"))
    await session.commit()
    allc = {i["slug"]: i for i in (await client.get(f"{API}/courses")).json()["items"]}
    assert allc["lleno"]["is_full"] and allc["lleno"]["seats_available"] == 0
    avail = (await client.get(f"{API}/courses?available_only=true")).json()["items"]
    assert [i["slug"] for i in avail] == ["libre"]


async def test_booking_closed_within_24h(client, session):
    c = await make_course(session, hours_ahead=20)
    await session.commit()
    assert (await client.get(f"{API}/courses/{c.id}/availability")).json()["booking_open"] is False


async def test_admin_create_edit_activate_flow_with_audit(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    r = await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert r.json()["status"] == "DRAFT" and r.json()["slug"] == "ceramica-para-principiantes"
    assert (await client.get(f"{API}/courses/ceramica-para-principiantes")).status_code == 404  # borrador oculto

    r = await client.post(f"{API}/admin/courses/{cid}/activate", headers=csrf_headers(client))
    assert r.status_code == 200 and r.json()["status"] == "ACTIVE"
    assert (await client.get(f"{API}/courses/ceramica-para-principiantes")).status_code == 200
    assert (await client.get(f"{API}/courses/beginner-ceramics?locale=en")).status_code == 200

    r = await client.patch(f"{API}/admin/courses/{cid}", json={"capacity": 8}, headers=csrf_headers(client))
    assert r.json()["capacity"] == 8
    await client.post(f"{API}/admin/courses/{cid}/deactivate", headers=csrf_headers(client))
    assert (await client.get(f"{API}/courses/ceramica-para-principiantes")).status_code == 404

    actions = [a.action for a in (await session.execute(select(AuditLog).order_by(AuditLog.id))).scalars()]
    assert actions == ["course.created", "course.active", "course.updated", "course.inactive"]


async def test_slug_collision_gets_suffix(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    a = await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    b = await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    assert a.json()["slug"] == "ceramica-para-principiantes" and b.json()["slug"] == "ceramica-para-principiantes-2"


async def test_admin_validation_rules(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    h = csrf_headers(client)
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    assert (
        await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id, starts_at=past), headers=h)
    ).json()["error"]["code"] == "START_IN_PAST"
    start = datetime.now(UTC) + timedelta(days=10)
    multi = payload(cat.id, venue.id, starts_at=start.isoformat(), ends_at=(start + timedelta(days=2)).isoformat())
    assert (await client.post(f"{API}/admin/courses", json=multi, headers=h)).json()["error"][
        "code"
    ] == "MULTI_DAY_NOT_ALLOWED"
    assert (
        await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id, capacity=0), headers=h)
    ).status_code == 422
    assert (
        await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id, price_minor=-5), headers=h)
    ).status_code == 422
    no_es = payload(cat.id, venue.id, translations={"en": payload(cat.id, venue.id)["translations"]["en"]})
    assert (await client.post(f"{API}/admin/courses", json=no_es, headers=h)).status_code == 422


async def test_cannot_reduce_capacity_below_bookings(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    cid = (
        await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    ).json()["id"]
    for _ in range(3):
        u = await make_user(session)
        session.add(Booking(course_id=cid, user_id=u.id, status="CONFIRMED", price_minor=1, currency="COP"))
    await session.commit()
    r = await client.patch(f"{API}/admin/courses/{cid}", json={"capacity": 2}, headers=csrf_headers(client))
    assert r.status_code == 422 and r.json()["error"]["code"] == "CAPACITY_BELOW_BOOKINGS"
    assert (
        await client.patch(f"{API}/admin/courses/{cid}", json={"capacity": 3}, headers=csrf_headers(client))
    ).status_code == 200


async def test_client_cannot_use_course_admin(client, session):
    cat, venue = await base_refs(session)
    await client.post(f"{API}/auth/register", json=REGISTER)
    r = await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    assert r.status_code == 403
    assert (await client.get(f"{API}/admin/courses")).status_code == 403


# ------------------------------------------------------------------ edición desde el panel


async def create_course_via_api(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    r = await client.post(f"{API}/admin/courses", json=payload(cat.id, venue.id), headers=csrf_headers(client))
    assert r.status_code == 201, r.text
    await client.post(f"{API}/admin/courses/{r.json()['id']}/activate", headers=csrf_headers(client))
    return r.json()["id"], cat, venue


async def test_admin_can_read_everything_editable(client, session):
    cid, cat, venue = await create_course_via_api(client, session)
    d = (await client.get(f"{API}/admin/courses/{cid}")).json()
    assert d["venue_id"] == str(venue.id) and d["category"]["id"] == str(cat.id)
    assert d["translations"]["es"]["name"] == "Cerámica para principiantes"
    assert d["translations"]["en"]["name"] == "Beginner Ceramics"
    assert d["capacity"] == 5 and d["price_minor"] == 12_000_000


async def test_edit_photo_and_texts_keeps_urls_stable_and_audits_without_leaking(client, session):
    cid, *_ = await create_course_via_api(client, session)
    url = "https://example.com/foto-nueva.jpg"
    body = {
        "cover_image_url": url,
        "cover_image_alt": "Manos modelando arcilla",
        "price_minor": 9_000_000,
        "translations": {
            "es": {
                "name": "Cerámica avanzada",
                "short_description": "Nuevo resumen",
                "description": "Nuevo texto largo",
            }
        },
    }
    r = await client.patch(f"{API}/admin/courses/{cid}", json=body, headers=csrf_headers(client))
    assert r.status_code == 200, r.text
    assert r.json()["cover_image_url"] == url and r.json()["price_minor"] == 9_000_000
    # El slug NO cambia aunque cambie el nombre (las URLs de SEO son estables)
    public = (await client.get(f"{API}/courses/ceramica-para-principiantes?locale=es")).json()
    assert public["name"] == "Cerámica avanzada" and public["cover_image_alt"] == "Manos modelando arcilla"
    # La inglesa no se tocó
    assert (await client.get(f"{API}/courses/beginner-ceramics?locale=en")).json()["name"] == "Beginner Ceramics"
    # Auditoría: queda constancia de QUÉ campos cambiaron, sin copiar la URL
    audit = (await session.execute(select(AuditLog).where(AuditLog.action == "course.updated"))).scalar_one()
    assert audit.changes["cover_image_url"] == "changed" and url not in str(audit.changes)


@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(1)",
        "http://inseguro.com/a.jpg",
        "data:image/png;base64,AAAA",
        "ftp://x.com/a.jpg",
        "no es una url",
    ],
)
async def test_photo_must_be_https(client, session, bad):
    cid, *_ = await create_course_via_api(client, session)
    r = await client.patch(f"{API}/admin/courses/{cid}", json={"cover_image_url": bad}, headers=csrf_headers(client))
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_empty_photo_removes_it(client, session):
    cid, *_ = await create_course_via_api(client, session)
    await client.patch(
        f"{API}/admin/courses/{cid}",
        json={"cover_image_url": "https://example.com/a.jpg"},
        headers=csrf_headers(client),
    )
    r = await client.patch(f"{API}/admin/courses/{cid}", json={"cover_image_url": ""}, headers=csrf_headers(client))
    assert r.status_code == 200 and r.json()["cover_image_url"] is None


@pytest.mark.parametrize("field", ["capacity", "price_minor", "starts_at", "category_id", "venue_id"])
async def test_required_fields_cannot_be_nulled(client, session, field):
    cid, *_ = await create_course_via_api(client, session)
    r = await client.patch(f"{API}/admin/courses/{cid}", json={field: None}, headers=csrf_headers(client))
    assert r.status_code == 422  # antes esto habría sido un 500 por violar NOT NULL


async def test_cancelled_course_cannot_be_edited(client, session):
    cid, *_ = await create_course_via_api(client, session)
    await client.post(
        f"{API}/admin/courses/{cid}/cancel", json={"reason": "instructor enfermo"}, headers=csrf_headers(client)
    )
    r = await client.patch(f"{API}/admin/courses/{cid}", json={"price_minor": 1}, headers=csrf_headers(client))
    assert r.status_code == 409 and r.json()["error"]["code"] == "COURSE_CANCELLED"


async def test_client_cannot_read_or_edit_admin_course(client, session, new_client):
    cid, *_ = await create_course_via_api(client, session)
    other = await new_client()
    await other.post(f"{API}/auth/register", json=REGISTER)
    assert (await other.get(f"{API}/admin/courses/{cid}")).status_code == 403
    r = await other.patch(f"{API}/admin/courses/{cid}", json={"price_minor": 1}, headers=csrf_headers(other))
    assert r.status_code == 403


async def test_create_also_rejects_unsafe_photo(client, session):
    cat, venue = await base_refs(session)
    await admin_client(client, session)
    r = await client.post(
        f"{API}/admin/courses",
        json=payload(cat.id, venue.id, cover_image_url="javascript:alert(1)"),
        headers=csrf_headers(client),
    )
    assert r.status_code == 422
