"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { components } from "@/lib/api-types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type Card = components["schemas"]["CourseCard"];
type Turn = { role: "user" | "assistant"; content: string; courses?: Card[] };

/**
 * Asistente de Tallerya (Claude con herramientas de SOLO lectura). Solo aparece si el backend lo tiene activado.
 * Las tarjetas de curso se pintan con datos reales de la API, no con el texto que escribe el modelo.
 */
export function AssistantChat() {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api<{ enabled: boolean }>("/assistant/status")
      .then((s) => live && setEnabled(s.enabled))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // Escape cierra el panel aunque el foco no esté dentro (p. ej. justo después de enviar).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, busy]);

  if (!enabled) return null;

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns(history);
    setBusy(true);
    try {
      const r = await api<{ reply: string; courses: Card[] }>("/assistant/chat", {
        method: "POST",
        body: { locale, messages: history.slice(-11).map(({ role, content: c }) => ({ role, content: c })) },
      });
      setTurns([...history, { role: "assistant", content: r.reply, courses: r.courses }]);
    } catch (e) {
      setError(errorMessage(e, te));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
      {open ? (
        <section
          role="dialog"
          aria-label={t("title")}
          className="flex max-h-[min(36rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-line bg-brand-soft px-4 py-3">
            <h2 className="font-bold">{t("title")}</h2>
            <button type="button" onClick={close} aria-label={t("close")} className="rounded px-2 py-1 text-lg hover:bg-surface-2">
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm">{t("welcome")}</p>
            {turns.length === 0 ? (
              <ul className="flex flex-wrap gap-2">
                {(["s1", "s2", "s3"] as const).map((k) => (
                  <li key={k}>
                    <button type="button" onClick={() => void send(t(k))} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-brand-soft">
                      {t(k)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {turns.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <p
                  className={`inline-block max-w-[90%] whitespace-pre-line rounded-2xl px-3 py-2 text-left text-sm ${
                    m.role === "user" ? "bg-brand text-brand-ink" : "bg-line"
                  }`}
                >
                  {m.content}
                </p>
                {m.courses?.length ? (
                  <ul className="mt-2 space-y-2 text-left">
                    {m.courses.map((c) => (
                      <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
                        <Link href={{ pathname: "/courses/[slug]", params: { slug: c.slug } }} className="font-semibold underline" onClick={close}>
                          {c.name}
                        </Link>
                        <p className="text-muted">
                          <time dateTime={c.starts_at}>{formatDateTime(c.starts_at, locale, "America/Bogota")}</time>
                        </p>
                        <p>
                          {formatMoney(c.price_minor, c.currency, locale)} ·{" "}
                          {c.seats_available > 0 ? t("seats", { count: c.seats_available }) : t("full")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {busy ? (
              <p role="status" className="text-sm text-muted">
                {t("thinking")}
              </p>
            ) : null}
            {error ? <Alert kind="error">{error}</Alert> : null}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              {t("placeholder")}
            </label>
            <input
              id="assistant-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder={t("placeholder")}
              className="min-h-11 flex-1 rounded-lg border border-line bg-surface px-3"
            />
            <Button type="submit" busy={busy}>
              {t("send")}
            </Button>
          </form>
          <p className="px-4 pb-3 text-xs text-muted">{t("disclaimer")}</p>
        </section>
      ) : null}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-brand-ink shadow-lg hover:opacity-90"
      >
        <span aria-hidden="true">✨</span> {t("open")}
      </button>
    </div>
  );
}
