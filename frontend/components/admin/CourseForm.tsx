"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { bogotaInputToIso, toBogotaLocalInput } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";
import type { components } from "@/lib/api-types";
import type { Category } from "@/lib/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/Field";

type Venue = { id: string; name: string; address: string };
type Detail = components["schemas"]["AdminCourseDetail"];
type Tr = { name: string; short_description: string; description: string; materials?: string | null; requirements?: string | null };

/** Crear (sin courseId) o EDITAR (con courseId) un curso. */
export function CourseForm({ courseId }: { courseId?: string }) {
  const t = useTranslations("admin");
  const detail = useApiData<Detail>(courseId ? `/admin/courses/${courseId}` : null);
  if (courseId && detail.error) return <Alert kind="error">{detail.error}</Alert>;
  if (courseId && !detail.data) return <p role="status" className="text-muted">{t("loadingCourse")}</p>;
  return <FormBody key={detail.data?.id ?? "new"} initial={detail.data ?? undefined} />;
}

function FormBody({ initial }: { initial?: Detail }) {
  const t = useTranslations("admin");
  const ta = useTranslations("auth");
  const te = useTranslations("errors");
  const router = useRouter();
  const categories = useApiData<Category[]>("/categories?locale=es");
  const venues = useApiData<Venue[]>("/admin/venues");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState(initial?.cover_image_url ?? "");
  const editing = !!initial;
  const es = initial?.translations?.es as Tr | undefined;
  const en = initial?.translations?.en as Tr | undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSaved(false);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const opt = (k: string) => get(k) || null;

    if (get("cover_url") && !get("cover_alt")) {
      setFields({ cover_image_alt: t("f.coverAltRequired") });
      setBusy(false);
      return;
    }
    const translations: Record<string, Tr> = {
      es: { name: get("name_es"), short_description: get("short_es"), description: get("desc_es"), materials: opt("mat_es"), requirements: opt("req_es") },
    };
    if (get("name_en")) {
      translations.en = {
        name: get("name_en"),
        short_description: get("short_en") || get("name_en"),
        description: get("desc_en") || get("short_en") || get("name_en"),
        materials: opt("mat_en"),
        requirements: opt("req_en"),
      };
    }
    const body = {
      category_id: get("category_id"),
      venue_id: get("venue_id"),
      starts_at: bogotaInputToIso(get("starts_at")),
      ends_at: bogotaInputToIso(get("ends_at")),
      capacity: Number(get("capacity")),
      price_minor: Math.round(Number(get("price")) * 100), // pesos -> centavos (entero)
      requires_approval: f.get("requires_approval") === "on",
      is_recorded: f.get("is_recorded") === "on",
      cover_image_url: opt("cover_url"), // vacío = quitar la foto
      cover_image_alt: opt("cover_alt"),
      translations,
    };
    try {
      if (editing) {
        await api(`/admin/courses/${initial.id}`, { method: "PATCH", body });
        setSaved(true);
        setBusy(false);
      } else {
        await api("/admin/courses", { method: "POST", body });
        router.push("/admin/courses");
      }
    } catch (err) {
      const fe = fieldErrors(err);
      setFields(fe);
      setError(Object.keys(fe).length ? ta("fixErrors") : errorMessage(err, te));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4" noValidate>
      <h2 className="text-2xl font-bold">{editing ? t("editCourse") : t("newCourse")}</h2>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {saved ? <Alert kind="success">{t("saved")}</Alert> : null}

      <TextField label={t("f.nameEs")} name="name_es" defaultValue={es?.name} required error={fields["translations.es.name"]} />
      <TextField label={t("f.shortEs")} name="short_es" defaultValue={es?.short_description} required error={fields["translations.es.short_description"]} />
      <TextAreaField label={t("f.descEs")} name="desc_es" defaultValue={es?.description} required error={fields["translations.es.description"]} />
      <TextAreaField label={t("f.materialsEs")} name="mat_es" defaultValue={es?.materials ?? ""} optionalLabel="opt." />
      <TextAreaField label={t("f.requirementsEs")} name="req_es" defaultValue={es?.requirements ?? ""} optionalLabel="opt." />

      <TextField label={t("f.nameEn")} name="name_en" defaultValue={en?.name} optionalLabel="opt." />
      <TextField label={t("f.shortEn")} name="short_en" defaultValue={en?.short_description} />
      <TextAreaField label={t("f.descEn")} name="desc_en" defaultValue={en?.description} />
      <TextAreaField label={t("f.materialsEn")} name="mat_en" defaultValue={en?.materials ?? ""} optionalLabel="opt." />
      <TextAreaField label={t("f.requirementsEn")} name="req_en" defaultValue={en?.requirements ?? ""} optionalLabel="opt." />

      <SelectField key={categories.data ? "cat-ready" : "cat-loading"} label={t("f.category")} name="category_id" defaultValue={initial?.category.id} required error={fields.category_id}>
        {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <SelectField key={venues.data ? "venue-ready" : "venue-loading"} label={t("f.venue")} name="venue_id" defaultValue={initial?.venue_id} required error={fields.venue_id}>
        {(venues.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name} — {v.address}</option>)}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("f.start")} name="starts_at" type="datetime-local" defaultValue={initial ? toBogotaLocalInput(initial.starts_at) : undefined} required error={fields.starts_at} />
        <TextField label={t("f.end")} name="ends_at" type="datetime-local" defaultValue={initial ? toBogotaLocalInput(initial.ends_at) : undefined} required error={fields.ends_at} />
        <TextField label={t("f.capacity")} name="capacity" type="number" min={1} max={500} defaultValue={initial?.capacity} required error={fields.capacity} />
        <TextField label={t("f.price")} name="price" type="number" min={0} step={1} defaultValue={initial ? initial.price_minor / 100 : undefined} required error={fields.price_minor} />
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-2 font-semibold">{t("f.photo")}</legend>
        <TextField
          label={t("f.coverUrl")}
          name="cover_url"
          type="url"
          value={photo}
          onChange={(e) => setPhoto(e.target.value)}
          hint={t("f.coverHint")}
          placeholder="https://…"
          error={fields.cover_image_url}
        />
        <TextField label={t("f.coverAlt")} name="cover_alt" defaultValue={initial?.cover_image_alt ?? ""} hint={t("f.coverAltHint")} error={fields.cover_image_alt} />
        {photo.startsWith("https://") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="aspect-video w-full max-w-sm rounded-lg border border-line object-cover" />
        ) : null}
      </fieldset>

      <CheckboxField label={t("f.approval")} name="requires_approval" defaultChecked={initial ? initial.requires_approval : true} />
      <CheckboxField label={t("f.recorded")} name="is_recorded" defaultChecked={initial?.is_recorded ?? false} />

      <div className="flex gap-3">
        <Button type="submit" busy={busy}>{editing ? t("saveChanges") : t("newCourse")}</Button>
        <Link href="/admin/courses" className="inline-flex min-h-11 items-center px-4 font-semibold underline">← {t("courses")}</Link>
      </div>
    </form>
  );
}
