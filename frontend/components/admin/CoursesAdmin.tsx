"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";
import type { components } from "@/lib/api-types";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClass } from "@/components/ui/Button";
import { DataTable } from "./DataTable";
import { ReasonAction } from "./ReasonAction";

type Page = components["schemas"]["AdminCoursePage"];

export function CoursesAdmin() {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const locale = useLocale();
  const { data, error, reload } = useApiData<Page>("/admin/courses?limit=100");
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(errorMessage(e, te));
    }
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <p role="status" className="text-muted">…</p>;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Link href="/admin/courses/new" className={buttonClass("primary")}>{t("newCourse")}</Link></div>
      {actionError ? <Alert kind="error">{actionError}</Alert> : null}
      <DataTable
        caption={t("courses")}
        empty="—"
        rows={data.items}
        rowKey={(c) => c.id}
        columns={[
          { header: t("course"), cell: (c) => <div><strong>{c.name}</strong><div className="text-muted">{c.category.name}</div></div> },
          { header: t("date"), cell: (c) => formatDateTime(c.starts_at, locale, c.timezone) },
          { header: t("occupancy"), cell: (c) => `${c.seats_taken}/${c.capacity}` },
          { header: t("amount"), cell: (c) => formatMoney(c.price_minor, c.currency, locale) },
          { header: t("status"), cell: (c) => <StatusLabel status={c.status} /> },
          {
            header: t("actions"),
            cell: (c) => (
              <div className="flex flex-col gap-2">
                {c.status !== "CANCELLED" ? (
                  <Link href={{ pathname: "/admin/courses/[id]", params: { id: c.id } }} className={buttonClass("secondary", "min-h-9 px-3 py-1")}>
                    {t("edit")}
                  </Link>
                ) : null}
                {c.status !== "ACTIVE" && c.status !== "CANCELLED" ? <Button className="min-h-9 px-3 py-1" onClick={() => run(() => api(`/admin/courses/${c.id}/activate`, { method: "POST" }))}>{t("activate")}</Button> : null}
                {c.status === "ACTIVE" ? <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => run(() => api(`/admin/courses/${c.id}/deactivate`, { method: "POST" }))}>{t("deactivate")}</Button> : null}
                {c.status !== "CANCELLED" ? <ReasonAction variant="danger" label={t("cancelCourse")} onConfirm={(reason) => run(() => api(`/admin/courses/${c.id}/cancel`, { method: "POST", body: { reason } }))} /> : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function StatusLabel({ status }: { status: string }) {
  const tone: Record<string, string> = { ACTIVE: "bg-ok-soft text-ok", DRAFT: "bg-line text-muted", INACTIVE: "bg-warn-soft text-warn", CANCELLED: "bg-bad-soft text-bad" };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[status] ?? ""}`}>{status}</span>;
}

