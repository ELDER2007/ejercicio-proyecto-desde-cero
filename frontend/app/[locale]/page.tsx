import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { serverGet } from "@/lib/api";
import type { Category, CoursePage } from "@/lib/types";
import { CourseCard } from "@/components/courses/CourseCard";
import { buttonClass } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { type Loc, organizationLd, pageAlternates } from "@/lib/seo";

// Dinámica: si se generara en el build (la API aún no existe) quedaría congelada sin cursos. Los datos se cachean 30 s en el fetch.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return {
    title: { absolute: t("homeTitle") },
    description: t("homeDesc"),
    alternates: pageAlternates(locale as Loc, "/"),
    openGraph: { title: t("homeTitle"), description: t("homeDesc"), url: pageAlternates(locale as Loc, "/").canonical as string },
  };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const seo = await getTranslations("seo");
  const [courses, categories] = await Promise.all([
    serverGet<CoursePage>(`/courses?locale=${locale}&limit=6`).catch(() => null),
    serverGet<Category[]>(`/categories?locale=${locale}`).catch(() => []),
  ]);

  return (
    <div className="space-y-16">
      <JsonLd data={organizationLd(locale as Loc, seo("homeDesc"))} />
      <section className="rounded-2xl bg-brand-soft px-6 py-14 text-center sm:px-12">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">{t("subtitle")}</p>
        <Link href="/courses" className={buttonClass("primary", "mt-8 px-6 py-3 text-base")}>{t("cta")}</Link>
      </section>

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="text-2xl font-bold">{t("upcoming")}</h2>
        {courses && courses.items.length > 0 ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.items.map((c, i) => (
              <li key={c.id}><CourseCard course={c} priority={i < 3} /></li>
            ))}
          </ul>
        ) : courses === null ? (
          <p role="status" className="mt-4 text-muted">{t("unavailable")}</p>
        ) : (
          <p className="mt-4 text-muted">{t("empty")}</p>
        )}
      </section>

      {categories.length > 0 ? (
        <section aria-labelledby="cats">
          <h2 id="cats" className="text-2xl font-bold">{t("categories")}</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={{ pathname: "/courses", query: { category: c.slug } }} className="inline-block rounded-full border border-line bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-brand-soft">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold">{t("howTitle")}</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(["1", "2", "3", "4"] as const).map((n) => (
            <li key={n} className="rounded-xl border border-line bg-surface-2 p-5">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink" aria-hidden="true">{n}</span>
              <h3 className="mt-3 font-bold">{t(`step${n}`)}</h3>
              <p className="mt-1 text-sm text-muted">{t(`step${n}d`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
