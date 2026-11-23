"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { describeChanges, type ChangeCtx } from "@/lib/audit";
import { formatMoney } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";
import type { components } from "@/lib/api-types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { DataTable } from "./DataTable";
import { ReasonAction } from "./ReasonAction";

type S = components["schemas"];
const dt = (iso: string, locale: string) => new Date(iso).toLocaleString(locale === "es" ? "es-CO" : "en-US", { timeZone: "America/Bogota" });

/** Traduce un valor técnico (p. ej. un estado) con el grupo de textos indicado; si no existe, deja el original. */
function useLabel() {
  const t = useTranslations("admin");
  return (group: string, key: string) => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
}

function Loading({ error }: { error: string | null }) {
  return error ? <Alert kind="error">{error}</Alert> : <p role="status" className="text-muted">…</p>;
}

export function PaymentsAdmin() {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const locale = useLocale();
  const label = useLabel();
  const { data, error, reload } = useApiData<S["AdminPaymentPage"]>("/admin/payments?limit=100");
  const [actionError, setActionError] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="space-y-4">
      {actionError ? <Alert kind="error">{actionError}</Alert> : null}
      <DataTable
        caption={t("payments")} empty="—" rows={data.items} rowKey={(p) => p.id}
        columns={[
          { header: t("date"), cell: (p) => dt(p.created_at, locale) },
          { header: t("amount"), cell: (p) => formatMoney(p.amount_minor, p.currency, locale) },
          { header: t("status"), cell: (p) => label("paymentStatus", p.status) },
          { header: t("provider"), cell: (p) => p.provider },
          {
            header: t("actions"),
            cell: (p) =>
              p.status === "PAID" ? (
                <ReasonAction label={t("refund")} onConfirm={async (reason) => {
                  try { await api(`/admin/payments/${p.id}/refund`, { method: "POST", body: { reason } }); setActionError(null); reload(); }
                  catch (e) { setActionError(errorMessage(e, te)); }
                }} />
              ) : null,
          },
        ]}
      />
    </div>
  );
}

export function UsersAdmin() {
  const t = useTranslations("admin");
  const ta = useTranslations("auth");
  const label = useLabel();
  const [q, setQ] = useState("");
  const { data, error } = useApiData<S["Page"]>(`/admin/users?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (
    <div className="space-y-4">
      <div className="max-w-sm"><TextField label={ta("email")} type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!data ? <Loading error={error} /> : (
        <DataTable
          caption={t("users")} empty="—" rows={data.items} rowKey={(u) => u.id}
          columns={[
            { header: ta("fullName"), cell: (u) => u.full_name },
            { header: ta("email"), cell: (u) => u.email },
            { header: ta("phone"), cell: (u) => u.phone ?? "—" },
            { header: t("roles"), cell: (u) => u.roles.map((r) => label("roleNames", r)).join(", ") },
          ]}
        />
      )}
    </div>
  );
}

export function CommissionsAdmin() {
  const t = useTranslations("admin");
  const te = useTranslations("errors");
  const locale = useLocale();
  const label = useLabel();
  const { data, error, reload } = useApiData<S["CommissionSummary"]>("/admin/commissions?limit=100");
  const rate = useApiData<S["CommissionSettings"]>("/admin/settings/commission");
  const [bps, setBps] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface-2 p-4">
        <h2 className="font-bold">{t("commissionRate")}: {rate.data ? `${(rate.data.commission_bps / 100).toFixed(2)} %` : "…"}</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault(); setErr(null); setMsg(null);
            try {
              await api("/admin/settings/commission", { method: "PUT", body: { commission_bps: Math.round(Number(bps) * 100) } });
              setMsg("OK"); rate.reload(); reload();
            } catch (x) { setErr(errorMessage(x, te)); }
          }}
        >
          <TextField label="%" type="number" min={0} max={100} step={0.01} value={bps} onChange={(e) => setBps(e.target.value)} required />
          <Button type="submit">OK</Button>
        </form>
        {msg ? <Alert kind="success">{msg}</Alert> : null}
        {err ? <Alert kind="error">{err}</Alert> : null}
      </section>
      {Object.entries(data.totals_by_currency).map(([cur, v]) => (
        <dl key={cur} className="grid gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted">{t("gross")}</dt><dd className="text-xl font-bold">{formatMoney(v.gross_minor, cur, locale)}</dd></div>
          <div><dt className="text-sm text-muted">{t("commission")}</dt><dd className="text-xl font-bold">{formatMoney(v.commission_minor, cur, locale)}</dd></div>
          <div><dt className="text-sm text-muted">{t("net")}</dt><dd className="text-xl font-bold">{formatMoney(v.net_minor, cur, locale)}</dd></div>
        </dl>
      ))}
      <DataTable
        caption={t("commissions")} empty="—" rows={data.items} rowKey={(c) => c.id}
        columns={[
          { header: t("date"), cell: (c) => dt(c.created_at, locale) },
          { header: t("gross"), cell: (c) => formatMoney(c.gross_minor, c.currency, locale) },
          { header: "%", cell: (c) => `${(c.commission_bps / 100).toFixed(2)}` },
          { header: t("commission"), cell: (c) => formatMoney(c.commission_minor, c.currency, locale) },
          { header: t("net"), cell: (c) => formatMoney(c.net_minor, c.currency, locale) },
          { header: t("status"), cell: (c) => label("commissionStatus", c.status) },
        ]}
      />
    </div>
  );
}

export function AuditAdmin() {
  const t = useTranslations("admin");
  const tbs = useTranslations("booking.status");
  const label = useLabel();
  const locale = useLocale();
  const { data, error } = useApiData<S["AuditPage"]>("/admin/audit-logs?limit=100");
  if (!data) return <Loading error={error} />;
  const ctx: ChangeCtx = {
    field: (k) => label("auditFields", k),
    yes: t("yes"),
    no: t("no"),
    changed: t("changedValue"),
    money: (minor) => formatMoney(minor, "COP", locale),
    date: (iso) => dt(iso, locale),
  };
  const detail = (a: S["AuditPage"]["items"][number]) => {
    const ch = a.changes as Record<string, unknown> | null;
    if (a.action === "payment.status_changed" && ch) {
      return `${label("paymentStatus", String(ch.from))} → ${label("paymentStatus", String(ch.to))}${ch.provider ? ` · ${String(ch.provider)}` : ""}`;
    }
    if (a.action === "settings.commission_changed" && ch) {
      return `${(Number(ch.from) / 100).toFixed(2)} % → ${(Number(ch.to) / 100).toFixed(2)} %`;
    }
    // En las decisiones sobre reservas, "to" es el estado resultante: se muestra traducido
    const shown = a.action.startsWith("booking.") && ch && typeof ch.to === "string" ? { ...ch, to: tbs.has(ch.to) ? tbs(ch.to) : ch.to } : ch;
    const lines = describeChanges(shown, ctx);
    return lines.length ? <ul className="space-y-0.5">{lines.map((l) => <li key={l}>{l}</li>)}</ul> : "—";
  };
  return (
    <DataTable
      caption={t("audit")} empty="—" rows={data.items} rowKey={(a) => String(a.id)}
      columns={[
        { header: t("date"), cell: (a) => dt(a.created_at, locale) },
        { header: t("auditCols.action"), cell: (a) => <span title={a.action}>{label("auditActions", a.action.replace(/\./g, "_"))}</span> },
        { header: t("auditCols.resource"), cell: (a) => `${label("auditResources", a.resource_type)}${a.resource_id ? ` · ${a.resource_id.slice(0, 8)}` : ""}` },
        { header: t("auditCols.actor"), cell: (a) => a.actor_user_id?.slice(0, 8) ?? t("system") },
        { header: t("auditCols.changes"), cell: detail },
      ]}
    />
  );
}
