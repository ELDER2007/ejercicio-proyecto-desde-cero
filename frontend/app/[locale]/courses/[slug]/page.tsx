import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError, serverGet } from "@/lib/api";
import type { CourseDetail } from "@/lib/types";
import { formatDateTime, formatMoney, formatTimeRange } from "@/lib/format";
import { getPathname } from "@/i18n/navigation";
import { SITE } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { BookButton } from "@/components/courses/BookButton";
import { RegisterAlternates } from "@/components/layout/alternates";
import { CourseImage } from "@/components/courses/CourseImage";
import { isOptimizableImage } from "@/lib/imageHosts";
import { TrackView } from "@/components/courses/TrackView";


async function load(slug: string, locale: string): Promise<CourseDetail> {
  try {
    return await serverGet<CourseDetail>(`/courses/${encodeURIComponent(slug)}?locale=${locale}`, 15);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

function urlFor(locale: "es" | "en", slug: string): string {
  return SITE + getPathname({ locale, href: { pathname: "/courses/[slug]", params: { slug } } });
}

export async function generateMetadata({ params }: { params: Promise<{ locale: "es" | "en"; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const c = await load(slug, locale);
  const languages = Object.fromEntries(
    routing.locales.filter((l) => c.alternates[l]).map((l) => [l, urlFor(l, c.alternates[l])]),
  );
  return {
    title: c.name,
    description: c.short_description,
    alternates: { canonical: urlFor(locale, c.slug), languages: { ...languages, "x-default": urlFor("es", c.alternates.es ?? c.slug) } },
    openGraph: {
      title: c.name,
      description: c.short_description,
      url: urlFor(locale, c.slug),
      type: "website",
      images: c.cover_image_url ? [{ url: c.cover_image_url, alt: c.cover_image_alt ?? c.name }] : undefined,
    },
    robots: c.status === "CANCELLED" ? { index: false } : undefined,
  };
}

export default async function CoursePage({ params }: { params: Promise<{ locale: "es" | "en"; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const c = await load(slug, locale);
  const t = await getTranslations("course");

  const cancelled = c.status === "CANCELLED";
  const reason = cancelled ? t("cancelled") : c.is_finished ? t("finished") : c.is_full ? t("full") : !c.booking_open ? t("closed") : undefined;

  // Datos estructurados (schema.org/Event) para buscadores. Se escapa "<" para evitar inyección en el <script>.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.name,
    description: c.short_description,
    startDate: c.starts_at,
    endDate: c.ends_at,
    eventStatus: cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    inLanguage: c.language,
    image: c.cover_image_url ? [c.cover_image_url] : undefined,
    location: {
      "@type": "Place",
      name: c.venue.name,
      address: { "@type": "PostalAddress", streetAddress: c.venue.address, addressLocality: c.venue.city, addressCountry: "CO" },
    },
    offers: {
      "@type": "Offer",
      url: urlFor(locale, c.slug),
      price: (c.price_minor / 100).toFixed(2),
      priceCurrency: c.currency,
      availability: c.is_full ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
    organizer: { "@type": "Organization", name: "Tallerya" },
  };

  return (
    <article className="grid gap-8 lg:grid-cols-3">
      <RegisterAlternates alternates={c.alternates} />
      <TrackView courseId={c.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Tallerya", item: SITE + getPathname({ locale, href: "/" }) },
              { "@type": "ListItem", position: 2, name: t("breadcrumbCourses"), item: SITE + getPathname({ locale, href: "/courses" }) },
              { "@type": "ListItem", position: 3, name: c.name, item: urlFor(locale, c.slug) },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
      <div className="space-y-6 lg:col-span-2">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">{c.category.name}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{c.name}</h1>
          <p className="mt-2 text-lg text-muted">{c.short_description}</p>
        </header>
        {c.cover_image_url ? (
          <CourseImage
            src={c.cover_image_url}
            alt={c.cover_image_alt ?? ""}
            optimize={isOptimizableImage(c.cover_image_url)}
            priority
            sizes="(min-width: 1024px) 700px, 100vw"
            className="rounded-xl"
          />
        ) : null}
        <section aria-labelledby="about">
          <h2 id="about" className="text-xl font-bold">{t("description")}</h2>
          <p className="mt-2 whitespace-pre-line">{c.description}</p>
        </section>
        {c.materials ? (
          <section aria-labelledby="mat">
            <h2 id="mat" className="text-xl font-bold">{t("materials")}</h2>
            <p className="mt-2 whitespace-pre-line">{c.materials}</p>
          </section>
        ) : null}
        {c.requirements ? (
          <section aria-labelledby="req">
            <h2 id="req" className="text-xl font-bold">{t("requirements")}</h2>
            <p className="mt-2 whitespace-pre-line">{c.requirements}</p>
          </section>
        ) : null}
        {c.is_recorded ? (
          <aside className="rounded-lg border border-line bg-info-soft p-4 text-sm text-info">
            <strong>{t("recorded")}.</strong> {t("recordedNote")}
          </aside>
        ) : null}
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface-2 p-5 shadow-sm lg:sticky lg:top-6">
        <p className="text-sm text-muted">{t("price")}</p>
        <p className="text-3xl font-extrabold">{c.price_minor === 0 ? "—" : formatMoney(c.price_minor, c.currency, locale)}</p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold">{t("when")}</dt>
            <dd><time dateTime={c.starts_at}>{formatDateTime(c.starts_at, locale, c.timezone)}</time></dd>
            <dd className="text-muted">{formatTimeRange(c.starts_at, c.ends_at, locale, c.timezone)}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t("where")}</dt>
            <dd>{c.venue.name}</dd>
            <dd className="text-muted">{c.venue.address}, {c.venue.city}</dd>
            {c.venue.maps_url ? (
              <dd><a href={c.venue.maps_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">{t("openMap")}</a></dd>
            ) : null}
          </div>
          <div>
            <dt className="font-semibold">{t("language")}</dt>
            <dd>{c.language.toUpperCase()}</dd>
          </div>
        </dl>
        <p className="text-sm font-semibold" aria-live="polite">
          {c.is_full ? t("full") : t("spotsLeft", { count: c.seats_available })}
        </p>
        <BookButton courseId={c.id} slug={c.slug} disabledReason={reason} />
        {!reason ? (
          <p className="text-xs text-muted">
            {t("payWithin")} {c.requires_approval ? t("requiresApproval") : ""}
          </p>
        ) : null}
      </aside>
    </article>
  );
}
