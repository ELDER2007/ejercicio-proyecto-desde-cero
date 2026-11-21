import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { serverGet } from "@/lib/api";
import type { Category, CoursePage } from "@/lib/types";
import { CourseCard } from "@/components/courses/CourseCard";
import { CourseFilters } from "@/components/courses/CourseFilters";
import { Pagination } from "@/components/courses/Pagination";
import { JsonLd } from "@/components/seo/JsonLd";
import { type Loc, absoluteUrl, pageAlternates } from "@/lib/seo";

const PAGE_SIZE = 12;
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return { title: { absolute: t("coursesTitle") }, description: t("homeDesc"), alternates: pageAlternates(locale as Loc, "/courses") };
}

export default async function CoursesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("courses");
  const q = one(sp.q), category = one(sp.category), sort = one(sp.sort), available = one(sp.available);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const qs = new URLSearchParams({ locale, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  if (q) qs.set("q", q);
  if (category) qs.set("category", category);
  if (sort && ["date", "price_asc", "price_desc", "newest"].includes(sort)) qs.set("sort", sort);
  if (available === "1") qs.set("available_only", "true");

  const [data, categories] = await Promise.all([
    serverGet<CoursePage>(`/courses?${qs}`, 15),
    serverGet<Category[]>(`/categories?locale=${locale}`).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t("title"),
          itemListElement: data.items.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1 + data.offset,
            url: absoluteUrl(locale as Loc, { pathname: "/courses/[slug]", params: { slug: c.slug } }),
            name: c.name,
          })),
        }}
      />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <CourseFilters categories={categories} values={{ q, category, sort, available }} />
      <p aria-live="polite" className="text-sm text-muted">{t("count", { count: data.total })}</p>
      {data.items.length === 0 ? (
        <p className="py-10 text-center text-muted">{t("noResults")}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((c, i) => (
            <li key={c.id}><CourseCard course={c} headingLevel={2} priority={i < 3} /></li>
          ))}
        </ul>
      )}
      <Pagination total={data.total} limit={PAGE_SIZE} offset={data.offset} query={{ q, category, sort, available }} />
    </div>
  );
}
