import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CourseImage } from "@/components/courses/CourseImage";
import { isOptimizableImage } from "@/lib/imageHosts";
import type { CourseSummary } from "@/lib/types";
import { formatDateShort, formatMoney, formatTimeRange } from "@/lib/format";

export async function CourseCard({
  course,
  headingLevel = 3,
  priority = false,
}: {
  course: CourseSummary;
  /** Nivel del título (2 en el catálogo, que ya tiene h1; 3 dentro de secciones con h2). */
  headingLevel?: 2 | 3;
  /** Imagen visible al cargar (arriba del todo): se carga ya y con prioridad alta en vez de en diferido. */
  priority?: boolean;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const t = await getTranslations("course");
  const locale = await getLocale();
  const spots = course.is_full ? (
    <span className="rounded-full bg-bad-soft px-3 py-1 text-xs font-semibold text-bad">✖ {t("full")}</span>
  ) : (
    <span className="rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">
      ✔ {t("spotsLeft", { count: course.seats_available })}
    </span>
  );

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-2 shadow-sm transition hover:shadow-md">
      {course.cover_image_url ? (
        <CourseImage
          src={course.cover_image_url}
          alt={course.cover_image_alt ?? ""}
          optimize={isOptimizableImage(course.cover_image_url)}
          priority={priority}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 100vw"
        />
      ) : (
        <div aria-hidden="true" className="flex aspect-video items-center justify-center bg-brand-soft text-5xl">🎨</div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{course.category.name}</p>
        <Heading className="text-lg font-bold leading-snug">
          <Link
            href={{ pathname: "/courses/[slug]", params: { slug: course.slug } }}
            className="after:absolute after:inset-0 hover:underline"
          >
            {course.name}
          </Link>
        </Heading>
        <p className="text-sm text-muted">{course.short_description}</p>
        <p className="mt-auto pt-2 text-sm">
          <time dateTime={course.starts_at}>{formatDateShort(course.starts_at, locale, course.timezone)}</time>
          {" · "}
          {formatTimeRange(course.starts_at, course.ends_at, locale, course.timezone)}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <strong className="text-lg">{course.price_minor === 0 ? "—" : formatMoney(course.price_minor, course.currency, locale)}</strong>
          {spots}
        </div>
      </div>
    </article>
  );
}
